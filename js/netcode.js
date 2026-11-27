import { createEmptyInput } from './engine.js';
import { packInput, unpackInput } from './input.js';

const PEER_PREFIX = 'streetbrawl-room-';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * WebRTC P2P Online Mabar controller using PeerJS.
 * Host runs authoritative 60Hz FightingEngine and broadcasts snapshots + events.
 * Guest sends packed input bitmask at 60Hz and renders synced state smoothly.
 */
export class OnlineMabar {
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.peer = null;
    this.conn = null;
    this.role = null; // 'host' | 'guest'
    this.roomCode = '';
    this.connected = false;
    this.remoteInput = createEmptyInput();
    this.pingMs = 0;
    this.pingInterval = null;
  }

  ensurePeerLib() {
    if (typeof window === 'undefined' || !window.Peer) {
      throw new Error('PeerJS belum termuat. Cek koneksi internet kamu.');
    }
  }

  destroy() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.peer = null;
    this.conn = null;
    this.connected = false;
    this.role = null;
    this.remoteInput = createEmptyInput();
  }

  createRoom() {
    this.destroy();
    this.ensurePeerLib();
    this.role = 'host';
    this.roomCode = generateRoomCode();
    const peerId = PEER_PREFIX + this.roomCode;

    return new Promise((resolve, reject) => {
      this.peer = new window.Peer(peerId, { debug: 0 });
      this.peer.on('open', () => {
        this.cb.onStatus?.(`Room siap! Kode: ${this.roomCode} — menunggu lawan...`);
        resolve(this.roomCode);
      });
      this.peer.on('connection', (conn) => {
        if (this.conn && this.connected) {
          conn.close();
          return;
        }
        this.setupConnection(conn);
      });
      this.peer.on('error', (err) => {
        this.cb.onError?.(err.message || 'Gagal membuat room online');
        reject(err);
      });
    });
  }

  joinRoom(rawCode) {
    this.destroy();
    this.ensurePeerLib();
    const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) {
      return Promise.reject(new Error('Kode room harus 4 karakter (contoh: 4K9X)'));
    }
    this.role = 'guest';
    this.roomCode = code;
    const hostPeerId = PEER_PREFIX + code;

    return new Promise((resolve, reject) => {
      this.peer = new window.Peer(undefined, { debug: 0 });
      this.peer.on('open', () => {
        this.cb.onStatus?.(`Menghubungkan ke room ${code}...`);
        const conn = this.peer.connect(hostPeerId, { reliable: false });
        this.setupConnection(conn, resolve, reject);
      });
      this.peer.on('error', (err) => {
        this.cb.onError?.(err.message || 'Room tidak ditemukan');
        reject(err);
      });
    });
  }

  setupConnection(conn, onOpenResolve, onOpenReject) {
    this.conn = conn;
    conn.on('open', () => {
      this.connected = true;
      this.cb.onStatus?.('Terhubung! Siap pilih karakter.');
      this.cb.onConnected?.(this.role);
      this.startPingLoop();
      onOpenResolve?.(this.roomCode);
    });
    conn.on('data', (msg) => this.handleMessage(msg));
    conn.on('close', () => {
      this.connected = false;
      this.cb.onDisconnected?.();
    });
    conn.on('error', (err) => {
      this.cb.onError?.(err.message || 'Koneksi terputus');
      onOpenReject?.(err);
    });
  }

  startPingLoop() {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (!this.connected) return;
      this.send({ t: 'ping', ts: Date.now() });
    }, 2000);
  }

  send(payload) {
    if (!this.conn || !this.connected) return;
    try {
      this.conn.send(payload);
    } catch {}
  }

  sendFighterSelect(fighter, stageId) {
    this.send({ t: 'select', fighter, stageId });
  }

  sendStartMatch(p1Fighter, p2Fighter, stageId) {
    this.send({ t: 'start_match', p1Fighter, p2Fighter, stageId });
  }

  sendInput(input) {
    this.send({ t: 'inp', b: packInput(input) });
  }

  sendState(snapshot, events) {
    this.send({ t: 'state', s: snapshot, e: events });
  }

  sendRematch() {
    this.send({ t: 'rematch' });
  }

  handleMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'ping':
        this.send({ t: 'pong', ts: msg.ts });
        break;
      case 'pong':
        this.pingMs = Math.max(1, Math.round((Date.now() - msg.ts) / 2));
        this.cb.onPing?.(this.pingMs);
        break;
      case 'select':
        this.cb.onRemoteSelect?.(msg.fighter, msg.stageId);
        break;
      case 'start_match':
        if (this.role === 'guest') {
          this.cb.onStartMatch?.(msg.p1Fighter, msg.p2Fighter, msg.stageId);
        }
        break;
      case 'inp':
        if (this.role === 'host') {
          this.remoteInput = unpackInput(msg.b || 0);
        }
        break;
      case 'state':
        if (this.role === 'guest') {
          this.cb.onStateSync?.(msg.s, msg.e || []);
        }
        break;
      case 'rematch':
        this.cb.onRematch?.();
        break;
    }
  }
}
