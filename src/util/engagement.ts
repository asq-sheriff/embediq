/**
 * Per-engagement state scoping for self-hosted multi-engagement deployments.
 *
 * When `EMBEDIQ_ENGAGEMENT_ID` is set, default state paths
 * (sessions, autopilot, etc.) are nested under
 * `.embediq/engagements/<id>/`. Explicit env-var paths
 * (`EMBEDIQ_SESSION_DIR`, `EMBEDIQ_AUTOPILOT_DIR`, …) always take
 * precedence — engagement scoping never second-guesses a path the
 * operator has set explicitly.
 *
 * One engagement per process; multiple engagements means multiple
 * processes. Per-request engagement switching is not supported.
 */

const ENGAGEMENT_ID_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;
const EMBEDIQ_DIR_SEGMENT = '.embediq';
const ENGAGEMENTS_DIR_SEGMENT = 'engagements';

/**
 * Read `EMBEDIQ_ENGAGEMENT_ID` from the environment. Returns undefined
 * when unset or empty. Throws when set to a value containing path
 * separators, traversal sequences, or characters outside the allowed
 * set — fail fast at startup rather than letting a malformed ID leak
 * into directory names.
 */
export function resolveEngagementId(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env.EMBEDIQ_ENGAGEMENT_ID?.trim();
  if (!raw) return undefined;
  if (!ENGAGEMENT_ID_PATTERN.test(raw) || /^\.+$/.test(raw)) {
    throw new Error(
      `EMBEDIQ_ENGAGEMENT_ID="${raw}" is not a valid engagement identifier. ` +
        `Allowed characters: letters, digits, '.', '_', '-' (max 64 chars; ` +
        `not all-dots). Path separators and traversal sequences are rejected.`,
    );
  }
  return raw;
}

/**
 * Apply engagement scoping to a default state path. When engagementId
 * is undefined, the path is returned unchanged. Otherwise an
 * `engagements/<id>` segment is inserted immediately after the
 * `.embediq` segment if one is present in the path, or prepended
 * before the final segment otherwise.
 *
 * Example: `./.embediq/sessions` + `acme-q4` → `./.embediq/engagements/acme-q4/sessions`.
 * Example: `./state/sessions`     + `acme-q4` → `./state/engagements/acme-q4/sessions`.
 */
export function withEngagementSubpath(
  defaultPath: string,
  engagementId: string | undefined,
): string {
  if (!engagementId) return defaultPath;

  const segments = defaultPath.split('/');
  const embediqIdx = segments.lastIndexOf(EMBEDIQ_DIR_SEGMENT);
  if (embediqIdx >= 0) {
    segments.splice(embediqIdx + 1, 0, ENGAGEMENTS_DIR_SEGMENT, engagementId);
    return segments.join('/');
  }

  if (segments.length <= 1) {
    return `${ENGAGEMENTS_DIR_SEGMENT}/${engagementId}/${defaultPath}`;
  }
  const lastSegment = segments.pop() as string;
  return `${segments.join('/')}/${ENGAGEMENTS_DIR_SEGMENT}/${engagementId}/${lastSegment}`;
}
