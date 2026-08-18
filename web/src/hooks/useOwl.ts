import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalFinding, OwlResponse, SpellChecker } from '@storytime/shared';
import { askOwl } from '../api.js';

/**
 * She stops typing for this long before the owl says anything.
 *
 * This number is the single most important UX decision in the project.
 * Interrupting mid-word is destructive to a child who already finds writing
 * hard — the underlines appear live and silently, but the owl's voice waits
 * for a natural gap.
 */
const PAUSE_MS = 2000;

/** A longer silence with almost nothing written means she's stuck. */
const STUCK_MS = 12_000;

export interface OwlState {
  findings: LocalFinding[];
  response: OwlResponse | null;
  thinking: boolean;
}

export function useOwl(opts: {
  draft: string;
  fork: string;
  checker: SpellChecker | null;
  storyNames: string[];
  /** Suppressed while the story is being written. */
  enabled: boolean;
}) {
  const [findings, setFindings] = useState<LocalFinding[]>([]);
  const [response, setResponse] = useState<OwlResponse | null>(null);
  const [thinking, setThinking] = useState(false);

  const pauseTimer = useRef<number | undefined>(undefined);
  const stuckTimer = useRef<number | undefined>(undefined);
  const lastAsked = useRef('');

  // Tier 0: instant, local, silent. Runs on every keystroke.
  useEffect(() => {
    if (!opts.checker || !opts.enabled) {
      setFindings([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setFindings(opts.checker!.check(opts.draft));
    }, 300);
    return () => window.clearTimeout(handle);
  }, [opts.draft, opts.checker, opts.enabled]);

  const consult = useCallback(
    async (draft: string) => {
      if (!opts.enabled) return;
      if (draft === lastAsked.current) return;
      lastAsked.current = draft;

      setThinking(true);
      try {
        const result = await askOwl({
          draft,
          fork: opts.fork,
          findings: opts.checker?.check(draft) ?? [],
          storyNames: opts.storyNames,
        });
        setResponse(result);
      } finally {
        setThinking(false);
      }
    },
    [opts.enabled, opts.fork, opts.checker, opts.storyNames],
  );

  // Tier 1: the owl speaks, but only after she pauses.
  useEffect(() => {
    window.clearTimeout(pauseTimer.current);
    window.clearTimeout(stuckTimer.current);
    if (!opts.enabled) return;

    const words = opts.draft.trim().split(/\s+/).filter(Boolean).length;

    if (words >= 3) {
      pauseTimer.current = window.setTimeout(
        () => void consult(opts.draft),
        PAUSE_MS,
      );
    }

    // Blank page, long silence — offer a leading question rather than
    // letting her sit there feeling stuck.
    if (words < 3) {
      stuckTimer.current = window.setTimeout(
        () => void consult(opts.draft),
        STUCK_MS,
      );
    }

    return () => {
      window.clearTimeout(pauseTimer.current);
      window.clearTimeout(stuckTimer.current);
    };
  }, [opts.draft, opts.enabled, consult]);

  /** "Owl, help me" — she asked, so answer immediately. */
  const askNow = useCallback(() => {
    lastAsked.current = '';
    void consult(opts.draft);
  }, [consult, opts.draft]);

  const dismiss = useCallback(() => setResponse(null), []);

  return { findings, response, thinking, askNow, dismiss } satisfies OwlState & {
    askNow: () => void;
    dismiss: () => void;
  };
}
