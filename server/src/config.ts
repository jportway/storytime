import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The repo root, two levels up from either src/ (dev, via tsx) or dist/
 * (built).
 */
const repoRoot = path.resolve(here, '../..');

/**
 * Load .env from the repo root explicitly.
 *
 * `dotenv/config` resolves relative to process.cwd(), and npm runs a
 * workspace script with cwd set to that workspace — so `npm run dev -w
 * server` would look for server/.env and silently miss the root .env that
 * .env.example sits next to. Pointing at the root keeps one .env for the
 * whole project regardless of where a command is run from.
 */
export const envPath = path.join(repoRoot, '.env');
dotenv.config({ path: envPath });

export const config = {
  port: Number(process.env.PORT ?? 8787),

  anthropicApiKey: process.env.ANTHROPIC_API_KEY,

  elevenLabs: {
    apiKey: process.env.ELEVENLABS_API_KEY,
    voiceId: process.env.ELEVENLABS_VOICE_ID,
    /** Flash v2.5: ~75ms latency, which is what makes the owl feel alive. */
    modelId: 'eleven_flash_v2_5',
  },

  /**
   * Rough safety net so a runaway loop can't quietly cost real money while
   * a ten-year-old is left alone with it. A normal session is ~40k tokens.
   */
  dailyTokenBudget: Number(process.env.DAILY_TOKEN_BUDGET ?? 2_000_000),

  models: {
    /**
     * The storyteller and seeder. Thinking is on by default on Opus 5 and
     * max_tokens caps thinking + visible text together, so maxTokens is far
     * larger than a 150-word beat needs — otherwise beats truncate mid-word.
     */
    storyteller: 'claude-opus-5',
    /**
     * Bookkeeping and coaching. Haiku is fast and cheap, and both jobs are
     * extraction rather than judgement. Note: `effort` is rejected on Haiku
     * 4.5, so never pass output_config.effort on these calls.
     */
    archivist: 'claude-haiku-4-5',
    owl: 'claude-haiku-4-5',
  },

  paths: {
    prompts: path.join(here, 'prompts'),
    data: path.join(repoRoot, 'data'),
    ttsCache: path.resolve(here, '../.cache/tts'),
    /** The default starting cast, editable from /admin. */
    grimwoodTemplate: path.join(repoRoot, 'shared/src/grimwood-template.json'),
  },
} as const;

export function assertConfigured(): void {
  if (!config.anthropicApiKey) {
    throw new Error(
      `ANTHROPIC_API_KEY is not set.\n\n` +
        `Create ${envPath} (copy .env.example next to it) and add:\n` +
        `  ANTHROPIC_API_KEY=sk-ant-...\n`,
    );
  }
}

/** The owl falls back to browser speech synthesis when this is false. */
export function hasElevenLabs(): boolean {
  return Boolean(config.elevenLabs.apiKey && config.elevenLabs.voiceId);
}
