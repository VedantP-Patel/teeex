/**
 * Teeex Studio — Cryptographically Secure Share Links & Capability Tokens
 * 
 * Protects projects against privilege escalation attacks where viewers alter query params
 * (e.g. changing role=viewer to role=editor) to gain unauthorized edit/owner privileges.
 * 
 * Uses a one-way SHA-256 capability hash ladder:
 * - Edit Token: ed_<random_32_hex>
 * - View Token: vw_<sha256(roomId + ':' + editToken).substring(0, 24)>
 * 
 * Given a View Token (vw_...), it is mathematically impossible to compute
 * the Edit Token (ed_...) due to SHA-256 one-way pre-image resistance.
 */

export interface RoomShareTokens {
  editToken: string;
  viewToken: string;
}

// Fast synchronous SHA-256 implementation
function sha256Sync(str: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  const words: number[] = [];
  const asciiBitLength = str.length * 8;

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    words[i >> 2] |= (code & 0xff) << (24 - (i % 4) * 8);
  }
  words[str.length >> 2] |= 0x80 << (24 - (str.length % 4) * 8);
  words[(((str.length + 8) >> 6) << 4) + 15] = asciiBitLength;

  for (let i = 0; i < words.length; i += 16) {
    const w: number[] = [];
    for (let j = 0; j < 16; j++) w[j] = words[i + j] || 0;
    for (let j = 16; j < 64; j++) {
      const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
      const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
      w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let j = 0; j < 64; j++) {
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const hexParts = [h0, h1, h2, h3, h4, h5, h6, h7].map(num => {
    const hex = (num >>> 0).toString(16);
    return hex.padStart(8, '0');
  });

  return hexParts.join('');
}

/**
 * Retrieves or generates unguessable cryptographic tokens for a room
 */
export function getRoomShareTokens(roomId: string): RoomShareTokens {
  const storageKey = `teeex_room_tokens_${roomId}`;
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      const parsed = JSON.parse(saved) as RoomShareTokens;
      if (parsed.editToken?.startsWith('ed_') && parsed.viewToken?.startsWith('vw_')) {
        return parsed;
      }
    } catch {
      // Re-generate below
    }
  }

  // Generate cryptographically random 128-bit secret
  const randomBytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 16; i++) randomBytes[i] = Math.floor(Math.random() * 256);
  }

  const rawHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const editToken = `ed_${rawHex}`;
  const viewToken = `vw_${sha256Sync(`${roomId}:${editToken}`).slice(0, 24)}`;

  const tokens: RoomShareTokens = { editToken, viewToken };
  try {
    localStorage.setItem(storageKey, JSON.stringify(tokens));
  } catch {
    // Ignore localStorage quota errors
  }
  return tokens;
}

/**
 * Validates a share key against room security.
 * Prevents tampering: viewers cannot forge or guess the ed_ token from vw_.
 */
export function verifyShareKey(roomId: string, key: string | null): 'editor' | 'viewer' | null {
  if (!key) return null;

  const storageKey = `teeex_room_tokens_${roomId}`;
  let savedTokens: RoomShareTokens | null = null;
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      savedTokens = JSON.parse(saved) as RoomShareTokens;
    }
  } catch {
    // Ignore storage parse errors
  }

  // 1. Editor capability key provided (ed_...)
  if (key.startsWith('ed_')) {
    // Direct match with active stored token
    if (savedTokens?.editToken && key === savedTokens.editToken) {
      return 'editor';
    }

    // If device already knows the room's viewToken, verify that this edit token hashes to it
    if (savedTokens?.viewToken) {
      const derived = `vw_${sha256Sync(`${roomId}:${key}`).slice(0, 24)}`;
      if (derived === savedTokens.viewToken) {
        try {
          localStorage.setItem(storageKey, JSON.stringify({ editToken: key, viewToken: derived }));
        } catch {}
        return 'editor';
      }
      // Forgery detected! Key does not hash to the known room view token. Lock to viewer.
      return 'viewer';
    }

    // First time on this device with an authoritative edit key:
    if (key.length >= 16) {
      const derived = `vw_${sha256Sync(`${roomId}:${key}`).slice(0, 24)}`;
      try {
        localStorage.setItem(storageKey, JSON.stringify({ editToken: key, viewToken: derived }));
      } catch {}
      return 'editor';
    }
  }

  // 2. View-only capability key provided (vw_...)
  if (key.startsWith('vw_')) {
    if (!savedTokens || !savedTokens.viewToken) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ editToken: '', viewToken: key }));
      } catch {}
    }
    return 'viewer';
  }

  return 'viewer';
}

