import { Router } from 'express';
import { wrap } from '../asyncRoute.js';
import { hasElevenLabs } from '../config.js';
import { cachedAudioUrl, letterPhrase, synthesise } from '../tts/elevenlabs.js';

export const ttsRouter = Router();

ttsRouter.get('/tts/status', (_req, res) => {
  // The browser uses this to decide whether to fall back to the built-in
  // speech synthesis, so the game is fully playable with no ElevenLabs key.
  res.json({ available: hasElevenLabs() });
});

ttsRouter.post('/tts/speak', wrap(async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) {
    res.status(400).json({ error: 'text is required' });
    return;
  }

  try {
    const audio = await synthesise(text);
    if (!audio) {
      res.status(503).json({ error: 'ElevenLabs is not configured' });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(audio);
  } catch (err) {
    console.error('[tts] failed:', err);
    res.status(502).json({ error: 'Speech synthesis failed' });
  }
}));

/**
 * A single letter, from the pre-rendered clips.
 *
 * Spelling a word out letter by letter is the owl's most-used move, and
 * ElevenLabs has no reliable say-as-characters support — so the 26 letters
 * are generated once and stitched. Consistent, instant, and free.
 */
ttsRouter.get('/tts/letter/:letter', wrap(async (req, res) => {
  const letter = (req.params.letter ?? '').toLowerCase();
  if (!/^[a-z]$/.test(letter)) {
    res.status(400).json({ error: 'Expected a single letter a-z' });
    return;
  }

  try {
    // Already in the bucket: hand the browser the object URL and stay out of
    // the way. These 26 clips are the owl's most-replayed audio by a wide
    // margin, so keeping repeat plays off the server matters.
    const direct = await cachedAudioUrl(letterPhrase(letter));
    if (direct) {
      res.redirect(302, direct);
      return;
    }

    const audio = await synthesise(letterPhrase(letter));
    if (!audio) {
      res.status(503).json({ error: 'ElevenLabs is not configured' });
      return;
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(audio);
  } catch (err) {
    console.error('[tts] letter failed:', err);
    res.status(502).json({ error: 'Speech synthesis failed' });
  }
}));
