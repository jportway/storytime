/**
 * Name the finished book.
 *
 * Called once, when Cooper chooses "The End". Until then every story is
 * called whatever the template was called, which is fine while it is being
 * written and wrong the moment it becomes a thing she finished — a book she
 * made should not be called "The party" because that is what the starting
 * position happened to be named.
 *
 * Named at the end rather than the start on purpose: that is when there is
 * something to name. `effort` is rejected on Haiku 4.5.
 */

import type { StoryBible } from '@storytime/shared';
import { config } from '../config.js';
import {
  anthropic,
  assertWithinBudget,
  loadPrompt,
  recordUsage,
} from './client.js';

export async function nameBook(bible: StoryBible): Promise<string | null> {
  assertWithinBudget();

  const chapters = bible.beats
    .filter((b) => b.chapterTitle)
    .map((b) => `- ${b.chapterTitle}`);

  const summaries = bible.beats
    .map((b, i) => (b.summary ? `${i + 1}. ${b.summary}` : null))
    .filter(Boolean);

  const hers = [
    ...bible.characters.filter((c) => c.createdBy === 'cooper').map((c) => c.name),
    ...bible.things.filter((t) => t.createdBy === 'cooper').map((t) => t.name),
    ...bible.places.filter((p) => p.createdBy === 'cooper').map((p) => p.name),
  ];

  const userContent = [
    `# Premise it started from\n${bible.premise}`,
    chapters.length ? `\n# Chapters\n${chapters.join('\n')}` : '',
    summaries.length ? `\n# What happened\n${summaries.join('\n')}` : '',
    hers.length
      ? `\n# Invented by Cooper herself\n${hers.join(', ')}`
      : '\n# Cooper invented nothing new in this one.',
  ].join('\n');

  try {
    const response = await anthropic.messages.create({
      model: config.models.director,
      max_tokens: 100,
      system: loadPrompt('title'),
      messages: [{ role: 'user', content: userContent }],
    });
    recordUsage(response.usage);

    const block = response.content.find((c) => c.type === 'text');
    const title = block?.type === 'text' ? block.text.trim() : '';

    // Strip quotes and any trailing full stop the model adds despite being
    // asked not to. A title is not a sentence.
    const cleaned = title
      .replace(/^["'“‘]+|["'”’]+$/g, '')
      .replace(/\.$/, '')
      .trim();

    return cleaned || null;
  } catch (err) {
    console.error('[title] naming failed:', err);
    return null;
  }
}
