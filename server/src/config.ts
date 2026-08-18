import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

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
    data: path.resolve(here, '../../data'),
    ttsCache: path.resolve(here, '../.cache/tts'),
  },
} as const;

export function assertConfigured(): void {
  if (!config.anthropicApiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and fill it in.',
    );
  }
}

/** The owl falls back to browser speech synthesis when this is false. */
export function hasElevenLabs(): boolean {
  return Boolean(config.elevenLabs.apiKey && config.elevenLabs.voiceId);
}
