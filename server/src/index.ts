import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { assertConfigured, config, hasElevenLabs } from './config.js';
import {
  assertAuthConfigured,
  checkPassword,
  grant,
  isAuthed,
  isEnabled,
  requireAdmin,
  requireApp,
  type Scope,
} from './auth.js';
import { isCloudStorage } from './storage.js';
import { flushBudget, getSpend, initBudget } from './claude/client.js';
import { storyRouter } from './routes/story.js';
import { owlRouter } from './routes/owl.js';
import { ttsRouter } from './routes/tts.js';
import { adminRouter } from './routes/admin.js';

assertConfigured();
assertAuthConfigured();

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));

// Cloud Run terminates TLS upstream, so req.secure is false without this and
// session cookies would never get the Secure flag.
app.set('trust proxy', 1);

// Only needed in development, where the browser talks to Vite on :5173 and
// Vite proxies through to here. A deployed server serves the app and the API
// from one origin, and a permissive CORS policy there would only widen the
// gate we just built.
if (!isCloudStorage) app.use(cors());

app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Public — everything above the gates
// ---------------------------------------------------------------------------

app.get('/api/health', (req, res) => {
  // Spend figures are Josh's business, and only Josh is ever signed in.
  const detail = isAuthed(req, 'app')
    ? {
        tts: hasElevenLabs() ? 'elevenlabs' : 'browser-fallback',
        spend: getSpend(),
      }
    : {};
  res.json({ ok: true, ...detail });
});

const loginPage = path.join(here, 'login.html');
app.get(['/login', '/admin/login'], (_req, res) => res.sendFile(loginPage));

// The owl on the login page, and only the owl. Everything else in the SPA
// bundle sits behind requireApp below, which is why this door needs its own
// key — a picture of an owl is not what the password is protecting.
app.get('/owl/still.webp', (_req, res, next) => {
  const owl = path.join(config.paths.webDist, 'owl', 'still.webp');
  if (!fs.existsSync(owl)) return next();
  res.sendFile(owl);
});

app.post('/api/login', (req, res) => {
  const scope: Scope = req.body?.scope === 'admin' ? 'admin' : 'app';

  if (!isEnabled(scope)) {
    // No password configured for this gate, so there is nothing to sign into.
    res.status(204).end();
    return;
  }

  if (!checkPassword(scope, req.body?.password)) {
    res.status(401).json({ error: 'Wrong password' });
    return;
  }

  grant(req, res, scope);
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// The bible editor — its own password, and only its own
// ---------------------------------------------------------------------------

app.use('/admin', requireAdmin, express.static(path.join(here, 'admin')));
app.use('/api/admin', requireAdmin, adminRouter);

// ---------------------------------------------------------------------------
// The game
// ---------------------------------------------------------------------------

app.use(requireApp);

app.use('/api', storyRouter);
app.use('/api', owlRouter);
app.use('/api', ttsRouter);

// The built SPA, when there is one. In development this directory doesn't
// exist and Vite serves the app on :5173 instead.
if (fs.existsSync(config.paths.webDist)) {
  app.use(express.static(config.paths.webDist));
  // Client-side routing: anything that isn't an API call is the app itself.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(config.paths.webDist, 'index.html'));
  });
}

/**
 * Last line of defence. Routes are wrapped so their rejections land here
 * rather than killing the process; this turns them into a 500 the front end
 * can show as an owl line instead of a dead server.
 */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] unhandled route error:', err);
  if (res.headersSent) {
    // Mid-stream (a beat, most likely). Ending is all that's left.
    res.end();
    return;
  }
  res.status(500).json({ error: 'Something went wrong' });
});

// The token ledger lives in storage so the daily cap survives the process
// being destroyed between play sessions. Load it before serving anything.
await initBudget();

const server = app.listen(config.port, () => {
  console.log(`storytime server on http://localhost:${config.port}`);
  console.log(
    `[storage] ${isCloudStorage ? `bucket ${config.storageBucket}` : 'local filesystem'}`,
  );
  console.log(
    `[auth] game ${isEnabled('app') ? 'password' : 'OPEN'}, ` +
      `admin ${isEnabled('admin') ? 'password' : 'OPEN'}`,
  );
  if (!hasElevenLabs()) {
    console.log(
      '[tts] No ElevenLabs key — the owl will use the browser voice. ' +
        'Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env for the good one.',
    );
  }
});

// Nothing reaching here should be fatal. Staying up with one failed request
// is always better than a crash loop Cooper can't do anything about.
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection:', reason);
});

// Cloud Run sends SIGTERM before reclaiming an idle instance. Persist the
// token ledger rather than losing up to a couple of seconds of it.
process.on('SIGTERM', () => {
  void flushBudget().finally(() => server.close(() => process.exit(0)));
});
