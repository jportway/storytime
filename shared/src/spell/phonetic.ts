/**
 * Phonetic fallback for spellings the curated table doesn't know.
 *
 * Children spell by sound, so "fone"/"phone" and "nite"/"night" are the
 * common shape of a novel error. A plain edit-distance search ranks by
 * keyboard-typo similarity and gets these wrong; combining a phonetic key
 * with edit distance gets them right.
 *
 * This is a simplified Metaphone — enough to collapse the English sound
 * classes that matter here, without pulling in a dependency.
 */

export function phoneticKey(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';

  // Leading clusters that lose their first letter in speech.
  w = w
    .replace(/^kn/, 'n')
    .replace(/^gn/, 'n')
    .replace(/^pn/, 'n')
    .replace(/^wr/, 'r')
    .replace(/^ps/, 's')
    .replace(/^x/, 's');

  let key = w
    // Digraphs first, longest to shortest.
    // `ight` is handled before the general gh rule: the gh is silent, so
    // "night" and "nite" must produce the same key.
    .replace(/ight/g, 'AT')
    .replace(/tch/g, 'X')
    .replace(/sch/g, 'SK')
    .replace(/ph/g, 'F')
    // gh is silent far more often than it says "f" (night, though, through).
    // The handful where it doesn't — laugh, enough — are in the curated
    // misspelling table already, which outranks this layer anyway.
    .replace(/gh/g, '')
    .replace(/ck/g, 'K')
    .replace(/sh/g, 'X')
    .replace(/ch/g, 'X')
    .replace(/th/g, '0')
    .replace(/wh/g, 'W')
    .replace(/qu/g, 'KW')
    // Single letters to sound classes.
    .replace(/[aeiouy]/g, 'A')
    .replace(/[cq]/g, 'K')
    .replace(/[sz]/g, 'S')
    .replace(/[dt]/g, 'T')
    .replace(/[bp]/g, 'P')
    .replace(/[fv]/g, 'F')
    .replace(/[gj]/g, 'J')
    .replace(/[mn]/g, 'N')
    .toUpperCase();

  // Collapse runs, then drop interior vowels — they carry the least signal.
  // The leading sound is kept whatever it is, including a leading vowel.
  key = key.replace(/(.)\1+/g, '$1');
  if (!key) return '';
  return key[0]! + key.slice(1).replace(/A/g, '');
}

/** Levenshtein, bailing out early once the distance exceeds `max`. */
export function editDistance(a: string, b: string, max = 4): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j]! + 1,
        curr[j - 1]! + 1,
        prev[j - 1]! + cost,
      );
      rowMin = Math.min(rowMin, curr[j]!);
    }
    if (rowMin > max) return max + 1;
    [prev, curr] = [curr, prev];
  }

  return prev[b.length]!;
}

export interface PhoneticCandidate {
  word: string;
  distance: number;
}

/**
 * Best phonetic matches for a misspelled word.
 *
 * `candidates` should already be narrowed to words sharing the phonetic key
 * (see buildPhoneticIndex) — scanning a whole dictionary per keystroke would
 * be far too slow.
 */
export function rankCandidates(
  word: string,
  candidates: string[],
  limit = 3,
): PhoneticCandidate[] {
  const lower = word.toLowerCase();
  return candidates
    .map((c) => ({ word: c, distance: editDistance(lower, c) }))
    .filter((c) => c.distance <= 3)
    .sort((a, b) => a.distance - b.distance || a.word.length - b.word.length)
    .slice(0, limit);
}

/** Group a wordlist by phonetic key so lookup is O(1) rather than O(dictionary). */
export function buildPhoneticIndex(words: Iterable<string>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const word of words) {
    const key = phoneticKey(word);
    if (!key) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(word);
    else index.set(key, [word]);
  }
  return index;
}
