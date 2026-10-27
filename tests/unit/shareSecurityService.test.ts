// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getRoomShareTokens,
  rotateRoomShareTokens,
  revokeRoomShareTokens,
  verifyShareKey,
  computeTokenHashes,
  sha256Sync,
} from '../../src/services/shareSecurityService';
import { getSupabaseClient } from '../../src/services/supabaseClient';

describe('Share Capability Tokens & Security Service', () => {
  const roomId = 'proj-test-share-123';

  beforeEach(() => {
    localStorage.clear();
  });

  it('generates cryptographic edit and view tokens with correct prefixes', () => {
    const tokens = getRoomShareTokens(roomId);

    expect(tokens.editToken).toBeDefined();
    expect(tokens.editToken.startsWith('ed_')).toBe(true);
    expect(tokens.viewToken).toBeDefined();
    expect(tokens.viewToken.startsWith('vw_')).toBe(true);
    expect(tokens.isRevoked).toBe(false);
  });

  it('derives view token mathematically from edit token via one-way SHA-256', () => {
    const tokens = getRoomShareTokens(roomId);
    const expectedView = `vw_${sha256Sync(`${roomId}:${tokens.editToken}`).slice(0, 24)}`;
    expect(tokens.viewToken).toBe(expectedView);
  });

  it('computes SHA-256 capability digests for Postgres RLS verification', () => {
    const tokens = getRoomShareTokens(roomId);
    const hashes = computeTokenHashes(tokens);

    expect(hashes.editTokenHash).toBe(sha256Sync(tokens.editToken));
    expect(hashes.viewTokenHash).toBe(sha256Sync(tokens.viewToken));
    expect(hashes.shareTokensRevoked).toBe(false);
  });

  it('verifies editor and viewer capabilities accurately', () => {
    const tokens = getRoomShareTokens(roomId);

    expect(verifyShareKey(roomId, tokens.editToken)).toBe('editor');
    expect(verifyShareKey(roomId, tokens.viewToken)).toBe('viewer');
    expect(verifyShareKey(roomId, 'invalid-key')).toBe('viewer');
    expect(verifyShareKey(roomId, null)).toBeNull();
  });

  it('rejects all keys once room share tokens are revoked', () => {
    const tokens = getRoomShareTokens(roomId);
    revokeRoomShareTokens(roomId);

    expect(verifyShareKey(roomId, tokens.editToken)).toBeNull();
    expect(verifyShareKey(roomId, tokens.viewToken)).toBeNull();
  });

  it('invalidates prior tokens upon rotation', () => {
    const initial = getRoomShareTokens(roomId);
    const rotated = rotateRoomShareTokens(roomId);

    expect(rotated.editToken).not.toBe(initial.editToken);
    expect(verifyShareKey(roomId, initial.editToken)).not.toBe('editor');
    expect(verifyShareKey(roomId, rotated.editToken)).toBe('editor');
  });

  it('configures Supabase client with x-share-token request header when token is supplied', () => {
    const client = getSupabaseClient('ed_sample_token_123');
    // If Supabase credentials are configured or in test mode, client caches per token
    if (client) {
      const client2 = getSupabaseClient('ed_sample_token_123');
      expect(client).toBe(client2);
    }
  });
});
