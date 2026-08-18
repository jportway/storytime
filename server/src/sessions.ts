import { Session } from './session.js';

/**
 * Live sessions, keyed by story id. A family app on localhost with one
 * player doesn't need anything cleverer than a Map.
 *
 * Shared between the gameplay routes and the admin editor so an edit made
 * in the admin UI lands on the same in-memory bible a live session holds —
 * otherwise the next beat would overwrite the edit with the stale copy it
 * already had in memory.
 */
const sessions = new Map<string, Session>();

export async function getSession(storyId: string): Promise<Session | null> {
  const live = sessions.get(storyId);
  if (live) return live;
  const resumed = await Session.resume(storyId);
  if (resumed) sessions.set(storyId, resumed);
  return resumed;
}

export function registerSession(session: Session): void {
  sessions.set(session.bible.storyId, session);
}
