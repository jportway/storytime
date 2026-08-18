/**
 * The fixed starting cast, based on Nadia Shireen's *Grimwood*.
 *
 * This stands in for the seeder prompt in iteration one, so we can get the
 * story loop working without also debugging character generation. When the
 * seeder lands, this becomes one of several presets rather than the only
 * starting point — nothing else in the codebase assumes Grimwood exists.
 *
 * The actual cast, places, things and premise live in
 * `grimwood-template.json`, not in this file — the admin editor
 * (`/admin`) edits that JSON directly, so every new story picks up
 * changes made there without a code change.
 *
 * Note: these are someone else's characters. Fine for a private family toy;
 * don't publish a story built on them.
 */

import type { StoryBible } from './types.js';
import template from './grimwood-template.json' with { type: 'json' };

type GrimwoodTemplate = Omit<StoryBible, 'storyId' | 'createdAt' | 'beats'>;

/** Build a fresh Grimwood bible. Called once per new story. */
export function makeGrimwoodBible(storyId: string): StoryBible {
  return {
    // Deep-copied so a long session can never mutate the module-level
    // template and leak one story's events into the next.
    ...structuredClone(template as GrimwoodTemplate),
    storyId,
    createdAt: new Date().toISOString(),
    beats: [],
  };
}

/**
 * Every proper noun in the starting cast, so the spell checker never
 * underlines "Grimwood" or "Treebonk" at Cooper.
 */
export const GRIMWOOD_PROPER_NOUNS: string[] = [
  ...template.characters.map((c) => c.name),
  ...template.places.map((p) => p.name),
  ...template.things.map((t) => t.name),
  'Grimwood',
  'Treebonk',
  'Dynamite',
]
  .flatMap((name) => name.split(/[\s']+/))
  .filter((w) => w.length > 1);
