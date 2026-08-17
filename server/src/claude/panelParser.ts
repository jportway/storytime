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
 *   [PANEL]
 *   Narration line.
 *   TED: "Dialogue."
 *   SFX: KA-BONK!
 *   [FORK] The single closing sentence.
 */
export class PanelParser {
  private buffer = '';
  private currentLines: string[] = [];
  private started = false;
  private forkText: string | null = null;

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
  end(): { panels: Panel[]; fork: string | null } {
    const panels: Panel[] = [];

    if (this.buffer.trim()) {
      const panel = this.consumeLine(this.buffer);
      if (panel) panels.push(panel);
      this.buffer = '';
    }

    const last = this.flushCurrent();
    if (last) panels.push(last);

    return { panels, fork: this.forkText };
  }

  private consumeLine(rawLine: string): Panel | null {
    const line = rawLine.trim();

    if (/^\[PANEL\]/i.test(line)) {
      const finished = this.flushCurrent();
      this.started = true;
      this.currentLines = [];
      // Tolerate `[PANEL] Some narration` on one line.
      const trailing = line.replace(/^\[PANEL\]/i, '').trim();
      if (trailing) this.currentLines.push(trailing);
      return finished;
    }

    if (/^\[FORK\]/i.test(line)) {
      const finished = this.flushCurrent();
      this.forkText = line.replace(/^\[FORK\]/i, '').trim();
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
} {
  const parser = new PanelParser();
  const streamed = parser.push(text.endsWith('\n') ? text : text + '\n');
  const { panels, fork } = parser.end();
  return { panels: [...streamed, ...panels], fork };
}
