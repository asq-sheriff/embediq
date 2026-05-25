import type { Request, Response, NextFunction } from 'express';

/**
 * Three-tier role hierarchy. Higher number = strictly more privileged.
 * Any role above the required tier is allowed; any role at the same
 * tier is allowed. Unknown roles fall back to literal-match semantics,
 * which preserves behavior for custom roles emitted by external auth
 * strategies (e.g. OIDC group mappings outside the EmbedIQ namespace).
 *
 *   wizard-viewer     1  — read-only on generations, audit, skills, autopilot
 *   wizard-user       2  — legacy alias for wizard-contributor; existing
 *                          deployments emit this from basic/oidc/header today
 *   wizard-contributor 2 — run the wizard, open PRs, manage own sessions,
 *                          create/edit autopilot schedules
 *   wizard-admin      3  — key rotation, all-sessions visibility, all-schedule
 *                          management
 */
export const ROLE_HIERARCHY = Object.freeze({
  'wizard-viewer': 1,
  'wizard-user': 2,
  'wizard-contributor': 2,
  'wizard-admin': 3,
} as Record<string, number>);

export const KNOWN_ROLES: readonly string[] = Object.keys(ROLE_HIERARCHY);

/** Convenience for callers that need to recognize any EmbedIQ-namespaced role. */
export function isEmbediqRole(role: string): boolean {
  return Object.prototype.hasOwnProperty.call(ROLE_HIERARCHY, role);
}

/** Highest hierarchy level represented by the supplied roles. Zero if none match. */
export function effectiveRoleLevel(roles: readonly string[]): number {
  let max = 0;
  for (const r of roles) {
    const level = ROLE_HIERARCHY[r];
    if (level !== undefined && level > max) max = level;
  }
  return max;
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.embediqUser;

    // If no auth middleware is active, allow all access.
    // This preserves the existing "no auth = full access" behavior.
    if (!user) {
      next();
      return;
    }

    const required = ROLE_HIERARCHY[role];

    if (required === undefined) {
      // Unknown role — preserve the legacy literal-match path so custom
      // (non-EmbedIQ-namespace) roles from external strategies still work.
      if (user.roles.includes(role) || user.roles.includes('wizard-admin')) {
        next();
        return;
      }
    } else if (effectiveRoleLevel(user.roles) >= required) {
      next();
      return;
    }

    res.status(403).json({
      error: `Insufficient permissions. Required role: ${role}`,
      currentRoles: user.roles,
    });
  };
}
