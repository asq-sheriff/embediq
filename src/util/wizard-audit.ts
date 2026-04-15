import { appendFileSync } from 'node:fs';

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

  try {
    const line = JSON.stringify({
      ...entry,
      timestamp: entry.timestamp || new Date().toISOString(),
    });
    appendFileSync(AUDIT_LOG_PATH, line + '\n', 'utf-8');
  } catch (err) {
    console.error('Wizard audit log write failed:', err);
  }
}
