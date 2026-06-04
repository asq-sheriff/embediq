import type { Request } from 'express';
import type { AuthStrategy, AuthResult } from '../auth.js';

/**
 * DEMO-ONLY auth strategy. Returns one of two preset users (admin / user)
 * based on a cookie (`embediq_demo_user`) or query param (`?demo-user=`).
 * Lets demo recordings show the admin/user distinction without standing up
 * an enterprise IdP.
 *
 * NEVER use in production. The "auth" is opt-in via cookie value — anyone
 * can claim any role. Activated only when `EMBEDIQ_AUTH_STRATEGY=demo`.
 *
 * The two preset users:
 *   - `admin` → roles: ['wizard-admin'], grants full configuration access
 *   - `user`  → roles: ['wizard-user'],  grants read + run access only
 */
export class DemoAuthStrategy implements AuthStrategy {
  name = 'demo';

  async authenticate(req: Request): Promise<AuthResult> {
    // Priority: query param > cookie. Both let the user switch personas
    // mid-session for demo purposes.
    const queryParam = (req.query['demo-user'] as string | undefined)?.toLowerCase();
    const cookieHeader = req.headers.cookie || '';
    const cookieMatch = cookieHeader.match(/embediq_demo_user=([^;]+)/);
    const cookieValue = cookieMatch ? decodeURIComponent(cookieMatch[1]).toLowerCase() : '';

    const persona = queryParam || cookieValue;

    if (persona === 'admin') {
      return {
        authenticated: true,
        userId: 'admin@acmecorp.com',
        displayName: 'ACME Admin',
        email: 'admin@acmecorp.com',
        roles: ['wizard-admin'],
        groups: ['wizard-admin'],
        source: 'demo',
      };
    }

    if (persona === 'user') {
      return {
        authenticated: true,
        userId: 'user@acmecorp.com',
        displayName: 'ACME User',
        email: 'user@acmecorp.com',
        roles: ['wizard-user'],
        groups: ['wizard-user'],
        source: 'demo',
      };
    }

    // No persona chosen — unauthenticated, the UI surfaces the persona switcher.
    return {
      authenticated: false,
      userId: '',
      displayName: '',
      roles: [],
      groups: [],
      source: 'demo',
    };
  }
}
