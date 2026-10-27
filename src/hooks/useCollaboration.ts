import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Collaborator, Project, ProjectRole, ReviewComment, TrackedChange, UserProfile, ProjectFile } from '../types/latex';
import { verifyShareKey, verifyShareKeyWithServer } from '../services/shareSecurityService';
import { SupabaseYjsProvider } from '../services/yjsProvider';
import { isSupabaseConnected } from '../services/supabaseClient';
import { updateProject } from '../services/projectsService';
import { setFiles, projectStore } from '../stores/projectStore';
import { logAuditAction } from '../services/auditService';

interface UseCollaborationOptions {
  activeProjectId: string;
  activeProject?: Project;
  currentUser: UserProfile | null;
  activeFileId?: string;
  onToast?: (message: string) => void;
}

export function useCollaboration({
  activeProjectId,
  activeProject,
  currentUser,
  activeFileId = 'main.tex',
  onToast,
}: UseCollaborationOptions) {
  const activeFileIdRef = useRef(activeFileId);
  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  // Scoped room ID: If URL has ?room=, use it. Otherwise namespace to the active project (Finding 8)
  const [roomId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'proj_default';
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || `proj_${activeProjectId || 'default'}`;
  });

  // Base synchronous role calculation
  const initialRole = useMemo<ProjectRole>(() => {
    if (typeof window === 'undefined') return 'owner';
    const params = new URLSearchParams(window.location.search);
    const isSharedRoom = Boolean(params.get('room'));
    const key = params.get('key');

    if (isSharedRoom) {
      if (key) {
        const verified = verifyShareKey(roomId, key);
        if (verified) return verified;
      }
      if (currentUser && activeProject?.ownerEmail === currentUser.email) {
        return 'owner';
      }
      return 'viewer';
    }

    if (currentUser && activeProject) {
      if (activeProject.ownerEmail === currentUser.email || activeProject.ownerId === currentUser.id) {
        return 'owner';
      }
      const member = activeProject.members?.find(
        m => m.email?.toLowerCase() === currentUser.email?.toLowerCase() || m.id === currentUser.id
      );
      if (member) return member.role;
    }

    return activeProject?.role || 'owner';
  }, [activeProject, currentUser, roomId]);

  const [currentRole, setCurrentRole] = useState<ProjectRole>(initialRole);

  // Sync role with base calculation
  useEffect(() => {
    setCurrentRole(initialRole);
  }, [initialRole]);

  // Asynchronous server verification for unknown edit capability keys (Finding 2)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (key && key.startsWith('ed_') && currentRole === 'viewer') {
      verifyShareKeyWithServer(roomId, key)
        .then(verified => {
          if (verified === 'editor') {
            setCurrentRole('editor');
          }
        })
        .catch(() => {});
    }
  }, [roomId, currentRole]);

  // Initial selfUser collaborator state
  const [selfUser, setSelfUser] = useState<Collaborator>(() => {
    const savedName = typeof localStorage !== 'undefined' ? localStorage.getItem('teeex_user_name') || 'Guest Author' : 'Guest Author';
    const userId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `usr_${crypto.randomUUID()}`
        : `usr_${Date.now().toString(36)}`;
    const color = '#38bdf8';
    if (currentUser) {
      return {
        id: currentUser.id || userId,
        name: currentUser.fullName,
        avatar: currentUser.fullName.substring(0, 2).toUpperCase(),
        color: currentUser.avatarColor || color,
        role: initialRole,
        cursorLine: 1,
        cursorCol: 1,
        activeFile: 'main.tex',
        status: 'active',
        isSelf: true,
      };
    }
    return {
      id: userId,
      name: savedName,
      avatar: savedName.substring(0, 2).toUpperCase(),
      color,
      role: initialRole || 'owner',
      cursorLine: 1,
      cursorCol: 1,
      activeFile: 'main.tex',
      status: 'active',
      isSelf: true,
    };
  });

  // Keep selfUser updated reactively when currentRole or currentUser changes (Finding 7)
  useEffect(() => {
    setSelfUser(prev => {
      const nextRole = currentRole || 'owner';
      const nextName = currentUser?.fullName || prev.name;
      const nextAvatar = nextName.substring(0, 2).toUpperCase();
      const nextColor = currentUser?.avatarColor || prev.color;
      if (prev.role === nextRole && prev.name === nextName && prev.color === nextColor) {
        return prev;
      }
      return {
        ...prev,
        role: nextRole,
        name: nextName,
        avatar: nextAvatar,
        color: nextColor,
      };
    });
  }, [currentRole, currentUser]);

  // Yjs CRDT Collaboration Provider
  const [provider, setProvider] = useState<SupabaseYjsProvider | null>(null);
  const providerRef = useRef<SupabaseYjsProvider | null>(null);

  const [activeCursorLine, setActiveCursorLine] = useState<number>(1);
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [peers, setPeers] = useState<Collaborator[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [trackedChanges, setTrackedChanges] = useState<TrackedChange[]>([]);

  // Initialize and observe Yjs provider
  useEffect(() => {
    let p = providerRef.current;
    if (!p || p.projectId !== activeProjectId || p.isDestroyed) {
      if (p && !p.isDestroyed) p.destroy();
      const currentFiles = projectStore.getState().files;
      p = new SupabaseYjsProvider(
        activeProjectId,
        selfUser,
        currentFiles,
        (updatedFiles: ProjectFile[]) => {
          setFiles(prev => {
            const map = new Map(updatedFiles.map(f => [f.id, f.content]));
            return prev.map(f => (map.has(f.id) ? { ...f, content: map.get(f.id)! } : f));
          });
          updateProject(activeProjectId, { files: projectStore.getState().files });
        }
      );
      providerRef.current = p;
      setProvider(p);
    }

    p.loadSnapshotFromCloud().catch(() => {});

    const unsubPeers = p.onPeersChange(livePeers => {
      setPeers(livePeers);
    });

    const yComments = p.getCommentsArray();
    const updateComments = () => {
      const arr = yComments.toArray();
      if (arr.length > 0) setComments(arr);
    };
    yComments.observe(updateComments);

    const yTracked = p.getTrackedChangesArray();
    const updateTracked = () => {
      const arr = yTracked.toArray();
      if (arr.length > 0) setTrackedChanges(arr);
    };
    yTracked.observe(updateTracked);

    return () => {
      unsubPeers();
      yComments.unobserve(updateComments);
      yTracked.unobserve(updateTracked);
    };
  }, [activeProjectId, selfUser]);

  // Clean up provider on unmount
  useEffect(() => {
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
    };
  }, []);

  // Update peer awareness with new cursor position (throttling UI outline to 200ms)
  const handleCursorChange = useCallback((line: number, col: number) => {
    providerRef.current?.setLocalCursor(activeFileIdRef.current, line, col);
    if (cursorThrottleRef.current) clearTimeout(cursorThrottleRef.current);
    cursorThrottleRef.current = setTimeout(() => {
      setActiveCursorLine(prev => (prev !== line ? line : prev));
    }, 200);
  }, []);

  // Comments
  const handleAddComment = useCallback((line: number, text: string) => {
    const newComment: ReviewComment = {
      id: 'comment-' + Date.now(),
      fileId: activeFileIdRef.current,
      line,
      authorName: selfUser.name,
      authorAvatar: selfUser.avatar,
      authorColor: selfUser.color,
      text,
      createdAt: 'Just now',
      resolved: false,
    };
    setComments(prev => [...prev, newComment]);
    provider?.getCommentsArray().push([newComment]);
  }, [selfUser, provider]);

  const handleResolveComment = useCallback((commentId: string) => {
    setComments(prev => prev.map(c => (c.id === commentId ? { ...c, resolved: true } : c)));
    if (provider) {
      const yArr = provider.getCommentsArray();
      const idx = yArr.toArray().findIndex(c => c.id === commentId);
      if (idx >= 0) {
        const item = yArr.get(idx);
        yArr.delete(idx, 1);
        yArr.insert(idx, [{ ...item, resolved: true }]);
      }
    }
  }, [provider]);

  // Follow peer in editor
  const handleFollowPeer = useCallback((peer: Collaborator, onSelectFile: (fileId: string) => void, onJumpToLine: (line: number) => void) => {
    if (peer.activeFile && peer.activeFile !== activeFileIdRef.current) {
      onSelectFile(peer.activeFile);
    }
    if (peer.cursorLine) {
      onJumpToLine(peer.cursorLine);
    }
    if (onToast) onToast(`Following ${peer.name}`);
  }, [onToast]);

  // Tracked changes
  const handleAddTrackedChange = useCallback((change: Omit<TrackedChange, 'id' | 'status' | 'timestamp'>) => {
    const newChange: TrackedChange = {
      ...change,
      id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `change-${crypto.randomUUID()}`
          : `change-${Date.now()}`,
      timestamp: 'Just now',
      status: 'pending',
    };
    setTrackedChanges(prev => [newChange, ...prev]);
  }, []);

  const handleAcceptTrackedChange = useCallback((changeId: string) => {
    setTrackedChanges(prev => {
      const c = prev.find(t => t.id === changeId);
      if (c) {
        logAuditAction(
          activeProjectId,
          'CHANGE_ACCEPTED',
          `Accepted review suggestion: "${c.text.slice(0, 35)}..."`,
          currentUser?.fullName || 'Current User',
          currentRole,
          'collaboration'
        );
      }
      return prev.filter(t => t.id !== changeId);
    });
  }, [activeProjectId, currentUser, currentRole]);

  const handleRejectTrackedChange = useCallback((changeId: string) => {
    setTrackedChanges(prev => {
      const c = prev.find(t => t.id === changeId);
      if (c) {
        logAuditAction(
          activeProjectId,
          'CHANGE_REJECTED',
          `Rejected review suggestion: "${c.text.slice(0, 35)}..."`,
          currentUser?.fullName || 'Current User',
          currentRole,
          'collaboration'
        );
      }
      return prev.filter(t => t.id !== changeId);
    });
  }, [activeProjectId, currentUser, currentRole]);

  return {
    roomId,
    currentRole,
    selfUser,
    setSelfUser,
    peers,
    setPeers,
    provider,
    providerRef,
    comments,
    setComments,
    trackedChanges,
    setTrackedChanges,
    activeCursorLine,
    setActiveCursorLine,
    handleCursorChange,
    handleAddComment,
    handleResolveComment,
    handleFollowPeer,
    handleAddTrackedChange,
    handleAcceptTrackedChange,
    handleRejectTrackedChange,
    isCloudConnected: isSupabaseConnected(),
  };
}
