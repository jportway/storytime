import cors from 'cors';
import express from 'express';
import { assertConfigured, config, hasElevenLabs } from './config.js';
import { getSpend } from './claude/client.js';
import { storyRouter } from './routes/story.js';
import { owlRouter } from './routes/owl.js';
import { ttsRouter } from './routes/tts.js';
import { warmLetterClips } from './tts/elevenlabs.js';

assertConfigured();

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

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
