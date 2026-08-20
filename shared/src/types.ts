/**
 * The shared vocabulary of the whole app. Both the server and the browser
 * import from here, so a change to the story's shape can only ever be made
 * in one place.
 */

// ---------------------------------------------------------------------------
// The Story Bible — the structured record of everything that exists
// ---------------------------------------------------------------------------

/**
 * Who invented a thing. This is the quiet star of the whole schema: it lets
 * the UI tell Cooper "you invented 4 characters and 11 of the 14 twists",
 * which is the entire point of the project.
 */
export type Creator = 'cooper' | 'ai';

export type CharacterRole =
  | 'hero'
  | 'friend'
  | 'villain'
  | 'creature'
  | 'bystander';

export type CharacterStatus =
  | 'fine'
  | 'hurt'
  | 'missing'
  | 'transformed'
  | 'dead';

export interface Relationship {
  withId: string;
  /** How they feel right now — "adores him but won't say so". */
  feeling: string;
  /** What happened between them — "he saved her from the eagle in beat 3". */
  history: string;
}

export interface Character {
  id: string;
  name: string;
  role: CharacterRole;
  createdBy: Creator;
  traits: string[];
  /** The one thing driving them. */
  wants: string;
  /**
   * Freeform: personality, backstory, relationships, lore — whatever doesn't
   * fit neatly in `appearance` or `voice`. This is the main place to
   * describe who someone is, and it's what the storyteller actually reads;
   * `appearance` deliberately isn't sent to it (see below).
   */
  description: string;
  /**
   * Unused in phase 1. Kept current from beat one because phase 2's image
   * generation needs a consistent appearance description per character, and
   * back-filling it later across a finished story is far more work than
   * maintaining it as we go.
   */
  appearance: string;
  /** How they talk. Keeps dialogue voices distinct across many beats. */
  voice: string;
  /**
   * Concrete lines of dialogue or behaviour that anchor the voice — much
   * stronger for the model to imitate than an adjective-only description.
   */
  examples: string[];
  status: CharacterStatus;
  statusNote?: string;
  /** Place id. */
  location: string;
  /** Thing ids. */
  carrying: string[];
  relationships: Relationship[];
  /** Things the reader doesn't know yet. */
  secrets: string[];
}

export type ThingStatus = 'intact' | 'broken' | 'lost' | 'destroyed';

export interface Thing {
  id: string;
  name: string;
  description: string;
  appearance: string;
  createdBy: Creator;
  ownerId?: string;
  placeId?: string;
  powers: string[];
  status: ThingStatus;
}

export interface Place {
  id: string;
  name: string;
  description: string;
  appearance: string;
  createdBy: Creator;
  connectsTo: string[];
}

export type ThreadStatus = 'open' | 'resolved' | 'abandoned';

/** An open question the story has raised and not yet answered. */
export interface Thread {
  id: string;
  question: string;
  /** Beat number it opened on. */
  opened: number;
  status: ThreadStatus;
  resolution?: string;
  createdBy: Creator;
}

export interface Scene {
  placeId: string;
  presentCharacterIds: string[];
  /** One or two sentences: the immediate problem. */
  situation: string;
  /** The fork Cooper is being asked about. */
  decisionPoint: string;
}

// ---------------------------------------------------------------------------
// The arc — where a story is quietly heading
// ---------------------------------------------------------------------------

/**
 * One movement of an arc. `intent` is what this stretch of story needs to
 * accomplish, written for the director to reason about, never for Cooper.
 */
export interface ArcPhase {
  name: string;
  intent: string;
}

/**
 * A reusable story shape, authored in the template rather than per story.
 *
 * `destination` and `phases` are frozen into a `StoryPlan` the moment an arc
 * is dealt and are never revisable afterwards — see `StoryPlan` for why.
 */
export interface Arc {
  id: string;
  name: string;
  /** What "done" looks like, in one sentence. */
  destination: string;
  phases: ArcPhase[];
}

/**
 * A piece of pressure the director may play, once, to move things along.
 *
 * Cards are the authored half of the director's hand; the other half is
 * harvested at runtime from things Cooper invented, which are always the
 * better card to play.
 */
export interface TroubleCard {
  id: string;
  text: string;
  /** Phase names this suits. Empty means it fits anywhere. */
  suits: string[];
}

/**
 * Live director state for one story. Cooper never sees any of this.
 *
 * The split between frozen and mutable fields is the whole design. A plan
 * held as prose and "revised each turn" degrades into a paraphrase of the
 * story so far, because a model asked to reconcile a plan with what just
 * happened will rewrite the plan to match. So `destination`, `phases` and
 * `arcId` are set once at deal time and deliberately have no representation
 * in the director's output schema — it cannot rewrite the destination
 * because it is given no way to say so. Only the fields below the line move.
 */
export interface StoryPlan {
  // Frozen at deal time.
  arcId: string;
  arcName: string;
  destination: string;
  phases: ArcPhase[];
  dealtAtBeat: number;

  // Mutable, and the only things the director may return.
  /** Index into `phases`. Only ever increases. */
  phase: number;
  beatsInPhase: number;
  /** Card ids and harvested invention ids already spent. Only grows. */
  played: string[];
  nextMove: PlanMove;
  /** She is pushing hard in her own direction; the director stands down. */
  sheIsDriving: boolean;
  /** The next beat should resolve rather than fork. */
  landing: boolean;
}

/**
 * What the director wants the next beat to do.
 *
 * `instrument` is the lever, and the choice matters: `fork` aims the closing
 * line, which is an offer Cooper can simply decline, and `complication` uses
 * the one small complication the storyteller was already allowed. Neither
 * buys the engine any extra room in her story. `none` means say nothing at
 * all this turn.
 */
export interface PlanMove {
  instrument: 'fork' | 'complication' | 'none';
  /** One sentence, addressed to the storyteller. */
  intent: string;
}

export interface StoryBible {
  storyId: string;
  title: string;
  createdAt: string;
  genre: string;
  tone: string[];
  premise: string;
  /** Established canon: "magic only works when it's raining". */
  worldRules: string[];
  characters: Character[];
  places: Place[];
  things: Thing[];
  threads: Thread[];
  beats: Beat[];
  currentScene: Scene;
  /**
   * The shapes a story here can take, and the pressure available to push it
   * along. Copied from the template when the story is created so that dealing
   * a second arc mid-story, or playing a card at beat nine, needs nothing but
   * the bible. Authored in /admin.
   */
  arcs?: Arc[];
  trouble?: TroubleCard[];
  /**
   * Where this story is heading. Optional because every story written before
   * the director existed has none, and a story with no plan behaves exactly
   * as it always did.
   */
  plan?: StoryPlan | null;
  /** Arcs brought to a resolution. A long session can hold several. */
  arcsCompleted?: number;
  /** Set when Cooper chose "The End". A finished book. */
  finishedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Beats and panels — the story as it is told
// ---------------------------------------------------------------------------

export interface DialogueLine {
  who: string;
  says: string;
}

export interface Panel {
  narration: string;
  dialogue: DialogueLine[];
  sfx?: string;
}

export interface Beat {
  n: number;
  panels: Panel[];
  /** The fork this beat ended on. */
  fork: string;
  /**
   * Set when this beat *opens* a new chapter, to the chapter's title.
   *
   * Chapters aren't a separate structure: a beat either starts one or it
   * doesn't, so "the current chapter" is simply the most recent title set,
   * and the whole thing survives save/resume without any extra state. The
   * storyteller decides when the story has earned a new one.
   */
  chapterTitle?: string | null;
  /**
   * This beat landed the story instead of forking: it resolves rather than
   * leaving her at a cliffhanger, and `fork` holds its closing line. The
   * point where she is offered "The End".
   */
  landing?: boolean;
  /**
   * What Cooper typed to cause this beat, spelling-corrected. Null for the
   * opening beat, which nobody directed.
   */
  cooperDirection: string | null;
  /** What she actually typed, warts and all. For the profile and parent view. */
  cooperDirectionRaw: string | null;
  cooperWordCount: number;
  /** One-sentence summary written by the archivist, for re-grounding. */
  summary?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Archivist output — a delta, never a whole-bible rewrite
// ---------------------------------------------------------------------------

export interface CharacterUpdate {
  id: string;
  statusChange?: CharacterStatus;
  statusNote?: string;
  newTraits?: string[];
  locationChange?: string;
  nowCarrying?: string[];
  nowLost?: string[];
  relationshipChanges?: Relationship[];
  newSecrets?: string[];
}

export interface ThingUpdate {
  id: string;
  statusChange?: ThingStatus;
  newOwnerId?: string;
  newPlaceId?: string;
}

export interface BibleDelta {
  newCharacters: Character[];
  characterUpdates: CharacterUpdate[];
  newPlaces: Place[];
  newThings: Thing[];
  thingUpdates: ThingUpdate[];
  newThreads: Omit<Thread, 'opened'>[];
  resolvedThreads: { id: string; resolution: string }[];
  worldRulesLearned: string[];
  beatSummary: string;
  sceneUpdate: Scene;
}

// ---------------------------------------------------------------------------
// The owl
// ---------------------------------------------------------------------------

export type HelpKind =
  /** A letter she reversed — b/d, p/q. Gets the bespoke mnemonic treatment. */
  | 'reversal'
  | 'spelling'
  /** their/there, to/too — a real word, wrong one. */
  | 'homophone'
  | 'grammar'
  | 'punctuation'
  | 'word-choice';

/** What the board beside the owl draws while it speaks. */
export interface BoardCard {
  word: string;
  /** Indices of the letters to light up as the owl says them. */
  highlight: number[];
  /** Named illustration, e.g. "bed-hands" for the b/d trick. */
  mnemonic?: string;
}

export interface OwlHelp {
  original: string;
  fixed: string;
  kind: HelpKind;
  /** What the owl says out loud. Dry, short, Frank's voice — never corrective. */
  spoken: string;
  board: BoardCard;
}

export interface OwlResponse {
  /** Rare and earned — null most of the time. Never generic. */
  praise: string | null;
  /** At most two. Never a list. */
  helps: OwlHelp[];
  /** A leading question, only when she's stuck or very brief. */
  nudge: string | null;
}

/** A finding from the instant, local, in-browser check. No network. */
export interface LocalFinding {
  word: string;
  /** Character offset in the textarea. */
  start: number;
  end: number;
  suggestion: string;
  kind: HelpKind;
  /** 'high' findings (reversals, known misspellings) outrank dictionary guesses. */
  confidence: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------------
// Cooper's profile — how the owl knows her
// ---------------------------------------------------------------------------

export interface ReversalRecord {
  seen: number;
  lastSeen: string;
  recentExamples: string[];
}

export interface MisspellingRecord {
  wrongForms: string[];
  seen: number;
  /** Consecutive correct uses since her last error. Three in a row = mastered. */
  correctSinceLastError: number;
  mastered: boolean;
}

export interface Profile {
  /** Keyed by pair, e.g. "b/d". */
  reversals: Record<string, ReversalRecord>;
  /** Keyed by the correct spelling. */
  misspellings: Record<string, MisspellingRecord>;
  /** Words she's got right three times running — the owl stops mentioning these. */
  mastered: string[];
  strengths: string[];
  totals: {
    wordsWritten: number;
    beatsDirected: number;
    storiesFinished: number;
  };
}

// ---------------------------------------------------------------------------
// Wire format — server-sent events during a streaming beat
// ---------------------------------------------------------------------------

export type StoryStreamEvent =
  | { type: 'panel'; panel: Panel }
  | { type: 'fork'; text: string }
  /**
   * The beat resolved rather than forking. The story is at a natural end and
   * Cooper is about to be asked whether it is over.
   */
  | { type: 'landing'; text: string }
  /** This beat opens a new chapter. Sent before any panel of that beat. */
  | { type: 'chapter'; title: string }
  | { type: 'beat-complete'; beat: Beat }
  | { type: 'bible-updated'; bible: StoryBible; whatsNew: string[] }
  /**
   * The storyteller declined to continue. The UI must handle this in
   * character — never an error dialog. See server/src/claude/storyteller.ts.
   */
  | { type: 'redirect'; message: string }
  | { type: 'error'; message: string };
