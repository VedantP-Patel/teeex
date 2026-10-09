/**
 * Teeex Studio — Project Security & Activity Audit Log Service
 */

import type { AuditLogEntry } from '../types/latex';

const AUDIT_STORAGE_PREFIX = 'teeex_audit_';

export function getAuditLogs(projectId: string): AuditLogEntry[] {
  try {
    const raw = localStorage.getItem(`${AUDIT_STORAGE_PREFIX}${projectId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function logAuditAction(
  projectId: string,
  action: string,
  detail: string,
  userName: string,
  userRole: string,
  category: AuditLogEntry['category'] = 'document'
): void {
  try {
    const logs = getAuditLogs(projectId);
    const newEntry: AuditLogEntry = {
      id: 'audit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      projectId,
      action,
      detail,
      timestamp: new Date().toISOString(),
      userName,
      userRole,
      category,
    };
    logs.unshift(newEntry);
    // Keep max 150 entries per project
    const trimmed = logs.slice(0, 150);
    localStorage.setItem(`${AUDIT_STORAGE_PREFIX}${projectId}`, JSON.stringify(trimmed));
  } catch (err) {
    console.warn('Failed to record audit log:', err);
  }
}
