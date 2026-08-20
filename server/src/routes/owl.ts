import { Router } from 'express';
import { coach } from '../claude/owl.js';
import { checkBeforeSend } from '../claude/sendCheck.js';
import { loadProfile } from '../store.js';

export const owlRouter = Router();

/**
 * Tier 1 of the owl: the LLM coach.
 *
 * Tier 0 — the instant local checker — runs entirely in the browser and
 * never touches this endpoint. This one is only called after she has paused
 * for ~2 seconds, or tapped the owl for help.
 */
owlRouter.post('/owl/coach', async (req, res) => {
  const { draft, fork, findings, storyNames } = req.body ?? {};

  if (typeof draft !== 'string') {
    res.status(400).json({ error: 'draft is required' });
    return;
  }

  const profile = await loadProfile();
  const response = await coach({
    draft,
    fork: typeof fork === 'string' ? fork : '',
    findings: Array.isArray(findings) ? findings : [],
    profile,
    storyNames: Array.isArray(storyNames) ? storyNames : [],
  });

  // A null response means the owl stays quiet, which is a perfectly good
  // outcome and much better than an error in front of her.
  res.json(response);
});

owlRouter.get('/owl/profile', async (_req, res) => {
  res.json(await loadProfile());
});

/**
 * The one-time check right before a turn actually sends — after the local
 * checker's instant, high-confidence layers are already clear. Catches what
 * the small local dictionary can't: badly garbled words, and real words it
 * just doesn't happen to contain (so it would otherwise false-flag them).
 */
owlRouter.post('/owl/send-check', async (req, res) => {
  const { draft, storyNames } = req.body ?? {};

  if (typeof draft !== 'string') {
    res.status(400).json({ error: 'draft is required' });
    return;
  }

  const issues = await checkBeforeSend(
    draft,
    Array.isArray(storyNames) ? storyNames : [],
  );
  res.json({ issues });
});
