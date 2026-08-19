import { describe, expect, it } from 'vitest';
import { CORE_WORDS, SpellChecker, isCosmeticFix } from './index.js';
import { detectReversal } from './reversals.js';
import { editDistance, phoneticKey } from './phonetic.js';
import { lookupMisspelling } from './misspellings.js';

const checker = new SpellChecker({
  words: CORE_WORDS,
  properNouns: ['Ted', 'Nancy', 'Willow', 'Grimwood', 'Zorblax', 'Treebonk'],
});

describe('reversal detection', () => {
  // The whole reason this layer exists. A general-purpose checker fed "deb"
  // proposes "debt"/"den" and buries the actual diagnosis.
  it('diagnoses deb → bed as a reversal, not a spelling mistake', () => {
    const result = checker.checkWord('deb');
    expect(result).not.toBeNull();
    expect(result!.suggestion).toBe('bed');
    expect(result!.kind).toBe('reversal');
    expect(result!.confidence).toBe('high');
  });

  it.each([
    ['bog', 'dog'],
    ['dig', 'dig'], // already a word — must not be "corrected" to big
    ['bark', 'dark'],
  ])('handles %s', (input, expected) => {
    const result = checker.checkWord(input);
    if (input === expected) {
      expect(result).toBeNull();
    } else {
      expect(result?.suggestion).toBe(expected);
      expect(result?.kind).toBe('reversal');
    }
  });

  it('attaches the bed-hands mnemonic to b/d swaps', () => {
    const hit = detectReversal('deb', (w) => CORE_WORDS.includes(w));
    expect(hit?.pair).toBe('b/d');
    expect(hit?.mnemonic).toBe('bed-hands');
  });

  it('catches whole-word reversals like saw/was', () => {
    const hit = detectReversal('saw', (w) => w === 'was' || CORE_WORDS.includes(w));
    expect(hit?.fixed).toBe('was');
  });

  it('returns null when no swap produces a real word', () => {
    expect(detectReversal('xqzb', () => false)).toBeNull();
  });
});

describe('curated misspellings', () => {
  it.each([
    ['gos', 'goes'],
    ['sed', 'said'],
    ['thay', 'they'],
    ['becuase', 'because'],
    ['wen', 'when'],
    ['cort', 'caught'],
    ['freind', 'friend'],
    ['adventer', 'adventure'],
  ])('%s → %s', (wrong, right) => {
    expect(lookupMisspelling(wrong)).toBe(right);
  });

  it('preserves her capitalisation', () => {
    expect(lookupMisspelling('Gos')).toBe('Goes');
    expect(lookupMisspelling('GOS')).toBe('GOES');
  });

  it('reports curated fixes at high confidence', () => {
    expect(checker.checkWord('becuase')?.confidence).toBe('high');
  });
});

describe('story names', () => {
  // Underlining a name a child just invented teaches her that inventing
  // things is an error. This is the most important negative case here.
  it.each(['Ted', 'Nancy', 'Grimwood', 'Zorblax', 'Treebonk'])(
    'never flags %s',
    (name) => {
      expect(checker.checkWord(name)).toBeNull();
    },
  );

  it('accepts names added mid-session', () => {
    // "Nite" collides with a curated misspelling (nite → night), so a
    // character called Nite is exactly the case that would get wrongly
    // "corrected" if new names weren't registered as they're invented.
    const live = new SpellChecker({ words: CORE_WORDS });
    expect(live.checkWord('Nite')?.suggestion).toBe('Night');

    live.addProperNouns(['Nite']);
    expect(live.checkWord('Nite')).toBeNull();
  });

  it('leaves an unknown word alone when it has no plausible suggestion', () => {
    // Better to stay silent than to underline an invented word and offer
    // a nonsense alternative.
    const live = new SpellChecker({ words: CORE_WORDS });
    expect(live.checkWord('Zorblax')).toBeNull();
  });
});

describe('mastered words', () => {
  it('never flags a word she has mastered', () => {
    const withMastery = new SpellChecker({
      words: CORE_WORDS,
      mastered: ['becuase'],
    });
    expect(withMastery.checkWord('becuase')).toBeNull();
  });
});

describe('check() offsets', () => {
  it('reports positions that line up with the source text', () => {
    const text = 'she gos to deb';
    const findings = checker.check(text);
    for (const f of findings) {
      expect(text.slice(f.start, f.end)).toBe(f.word);
    }
  });

  it('finds both errors in "she gos to deb"', () => {
    const findings = checker.check('she gos to deb');
    const map = Object.fromEntries(findings.map((f) => [f.word, f.suggestion]));
    expect(map['gos']).toBe('goes');
    expect(map['deb']).toBe('bed');
  });
});

describe('normalise()', () => {
  it('cleans her sentence for the storyteller', () => {
    expect(checker.normalise('she gos to deb')).toBe('she goes to bed');
  });

  it('leaves low-confidence guesses alone', () => {
    // Silently "correcting" on a guess could change what she actually meant.
    const guessy = new SpellChecker({ words: ['orange'] });
    const before = 'zzqwx';
    expect(guessy.normalise(before)).toBe(before);
  });

  it('leaves correct text untouched', () => {
    const text = 'The dragon roared angrily at Ted.';
    expect(checker.normalise(text)).toBe(text);
  });
});

describe('cosmetic fixes never block a send', () => {
  it('treats a missing apostrophe as cosmetic', () => {
    // These all live in the curated table as high-confidence corrections,
    // so without this rule they would each stop her sending.
    expect(isCosmeticFix('dont', "don't")).toBe(true);
    expect(isCosmeticFix('cant', "can't")).toBe(true);
    expect(isCosmeticFix('its', "it's")).toBe(true);
  });

  it('treats capitalisation as cosmetic', () => {
    expect(isCosmeticFix('i', 'I')).toBe(true);
    expect(isCosmeticFix('nancy', 'Nancy')).toBe(true);
    expect(isCosmeticFix('im', "I'm")).toBe(true);
  });

  it('still counts a real spelling change as worth stopping for', () => {
    expect(isCosmeticFix('deb', 'bed')).toBe(false);
    expect(isCosmeticFix('germp', 'jump')).toBe(false);
    expect(isCosmeticFix('ski', 'sky')).toBe(false);
    expect(isCosmeticFix('becuase', 'because')).toBe(false);
  });
});

describe('phonetics', () => {
  it('collapses sounds that spell differently', () => {
    expect(phoneticKey('fone')).toBe(phoneticKey('phone'));
    expect(phoneticKey('nite')).toBe(phoneticKey('night'));
  });

  it('measures edit distance', () => {
    expect(editDistance('cat', 'cat')).toBe(0);
    expect(editDistance('cat', 'cut')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });

  it('bails out early past the cap', () => {
    expect(editDistance('a', 'abcdefghij', 3)).toBeGreaterThan(3);
  });
});
