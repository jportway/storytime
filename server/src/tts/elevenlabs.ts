import crypto from 'node:crypto';
import { config, hasElevenLabs } from '../config.js';
import { AUDIO_PREFIX, audioBlobs } from '../storage.js';

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';

/** The 26 letter names, pre-rendered once and reused forever. See spellOut(). */
const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

function objectKey(text: string): string {
  return `${AUDIO_PREFIX}${keyFor(text)}.mp3`;
}

function keyFor(text: string): string {
  return crypto
    .createHash('sha256')
    .update(`${config.elevenLabs.voiceId}:${text}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Synthesise speech, caching by content hash.
 *
 * The owl repeats itself constantly — the same praise, the same letter
 * names, the same encouragement — so after the first session most lines play
 * instantly and cost nothing.
 */
export async function synthesise(text: string): Promise<Buffer | null> {
  if (!hasElevenLabs()) return null;

  const key = objectKey(text);
  const cached = await audioBlobs.read(key);
  if (cached) return cached;

  const response = await fetch(
    `${ENDPOINT}/${config.elevenLabs.voiceId}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenLabs.apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenLabs.modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          // A little expressiveness — the owl should sound delighted, not
          // like a screen reader.
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`ElevenLabs ${response.status}: ${detail.slice(0, 200)}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  await audioBlobs
    .write(key, audio, {
      contentType: 'audio/mpeg',
      // Public so the browser can fetch repeat plays straight from the
      // bucket without waking the server. These are 26 letter names and a
      // few stock owl lines — nothing private.
      publicRead: true,
    })
    .catch(() => {
      /* a cache write failure is not worth failing the request over */
    });
  return audio;
}

/**
 * A URL the browser can fetch this clip from directly, if it is already
 * cached and the backend can serve bytes itself.
 *
 * Letter clips are by far the owl's most-repeated audio, and serving them
 * from the bucket keeps every repeat play off the server entirely.
 */
export async function cachedAudioUrl(text: string): Promise<string | null> {
  const key = objectKey(text);
  const url = audioBlobs.publicUrl(key);
  if (!url) return null;
  return (await audioBlobs.exists(key)) ? url : null;
}

/**
 * Pre-render the letter names.
 *
 * ElevenLabs has no reliable `<say-as interpret-as="characters">`, so
 * spelling a word aloud would otherwise depend on text pacing tricks
 * ("G ... O ... E ... S") that come out differently run to run. Twenty-six
 * cached clips are perfectly consistent, instant, and free after the first
 * generation.
 *
 * Deliberately NOT run at startup: on Cloud Run the process restarts every
 * time Cooper comes back after a break, and 26 sequential API calls is a
 * terrible thing to do on every cold start. Run it once by hand against the
 * bucket instead — `npm run seed-audio`.
 */
export async function warmLetterClips(): Promise<void> {
  if (!hasElevenLabs()) return;
  for (const letter of LETTERS) {
    try {
      await synthesise(letterPhrase(letter));
    } catch (err) {
      console.warn(`[tts] could not pre-render letter "${letter}":`, err);
      return; // Almost certainly a bad key or quota; don't hammer the API.
    }
  }
}

/**
 * How a single letter should be spoken. The trailing comma gives the clip a
 * small natural pause so stitched letters don't run together.
 */
export function letterPhrase(letter: string): string {
  return `${letter.toUpperCase()},`;
}

/** The sequence of cache keys that spells a word out, letter by letter. */
export function spellOutKeys(word: string): string[] {
  return [...word.toLowerCase()]
    .filter((c) => /[a-z]/.test(c))
    .map((c) => keyFor(letterPhrase(c)));
}

export { keyFor as ttsCacheKey };
