import type { Request } from 'express';
import type { AuthStrategy, AuthResult } from '../auth.js';

export class BasicAuthStrategy implements AuthStrategy {
  name = 'basic';

  constructor(
    private username: string,
    private password: string,
  ) {}

  async authenticate(req: Request): Promise<AuthResult> {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Basic ')) {
      return { authenticated: false, userId: '', displayName: '', roles: [], groups: [], source: 'basic' };
    }

    const credentials = Buffer.from(header.slice(6), 'base64').toString();
    const [user, pass] = credentials.split(':');

    if (user === this.username && pass === this.password) {
      return {
        authenticated: true,
        userId: user,
        displayName: user,
        roles: ['wizard-user', 'wizard-admin'],
        groups: [],
        source: 'basic',
      };
    }

    return { authenticated: false, userId: '', displayName: '', roles: [], groups: [], source: 'basic' };
  }
}
