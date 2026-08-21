import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, updateProfile } from './store.js';

const fresh = () => structuredClone(EMPTY_PROFILE);

describe('updateProfile', () => {
  it('counts the words she actually typed', () => {
    const next = updateProfile(fresh(), {
      raw: 'ted gos to the deb',
      corrected: 'ted goes to the bed',
      findings: [],
    });
    expect(next.totals.wordsWritten).toBe(5);
    expect(next.totals.beatsDirected).toBe(1);
  });

  it('records which letter pair she reversed, not the word', () => {
    // The pattern is what the owl needs to know; the specific word is
    // incidental.
    const next = updateProfile(fresh(), {
      raw: 'he is in deb',
      corrected: 'he is in bed',
      findings: [{ word: 'deb', suggestion: 'bed', kind: 'reversal' }],
    });

    expect(next.reversals['b/d']?.seen).toBe(1);
    expect(next.reversals['b/d']?.recentExamples).toContain('deb');
  });

  it('marks a word mastered after three clean uses', () => {
    let profile = updateProfile(fresh(), {
      raw: 'becuase',
      corrected: 'because',
      findings: [{ word: 'becuase', suggestion: 'because', kind: 'spelling' }],
    });
    expect(profile.misspellings['because']?.mastered).toBe(false);

    for (let i = 0; i < 3; i++) {
      profile = updateProfile(profile, {
        raw: 'because it was fun',
        corrected: 'because it was fun',
        findings: [],
      });
    }

    expect(profile.misspellings['because']?.mastered).toBe(true);
    expect(profile.mastered).toContain('because');
  });

  it('un-masters a word if she gets it wrong again', () => {
    // Being told "you've mastered this" and then getting it wrong would be
    // worse than never having been told, so mastery has to be revocable.
    let profile = fresh();
    profile.misspellings['because'] = {
      wrongForms: ['becuase'],
      seen: 1,
      correctSinceLastError: 3,
      mastered: true,
    };
    profile.mastered = ['because'];

    profile = updateProfile(profile, {
      raw: 'becuase',
      corrected: 'because',
      findings: [{ word: 'becuase', suggestion: 'because', kind: 'spelling' }],
    });

    expect(profile.misspellings['because']?.mastered).toBe(false);
    expect(profile.mastered).not.toContain('because');
  });

  it('does not credit progress on a word she got wrong this turn', () => {
    let profile = fresh();
    profile.misspellings['because'] = {
      wrongForms: ['becuase'],
      seen: 1,
      correctSinceLastError: 2,
      mastered: false,
    };

    // The corrected text contains "because" only because we fixed it — that
    // must not count as her spelling it right.
    profile = updateProfile(profile, {
      raw: 'becuase he ran',
      corrected: 'because he ran',
      findings: [{ word: 'becuase', suggestion: 'because', kind: 'spelling' }],
    });

    expect(profile.misspellings['because']?.correctSinceLastError).toBe(0);
  });

  it('does not mutate the profile it was given', () => {
    const profile = fresh();
    const before = structuredClone(profile);
    updateProfile(profile, {
      raw: 'hello there',
      corrected: 'hello there',
      findings: [],
    });
    expect(profile).toEqual(before);
  });
});

describe('updateProfile — no-op corrections', () => {
  it('ignores a correction that changes nothing', () => {
    // The local checker can hand back a finding whose suggestion is the word
    // itself. Filed as-is it becomes a misspelling of itself and the owl
    // starts helping with a word she got right.
    const next = updateProfile(fresh(), {
      raw: 'Ted looked up',
      corrected: 'Ted looked up',
      findings: [{ word: 'looked', suggestion: 'looked', kind: 'spelling' }],
    });

    expect(next.misspellings).toEqual({});
    expect(next.mastered).toEqual([]);
    expect(next.totals.beatsDirected).toBe(1);
  });

  it('still records a correction that does change something', () => {
    const next = updateProfile(fresh(), {
      raw: 'ted hides unber the deb',
      corrected: 'ted hides under the bed',
      findings: [{ word: 'deb', suggestion: 'bed', kind: 'reversal' }],
    });

    expect(next.misspellings.bed?.wrongForms).toEqual(['deb']);
    expect(Object.keys(next.reversals)).toContain('b/d');
  });
});
