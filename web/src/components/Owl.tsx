import { useEffect, useRef, useState } from 'react';
import type { HelpKind, OwlHelp, OwlResponse } from '@storytime/shared';

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
}

/**
 * The owl and its board.
 *
 * The owl speaks; the board beside it shows the word, with the tricky
 * letters lighting up in time with the voice. For b/d reversals it also
 * draws the hands mnemonic, because that reversal isn't a spelling problem
 * and shouldn't be treated like one.
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

  return (
    <aside className="owl-area">
      <button
        className={`owl ${thinking || checkingSend ? 'owl-thinking' : ''}`}
        onClick={onAskForHelp}
        title="Ask the owl for help"
        aria-label="Ask the owl for help"
      >
        <OwlFace />
      </button>

      <div className="owl-board" aria-live="polite">
        {checkingSend && !gate && <p className="owl-gate-message">Let me look...</p>}

        {gate ? (
          <div className="board-card gate-card">
            <div className="board-word">
              {[...gate.word].map((letter, i) => (
                <span key={i} className="board-letter">
                  {letter}
                </span>
              ))}
            </div>

            {gate.kind === 'reversal' && <BedHands />}

            {gate.exhausted ? (
              <>
                <p className="owl-gate-message">Have a go yourself, then send it again.</p>
                <button className="board-dismiss" onClick={onGateAcknowledge}>
                  Okay
                </button>
              </>
            ) : (
              <>
                <p className="owl-gate-message">Is that supposed to say "{gate.suggestion}"?</p>
                <button className="board-accept" onClick={onGateYes}>
                  Yes, that's it
                </button>
                <button className="board-dismiss" onClick={onGateNo}>
                  No
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            {response?.praise && !activeHelp && (
              <p className="owl-praise">{response.praise}</p>
            )}

            {board && (
              <div className="board-card">
                <div className="board-word">
                  {[...board.word].map((letter, i) => (
                    <span
                      key={i}
                      className={[
                        'board-letter',
                        board.highlight.includes(i) ? 'tricky' : '',
                        litLetter === i ? 'lit' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {letter}
                    </span>
                  ))}
                </div>

                {board.mnemonic === 'bed-hands' && <BedHands />}

                <button
                  className="board-accept"
                  onClick={() => {
                    onAccept(activeHelp!);
                    setActiveHelp(null);
                  }}
                >
                  Fix it for me
                </button>
                <button className="board-dismiss" onClick={() => setActiveHelp(null)}>
                  I'll do it
                </button>
              </div>
            )}

            {response?.nudge && !activeHelp && (
              <p className="owl-nudge">{response.nudge}</p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function OwlFace() {
  return (
    <svg viewBox="0 0 100 100" width="86" height="86" aria-hidden="true">
      <ellipse cx="50" cy="58" rx="34" ry="36" fill="#8b6b4a" />
      <ellipse cx="50" cy="64" rx="24" ry="26" fill="#d6b98c" />
      <path d="M18 34 L30 16 L40 32 Z" fill="#8b6b4a" />
      <path d="M82 34 L70 16 L60 32 Z" fill="#8b6b4a" />
      <circle cx="37" cy="47" r="13" fill="#fffdf7" />
      <circle cx="63" cy="47" r="13" fill="#fffdf7" />
      <circle cx="38" cy="48" r="6" fill="#2b2118" />
      <circle cx="62" cy="48" r="6" fill="#2b2118" />
      <circle cx="40" cy="46" r="2" fill="#fff" />
      <circle cx="64" cy="46" r="2" fill="#fff" />
      <path d="M50 55 L44 63 L56 63 Z" fill="#e0983c" />
    </svg>
  );
}

/**
 * The b/d trick: make fists with both thumbs up and they spell "bed" — so
 * the b always comes first and the d always comes second.
 */
function BedHands() {
  return (
    <div className="mnemonic">
      <svg viewBox="0 0 200 90" width="180" height="81" aria-hidden="true">
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
