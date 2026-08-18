import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import express from 'express';
import { assertConfigured, config, hasElevenLabs } from './config.js';
import { getSpend } from './claude/client.js';
import { storyRouter } from './routes/story.js';
import { owlRouter } from './routes/owl.js';
import { ttsRouter } from './routes/tts.js';
import { adminRouter } from './routes/admin.js';
import { warmLetterClips } from './tts/elevenlabs.js';

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

app.listen(config.port, () => {
  console.log(`storytime server on http://localhost:${config.port}`);
  if (!hasElevenLabs()) {
    console.log(
      '[tts] No ElevenLabs key — the owl will use the browser voice. ' +
        'Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID in .env for the good one.',
    );
  } else {
    // Fire and forget: pre-render the 26 letter clips so the first spell-out
    // of the session is instant. No-op on every boot after the first.
    void warmLetterClips().then(() =>
      console.log('[tts] letter clips ready'),
    );
  }
});
