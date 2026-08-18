import fs from 'node:fs/promises';
import { Router } from 'express';
import type { StoryBible } from '@storytime/shared';
import { properNouns } from '../bible.js';
import { config } from '../config.js';
import { getSession } from '../sessions.js';
import { saveStory } from '../store.js';

export const adminRouter = Router();

/**
 * A personal, unauthenticated editor for the story bible — characters,
 * places, things, threads, world rules, the current scene. Not shown to
 * Cooper; this is for Josh to fix continuity slips or seed the world by
 * hand. Localhost-only app, so no auth: don't expose this port publicly.
 */

adminRouter.get('/admin/bible/:storyId', async (req, res) => {
  const session = await getSession(req.params.storyId!);
  if (!session) {
    res.status(404).json({ error: 'No such story' });
    return;
  }
  res.json(session.bible);
});

function isValidBible(body: unknown): body is StoryBible {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.storyId === 'string' &&
    Array.isArray(b.characters) &&
    Array.isArray(b.places) &&
    Array.isArray(b.things) &&
    Array.isArray(b.threads) &&
    Array.isArray(b.beats) &&
    Array.isArray(b.worldRules) &&
    typeof b.currentScene === 'object' &&
    b.currentScene !== null
  );
}

adminRouter.put('/admin/bible/:storyId', async (req, res) => {
  const storyId = req.params.storyId!;
  const session = await getSession(storyId);
  if (!session) {
    res.status(404).json({ error: 'No such story' });
    return;
  }

  if (!isValidBible(req.body) || req.body.storyId !== storyId) {
    res.status(400).json({ error: 'Malformed story bible' });
    return;
  }

  session.bible = req.body;
  session.getStoryteller().setBible(session.bible);
  session.getChecker().addProperNouns(properNouns(session.bible));

  await saveStory(session.bible, session.getStoryteller().getMessages());
  res.json(session.bible);
});

// ---------------------------------------------------------------------------
// The default template — what every *new* story is seeded from. Editing a
// story's own bible above only affects that one story; editing the template
// changes the starting point for everything created after the save.
// ---------------------------------------------------------------------------

type GrimwoodTemplate = Omit<StoryBible, 'storyId' | 'createdAt' | 'beats'>;

function isValidTemplate(body: unknown): body is GrimwoodTemplate {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    Array.isArray(b.characters) &&
    Array.isArray(b.places) &&
    Array.isArray(b.things) &&
    Array.isArray(b.threads) &&
    Array.isArray(b.worldRules) &&
    typeof b.currentScene === 'object' &&
    b.currentScene !== null
  );
}

adminRouter.get('/admin/template', async (_req, res) => {
  const raw = await fs.readFile(config.paths.grimwoodTemplate, 'utf8');
  res.json(JSON.parse(raw));
});

adminRouter.put('/admin/template', async (req, res) => {
  if (!isValidTemplate(req.body)) {
    res.status(400).json({ error: 'Malformed template' });
    return;
  }

  const { title, genre, tone, premise, worldRules, characters, places, things, threads, currentScene } =
    req.body;
  const template: GrimwoodTemplate = {
    title,
    genre,
    tone,
    premise,
    worldRules,
    characters,
    places,
    things,
    threads,
    currentScene,
  };

  // Write-then-rename, same as story saves: a crash mid-write can't corrupt
  // the template every new story depends on.
  const tmp = `${config.paths.grimwoodTemplate}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(template, null, 2), 'utf8');
  await fs.rename(tmp, config.paths.grimwoodTemplate);

  res.json(template);
});
