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

export type GrimwoodTemplate = Omit<
  StoryBible,
  'storyId' | 'createdAt' | 'beats'
>;

/**
 * The template compiled into the build.
 *
 * This is the fallback, not the source of truth: the server loads the live
 * template through the store, which on a laptop is this very file and in the
 * cloud is an object in the bucket. It matters that this stays a plain value
 * rather than the thing the running server reads, because a deployed server
 * never restarts to pick up a file change.
 */
export const GRIMWOOD_TEMPLATE = template as GrimwoodTemplate;

/** Build a fresh Grimwood bible. Called once per new story. */
export function makeGrimwoodBible(
  storyId: string,
  from: GrimwoodTemplate = GRIMWOOD_TEMPLATE,
): StoryBible {
  return {
    // Deep-copied so a long session can never mutate the template and leak
    // one story's events into the next.
    ...structuredClone(from),
    storyId,
    createdAt: new Date().toISOString(),
    beats: [],
  };
}
