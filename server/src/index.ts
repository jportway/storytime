import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { assertConfigured, config, hasElevenLabs } from './config.js';
import { isCloudStorage } from './storage.js';
import { flushBudget, getSpend, initBudget } from './claude/client.js';
import { storyRouter } from './routes/story.js';
import { owlRouter } from './routes/owl.js';
import { ttsRouter } from './routes/tts.js';
import { adminRouter } from './routes/admin.js';

assertConfigured();

const app = express();
const here = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// A personal, unauthenticated editor for the story bible. Not part of the
// kid-facing app on :5173 — reached directly at http://localhost:8787/admin.
app.use('/admin', express.static(path.join(here, 'admin')));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    tts: hasElevenLabs() ? 'elevenlabs' : 'browser-fallback',
    spend: getSpend(),
  });
});

app.use('/api', storyRouter);
app.use('/api', owlRouter);
app.use('/api', ttsRouter);
app.use('/api', adminRouter);

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
