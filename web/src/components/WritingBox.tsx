import { useLayoutEffect, useRef } from 'react';
import type { LocalFinding } from '@storytime/shared';

interface WritingBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  findings: LocalFinding[];
  disabled: boolean;
  /** True while the story is being written — the composer goes quiet. */
  streaming: boolean;
}

/**
 * Where Cooper writes.
 *
 * Floats over the story rather than reserving a band of the page, and stays
 * a single-line pill — always. It used to grow to two rows and a hint row on
 * focus, which pushed it past the ~108px the story pane reserves underneath
 * itself and covered the last line and a half of the beat. That line is the
 * fork: the thing she is answering, hidden at the exact moment she goes to
 * answer it. She writes a sentence, not a paragraph, so the room was never
 * worth what it cost.
 *
 * The findings are drawn as soft dotted underlines on a mirror layer behind
 * a transparent textarea. Deliberately not red, not squiggly, and never a
 * count of mistakes — this is a quiet "worth a look", not a mark out of ten.
 *
 * Send is never disabled by findings. She can always send exactly what she
 * wrote; the owl helps, it doesn't gate.
 */
export function WritingBox({
  value,
  onChange,
  onSend,
  findings,
  disabled,
  streaming,
}: WritingBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);

  // Keep the underline layer scrolled with the text it belongs to.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!textarea || !mirror) return;
    const sync = () => {
      mirror.scrollTop = textarea.scrollTop;
    };
    textarea.addEventListener('scroll', sync);
    return () => textarea.removeEventListener('scroll', sync);
  }, []);

  const segments: React.ReactNode[] = [];
  let cursor = 0;
  for (const [i, finding] of findings.entries()) {
    if (finding.start > cursor) {
      segments.push(value.slice(cursor, finding.start));
    }
    segments.push(
      <mark
        key={i}
        className={`spell-mark spell-${finding.confidence} spell-kind-${finding.kind}`}
      >
        {value.slice(finding.start, finding.end)}
      </mark>,
    );
    cursor = finding.end;
  }
  segments.push(value.slice(cursor));

  // Deliberately generic: the fork is the story's own question and it now
  // sits at the end of the story text where she can still read it while she
  // answers. Repeating it here only clipped it mid-sentence.
  const placeholder = streaming ? 'The story is writing…' : 'What happens next?';

  const classes = ['composer-pill', streaming ? 'composer-streaming' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <div className="composer-field">
        <div className="writing-mirror" ref={mirrorRef} aria-hidden="true">
          {segments}
          {'\n'}
        </div>
        <textarea
          ref={textareaRef}
          className="writing-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter makes a new line.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!disabled && value.trim()) onSend();
            }
          }}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete="off"
          disabled={streaming}
          rows={1}
          aria-label="What happens next?"
        />
      </div>

      <SendButton
        onSend={onSend}
        disabled={disabled || !value.trim()}
        streaming={streaming}
      />
    </div>
  );
}

function SendButton({
  onSend,
  disabled,
  streaming,
}: {
  onSend: () => void;
  disabled: boolean;
  streaming: boolean;
}) {
  return (
    <button
      className="send"
      onClick={onSend}
      disabled={disabled}
    >
      {streaming ? 'Writing…' : 'Send it!'}
    </button>
  );
}
