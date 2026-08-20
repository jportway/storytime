import {
  CORE_WORDS,
  SpellChecker,
  makeGrimwoodBible,
  type Beat,
  type StoryBible,
} from '@storytime/shared';
import { applyDelta, properNouns } from './bible.js';
import { extractDelta } from './claude/archivist.js';
import { planNext } from './claude/director.js';
import { nameBook } from './claude/title.js';
import { applyPlanUpdate, dealArc } from './plan.js';
import { Storyteller } from './claude/storyteller.js';
import {
  loadProfile,
  loadStory,
  loadTemplate,
  saveProfile,
  saveStory,
} from './store.js';

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
    // Loaded per story rather than imported once, so an edit made in /admin
    // is picked up by the very next new story without a restart — which a
    // deployed server never gets.
    const bible = makeGrimwoodBible(storyId, await loadTemplate());
    // Dealt before the opening beat so the very first fork is already aimed.
    // A template with no arcs deals nothing, and the story runs exactly as it
    // did before any of this existed.
    bible.plan = dealArc(bible.arcs, 0);
    bible.arcsCompleted = 0;
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
    // The plan travels with her direction rather than being injected
    // separately, so the storyteller sees one message per turn and the
    // conversation stays append-only. See Storyteller.addDirection.
    this.storyteller.addDirection(corrected, this.bible.plan);
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
    chapterTitle: string | null;
    landing?: boolean;
  }): Promise<{ beat: Beat; whatsNew: string[] }> {
    const beat: Beat = {
      n: this.bible.beats.length + 1,
      panels: opts.panels,
      fork: opts.fork,
      chapterTitle: opts.chapterTitle,
      landing: opts.landing ? true : undefined,
      cooperDirection: opts.corrected,
      cooperDirectionRaw: opts.raw,
      cooperWordCount: opts.raw
        ? opts.raw.trim().split(/\s+/).filter(Boolean).length
        : 0,
      createdAt: new Date().toISOString(),
    };
    this.bible.beats.push(beat);

    // Both read the beat that was just written and neither needs the other's
    // output, so they go together. The archivist already gates the response —
    // running the director after it rather than beside it would add its whole
    // latency to the time Cooper spends unable to type.
    const [delta, planUpdate] = await Promise.all([
      extractDelta(this.bible, opts.beatText, opts.corrected),
      planNext(this.bible, opts.beatText, opts.corrected),
    ]);

    let whatsNew: string[] = [];
    if (delta) {
      const applied = applyDelta(this.bible, delta, beat.n);
      this.bible = applied.bible;
      whatsNew = applied.whatsNew;
      this.storyteller.setBible(this.bible);
      // New characters must stop being flagged as misspellings immediately.
      this.checker.addProperNouns(this.storyNames);
    }

    if (this.bible.plan) {
      this.bible.plan = applyPlanUpdate(this.bible.plan, planUpdate, beat.n);
      this.storyteller.setBible(this.bible);
    }

    await saveStory(this.bible, this.storyteller.getMessages());
    return { beat, whatsNew };
  }

  /**
   * She chose "The End". Give the book its name and close it.
   *
   * Idempotent: a second tap of the button, or a reload that re-posts, gets
   * the same finished book rather than paying to rename it.
   */
  async finish(): Promise<StoryBible> {
    if (this.bible.finishedAt) return this.bible;

    const title = await nameBook(this.bible);
    if (title) this.bible.title = title;
    this.bible.finishedAt = new Date().toISOString();
    this.storyteller.setBible(this.bible);

    const profile = await loadProfile();
    profile.totals.storiesFinished += 1;
    await saveProfile(profile);

    await saveStory(this.bible, this.storyteller.getMessages());
    return this.bible;
  }

  /**
   * She chose to keep going after the story landed. Deal a fresh shape.
   *
   * The arc just finished is avoided, because two rescues in a row read as
   * repetition even when each is fine on its own. The storyteller is told
   * nothing directly — it finds out by being handed a new destination, and
   * opens a chapter of its own accord because the story has turned a corner.
   */
  continuePastLanding(): void {
    const finished = this.bible.plan?.arcId ?? null;
    this.bible.arcsCompleted = (this.bible.arcsCompleted ?? 0) + 1;
    this.bible.plan = dealArc(
      this.bible.arcs,
      this.bible.beats.length,
      finished,
    );
    this.storyteller.setBible(this.bible);
  }

  async save(): Promise<void> {
    await saveStory(this.bible, this.storyteller.getMessages());
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
