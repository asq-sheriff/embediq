import { appendFileSync } from 'node:fs';
import { getRequestContext } from '../context/request-context.js';

export interface WizardAuditEntry {
  timestamp: string;
  eventType:
    | 'session_start'
    | 'profile_built'
    | 'validation_result'
    | 'generation_started'
    | 'file_written'
    | 'session_complete'
    | 'session_error';
  userId?: string;
  requestId?: string;
  profileSummary?: {
    role: string;
    industry: string;
    teamSize: string;
    complianceFrameworks: string[];
    securityLevel: string;
    fileCount: number;
  };
  filePath?: string;
  fileSize?: number;
  diffStatus?: string;
  validationPassed?: boolean;
  validationErrorCount?: number;
  errorMessage?: string;
}

export function auditLog(entry: WizardAuditEntry): void {
  const AUDIT_LOG_PATH = process.env.EMBEDIQ_AUDIT_LOG;
  if (!AUDIT_LOG_PATH) return;

  // Auto-enrich from request context when available (web server mode).
  // Explicit entry values take precedence over context values.
  const ctx = getRequestContext();
  const enriched = {
    ...entry,
    timestamp: entry.timestamp || new Date().toISOString(),
    userId: entry.userId ?? ctx?.userId,
    requestId: entry.requestId ?? ctx?.requestId,
  };

  try {
    const line = JSON.stringify(enriched);
    appendFileSync(AUDIT_LOG_PATH, line + '\n', 'utf-8');
  } catch (err) {
    console.error('Wizard audit log write failed:', err);
  }
}
