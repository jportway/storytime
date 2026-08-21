/**
 * The director's bookkeeping — everything about the arc that is not judgement.
 *
 * The division of labour here is the point. Code owns the skeleton: which
 * phase we are in, how long we have been in it, which cards are spent. The
 * model owns only the judgement that genuinely needs a reader — is she driving
 * this herself, and what should the next beat reach for.
 *
 * That split is what stops the plan dissolving. A model handed a plan and
 * asked to revise it against what just happened will rewrite the plan to
 * describe what just happened, so a prose plan becomes a summary within a few
 * turns. Here the destination is simply not something the model can express a
 * change to, and the phase index is advanced by the rules below rather than by
 * being asked nicely.
 *
 * Like `applyDelta`, everything is total and forgiving. A director that
 * returns nonsense must never be able to crash the game.
 */

import type {
  Arc,
  PlanMove,
  StoryBible,
  StoryPlan,
  TroubleCard,
} from '@storytime/shared';

/**
 * Roughly how long a story wants to be. A very loose guide, never a deadline.
 *
 * Ten turns turned out to be too short to feel like a story rather than an
 * anecdote. Fifteen to twenty is comfortable, and nothing here should ever
 * hurry a story that is going well — the ceiling below is a backstop against
 * idling, not a pace to hit.
 */
export const TARGET_BEATS = 16;

/**
 * How long a phase may last before it is moved along regardless.
 *
 * Derived from the arc rather than fixed, because arcs are authored in
 * /admin and do not all have the same number of phases — the Cooperworld
 * party arc has eight where the seeded ones had five. A fixed number would
 * silently mean "eight phases is twice as long a story as five", which is an
 * odd thing for the phase count to control.
 *
 * This is only a backstop. Without it a story idles: every turn looks locally
 * like the phase is not quite finished, and enough "not quite yet"s is how a
 * story stops arriving anywhere at all. The director advancing a phase on its
 * own judgement is the normal path and gives the shorter, brisker stories.
 */
function maxBeatsInPhase(phaseCount: number): number {
  return Math.max(2, Math.ceil(TARGET_BEATS / Math.max(1, phaseCount)));
}

/** The mutable slice of a plan — exactly what the director may return. */
export interface PlanUpdate {
  /** True when this phase's work is done and the story should move on. */
  phaseComplete: boolean;
  /** Cards or inventions spent in the beat just written. */
  nowPlayed: string[];
  nextMove: PlanMove;
  sheIsDriving: boolean;
}

/**
 * Choose an arc and freeze it into a plan.
 *
 * `avoid` is the arc just finished, so a second arc dealt in the same session
 * is a different shape — two consecutive rescues would read as repetition even
 * though each is individually fine.
 */
export function dealArc(
  arcs: Arc[] | undefined,
  atBeat: number,
  avoid?: string | null,
): StoryPlan | null {
  const available = (arcs ?? []).filter(
    (a) => a && Array.isArray(a.phases) && a.phases.length > 0,
  );
  if (!available.length) return null;

  const pool = available.filter((a) => a.id !== avoid);
  const from = pool.length ? pool : available;
  const arc = from[Math.floor(Math.random() * from.length)]!;

  return {
    arcId: arc.id,
    arcName: arc.name,
    destination: arc.destination,
    phases: structuredClone(arc.phases),
    dealtAtBeat: atBeat,
    phase: 0,
    beatsInPhase: 0,
    played: [],
    nextMove: { instrument: 'none', intent: '' },
    sheIsDriving: false,
    landing: false,
  };
}

/**
 * Fold a director update into the plan.
 *
 * The frozen fields are copied across untouched — not because the director is
 * trusted not to change them, but because it is never given them to change.
 */
export function applyPlanUpdate(
  plan: StoryPlan,
  update: PlanUpdate | null,
  beatNumber: number,
): StoryPlan {
  const next = structuredClone(plan);
  const lastPhase = Math.max(0, next.phases.length - 1);

  next.beatsInPhase += 1;

  if (update) {
    for (const id of update.nowPlayed ?? []) {
      if (id && !next.played.includes(id)) next.played.push(id);
    }
    next.sheIsDriving = Boolean(update.sheIsDriving);
    next.nextMove = sanitiseMove(update.nextMove);

    // She has momentum, so nothing may *happen* to her story this turn. The
    // aim of the closing line still goes through: a fork is an offer she can
    // walk straight past, whereas a complication is the engine actually
    // spending a turn of her story on its own purposes.
    if (next.sheIsDriving && next.nextMove.instrument === 'complication') {
      next.nextMove = { ...next.nextMove, instrument: 'fork' };
    }
  }

  // Advance on the director's say-so, or because the phase has run long. One
  // step at a time: skipping a phase loses the shape the arc exists to give.
  const stalled = next.beatsInPhase >= maxBeatsInPhase(next.phases.length);
  if ((update?.phaseComplete || stalled) && next.phase < lastPhase) {
    next.phase += 1;
    next.beatsInPhase = 0;
  }

  // The last phase is the resolution, so that is where the story lands. It
  // needs a beat in the phase first — landing on entry would resolve the
  // story in the same breath as arriving at the climax.
  next.landing = next.phase >= lastPhase && next.beatsInPhase >= 1;

  // A landing beat is the one place the director must speak, so that the
  // storyteller is told to close rather than fork.
  if (next.landing && next.nextMove.instrument === 'none') {
    next.nextMove = {
      instrument: 'fork',
      intent: next.destination,
    };
  }

  void beatNumber;
  return next;
}

/** Keep a malformed move from reaching the prompt. */
function sanitiseMove(move: PlanMove | undefined): PlanMove {
  const instrument =
    move?.instrument === 'fork' || move?.instrument === 'complication'
      ? move.instrument
      : 'none';
  const intent = typeof move?.intent === 'string' ? move.intent.trim() : '';
  if (!intent) return { instrument: 'none', intent: '' };
  return { instrument, intent };
}

/**
 * The cards still in hand, best first.
 *
 * Things Cooper invented come first and it is not a close call. Pressure built
 * from her own material steers the story *and* hands her back something she
 * made, which is the only lever here that doesn't spend a little of her
 * authorship to buy control.
 */
export function availableTrouble(bible: StoryBible): string[] {
  const plan = bible.plan;
  const spent = new Set(plan?.played ?? []);
  const phaseName = plan?.phases?.[plan.phase]?.name ?? '';

  const hers = [
    ...(bible.characters ?? []),
    ...(bible.things ?? []),
    ...(bible.places ?? []),
  ]
    .filter((x) => x && x.createdBy === 'cooper' && !spent.has(x.id))
    .map((x) => `${x.id} — ${x.name}, which Cooper invented`);

  const cards = (bible.trouble ?? [])
    .filter((c): c is TroubleCard => Boolean(c && c.id && c.text))
    .filter((c) => !spent.has(c.id))
    .filter((c) => !c.suits?.length || c.suits.includes(phaseName))
    .map((c) => `${c.id} — ${c.text}`);

  return [...hers, ...cards];
}

/**
 * The stage note appended to Cooper's direction, or '' for silence.
 *
 * Silence is a real and frequent answer: the director returns `none` whenever
 * it has nothing worth saying, and a story that gets a note every single turn
 * is being nagged rather than steered.
 *
 * Note the one thing this deliberately does *not* do: it does not go silent
 * merely because she was driving last turn. It cannot — `sheIsDriving`
 * describes the beat that has already been written, while this note travels
 * with the direction she is about to give, which nobody has read yet.
 * Suppressing on it silenced the director for six turns of an eight-turn
 * replay, including the one input in the whole script vague enough to
 * actually need steering. What driving suppresses instead is the
 * complication, in applyPlanUpdate — the only instrument that spends a turn
 * of her story rather than merely offering her something.
 *
 * It stays short because it lives in the conversation permanently: the
 * transcript is append-only so that the prompt cache survives, which means
 * every note ever written is still in context at beat thirty.
 */
export function serializePlanNote(plan: StoryPlan | null | undefined): string {
  if (!plan) return '';
  if (plan.nextMove.instrument === 'none' || !plan.nextMove.intent) return '';

  const phase = plan.phases[plan.phase];

  const lines = [
    '[Stage note — not part of the story. Never repeat any of this to Cooper.]',
    // Position in the shape, deliberately not a beat count. "Beat 6 of 10"
    // reads as a deadline and made the storyteller start closing things down.
    `Phase: ${phase?.name ?? 'the end'} (${plan.phase + 1} of ${plan.phases.length}). No hurry.`,
  ];

  if (plan.landing) {
    lines.push(
      'This beat should land the story: resolve it, do not leave her on a cliff.',
      `Where it has been heading: ${plan.destination}`,
    );
  } else if (plan.nextMove.instrument === 'fork') {
    lines.push(`Aim the fork at: ${plan.nextMove.intent}`);
  } else {
    lines.push(`Let the one small complication be: ${plan.nextMove.intent}`);
  }

  return lines.join('\n');
}

/** The plan as the storyteller sees it when re-grounding. */
export function serializePlanForReground(
  plan: StoryPlan | null | undefined,
): string {
  if (!plan) return '';
  const phase = plan.phases[plan.phase];
  return [
    '## Where this is quietly heading (never tell Cooper any of this)',
    `${plan.destination}`,
    `Currently in: ${phase?.name ?? 'the end'}${
      phase?.intent ? ` — ${phase.intent}` : ''
    }`,
  ].join('\n');
}
