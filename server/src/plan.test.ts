import { describe, expect, it } from 'vitest';
import {
  GRIMWOOD_TEMPLATE,
  makeGrimwoodBible,
  type Arc,
  type StoryPlan,
} from '@storytime/shared';
import {
  applyPlanUpdate,
  availableTrouble,
  dealArc,
  serializePlanNote,
  type PlanUpdate,
} from './plan.js';

const arcs = (): Arc[] => [
  {
    id: 'a',
    name: 'Arc A',
    destination: 'they get the cake home',
    phases: [
      { name: 'setup', intent: 'set it up' },
      { name: 'middle', intent: 'make it worse' },
      { name: 'end', intent: 'land it' },
    ],
  },
  {
    id: 'b',
    name: 'Arc B',
    destination: 'the truth comes out',
    phases: [{ name: 'only', intent: 'the whole thing' }],
  },
];

const update = (over: Partial<PlanUpdate> = {}): PlanUpdate => ({
  phaseComplete: false,
  nowPlayed: [],
  nextMove: { instrument: 'fork', intent: 'the bins' },
  sheIsDriving: false,
  ...over,
});

describe('dealArc', () => {
  it('returns null when the template has no arcs', () => {
    expect(dealArc([], 0)).toBeNull();
    expect(dealArc(undefined, 0)).toBeNull();
  });

  it('skips arcs with no phases rather than dealing an empty one', () => {
    const broken: Arc[] = [
      { id: 'x', name: 'X', destination: 'nowhere', phases: [] },
    ];
    expect(dealArc(broken, 0)).toBeNull();
  });

  it('freezes the destination and phases at deal time', () => {
    const plan = dealArc([arcs()[0]!], 0)!;
    expect(plan.destination).toBe('they get the cake home');
    expect(plan.phases).toHaveLength(3);
    expect(plan.phase).toBe(0);
    expect(plan.landing).toBe(false);
  });

  it('deals a different arc from the one just finished', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(dealArc(arcs(), 10, 'a')!.arcId).toBe('b');
    }
  });

  it('falls back to repeating rather than dealing nothing', () => {
    expect(dealArc([arcs()[0]!], 10, 'a')!.arcId).toBe('a');
  });
});

describe('applyPlanUpdate', () => {
  it('never lets the phase go backwards over a long story', () => {
    let plan = dealArc([arcs()[0]!], 0)!;
    const seen: number[] = [plan.phase];

    // Thrash it: complete, don't complete, drive, don't drive, in a pattern
    // that has no relationship to the arc.
    for (let beat = 1; beat <= 30; beat += 1) {
      plan = applyPlanUpdate(
        plan,
        update({
          phaseComplete: beat % 4 !== 0,
          sheIsDriving: beat % 5 === 0,
        }),
        beat,
      );
      seen.push(plan.phase);
    }

    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    }
    // And it stops at the last phase rather than running off the end.
    expect(Math.max(...seen)).toBe(2);
  });

  it('advances at most one phase per beat', () => {
    let plan = dealArc([arcs()[0]!], 0)!;
    plan = applyPlanUpdate(plan, update({ phaseComplete: true }), 1);
    expect(plan.phase).toBe(1);
    plan = applyPlanUpdate(plan, update({ phaseComplete: true }), 2);
    expect(plan.phase).toBe(2);
  });

  it('moves the story on when a phase has run too long', () => {
    // Three phases against a target of 16 gives a ceiling of six beats each.
    let plan = dealArc([arcs()[0]!], 0)!;
    for (let beat = 1; beat < 6; beat += 1) {
      plan = applyPlanUpdate(plan, update(), beat);
      expect(plan.phase).toBe(0);
    }
    plan = applyPlanUpdate(plan, update(), 6);
    expect(plan.phase).toBe(1);
  });

  it('lets a story run 15–20 beats when nothing tells it to move on', () => {
    // The realistic case: a director that never commits to a phase being
    // finished, so the backstop alone decides. Both arc shapes in play — the
    // seeded five-phase ones and Cooperworld's eight-phase party arc — have
    // to land in the same comfortable range, which is the whole reason the
    // ceiling is derived from the arc rather than fixed.
    for (const phaseCount of [3, 5, 8]) {
      const arc: Arc = {
        id: `a${phaseCount}`,
        name: 'Shape',
        destination: 'somewhere',
        phases: Array.from({ length: phaseCount }, (_, i) => ({
          name: `p${i}`,
          intent: 'x',
        })),
      };
      let plan = dealArc([arc], 0)!;
      let landedAt = 0;
      for (let beat = 1; beat <= 60 && !landedAt; beat += 1) {
        plan = applyPlanUpdate(plan, update({ phaseComplete: false }), beat);
        if (plan.landing) landedAt = beat;
      }
      expect(landedAt).toBeGreaterThanOrEqual(13);
      expect(landedAt).toBeLessThanOrEqual(20);
    }
  });

  it('still lets the director bring a story home early', () => {
    // Ten was too short as a default, but a story that genuinely finishes
    // its shape quickly should not be padded out to sixteen.
    let plan = dealArc([arcs()[0]!], 0)!;
    let landedAt = 0;
    for (let beat = 1; beat <= 30 && !landedAt; beat += 1) {
      plan = applyPlanUpdate(plan, update({ phaseComplete: true }), beat);
      if (plan.landing) landedAt = beat;
    }
    expect(landedAt).toBe(3);
  });

  it('does not drift: the destination survives a whole story', () => {
    let plan = dealArc([arcs()[0]!], 0)!;
    const destination = plan.destination;
    const phases = JSON.stringify(plan.phases);

    for (let beat = 1; beat <= 15; beat += 1) {
      plan = applyPlanUpdate(
        plan,
        update({
          phaseComplete: beat % 2 === 0,
          sheIsDriving: beat % 3 === 0,
          nowPlayed: [`card-${beat}`],
        }),
        beat,
      );
      expect(plan.destination).toBe(destination);
      expect(JSON.stringify(plan.phases)).toBe(phases);
      expect(plan.arcId).toBe('a');
    }
  });

  it('spends each card once', () => {
    let plan = dealArc([arcs()[0]!], 0)!;
    plan = applyPlanUpdate(plan, update({ nowPlayed: ['tail', 'tail'] }), 1);
    plan = applyPlanUpdate(plan, update({ nowPlayed: ['tail'] }), 2);
    expect(plan.played).toEqual(['tail']);
  });

  it('lands once the last phase has had a beat, not the moment it starts', () => {
    let plan = dealArc([arcs()[0]!], 0)!;
    plan = applyPlanUpdate(plan, update({ phaseComplete: true }), 1);
    plan = applyPlanUpdate(plan, update({ phaseComplete: true }), 2);
    expect(plan.phase).toBe(2);
    expect(plan.landing).toBe(false);
    plan = applyPlanUpdate(plan, update(), 3);
    expect(plan.landing).toBe(true);
  });

  it('survives a director that returns nothing at all', () => {
    let plan = dealArc([arcs()[0]!], 0)!;
    plan = applyPlanUpdate(plan, null, 1);
    expect(plan.phase).toBe(0);
    expect(plan.nextMove.instrument).toBe('none');
  });

  it('will not let something happen to her story while she is driving', () => {
    let plan = dealArc([arcs()[0]!], 0)!;
    plan = applyPlanUpdate(
      plan,
      update({
        sheIsDriving: true,
        nextMove: { instrument: 'complication', intent: 'the roof caves in' },
      }),
      1,
    );
    // Downgraded, not discarded: the aim survives, the intrusion does not.
    expect(plan.nextMove.instrument).toBe('fork');
    expect(plan.nextMove.intent).toBe('the roof caves in');
  });

  it('leaves the complication alone when she is not driving', () => {
    let plan = dealArc([arcs()[0]!], 0)!;
    plan = applyPlanUpdate(
      plan,
      update({
        sheIsDriving: false,
        nextMove: { instrument: 'complication', intent: 'the roof caves in' },
      }),
      1,
    );
    expect(plan.nextMove.instrument).toBe('complication');
  });

  it('discards a malformed move rather than passing it to the prompt', () => {
    let plan = dealArc([arcs()[0]!], 0)!;
    plan = applyPlanUpdate(
      plan,
      update({ nextMove: { instrument: 'sideways' as never, intent: 'x' } }),
      1,
    );
    expect(plan.nextMove.instrument).toBe('none');
  });
});

describe('serializePlanNote', () => {
  const planWith = (over: Partial<StoryPlan>): StoryPlan => ({
    ...dealArc([arcs()[0]!], 0)!,
    nextMove: { instrument: 'fork', intent: 'the open bin' },
    ...over,
  });

  it('still aims the fork while she is driving — an offer is not a shove', () => {
    const note = serializePlanNote(planWith({ sheIsDriving: true }));
    expect(note).toContain('Aim the fork at: the open bin');
  });

  it('says nothing when there is no move to make', () => {
    const quiet = planWith({ nextMove: { instrument: 'none', intent: '' } });
    expect(serializePlanNote(quiet)).toBe('');
  });

  it('says nothing when there is no plan', () => {
    expect(serializePlanNote(null)).toBe('');
    expect(serializePlanNote(undefined)).toBe('');
  });

  it('aims the fork', () => {
    const note = serializePlanNote(planWith({}));
    expect(note).toContain('Aim the fork at: the open bin');
    expect(note).toContain('Never repeat any of this to Cooper');
  });

  it('asks for a landing, and names the destination, at the end', () => {
    const note = serializePlanNote(planWith({ landing: true, phase: 2 }));
    expect(note).toContain('land the story');
    expect(note).toContain('they get the cake home');
  });

  it('names the complication when that is the instrument', () => {
    const note = serializePlanNote(
      planWith({ nextMove: { instrument: 'complication', intent: 'Eric' } }),
    );
    expect(note).toContain('one small complication be: Eric');
  });
});

describe('availableTrouble', () => {
  it('offers what Cooper invented before anything we wrote', () => {
    const bible = makeGrimwoodBible('t1');
    bible.plan = dealArc([arcs()[0]!], 0);
    bible.trouble = [{ id: 'card', text: 'A card.', suits: [] }];
    bible.characters.push({
      ...bible.characters[0]!,
      id: 'slimey',
      name: 'Slimey',
      createdBy: 'cooper',
    });

    const offered = availableTrouble(bible);
    expect(offered[0]).toContain('Slimey');
    expect(offered[0]).toContain('Cooper invented');
    expect(offered.some((t) => t.startsWith('card —'))).toBe(true);
  });

  it('does not offer a card twice', () => {
    const bible = makeGrimwoodBible('t1');
    bible.plan = { ...dealArc([arcs()[0]!], 0)!, played: ['card'] };
    bible.trouble = [{ id: 'card', text: 'A card.', suits: [] }];
    expect(availableTrouble(bible)).toEqual([]);
  });

  it('holds back a card that does not suit the phase', () => {
    const bible = makeGrimwoodBible('t1');
    bible.plan = dealArc([arcs()[0]!], 0);
    bible.trouble = [{ id: 'late', text: 'Late.', suits: ['end'] }];
    expect(availableTrouble(bible)).toEqual([]);

    bible.plan = { ...bible.plan!, phase: 2 };
    expect(availableTrouble(bible)).toHaveLength(1);
  });
});

describe('the shipped template', () => {
  it('has no trouble card that can never be played', () => {
    // `suits` is matched against phase names by string equality, so a typo or
    // a leftover from a deleted arc doesn't error — the card simply never
    // comes up, for the life of the template. This has already happened once:
    // "setbakcs" for "setbacks", and two suits still naming phases from arcs
    // that had been replaced.
    const phases = new Set(
      (GRIMWOOD_TEMPLATE.arcs ?? []).flatMap((a) =>
        (a.phases ?? []).map((p) => p.name),
      ),
    );

    const unplayable = (GRIMWOOD_TEMPLATE.trouble ?? [])
      .filter((c) => c.suits?.length)
      .map((c) => ({
        id: c.id,
        stale: c.suits.filter((s) => !phases.has(s)),
      }))
      .filter((c) => c.stale.length > 0);

    expect(unplayable).toEqual([]);
  });

  it('has arcs whose phases all say what they are for', () => {
    for (const arc of GRIMWOOD_TEMPLATE.arcs ?? []) {
      expect(arc.destination.trim()).not.toBe('');
      expect(arc.phases.length).toBeGreaterThan(1);
      for (const phase of arc.phases) {
        expect(phase.name.trim()).not.toBe('');
        expect(phase.intent.trim()).not.toBe('');
      }
    }
  });
});
