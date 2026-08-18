import { Router } from 'express';
import type { StoryStreamEvent } from '@storytime/shared';
import { computeCredit } from '../bible.js';
import { Session } from '../session.js';
import { getSession, registerSession } from '../sessions.js';
import { listStories, loadProfile, saveProfile, updateProfile } from '../store.js';

export const storyRouter = Router();

storyRouter.get('/stories', async (_req, res) => {
  res.json(await listStories());
});

storyRouter.post('/stories', async (_req, res) => {
  const session = await Session.create();
  registerSession(session);
  res.json({ bible: session.bible });
});

storyRouter.get('/stories/:storyId', async (req, res) => {
  const session = await getSession(req.params.storyId!);
  if (!session) {
    res.status(404).json({ error: 'No such story' });
    return;
  }
  res.json({
    bible: session.bible,
    credit: computeCredit(session.bible),
  });
});

storyRouter.get('/stories/:storyId/credit', async (req, res) => {
  const session = await getSession(req.params.storyId!);
  if (!session) {
    res.status(404).json({ error: 'No such story' });
    return;
  }
  res.json(computeCredit(session.bible));
});

/**
 * Write the next beat, streaming panels as they're written.
 *
 * Server-sent events rather than a single response, so panels pop in one at
 * a time — watching the story appear is a large part of the fun, and a long
 * silent wait is exactly where a ten-year-old loses interest.
 */
storyRouter.post('/stories/:storyId/beat', async (req, res) => {
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
    });

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
});
