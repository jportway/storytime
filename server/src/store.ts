import fs from 'node:fs/promises';
import type { GrimwoodTemplate, Profile, StoryBible } from '@storytime/shared';
import { GRIMWOOD_TEMPLATE } from '@storytime/shared';
import { config } from './config.js';
import { blobs, isCloudStorage } from './storage.js';
import type { StorytellerMessage } from './claude/storyteller.js';

export interface SavedStory {
  bible: StoryBible;
  /** The storyteller's conversation, so a session survives a server restart. */
  messages: StorytellerMessage[];
  updatedAt: string;
}

const STORIES_PREFIX = 'stories/';
const PROFILE_KEY = 'cooper-profile.json';
const TEMPLATE_KEY = 'template.json';
const SPEND_KEY = 'spend.json';

function storyKey(storyId: string): string {
  // Guard against a crafted id escaping the stories prefix.
  const safe = storyId.replace(/[^a-zA-Z0-9_-]/g, '');
  return `${STORIES_PREFIX}${safe}.json`;
}

function parse<T>(raw: Buffer | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw.toString('utf8')) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export async function saveStory(
  bible: StoryBible,
  messages: StorytellerMessage[],
): Promise<void> {
  const payload: SavedStory = {
    bible,
    messages,
    updatedAt: new Date().toISOString(),
  };

  await blobs.write(
    storyKey(bible.storyId),
    JSON.stringify(payload, null, 2),
    {
      contentType: 'application/json',
      // Duplicated into object metadata purely so listStories() can build the
      // story picker without downloading every story in full.
      metadata: {
        storyId: bible.storyId,
        title: bible.title,
        beats: String(bible.beats.length),
        finished: bible.finishedAt ? '1' : '',
        updatedAt: payload.updatedAt,
      },
    },
  );
}

export async function loadStory(storyId: string): Promise<SavedStory | null> {
  return parse<SavedStory>(await blobs.read(storyKey(storyId)));
}

export interface StorySummary {
  storyId: string;
  title: string;
  beats: number;
  updatedAt: string;
  /** She chose "The End". A finished book, not one still being written. */
  finished: boolean;
}

export async function listStories(): Promise<StorySummary[]> {
  const entries = (await blobs.list(STORIES_PREFIX)).filter((e) =>
    e.key.endsWith('.json'),
  );

  const stories = await Promise.all(
    entries.map(async (entry): Promise<StorySummary | null> => {
      const { storyId, title, beats, updatedAt, finished } = entry.metadata;
      if (storyId && title && beats && updatedAt) {
        return {
          storyId,
          title,
          beats: Number(beats),
          updatedAt,
          finished: finished === '1',
        };
      }

      // No usable metadata: the local filesystem has nowhere to keep it, and
      // objects written before it existed don't have it either. Fall back to
      // reading the document, which is what this always used to do.
      const saved = parse<SavedStory>(await blobs.read(entry.key));
      if (!saved) return null;
      return {
        storyId: saved.bible.storyId,
        title: saved.bible.title,
        beats: saved.bible.beats.length,
        updatedAt: saved.updatedAt,
        finished: Boolean(saved.bible.finishedAt),
      };
    }),
  );

  return stories
    .filter((s): s is StorySummary => s !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// ---------------------------------------------------------------------------
// The starting template
// ---------------------------------------------------------------------------

/**
 * On a laptop the template stays where it has always been — a JSON file in
 * the source tree, so an edit made in /admin shows up as a reviewable diff
 * and gets committed like anything else. In the cloud there is no source
 * tree to write to, so it becomes an object in the bucket and the compiled
 * copy is only the fallback for a bucket that has never been edited.
 */
export async function loadTemplate(): Promise<GrimwoodTemplate> {
  if (!isCloudStorage) {
    const raw = await fs
      .readFile(config.paths.grimwoodTemplate, 'utf8')
      .catch(() => null);
    if (!raw) return withArcs(GRIMWOOD_TEMPLATE);
    try {
      return withArcs(JSON.parse(raw) as GrimwoodTemplate);
    } catch {
      return withArcs(GRIMWOOD_TEMPLATE);
    }
  }

  return withArcs(
    parse<GrimwoodTemplate>(await blobs.read(TEMPLATE_KEY)) ?? GRIMWOOD_TEMPLATE,
  );
}

/**
 * A template saved before arcs existed has neither key, and the deployed
 * bucket holds exactly such a template. Defaulting them to empty here means
 * the rest of the server never has to ask: no arcs simply means no plan, and
 * a story with no plan behaves precisely as it always did.
 */
function withArcs(template: GrimwoodTemplate): GrimwoodTemplate {
  return {
    ...template,
    arcs: template.arcs ?? [],
    trouble: template.trouble ?? [],
  };
}

export async function saveTemplate(template: GrimwoodTemplate): Promise<void> {
  const json = JSON.stringify(template, null, 2);

  if (!isCloudStorage) {
    // Write-then-rename, same as story saves: a crash mid-write can't
    // corrupt the template every new story depends on.
    const tmp = `${config.paths.grimwoodTemplate}.tmp`;
    await fs.writeFile(tmp, json, 'utf8');
    await fs.rename(tmp, config.paths.grimwoodTemplate);
    return;
  }

  await blobs.write(TEMPLATE_KEY, json, { contentType: 'application/json' });
}

// ---------------------------------------------------------------------------
// Token ledger
// ---------------------------------------------------------------------------

export interface Spend {
  day: string;
  tokens: number;
}

/**
 * The daily budget exists so a runaway loop can't quietly cost real money
 * while a ten-year-old is left alone with it. On Cloud Run the process dies
 * every time she stops playing, so a counter that lived only in memory would
 * reset constantly and protect nothing.
 */
export async function loadSpend(): Promise<Spend | null> {
  return parse<Spend>(await blobs.read(SPEND_KEY));
}

export async function saveSpend(spend: Spend): Promise<void> {
  await blobs.write(SPEND_KEY, JSON.stringify(spend), {
    contentType: 'application/json',
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const EMPTY_PROFILE: Profile = {
  reversals: {},
  misspellings: {},
  mastered: [],
  strengths: [],
  totals: { wordsWritten: 0, beatsDirected: 0, storiesFinished: 0 },
};

export async function loadProfile(): Promise<Profile> {
  const saved = parse<Profile>(await blobs.read(PROFILE_KEY));
  return saved ? { ...EMPTY_PROFILE, ...saved } : structuredClone(EMPTY_PROFILE);
}

export async function saveProfile(profile: Profile): Promise<void> {
  await blobs.write(PROFILE_KEY, JSON.stringify(profile, null, 2), {
    contentType: 'application/json',
  });
}

/** Three consecutive correct uses and the owl stops mentioning a word. */
const MASTERY_THRESHOLD = 3;

/**
 * Fold what just happened into the profile.
 *
 * This is what lets the owl know her: it stops correcting things she's
 * fixed, and can celebrate specifically ("that used to be your hardest one").
 */
export function updateProfile(
  profile: Profile,
  opts: {
    raw: string;
    corrected: string;
    findings: { word: string; suggestion: string; kind: string }[];
  },
): Profile {
  const next = structuredClone(profile);
  const now = new Date().toISOString();
  const wordCount = opts.raw.trim().split(/\s+/).filter(Boolean).length;

  next.totals.wordsWritten += wordCount;
  next.totals.beatsDirected += 1;

  const erroredThisTurn = new Set<string>();

  for (const f of opts.findings) {
    const target = f.suggestion.toLowerCase();
    erroredThisTurn.add(target);

    if (f.kind === 'reversal') {
      // Record the pair, not the word — the pattern is what matters.
      const pair = guessPair(f.word, f.suggestion) ?? 'b/d';
      const record = (next.reversals[pair] ??= {
        seen: 0,
        lastSeen: now,
        recentExamples: [],
      });
      record.seen += 1;
      record.lastSeen = now;
      record.recentExamples = [f.word, ...record.recentExamples].slice(0, 5);
    }

    const record = (next.misspellings[target] ??= {
      wrongForms: [],
      seen: 0,
      correctSinceLastError: 0,
      mastered: false,
    });
    record.seen += 1;
    record.correctSinceLastError = 0;
    record.mastered = false;
    if (!record.wrongForms.includes(f.word)) record.wrongForms.push(f.word);
    next.mastered = next.mastered.filter((w) => w !== target);
  }

  // Any previously-difficult word she got right this turn moves towards mastery.
  const usedWords = new Set(
    opts.corrected.toLowerCase().match(/[a-z']+/g) ?? [],
  );
  for (const [word, record] of Object.entries(next.misspellings)) {
    if (!usedWords.has(word) || erroredThisTurn.has(word)) continue;
    record.correctSinceLastError += 1;
    if (record.correctSinceLastError >= MASTERY_THRESHOLD && !record.mastered) {
      record.mastered = true;
      if (!next.mastered.includes(word)) next.mastered.push(word);
    }
  }

  return next;
}

/** Work out which confusable pair produced a reversal, for the profile key. */
function guessPair(wrong: string, right: string): string | null {
  const a = wrong.toLowerCase();
  const b = right.toLowerCase();
  if (a.length !== b.length) return null;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return [a[i], b[i]].sort().join('/');
  }
  return null;
}
