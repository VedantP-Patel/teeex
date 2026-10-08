import type { Collaborator } from '../types/latex';

export interface RoomSyncMessage {
  type: 'FILE_UPDATE' | 'CURSOR_MOVE' | 'PEER_JOIN' | 'PEER_LEAVE';
  roomId: string;
  senderId: string;
  senderName: string;
  senderColor: string;
  fileId?: string;
  content?: string;
  cursorLine?: number;
  cursorCol?: number;
}

const PEER_COLORS = [
  '#38BDF8', // Sky Cyan
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#EC4899', // Pink
  '#8B5CF6', // Purple
  '#14B8A6', // Teal
];

export class CollaborationHub {
  private channel: BroadcastChannel | null = null;
  private roomId: string;
  public selfUser: Collaborator;
  private listeners: Array<(msg: RoomSyncMessage) => void> = [];

  constructor(roomId: string, initialUserName?: string) {
    this.roomId = roomId;
    const randomColor = PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)];
    const savedName = localStorage.getItem('teeex_user_name') || initialUserName || `Author ${Math.floor(Math.random() * 900 + 100)}`;
    const userId = 'user_' + Math.random().toString(36).substring(2, 9);

    this.selfUser = {
      id: userId,
      name: savedName,
      color: randomColor,
      avatar: savedName.substring(0, 2).toUpperCase(),
      cursorLine: 1,
      cursorCol: 1,
      activeFile: 'main.tex',
      status: 'active',
      isSelf: true,
    };

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(`teeex_room_${roomId}`);
        this.channel.onmessage = (event) => {
          const msg = event.data as RoomSyncMessage;
          if (msg.senderId !== this.selfUser.id) {
            this.notifyListeners(msg);
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported or restricted', e);
      }
    }
  }

  public onMessage(callback: (msg: RoomSyncMessage) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  private notifyListeners(msg: RoomSyncMessage) {
    for (const listener of this.listeners) {
      listener(msg);
    }
  }

  public broadcastFileUpdate(fileId: string, content: string) {
    const msg: RoomSyncMessage = {
      type: 'FILE_UPDATE',
      roomId: this.roomId,
      senderId: this.selfUser.id,
      senderName: this.selfUser.name,
      senderColor: this.selfUser.color,
      fileId,
      content,
    };
    this.channel?.postMessage(msg);
  }

  public broadcastCursor(fileId: string, line: number, col: number) {
    this.selfUser.cursorLine = line;
    this.selfUser.cursorCol = col;
    this.selfUser.activeFile = fileId;

    const msg: RoomSyncMessage = {
      type: 'CURSOR_MOVE',
      roomId: this.roomId,
      senderId: this.selfUser.id,
      senderName: this.selfUser.name,
      senderColor: this.selfUser.color,
      fileId,
      cursorLine: line,
      cursorCol: col,
    };
    this.channel?.postMessage(msg);
  }

  public destroy() {
    this.channel?.close();
    this.listeners = [];
  }
}

/**
 * Default Simulated Co-Authors for Rich Multiplayer Demo Experience
 */
export const DEFAULT_PEERS: Collaborator[] = [
  {
    id: 'peer-elena',
    name: 'Dr. Elena Rostova',
    color: '#10B981', // Emerald
    avatar: 'ER',
    cursorLine: 18,
    cursorCol: 14,
    activeFile: 'main.tex',
    status: 'typing',
  },
  {
    id: 'peer-marcus',
    name: 'Marcus Chen',
    color: '#F59E0B', // Amber
    avatar: 'MC',
    cursorLine: 29,
    cursorCol: 2,
    activeFile: 'main.tex',
    status: 'active',
  }
];
