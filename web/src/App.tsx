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
import {
  BeatView,
  NewFromHere,
  PanelView,
  YourIdea,
  ordinal,
} from './components/Story.js';
import { Owl, type SendGate } from './components/Owl.js';
import { WritingBox } from './components/WritingBox.js';

export function App() {
  const [bible, setBible] = useState<StoryBible | null>(null);
  const [credit, setCredit] = useState<Credit | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [beats, setBeats] = useState<Beat[]>([]);
  /** Panels of the beat currently streaming in. */
  const [livePanels, setLivePanels] = useState<Panel[]>([]);
  const [fork, setFork] = useState('');
  const [writing, setWriting] = useState(false);

  /**
   * The beat on screen resolved the story. She is being asked whether that
   * was the end, and until she answers there is nothing else to do — which
   * is why this replaces the writing box rather than sitting beside it.
   */
  const [landed, setLanded] = useState(false);
  const [closing, setClosing] = useState(false);
  /** Finished books, for the shelf. Loaded once, on the welcome screen. */
  const [shelf, setShelf] = useState<api.StorySummary[]>([]);

  const [draft, setDraft] = useState('');
  const [whatsNew, setWhatsNew] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** The chapter currently being written, as soon as its marker arrives. */
  const [liveChapter, setLiveChapter] = useState<string | null>(null);
  /**
   * What she typed to cause the beat currently streaming in, so her own
   * words sit above it from the first moment rather than appearing only
   * once the beat is finished and saved.
   */
  const [lastDirection, setLastDirection] = useState<string | null>(null);
  const [showMoreBelow, setShowMoreBelow] = useState(false);

  const paneRef = useRef<HTMLElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  /** End of the real story text, before the scroll spacer. */
  const endRef = useRef<HTMLDivElement>(null);
  /**
   * Where to jump when a book is opened off the shelf. A finished book opens
   * at the beginning, because that is what you do with a book you finished.
   * One still being written opens at the end, where she left off — and where
   * the question she has not answered yet is.
   */
  const openAt = useRef<'top' | 'end' | null>(null);
  /** The beat the one-shot scroll has already fired for. */
  const scrolledForBeat = useRef<number | null>(null);
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
      setLiveChapter(null);
      setLastDirection(direction);
      setLanded(false);
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
            case 'landing':
              setFork(event.text);
              setLanded(true);
              break;
            case 'chapter':
              setLiveChapter(event.title);
              break;
            case 'beat-complete':
              setBeats((prev) => [...prev, event.beat]);
              setLivePanels([]);
              // The committed beat carries its own chapterTitle now; leaving
              // this set would count the same chapter twice.
              setLiveChapter(null);
              setLastDirection(null);
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
    setLanded(false);
    await runBeat(fresh.storyId, null);
    setCredit(await api.getStory(fresh.storyId).then((s) => s.credit));
  }, [runBeat]);

  /**
   * Open a book off the shelf.
   *
   * Until now a reload lost the story for good — the listing endpoint existed
   * and nothing ever called it, so thirty stories sat on disk unreachable.
   */
  const openStory = useCallback(async (storyId: string) => {
    const { bible: saved, credit: savedCredit } = await api.getStory(storyId);
    setBible(saved);
    setBeats(saved.beats);
    setCredit(savedCredit);
    setDraft('');
    const last = saved.beats[saved.beats.length - 1];
    setFork(last?.fork ?? '');
    openAt.current = saved.finishedAt ? 'top' : 'end';
    // A story put down on a landing beat is still waiting for her answer.
    // Clearing this on open would strand her: the beat resolved, so there is
    // no cliffhanger to write from and no choice on screen either.
    setLanded(Boolean(last?.landing) && !saved.finishedAt);
  }, []);

  const chooseEnd = useCallback(async () => {
    if (!bible) return;
    setClosing(true);
    try {
      const { bible: finished } = await api.finishStory(bible.storyId);
      setBible(finished);
      setLanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setClosing(false);
    }
  }, [bible]);

  const chooseMore = useCallback(async () => {
    if (!bible) return;
    setClosing(true);
    try {
      // She is told nothing. From where she sits she simply answered the
      // question and the story carried on.
      const { bible: next } = await api.continueStory(bible.storyId);
      setBible(next);
      setLanded(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setClosing(false);
    }
  }, [bible]);

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

  // -----------------------------------------------------------------------
  // The scroll rule
  //
  // Scroll exactly once per beat, to put the *top* of the new text just
  // under the header — then stop, however many panels arrive afterwards.
  //
  // The old behaviour re-pinned to the bottom on every streamed panel, which
  // meant the start of a beat was pushed off the top of the screen before
  // she had read it. Text now grows downward into the empty space she is
  // already looking at, and nothing she has not yet read ever moves.
  // -----------------------------------------------------------------------

  const beatBoundary = livePanels.length > 0 ? beats.length + 1 : beats.length;

  useEffect(() => {
    const where = openAt.current;
    if (where) {
      openAt.current = null;
      const pane = paneRef.current;
      if (pane) {
        // Claim this boundary so the per-beat rule doesn't immediately
        // scroll somewhere else, and jump without animation — she asked for
        // this book, she should simply be in it.
        scrolledForBeat.current = beatBoundary;

        if (where === 'top') {
          pane.scrollTop = 0;
        } else {
          // Against endRef rather than scrollHeight: the spacer beneath the
          // story is most of a screen tall, so scrolling to the bottom of the
          // scroller lands in blank paper with the story off above.
          const end = endRef.current;
          const gap = 170; // clears the ending row
          pane.scrollTop = end
            ? Math.max(
                0,
                end.getBoundingClientRect().top -
                  pane.getBoundingClientRect().top +
                  pane.scrollTop -
                  pane.clientHeight +
                  gap,
              )
            : pane.scrollHeight;
        }
        return;
      }
    }

    if (beatBoundary === 0 || scrolledForBeat.current === beatBoundary) return;
    // Wait for the divider to exist; the opening beat has none, and there is
    // nothing above it to scroll away from anyway.
    const pane = paneRef.current;
    const divider = dividerRef.current;
    if (!pane) return;
    scrolledForBeat.current = beatBoundary;
    if (!divider) return;

    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    // scrollTop arithmetic rather than scrollIntoView: on a nested scroller
    // scrollIntoView can also scroll ancestors, and "top of the pane" is
    // exactly what we want rather than what block:'start' approximates once
    // padding is involved.
    const top =
      divider.getBoundingClientRect().top -
      pane.getBoundingClientRect().top +
      pane.scrollTop;

    pane.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
  }, [beatBoundary]);

  // "More below" appears only while there is genuinely more below.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    let frame = 0;
    const check = () => {
      frame = 0;
      const end = endRef.current;
      if (!end) {
        setShowMoreBelow(false);
        return;
      }
      // Against the end of the text, not scrollHeight — the spacer below it
      // is deliberately empty and must never claim there's more to read.
      const paneBottom = pane.getBoundingClientRect().bottom;
      setShowMoreBelow(end.getBoundingClientRect().top > paneBottom - 24);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };

    check();
    pane.addEventListener('scroll', onScroll, { passive: true });
    const observer = new ResizeObserver(onScroll);
    observer.observe(pane);
    return () => {
      pane.removeEventListener('scroll', onScroll);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [beats.length, livePanels.length, fork]);

  /** One viewport down, not all the way to the end — she sets the pace. */
  const pageDown = useCallback(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const reduced = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    pane.scrollBy({
      top: pane.clientHeight * 0.85,
      behavior: reduced ? 'auto' : 'smooth',
    });
  }, []);

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

  // Only while she is on the welcome screen: once a story is open the shelf
  // is stale, and it is reloaded next time she comes back to it anyway.
  useEffect(() => {
    if (bible) return;
    let live = true;
    void api
      .listStories()
      .then((all) => live && setShelf(all))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [bible]);

  // ---------------------------------------------------------------------

  if (!bible) {
    return (
      <Welcome
        shelf={shelf}
        onStart={() => void start()}
        onOpen={(id) => void openStory(id)}
      />
    );
  }

  // The current chapter is simply the most recent title any beat has set,
  // plus whichever one is mid-flight.
  const chapterTitles = beats
    .map((b) => b.chapterTitle)
    .filter((t): t is string => Boolean(t));
  if (liveChapter) chapterTitles.push(liveChapter);
  const currentChapter = chapterTitles[chapterTitles.length - 1] ?? null;

  /** Which chapter number a given beat's title opens. */
  let seen = 0;
  const chapterNumberFor = new Map<number, number>();
  for (const beat of beats) {
    if (beat.chapterTitle) chapterNumberFor.set(beat.n, ++seen);
  }

  const newestBeat = beats[beats.length - 1];
  // Only once there is a divider to scroll to — the opening beat has nothing
  // above it and should simply start at the top.
  const needsSpacer = writing ? beats.length > 0 : (newestBeat?.n ?? 0) > 1;

  return (
    <div className="app">
      <header className="topbar">
        <h1>{bible.title}</h1>
        {currentChapter && (
          <span className="topbar-chapter">
            Chapter {ordinal(chapterTitles.length)} · {currentChapter}
          </span>
        )}
      </header>

      <main className="story" ref={paneRef}>
        <div className="story-column">
          {beats.map((beat) => (
            <BeatView
              key={beat.n}
              beat={beat}
              chapterNumber={chapterNumberFor.get(beat.n)}
              isNewest={!writing && beat.n === newestBeat?.n}
              dividerRef={beat.n === newestBeat?.n ? dividerRef : undefined}
            />
          ))}

          {(writing || livePanels.length > 0) && (
            <section className="beat">
              {liveChapter && (
                <ChapterBreakLive
                  n={chapterTitles.length}
                  title={liveChapter}
                />
              )}
              {beats.length > 0 && <NewFromHere ref={dividerRef} />}
              {lastDirection && <YourIdea text={lastDirection} />}
              {livePanels.map((panel, i) => (
                <PanelView key={i} panel={panel} index={i} />
              ))}
              {livePanels.length > 0 && <span className="stream-caret" />}
            </section>
          )}

          {error && (
            <p className="error">
              {error} <button onClick={() => setError(null)}>OK</button>
            </p>
          )}

          {bible.finishedAt && (
            <div className="the-end">
              <p className="the-end-mark">THE END</p>
              <p className="the-end-title">{bible.title}</p>
              <p className="the-end-by">by Cooper</p>
            </div>
          )}

          {/* Marks the end of real content, so "More below" measures the
              story rather than the spacer underneath it. */}
          <div ref={endRef} />

          {/*
            Without this the one scroll clamps: at the moment a beat starts
            there is not yet enough text below the divider to pull it to the
            top of the pane, so it would settle halfway up and stay there.
            A viewport of empty paper below is what the design intends —
            the beat grows down into it.
          */}
          {needsSpacer && <div className="story-spacer" aria-hidden="true" />}
        </div>
      </main>

      <div className="bottom-fade" aria-hidden="true" />

      {showMoreBelow && !landed && !bible.finishedAt && (
        <button className="more-below" onClick={pageDown}>
          More below ↓
        </button>
      )}

      {whatsNew.length > 0 && <span className="whats-new">{whatsNew[0]}</span>}

      {bible.finishedAt ? (
        <div className="ending-row">
          <p className="ending-note">
            You finished it. It's on the shelf now.
          </p>
          <button className="start" onClick={() => setBible(null)}>
            Back to my books
          </button>
        </div>
      ) : landed ? (
        <div className="ending-row">
          <p className="ending-note">Is that the end?</p>
          <div className="ending-choice">
            <button
              className="start"
              disabled={closing}
              onClick={() => void chooseEnd()}
            >
              {closing ? 'Closing the book…' : 'The End'}
            </button>
            <button
              className="keep-going"
              disabled={closing}
              onClick={() => void chooseMore()}
            >
              Keep going
            </button>
          </div>
        </div>
      ) : (
      <div className="composer-row">
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
          streaming={writing}
        />
        <WritingBox
          value={draft}
          onChange={setDraft}
          onSend={() => void attemptSend()}
          findings={owl.findings}
          disabled={writing || checkingSend}
          streaming={writing}
        />
      </div>
      )}
    </div>
  );
}

/**
 * The shelf.
 *
 * A finished book she can't open again isn't really a book, and this is also
 * what makes a generated cover worth having later — the slot below is
 * deliberately book-shaped and empty.
 */
function Welcome({
  shelf,
  onStart,
  onOpen,
}: {
  shelf: api.StorySummary[];
  onStart: () => void;
  onOpen: (storyId: string) => void;
}) {
  const books = shelf.filter((s) => s.finished);
  // Anything with real writing in it and no ending yet is worth offering back.
  const unfinished = shelf.filter((s) => !s.finished && s.beats > 1).slice(0, 1);

  return (
    <div className="welcome">
      <div className="welcome-owl" aria-hidden="true" />
      <h1>Storytime</h1>
      <p className="welcome-sub">You're going to write a book.</p>

      {books.length > 0 && (
        <div className="shelf">
          <h2 className="shelf-title">Your books</h2>
          <div className="shelf-row">
            {books.map((b) => (
              <button
                key={b.storyId}
                className="book"
                onClick={() => onOpen(b.storyId)}
              >
                {/* The title sits on the cover, because that is where a
                    title goes. A generated cover replaces this whole face
                    later without moving anything around it. */}
                <span className="book-cover">
                  <span className="book-title">{b.title}</span>
                  <span className="book-by">Cooper</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="start" onClick={onStart}>
        Start a Cooperworld story
      </button>

      {unfinished.map((s) => (
        <button
          key={s.storyId}
          className="carry-on"
          onClick={() => onOpen(s.storyId)}
        >
          …or carry on with {s.title}
        </button>
      ))}

      <p className="welcome-foot">
        The owl will read along and help with the hard words.
      </p>
    </div>
  );
}

/** The chapter break for the beat currently streaming in. */
function ChapterBreakLive({ n, title }: { n: number; title: string }) {
  return (
    <div className="chapter-break">
      <span className="chapter-break-number">Chapter {ordinal(n)}</span>
      <h2 className="chapter-break-title">{title}</h2>
    </div>
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
