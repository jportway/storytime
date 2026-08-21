/**
 * The director — the only part of the engine that looks forward.
 *
 * Everything else in storytime is strictly reactive: the storyteller is handed
 * Cooper's direction and writes the smallest beat that makes it real. That is
 * the right instinct and it is not changing. But it means a story has no idea
 * where it is going, so it never arrives anywhere and never ends.
 *
 * This runs after each beat, in parallel with the archivist, on Haiku. It
 * reads the beat that was just written and answers two questions that need an
 * actual reader — is she driving this herself, and what should the next beat
 * reach for — plus two pieces of bookkeeping it is better placed to judge than
 * a counter is. `plan.ts` owns everything else.
 *
 * Note the shape of `planUpdateSchema`: there is no field for the destination,
 * the phases or the arc. That absence is deliberate and load-bearing. A model
 * asked each turn to revise a plan against what just happened will rewrite the
 * plan to describe what just happened, and after three turns the plan is a
 * summary rather than a plan. It cannot do that here because it is never given
 * anywhere to say it.
 *
 * `effort` is rejected on Haiku 4.5 — do not add output_config.effort.
 */

import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { StoryBible } from '@storytime/shared';
import { config } from '../config.js';
import { serializeBible } from '../bible.js';
import { availableTrouble, TARGET_BEATS, type PlanUpdate } from '../plan.js';
import {
  anthropic,
  assertWithinBudget,
  loadPrompt,
  recordUsage,
} from './client.js';

const planUpdateSchema = z.object({
  phaseComplete: z
    .boolean()
    .describe(
      'True only if the beat just written finished the work of this phase.',
    ),
  nowPlayed: z
    .array(z.string())
    .describe('Ids of trouble or inventions this beat actually used up.'),
  sheIsDriving: z
    .boolean()
    .describe(
      'True if her direction carried a real intention of her own, in which ' +
        'case the arc waits and nothing is suggested.',
    ),
  nextMove: z.object({
    instrument: z
      .enum(['fork', 'complication', 'none'])
      .describe('none means say nothing to the storyteller this turn.'),
    intent: z
      .string()
      .describe('One concrete sentence naming what should be within reach.'),
  }),
});

/**
 * Decide what the next beat should reach for.
 *
 * Returns null when there is nothing to decide, or when the call fails. A
 * director that cannot answer must leave the game exactly as it found it —
 * the story is perfectly playable without one, which is how it worked until
 * now.
 */
export async function planNext(
  bible: StoryBible,
  beatText: string,
  direction: string | null,
): Promise<PlanUpdate | null> {
  const plan = bible.plan;
  if (!plan) return null;

  assertWithinBudget();

  const phase = plan.phases[plan.phase];
  const trouble = availableTrouble(bible);
  const beatNumber = bible.beats.length;

  const userContent = [
    '# The story so far',
    serializeBible(bible),
    '',
    '# The arc this story is following (Cooper does not know about any of this)',
    `Shape: ${plan.arcName}`,
    `Destination: ${plan.destination}`,
    `Phase ${plan.phase + 1} of ${plan.phases.length}: ${phase?.name ?? 'the end'}`,
    `What this phase is for: ${phase?.intent ?? 'bringing it to rest'}`,
    `Beats spent in this phase: ${plan.beatsInPhase}`,
    `This is beat ${beatNumber}. A story here usually runs somewhere around ` +
      `${TARGET_BEATS} beats, but that is a loose guide and never a deadline.`,
    plan.landing
      ? 'The story is landing. The next beat resolves it rather than forking.'
      : '',
    '',
    '# Still available to play',
    trouble.length ? trouble.join('\n') : '(nothing left unplayed)',
    '',
    '# The beat that was just written',
    beatText,
    '',
    direction
      ? `# The direction Cooper gave that caused it\n"${direction}"`
      : '# This was the opening beat. Cooper did not direct it.',
  ]
    .filter((line) => line !== '')
    .join('\n');

  try {
    const response = await anthropic.messages.parse({
      model: config.models.director,
      max_tokens: 1000,
      system: loadPrompt('director'),
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: zodOutputFormat(planUpdateSchema) },
    });
    recordUsage(response.usage);
    return response.parsed_output ?? null;
  } catch (err) {
    console.error('[director] planning failed:', err);
    return null;
  }
}
