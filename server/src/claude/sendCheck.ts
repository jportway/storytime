import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { isCosmeticFix } from '@storytime/shared';
import { config } from '../config.js';
import { anthropic, assertWithinBudget, loadPrompt, recordUsage } from './client.js';

const schema = z.object({
  issues: z
    .array(z.object({ original: z.string(), suggestion: z.string() }))
    .max(2),
});

export interface SendCheckIssue {
  original: string;
  suggestion: string;
}

/**
 * One last look at her exact draft before it sends — the fallback for
 * everything the fast local checker either can't catch (a badly garbled
 * word like "germp") or gets wrong (the local dictionary is small and can
 * false-flag a real word it just doesn't happen to contain).
 *
 * Only called once per send attempt, after the local checker's high-
 * confidence layers (reversals, curated misspellings) are already clear —
 * those are reliable enough not to need a second opinion, and instant.
 */
export async function checkBeforeSend(
  draft: string,
  storyNames: string[],
): Promise<SendCheckIssue[]> {
  assertWithinBudget();

  const userContent = [
    '# What she is about to send',
    draft,
    '',
    '# Names in this story (never flag these)',
    storyNames.join(', '),
  ].join('\n');

  try {
    // Note: `effort` is rejected on Haiku 4.5 — do not add output_config.effort.
    const response = await anthropic.messages.parse({
      model: config.models.owl,
      max_tokens: 500,
      system: loadPrompt('send-check'),
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: zodOutputFormat(schema) },
    });
    recordUsage(response.usage);
    // Belt and braces with the prompt: capitalisation and punctuation never
    // block a send, so drop anything whose only change is cosmetic even if
    // the model decides to raise it anyway.
    return (response.parsed_output?.issues ?? []).filter(
      (i) => !isCosmeticFix(i.original, i.suggestion),
    );
  } catch (err) {
    // Never block sending because this check itself failed.
    console.error('[send-check] failed, letting it through:', err);
    return [];
  }
}
