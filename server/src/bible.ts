import type {
  BibleDelta,
  Character,
  StoryBible,
  Thread,
} from '@storytime/shared';

// ---------------------------------------------------------------------------
// Rendering the bible for a prompt
// ---------------------------------------------------------------------------

function describeCharacter(c: Character, bible: StoryBible): string {
  const place = bible.places.find((p) => p.id === c.location)?.name ?? c.location;
  const lines = [
    `- ${c.name} (${c.id}) — ${c.role}. ${c.traits.join(', ')}.`,
    `  Wants: ${c.wants}`,
    `  Voice: ${c.voice}`,
    `  Currently: ${c.status}${c.statusNote ? ` — ${c.statusNote}` : ''}, at ${place}`,
  ];
  if (c.carrying.length) {
    const names = c.carrying.map(
      (id) => bible.things.find((t) => t.id === id)?.name ?? id,
    );
    lines.push(`  Carrying: ${names.join(', ')}`);
  }
  for (const r of c.relationships) {
    const other = bible.characters.find((x) => x.id === r.withId)?.name ?? r.withId;
    lines.push(`  → ${other}: ${r.feeling} (${r.history})`);
  }
  for (const s of c.secrets) lines.push(`  Secret: ${s}`);
  return lines.join('\n');
}

/**
 * A compact, readable rendering of the world for the model.
 *
 * This is injected exactly once at the top of the conversation, and then
 * again only on re-ground. It is deliberately NOT re-sent every turn: doing
 * so would change the cached prefix on every single beat and throw away the
 * prompt cache each time.
 */
export function serializeBible(bible: StoryBible): string {
  const alive = bible.characters.filter((c) => c.status !== 'dead');
  const dead = bible.characters.filter((c) => c.status === 'dead');
  const openThreads = bible.threads.filter((t) => t.status === 'open');

  const sections = [
    `# ${bible.title}`,
    `Genre: ${bible.genre}. Tone: ${bible.tone.join(', ')}.`,
    ``,
    `## What's going on`,
    bible.premise,
    ``,
    `## Rules of this world`,
    ...bible.worldRules.map((r) => `- ${r}`),
    ``,
    `## Characters`,
    ...alive.map((c) => describeCharacter(c, bible)),
  ];

  if (dead.length) {
    sections.push(
      ``,
      `## Gone (do not bring these back without a very good reason)`,
      ...dead.map((c) => `- ${c.name}: ${c.statusNote ?? 'dead'}`),
    );
  }

  sections.push(
    ``,
    `## Places`,
    ...bible.places.map((p) => `- ${p.name} (${p.id}): ${p.description}`),
  );

  const things = bible.things.filter((t) => t.status !== 'destroyed');
  if (things.length) {
    sections.push(
      ``,
      `## Things`,
      ...things.map(
        (t) =>
          `- ${t.name} (${t.id}): ${t.description}${
            t.status !== 'intact' ? ` [${t.status}]` : ''
          }`,
      ),
    );
  }

  if (openThreads.length) {
    sections.push(
      ``,
      `## Open questions (you may nudge these along, but do not answer them)`,
      ...openThreads.map((t) => `- ${t.question}`),
    );
  }

  const here = bible.places.find((p) => p.id === bible.currentScene.placeId);
  const present = bible.currentScene.presentCharacterIds
    .map((id) => bible.characters.find((c) => c.id === id)?.name ?? id)
    .join(', ');

  sections.push(
    ``,
    `## Right now`,
    `Place: ${here?.name ?? bible.currentScene.placeId}`,
    `Present: ${present}`,
    bible.currentScene.situation,
  );

  return sections.join('\n');
}

/** The recent story, for re-grounding after a compaction. */
export function serializeRecentBeats(bible: StoryBible, count = 6): string {
  const recent = bible.beats.slice(-count);
  if (!recent.length) return '';
  return [
    `## The story so far`,
    ...recent.map((b) => {
      const direction = b.cooperDirection
        ? ` (Cooper said: "${b.cooperDirection}")`
        : '';
      return `${b.n}. ${b.summary ?? '(no summary)'}${direction}`;
    }),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Applying a delta
// ---------------------------------------------------------------------------

/**
 * Fold an archivist delta into the bible.
 *
 * Returns the updated bible plus a short list of human-readable changes, so
 * the UI can announce "New: Grimble the goblin" without diffing anything.
 *
 * Deliberately total and forgiving: an archivist referring to an id that
 * doesn't exist is dropped rather than throwing. Bookkeeping must never be
 * able to crash the game.
 */
export function applyDelta(
  bible: StoryBible,
  delta: BibleDelta,
  beatNumber: number,
): { bible: StoryBible; whatsNew: string[] } {
  const next = structuredClone(bible);
  const whatsNew: string[] = [];

  for (const c of delta.newCharacters ?? []) {
    if (next.characters.some((x) => x.id === c.id)) continue;
    next.characters.push(c);
    whatsNew.push(
      c.createdBy === 'cooper' ? `You invented ${c.name}!` : `New: ${c.name}`,
    );
  }

  for (const p of delta.newPlaces ?? []) {
    if (next.places.some((x) => x.id === p.id)) continue;
    next.places.push(p);
    whatsNew.push(
      p.createdBy === 'cooper' ? `You invented ${p.name}!` : `New place: ${p.name}`,
    );
  }

  for (const t of delta.newThings ?? []) {
    if (next.things.some((x) => x.id === t.id)) continue;
    next.things.push(t);
    whatsNew.push(
      t.createdBy === 'cooper' ? `You invented ${t.name}!` : `New: ${t.name}`,
    );
  }

  for (const u of delta.characterUpdates ?? []) {
    const c = next.characters.find((x) => x.id === u.id);
    if (!c) continue;

    if (u.statusChange && u.statusChange !== c.status) {
      c.status = u.statusChange;
      if (u.statusNote) c.statusNote = u.statusNote;
      if (u.statusChange === 'dead') whatsNew.push(`${c.name} died.`);
      else whatsNew.push(`${c.name} is now ${u.statusChange}.`);
    } else if (u.statusNote) {
      c.statusNote = u.statusNote;
    }

    if (u.locationChange) c.location = u.locationChange;
    for (const trait of u.newTraits ?? []) {
      if (!c.traits.includes(trait)) c.traits.push(trait);
    }
    for (const id of u.nowCarrying ?? []) {
      if (!c.carrying.includes(id)) c.carrying.push(id);
    }
    if (u.nowLost?.length) {
      c.carrying = c.carrying.filter((id) => !u.nowLost!.includes(id));
    }
    for (const r of u.relationshipChanges ?? []) {
      const existing = c.relationships.find((x) => x.withId === r.withId);
      if (existing) Object.assign(existing, r);
      else c.relationships.push(r);
    }
    for (const s of u.newSecrets ?? []) {
      if (!c.secrets.includes(s)) c.secrets.push(s);
    }
  }

  for (const u of delta.thingUpdates ?? []) {
    const t = next.things.find((x) => x.id === u.id);
    if (!t) continue;
    if (u.statusChange) t.status = u.statusChange;
    if (u.newOwnerId) t.ownerId = u.newOwnerId;
    if (u.newPlaceId) t.placeId = u.newPlaceId;
  }

  for (const t of delta.newThreads ?? []) {
    if (next.threads.some((x) => x.id === t.id)) continue;
    next.threads.push({ ...t, opened: beatNumber } as Thread);
  }

  for (const r of delta.resolvedThreads ?? []) {
    const t = next.threads.find((x) => x.id === r.id);
    if (!t) continue;
    t.status = 'resolved';
    t.resolution = r.resolution;
  }

  for (const rule of delta.worldRulesLearned ?? []) {
    if (!next.worldRules.includes(rule)) next.worldRules.push(rule);
  }

  if (delta.sceneUpdate) next.currentScene = delta.sceneUpdate;

  const beat = next.beats.find((b) => b.n === beatNumber);
  if (beat && delta.beatSummary) beat.summary = delta.beatSummary;

  return { bible: next, whatsNew };
}

// ---------------------------------------------------------------------------
// Credit — the "Your Story" page
// ---------------------------------------------------------------------------

export interface Credit {
  charactersInvented: string[];
  placesInvented: string[];
  thingsInvented: string[];
  twistsFromCooper: number;
  twistsTotal: number;
  wordsWritten: number;
  beatsDirected: number;
}

export function computeCredit(bible: StoryBible): Credit {
  const mine = <T extends { createdBy: string; name: string }>(xs: T[]) =>
    xs.filter((x) => x.createdBy === 'cooper').map((x) => x.name);

  return {
    charactersInvented: mine(bible.characters),
    placesInvented: mine(bible.places),
    thingsInvented: mine(bible.things),
    twistsFromCooper: bible.threads.filter((t) => t.createdBy === 'cooper').length,
    twistsTotal: bible.threads.length,
    wordsWritten: bible.beats.reduce((n, b) => n + b.cooperWordCount, 0),
    beatsDirected: bible.beats.filter((b) => b.cooperDirection !== null).length,
  };
}

/** Every proper noun in play, so the spell checker never flags a story name. */
export function properNouns(bible: StoryBible): string[] {
  return [
    ...bible.characters.map((c) => c.name),
    ...bible.places.map((p) => p.name),
    ...bible.things.map((t) => t.name),
  ]
    .flatMap((n) => n.split(/[\s']+/))
    .filter((w) => w.length > 1);
}
