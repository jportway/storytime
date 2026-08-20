import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { loadSpend, saveSpend, type Spend } from '../store.js';

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

/**
 * The daily ledger, cached in memory and mirrored to storage.
 *
 * Kept in memory because recordUsage() is called from inside streaming
 * callbacks where an await would be awkward, and mirrored to storage because
 * on Cloud Run this process is destroyed every time Cooper stops playing —
 * an in-memory-only counter would reset to zero constantly and the daily cap
 * would silently protect nothing.
 */
let spend: Spend = { day: today(), tokens: 0 };
let flushTimer: NodeJS.Timeout | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Load the persisted ledger. Call once, before serving traffic. */
export async function initBudget(): Promise<void> {
  try {
    const saved = await loadSpend();
    if (saved && saved.day === today()) spend = saved;
  } catch (err) {
    // A ledger we can't read is not a reason to refuse to start; the
    // in-memory counter still caps a single runaway session.
    console.warn('[budget] could not load spend ledger:', err);
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  // Coalesced: a single beat makes several API calls, and they only need to
  // produce one write.
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushBudget();
  }, 2000);
  // Never hold the process open just to write a counter.
  flushTimer.unref?.();
}

export async function flushBudget(): Promise<void> {
  try {
    await saveSpend(spend);
  } catch (err) {
    console.warn('[budget] could not save spend ledger:', err);
  }
}

export function recordUsage(usage: {
  input_tokens?: number;
  output_tokens?: number;
} | null | undefined): void {
  if (!usage) return;
  if (spend.day !== today()) spend = { day: today(), tokens: 0 };
  spend.tokens += (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0);
  scheduleFlush();
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
