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
