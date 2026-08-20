import { Router } from 'express';
import { wrap } from '../asyncRoute.js';
import type { GrimwoodTemplate, StoryBible } from '@storytime/shared';
import { properNouns } from '../bible.js';
import { getSession } from '../sessions.js';
import { listStories, loadTemplate, saveStory, saveTemplate } from '../store.js';

export const adminRouter = Router();

/**
 * A personal, unauthenticated editor for the story bible — characters,
 * places, things, threads, world rules, the current scene. Not shown to
 * Cooper; this is for Josh to fix continuity slips or seed the world by
 * hand. Gated behind its own admin password, separate from the one that
 * opens the game — see requireAdmin in auth.ts.
 */

adminRouter.get('/bible/:storyId', wrap(async (req, res) => {
  const session = await getSession(req.params.storyId!);
  if (!session) {
    res.status(404).json({ error: 'No such story' });
    return;
  }
  res.json(session.bible);
}));

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

adminRouter.put('/bible/:storyId', wrap(async (req, res) => {
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
}));

// ---------------------------------------------------------------------------
// The default template — what every *new* story is seeded from. Editing a
// story's own bible above only affects that one story; editing the template
// changes the starting point for everything created after the save.
// ---------------------------------------------------------------------------

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

/**
 * The story list, behind the admin gate.
 *
 * The editor cannot use /api/stories: that sits behind the *game* password,
 * and an admin session does not have it. Signed in as admin only, that
 * endpoint returns `{error}` rather than an array, the picker's `for…of`
 * threw, and the whole page rendered nothing — which looked exactly like
 * "the template won't load". Invisible on a laptop, where no passwords are
 * set and both gates stand open.
 */
adminRouter.get('/stories', wrap(async (_req, res) => {
  res.json(await listStories());
}));

adminRouter.get('/template', wrap(async (_req, res) => {
  res.json(await loadTemplate());
}));

adminRouter.put('/template', wrap(async (req, res) => {
  if (!isValidTemplate(req.body)) {
    res.status(400).json({ error: 'Malformed template' });
    return;
  }

  // This list is the template's actual schema as far as saving is concerned.
  // Anything absent from it is dropped silently on save — which looks exactly
  // like the editor working, right up until you reload.
  const {
    title,
    genre,
    tone,
    premise,
    worldRules,
    characters,
    places,
    things,
    threads,
    arcs,
    trouble,
    currentScene,
  } = req.body;
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
    arcs: arcs ?? [],
    trouble: trouble ?? [],
    currentScene,
  };

  await saveTemplate(template);
  res.json(template);
}));
