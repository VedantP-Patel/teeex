import { useState, useEffect, useMemo, useCallback, lazy, Suspense, useRef } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { AuthPortal } from './components/AuthPortal';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Editor } from './components/Editor';
import { PreviewPane } from './components/PreviewPane';
import { DiagnosticsDock } from './components/DiagnosticsDock';
import type { Checkpoint } from './components/modals/VersionHistoryModal';

// Performance: Lazy-loaded modal dialogs for zero initial bundle overhead
const SymbolPaletteModal = lazy(() => import('./components/modals/SymbolPaletteModal').then(m => ({ default: m.SymbolPaletteModal })));
const TableBuilderModal = lazy(() => import('./components/modals/TableBuilderModal').then(m => ({ default: m.TableBuilderModal })));
const ShareModal = lazy(() => import('./components/modals/ShareModal').then(m => ({ default: m.ShareModal })));
const TemplateModal = lazy(() => import('./components/modals/TemplateModal').then(m => ({ default: m.TemplateModal })));
const ImageUploadModal = lazy(() => import('./components/modals/ImageUploadModal').then(m => ({ default: m.ImageUploadModal })));
const SupabaseModal = lazy(() => import('./components/modals/SupabaseModal').then(m => ({ default: m.SupabaseModal })));
const VersionHistoryModal = lazy(() => import('./components/modals/VersionHistoryModal').then(m => ({ default: m.VersionHistoryModal })));
const WordCountModal = lazy(() => import('./components/modals/WordCountModal').then(m => ({ default: m.WordCountModal })));
const AuthModal = lazy(() => import('./components/modals/AuthModal').then(m => ({ default: m.AuthModal })));
const ProjectsDashboardModal = lazy(() => import('./components/modals/ProjectsDashboardModal').then(m => ({ default: m.ProjectsDashboardModal })));
const DeveloperUnlockModal = lazy(() => import('./components/modals/DeveloperUnlockModal').then(m => ({ default: m.DeveloperUnlockModal })));
const CommandPaletteModal = lazy(() => import('./components/modals/CommandPaletteModal').then(m => ({ default: m.CommandPaletteModal })));
const AuditLogModal = lazy(() => import('./components/modals/AuditLogModal').then(m => ({ default: m.AuditLogModal })));
const EncryptionModal = lazy(() => import('./components/modals/EncryptionModal').then(m => ({ default: m.EncryptionModal })));
const AdminUsersModal = lazy(() => import('./components/modals/AdminUsersModal').then(m => ({ default: m.AdminUsersModal })));

import { formatLatexCode } from './services/latexFormatter';
import {
  isPlatformDeveloper,
  lockPlatformDeveloper,
  isDemoModeEnabled,
  setDemoModeEnabled,
  areSimulatedPeersEnabled,
} from './services/developerService';
import { logAuditAction } from './services/auditService';
import { saveProjectOffline } from './services/offlineStorageService';
import { encryptText, decryptText } from './services/encryptionService';
import { downloadPdf } from './services/pdfExporter';
import { applyDocumentClass, formatResolutionNotice, setTwoColumn, type PaperFormatId } from './services/paperFormats';
import { verifyShareKey } from './services/shareSecurityService';
import { useTexEngine } from './hooks/useTexEngine';
import { parseSyncTex, forwardSync, type SyncTexIndex, type ForwardMatch } from './services/synctex';

import type {
  ProjectFile,
  CompileState,
  Collaborator,
  SuggestedFix,
  Template,
  ReviewComment,
  Diagnostic,
  Project,
  ProjectRole,
  UserProfile,
  ProjectMember,
  TrackedChange
} from './types/latex';
import { useLatexParser } from './hooks/useLatexParser';
import { parseBibtex } from './services/bibtexParser';
import { STARTER_TEMPLATES } from './services/templates';
import { exportProjectAsZip } from './services/zipExporter';
import {
  CollaborationHub,
  DEFAULT_PEERS
} from './services/collaboration';
import { isSupabaseConnected } from './services/supabaseClient';
import { getStoredSession, signOutUser, verifyActiveSupabaseSession } from './services/authService';
import {
  loadProjects,
  getActiveProjectId,
  setActiveProjectId,
  createProject,
  duplicateProject,
  toggleArchiveProject,
  deleteProject,
  updateProject
} from './services/projectsService';

export function App() {
  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('teeex_theme') as 'dark' | 'light') || 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('teeex_theme', theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('teeex_theme', next);
      return next;
    });
  }, []);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    return getStoredSession().user;
  });
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(() => {
    return isSupabaseConnected() && getStoredSession().user !== null;
  });
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  // Active Cloud / Supabase session verification on startup
  useEffect(() => {
    let isMounted = true;
    if (isSupabaseConnected() && getStoredSession().user !== null) {
      verifyActiveSupabaseSession().then(verifiedUser => {
        if (!isMounted) return;
        setCurrentUser(verifiedUser || null);
        setIsAuthChecking(false);
      }).catch(() => {
        if (!isMounted) return;
        setIsAuthChecking(false);
      });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  // Multi-Project State
  const [projects, setProjects] = useState<Project[]>(() => {
    const sessionUser = getStoredSession().user;
    return loadProjects(sessionUser?.email, sessionUser?.fullName);
  });
  const [activeProjectId, setActiveProjectIdState] = useState<string>(() => {
    const sessionUser = getStoredSession().user;
    return getActiveProjectId(loadProjects(sessionUser?.email, sessionUser?.fullName));
  });
  const [isProjectsHubOpen, setIsProjectsHubOpen] = useState(false);
  const [isAdminUsersOpen, setIsAdminUsersOpen] = useState(false);

  const activeProject = useMemo(() => {
    return projects.find(p => p.id === activeProjectId) || projects[0];
  }, [projects, activeProjectId]);

  // Project & Files State
  const [files, setFiles] = useState<ProjectFile[]>(() => activeProject?.files || STARTER_TEMPLATES[0].files);
  const [folders, setFolders] = useState<string[]>(() => activeProject?.folders || ['sections', 'figures']);
  const [activeFileId, setActiveFileId] = useState<string>(() => activeProject?.files?.[0]?.id || 'main.tex');
  const [openFileIds, setOpenFileIds] = useState<string[]>(() => [activeProject?.files?.[0]?.id || 'main.tex']);
  const [projectTitle, setProjectTitle] = useState<string>(() => activeProject?.title || 'Untitled Project');
  const [paperFormat, setPaperFormat] = useState<PaperFormatId>(() => {
    return (localStorage.getItem('teeex_paper_format') as PaperFormatId) || 'ieee';
  });
  const [isTwoColumn, setIsTwoColumn] = useState<boolean>(() => {
    const saved = localStorage.getItem('teeex_column_mode');
    if (saved !== null) return saved === '2';
    return true;
  });

  // Keep latest files & activeFileId in refs so callbacks never suffer from stale closures
  const filesRef = useRef(files);
  filesRef.current = files;
  const activeFileIdRef = useRef(activeFileId);
  activeFileIdRef.current = activeFileId;
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  // Debounced Project Persistence (prevents synchronous localStorage & IndexedDB blocking on every keystroke)
  useEffect(() => {
    const timer = setTimeout(() => {
      const updatedProjects = updateProject(activeProjectId, {
        files,
        folders,
        title: projectTitle,
      });
      setProjects(updatedProjects);

      if (activeProject) {
        saveProjectOffline({
          ...activeProject,
          files,
          folders,
          title: projectTitle,
          updatedAt: new Date().toISOString(),
        }).catch(console.error);
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [files, folders, projectTitle, activeProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleTwoColumn = useCallback(() => {
    setIsTwoColumn(prev => {
      const next = !prev;
      try {
        localStorage.setItem('teeex_column_mode', next ? '2' : '1');
      } catch {
        // Ignore storage errors
      }

      setFiles(currFiles => {
        const entry =
          currFiles.find(f => f.name.endsWith('.tex') && f.isEntry) ??
          currFiles.find(f => f.name === 'main.tex') ??
          currFiles.find(f => /\\documentclass/.test(f.content));
        if (!entry) return currFiles;

        const updated = setTwoColumn(entry.content, next);
        if (updated === entry.content) return currFiles;
        return currFiles.map(f => (f.id === entry.id ? { ...f, content: updated } : f));
      });

      return next;
    });
  }, []);

  // Room & Collaboration State
  const [roomId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || 'quantum-project-alpha';
  });

  const currentRole = useMemo<ProjectRole>(() => {
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

    if (currentUser && activeProject?.ownerEmail === currentUser.email) return 'owner';
    return activeProject?.role || 'owner';
  }, [activeProject, currentUser, roomId]);

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [isCloudConnected, setIsCloudConnected] = useState(() => isSupabaseConnected());

  const [hub] = useState<CollaborationHub>(() => new CollaborationHub(roomId));
  const [selfUser, setSelfUser] = useState<Collaborator>(() => {
    const initial = hub.selfUser;
    if (currentUser) {
      return {
        ...initial,
        name: currentUser.fullName,
        avatar: currentUser.fullName.substring(0, 2).toUpperCase(),
        color: currentUser.avatarColor || '#38bdf8',
      };
    }
    return {
      ...initial,
      name: 'Guest Author',
      avatar: 'GA',
      color: '#38bdf8',
    };
  });

  // Cursor line tracked separately with throttling for Sidebar outline highlight
  const [activeCursorLine, setActiveCursorLine] = useState<number>(1);
  const cursorThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [peers, setPeers] = useState<Collaborator[]>(() => {
    return areSimulatedPeersEnabled(activeProjectId) ? DEFAULT_PEERS : [];
  });

  const [isPlatformDev, setIsPlatformDev] = useState<boolean>(() => isPlatformDeveloper());
  const [isDevDemoActive, setIsDevDemoActive] = useState<boolean>(() => isDemoModeEnabled());
  const [isDevUnlockOpen, setIsDevUnlockOpen] = useState<boolean>(false);

  const handleDeveloperStatusChanged = useCallback(() => {
    setIsPlatformDev(isPlatformDeveloper());
    setIsDevDemoActive(isDemoModeEnabled());
  }, []);

  const handleToggleDevDemoMode = useCallback(() => {
    const next = !isDemoModeEnabled();
    setDemoModeEnabled(next);
    setIsDevDemoActive(next);
  }, []);

  const handleLockPlatformDev = useCallback(() => {
    lockPlatformDeveloper();
    setIsPlatformDev(false);
    setIsDevDemoActive(false);
  }, []);

  // Active File reference
  const activeFile = useMemo(() => {
    return files.find(f => f.id === activeFileId) || files[0];
  }, [files, activeFileId]);

  // Performance fix: Only re-parse BibTeX when the .bib file's actual content changes!
  const bibContent = useMemo(() => {
    return files.find(f => f.name.endsWith('.bib'))?.content ?? '';
  }, [files]);

  const bibEntries = useMemo(() => {
    return bibContent ? parseBibtex(bibContent) : [];
  }, [bibContent]);

  const [targetLine, setTargetLine] = useState<number | null>(null);
  const [forwardTargetLine, setForwardTargetLine] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const [compileState, setCompileState] = useState<CompileState>({
    status: 'success',
    durationMs: 14,
    timestamp: new Date().toLocaleTimeString(),
    errorCount: 0,
    warningCount: 0,
    rawLogs: ['Output written on main.pdf (1 page, 38402 bytes).'],
  });

  // Modal States
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isTableBuilderOpen, setIsTableBuilderOpen] = useState(false);
  const [isSymbolsOpen, setIsSymbolsOpen] = useState(false);
  const [symbolsInitialTab, setSymbolsInitialTab] = useState<'symbols' | 'snippets' | 'macros'>('symbols');
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isImageUploadOpen, setIsImageUploadOpen] = useState(false);
  const [isSupabaseOpen, setIsSupabaseOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isWordCountOpen, setIsWordCountOpen] = useState(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);
  const [isEncryptionModalOpen, setIsEncryptionModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const [isOffline, setIsOffline] = useState<boolean>(() => !navigator.onLine);
  const [trackedChanges, setTrackedChanges] = useState<TrackedChange[]>([]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);

  const texEngineView = useTexEngine({ files });

  const [syncTexIndex, setSyncTexIndex] = useState<SyncTexIndex | null>(null);

  useEffect(() => {
    const synctex = texEngineView.outcome?.synctex;
    if (!synctex) return;

    let cancelled = false;
    void parseSyncTex(synctex)
      .then((index) => {
        if (!cancelled) setSyncTexIndex(index);
      })
      .catch(() => {
        if (!cancelled) setSyncTexIndex(null);
      });

    return () => {
      cancelled = true;
    };
  }, [texEngineView.outcome?.synctex]);

  const forwardTarget = useMemo<ForwardMatch | null>(() => {
    if (!syncTexIndex || forwardTargetLine === null) return null;
    return forwardSync(syncTexIndex, activeFile.name, forwardTargetLine);
  }, [syncTexIndex, forwardTargetLine, activeFile.name]);

  const handleInverseSync = useCallback(
    (file: string, line: number) => {
      const target =
        filesRef.current.find(f => f.name === file) ??
        filesRef.current.find(f => f.name.endsWith(`/${file}`));

      if (target) {
        setActiveFileId(target.id);
        setOpenFileIds(open => (open.includes(target.id) ? open : [...open, target.id]));
      }
      setTargetLine(line);
    },
    [],
  );

  const engineErrorSummary = useMemo(() => {
    const outcome = texEngineView.outcome;
    if (!outcome || outcome.ok) return null;
    const firstError = outcome.diagnostics.find(d => d.severity === 'error');
    if (!firstError) return null;
    const where = firstError.line ? ` (${firstError.file ?? ''}:${firstError.line})` : '';
    return `${firstError.message}${where}`;
  }, [texEngineView.outcome]);

  const handleSelectFormat = useCallback((format: PaperFormatId) => {
    setPaperFormat(format);
    try {
      localStorage.setItem('teeex_paper_format', format);
    } catch {
      // Ignore
    }

    setFiles(prev => {
      const entry =
        prev.find(f => f.name.endsWith('.tex') && f.isEntry) ??
        prev.find(f => f.name === 'main.tex') ??
        prev.find(f => /\\documentclass/.test(f.content));

      if (!entry) {
        setToast('No document with a \\documentclass to switch. Add one first.');
        return prev;
      }

      const next = applyDocumentClass(entry.content, format);
      if (next === entry.content) return prev;
      return prev.map(f => (f.id === entry.id ? { ...f, content: next } : f));
    });

    const notice = formatResolutionNotice(format);
    if (notice) setToast(notice);
  }, []);

  // Debounce live parser to 220ms so fast typing doesn't flood worker postMessage
  const liveCompileResult = useLatexParser({
    content: activeFile.content,
    files,
    activeFileName: activeFile.name,
    debounceMs: 220,
  });

  const parsedDoc = liveCompileResult.parsedDoc;
  const renderedHtml = liveCompileResult.renderedHtml;

  const diagnostics = useMemo(() => {
    const parserDiags = liveCompileResult.diagnostics;
    const outcome = texEngineView.outcome;
    if (!outcome || outcome.diagnostics.length === 0) return parserDiags;

    const engineDiags: Diagnostic[] = outcome.diagnostics.map((item) => ({
      id: item.id,
      line: item.line ?? 1,
      column: 1,
      severity: item.severity,
      message: item.hint ? `${item.message} — ${item.hint}` : item.message,
      rule: item.code,
      rawLog: item.context ?? item.raw,
    }));

    return [...engineDiags, ...parserDiags];
  }, [liveCompileResult.diagnostics, texEngineView.outcome]);

  useEffect(() => {
    if (texEngineView.isCompiling) {
      setCompileState(prev => ({ ...prev, status: 'compiling', isDebouncing: false }));
      return;
    }

    if (texEngineView.isDebouncing) {
      setCompileState(prev => ({ ...prev, isDebouncing: true }));
      return;
    }

    const outcome = texEngineView.outcome;
    if (!outcome) {
      setCompileState(prev => ({
        ...prev,
        durationMs: liveCompileResult.durationMs,
        isDebouncing: false,
      }));
      return;
    }

    setCompileState({
      status: outcome.ok ? 'success' : 'error',
      durationMs: liveCompileResult.durationMs,
      pdfDurationMs: outcome.durationMs,
      isDebouncing: false,
      errorCount: outcome.diagnostics.filter(d => d.severity === 'error').length,
      warningCount: outcome.diagnostics.filter(d => d.severity === 'warning').length,
      timestamp: texEngineView.lastCompiledAt
        ? new Date(texEngineView.lastCompiledAt).toLocaleTimeString()
        : new Date().toLocaleTimeString(),
      rawLogs: outcome.log ? outcome.log.split(/\r?\n/).filter(Boolean) : [],
    });
  }, [texEngineView.isCompiling, texEngineView.isDebouncing, texEngineView.outcome, texEngineView.lastCompiledAt, liveCompileResult.durationMs]);

  // Debounced Word Count to avoid running regex over the whole file on every keystroke
  const [wordCount, setWordCount] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      const textOnly = activeFile.content.replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, ' ').replace(/%.*/g, ' ');
      const words = textOnly.trim().split(/\s+/).filter(w => w.length > 0);
      setWordCount(words.length);
    }, 300);
    return () => clearTimeout(timer);
  }, [activeFile.content]);

  const equationCount = parsedDoc.mathBlocks.length;

  const triggerCompile = useCallback(() => {
    setCompileState(prev => ({ ...prev, status: 'compiling' }));
    texEngineView.compile();
  }, [texEngineView]);

  // Real-time Collaboration sync listener
  useEffect(() => {
    const unsubscribe = hub.onMessage(msg => {
      if (msg.type === 'FILE_UPDATE' && msg.fileId && msg.content !== undefined) {
        setFiles(prev => prev.map(f => f.id === msg.fileId ? { ...f, content: msg.content! } : f));
      } else if (msg.type === 'CURSOR_MOVE') {
        setPeers(prev => {
          const existing = prev.find(p => p.id === msg.senderId);
          if (existing) {
            return prev.map(p => p.id === msg.senderId ? {
              ...p,
              cursorLine: msg.cursorLine || p.cursorLine,
              cursorCol: msg.cursorCol || p.cursorCol,
              activeFile: msg.fileId || p.activeFile,
            } : p);
          } else {
            return [...prev, {
              id: msg.senderId,
              name: msg.senderName,
              color: msg.senderColor,
              avatar: msg.senderName.substring(0, 2).toUpperCase(),
              cursorLine: msg.cursorLine || 1,
              cursorCol: msg.cursorCol || 1,
              activeFile: msg.fileId || 'main.tex',
              status: 'active',
            }];
          }
        });
      }
    });

    return () => unsubscribe();
  }, [hub]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSelectFile = useCallback((fileId: string) => {
    setActiveFileId(fileId);
    setOpenFileIds(prev => prev.includes(fileId) ? prev : [...prev, fileId]);
  }, []);

  const handleCloseTab = useCallback((fileId: string) => {
    setOpenFileIds(prev => {
      const next = prev.filter(id => id !== fileId);
      if (next.length === 0) {
        const fallback = filesRef.current[0]?.id || fileId;
        setActiveFileId(fallback);
        return [fallback];
      }
      if (activeFileIdRef.current === fileId) {
        const idx = prev.indexOf(fileId);
        const nextActive = next[Math.max(0, idx - 1)] || next[0];
        setActiveFileId(nextActive);
      }
      return next;
    });
  }, []);

  const handleAcceptTrackedChange = useCallback((changeId: string) => {
    setTrackedChanges(prev => {
      const c = prev.find(t => t.id === changeId);
      if (c) {
        logAuditAction(
          activeProjectIdRef.current,
          'CHANGE_ACCEPTED',
          `Accepted review suggestion: "${c.text.slice(0, 35)}..."`,
          currentUser?.fullName || 'Current User',
          currentRole,
          'collaboration'
        );
      }
      return prev.filter(t => t.id !== changeId);
    });
  }, [currentUser, currentRole]);

  const handleRejectTrackedChange = useCallback((changeId: string) => {
    setTrackedChanges(prev => {
      const c = prev.find(t => t.id === changeId);
      if (c) {
        logAuditAction(
          activeProjectIdRef.current,
          'CHANGE_REJECTED',
          `Rejected review suggestion: "${c.text.slice(0, 35)}..."`,
          currentUser?.fullName || 'Current User',
          currentRole,
          'collaboration'
        );
      }
      return prev.filter(t => t.id !== changeId);
    });
  }, [currentUser, currentRole]);

  const handleAddTrackedChange = useCallback((change: Omit<TrackedChange, 'id' | 'status' | 'timestamp'>) => {
    const newChange: TrackedChange = {
      ...change,
      id: `change-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: 'Just now',
      status: 'pending',
    };
    setTrackedChanges(prev => [newChange, ...prev]);
  }, []);

  const handleToggleEncryption = useCallback(async (enabled: boolean, passphrase: string, salt: string) => {
    if (enabled) {
      const encryptedFiles = await Promise.all(
        filesRef.current.map(async f => ({
          ...f,
          content: await encryptText(f.content, passphrase, salt),
        }))
      );
      setFiles(encryptedFiles);
      const updated = updateProject(activeProjectIdRef.current, {
        files: encryptedFiles,
        isEncrypted: true,
        encryptionSalt: salt,
      });
      setProjects(updated);
      logAuditAction(
        activeProjectIdRef.current,
        'ENCRYPTION_ENABLED',
        'Enabled client-side AES-256-GCM vault encryption',
        currentUser?.fullName || 'Current User',
        currentRole,
        'security'
      );
    } else {
      try {
        const decryptedFiles = await Promise.all(
          filesRef.current.map(async f => ({
            ...f,
            content: await decryptText(f.content, passphrase, salt),
          }))
        );
        setFiles(decryptedFiles);
        const updated = updateProject(activeProjectIdRef.current, {
          files: decryptedFiles,
          isEncrypted: false,
          encryptionSalt: undefined,
        });
        setProjects(updated);
        logAuditAction(
          activeProjectIdRef.current,
          'ENCRYPTION_DISABLED',
          'Decrypted document vault back to plaintext',
          currentUser?.fullName || 'Current User',
          currentRole,
          'security'
        );
      } catch (err: any) {
        alert('Decryption failed: ' + (err.message || 'Incorrect passphrase'));
        return;
      }
    }
    setIsEncryptionModalOpen(false);
  }, [currentUser, currentRole]);

  // Fast, non-blocking file content update
  const handleCodeChange = useCallback((newCode: string) => {
    const currentId = activeFileIdRef.current;
    setFiles(prev => prev.map(f => f.id === currentId ? { ...f, content: newCode } : f));
    hub.broadcastFileUpdate(currentId, newCode);
  }, [hub]);

  // Cursor change: Broadcasts immediately to peers, throttles local UI outline update to 200ms
  const handleCursorChange = useCallback((line: number, col: number) => {
    hub.broadcastCursor(activeFileIdRef.current, line, col);
    if (cursorThrottleRef.current) clearTimeout(cursorThrottleRef.current);
    cursorThrottleRef.current = setTimeout(() => {
      setActiveCursorLine(prev => (prev !== line ? line : prev));
    }, 200);
  }, [hub]);

  // Apply Quick Fix action safely across single or multiple lines
  const handleApplyFix = useCallback((fix: SuggestedFix) => {
    const currentFile = filesRef.current.find(f => f.id === activeFileIdRef.current) || filesRef.current[0];
    if (!currentFile) return;
    const lines = currentFile.content.split('\n');
    const startIdx = Math.max(0, fix.startLine - 1);
    const deleteCount = Math.max(1, (fix.endLine ?? fix.startLine) - fix.startLine + 1);
    lines.splice(startIdx, deleteCount, fix.replacement);
    handleCodeChange(lines.join('\n'));
    setTimeout(() => triggerCompile(), 50);
  }, [handleCodeChange, triggerCompile]);

  const handleInsertCode = useCallback((latexSnippet: string) => {
    const currentFile = filesRef.current.find(f => f.id === activeFileIdRef.current) || filesRef.current[0];
    if (!currentFile) return;
    const updated = currentFile.content + '\n' + latexSnippet + '\n';
    handleCodeChange(updated);
    setTimeout(() => triggerCompile(), 50);
  }, [handleCodeChange, triggerCompile]);

  const handleFormatDocument = useCallback(() => {
    const currentFile = filesRef.current.find(f => f.id === activeFileIdRef.current) || filesRef.current[0];
    if (!currentFile || !currentFile.name.endsWith('.tex')) return;
    const formatted = formatLatexCode(currentFile.content);
    if (formatted !== currentFile.content) {
      handleCodeChange(formatted);
    }
  }, [handleCodeChange]);

  // Single authoritative Global Shortcut for Command Palette (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
  }, [selfUser]);

  const handleResolveComment = useCallback((commentId: string) => {
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, resolved: true } : c));
  }, []);

  const handleCreateCheckpoint = useCallback((name: string) => {
    const newCp: Checkpoint = {
      id: 'cp-' + Date.now(),
      name,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      author: selfUser.name,
      files: structuredClone ? structuredClone(filesRef.current) : JSON.parse(JSON.stringify(filesRef.current)),
    };
    setCheckpoints(prev => [newCp, ...prev]);
  }, [selfUser.name]);

  const handleRestoreCheckpoint = useCallback((cp: Checkpoint) => {
    const cloned = structuredClone ? structuredClone(cp.files) : JSON.parse(JSON.stringify(cp.files));
    setFiles(cloned);
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile]);

  const handleRestoreSingleFile = useCallback((file: ProjectFile) => {
    setFiles(prev => prev.map(f => (f.id === file.id || f.name === file.name) ? { ...file } : f));
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile]);

  const handleAddPreambleMacro = useCallback((macroDef: string) => {
    setFiles(prev => {
      const mainFile = prev.find(f => f.name.endsWith('.tex') && f.isEntry) || prev.find(f => f.name.endsWith('.tex')) || prev[0];
      if (!mainFile) return prev;
      let content = mainFile.content;
      if (content.includes(macroDef.trim())) {
        return prev;
      }
      const beginDocIdx = content.indexOf('\\begin{document}');
      if (beginDocIdx !== -1) {
        content = content.slice(0, beginDocIdx) + macroDef.trim() + '\n\n' + content.slice(beginDocIdx);
      } else {
        content = macroDef.trim() + '\n\n' + content;
      }
      return prev.map(f => f.id === mainFile.id ? { ...f, content } : f);
    });
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile]);

  const handleExportPdf = useCallback(() => {
    const bytes = texEngineView.pdf;
    if (!bytes) {
      setToast(
        texEngineView.isCompiling
          ? 'Still typesetting — the PDF will be ready in a moment.'
          : 'No successful build to export yet. Fix the errors in the diagnostics panel, then recompile.',
      );
      return;
    }

    try {
      downloadPdf(bytes, projectTitle || parsedDoc.title || 'document');
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'The PDF could not be exported.');
    }
  }, [texEngineView.pdf, texEngineView.isCompiling, projectTitle, parsedDoc.title]);

  const handleExportZip = useCallback(() => {
    exportProjectAsZip(projectTitle, filesRef.current);
  }, [projectTitle]);

  const handleCreateFile = useCallback((name: string, type: 'tex' | 'bib', targetFolder?: string) => {
    let fullName = name.trim();
    let folder = targetFolder;

    if (targetFolder && !fullName.startsWith(targetFolder + '/')) {
      fullName = `${targetFolder}/${fullName}`;
    } else if (fullName.includes('/')) {
      const parts = fullName.split('/');
      folder = parts.slice(0, -1).join('/');
    }

    const newFile: ProjectFile = {
      id: fullName,
      name: fullName,
      type,
      folder,
      content: type === 'bib' ? `% Bibliography File\n` : `\\section{New Section}\nContent goes here...\n`,
    };
    setFiles(prev => [...prev, newFile]);
    setActiveFileId(fullName);
    setOpenFileIds(prev => prev.includes(fullName) ? prev : [...prev, fullName]);
  }, []);

  const handleCreateFolder = useCallback((folderName: string) => {
    const clean = folderName.trim().replace(/^\/+|\/+$/g, '');
    if (!clean) return;
    setFolders(prev => prev.includes(clean) ? prev : [...prev, clean]);
  }, []);

  const handleDeleteFolder = useCallback((folderName: string) => {
    setFolders(prev => prev.filter(f => f !== folderName));
    setFiles(prev => {
      const updatedFiles = prev.filter(f => {
        const fFolder = f.folder || (f.name.includes('/') ? f.name.split('/')[0] : null);
        return fFolder !== folderName;
      });
      if (!updatedFiles.some(f => f.id === activeFileIdRef.current)) {
        const fallback = updatedFiles[0]?.id || 'main.tex';
        setActiveFileId(fallback);
        setOpenFileIds(open => open.filter(id => updatedFiles.some(f => f.id === id)).concat(open.length === 0 ? [fallback] : []));
      }
      return updatedFiles;
    });
  }, []);

  const handleAddImageFile = useCallback((imageFile: ProjectFile) => {
    const targetFolder = folders.includes('figures') ? 'figures' : undefined;
    const resolvedName = targetFolder && !imageFile.name.startsWith('figures/')
      ? `figures/${imageFile.name}`
      : imageFile.name;

    const fileToSave: ProjectFile = {
      ...imageFile,
      id: resolvedName,
      name: resolvedName,
      folder: targetFolder,
    };

    setFiles(prev => [...prev, fileToSave]);
  }, [folders]);

  const handleImportFiles = useCallback(async (fileList: FileList | File[], targetFolder?: string) => {
    const rawFiles = Array.from(fileList);
    if (rawFiles.length === 0) return;

    const newFiles: ProjectFile[] = [];
    const addedFolders = new Set(folders);

    for (const file of rawFiles) {
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|svg|webp|pdf)$/i.test(file.name);
      const isBib = file.name.endsWith('.bib');
      const isSty = file.name.endsWith('.sty') || file.name.endsWith('.cls');
      const safeName = file.name.replace(/\s+/g, '_');

      if (isImage) {
        const destFolder = targetFolder || 'figures';
        addedFolders.add(destFolder);
        const resolvedName = destFolder && !safeName.startsWith(destFolder + '/')
          ? `${destFolder}/${safeName}`
          : safeName;

        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newFiles.push({
          id: resolvedName,
          name: resolvedName,
          type: 'image',
          folder: destFolder,
          content: `[Binary Image Data: ${Math.round(file.size / 1024)} KB]`,
          dataUrl,
        });
      } else {
        const textContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsText(file);
        });

        const destFolder = targetFolder || (safeName.includes('/') ? safeName.split('/')[0] : undefined);
        if (destFolder) addedFolders.add(destFolder);
        const resolvedName = destFolder && !safeName.startsWith(destFolder + '/')
          ? `${destFolder}/${safeName}`
          : safeName;

        newFiles.push({
          id: resolvedName,
          name: resolvedName,
          type: isBib ? 'bib' : isSty ? 'sty' : 'tex',
          folder: destFolder,
          content: textContent,
        });
      }
    }

    setFiles(prev => {
      const mergedFiles = [...prev];
      newFiles.forEach(nf => {
        const existingIdx = mergedFiles.findIndex(f => f.id === nf.id || f.name === nf.name);
        if (existingIdx >= 0) {
          mergedFiles[existingIdx] = nf;
        } else {
          mergedFiles.push(nf);
        }
      });
      return mergedFiles;
    });

    setFolders(Array.from(addedFolders));

    const firstTextFile = newFiles.find(f => f.type === 'tex' || f.type === 'bib');
    const targetOpen = firstTextFile || newFiles[0];
    if (targetOpen) {
      setActiveFileId(targetOpen.id);
      setOpenFileIds(prev => Array.from(new Set([...prev, targetOpen.id])));
    }

    setTimeout(() => triggerCompile(), 100);
  }, [folders, triggerCompile]);

  const handleDeleteFile = useCallback((fileId: string) => {
    setFiles(prev => {
      if (prev.length <= 1) return prev;
      const updated = prev.filter(f => f.id !== fileId);
      setOpenFileIds(open => {
        const next = open.filter(id => id !== fileId);
        return next.length > 0 ? next : [updated[0]?.id || 'main.tex'];
      });
      if (activeFileIdRef.current === fileId) {
        setActiveFileId(updated[0].id);
      }
      return updated;
    });
  }, []);

  const handleSelectTemplate = useCallback((template: Template) => {
    setFiles(template.files);
    const firstId = template.files[0]?.id || 'main.tex';
    setActiveFileId(firstId);
    setOpenFileIds([firstId]);
    setProjectTitle(template.name);
    setTimeout(() => triggerCompile(), 50);
  }, [triggerCompile]);

  const handleTitleChange = useCallback((newTitle: string) => {
    setProjectTitle(newTitle);
  }, []);

  const handleSelectProject = useCallback((projId: string) => {
    const proj = projects.find(p => p.id === projId);
    if (!proj) return;
    setActiveProjectId(projId);
    setActiveProjectIdState(projId);
    setFiles(proj.files);
    setFolders(proj.folders || ['sections', 'figures']);
    const firstId = proj.files[0]?.id || 'main.tex';
    setActiveFileId(firstId);
    setOpenFileIds([firstId]);
    setProjectTitle(proj.title);
    setPeers(areSimulatedPeersEnabled(projId) ? DEFAULT_PEERS : []);
    setTimeout(() => triggerCompile(), 60);
  }, [projects, triggerCompile]);

  const handleCreateProject = useCallback((title: string, templateId?: string) => {
    const newProj = createProject(
      title,
      currentUser?.email || 'you@teeex.local',
      currentUser?.fullName || 'You',
      templateId
    );
    const updated = loadProjects();
    setProjects(updated);
    const proj = updated.find(p => p.id === newProj.id);
    if (proj) {
      setActiveProjectId(proj.id);
      setActiveProjectIdState(proj.id);
      setFiles(proj.files);
      setFolders(proj.folders || ['sections', 'figures']);
      const firstId = proj.files[0]?.id || 'main.tex';
      setActiveFileId(firstId);
      setOpenFileIds([firstId]);
      setProjectTitle(proj.title);
    }
  }, [currentUser]);

  const handleDuplicateProject = useCallback((projId: string) => {
    const cloned = duplicateProject(projId);
    if (cloned) {
      const updated = loadProjects();
      setProjects(updated);
      setActiveProjectId(cloned.id);
      setActiveProjectIdState(cloned.id);
      setFiles(cloned.files);
      setFolders(cloned.folders || ['sections', 'figures']);
      setProjectTitle(cloned.title);
    }
  }, []);

  const handleToggleArchiveProject = useCallback((projId: string) => {
    const updated = toggleArchiveProject(projId);
    setProjects(updated);
  }, []);

  const handleDeleteProject = useCallback((projId: string) => {
    const updated = deleteProject(projId);
    setProjects(updated);
    if (activeProjectIdRef.current === projId && updated.length > 0) {
      const next = updated[0];
      setActiveProjectId(next.id);
      setActiveProjectIdState(next.id);
      setFiles(next.files);
      setFolders(next.folders || ['sections', 'figures']);
      setProjectTitle(next.title);
    }
  }, []);

  const handleInviteMember = useCallback((email: string, role: ProjectRole) => {
    const newMember: ProjectMember = {
      id: `usr-${Date.now().toString(36)}`,
      email,
      name: email.split('@')[0].replace(/[\._]/g, ' '),
      avatar: email.substring(0, 2).toUpperCase(),
      avatarColor: role === 'owner' ? '#38bdf8' : role === 'editor' ? '#10b981' : '#f59e0b',
      role,
      joinedAt: new Date().toISOString().split('T')[0],
    };
    const members = [...(activeProject?.members || []), newMember];
    const updated = updateProject(activeProjectIdRef.current, { members });
    setProjects(updated);
  }, [activeProject]);

  const handleUpdateMemberRole = useCallback((memberId: string, newRole: ProjectRole) => {
    const members = (activeProject?.members || []).map(m =>
      m.id === memberId ? { ...m, role: newRole } : m
    );
    const updated = updateProject(activeProjectIdRef.current, { members });
    setProjects(updated);
  }, [activeProject]);

  const handleRemoveMember = useCallback((memberId: string) => {
    const members = (activeProject?.members || []).filter(m => m.id !== memberId);
    const updated = updateProject(activeProjectIdRef.current, { members });
    setProjects(updated);
  }, [activeProject]);

  useEffect(() => {
    if (!currentUser?.email || !currentUser?.fullName) return;
    const targetEmail = currentUser.email.toLowerCase();
    const currentMember = activeProject?.members?.find(m => m.email?.toLowerCase() === targetEmail);
    if (currentMember && currentMember.name !== currentUser.fullName) {
      const updatedMembers = (activeProject.members || []).map(m =>
        m.email?.toLowerCase() === targetEmail
          ? {
            ...m,
            name: currentUser.fullName,
            avatar: currentUser.fullName.substring(0, 2).toUpperCase() || m.avatar,
          }
          : m
      );
      const updated = updateProject(activeProjectId, { members: updatedMembers });
      setProjects(updated);
    }
  }, [currentUser, activeProject, activeProjectId]);

  const handleAuthSuccess = useCallback((user: UserProfile) => {
    setCurrentUser(user);
    setIsAuthOpen(false);
    setSelfUser(prev => ({
      ...prev,
      name: user.fullName,
      avatar: user.fullName.substring(0, 2).toUpperCase(),
      color: user.avatarColor || '#38bdf8',
    }));

    const loadedProjects = loadProjects(user.email, user.fullName);
    setProjects(loadedProjects);
    const nextActiveId = getActiveProjectId(loadedProjects);
    const nextProj = loadedProjects.find(p => p.id === nextActiveId) || loadedProjects[0];
    if (nextProj) {
      setActiveProjectId(nextProj.id);
      setActiveProjectIdState(nextProj.id);
      setFiles(nextProj.files);
      setFolders(nextProj.folders || ['sections', 'figures']);
      const firstId = nextProj.files[0]?.id || 'main.tex';
      setActiveFileId(firstId);
      setOpenFileIds([firstId]);
      setProjectTitle(nextProj.title);
      setPeers(areSimulatedPeersEnabled(nextProj.id) ? DEFAULT_PEERS : []);
      setTimeout(() => triggerCompile(), 80);
    }
  }, [triggerCompile]);

  const handleSignOut = useCallback(async () => {
    await signOutUser();
    setCurrentUser(null);
    setIsAuthOpen(false);
  }, []);

  const handleMouseDownSplit = () => {
    setIsDraggingSplit(true);
  };

  useEffect(() => {
    if (!isDraggingSplit) return;

    let rafId: number | null = null;
    const handleMouseMove = (e: MouseEvent) => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const sidebarWidth = isSidebarOpen ? 236 : 0;
        const availableWidth = window.innerWidth - sidebarWidth;
        const mouseRelativeX = e.clientX - sidebarWidth;
        const newPercent = Math.min(78, Math.max(22, (mouseRelativeX / availableWidth) * 100));
        setSplitPercent(newPercent);
      });
    };

    const handleMouseUp = () => {
      setIsDraggingSplit(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSplit, isSidebarOpen]);

  const [isDragOverApp, setIsDragOverApp] = useState(false);
  const dragCounterRef = useRef(0);

  const handleAppDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounterRef.current += 1;
      setIsDragOverApp(true);
    }
  };

  const handleAppDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOverApp(false);
    }
  };

  const handleAppDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleAppDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOverApp(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleImportFiles(e.dataTransfer.files);
    }
  };

  if (isAuthChecking) {
    return (
      <div style={{
        minHeight: '100vh',
        width: '100vw',
        backgroundColor: '#070b14',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        color: '#f8fafc',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        <div style={{
          width: 50,
          height: 50,
          borderRadius: 12,
          backgroundColor: 'rgba(56, 189, 248, 0.12)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 0 25px rgba(56, 189, 248, 0.25)',
        }}>
          <Loader2 size={24} color="#38bdf8" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em' }}>Teeex Studio</div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>Verifying cryptographically signed session...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthPortal
        onAuthSuccess={handleAuthSuccess}
        onDeveloperStatusChanged={handleDeveloperStatusChanged}
      />
    );
  }

  return (
    <div
      onDragEnter={handleAppDragEnter}
      onDragLeave={handleAppDragLeave}
      onDragOver={handleAppDragOver}
      onDrop={handleAppDrop}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'var(--bg-app)',
        userSelect: isDraggingSplit ? 'none' : 'auto',
        position: 'relative',
      }}
    >
      {isDragOverApp && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.78)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            pointerEvents: 'none',
            border: '3px dashed #38bdf8',
            margin: 8,
            borderRadius: 'var(--radius-lg)',
            animation: 'fadeIn 0.15s ease forwards',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              padding: '30px 45px',
              backgroundColor: 'var(--bg-surface-0)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 16,
                backgroundColor: 'rgba(56, 189, 248, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(56, 189, 248, 0.3)',
              }}
            >
              <UploadCloud size={32} color="#38bdf8" />
            </div>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px 0', color: 'var(--text-primary)' }}>
                Drop files to import into project
              </h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: 0, maxWidth: 360 }}>
                Automatically imports LaTeX documents (.tex), bibliographies (.bib), and figures (.png, .jpg, .svg, .pdf) directly into your workspace.
              </p>
            </div>
          </div>
        </div>
      )}

      <Navbar
        projectTitle={projectTitle}
        onTitleChange={handleTitleChange}
        compileState={compileState}
        onCompile={triggerCompile}
        peers={peers}
        selfUser={selfUser}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenShare={() => setIsShareOpen(true)}
        onOpenTableBuilder={() => setIsTableBuilderOpen(true)}
        onOpenSymbols={() => {
          setSymbolsInitialTab('symbols');
          setIsSymbolsOpen(true);
        }}
        onOpenTemplates={() => setIsTemplatesOpen(true)}
        onOpenImageUpload={() => setIsImageUploadOpen(true)}
        onOpenSupabase={() => setIsSupabaseOpen(true)}
        isCloudConnected={isCloudConnected}
        onExportPdf={handleExportPdf}
        onExportZip={handleExportZip}
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onOpenProjectsHub={() => setIsProjectsHubOpen(true)}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenAdminUsers={() => setIsAdminUsersOpen(true)}
        onSignOut={handleSignOut}
        currentRole={currentRole}
        isPlatformDev={isPlatformDev}
        onOpenDeveloperUnlock={() => setIsDevUnlockOpen(true)}
        onLockPlatformDev={handleLockPlatformDev}
        isDevDemoActive={isDevDemoActive}
        onToggleDevDemoMode={handleToggleDevDemoMode}
        isEncrypted={!!activeProject?.isEncrypted}
        isOffline={isOffline}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{
          width: isSidebarOpen ? 236 : 0,
          transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0,
        }}>
          <Sidebar
            files={files}
            folders={folders}
            activeFileId={activeFileId}
            onSelectFile={handleSelectFile}
            onCreateFile={handleCreateFile}
            onDeleteFile={handleDeleteFile}
            onCreateFolder={handleCreateFolder}
            onDeleteFolder={handleDeleteFolder}
            documentOutline={parsedDoc.sections}
            parsedDoc={parsedDoc}
            activeCursorLine={activeCursorLine}
            onJumpToLine={setTargetLine}
            wordCount={wordCount}
            equationCount={equationCount}
            onOpenWordCount={() => setIsWordCountOpen(true)}
            onOpenHistory={() => setIsHistoryOpen(true)}
            role={currentRole}
            onCollapse={() => setIsSidebarOpen(false)}
            onImportFiles={handleImportFiles}
            onOpenImageUpload={() => setIsImageUploadOpen(true)}
          />
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          <div style={{ width: `${splitPercent}%`, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Editor
              code={activeFile.content}
              fileName={activeFile.name}
              activeFileId={activeFileId}
              openFileIds={openFileIds}
              onSelectFile={handleSelectFile}
              onCloseTab={handleCloseTab}
              onChange={handleCodeChange}
              diagnostics={diagnostics}
              peers={peers}
              onCursorChange={handleCursorChange}
              onCompileShortcut={triggerCompile}
              targetLine={targetLine}
              onClearTargetLine={() => setTargetLine(null)}
              comments={comments}
              onAddComment={handleAddComment}
              onResolveComment={handleResolveComment}
              bibEntries={bibEntries}
              role={currentRole}
              files={files}
              isSidebarOpen={isSidebarOpen}
              onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
              onForwardSync={(line) => setForwardTargetLine(line)}
              trackedChanges={trackedChanges}
              onAcceptTrackedChange={handleAcceptTrackedChange}
              onRejectTrackedChange={handleRejectTrackedChange}
              onAddTrackedChange={handleAddTrackedChange}
              onOpenSnippets={() => {
                setSymbolsInitialTab('snippets');
                setIsSymbolsOpen(true);
              }}
              onFormatDocument={handleFormatDocument}
              onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
              onOpenImageUpload={() => setIsImageUploadOpen(true)}
              onImportFiles={handleImportFiles}
            />
          </div>

          <div
            onMouseDown={handleMouseDownSplit}
            onDoubleClick={() => setSplitPercent(prev => prev === 50 ? 70 : prev === 70 ? 30 : 50)}
            style={{
              width: 5,
              cursor: 'col-resize',
              backgroundColor: isDraggingSplit ? '#38bdf8' : 'var(--border-subtle)',
              zIndex: 35,
              transition: isDraggingSplit ? 'none' : 'background 0.2s ease',
              position: 'relative',
            }}
            title="Drag to resize panels • Double-click to cycle 50/50, 70/30, 30/70"
          />

          <div style={{
            width: `${100 - splitPercent}%`,
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--bg-app)',
          }}>
            <PreviewPane
              renderedHtml={renderedHtml}
              parsedDoc={parsedDoc}
              documentTitle={projectTitle || parsedDoc.title || 'document'}
              pdf={texEngineView.pdf}
              status={texEngineView.status}
              isCompiling={texEngineView.isCompiling}
              isDebouncing={texEngineView.isDebouncing}
              durationMs={texEngineView.durationMs}
              isStale={texEngineView.isStale}
              errorSummary={engineErrorSummary}
              onCompile={triggerCompile}
              syncTexIndex={syncTexIndex}
              forwardTarget={forwardTarget}
              onInverseSync={handleInverseSync}
              onJumpToLine={setTargetLine}
            />
          </div>
        </div>
      </div>

      <DiagnosticsDock
        diagnostics={diagnostics}
        onApplyFix={handleApplyFix}
        onJumpToLine={setTargetLine}
        rawLogs={compileState.rawLogs}
      />

      {toast && (
        <div className="app-toast" role="status" aria-live="polite">
          <span>{toast}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <Suspense fallback={null}>
        {isImageUploadOpen && (
          <ImageUploadModal
            isOpen={isImageUploadOpen}
            onClose={() => setIsImageUploadOpen(false)}
            onAddImageFile={handleAddImageFile}
            onInsertLatex={handleInsertCode}
          />
        )}

        {isSupabaseOpen && (
          <SupabaseModal
            isOpen={isSupabaseOpen}
            onClose={() => {
              setIsSupabaseOpen(false);
              setIsCloudConnected(isSupabaseConnected());
            }}
            onSyncWithCloud={() => setIsCloudConnected(true)}
            projects={projects}
            onProjectsUpdated={setProjects}
            currentRole={currentRole}
            currentUser={currentUser}
            onDeveloperStatusChanged={handleDeveloperStatusChanged}
          />
        )}

        {isSymbolsOpen && (
          <SymbolPaletteModal
            isOpen={isSymbolsOpen}
            onClose={() => setIsSymbolsOpen(false)}
            onInsert={handleInsertCode}
            onAddPreambleMacro={handleAddPreambleMacro}
            initialTab={symbolsInitialTab}
          />
        )}

        {isTableBuilderOpen && (
          <TableBuilderModal
            isOpen={isTableBuilderOpen}
            onClose={() => setIsTableBuilderOpen(false)}
            onInsert={handleInsertCode}
          />
        )}

        {isHistoryOpen && (
          <VersionHistoryModal
            isOpen={isHistoryOpen}
            onClose={() => setIsHistoryOpen(false)}
            checkpoints={checkpoints}
            currentFiles={files}
            onCreateCheckpoint={handleCreateCheckpoint}
            onRestoreCheckpoint={handleRestoreCheckpoint}
            onRestoreSingleFile={handleRestoreSingleFile}
          />
        )}

        {isWordCountOpen && (
          <WordCountModal
            isOpen={isWordCountOpen}
            onClose={() => setIsWordCountOpen(false)}
            wordCount={wordCount}
            equationCount={equationCount}
            parsedDoc={parsedDoc}
            activeCode={activeFile.content}
          />
        )}

        {isShareOpen && (
          <ShareModal
            isOpen={isShareOpen}
            onClose={() => setIsShareOpen(false)}
            roomId={roomId}
            peers={peers}
            selfUser={selfUser}
            currentUser={currentUser}
            projectMembers={activeProject?.members || []}
            onInviteMember={handleInviteMember}
            onUpdateMemberRole={handleUpdateMemberRole}
            onRemoveMember={handleRemoveMember}
            currentRole={currentRole}
          />
        )}

        {isTemplatesOpen && (
          <TemplateModal
            isOpen={isTemplatesOpen}
            onClose={() => setIsTemplatesOpen(false)}
            onSelectTemplate={handleSelectTemplate}
          />
        )}

        {isAuthOpen && (
          <AuthModal
            isOpen={isAuthOpen}
            onClose={() => setIsAuthOpen(false)}
            currentUser={currentUser}
            onAuthSuccess={handleAuthSuccess}
            onDeveloperStatusChanged={handleDeveloperStatusChanged}
          />
        )}

        {isDevUnlockOpen && (
          <DeveloperUnlockModal
            isOpen={isDevUnlockOpen}
            onClose={() => setIsDevUnlockOpen(false)}
            onDeveloperStatusChanged={handleDeveloperStatusChanged}
            onOpenVault={() => setIsSupabaseOpen(true)}
          />
        )}

        {isProjectsHubOpen && (
          <ProjectsDashboardModal
            isOpen={isProjectsHubOpen}
            onClose={() => setIsProjectsHubOpen(false)}
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            onDuplicateProject={handleDuplicateProject}
            onToggleArchiveProject={handleToggleArchiveProject}
            onDeleteProject={handleDeleteProject}
            currentUser={currentUser}
          />
        )}

        {isEncryptionModalOpen && (
          <EncryptionModal
            isOpen={isEncryptionModalOpen}
            onClose={() => setIsEncryptionModalOpen(false)}
            isEncrypted={!!activeProject?.isEncrypted}
            encryptionSalt={activeProject?.encryptionSalt}
            files={files}
            onToggleEncryption={handleToggleEncryption}
          />
        )}

        {isAuditModalOpen && (
          <AuditLogModal
            isOpen={isAuditModalOpen}
            onClose={() => setIsAuditModalOpen(false)}
            projectId={activeProjectId}
            projectTitle={projectTitle}
          />
        )}

        {isAdminUsersOpen && (
          <AdminUsersModal
            isOpen={isAdminUsersOpen}
            onClose={() => setIsAdminUsersOpen(false)}
            currentUser={currentUser}
          />
        )}

        {isCommandPaletteOpen && (
          <CommandPaletteModal
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
            files={files}
            onSelectFile={handleSelectFile}
            onCompile={triggerCompile}
            onFormatDocument={handleFormatDocument}
            onToggleTwoColumn={handleToggleTwoColumn}
            isTwoColumn={isTwoColumn}
            activeFormat={paperFormat}
            onSelectFormat={handleSelectFormat}
            theme={theme}
            onToggleTheme={toggleTheme}
            onExportPdf={handleExportPdf}
            onExportZip={handleExportZip}
            onOpenWordCount={() => setIsWordCountOpen(true)}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onOpenProjectsHub={() => setIsProjectsHubOpen(true)}
            onOpenSymbols={() => {
              setSymbolsInitialTab('symbols');
              setIsSymbolsOpen(true);
            }}
            onOpenTableBuilder={() => setIsTableBuilderOpen(true)}
            sections={parsedDoc.sections}
            onJumpToLine={setTargetLine}
          />
        )}
      </Suspense>
    </div>
  );
}

export default App;