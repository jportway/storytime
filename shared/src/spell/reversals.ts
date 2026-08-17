/**
 * Letter-reversal detection.
 *
 * Cooper reverses `b` and `d`. This is her single hardest problem and it is
 * NOT a spelling problem — she knows the word perfectly well, her hand wrote
 * the mirror image of the letter. Treating it as a spelling mistake ("did you
 * mean 'debt'?") is both wrong and demoralising.
 *
 * So this layer runs FIRST and outranks every dictionary suggestion. A
 * general-purpose checker fed "deb" proposes "debt", "den", "deb" — all
 * plausible, all useless. Swapping b↔d yields "bed", which is obviously what
 * she meant, and lets the owl name the actual trick instead of the symptom.
 */

/** Pairs that are mirror images or near-mirrors of each other. */
const CONFUSABLE_PAIRS: readonly (readonly [string, string])[] = [
  ['b', 'd'], // Cooper's main one
  ['p', 'q'],
  ['b', 'p'],
  ['d', 'q'],
  ['m', 'w'],
  ['n', 'u'],
  ['s', 'z'],
];

/** Whole words that are each other reversed. */
const REVERSED_WORDS: Record<string, string> = {
  saw: 'was',
  was: 'saw',
  on: 'no',
  no: 'on',
  now: 'won',
  won: 'now',
  tub: 'but',
  but: 'tub',
  pit: 'tip',
  tip: 'pit',
  nap: 'pan',
  pan: 'nap',
  net: 'ten',
  ten: 'net',
  raw: 'war',
  war: 'raw',
  pot: 'top',
  top: 'pot',
};

export interface ReversalHit {
  /** The corrected word. */
  fixed: string;
  /** Which pair was swapped, e.g. "b/d". Used as the profile key. */
  pair: string;
  /** Indices in `fixed` of the letters involved — the board highlights these. */
  positions: number[];
  /** Named illustration for the board. */
  mnemonic?: string;
}

/**
 * Try to explain an unknown word as a letter reversal.
 *
 * `isKnownWord` is injected so this module stays dependency-free and
 * testable — the browser wires up a real dictionary, tests wire a fixture.
 * Returns null if no single swap produces a real word.
 */
export function detectReversal(
  word: string,
  isKnownWord: (w: string) => boolean,
): ReversalHit | null {
  const lower = word.toLowerCase();

  // Whole-word reversal first: "saw"/"was" is a real and distinct confusion,
  // and the letter-swap path would never find it.
  const whole = REVERSED_WORDS[lower];
  if (whole && isKnownWord(whole)) {
    return {
      fixed: whole,
      pair: 'word-reversal',
      positions: [...whole].map((_, i) => i),
    };
  }

  for (const [a, b] of CONFUSABLE_PAIRS) {
    // Only consider pairs actually present in the word.
    if (!lower.includes(a) && !lower.includes(b)) continue;

    const swapped = swapAll(lower, a, b);
    if (swapped !== lower && isKnownWord(swapped)) {
      return {
        fixed: swapped,
        pair: `${a}/${b}`,
        positions: positionsOf(swapped, [a, b]),
        mnemonic: mnemonicFor(a, b),
      };
    }

    // Also try swapping only one occurrence — "bed" written "bek"-style
    // errors are usually a single letter, not all of them.
    for (let i = 0; i < lower.length; i++) {
      const ch = lower[i]!;
      if (ch !== a && ch !== b) continue;
      const one =
        lower.slice(0, i) + (ch === a ? b : a) + lower.slice(i + 1);
      if (one !== lower && isKnownWord(one)) {
        return {
          fixed: one,
          pair: `${a}/${b}`,
          positions: [i],
          mnemonic: mnemonicFor(a, b),
        };
      }
    }
  }

  return null;
}

function swapAll(word: string, a: string, b: string): string {
  return [...word].map((c) => (c === a ? b : c === b ? a : c)).join('');
}

function positionsOf(word: string, letters: string[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < word.length; i++) {
    if (letters.includes(word[i]!)) out.push(i);
  }
  return out;
}

/**
 * The board illustration for a pair. `bed-hands` draws the classic trick:
 * make fists with both thumbs up and they spell "bed" — b on the left, d on
 * the right — so the b always comes first.
 */
function mnemonicFor(a: string, b: string): string | undefined {
  const pair = [a, b].sort().join('');
  if (pair === 'bd') return 'bed-hands';
  if (pair === 'pq') return 'pq-mirror';
  return undefined;
}

/** Is this pair one we track in the profile? */
export function isTrackedPair(pair: string): boolean {
  return pair !== 'word-reversal';
}
