import { Router } from 'express';
import { wrap } from '../asyncRoute.js';
import type { StoryStreamEvent } from '@storytime/shared';
import { computeCredit } from '../bible.js';
import { Session } from '../session.js';
import { getSession, registerSession } from '../sessions.js';
import { listStories, loadProfile, saveProfile, updateProfile } from '../store.js';

export const storyRouter = Router();

storyRouter.get('/stories', wrap(async (_req, res) => {
  res.json(await listStories());
}));

storyRouter.post('/stories', wrap(async (_req, res) => {
  const session = await Session.create();
  registerSession(session);
  res.json({ bible: session.bible });
}));

storyRouter.get('/stories/:storyId', wrap(async (req, res) => {
  const session = await getSession(req.params.storyId!);
  if (!session) {
    res.status(404).json({ error: 'No such story' });
    return;
  }
  res.json({
    bible: session.bible,
    credit: computeCredit(session.bible),
  });
}));

storyRouter.get('/stories/:storyId/credit', wrap(async (req, res) => {
  const session = await getSession(req.params.storyId!);
  if (!session) {
    res.status(404).json({ error: 'No such story' });
    return;
  }
  res.json(computeCredit(session.bible));
}));

/**
 * She chose "The End".
 *
 * The book gets its name here rather than when the story started, because
 * this is the first moment there is anything to name. Until now every story
 * has been called whatever the template was called.
 */
storyRouter.post('/stories/:storyId/finish', wrap(async (req, res) => {
  const session = await getSession(req.params.storyId!);
  if (!session) {
    res.status(404).json({ error: 'No such story' });
    return;
  }
  res.json({ bible: await session.finish() });
}));

/**
 * She chose to keep going after the story landed.
 *
 * A fresh arc is dealt and the story carries straight on. She is told
 * nothing: from where she sits she simply answered the question and the
 * story continued, which is the point.
 */
storyRouter.post('/stories/:storyId/continue', wrap(async (req, res) => {
  const session = await getSession(req.params.storyId!);
  if (!session) {
    res.status(404).json({ error: 'No such story' });
    return;
  }
  session.continuePastLanding();
  await session.save();
  res.json({ bible: session.bible });
}));

/**
 * Write the next beat, streaming panels as they're written.
 *
 * Server-sent events rather than a single response, so panels pop in one at
 * a time — watching the story appear is a large part of the fun, and a long
 * silent wait is exactly where a ten-year-old loses interest.
 */
storyRouter.post('/stories/:storyId/beat', wrap(async (req, res) => {
  const session = await getSession(req.params.storyId!);
  if (!session) {
    res.status(404).json({ error: 'No such story' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event: StoryStreamEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const raw: string | null = req.body?.direction?.trim() || null;
  const corrected = raw ? session.normalise(raw) : null;

  try {
    if (corrected) session.addDirection(corrected);

    const result = await session.getStoryteller().streamBeat({
      onPanel: (panel) => send({ type: 'panel', panel }),
      onFork: (fork) => send({ type: 'fork', text: fork }),
      // Sent ahead of the panels so the header renames itself as the new
      // chapter starts, rather than once the whole beat has landed.
      onChapter: (title) => send({ type: 'chapter', title }),
    });

    if (result.redirected) {
      // Never show a ten-year-old a refusal. The owl bends the moment
      // in-fiction and she picks a different direction.
      send({
        type: 'redirect',
        message:
          "Ooh — the story wants to go somewhere else. Try sending them another way!",
      });
      res.end();
      return;
    }

    const { beat, whatsNew } = await session.commitBeat({
      panels: result.panels,
      fork: result.fork,
      beatText: result.text,
      raw,
      corrected,
      chapterTitle: result.chapterTitle,
      landing: result.landing,
    });

    // The closing line is only known to be a landing once the stream ends, so
    // unlike `chapter` this cannot be sent ahead of the panels.
    if (result.landing) send({ type: 'landing', text: result.fork });
    send({ type: 'beat-complete', beat });
    send({ type: 'bible-updated', bible: session.bible, whatsNew });

    // Fold this turn into her profile so the owl keeps learning her.
    if (raw && corrected) {
      const findings = session
        .getChecker()
        .check(raw)
        .filter((f) => f.confidence === 'high');
      const profile = updateProfile(await loadProfile(), {
        raw,
        corrected,
        findings,
      });
      await saveProfile(profile);
    }
  } catch (err) {
    console.error('[beat] failed:', err);
    send({
      type: 'error',
      message: err instanceof Error ? err.message : 'Something went wrong',
    });
  } finally {
    res.end();
  }
}));
