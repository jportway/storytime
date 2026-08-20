import type {
  LocalFinding,
  OwlResponse,
  Profile,
  StoryBible,
  StoryStreamEvent,
} from '@storytime/shared';

export interface Credit {
  charactersInvented: string[];
  placesInvented: string[];
  thingsInvented: string[];
  twistsFromCooper: number;
  twistsTotal: number;
  wordsWritten: number;
  beatsDirected: number;
}

/**
 * A session that has expired should send her back to the login page, not
 * surface a raw 401 as an error in the middle of a story. Deployed only —
 * on a laptop there is no gate and this never fires.
 */
function bounceIfSignedOut(res: Response): void {
  if (res.status !== 401) return;
  const here = window.location.pathname + window.location.search;
  window.location.replace(`/login?next=${encodeURIComponent(here)}`);
}

async function json<T>(res: Response): Promise<T> {
  bounceIfSignedOut(res);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function newStory(): Promise<{ bible: StoryBible }> {
  return json(await fetch('/api/stories', { method: 'POST' }));
}

export async function getStory(
  storyId: string,
): Promise<{ bible: StoryBible; credit: Credit }> {
  return json(await fetch(`/api/stories/${storyId}`));
}

export interface StorySummary {
  storyId: string;
  title: string;
  beats: number;
  updatedAt: string;
  finished: boolean;
}

export async function listStories(): Promise<StorySummary[]> {
  return json(await fetch('/api/stories'));
}

/** She chose "The End". Names the book and closes it. */
export async function finishStory(
  storyId: string,
): Promise<{ bible: StoryBible }> {
  return json(
    await fetch(`/api/stories/${storyId}/finish`, { method: 'POST' }),
  );
}

/** She chose to keep going. A fresh arc is dealt behind the scenes. */
export async function continueStory(
  storyId: string,
): Promise<{ bible: StoryBible }> {
  return json(
    await fetch(`/api/stories/${storyId}/continue`, { method: 'POST' }),
  );
}

export async function getProfile(): Promise<Profile> {
  return json(await fetch('/api/owl/profile'));
}

export async function ttsAvailable(): Promise<boolean> {
  try {
    const { available } = await json<{ available: boolean }>(
      await fetch('/api/tts/status'),
    );
    return available;
  } catch {
    return false;
  }
}

export async function askOwl(body: {
  draft: string;
  fork: string;
  findings: LocalFinding[];
  storyNames: string[];
}): Promise<OwlResponse | null> {
  const res = await fetch('/api/owl/coach', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  return res.json();
}

export interface SendCheckIssue {
  original: string;
  suggestion: string;
}

/** The one LLM round trip before a turn sends, once the local checker is clear. */
export async function checkBeforeSend(body: {
  draft: string;
  storyNames: string[];
}): Promise<SendCheckIssue[]> {
  const res = await fetch('/api/owl/send-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  bounceIfSignedOut(res);
  if (!res.ok) return [];
  const { issues } = await res.json();
  return Array.isArray(issues) ? issues : [];
}

/**
 * Stream the next beat, invoking `onEvent` for each server-sent event.
 *
 * Panels arrive one at a time so the story visibly writes itself — a long
 * silent wait is where a ten-year-old's attention goes.
 */
export async function streamBeat(
  storyId: string,
  direction: string | null,
  onEvent: (event: StoryStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`/api/stories/${storyId}/beat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ direction }),
    signal,
  });

  bounceIfSignedOut(res);
  if (!res.body) throw new Error('No response body');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line.
    let split: number;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const line = frame.split('\n').find((l) => l.startsWith('data: '));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as StoryStreamEvent);
      } catch {
        // A malformed frame is not worth killing the story over.
      }
    }
  }
}
