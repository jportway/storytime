import { describe, expect, it } from 'vitest';
import { makeGrimwoodBible, type BibleDelta } from '@storytime/shared';
import { applyDelta, computeCredit, properNouns, serializeBible } from './bible.js';

const emptyDelta = (): BibleDelta => ({
  newCharacters: [],
  characterUpdates: [],
  newPlaces: [],
  newThings: [],
  thingUpdates: [],
  newThreads: [],
  resolvedThreads: [],
  worldRulesLearned: [],
  beatSummary: '',
  sceneUpdate: {
    placeId: 'grimwood-clearing',
    presentCharacterIds: ['ted'],
    situation: 'Something happened.',
    decisionPoint: 'What now?',
  },
});

describe('applyDelta', () => {
  it('adds a new character and credits Cooper', () => {
    const bible = makeGrimwoodBible('t1');
    const { bible: next, whatsNew } = applyDelta(
      bible,
      {
        ...emptyDelta(),
        newCharacters: [
          {
            id: 'grimble',
            name: 'Grimble',
            role: 'creature',
            createdBy: 'cooper',
            traits: ['smelly'],
            wants: 'cake',
            description: 'A goblin who just wants cake.',
            appearance: 'A small green goblin.',
            voice: 'Squeaky.',
            examples: [],
            status: 'fine',
            location: 'deep-wood',
            carrying: [],
            relationships: [],
            secrets: [],
          },
        ],
      },
      1,
    );

    expect(next.characters.find((c) => c.id === 'grimble')).toBeDefined();
    expect(whatsNew).toContain('You invented Grimble!');
  });

  it('keeps the dead dead', () => {
    const bible = makeGrimwoodBible('t2');
    const killed = applyDelta(
      bible,
      {
        ...emptyDelta(),
        characterUpdates: [
          { id: 'eric', statusChange: 'dead', statusNote: 'Squashed.' },
        ],
      },
      1,
    ).bible;

    expect(killed.characters.find((c) => c.id === 'eric')?.status).toBe('dead');

    // A later no-op delta must not quietly revive him.
    const later = applyDelta(killed, emptyDelta(), 2).bible;
    expect(later.characters.find((c) => c.id === 'eric')?.status).toBe('dead');

    // And the dead are excluded from the cast the storyteller is shown.
    expect(serializeBible(later)).toContain('Gone (do not bring these back');
  });

  it('keeps lost things lost', () => {
    const bible = makeGrimwoodBible('t3');
    const next = applyDelta(
      bible,
      {
        ...emptyDelta(),
        thingUpdates: [{ id: 'the-tail', statusChange: 'lost' }],
      },
      1,
    ).bible;

    expect(next.things.find((t) => t.id === 'the-tail')?.status).toBe('lost');
  });

  it('moves items between characters', () => {
    const bible = makeGrimwoodBible('t4');
    const next = applyDelta(
      bible,
      {
        ...emptyDelta(),
        characterUpdates: [
          { id: 'buttons', nowLost: ['brain-zapper'] },
          { id: 'nancy', nowCarrying: ['brain-zapper'] },
        ],
      },
      1,
    ).bible;

    expect(next.characters.find((c) => c.id === 'buttons')?.carrying).not.toContain(
      'brain-zapper',
    );
    expect(next.characters.find((c) => c.id === 'nancy')?.carrying).toContain(
      'brain-zapper',
    );
  });

  it('ignores updates to ids that do not exist', () => {
    // Bookkeeping must never be able to crash the game.
    const bible = makeGrimwoodBible('t5');
    expect(() =>
      applyDelta(
        bible,
        {
          ...emptyDelta(),
          characterUpdates: [{ id: 'nobody', statusChange: 'dead' }],
          thingUpdates: [{ id: 'nothing', statusChange: 'broken' }],
          resolvedThreads: [{ id: 'nonexistent', resolution: 'x' }],
        },
        1,
      ),
    ).not.toThrow();
  });

  it('does not duplicate a character added twice', () => {
    const bible = makeGrimwoodBible('t6');
    const delta = {
      ...emptyDelta(),
      newCharacters: [
        {
          id: 'ted',
          name: 'Ted',
          role: 'hero' as const,
          createdBy: 'ai' as const,
          traits: [],
          wants: '',
          description: '',
          appearance: '',
          voice: '',
          examples: [],
          status: 'fine' as const,
          location: 'grimwood-clearing',
          carrying: [],
          relationships: [],
          secrets: [],
        },
      ],
    };
    const next = applyDelta(bible, delta, 1).bible;
    expect(next.characters.filter((c) => c.id === 'ted')).toHaveLength(1);
  });

  it('resolves an open thread', () => {
    const bible = makeGrimwoodBible('t7');
    const next = applyDelta(
      bible,
      {
        ...emptyDelta(),
        resolvedThreads: [
          { id: 'the-hidden-tail', resolution: 'Nancy found it.' },
        ],
      },
      3,
    ).bible;

    const thread = next.threads.find((t) => t.id === 'the-hidden-tail');
    expect(thread?.status).toBe('resolved');
    expect(thread?.resolution).toBe('Nancy found it.');
  });

  it('does not mutate the bible it was given', () => {
    const bible = makeGrimwoodBible('t8');
    const before = structuredClone(bible);
    applyDelta(
      bible,
      {
        ...emptyDelta(),
        characterUpdates: [{ id: 'ted', statusChange: 'hurt' }],
      },
      1,
    );
    expect(bible).toEqual(before);
  });
});

describe('makeGrimwoodBible', () => {
  it('gives each story its own copy of the cast', () => {
    // Two stories sharing the module-level preset would leak one story's
    // events into the other.
    const a = makeGrimwoodBible('a');
    const b = makeGrimwoodBible('b');
    a.characters[0]!.status = 'dead';
    expect(b.characters[0]!.status).toBe('fine');
  });
});

describe('computeCredit', () => {
  it('counts only what Cooper made', () => {
    const bible = makeGrimwoodBible('t9');
    bible.beats.push({
      n: 1,
      panels: [],
      fork: '',
      cooperDirection: 'she runs away fast',
      cooperDirectionRaw: 'she runs away fast',
      cooperWordCount: 4,
      createdAt: new Date().toISOString(),
    });

    const credit = computeCredit(bible);
    expect(credit.wordsWritten).toBe(4);
    expect(credit.beatsDirected).toBe(1);
    // The starting Grimwood cast is all AI-created.
    expect(credit.charactersInvented).toHaveLength(0);
  });
});

describe('properNouns', () => {
  it('includes every name in play, split into words', () => {
    const names = properNouns(makeGrimwoodBible('t10'));
    expect(names).toContain('Ted');
    expect(names).toContain('Nancy');
    // "Eric Dynamite" must contribute both halves.
    expect(names).toContain('Eric');
    expect(names).toContain('Dynamite');
  });
});
