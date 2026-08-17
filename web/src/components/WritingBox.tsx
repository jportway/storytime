import { useLayoutEffect, useRef } from 'react';
import type { LocalFinding } from '@storytime/shared';

interface WritingBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  findings: LocalFinding[];
  disabled: boolean;
  fork: string;
}

/**
 * Where Cooper writes.
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
  fork,
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

  return (
    <div className="writing">
      {fork && <p className="fork">{fork}</p>}

      <div className="writing-field">
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
          placeholder="What happens next?"
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          rows={3}
        />
      </div>

      <div className="writing-actions">
        <button
          className="send"
          onClick={onSend}
          disabled={disabled || !value.trim()}
        >
          {disabled ? 'Writing…' : 'Send it!'}
        </button>
      </div>
    </div>
  );
}
