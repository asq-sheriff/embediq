import type { Request, Response, NextFunction } from 'express';

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.embediqUser;

    // If no auth middleware is active, allow all access.
    // This preserves the existing "no auth = full access" behavior.
    if (!user) {
      next();
      return;
    }

    if (user.roles.includes(role) || user.roles.includes('wizard-admin')) {
      next();
    } else {
      res.status(403).json({
        error: `Insufficient permissions. Required role: ${role}`,
        currentRoles: user.roles,
      });
    }
  };
}
