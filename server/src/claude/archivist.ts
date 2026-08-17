import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { BibleDelta, StoryBible } from '@storytime/shared';
import { config } from '../config.js';
import { serializeBible } from '../bible.js';
import {
  anthropic,
  assertWithinBudget,
  loadPrompt,
  recordUsage,
} from './client.js';

const creator = z.enum(['cooper', 'ai']);

const relationship = z.object({
  withId: z.string(),
  feeling: z.string(),
  history: z.string(),
});

const character = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(['hero', 'friend', 'villain', 'creature', 'bystander']),
  createdBy: creator,
  traits: z.array(z.string()),
  wants: z.string(),
  appearance: z.string(),
  voice: z.string(),
  status: z.enum(['fine', 'hurt', 'missing', 'transformed', 'dead']),
  location: z.string(),
  carrying: z.array(z.string()),
  relationships: z.array(relationship),
  secrets: z.array(z.string()),
});

const deltaSchema = z.object({
  newCharacters: z.array(character),
  characterUpdates: z.array(
    z.object({
      id: z.string(),
      statusChange: z
        .enum(['fine', 'hurt', 'missing', 'transformed', 'dead'])
        .nullable(),
      statusNote: z.string().nullable(),
      newTraits: z.array(z.string()),
      locationChange: z.string().nullable(),
      nowCarrying: z.array(z.string()),
      nowLost: z.array(z.string()),
      relationshipChanges: z.array(relationship),
      newSecrets: z.array(z.string()),
    }),
  ),
  newPlaces: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      appearance: z.string(),
      createdBy: creator,
      connectsTo: z.array(z.string()),
    }),
  ),
  newThings: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
      appearance: z.string(),
      createdBy: creator,
      ownerId: z.string().nullable(),
      placeId: z.string().nullable(),
      powers: z.array(z.string()),
      status: z.enum(['intact', 'broken', 'lost', 'destroyed']),
    }),
  ),
  thingUpdates: z.array(
    z.object({
      id: z.string(),
      statusChange: z.enum(['intact', 'broken', 'lost', 'destroyed']).nullable(),
      newOwnerId: z.string().nullable(),
      newPlaceId: z.string().nullable(),
    }),
  ),
  newThreads: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      status: z.enum(['open', 'resolved', 'abandoned']),
      createdBy: creator,
    }),
  ),
  resolvedThreads: z.array(z.object({ id: z.string(), resolution: z.string() })),
  worldRulesLearned: z.array(z.string()),
  beatSummary: z.string(),
  sceneUpdate: z.object({
    placeId: z.string(),
    presentCharacterIds: z.array(z.string()),
    situation: z.string(),
    decisionPoint: z.string(),
  }),
});

/** Strip the nulls the schema needs but our domain types express as absence. */
function normalise(raw: z.infer<typeof deltaSchema>): BibleDelta {
  const drop = <T extends Record<string, unknown>>(o: T): T =>
    Object.fromEntries(
      Object.entries(o).filter(([, v]) => v !== null),
    ) as T;

  return {
    ...raw,
    characterUpdates: raw.characterUpdates.map(drop),
    newThings: raw.newThings.map(drop),
    thingUpdates: raw.thingUpdates.map(drop),
  } as BibleDelta;
}

/**
 * Read the beat that was just written and report what changed.
 *
 * Runs on Haiku in the background while Cooper reads the new panels and
 * starts typing, so its latency is effectively free. Note that `effort` is
 * rejected on Haiku 4.5 — do not add output_config.effort here.
 */
export async function extractDelta(
  bible: StoryBible,
  beatText: string,
  direction: string | null,
): Promise<BibleDelta | null> {
  assertWithinBudget();

  const userContent = [
    '# Current story bible',
    serializeBible(bible),
    '',
    '# The beat that was just written',
    beatText,
    '',
    direction
      ? `# The direction Cooper gave that caused it\n"${direction}"`
      : '# This was the opening beat. Cooper did not direct it.',
  ].join('\n');

  try {
    const response = await anthropic.messages.parse({
      model: config.models.archivist,
      max_tokens: 4000,
      system: loadPrompt('archivist'),
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: zodOutputFormat(deltaSchema) },
    });
    recordUsage(response.usage);

    return response.parsed_output ? normalise(response.parsed_output) : null;
  } catch (err) {
    // Bookkeeping must never be able to break the game. If the archivist
    // fails, the story keeps its previous bible and carries on; the model's
    // own conversation history still holds everything that happened.
    console.error('[archivist] failed, keeping previous bible:', err);
    return null;
  }
}
