import { useCallback, useEffect, useRef, useState } from 'react';
import { ttsAvailable } from '../api.js';

/**
 * The owl's voice.
 *
 * Uses ElevenLabs via the server when a key is configured, and falls back to
 * the browser's built-in speech synthesis otherwise — so the game is fully
 * playable with no API key at all, just with a less charming owl.
 */
export function useSpeech() {
  const [useElevenLabs, setUseElevenLabs] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    void ttsAvailable().then(setUseElevenLabs);
  }, []);

  const stop = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const playUrl = useCallback(
    (url: string, body?: unknown): Promise<void> =>
      new Promise((resolve) => {
        const run = async () => {
          try {
            const res = body
              ? await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                })
              : await fetch(url);
            if (!res.ok) throw new Error(String(res.status));

            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const audio = new Audio(objectUrl);
            audioRef.current = audio;

            const done = () => {
              URL.revokeObjectURL(objectUrl);
              resolve();
            };
            audio.onended = done;
            audio.onerror = done;
            await audio.play();
          } catch {
            resolve();
          }
        };
        void run();
      }),
    [],
  );

  const speakBrowser = useCallback(
    (text: string): Promise<void> =>
      new Promise((resolve) => {
        if (!window.speechSynthesis) return resolve();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.pitch = 1.15;
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      }),
    [],
  );

  /** Speak a line. Queued, so overlapping calls don't talk over each other. */
  const say = useCallback(
    (text: string): Promise<void> => {
      const next = queueRef.current.then(async () => {
        setSpeaking(true);
        if (useElevenLabs) await playUrl('/api/tts/speak', { text });
        else await speakBrowser(text);
        setSpeaking(false);
      });
      queueRef.current = next.catch(() => undefined);
      return next;
    },
    [useElevenLabs, playUrl, speakBrowser],
  );

  /**
   * Spell a word aloud, one letter at a time, calling `onLetter` as each is
   * spoken so the board can light up in sync.
   *
   * With ElevenLabs this stitches the 26 pre-rendered letter clips: the
   * model has no reliable say-as-characters support, so generating "G, O, E,
   * S" as one phrase comes out differently every time.
   */
  const spellOut = useCallback(
    async (word: string, onLetter?: (index: number) => void): Promise<void> => {
      const letters = [...word].filter((c) => /[a-zA-Z]/.test(c));
      for (let i = 0; i < letters.length; i++) {
        onLetter?.(i);
        const letter = letters[i]!.toLowerCase();
        if (useElevenLabs) await playUrl(`/api/tts/letter/${letter}`);
        else await speakBrowser(letter.toUpperCase());
      }
      onLetter?.(-1);
    },
    [useElevenLabs, playUrl, speakBrowser],
  );

  useEffect(() => stop, [stop]);

  return { say, spellOut, stop, speaking, useElevenLabs };
}
