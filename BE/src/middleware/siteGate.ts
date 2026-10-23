// Site-wide password gate (extra protection layer).
// When SITE_USER + SITE_PASS are set, EVERY request must first pass HTTP
// Basic Auth — before the app's own login screen. Health check stays open.
import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function siteGate(req: Request, res: Response, next: NextFunction): void {
  const user = process.env.SITE_USER;
  const pass = process.env.SITE_PASS;
  if (!user || !pass) {
    next(); // gate disabled until configured
    return;
  }
  if (req.path === '/healthz') {
    next();
    return;
  }

  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Elan1 Restricted"');
    res.status(401).send('Restricted — site password required');
    return;
  }
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (timingSafeEqual(u, user) && timingSafeEqual(p, pass)) {
      next();
      return;
    }
  } catch {
    /* fall through to 401 */
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Elan1 Restricted"');
  res.status(401).send('Restricted — wrong site password');
}
