import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware';

/**
 * Middleware to restrict access to administrative routes.
 * Strictly verifies that the authenticated user's email matches the whitelist.
 */
export const adminOnly = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

  if (!ADMIN_EMAIL) {
    console.error('[ADMIN AUTH ERROR] ADMIN_EMAIL environment variable is not set');
    return res.status(500).json({ error: 'Internal Server Error: Admin configuration missing' });
  }

  if (!req.user) {
    console.error('[ADMIN AUTH ERROR] No user found in request');
    return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  }

  if (req.user.email !== ADMIN_EMAIL) {
    console.error(`[ADMIN AUTH ERROR] Unauthorized access attempt by ${req.user.email}`);
    return res.status(403).json({ 
      error: 'Forbidden: You do not have permission to access this resource',
      message: 'This portal is restricted to the primary system administrator.'
    });
  }

  console.log(`[ADMIN AUTH] Admin access granted to ${req.user.email}`);
  next();
};
