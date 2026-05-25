import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createAuthMiddleware } from '../../src/web/middleware/auth.js';
import { requireRole } from '../../src/web/middleware/rbac.js';
import { BasicAuthStrategy } from '../../src/web/middleware/strategies/basic.js';
import { ProxyHeaderStrategy } from '../../src/web/middleware/strategies/header.js';
import { OidcAuthStrategy } from '../../src/web/middleware/strategies/oidc.js';

function createTestApp(strategy: ConstructorParameters<typeof BasicAuthStrategy> extends never[] ? never : unknown) {
  const app = express();
  return app;
}

describe('BasicAuthStrategy', () => {
  function buildApp() {
    const app = express();
    app.use(createAuthMiddleware(new BasicAuthStrategy('admin', 'secret')));
    app.get('/test', (req, res) => res.json({ user: req.embediqUser }));
    return app;
  }

  it('returns 401 without credentials', async () => {
    const res = await request(buildApp()).get('/test');
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong credentials', async () => {
    const res = await request(buildApp())
      .get('/test')
      .auth('admin', 'wrong');
    expect(res.status).toBe(401);
  });

  it('authenticates with correct credentials', async () => {
    const res = await request(buildApp())
      .get('/test')
      .auth('admin', 'secret');
    expect(res.status).toBe(200);
    expect(res.body.user.authenticated).toBe(true);
    expect(res.body.user.userId).toBe('admin');
    expect(res.body.user.roles).toContain('wizard-user');
    expect(res.body.user.roles).toContain('wizard-admin');
    expect(res.body.user.source).toBe('basic');
  });
});

describe('ProxyHeaderStrategy', () => {
  function buildApp() {
    const app = express();
    app.use(createAuthMiddleware(new ProxyHeaderStrategy({
      userHeader: 'X-Forwarded-User',
      rolesHeader: 'X-EmbedIQ-Roles',
    })));
    app.get('/test', (req, res) => res.json({ user: req.embediqUser }));
    return app;
  }

  it('returns 401 without user header', async () => {
    const res = await request(buildApp()).get('/test');
    expect(res.status).toBe(401);
  });

  it('authenticates with user header, defaults to wizard-user role', async () => {
    const res = await request(buildApp())
      .get('/test')
      .set('X-Forwarded-User', 'jane.doe');
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe('jane.doe');
    expect(res.body.user.roles).toEqual(['wizard-user']);
  });

  it('uses roles from header when provided', async () => {
    const res = await request(buildApp())
      .get('/test')
      .set('X-Forwarded-User', 'jane.doe')
      .set('X-EmbedIQ-Roles', 'wizard-user, wizard-admin');
    expect(res.status).toBe(200);
    expect(res.body.user.roles).toEqual(['wizard-user', 'wizard-admin']);
  });
});

describe('OidcAuthStrategy', () => {
  function buildApp() {
    const app = express();
    app.use(createAuthMiddleware(new OidcAuthStrategy({
      issuerUrl: 'https://example.com',
      clientId: 'test',
      clientSecret: 'test',
      rolesClaim: 'roles',
    })));
    app.get('/test', (req, res) => res.json({ user: req.embediqUser }));
    return app;
  }

  function makeJwt(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${header}.${body}.nosig`;
  }

  it('returns 401 without Bearer token', async () => {
    const res = await request(buildApp()).get('/test');
    expect(res.status).toBe(401);
  });

  it('authenticates with valid JWT payload', async () => {
    const token = makeJwt({ sub: 'user123', name: 'Test User', email: 'test@example.com', roles: ['wizard-user'] });
    const res = await request(buildApp())
      .get('/test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.userId).toBe('user123');
    expect(res.body.user.displayName).toBe('Test User');
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user.roles).toEqual(['wizard-user']);
  });

  it('defaults to wizard-user when roles claim is missing', async () => {
    const token = makeJwt({ sub: 'user123' });
    const res = await request(buildApp())
      .get('/test')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.roles).toEqual(['wizard-user']);
  });

  it('returns 401 for malformed token', async () => {
    const res = await request(buildApp())
      .get('/test')
      .set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });
});

describe('requireRole', () => {
  function buildApp(userRoles: string[] | null) {
    const app = express();
    if (userRoles !== null) {
      app.use((req, _res, next) => {
        req.embediqUser = {
          authenticated: true,
          userId: 'test',
          displayName: 'Test',
          roles: userRoles,
          groups: [],
          source: 'test',
        };
        next();
      });
    }
    app.get('/admin', requireRole('wizard-admin'), (_req, res) => res.json({ ok: true }));
    app.get('/user', requireRole('wizard-user'), (_req, res) => res.json({ ok: true }));
    return app;
  }

  it('allows access when no auth is configured (user is null)', async () => {
    const res = await request(buildApp(null)).get('/admin');
    expect(res.status).toBe(200);
  });

  it('allows access when user has the required role', async () => {
    const res = await request(buildApp(['wizard-admin'])).get('/admin');
    expect(res.status).toBe(200);
  });

  it('allows wizard-admin to access wizard-user routes', async () => {
    const res = await request(buildApp(['wizard-admin'])).get('/user');
    expect(res.status).toBe(200);
  });

  it('denies access when user lacks the required role', async () => {
    const res = await request(buildApp(['wizard-user'])).get('/admin');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Insufficient permissions');
  });

  // Three-tier hierarchy: viewer < user/contributor < admin
  describe('three-tier hierarchy', () => {
    function appWith(roles: string[] | null) {
      const app = express();
      if (roles !== null) {
        app.use((req, _res, next) => {
          req.embediqUser = {
            authenticated: true,
            userId: 'tier-test',
            displayName: 'Tier',
            roles,
            groups: [],
            source: 'test',
          };
          next();
        });
      }
      app.get('/viewer', requireRole('wizard-viewer'), (_req, res) => res.json({ ok: true }));
      app.get('/contributor', requireRole('wizard-contributor'), (_req, res) => res.json({ ok: true }));
      app.get('/admin', requireRole('wizard-admin'), (_req, res) => res.json({ ok: true }));
      app.get('/legacy-user', requireRole('wizard-user'), (_req, res) => res.json({ ok: true }));
      return app;
    }

    it('viewer can read viewer routes but not contributor or admin', async () => {
      expect((await request(appWith(['wizard-viewer'])).get('/viewer')).status).toBe(200);
      expect((await request(appWith(['wizard-viewer'])).get('/contributor')).status).toBe(403);
      expect((await request(appWith(['wizard-viewer'])).get('/admin')).status).toBe(403);
    });

    it('contributor can read viewer + contributor routes but not admin', async () => {
      expect((await request(appWith(['wizard-contributor'])).get('/viewer')).status).toBe(200);
      expect((await request(appWith(['wizard-contributor'])).get('/contributor')).status).toBe(200);
      expect((await request(appWith(['wizard-contributor'])).get('/admin')).status).toBe(403);
    });

    it('admin can read every tier', async () => {
      expect((await request(appWith(['wizard-admin'])).get('/viewer')).status).toBe(200);
      expect((await request(appWith(['wizard-admin'])).get('/contributor')).status).toBe(200);
      expect((await request(appWith(['wizard-admin'])).get('/admin')).status).toBe(200);
    });

    it('legacy wizard-user role is treated as contributor — preserves existing deployments', async () => {
      // Existing deployments emit wizard-user from basic/oidc/header strategies.
      // wizard-user must continue to mean "contributor" — same level as the
      // new wizard-contributor role.
      expect((await request(appWith(['wizard-user'])).get('/viewer')).status).toBe(200);
      expect((await request(appWith(['wizard-user'])).get('/contributor')).status).toBe(200);
      expect((await request(appWith(['wizard-user'])).get('/legacy-user')).status).toBe(200);
      expect((await request(appWith(['wizard-user'])).get('/admin')).status).toBe(403);
    });

    it('unknown roles fall back to literal-match (does not crash, denies by default)', async () => {
      // A custom role outside the EmbedIQ namespace neither matches nor
      // unlocks the hierarchy. Without wizard-admin as a fallback role,
      // access is denied.
      expect((await request(appWith(['external:billing'])).get('/admin')).status).toBe(403);
      // But the legacy "any role + wizard-admin in the set" path still works.
      expect((await request(appWith(['external:billing', 'wizard-admin'])).get('/admin')).status).toBe(200);
    });

    it('empty roles array denies authenticated requests at every tier', async () => {
      expect((await request(appWith([])).get('/viewer')).status).toBe(403);
      expect((await request(appWith([])).get('/contributor')).status).toBe(403);
      expect((await request(appWith([])).get('/admin')).status).toBe(403);
    });
  });
});

describe('server auth integration', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('auto-detects basic auth from EMBEDIQ_AUTH_USER/PASS env vars', async () => {
    process.env.EMBEDIQ_AUTH_USER = 'testuser';
    process.env.EMBEDIQ_AUTH_PASS = 'testpass';
    delete process.env.EMBEDIQ_AUTH_STRATEGY;

    // Re-import to pick up env vars
    const { createApp } = await import('../../src/web/server.js');
    const app = await createApp();

    const res = await request(app).get('/api/dimensions');
    expect(res.status).toBe(401);

    const authed = await request(app)
      .get('/api/dimensions')
      .auth('testuser', 'testpass');
    expect(authed.status).toBe(200);
  });
});
