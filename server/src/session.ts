import {
  CORE_WORDS,
  SpellChecker,
  makeGrimwoodBible,
  type Beat,
  type StoryBible,
} from '@storytime/shared';
import { applyDelta, properNouns } from './bible.js';
import { extractDelta } from './claude/archivist.js';
import { Storyteller } from './claude/storyteller.js';
import { loadProfile, loadStory, saveStory } from './store.js';

/**
 * One in-progress story, held in memory for the life of the process and
 * persisted to disk after every beat.
 */
export class Session {
  private constructor(
    public bible: StoryBible,
    private storyteller: Storyteller,
    private checker: SpellChecker,
  ) {}

  static async create(): Promise<Session> {
    const storyId = `story-${Date.now().toString(36)}`;
    const bible = makeGrimwoodBible(storyId);
    const checker = await buildChecker(bible);
    return new Session(bible, new Storyteller(bible), checker);
  }

  static async resume(storyId: string): Promise<Session | null> {
    const saved = await loadStory(storyId);
    if (!saved) return null;
    const checker = await buildChecker(saved.bible);
    return new Session(
      saved.bible,
      Storyteller.resume(saved.bible, saved.messages),
      checker,
    );
  }

  getChecker(): SpellChecker {
    return this.checker;
  }

  get storyNames(): string[] {
    return properNouns(this.bible);
  }

  /**
   * Clean up her spelling before the storyteller ever sees it.
   *
   * Only high-confidence fixes are applied, so we never silently change what
   * she meant. Her raw text is kept on the beat for the profile and the
   * parent view — but the story she reads back should be clean, because
   * seeing her own mistakes rendered as finished prose is exactly the
   * demoralising experience this whole project exists to avoid.
   */
  normalise(raw: string): string {
    return this.checker.normalise(raw);
  }

  addDirection(corrected: string): void {
    this.storyteller.addDirection(corrected);
  }

  getStoryteller(): Storyteller {
    return this.storyteller;
  }

  /** Record a finished beat and kick off the archivist in the background. */
  async commitBeat(opts: {
    panels: Beat['panels'];
    fork: string;
    beatText: string;
    raw: string | null;
    corrected: string | null;
  }): Promise<{ beat: Beat; whatsNew: string[] }> {
    const beat: Beat = {
      n: this.bible.beats.length + 1,
      panels: opts.panels,
      fork: opts.fork,
      cooperDirection: opts.corrected,
      cooperDirectionRaw: opts.raw,
      cooperWordCount: opts.raw
        ? opts.raw.trim().split(/\s+/).filter(Boolean).length
        : 0,
      createdAt: new Date().toISOString(),
    };
    this.bible.beats.push(beat);

    const delta = await extractDelta(
      this.bible,
      opts.beatText,
      opts.corrected,
    );

    let whatsNew: string[] = [];
    if (delta) {
      const applied = applyDelta(this.bible, delta, beat.n);
      this.bible = applied.bible;
      whatsNew = applied.whatsNew;
      this.storyteller.setBible(this.bible);
      // New characters must stop being flagged as misspellings immediately.
      this.checker.addProperNouns(this.storyNames);
    }

    await saveStory(this.bible, this.storyteller.getMessages());
    return { beat, whatsNew };
  }
}

/**
 * The server-side checker uses the small built-in list. The browser loads a
 * full dictionary; here we only need `normalise()`, whose high-confidence
 * layers (reversals and the curated misspelling table) don't depend on
 * dictionary breadth.
 */
async function buildChecker(bible: StoryBible): Promise<SpellChecker> {
  const profile = await loadProfile();
  const extra: Record<string, string> = {};
  for (const [correct, record] of Object.entries(profile.misspellings)) {
    for (const wrong of record.wrongForms) extra[wrong.toLowerCase()] = correct;
  }

  return new SpellChecker({
    words: CORE_WORDS,
    properNouns: properNouns(bible),
    mastered: profile.mastered,
    extraMisspellings: extra,
  });
}
