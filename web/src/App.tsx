import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Beat,
  OwlHelp,
  Panel,
  Profile,
  SpellChecker,
  StoryBible,
} from '@storytime/shared';
import * as api from './api.js';
import type { Credit } from './api.js';
import { buildChecker } from './spellchecker.js';
import { useOwl } from './hooks/useOwl.js';
import { useSpeech } from './hooks/useSpeech.js';
import { BeatView, PanelView } from './components/Story.js';
import { Owl } from './components/Owl.js';
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

  const send = useCallback(async () => {
    if (!bible || !draft.trim()) return;
    const direction = draft;
    setDraft('');
    owl.dismiss();
    await runBeat(bible.storyId, direction);

    const [freshProfile, story] = await Promise.all([
      api.getProfile().catch(() => null),
      api.getStory(bible.storyId).catch(() => null),
    ]);
    if (freshProfile) setProfile(freshProfile);
    if (story) setCredit(story.credit);
  }, [bible, draft, owl, runBeat]);

  useEffect(() => {
    void api.getProfile().then(setProfile).catch(() => undefined);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [beats.length, livePanels.length, fork]);

  /** Accept one of the owl's corrections. Never applied automatically. */
  const acceptHelp = useCallback((help: OwlHelp) => {
    setDraft((prev) =>
      prev.replace(
        new RegExp(`\\b${escapeRegExp(help.original)}\\b`),
        help.fixed,
      ),
    );
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
          onSend={() => void send()}
          findings={owl.findings}
          disabled={writing}
          fork={fork}
        />
        <Owl
          response={owl.response}
          thinking={owl.thinking}
          onAskForHelp={owl.askNow}
          onAccept={acceptHelp}
          say={speech.say}
          spellOut={speech.spellOut}
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
