import fs from 'node:fs/promises';
import path from 'node:path';
import type { Profile, StoryBible } from '@storytime/shared';
import { config } from './config.js';
import type { StorytellerMessage } from './claude/storyteller.js';

export interface SavedStory {
  bible: StoryBible;
  /** The storyteller's conversation, so a session survives a server restart. */
  messages: StorytellerMessage[];
  updatedAt: string;
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function storyPath(storyId: string): string {
  // Guard against a crafted id escaping the data directory.
  const safe = path.basename(storyId).replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(config.paths.data, 'stories', `${safe}.json`);
}

const profilePath = () => path.join(config.paths.data, 'cooper-profile.json');

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export async function saveStory(
  bible: StoryBible,
  messages: StorytellerMessage[],
): Promise<void> {
  await ensureDir(path.join(config.paths.data, 'stories'));
  const payload: SavedStory = {
    bible,
    messages,
    updatedAt: new Date().toISOString(),
  };
  const file = storyPath(bible.storyId);
  // Write-then-rename, so a crash mid-write can't corrupt a story she's
  // been working on for an hour.
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export async function loadStory(storyId: string): Promise<SavedStory | null> {
  try {
    const raw = await fs.readFile(storyPath(storyId), 'utf8');
    return JSON.parse(raw) as SavedStory;
  } catch {
    return null;
  }
}

export async function listStories(): Promise<
  { storyId: string; title: string; beats: number; updatedAt: string }[]
> {
  const dir = path.join(config.paths.data, 'stories');
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }

  const stories = await Promise.all(
    names
      .filter((n) => n.endsWith('.json'))
      .map(async (n) => {
        try {
          const raw = await fs.readFile(path.join(dir, n), 'utf8');
          const saved = JSON.parse(raw) as SavedStory;
          return {
            storyId: saved.bible.storyId,
            title: saved.bible.title,
            beats: saved.bible.beats.length,
            updatedAt: saved.updatedAt,
          };
        } catch {
          return null;
        }
      }),
  );

  return stories
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
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
  try {
    const raw = await fs.readFile(profilePath(), 'utf8');
    return { ...EMPTY_PROFILE, ...(JSON.parse(raw) as Profile) };
  } catch {
    return structuredClone(EMPTY_PROFILE);
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await ensureDir(config.paths.data);
  await fs.writeFile(profilePath(), JSON.stringify(profile, null, 2), 'utf8');
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
