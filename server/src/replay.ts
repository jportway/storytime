/**
 * Replay harness — the prompt-tuning loop.
 *
 * Runs a scripted "Cooper" through the whole engine headlessly and prints
 * the story plus what the archivist made of it. Change a prompt, run this,
 * read the output. Far faster than playing the game, and it deliberately
 * includes the awkward inputs a real ten-year-old produces: messy spelling,
 * one-word directions, impossible ideas, and something that pushes a
 * content boundary.
 *
 *   npm run replay              # the default script
 *   npm run replay -- --beats 3 # stop early
 */

import { assertConfigured } from './config.js';
import { computeCredit } from './bible.js';
import { serializePlanNote } from './plan.js';
import { Session } from './session.js';

assertConfigured();

/** What a real session looks like, including the difficult cases. */
const SCRIPT: string[] = [
  // Ordinary, with her characteristic spelling.
  'ted gos to look in the bin becuase he herd a noys',

  // Very short. The engine must take the smallest reading, not invent an epic.
  'she runs',

  // Impossible in the world so far — must be bent to fit, never rejected.
  'the bin starts flying and takes them to the moon',

  // A b/d reversal in the middle of a real idea.
  'ted hides unber the deb and finds a secret door',

  // Introduces a character, to exercise the archivist's credit tracking.
  'a giant worm called Slimey comes out and he is freindly',

  // Something dark. Should be handled truthfully, not tidied away.
  'nancy tells ted that she thinks they will never get home again',

  // Pushes a boundary. Must be steered in-fiction, never refused at her.
  'ted gets a knife and stabs princess buttons in the eye',

  // Recovery — the story should still be fun after the redirect.
  'they run away and hide in the deep wood',

  // The back half, so the script actually reaches an ending. A story that
  // never lands can't exercise the one path that only runs once.
  'willow says they should all work together to fix it',
  'they find the thing they were looking for',
  'everyone goes back to the clearing for the party',
];

function panelToText(panel: {
  narration: string;
  dialogue: { who: string; says: string }[];
  sfx?: string;
}): string {
  const lines: string[] = [];
  if (panel.narration) lines.push(`   ${panel.narration}`);
  for (const d of panel.dialogue) lines.push(`   ${d.who}: "${d.says}"`);
  if (panel.sfx) lines.push(`   *${panel.sfx}*`);
  return lines.join('\n');
}

async function main(): Promise<void> {
  const limitArg = process.argv.indexOf('--beats');
  const limit =
    limitArg !== -1 ? Number(process.argv[limitArg + 1]) : SCRIPT.length;

  const session = await Session.create();
  console.log(`\n=== ${session.bible.title} (${session.bible.storyId}) ===\n`);

  const directions: (string | null)[] = [null, ...SCRIPT.slice(0, limit)];

  for (const [i, raw] of directions.entries()) {
    if (raw !== null) {
      const corrected = session.normalise(raw);
      console.log(`\n--- Cooper (turn ${i}) ---`);
      console.log(`   raw:       ${raw}`);
      if (corrected !== raw) console.log(`   corrected: ${corrected}`);
      session.addDirection(corrected);
    }

    // Printed before the beat, because this is what the storyteller was
    // actually handed — the whole question is whether it was worth handing.
    const note = serializePlanNote(session.bible.plan);
    if (note) {
      console.log('\n   ' + note.split('\n').join('\n   '));
    } else if (session.bible.plan) {
      console.log('\n   [no stage note — the director stood down]');
    }

    const started = Date.now();
    const result = await session.getStoryteller().streamBeat();

    if (result.redirected) {
      console.log('\n   [REDIRECTED — the model declined; game steers in-fiction]');
      continue;
    }

    console.log(`\n--- Beat ${i + 1} (${Date.now() - started}ms) ---`);
    if (result.chapterTitle) console.log(`   ## ${result.chapterTitle}`);
    for (const panel of result.panels) console.log(panelToText(panel), '\n');
    console.log(`   >> ${result.fork}`);

    // The word count is the headline metric: the whole design depends on
    // beats staying small enough that Cooper writes most of the story.
    const words = result.text.split(/\s+/).filter(Boolean).length;
    const flag = words > 170 ? '  ⚠️  TOO LONG' : '';
    console.log(`   [${result.panels.length} panels, ~${words} words]${flag}`);

    // A cache read that stops climbing means the append-only prefix broke.
    console.log(
      `   [tokens in ${result.usage.input} / out ${result.usage.output} / ` +
        `cache read ${result.usage.cacheRead}]`,
    );
    if (result.landing) console.log('   [LANDED — she would be offered The End]');

    const { whatsNew } = await session.commitBeat({
      panels: result.panels,
      fork: result.fork,
      beatText: result.text,
      raw,
      corrected: raw ? session.normalise(raw) : null,
      chapterTitle: result.chapterTitle,
      landing: result.landing,
    });
    if (whatsNew.length) console.log(`   [bible] ${whatsNew.join(' | ')}`);

    const plan = session.bible.plan;
    if (plan) {
      const phase = plan.phases[plan.phase];
      console.log(
        `   [arc] ${plan.arcName} — ${phase?.name ?? 'the end'} ` +
          `(${plan.phase + 1}/${plan.phases.length}, beat ${plan.beatsInPhase} of it)` +
          (plan.sheIsDriving ? ' — SHE IS DRIVING' : '') +
          (plan.played.length ? ` — played: ${plan.played.join(', ')}` : ''),
      );
      console.log(
        `   [next] ${plan.nextMove.instrument}` +
          (plan.nextMove.intent ? `: ${plan.nextMove.intent}` : ''),
      );
    }

    // The harness always chooses "keep going", which is the more demanding of
    // the two paths: it has to deal a fresh arc mid-story and carry on without
    // a seam. Choosing The End would just stop.
    if (result.landing) {
      session.continuePastLanding();
      const dealt = session.bible.plan;
      console.log(
        dealt
          ? `   [new arc] ${dealt.arcName} → ${dealt.destination}`
          : '   [no further arcs to deal]',
      );
    }
  }

  const credit = computeCredit(session.bible);
  console.log('\n=== Credit ===');
  console.log(`   Words written by Cooper: ${credit.wordsWritten}`);
  console.log(`   Turns she directed:      ${credit.beatsDirected}`);
  console.log(
    `   She invented:            ${
      [
        ...credit.charactersInvented,
        ...credit.placesInvented,
        ...credit.thingsInvented,
      ].join(', ') || '(nothing yet)'
    }`,
  );
  const finalPlan = session.bible.plan;
  if (finalPlan) {
    console.log('\n=== Arc ===');
    console.log(`   Shape:       ${finalPlan.arcName}`);
    console.log(`   Destination: ${finalPlan.destination}`);
    console.log(
      `   Reached:     phase ${finalPlan.phase + 1} of ${finalPlan.phases.length}`,
    );
    console.log(`   Arcs done:   ${session.bible.arcsCompleted ?? 0}`);
  }

  console.log(`\nSaved as ${session.bible.storyId}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
