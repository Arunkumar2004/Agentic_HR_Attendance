import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { db } from '../db/database';
import { AuthedRequest, JwtPayload, PublicUser, UserRow } from '../types';

const JWT_SECRET = process.env.JWT_SECRET || 'elan1_super_secret_key_change_me';

export function signToken(user: UserRow | PublicUser): string {
  const row = user as UserRow;
  const payload: JwtPayload = {
    id: user.id, role: user.role, name: user.name, email: user.email,
    v: typeof row.tokenVersion === 'number' ? row.tokenVersion : 0,
  };
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as jwt.SignOptions['expiresIn'],
  });
}

export function toPublic(user: UserRow): PublicUser {
  const { pass: _omit, ...rest } = user;
  void _omit;
  return rest;
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id) as unknown as UserRow | undefined;
    if (!user) {
      res.status(401).json({ error: 'User no longer exists' });
      return;
    }
    // Force-logout: admin bumps tokenVersion, killing all tokens on all devices.
    // Tokens issued before versioning carry no v and stay valid while version is 0.
    const current = typeof user.tokenVersion === 'number' ? user.tokenVersion : 0;
    if (payload.v === undefined ? current !== 0 : payload.v !== current) {
      res.status(401).json({ error: 'Session ended — please login again' });
      return;
    }
    (req as AuthedRequest).user = toPublic(user);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function adminOnly(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthedRequest).user;
  if (user && user.role === 'admin') {
    next();
    return;
  }
  res.status(403).json({ error: 'Admin access required' });
}
