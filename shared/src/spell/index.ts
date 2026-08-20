import type { LocalFinding } from '../types.js';
import { lookupMisspelling, matchCase } from './misspellings.js';
import { detectReversal } from './reversals.js';
import { buildPhoneticIndex, phoneticKey, rankCandidates } from './phonetic.js';

export * from './misspellings.js';
export * from './reversals.js';
export * from './phonetic.js';

/**
 * Is the only difference between what she wrote and the suggestion
 * cosmetic — capitalisation, an apostrophe, other punctuation?
 *
 * These are never allowed to stand between her and sending a turn. A
 * missing apostrophe in "dont" or a lowercase "i" is not what this project
 * is for, and stopping her over one is exactly the pedantic-red-pen
 * experience it exists to avoid. The owl may still mention them in passing
 * while she writes; they just never block.
 */
export function isCosmeticFix(original: string, suggestion: string): boolean {
  const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  return bare(original) === bare(suggestion);
}

export interface SpellCheckerOptions {
  /** Words the checker treats as correct. */
  words: Iterable<string>;
  /**
   * Story names — characters, places, things. These must never be flagged:
   * underlining "Zorblax" at a child who just invented Zorblax teaches her
   * that inventing things is an error.
   */
  properNouns?: Iterable<string>;
  /** Extra corrections learned from her profile. */
  extraMisspellings?: Record<string, string>;
  /** Words she has mastered; never flagged even if the dictionary disagrees. */
  mastered?: Iterable<string>;
}

const WORD_RE = /[A-Za-z][A-Za-z']*/g;

export class SpellChecker {
  private words: Set<string>;
  private proper: Set<string>;
  private mastered: Set<string>;
  private extra: Record<string, string>;
  private phonetic: Map<string, string[]>;

  constructor(opts: SpellCheckerOptions) {
    this.words = new Set([...opts.words].map((w) => w.toLowerCase()));
    this.proper = new Set(
      [...(opts.properNouns ?? [])].map((w) => w.toLowerCase()),
    );
    this.mastered = new Set([...(opts.mastered ?? [])].map((w) => w.toLowerCase()));
    this.extra = opts.extraMisspellings ?? {};
    this.phonetic = buildPhoneticIndex(this.words);
  }

  /** Add story names mid-session, as new characters get invented. */
  addProperNouns(names: Iterable<string>): void {
    for (const n of names) this.proper.add(n.toLowerCase());
  }

  isKnown(word: string): boolean {
    const lower = word.toLowerCase();
    return (
      this.words.has(lower) ||
      this.proper.has(lower) ||
      this.mastered.has(lower) ||
      // Possessives and contractions of known words.
      (lower.endsWith("'s") && this.words.has(lower.slice(0, -2)))
    );
  }

  /**
   * Check a single word.
   *
   * Layer order is load-bearing. Reversals run before the dictionary because
   * a dictionary fed "deb" proposes "debt"/"den" and buries the actual
   * diagnosis; the curated table runs before the phonetic search because it
   * is exact where the search is a guess.
   */
  checkWord(word: string): Omit<LocalFinding, 'start' | 'end'> | null {
    if (!word || word.length < 2) return null;
    if (this.isKnown(word)) return null;

    // 1. Letter reversal — highest confidence, and the diagnosis she needs.
    const reversal = detectReversal(word, (w) => this.isKnown(w));
    if (reversal) {
      return {
        word,
        suggestion: matchCase(word, reversal.fixed),
        kind: 'reversal',
        confidence: 'high',
      };
    }

    // 2. Known child misspelling — exact, instant, free.
    const known =
      lookupMisspelling(word) ??
      (this.extra[word.toLowerCase()]
        ? matchCase(word, this.extra[word.toLowerCase()]!)
        : null);
    if (known) {
      return { word, suggestion: known, kind: 'spelling', confidence: 'high' };
    }

    // 3. Phonetic search — a guess, and marked as one.
    const bucket = this.phonetic.get(phoneticKey(word)) ?? [];
    const [best] = rankCandidates(word, bucket, 1);
    if (best) {
      return {
        word,
        suggestion: matchCase(word, best.word),
        kind: 'spelling',
        confidence: best.distance <= 2 ? 'medium' : 'low',
      };
    }

    return null;
  }

  /**
   * A further guess for a word, excluding suggestions already tried —
   * used when the owl's first guess is wrong and it has another go.
   *
   * Reversals and curated misspellings only ever have one right answer
   * (there's no second way to un-reverse "deb"), so only the phonetic
   * layer has further candidates to offer. Returns null once those are
   * exhausted too, meaning: no more automatic guesses, she should fix it
   * herself.
   */
  nextCandidate(word: string, excluding: Iterable<string>): string | null {
    const tried = new Set([...excluding].map((s) => s.toLowerCase()));
    const bucket = this.phonetic.get(phoneticKey(word)) ?? [];
    const ranked = rankCandidates(word, bucket, 5);
    const next = ranked.find((c) => !tried.has(c.word.toLowerCase()));
    return next ? matchCase(word, next.word) : null;
  }

  /** Check a whole draft, returning findings with text offsets for underlining. */
  check(text: string): LocalFinding[] {
    const findings: LocalFinding[] = [];
    for (const match of text.matchAll(WORD_RE)) {
      const word = match[0];
      const start = match.index ?? 0;
      const result = this.checkWord(word);
      if (result) {
        findings.push({ ...result, start, end: start + word.length });
      }
    }
    return findings;
  }

  /**
   * Apply every high-confidence fix.
   *
   * Used server-side before the storyteller sees her text, so her spelling
   * mistakes never appear in the finished story. Her raw text is kept
   * separately for the profile and the parent view — but the prose she is
   * proud of should be clean.
   *
   * Deliberately only high-confidence fixes: silently "correcting" a word on
   * a guess could change what she actually meant.
   */
  normalise(text: string): string {
    return text.replace(WORD_RE, (word) => {
      const result = this.checkWord(word);
      return result && result.confidence === 'high' ? result.suggestion : word;
    });
  }
}

/**
 * A small built-in wordlist so the checker is useful with no dictionary
 * wired up at all — used by tests, the replay harness, and as the fallback
 * if the browser's dictionary fails to load.
 */
export const CORE_WORDS = `a about after again all always am an and angry animal another
answer any are around as ask at away back bad bag ball be bear beautiful because bed been
before began begin behind bell best better between big bird bit bite black blue boat book
both box boy branch brave bread break bright bring brother brought build but buy by call
came can cannot car careful carry castle cat catch caught chair child children city clean
climb close cloud cold come could country cry dark day dead dear deep did die different
dig dinner do dog done door down dragon dream drink drop dry duck each ear early eat egg
eight end enough escape even ever every eye face fall family far fast fat father fear feel
feet fell few field fight find fire first fish five fly follow food foot for forest found
four fox friend friendly frighten from front full fun funny gave get ghost giant girl give
glass go goes going gold gone good got grass great green grew ground grow had hair half
hand happen happy hard has hat have he head hear heard heart help her here hide high hill
him his hit hold hole home hope horse hot hour house how huge hundred hungry hurry hurt I
ice idea if in inside into is it its jump just keep kept key kind king knew know lady land
large last late laugh learn leave left leg less let letter light like listen little live
long look lost lot loud love made magic make man many mask may me mean meet men might mile
milk mind mine minute miss money monkey monster month moon more morning most mother mouse
mouth move much must my name near need never new next night no not nothing now number of
off often old on once one only open or other our out outside over own page paper part pass
past people perhaps person pick picture place plant play please point poor put queen quick
quickly quiet rabbit rain ran reach read ready real red remember rest rich ride right ring
river road rock roll room round run sad said same sat save saw say school sea second see
seem seen sent set seven shall she ship shoe shop short should shout show shut side sight
silver since sing sister sit six sky sleep slow slowly small smell smile snow so soft some
something sometimes son song soon sound speak spell spent stand star start stay step stick
still stone stood stop story straight strange street strong such suddenly summer sun
suppose sure surprise sweet swim table tail take talk tall teach tell ten than that the
their them then there these they thick thin thing think third this those though thought
three threw through throw tie tight time tiny to today together told tomorrow tonight too
took top touch toward town tree treasure tried trouble true try turn twelve twenty two
under until up upon us use very village visit voice wait wake walk wall want war warm was
watch water way we wear week well went were what when where which while white who whole
why wide wild will win wind window wing winter wish witch with wolf woman women wonder wood
word work world would write wrong yard year yellow yes yet you young your zoo`
  .split(/\s+/)
  .filter(Boolean);
