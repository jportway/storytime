import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isCosmeticFix,
  matchCase,
  type Beat,
  type OwlHelp,
  type Panel,
  type Profile,
  type SpellChecker,
  type StoryBible,
} from '@storytime/shared';
import * as api from './api.js';
import type { Credit } from './api.js';
import { buildChecker } from './spellchecker.js';
import { useOwl } from './hooks/useOwl.js';
import { useSpeech } from './hooks/useSpeech.js';
import { BeatView, PanelView } from './components/Story.js';
import { Owl, type SendGate } from './components/Owl.js';
import { WritingBox } from './components/WritingBox.js';
import { WhoIsWho } from './components/WhoIsWho.js';

export function App() {
  const [bible, setBible] = useState<StoryBible | null>(null);
  const [credit, setCredit] = useState<Credit | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [beats, setBeats] = useState<Beat[]>([]);
  /** Panels of the beat currently streaming in. */
  const [livePanels, setLivePanels] = useState<Panel[]>([]);
  const [fork, setFork] = useState('');
  const [writing, setWriting] = useState(false);

  const [draft, setDraft] = useState('');
  const [whatsNew, setWhatsNew] = useState<string[]>([]);
  const [showWho, setShowWho] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const speech = useSpeech();

  const storyNames = useMemo(() => {
    if (!bible) return [];
    return [
      ...bible.characters.map((c) => c.name),
      ...bible.places.map((p) => p.name),
      ...bible.things.map((t) => t.name),
    ].flatMap((n) => n.split(/[\s']+/));
  }, [bible]);

  const checker: SpellChecker | null = useMemo(() => {
    if (!bible) return null;
    return buildChecker({ storyNames, profile });
  }, [bible, storyNames, profile]);

  const owl = useOwl({
    draft,
    fork,
    checker,
    storyNames,
    // The owl goes quiet while the story is being written — she should be
    // reading then, not being coached.
    enabled: !writing && Boolean(bible),
  });

  // ---------------------------------------------------------------------
  // Starting and continuing the story
  // ---------------------------------------------------------------------

  const runBeat = useCallback(
    async (storyId: string, direction: string | null) => {
      setWriting(true);
      setLivePanels([]);
      setFork('');
      setError(null);

      try {
        await api.streamBeat(storyId, direction, (event) => {
          switch (event.type) {
            case 'panel':
              setLivePanels((prev) => [...prev, event.panel]);
              break;
            case 'fork':
              setFork(event.text);
              break;
            case 'beat-complete':
              setBeats((prev) => [...prev, event.beat]);
              setLivePanels([]);
              break;
            case 'bible-updated':
              setBible(event.bible);
              setWhatsNew(event.whatsNew);
              break;
            case 'redirect':
              // Never an error dialog. The owl bends it in-fiction.
              setFork('');
              void speech.say(event.message);
              break;
            case 'error':
              setError(event.message);
              break;
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setWriting(false);
      }
    },
    [speech],
  );

  const start = useCallback(async () => {
    const { bible: fresh } = await api.newStory();
    setBible(fresh);
    setBeats([]);
    setDraft('');
    await runBeat(fresh.storyId, null);
    setCredit(await api.getStory(fresh.storyId).then((s) => s.credit));
  }, [runBeat]);

  const send = useCallback(
    async (text?: string) => {
      const direction = text ?? draft;
      if (!bible || !direction.trim()) return;
      setDraft('');
      setGate(null);
      gateDraftRef.current = null;
      rejectedGuesses.current = {};
      llmQueue.current = [];
      llmChecked.current = false;
      owl.dismiss();
      await runBeat(bible.storyId, direction);

      const [freshProfile, story] = await Promise.all([
        api.getProfile().catch(() => null),
        api.getStory(bible.storyId).catch(() => null),
      ]);
      if (freshProfile) setProfile(freshProfile);
      if (story) setCredit(story.credit);
    },
    [bible, draft, owl, runBeat],
  );

  // -----------------------------------------------------------------------
  // Checking her spelling before a turn actually sends.
  //
  // Not a hard gate: the writing box stays fully editable throughout (except
  // for the brief LLM round trip itself), and once the owl's guesses for a
  // word run out it lets that word through rather than trapping her.
  //
  // Two sources, checked in order:
  //  1. The local checker's high-confidence layers (reversals, curated
  //     misspellings) — instant, no network, and reliable enough to gate on
  //     directly. These are deterministic: there's no legitimate second
  //     guess, so a "no" goes straight to "have a go yourself".
  //  2. One LLM round trip, only once (1) is clear — it catches badly
  //     garbled words the local checker can't see at all, and it actually
  //     knows English, so it won't false-flag a real word just because the
  //     small local dictionary doesn't happen to contain it.
  // -----------------------------------------------------------------------

  const [gate, setGate] = useState<SendGate | null>(null);
  const [checkingSend, setCheckingSend] = useState(false);
  const rejectedGuesses = useRef<Record<string, Set<string>>>({});
  const llmQueue = useRef<api.SendCheckIssue[]>([]);
  /** Whether the one LLM check has already run for the current send attempt. */
  const llmChecked = useRef(false);
  /** The draft a currently-open gate prompt refers to, so we can drop it if
   * she starts fixing the word herself instead of answering yes/no. */
  const gateDraftRef = useRef<string | null>(null);

  const openGate = useCallback((next: SendGate | null, text: string) => {
    gateDraftRef.current = next ? text : null;
    setGate(next);
  }, []);

  const nextLocalGateFor = useCallback(
    (text: string): SendGate | null => {
      if (!checker) return null;
      for (const f of checker.check(text)) {
        if (f.confidence !== 'high') continue;
        // Capitalisation and apostrophes never block a send — the curated
        // table is full of dont/don't and im/I'm entries, and none of them
        // are worth stopping her for.
        if (isCosmeticFix(f.word, f.suggestion)) continue;
        if (rejectedGuesses.current[f.word.toLowerCase()]?.has(f.suggestion.toLowerCase())) continue;
        return { word: f.word, suggestion: f.suggestion, kind: f.kind, retryable: false, exhausted: false };
      }
      return null;
    },
    [checker],
  );

  const nextQueuedGate = useCallback((): SendGate | null => {
    const issue = llmQueue.current.shift();
    if (!issue) return null;
    // Retryable: unlike the local-only case, the owl has already confirmed
    // something's genuinely wrong here, so a cheap local second guess is
    // worth offering before giving up — it's no longer the risky "guess on
    // a word that might actually be fine" situation that started this.
    return { word: issue.original, suggestion: issue.suggestion, kind: 'spelling', retryable: true, exhausted: false };
  }, []);

  /**
   * Work through everything standing between her and sending, one question
   * at a time, then send. Re-entered after each answer.
   *
   * Local high-confidence gates drain first and the LLM check runs once,
   * after they're clear — deliberately in that order, so the LLM sees text
   * with the deterministic corrections already applied rather than tripping
   * over them.
   */
  const continueSend = useCallback(
    async (text: string) => {
      const local = nextLocalGateFor(text);
      if (local) {
        openGate(local, text);
        return;
      }

      if (!llmChecked.current) {
        llmChecked.current = true;
        setCheckingSend(true);
        try {
          llmQueue.current = await api.checkBeforeSend({ draft: text, storyNames });
        } finally {
          setCheckingSend(false);
        }
      }

      const queued = nextQueuedGate();
      if (queued) {
        openGate(queued, text);
        return;
      }

      openGate(null, text);
      void send(text);
    },
    [nextLocalGateFor, nextQueuedGate, openGate, send, storyNames],
  );

  /** Pressing Send starts a fresh attempt — nothing carried over from the last. */
  const attemptSend = useCallback(() => {
    if (!draft.trim() || !checker) return;
    llmChecked.current = false;
    llmQueue.current = [];
    void continueSend(draft);
  }, [draft, checker, continueSend]);

  const gateYes = useCallback(() => {
    if (!gate) return;
    const match = draft.match(new RegExp(`\\b${escapeRegExp(gate.word)}\\b`));
    const fixed =
      match && match.index !== undefined
        ? draft.slice(0, match.index) +
          matchCase(match[0], gate.suggestion) +
          draft.slice(match.index + match[0].length)
        : draft;
    setDraft(fixed);
    void continueSend(fixed);
  }, [gate, draft, continueSend]);

  const gateNo = useCallback(() => {
    if (!gate || !checker) return;
    const key = gate.word.toLowerCase();
    const rejected = rejectedGuesses.current[key] ?? new Set<string>();
    rejected.add(gate.suggestion.toLowerCase());
    rejectedGuesses.current[key] = rejected;

    const alt = gate.retryable ? checker.nextCandidate(gate.word, rejected) : null;
    openGate(
      { ...gate, suggestion: alt ?? gate.suggestion, retryable: gate.retryable && Boolean(alt), exhausted: !alt },
      draft,
    );
  }, [gate, checker, draft, openGate]);

  const gateAcknowledge = useCallback(() => void continueSend(draft), [draft, continueSend]);

  // A stale gate prompt (about text that's since changed) is worse than no
  // prompt — if she starts typing instead of answering, let it go.
  useEffect(() => {
    if (gate && draft !== gateDraftRef.current) setGate(null);
  }, [draft, gate]);

  useEffect(() => {
    void api.getProfile().then(setProfile).catch(() => undefined);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [beats.length, livePanels.length, fork]);

  /** Accept one of the owl's corrections. Never applied automatically. */
  const acceptHelp = useCallback((help: OwlHelp) => {
    setDraft((prev) => {
      const match = prev.match(new RegExp(`\\b${escapeRegExp(help.original)}\\b`));
      if (!match || match.index === undefined) return prev;
      return (
        prev.slice(0, match.index) +
        matchCase(match[0], help.fixed) +
        prev.slice(match.index + match[0].length)
      );
    });
  }, []);

  // ---------------------------------------------------------------------

  if (!bible) {
    return (
      <div className="welcome">
        <h1>Storytime</h1>
        <p>You're going to write a comic book.</p>
        <button className="start" onClick={() => void start()}>
          Start a Grimwood story
        </button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>{bible.title}</h1>
        <div className="topbar-actions">
          {whatsNew.length > 0 && (
            <span className="whats-new">{whatsNew[0]}</span>
          )}
          <button onClick={() => setShowWho(true)}>Who's who</button>
        </div>
      </header>

      <main className="story">
        {beats.map((beat) => (
          <BeatView key={beat.n} beat={beat} />
        ))}

        {livePanels.length > 0 && (
          <section className="beat">
            {livePanels.map((panel, i) => (
              <PanelView key={i} panel={panel} index={i} />
            ))}
          </section>
        )}

        {writing && livePanels.length === 0 && (
          <p className="writing-indicator">The story is thinking…</p>
        )}

        {error && (
          <p className="error">
            {error} <button onClick={() => setError(null)}>OK</button>
          </p>
        )}

        <div ref={bottomRef} />
      </main>

      <footer className="composer">
        <WritingBox
          value={draft}
          onChange={setDraft}
          onSend={() => void attemptSend()}
          findings={owl.findings}
          disabled={writing || checkingSend}
          fork={fork}
        />
        <Owl
          response={owl.response}
          thinking={owl.thinking}
          onAskForHelp={owl.askNow}
          onAccept={acceptHelp}
          say={speech.say}
          spellOut={speech.spellOut}
          gate={gate}
          onGateYes={gateYes}
          onGateNo={gateNo}
          onGateAcknowledge={gateAcknowledge}
          checkingSend={checkingSend}
        />
      </footer>

      {showWho && (
        <WhoIsWho
          bible={bible}
          credit={credit}
          onClose={() => setShowWho(false)}
        />
      )}
    </div>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
