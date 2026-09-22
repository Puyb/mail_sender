import type { NextFunction, Request, Response } from 'express';
import { getCredentials } from './sessionStore';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const email = req.session.email;
  const creds = email ? getCredentials(req.sessionID) : undefined;
  if (!email || !creds) {
    res.status(401).json({ error: 'Non authentifié' });
    return;
  }
  next();
}
