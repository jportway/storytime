import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import type { LocalFinding, OwlResponse, Profile } from '@storytime/shared';
import { config } from '../config.js';
import {
  anthropic,
  assertWithinBudget,
  loadPrompt,
  recordUsage,
} from './client.js';

const owlSchema = z.object({
  praise: z
    .string()
    .describe(
      'Specific praise naming an actual word or idea she chose. Never generic.',
    ),
  helps: z
    .array(
      z.object({
        original: z.string(),
        fixed: z.string(),
        kind: z.enum([
          'reversal',
          'spelling',
          'homophone',
          'grammar',
          'punctuation',
          'word-choice',
        ]),
        spoken: z
          .string()
          .describe('One or two spoken sentences. Warm and curious.'),
        board: z.object({
          word: z.string(),
          highlight: z
            .array(z.number())
            .describe('Indices of the tricky letters in the corrected word.'),
          mnemonic: z
            .string()
            .nullable()
            .describe('"bed-hands" for b/d reversals, otherwise null.'),
        }),
      }),
    )
    .max(2)
    .describe('At most two. Usually one. Never a list.'),
  nudge: z
    .string()
    .nullable()
    .describe(
      'A leading question offering a fork, only if she is stuck or very brief.',
    ),
});

export interface OwlRequest {
  draft: string;
  /** The fork she's responding to, for context. */
  fork: string;
  findings: LocalFinding[];
  profile: Profile;
  storyNames: string[];
}

export async function coach(req: OwlRequest): Promise<OwlResponse | null> {
  assertWithinBudget();

  const mastered = req.profile.mastered.length
    ? req.profile.mastered.join(', ')
    : '(nothing yet)';

  const knownReversals = Object.entries(req.profile.reversals)
    .map(([pair, r]) => `${pair} (seen ${r.seen} times)`)
    .join(', ');

  const userContent = [
    '# What she is writing right now',
    req.draft || '(nothing yet)',
    '',
    '# The moment in the story she is answering',
    req.fork || '(the story has just begun)',
    '',
    '# What the instant spell checker already spotted',
    req.findings.length
      ? req.findings
          .map(
            (f) =>
              `- "${f.word}" → "${f.suggestion}" (${f.kind}, ${f.confidence} confidence)`,
          )
          .join('\n')
      : '(nothing)',
    '',
    '# Her profile',
    `Letters she reverses: ${knownReversals || '(none recorded)'}`,
    `Words she has MASTERED — never correct these: ${mastered}`,
    `She has written ${req.profile.totals.wordsWritten} words across ${req.profile.totals.beatsDirected} turns.`,
    '',
    '# Names in this story (always spelled correctly, never correct these)',
    req.storyNames.join(', '),
  ].join('\n');

  try {
    // Note: `effort` is rejected on Haiku 4.5 — do not add output_config.effort.
    const response = await anthropic.messages.parse({
      model: config.models.owl,
      max_tokens: 1500,
      system: loadPrompt('owl'),
      messages: [{ role: 'user', content: userContent }],
      output_config: { format: zodOutputFormat(owlSchema) },
    });
    recordUsage(response.usage);

    const parsed = response.parsed_output;
    if (!parsed) return null;

    return {
      praise: parsed.praise,
      helps: parsed.helps.map((h) => ({
        original: h.original,
        fixed: h.fixed,
        kind: h.kind,
        spoken: h.spoken,
        board: {
          word: h.board.word,
          highlight: h.board.highlight,
          ...(h.board.mnemonic ? { mnemonic: h.board.mnemonic } : {}),
        },
      })),
      nudge: parsed.nudge,
    };
  } catch (err) {
    // The owl going quiet is a much better failure than the owl erroring at
    // her. She just carries on writing.
    console.error('[owl] failed, staying quiet:', err);
    return null;
  }
}
