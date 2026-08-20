import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from './config.js';
import { isCloudStorage } from './storage.js';

/**
 * Two passwords, two cookies.
 *
 * The game is behind one password so a stranger who finds the URL can't spend
 * Josh's Anthropic budget. The bible editor is behind a *different* one so
 * Cooper's own device can't reach the tool that rewrites her story world —
 * she has the first password by definition, and finding /admin from there
 * should not be one URL away.
 *
 * On a laptop with no passwords set, both gates are open and nothing changes.
 * That is deliberate for development, and deliberately impossible in the
 * cloud: see assertAuthConfigured().
 */

export type Scope = 'app' | 'admin';

const COOKIE: Record<Scope, string> = {
  app: 'storytime_app',
  admin: 'storytime_admin',
};

/** Long enough that Cooper logs in about once a term, not once a session. */
const MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

function passwordFor(scope: Scope): string | undefined {
  return scope === 'admin'
    ? config.auth.adminPassword
    : config.auth.appPassword;
}

/** A gate with no password configured is open. */
export function isEnabled(scope: Scope): boolean {
  return Boolean(passwordFor(scope));
}

/**
 * Refuse to start a deployed server with the gates open.
 *
 * An internet-facing URL with a metered API key behind it is a standing
 * bill, so this is a hard failure rather than a warning — a warning in a
 * log nobody reads is not protection.
 */
export function assertAuthConfigured(): void {
  if (!isCloudStorage) return;

  const missing: string[] = [];
  if (!config.auth.appPassword) missing.push('APP_PASSWORD');
  if (!config.auth.adminPassword) missing.push('ADMIN_PASSWORD');
  if (missing.length) {
    throw new Error(
      `${missing.join(' and ')} must be set when STORAGE_BUCKET is configured.\n\n` +
        'Running against a bucket means running on the internet, and an open ' +
        'URL here is an open Anthropic bill. Set them via Secret Manager.',
    );
  }
}

// ---------------------------------------------------------------------------
// Signed cookies
// ---------------------------------------------------------------------------

/**
 * Derived from the password itself rather than configured separately, so
 * changing a password automatically invalidates every session signed with
 * the old one — which is the behaviour you want from a password change and
 * one fewer secret to manage.
 */
function secretFor(scope: Scope): string {
  return crypto
    .createHash('sha256')
    .update(`${config.auth.sessionSecret ?? ''}:${scope}:${passwordFor(scope) ?? ''}`)
    .digest('hex');
}

function sign(scope: Scope, expiresAt: number): string {
  const mac = crypto
    .createHmac('sha256', secretFor(scope))
    .update(String(expiresAt))
    .digest('hex');
  return `${expiresAt}.${mac}`;
}

function verify(scope: Scope, token: string | undefined): boolean {
  if (!token) return false;
  const [expiry, mac] = token.split('.');
  if (!expiry || !mac) return false;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;

  const expected = crypto
    .createHmac('sha256', secretFor(scope))
    .update(expiry)
    .digest('hex');

  // Constant-time, and length-guarded because timingSafeEqual throws on a
  // length mismatch rather than returning false.
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Parse the Cookie header. Express 4 doesn't do this without cookie-parser,
 * and two cookies isn't worth a dependency.
 */
function cookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name) out[name] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

function isSecure(req: Request): boolean {
  // Cloud Run terminates TLS upstream, so the socket itself is plain HTTP.
  return (
    req.secure || req.headers['x-forwarded-proto'] === 'https'
  );
}

export function grant(req: Request, res: Response, scope: Scope): void {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const attrs = [
    `${COOKIE[scope]}=${sign(scope, expiresAt)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SECONDS}`,
  ];
  if (isSecure(req)) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

export function isAuthed(req: Request, scope: Scope): boolean {
  if (!isEnabled(scope)) return true;
  return verify(scope, cookies(req)[COOKIE[scope]]);
}

/**
 * Check a submitted password in constant time, so the endpoint can't be used
 * to discover the password one character at a time.
 */
export function checkPassword(scope: Scope, submitted: unknown): boolean {
  const expected = passwordFor(scope);
  if (!expected || typeof submitted !== 'string') return false;
  const a = crypto.createHash('sha256').update(submitted).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

function deny(req: Request, res: Response, loginPath: string): void {
  // originalUrl, not path: inside a mounted middleware req.path is relative
  // to the mount point, so /api/admin/template arrives here as /template and
  // an API call would get redirected to a login page it can't render.
  const url = req.originalUrl;

  // An API caller wants a status code it can act on; a browser asking for a
  // page wants the login form.
  if (url.startsWith('/api/') || req.accepts(['html', 'json']) === 'json') {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  // Come back to whatever was asked for once signed in.
  const next = encodeURIComponent(url);
  res.redirect(302, `${loginPath}?next=${next}`);
}

export function requireApp(req: Request, res: Response, next: NextFunction): void {
  if (isAuthed(req, 'app')) return next();
  deny(req, res, '/login');
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isAuthed(req, 'admin')) return next();
  deny(req, res, '/admin/login');
}
