import { CORE_WORDS, SpellChecker, type Profile } from '@storytime/shared';

/**
 * The browser's spell checker.
 *
 * The core wordlist is small but the layers that matter most for Cooper —
 * reversal detection and the curated child-misspelling table — don't depend
 * on dictionary breadth at all. A larger dictionary mainly improves the
 * low-confidence phonetic fallback, which never triggers a correction on its
 * own, so this is a good trade for zero load time and offline operation.
 *
 * To grow it later: `npm i nspell dictionary-en-gb`, load the affix and
 * dictionary files, and pass every word into `words` below.
 */
export function buildChecker(opts: {
  storyNames: string[];
  profile: Profile | null;
}): SpellChecker {
  const extra: Record<string, string> = {};
  for (const [correct, record] of Object.entries(
    opts.profile?.misspellings ?? {},
  )) {
    for (const wrong of record.wrongForms) {
      extra[wrong.toLowerCase()] = correct;
    }
  }

  return new SpellChecker({
    words: CORE_WORDS,
    properNouns: opts.storyNames,
    mastered: opts.profile?.mastered ?? [],
    extraMisspellings: extra,
  });
}
