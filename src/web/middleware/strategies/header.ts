import type { Request } from 'express';
import type { AuthStrategy, AuthResult } from '../auth.js';

export interface ProxyHeaderConfig {
  userHeader: string;
  rolesHeader: string;
}

export class ProxyHeaderStrategy implements AuthStrategy {
  name = 'proxy';

  constructor(private config: ProxyHeaderConfig) {}

  async authenticate(req: Request): Promise<AuthResult> {
    const userId = req.headers[this.config.userHeader.toLowerCase()] as string | undefined;

    if (!userId) {
      return { authenticated: false, userId: '', displayName: '', roles: [], groups: [], source: 'proxy' };
    }

    const rolesRaw = req.headers[this.config.rolesHeader.toLowerCase()] as string | undefined;
    const roles = rolesRaw ? rolesRaw.split(',').map(r => r.trim()) : ['wizard-user'];

    return {
      authenticated: true,
      userId,
      displayName: userId,
      roles,
      groups: [],
      source: 'proxy',
    };
  }
}
