import type { Panel } from '@storytime/shared';

/**
 * Incremental parser for the storyteller's marker format.
 *
 * The storyteller streams plain text with `[PANEL]` / `[FORK]` markers rather
 * than structured JSON, for two reasons: streaming JSON can't be rendered
 * progressively (so panels couldn't pop in one at a time as they're written),
 * and constraining the output format measurably flattens the prose.
 *
 * Feed it chunks; it emits each panel the moment the *next* marker proves the
 * panel is finished.
 *
 *   [CHAPTER] The Big City
 *   [PANEL]
 *   Narration line.
 *   TED: "Dialogue."
 *   SFX: KA-BONK!
 *   [FORK] The single closing sentence.
 *
 * A beat that ends the story closes with `[LANDING]` in place of `[FORK]`:
 * same shape, but it resolves rather than leaving her on a cliff, and it is
 * what puts "The End" in front of her.
 */
export class PanelParser {
  private buffer = '';
  private currentLines: string[] = [];
  private started = false;
  private forkText: string | null = null;
  private landed = false;
  private chapter: string | null = null;
  private chapterEmitted = false;

  /**
   * Called the moment a `[CHAPTER]` marker is parsed, so the header can
   * update before the first panel of the beat lands rather than after the
   * whole beat finishes.
   */
  onChapter?: (title: string) => void;

  /** The chapter this beat opens, if it opens one. */
  get chapterTitle(): string | null {
    return this.chapter;
  }

  /** True when this beat resolved the story instead of forking. */
  get isLanding(): boolean {
    return this.landed;
  }

  /** Feed a chunk. Returns any panels completed by this chunk. */
  push(chunk: string): Panel[] {
    this.buffer += chunk;
    const completed: Panel[] = [];

    // Only process whole lines; a partial trailing line stays in the buffer.
    let newlineAt: number;
    while ((newlineAt = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineAt);
      this.buffer = this.buffer.slice(newlineAt + 1);
      const panel = this.consumeLine(line);
      if (panel) completed.push(panel);
    }

    return completed;
  }

  /** Flush the tail. Call once the stream ends. */
  end(): { panels: Panel[]; fork: string | null; landing: boolean } {
    const panels: Panel[] = [];

    if (this.buffer.trim()) {
      const panel = this.consumeLine(this.buffer);
      if (panel) panels.push(panel);
      this.buffer = '';
    }

    const last = this.flushCurrent();
    if (last) panels.push(last);

    return { panels, fork: this.forkText, landing: this.landed };
  }

  private consumeLine(rawLine: string): Panel | null {
    const line = rawLine.trim();

    if (/^\[CHAPTER\]/i.test(line)) {
      const title = line.replace(/^\[CHAPTER\]/i, '').replace(/^[:\-\s]+/, '').trim();
      // An empty or repeated marker is ignored rather than opening a
      // nameless chapter — a chapter break with no title is worse than none.
      if (title && !this.chapterEmitted) {
        this.chapter = title;
        this.chapterEmitted = true;
        this.onChapter?.(title);
      }
      return null;
    }

    if (/^\[PANEL\]/i.test(line)) {
      const finished = this.flushCurrent();
      this.started = true;
      this.currentLines = [];
      // Tolerate `[PANEL] Some narration` on one line.
      const trailing = line.replace(/^\[PANEL\]/i, '').trim();
      if (trailing) this.currentLines.push(trailing);
      return finished;
    }

    // [LANDING] is [FORK] that resolves. Keeping the closing line in the same
    // field means every reader downstream — the store, the client, the
    // archivist — needs no idea that landings exist.
    const closing = /^\[(FORK|LANDING)\]/i.exec(line);
    if (closing) {
      const finished = this.flushCurrent();
      this.landed = closing[1]!.toUpperCase() === 'LANDING';
      this.forkText = line.replace(/^\[(FORK|LANDING)\]/i, '').trim();
      this.started = false;
      return finished;
    }

    // A fork already ended the beat; ignore any trailing chatter.
    if (this.forkText !== null) return null;

    if (line && this.started) this.currentLines.push(line);
    return null;
  }

  private flushCurrent(): Panel | null {
    if (!this.currentLines.length) return null;
    const panel = parsePanelLines(this.currentLines);
    this.currentLines = [];
    return panel;
  }
}

const DIALOGUE = /^([A-Z][A-Z0-9 .'-]{0,30}):\s*(.+)$/;
const SFX = /^SFX:\s*(.+)$/i;

function parsePanelLines(lines: string[]): Panel | null {
  const panel: Panel = { narration: '', dialogue: [] };
  const narration: string[] = [];

  for (const line of lines) {
    const sfx = SFX.exec(line);
    if (sfx?.[1]) {
      panel.sfx = sfx[1].trim();
      continue;
    }

    const dialogue = DIALOGUE.exec(line);
    if (dialogue?.[1] && dialogue[2]) {
      panel.dialogue.push({
        who: toTitleCase(dialogue[1].trim()),
        says: stripQuotes(dialogue[2].trim()),
      });
      continue;
    }

    narration.push(line);
  }

  panel.narration = narration.join(' ').trim();

  const empty =
    !panel.narration && panel.dialogue.length === 0 && !panel.sfx;
  return empty ? null : panel;
}

function stripQuotes(s: string): string {
  return s.replace(/^["“'']|["”'']$/g, '').trim();
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/** Non-streaming convenience wrapper, used by tests and the replay harness. */
export function parseBeatText(text: string): {
  panels: Panel[];
  fork: string | null;
  chapterTitle: string | null;
  landing: boolean;
} {
  const parser = new PanelParser();
  const streamed = parser.push(text.endsWith('\n') ? text : text + '\n');
  const { panels, fork, landing } = parser.end();
  return {
    panels: [...streamed, ...panels],
    fork,
    chapterTitle: parser.chapterTitle,
    landing,
  };
}
