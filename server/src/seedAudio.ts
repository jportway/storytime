/**
 * Fill the audio cache, once, by hand.
 *
 * Two jobs, in order:
 *
 * 1. Upload whatever is already cached on this machine. There are ~76 clips
 *    sitting in server/.cache/tts that were paid for months ago; regenerating
 *    them in the cloud would cost real ElevenLabs characters for no reason.
 * 2. Generate any of the 26 letter names still missing, so the owl can spell
 *    a word out instantly from the very first request.
 *
 * This used to run at server startup. That was fine on a laptop that boots
 * once a week and wrong on Cloud Run, where the process is destroyed every
 * time Cooper stops playing and 26 sequential API calls would greet every
 * cold start.
 *
 *   npm run seed-audio            # local cache only
 *   STORAGE_BUCKET=x npm run seed-audio   # upload to the bucket
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { config, hasElevenLabs } from './config.js';
import { AUDIO_PREFIX, audioBlobs, isCloudStorage } from './storage.js';
import { letterPhrase, synthesise } from './tts/elevenlabs.js';

async function uploadExistingCache(): Promise<number> {
  if (!isCloudStorage) return 0;

  let names: string[];
  try {
    names = await fs.readdir(config.paths.ttsCache);
  } catch {
    console.log('[seed] no local cache to upload');
    return 0;
  }

  const clips = names.filter((n) => n.endsWith('.mp3'));
  let uploaded = 0;

  for (const name of clips) {
    const key = `${AUDIO_PREFIX}${name}`;
    if (await audioBlobs.exists(key)) continue;

    const audio = await fs.readFile(path.join(config.paths.ttsCache, name));
    await audioBlobs.write(key, audio, {
      contentType: 'audio/mpeg',
      publicRead: true,
    });
    uploaded += 1;
  }

  console.log(
    `[seed] uploaded ${uploaded} of ${clips.length} local clips (rest already present)`,
  );
  return uploaded;
}

async function generateMissingLetters(): Promise<number> {
  if (!hasElevenLabs()) {
    console.log('[seed] no ElevenLabs key — skipping letter generation');
    return 0;
  }

  let generated = 0;
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    try {
      // synthesise() is a no-op on a cache hit, so this only spends money on
      // letters genuinely missing.
      await synthesise(letterPhrase(letter));
      generated += 1;
    } catch (err) {
      console.error(`[seed] letter "${letter}" failed:`, err);
      // Almost certainly a bad key or exhausted quota; don't hammer the API.
      break;
    }
  }
  return generated;
}

console.log(
  `[seed] target: ${isCloudStorage ? `bucket ${config.storageBucket}` : config.paths.ttsCache}`,
);
await uploadExistingCache();
const letters = await generateMissingLetters();
console.log(`[seed] ${letters}/26 letter clips present. Done.`);
