import type { Request, Response, NextFunction } from 'express';

export interface AuthResult {
  authenticated: boolean;
  userId: string;
  displayName: string;
  email?: string;
  roles: string[];
  groups: string[];
  source: string;
}

export interface AuthStrategy {
  name: string;
  authenticate(req: Request): Promise<AuthResult>;
}

declare global {
  namespace Express {
    interface Request {
      embediqUser?: AuthResult;
    }
  }
}

export function createAuthMiddleware(strategy: AuthStrategy) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await strategy.authenticate(req);

      if (!result.authenticated) {
        if (strategy.name === 'basic') {
          res.setHeader('WWW-Authenticate', 'Basic realm="EmbedIQ"');
        }
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      req.embediqUser = result;
      next();
    } catch (err) {
      console.error(`Auth error (${strategy.name}):`, err);
      res.status(500).json({ error: 'Authentication system error' });
    }
  };
}
