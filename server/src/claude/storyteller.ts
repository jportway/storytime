import type Anthropic from '@anthropic-ai/sdk';
import type { Panel, StoryBible } from '@storytime/shared';
import { config } from '../config.js';
import { serializeBible, serializeRecentBeats } from '../bible.js';
import {
  anthropic,
  assertWithinBudget,
  loadPrompt,
  recordUsage,
} from './client.js';
import { PanelParser } from './panelParser.js';

/** Re-ground the conversation from a fresh bible snapshot every N beats. */
const REGROUND_EVERY = 8;

export type StorytellerMessage = Anthropic.MessageParam;

export interface BeatResult {
  panels: Panel[];
  fork: string;
  /** Raw model text, kept so the archivist reads exactly what was written. */
  text: string;
  /** True when the model declined. The UI must handle this in character. */
  redirected: boolean;
}

export interface StreamCallbacks {
  onPanel?: (panel: Panel) => void;
  onFork?: (fork: string) => void;
}

/**
 * The conversation IS the storyteller's working memory.
 *
 * The system prompt is static and history only ever appends, so the prompt
 * cache works naturally: each turn reuses the whole prior prefix. The bible
 * is injected once at the top and then only on re-ground — re-serialising it
 * every turn would change the prefix and throw the cache away on every beat.
 */
export class Storyteller {
  private messages: StorytellerMessage[] = [];
  private beatsSinceReground = 0;

  constructor(private bible: StoryBible) {
    this.messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            serializeBible(bible),
            '',
            '---',
            '',
            'Write the opening beat. Set the scene, get us moving fast, and stop at the first fork.',
          ].join('\n'),
        },
      ],
    });
  }

  /** Restore an in-progress session. */
  static resume(bible: StoryBible, messages: StorytellerMessage[]): Storyteller {
    const s = new Storyteller(bible);
    if (messages.length) s.messages = messages;
    return s;
  }

  getMessages(): StorytellerMessage[] {
    return this.messages;
  }

  setBible(bible: StoryBible): void {
    this.bible = bible;
  }

  /** Append Cooper's direction. Already spelling-normalised by the caller. */
  addDirection(direction: string): void {
    this.messages.push({
      role: 'user',
      content: [
        { type: 'text', text: `Cooper says what happens next:\n\n"${direction}"` },
      ],
    });
  }

  async streamBeat(cb: StreamCallbacks = {}): Promise<BeatResult> {
    assertWithinBudget();
    this.maybeReground();

    const parser = new PanelParser();
    const panels: Panel[] = [];
    let text = '';

    const stream = anthropic.messages.stream({
      model: config.models.storyteller,
      // Generous despite ~200 tokens of prose: on Opus 5 thinking is on by
      // default and max_tokens caps thinking + visible text together, so a
      // tight limit truncates beats mid-sentence.
      max_tokens: 8000,
      output_config: { effort: 'medium' },
      system: [
        {
          type: 'text',
          text: loadPrompt('storyteller'),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: this.withCacheBreakpoint(),
    });

    stream.on('text', (delta) => {
      text += delta;
      for (const panel of parser.push(delta)) {
        panels.push(panel);
        cb.onPanel?.(panel);
      }
    });

    const message = await stream.finalMessage();
    recordUsage(message.usage);

    const tail = parser.end();
    for (const panel of tail.panels) {
      panels.push(panel);
      cb.onPanel?.(panel);
    }

    // Opus 5 runs safety classifiers and can decline. It is very unlikely
    // for this content, but if it happens the game must bend in-fiction
    // rather than showing a ten-year-old an error. The caller turns this
    // into an owl line, not a dialog box.
    if (message.stop_reason === 'refusal') {
      return { panels, fork: '', text, redirected: true };
    }

    this.messages.push({ role: 'assistant', content: text });
    this.beatsSinceReground += 1;

    const fork = tail.fork ?? '';
    if (fork) cb.onFork?.(fork);

    return { panels, fork, text, redirected: false };
  }

  /**
   * Every N beats, replace the accumulated history with a fresh snapshot.
   *
   * This uses a mid-conversation `system` message rather than editing the
   * top-level system field: on Opus 5 that's supported with no beta header,
   * and unlike a top-level edit it leaves the cached prefix intact.
   */
  private maybeReground(): void {
    if (this.beatsSinceReground < REGROUND_EVERY) return;
    this.beatsSinceReground = 0;

    this.messages.push({
      role: 'system',
      content: [
        'Here is where the story stands now. Keep going from here.',
        '',
        serializeBible(this.bible),
        '',
        serializeRecentBeats(this.bible),
      ].join('\n'),
    } as StorytellerMessage);
  }

  /**
   * Put a cache breakpoint on the last block of the newest turn, so each
   * request reads the whole prior conversation from cache.
   */
  private withCacheBreakpoint(): StorytellerMessage[] {
    const messages = this.messages.map((m) => ({ ...m }));
    const last = messages[messages.length - 1];
    if (!last || typeof last.content === 'string') return messages;

    const blocks = [...(last.content as Anthropic.ContentBlockParam[])];
    const tail = blocks[blocks.length - 1];
    if (tail && tail.type === 'text') {
      blocks[blocks.length - 1] = {
        ...tail,
        cache_control: { type: 'ephemeral' },
      };
      last.content = blocks;
    }
    return messages;
  }
}
