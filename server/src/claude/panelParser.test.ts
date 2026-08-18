import { describe, expect, it } from 'vitest';
import { PanelParser, parseBeatText } from './panelParser.js';

const BEAT = `[PANEL]
Ted crept towards the bins.
TED: "Is anyone there?"
SFX: CREEEEAK
[PANEL]
Something enormous moved in the dark.
NANCY: "Get behind me, squirt."
[FORK] The lid of the bin creaks open a finger's width.
`;

describe('parseBeatText', () => {
  it('parses panels, dialogue, sfx and the fork', () => {
    const { panels, fork } = parseBeatText(BEAT);

    expect(panels).toHaveLength(2);
    expect(panels[0]!.narration).toBe('Ted crept towards the bins.');
    expect(panels[0]!.dialogue).toEqual([
      { who: 'Ted', says: 'Is anyone there?' },
    ]);
    expect(panels[0]!.sfx).toBe('CREEEEAK');
    expect(panels[1]!.dialogue[0]!.who).toBe('Nancy');
    expect(fork).toBe("The lid of the bin creaks open a finger's width.");
  });

  it('joins multi-line narration', () => {
    const { panels } = parseBeatText(
      '[PANEL]\nFirst line.\nSecond line.\n[FORK] Now what?\n',
    );
    expect(panels[0]!.narration).toBe('First line. Second line.');
  });

  it('tolerates narration on the [PANEL] line', () => {
    const { panels } = parseBeatText('[PANEL] Straight in.\n[FORK] Then?\n');
    expect(panels[0]!.narration).toBe('Straight in.');
  });

  it('handles a two-word speaker name', () => {
    const { panels } = parseBeatText(
      '[PANEL]\nERIC DYNAMITE: "Oi!"\n[FORK] Then?\n',
    );
    expect(panels[0]!.dialogue[0]!.who).toBe('Eric Dynamite');
  });

  it('ignores anything after the fork', () => {
    const { panels, fork } = parseBeatText(
      '[PANEL]\nA thing.\n[FORK] The fork.\nStray commentary the model added.\n',
    );
    expect(panels).toHaveLength(1);
    expect(fork).toBe('The fork.');
  });

  it('survives a beat with no fork marker', () => {
    const { panels, fork } = parseBeatText('[PANEL]\nJust a panel.\n');
    expect(panels).toHaveLength(1);
    expect(fork).toBeNull();
  });
});

describe('PanelParser streaming', () => {
  it('produces the same result whatever the chunk boundaries', () => {
    // The model streams in arbitrary fragments, so the parser must not
    // depend on chunks aligning with lines.
    const whole = parseBeatText(BEAT);

    for (const size of [1, 3, 7, 50]) {
      const parser = new PanelParser();
      const panels = [];
      for (let i = 0; i < BEAT.length; i += size) {
        panels.push(...parser.push(BEAT.slice(i, i + size)));
      }
      const tail = parser.end();
      panels.push(...tail.panels);

      expect(panels, `chunk size ${size}`).toEqual(whole.panels);
      expect(tail.fork, `chunk size ${size}`).toBe(whole.fork);
    }
  });

  it('emits each panel as soon as the next marker proves it complete', () => {
    // This is what lets panels pop in one at a time while the model is
    // still writing, instead of appearing all at once at the end.
    const parser = new PanelParser();

    expect(parser.push('[PANEL]\nFirst.\n')).toHaveLength(0);
    expect(parser.push('[PANEL]\n')).toHaveLength(1);
    expect(parser.push('Second.\n[FORK] Done.\n')).toHaveLength(1);
  });
});
