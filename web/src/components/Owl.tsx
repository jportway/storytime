import { useEffect, useRef, useState } from 'react';
import type { HelpKind, OwlHelp, OwlResponse } from '@storytime/shared';
import { OwlArt, useOwlPerformance, type OwlState } from './OwlArt.js';

/**
 * A word flagged during the pre-send spelling check — a guess she can
 * confirm or reject, not a blocking form of words to fix.
 */
export interface SendGate {
  word: string;
  suggestion: string;
  kind: HelpKind;
  /** Whether a further automatic guess exists if she says this one is wrong. */
  retryable: boolean;
  /** No more automatic guesses left for this word — she should fix it herself. */
  exhausted: boolean;
}

interface OwlProps {
  response: OwlResponse | null;
  thinking: boolean;
  onAskForHelp: () => void;
  onAccept: (help: OwlHelp) => void;
  say: (text: string) => Promise<void>;
  spellOut: (word: string, onLetter?: (i: number) => void) => Promise<void>;
  /** Set while she's trying to send and a word needs checking first. */
  gate: SendGate | null;
  onGateYes: () => void;
  onGateNo: () => void;
  /** Acknowledge "have a go yourself" and let her keep editing. */
  onGateAcknowledge: () => void;
  /** Waiting on the one-time LLM check before a turn actually sends. */
  checkingSend: boolean;
  /** True while the story is being written — the owl stays out of the way. */
  streaming: boolean;
}

/**
 * The owl and its board.
 *
 * The owl speaks; a card above it shows the word, with the tricky letters
 * lighting up in time with the voice. For b/d reversals it also draws the
 * hands mnemonic, because that reversal isn't a spelling problem and
 * shouldn't be treated like one.
 *
 * The card is an overlay, positioned over the story rather than in a column
 * beside it. That is deliberate and load-bearing: the story must never
 * reflow because the owl had something to say. She may be halfway through a
 * sentence when it appears.
 */
export function Owl({
  response,
  thinking,
  onAskForHelp,
  onAccept,
  say,
  spellOut,
  gate,
  onGateYes,
  onGateNo,
  onGateAcknowledge,
  checkingSend,
  streaming,
}: OwlProps) {
  const [activeHelp, setActiveHelp] = useState<OwlHelp | null>(null);
  const [litLetter, setLitLetter] = useState(-1);
  const spokenFor = useRef<OwlResponse | null>(null);
  const spokenGateFor = useRef('');

  // Speak each new response once: praise first, then at most one or two
  // helps, then the nudge. Suppressed while a gate question is active —
  // that takes the mic.
  useEffect(() => {
    if (gate || !response || spokenFor.current === response) return;
    spokenFor.current = response;

    let cancelled = false;
    const run = async () => {
      if (response.praise) await say(response.praise);
      if (cancelled) return;

      for (const help of response.helps) {
        if (cancelled) return;
        setActiveHelp(help);
        await say(help.spoken);
        if (cancelled) return;
        await spellOut(help.board.word, setLitLetter);
      }

      if (!cancelled && response.nudge) await say(response.nudge);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [gate, response, say, spellOut]);

  // The board card renders from `activeHelp`, which outlives the response
  // that produced it — so when the response goes away (she sent the turn,
  // or dismissed it) the card has to go with it, or it sits there offering
  // to fix a word that is no longer anywhere on screen.
  useEffect(() => {
    if (!response) setActiveHelp(null);
  }, [response]);

  // Speak the gate question once per distinct guess — a fresh guess (or
  // "have a go yourself") speaks again, repeated renders of the same one
  // don't.
  useEffect(() => {
    if (!gate) return;
    const key = `${gate.word}:${gate.suggestion}:${gate.exhausted}`;
    if (spokenGateFor.current === key) return;
    spokenGateFor.current = key;

    void say(
      gate.exhausted
        ? "Can't guess that one. Have a go yourself."
        : `Hang on — is that supposed to say "${gate.suggestion}"?`,
    );
  }, [gate, say]);

  const board = activeHelp?.board;
  const praise = response?.praise && !activeHelp && !gate ? response.praise : null;
  const nudge = response?.nudge && !activeHelp && !gate ? response.nudge : null;

  const speaking = Boolean(gate || board || praise || nudge || checkingSend);

  // He is a drawing, not a tinted shape: every mood is a different set of
  // brush strokes rather than a CSS filter over one of them.
  const state: OwlState = praise
    ? 'pleased'
    : thinking || checkingSend
      ? 'thinking'
      : speaking
        ? 'talking'
        : 'resting';
  const pose = useOwlPerformance(state);

  const owlClasses = ['owl', speaking ? 'owl-big' : '', streaming ? 'owl-quiet' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <button
        className={owlClasses}
        onClick={onAskForHelp}
        title="Ask the owl for help"
        aria-label="Ask the owl for help"
      >
        <OwlArt mood={pose} />
      </button>

      <div className="owl-overlay" aria-live="polite">
        {checkingSend && !gate && (
          <div className="owl-card">
            <p className="owl-card-message">Let me look…</p>
          </div>
        )}

        {gate && (
          <div className="owl-card owl-card-gate">
            <BoardWord letters={[...gate.word]} />

            {gate.kind === 'reversal' && <BedHands />}

            {gate.exhausted ? (
              <>
                <p className="owl-card-message">
                  Have a go yourself, then send it again.
                </p>
                <div className="owl-card-buttons">
                  <button className="card-primary" onClick={onGateAcknowledge}>
                    Okay
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="owl-card-message">
                  Is that supposed to say “{gate.suggestion}”?
                </p>
                <div className="owl-card-buttons">
                  <button className="card-primary" onClick={onGateYes}>
                    Yes, that's it
                  </button>
                  <button className="card-secondary" onClick={onGateNo}>
                    No
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {!gate && board && (
          <div className="owl-card">
            <BoardWord
              letters={[...board.word]}
              highlight={board.highlight}
              lit={litLetter}
            />

            {board.mnemonic === 'bed-hands' && <BedHands />}

            {activeHelp?.spoken && (
              <p className="owl-card-message">{activeHelp.spoken}</p>
            )}

            <div className="owl-card-buttons">
              <button
                className="card-primary"
                onClick={() => {
                  onAccept(activeHelp!);
                  setActiveHelp(null);
                }}
              >
                Fix it for me
              </button>
              <button
                className="card-secondary"
                onClick={() => setActiveHelp(null)}
              >
                I'll do it
              </button>
            </div>
          </div>
        )}

        {!gate && praise && (
          <div className="owl-card owl-card-praise">
            <p className="owl-card-message">{praise}</p>
          </div>
        )}

        {!gate && !praise && nudge && (
          <div className="owl-card">
            <p className="owl-card-message">{nudge}</p>
          </div>
        )}
      </div>
    </>
  );
}

function BoardWord({
  letters,
  highlight = [],
  lit = -1,
}: {
  letters: string[];
  highlight?: number[];
  lit?: number;
}) {
  return (
    <div className="board-word">
      {letters.map((letter, i) => (
        <span
          key={i}
          className={[
            'board-letter',
            highlight.includes(i) ? 'tricky' : '',
            lit === i ? 'lit' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

/**
 * The b/d trick: make fists with both thumbs up and they spell "bed" — so
 * the b always comes first and the d always comes second.
 */
function BedHands() {
  return (
    <div className="mnemonic">
      <svg viewBox="0 0 200 90" width="190" height="86" aria-hidden="true">
        <rect x="30" y="30" width="26" height="34" rx="9" fill="#e8c9a0" />
        <rect x="22" y="14" width="11" height="30" rx="5" fill="#e8c9a0" />
        <text x="43" y="82" textAnchor="middle" className="mnemonic-letter">b</text>

        <rect x="144" y="30" width="26" height="34" rx="9" fill="#e8c9a0" />
        <rect x="167" y="14" width="11" height="30" rx="5" fill="#e8c9a0" />
        <text x="157" y="82" textAnchor="middle" className="mnemonic-letter">d</text>

        <rect x="62" y="44" width="76" height="8" rx="4" fill="#c9a882" />
        <text x="100" y="34" textAnchor="middle" className="mnemonic-word">bed</text>
      </svg>
      <p className="mnemonic-caption">
        Make a <strong>bed</strong> with your hands — <strong>b</strong> comes
        first, <strong>d</strong> comes second.
      </p>
    </div>
  );
}
