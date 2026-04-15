import type { Request } from 'express';
import type { AuthStrategy, AuthResult } from '../auth.js';

export interface OidcConfig {
  issuerUrl: string;
  clientId: string;
  clientSecret: string;
  rolesClaim: string;
}

/**
 * OIDC auth strategy stub.
 *
 * Full implementation requires the `openid-client` package. This stub
 * validates the presence of a Bearer token and decodes its payload
 * without cryptographic verification — suitable for development behind
 * a trusted reverse proxy that has already validated the token.
 *
 * For production, replace the authenticate() body with proper
 * openid-client token introspection or JWKS validation.
 */
export class OidcAuthStrategy implements AuthStrategy {
  name = 'oidc';

  constructor(private config: OidcConfig) {}

  async authenticate(req: Request): Promise<AuthResult> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return { authenticated: false, userId: '', displayName: '', roles: [], groups: [], source: 'oidc' };
    }

    const token = header.slice(7);

    try {
      // Decode JWT payload (no verification — see class doc)
      const payloadB64 = token.split('.')[1];
      if (!payloadB64) {
        return { authenticated: false, userId: '', displayName: '', roles: [], groups: [], source: 'oidc' };
      }

      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

      const roles = Array.isArray(payload[this.config.rolesClaim])
        ? payload[this.config.rolesClaim]
        : ['wizard-user'];

      return {
        authenticated: true,
        userId: payload.sub || payload.email || 'unknown',
        displayName: payload.name || payload.preferred_username || payload.sub || 'unknown',
        email: payload.email,
        roles,
        groups: payload.groups || [],
        source: 'oidc',
      };
    } catch {
      return { authenticated: false, userId: '', displayName: '', roles: [], groups: [], source: 'oidc' };
    }
  }
}
