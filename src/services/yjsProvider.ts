import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness';
import * as buffer from 'lib0/buffer';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, getAuthUid } from './supabaseClient';
import type { Collaborator, ProjectFile, ReviewComment, TrackedChange } from '../types/latex';

export const CHUNK_SIZE = 48000; // 48KB max slice to stay safely under WebSocket message limits

export interface YjsWireMessage {
  type: 'sync-step-1' | 'sync-step-2' | 'update' | 'chunk' | 'awareness';
  senderId: string;
  data?: string; // Base64 encoded payload
  transferId?: string;
  chunkIndex?: number;
  totalChunks?: number;
}

export interface PeerCursorInfo {
  fileId: string;
  line: number;
  col: number;
  anchor?: number;
  head?: number;
  updatedAt: number;
}

export class SupabaseYjsProvider {
  public projectId: string;
  public ydoc: Y.Doc;
  public awareness: Awareness;
  public selfUser: Collaborator;

  private supabaseChannel: RealtimeChannel | null = null;
  private localBroadcast: BroadcastChannel | null = null;
  private undoManagers: Map<string, Y.UndoManager> = new Map();
  private pendingChunkTransfers: Map<string, { total: number; chunks: Map<number, Uint8Array> }> = new Map();

  public isDestroyed = false;
  public shareToken?: string | null;
  private peerListeners: Set<(peers: Collaborator[]) => void> = new Set();
  private lastAwarenessBroadcastTime = 0;
  private pendingAwarenessTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingDocSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private isChannelSubscribed = false;
  private pendingWireMessages: YjsWireMessage[] = [];
  private onDocSaveCallback?: (files: ProjectFile[]) => void;

  constructor(
    projectId: string,
    selfUser: Collaborator,
    initialFiles?: ProjectFile[],
    onDocSave?: (files: ProjectFile[]) => void,
    shareToken?: string | null
  ) {
    this.projectId = projectId;
    this.selfUser = selfUser;
    this.onDocSaveCallback = onDocSave;
    this.shareToken = shareToken;

    // 1. Initialize root Y.Doc and Awareness
    this.ydoc = new Y.Doc({ gc: true });
    this.awareness = new Awareness(this.ydoc);

    // Seed initial files into Y.Text instances if provided
    if (initialFiles && initialFiles.length > 0) {
      this.initFiles(initialFiles);
    }

    // Configure local awareness state with current user profile
    this.awareness.setLocalStateField('user', {
      id: selfUser.id,
      name: selfUser.name,
      color: selfUser.color,
      colorLight: selfUser.color + '33',
      avatar: selfUser.avatar || selfUser.name.substring(0, 2).toUpperCase(),
    });
    this.awareness.setLocalStateField('clientCursor', {
      fileId: 'main.tex',
      line: 1,
      col: 1,
      updatedAt: Date.now(),
    });

    // 2. Set up Yjs local update listener
    this.ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      // Do not re-broadcast updates that originated from our own remote provider
      if (origin === this) return;

      this.broadcastUpdate(update);
      this.scheduleDocSave();
    });

    // 3. Set up Awareness local change listener
    this.awareness.on('change', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      // Emit to subscribers
      this.notifyPeerListeners();

      // Broadcast local awareness changes to peers (throttled at 60ms)
      const localClientId = this.ydoc.clientID;
      if (added.includes(localClientId) || updated.includes(localClientId) || removed.includes(localClientId)) {
        this.throttleBroadcastAwareness();
      }
    });

    // 4. Initialize Local BroadcastChannel transport (same-browser / multi-tab / offline fallback)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.localBroadcast = new BroadcastChannel(`teeex_yjs_${projectId}`);
        this.localBroadcast.onmessage = (event) => {
          this.handleWireMessage(event.data as YjsWireMessage);
        };
      } catch (err) {
        console.warn('[SupabaseYjsProvider] BroadcastChannel fallback unavailable:', err);
      }
    }

    // 5. Initialize Supabase Realtime transport (cross-machine / cloud)
    this.initSupabaseRealtime();

    // 6. Broadcast initial sync step 1
    this.sendSyncStep1();
  }

  // ============================================================================
  // File & CRDT Text Management
  // ============================================================================

  public getText(fileId: string): Y.Text {
    return this.ydoc.getText(`file:${fileId}`);
  }

  public initFiles(files: ProjectFile[]) {
    let hasContent = false;
    for (const key of this.ydoc.share.keys()) {
      if (key.startsWith('file:') && this.ydoc.getText(key).length > 0) {
        hasContent = true;
        break;
      }
    }
    if (hasContent) return;

    // Owners seed immediately. Collaborators wait 300ms for peer/cloud sync; if still empty, seed fallback.
    if (this.selfUser.role === 'owner' || !this.selfUser.role) {
      this.doSeedFiles(files);
    } else {
      setTimeout(() => {
        if (!this.isDestroyed) {
          let populated = false;
          for (const key of this.ydoc.share.keys()) {
            if (key.startsWith('file:') && this.ydoc.getText(key).length > 0) {
              populated = true;
              break;
            }
          }
          if (!populated) {
            this.doSeedFiles(files);
          }
        }
      }, 300);
    }
  }

  private doSeedFiles(files: ProjectFile[]) {
    this.ydoc.transact(() => {
      for (const file of files) {
        const ytext = this.getText(file.id);
        if (ytext.length === 0 && file.content) {
          ytext.insert(0, file.content);
        }
      }
    }, this);
  }

  public getDoc(): Y.Doc {
    return this.ydoc;
  }

  public getUndoManager(fileId: string): Y.UndoManager {
    let um = this.undoManagers.get(fileId);
    if (!um) {
      um = new Y.UndoManager(this.getText(fileId), {
        trackedOrigins: new Set([null, undefined, 'local-editor']), // track local keystrokes and local-editor transactions
      });
      this.undoManagers.set(fileId, um);
    }
    return um;
  }

  public getCommentsArray(): Y.Array<ReviewComment> {
    return this.ydoc.getArray<ReviewComment>('project-comments');
  }

  public getTrackedChangesArray(): Y.Array<TrackedChange> {
    return this.ydoc.getArray<TrackedChange>('project-tracked-changes');
  }

  public getMetadataMap(): Y.Map<unknown> {
    return this.ydoc.getMap<unknown>('project-metadata');
  }

  // ============================================================================
  // Transport Initialization
  // ============================================================================

  private initSupabaseRealtime() {
    const supabase = getSupabaseClient(this.shareToken);
    if (!supabase) return;

    try {
      const channelName = `teeex:collab:${this.projectId}`;
      this.supabaseChannel = supabase.channel(channelName, {
        config: {
          broadcast: { self: false },
          presence: { key: this.selfUser.id },
        },
      });

      // Handle incoming broadcast messages
      this.supabaseChannel
        .on('broadcast', { event: 'yjs-wire' }, ({ payload }) => {
          this.handleWireMessage(payload as YjsWireMessage);
        })
        .on('presence', { event: 'sync' }, () => {
          this.syncPeersFromSupabasePresence();
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.isChannelSubscribed = true;

            // Track presence on the channel
            this.supabaseChannel?.track({
              user: this.selfUser,
              clientCursor: { line: 1, col: 1, fileId: 'main.tex' },
              onlineAt: Date.now(),
            });

            // Flush buffered messages queued before WebSocket channel completed subscription
            if (this.pendingWireMessages.length > 0) {
              const pending = [...this.pendingWireMessages];
              this.pendingWireMessages = [];
              for (const msg of pending) {
                try {
                  this.supabaseChannel?.send({
                    type: 'broadcast',
                    event: 'yjs-wire',
                    payload: msg,
                  });
                } catch { }
              }
            }

            // Handshake: Send sync-step-1 to discover peer states
            this.sendSyncStep1();
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            this.isChannelSubscribed = false;
          }
        });
    } catch (err) {
      console.warn('[SupabaseYjsProvider] Failed to initialize Supabase Realtime channel:', err);
    }
  }

  // ============================================================================
  // Message Handling & Binary Chunking
  // ============================================================================

  private sendWireMessage(msg: YjsWireMessage) {
    if (this.isDestroyed) return;

    // 1. Post to local BroadcastChannel (for other tabs)
    try {
      this.localBroadcast?.postMessage(msg);
    } catch { }

    // 2. Post to Supabase Realtime Broadcast (for remote peers)
    if (this.supabaseChannel) {
      if (this.isChannelSubscribed) {
        try {
          this.supabaseChannel.send({
            type: 'broadcast',
            event: 'yjs-wire',
            payload: msg,
          });
        } catch { }
      } else {
        // Buffer until WebSocket handshake finishes to avoid REST fallback warning
        this.pendingWireMessages.push(msg);
        if (this.pendingWireMessages.length > 50) {
          this.pendingWireMessages.shift();
        }
      }
    }
  }

  private broadcastUpdate(update: Uint8Array) {
    if (update.byteLength <= CHUNK_SIZE) {
      this.sendWireMessage({
        type: 'update',
        senderId: this.selfUser.id,
        data: buffer.toBase64(update),
      });
    } else {
      // Chunk large update into slices
      const transferId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `xfer_${crypto.randomUUID()}`
          : `xfer_${Date.now().toString(36)}`;
      const totalChunks = Math.ceil(update.byteLength / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, update.byteLength);
        const slice = update.subarray(start, end);

        this.sendWireMessage({
          type: 'chunk',
          senderId: this.selfUser.id,
          transferId,
          chunkIndex: i,
          totalChunks,
          data: buffer.toBase64(slice),
        });
      }
    }
  }

  private sendSyncStep1() {
    const stateVector = Y.encodeStateVector(this.ydoc);
    this.sendWireMessage({
      type: 'sync-step-1',
      senderId: this.selfUser.id,
      data: buffer.toBase64(stateVector),
    });
  }

  private handleWireMessage(msg: YjsWireMessage) {
    if (!msg || msg.senderId === this.selfUser.id || this.isDestroyed) return;

    switch (msg.type) {
      case 'sync-step-1': {
        if (!msg.data) return;
        try {
          const peerVector = buffer.fromBase64(msg.data);
          const diffUpdate = Y.encodeStateAsUpdate(this.ydoc, peerVector);
          // Send back sync-step-2 with the missing updates
          if (diffUpdate.byteLength <= CHUNK_SIZE) {
            this.sendWireMessage({
              type: 'sync-step-2',
              senderId: this.selfUser.id,
              data: buffer.toBase64(diffUpdate),
            });
          } else {
            this.broadcastUpdate(diffUpdate);
          }
        } catch (err) {
          console.warn('[SupabaseYjsProvider] Error handling sync-step-1:', err);
        }
        break;
      }

      case 'sync-step-2':
      case 'update': {
        if (!msg.data) return;
        try {
          const update = buffer.fromBase64(msg.data);
          Y.applyUpdate(this.ydoc, update, this);
        } catch (err) {
          console.warn(`[SupabaseYjsProvider] Error applying ${msg.type}:`, err);
        }
        break;
      }

      case 'chunk': {
        if (!msg.transferId || msg.chunkIndex === undefined || !msg.totalChunks || !msg.data) return;
        let transfer = this.pendingChunkTransfers.get(msg.transferId);
        if (!transfer) {
          transfer = { total: msg.totalChunks, chunks: new Map() };
          this.pendingChunkTransfers.set(msg.transferId, transfer);
        }

        transfer.chunks.set(msg.chunkIndex, buffer.fromBase64(msg.data));

        if (transfer.chunks.size === transfer.total) {
          // Reassemble all slices
          let totalLength = 0;
          for (let i = 0; i < transfer.total; i++) {
            totalLength += transfer.chunks.get(i)?.byteLength || 0;
          }

          const completeUpdate = new Uint8Array(totalLength);
          let offset = 0;
          for (let i = 0; i < transfer.total; i++) {
            const chunk = transfer.chunks.get(i);
            if (chunk) {
              completeUpdate.set(chunk, offset);
              offset += chunk.byteLength;
            }
          }

          this.pendingChunkTransfers.delete(msg.transferId);
          try {
            Y.applyUpdate(this.ydoc, completeUpdate, this);
          } catch (err) {
            console.warn('[SupabaseYjsProvider] Error applying reassembled chunk update:', err);
          }
        }
        break;
      }

      case 'awareness': {
        if (!msg.data) return;
        try {
          const awarenessUpdate = buffer.fromBase64(msg.data);
          applyAwarenessUpdate(this.awareness, awarenessUpdate, this);
        } catch (err) {
          console.warn('[SupabaseYjsProvider] Error applying awareness update:', err);
        }
        break;
      }
    }
  }

  // ============================================================================
  // Awareness & Cursor Throttling
  // ============================================================================

  public setLocalCursor(fileId: string, line: number, col: number, anchor?: number, head?: number) {
    if (this.isDestroyed) return;

    this.awareness.setLocalStateField('clientCursor', {
      fileId,
      line,
      col,
      anchor,
      head,
      updatedAt: Date.now(),
    });
  }

  private throttleBroadcastAwareness() {
    const now = Date.now();
    const elapsed = now - this.lastAwarenessBroadcastTime;

    if (elapsed >= 60) {
      this.lastAwarenessBroadcastTime = now;
      this.doBroadcastAwareness();
    } else if (!this.pendingAwarenessTimer) {
      this.pendingAwarenessTimer = setTimeout(() => {
        this.pendingAwarenessTimer = null;
        this.lastAwarenessBroadcastTime = Date.now();
        this.doBroadcastAwareness();
      }, 60 - elapsed);
    }
  }

  private doBroadcastAwareness() {
    if (this.isDestroyed) return;
    try {
      const awarenessUpdate = encodeAwarenessUpdate(this.awareness, [this.ydoc.clientID]);
      this.sendWireMessage({
        type: 'awareness',
        senderId: this.selfUser.id,
        data: buffer.toBase64(awarenessUpdate),
      });
    } catch { }
  }

  // ============================================================================
  // Peer State & Presence Extraction
  // ============================================================================

  public onPeersChange(callback: (peers: Collaborator[]) => void): () => void {
    this.peerListeners.add(callback);
    callback(this.getConnectedPeers());
    return () => this.peerListeners.delete(callback);
  }

  private notifyPeerListeners() {
    const peers = this.getConnectedPeers();
    for (const listener of this.peerListeners) {
      listener(peers);
    }
  }

  public getConnectedPeers(): Collaborator[] {
    const states = this.awareness.getStates();
    const peers: Collaborator[] = [];
    const localId = this.ydoc.clientID;

    for (const [clientId, state] of states.entries()) {
      if (clientId === localId) continue;

      const user = state.user as { id?: string; name?: string; color?: string; avatar?: string } | undefined;
      const clientCursor = (state.clientCursor || (state.cursor && typeof state.cursor.line === 'number' ? state.cursor : undefined)) as PeerCursorInfo | undefined;

      if (user && user.name) {
        peers.push({
          id: user.id || `client_${clientId}`,
          name: user.name,
          color: user.color || '#38bdf8',
          avatar: user.avatar || user.name.substring(0, 2).toUpperCase(),
          cursorLine: (clientCursor && typeof clientCursor.line === 'number') ? clientCursor.line : 1,
          cursorCol: (clientCursor && typeof clientCursor.col === 'number') ? clientCursor.col : 1,
          activeFile: (clientCursor && typeof clientCursor.fileId === 'string') ? clientCursor.fileId : 'main.tex',
          status: 'active',
          isSelf: false,
        });
      }
    }

    return peers;
  }

  private syncPeersFromSupabasePresence() {
    if (!this.supabaseChannel) return;
    try {
      void this.supabaseChannel.presenceState();
      // Combine with local awareness states
      this.notifyPeerListeners();
    } catch { }
  }

  // ============================================================================
  // Debounced Persistence
  // ============================================================================

  private scheduleDocSave() {
    if (this.pendingDocSaveTimer) clearTimeout(this.pendingDocSaveTimer);
    this.pendingDocSaveTimer = setTimeout(() => {
      this.pendingDocSaveTimer = null;
      this.persistActiveFiles();
    }, 2000);
  }

  public persistActiveFiles() {
    if (this.isDestroyed || !this.onDocSaveCallback) return;

    // Build updated ProjectFile array from Y.Text contents
    const fileKeys = Array.from(this.ydoc.share.keys()).filter((k) => k.startsWith('file:'));
    const files: ProjectFile[] = [];

    for (const key of fileKeys) {
      const fileId = key.replace('file:', '');
      const ytext = this.ydoc.getText(key);
      const isBib = fileId.endsWith('.bib');
      files.push({
        id: fileId,
        name: fileId,
        content: ytext.toString(),
        type: isBib ? 'bib' : 'tex',
      });
    }

    if (files.length > 0) {
      this.onDocSaveCallback(files);
      this.saveSnapshotToCloud().catch(() => { });
    }
  }

  public async saveSnapshotToCloud() {
    const supabase = getSupabaseClient(this.shareToken);
    if (!supabase) return;

    const uid = await getAuthUid();
    // Allow saving if authenticated OR if holding an edit capability token
    if (!uid && (!this.shareToken || !this.shareToken.startsWith('ed_'))) return;

    try {
      const snapshot = buffer.toBase64(Y.encodeStateAsUpdate(this.ydoc));
      const stateVector = buffer.toBase64(Y.encodeStateVector(this.ydoc));

      await supabase.from('project_crdt_states').upsert(
        {
          project_id: this.projectId,
          snapshot,
          state_vector: stateVector,
          updated_at: new Date().toISOString(),
          updated_by: uid ?? null,
        },
        { onConflict: 'project_id' }
      );
    } catch (err) {
      // Quiet fail if table doesn't exist yet in remote Supabase
      console.warn('[SupabaseYjsProvider] Cloud snapshot save notice:', err);
    }
  }

  public async loadSnapshotFromCloud(): Promise<boolean> {
    const supabase = getSupabaseClient(this.shareToken);
    if (!supabase) return false;

    try {
      const { data, error } = await supabase
        .from('project_crdt_states')
        .select('snapshot')
        .eq('project_id', this.projectId)
        .maybeSingle();

      if (!error && data && data.snapshot) {
        const update = buffer.fromBase64(data.snapshot);
        Y.applyUpdate(this.ydoc, update, this);
        return true;
      }
    } catch (err) {
      console.warn('[SupabaseYjsProvider] Cloud snapshot load notice:', err);
    }
    return false;
  }

  // ============================================================================
  // Teardown & Lifecycle
  // ============================================================================

  public destroy() {
    this.isDestroyed = true;
    this.isChannelSubscribed = false;
    this.pendingWireMessages = [];

    if (this.pendingAwarenessTimer) {
      clearTimeout(this.pendingAwarenessTimer);
      this.pendingAwarenessTimer = null;
    }
    if (this.pendingDocSaveTimer) {
      clearTimeout(this.pendingDocSaveTimer);
      this.pendingDocSaveTimer = null;
    }

    try {
      this.awareness.destroy();
    } catch { }

    try {
      this.localBroadcast?.close();
    } catch { }

    try {
      if (this.supabaseChannel) {
        this.supabaseChannel.unsubscribe();
      }
    } catch { }

    this.peerListeners.clear();
    this.undoManagers.clear();
    this.pendingChunkTransfers.clear();
    this.ydoc.destroy();
  }
}
