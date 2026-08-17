import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

const promptCache = new Map<string, string>();

/**
 * Prompts live as markdown files, not string literals, because ~90% of the
 * iteration on this project is prompt tuning and it shouldn't require
 * touching TypeScript. In dev the cache is skipped so edits take effect on
 * the next request without a restart.
 */
export function loadPrompt(name: string): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const cached = promptCache.get(name);
  if (cached && !isDev) return cached;

  const file = path.join(config.paths.prompts, `${name}.md`);
  const text = fs.readFileSync(file, 'utf8');
  promptCache.set(name, text);
  return text;
}

// ---------------------------------------------------------------------------
// Token budget
// ---------------------------------------------------------------------------

interface Spend {
  day: string;
  tokens: number;
}

let spend: Spend = { day: today(), tokens: 0 };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function recordUsage(usage: {
  input_tokens?: number;
  output_tokens?: number;
} | null | undefined): void {
  if (!usage) return;
  if (spend.day !== today()) spend = { day: today(), tokens: 0 };
  spend.tokens += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
}

export function assertWithinBudget(): void {
  if (config.dailyTokenBudget <= 0) return;
  if (spend.day !== today()) spend = { day: today(), tokens: 0 };
  if (spend.tokens > config.dailyTokenBudget) {
    throw new Error(
      `Daily token budget of ${config.dailyTokenBudget} exceeded (used ${spend.tokens}). ` +
        'Raise DAILY_TOKEN_BUDGET in .env if this is expected.',
    );
  }
}

export function getSpend(): Spend {
  return { ...spend };
}
