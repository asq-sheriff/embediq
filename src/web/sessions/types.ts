import type { BudgetTier, DevOpsProfile, TeamSize, TechnicalProficiency, UserRole } from '../../types/index.js';
import type { WizardPhase } from '../../events/subscribers/status-reconciler.js';

export type { WizardPhase };

/** JSON-safe projection of an Answer. `Date` is serialized as an ISO string. */
export interface SerializedAnswer {
  questionId: string;
  value: string | string[] | number | boolean;
  timestamp: string;
  /**
   * Identifier of the user who supplied this answer at the time it was
   * recorded. Stamped server-side from the request context — the client
   * cannot set this. Used for multi-contributor audit attribution
   * (e.g. proving the compliance officer answered the regulatory
   * questions, not the developer).
   */
  contributedBy?: string;
}

/** JSON-safe projection of a Priority. Already primitive in the domain type. */
export interface SerializedPriority {
  name: string;
  confidence: number;
  derivedFrom: string[];
}

/**
 * JSON-safe projection of UserProfile. Mirrors the domain type but replaces
 * `Map<string, Answer>` with `Record<string, SerializedAnswer>` so the record
 * can be stored and rehydrated without custom reviver logic.
 */
export interface SerializedProfile {
  answers: Record<string, SerializedAnswer>;
  role: UserRole;
  technicalProficiency: TechnicalProficiency;
  businessDomain: string;
  industry: string;
  problemAreas: string[];
  techStack: string[];
  languages: string[];
  teamSize: TeamSize;
  devOps: DevOpsProfile;
  complianceFrameworks: string[];
  budgetTier: BudgetTier;
  securityConcerns: string[];
  hardwareProfile: Record<string, string>;
  priorities: SerializedPriority[];
}

export interface GenerationHistoryEntry {
  runId: string;
  timestamp: string;
  fileCount: number;
  validationPassed: boolean;
  targetDir: string;
}

/**
 * Canonical server-side record for a wizard session. Backends store this
 * shape verbatim. Fields marked optional reflect progression through the
 * wizard — `profile` exists only after the profile is built, etc.
 */
export interface WizardSession {
  sessionId: string;
  userId?: string;
  /** Signed token from the embediq_session_owner cookie when auth is off. */
  ownerToken?: string;
  templateId?: string;
  domainPackId?: string;
  phase: WizardPhase;
  currentDimension?: string;
  answers: Record<string, SerializedAnswer>;
  profile?: SerializedProfile;
  priorities?: SerializedPriority[];
  generationHistory: GenerationHistoryEntry[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  /** Monotonic counter bumped by the backend on every successful put. */
  version: number;
}

export interface SessionListFilter {
  userId?: string;
  updatedAfter?: string;
  limit?: number;
  cursor?: string;
}

export interface SessionListResult {
  sessions: WizardSession[];
  cursor?: string;
}

/** Compact projection returned by the admin list endpoint. */
export interface SessionSummary {
  sessionId: string;
  userId?: string;
  phase: WizardPhase;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export function summarize(session: WizardSession): SessionSummary {
  return {
    sessionId: session.sessionId,
    userId: session.userId,
    phase: session.phase,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
  };
}
