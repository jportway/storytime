import type { StoryBible } from '@storytime/shared';
import type { Credit } from '../api.js';

/**
 * The Who's Who, and — more importantly — the "Your Story" panel.
 *
 * The credit numbers are the point of the whole project: she should be able
 * to see, in plain numbers, how much of this is hers.
 */
export function WhoIsWho({
  bible,
  credit,
  onClose,
}: {
  bible: StoryBible;
  credit: Credit | null;
  onClose: () => void;
}) {
  const alive = bible.characters.filter((c) => c.status !== 'dead');
  const gone = bible.characters.filter((c) => c.status === 'dead');

  return (
    <div className="drawer">
      <div className="drawer-head">
        <h2>Who's who</h2>
        <button className="drawer-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      {credit && (
        <section className="credit">
          <h3>Your story</h3>
          <p className="credit-big">
            <strong>{credit.wordsWritten}</strong> words written by you
          </p>
          <p>
            <strong>{credit.beatsDirected}</strong> turns you decided
          </p>
          {credit.charactersInvented.length > 0 && (
            <p>
              You invented: <strong>{credit.charactersInvented.join(', ')}</strong>
            </p>
          )}
          {credit.placesInvented.length > 0 && (
            <p>
              Places you made up:{' '}
              <strong>{credit.placesInvented.join(', ')}</strong>
            </p>
          )}
          {credit.thingsInvented.length > 0 && (
            <p>
              Things you made up:{' '}
              <strong>{credit.thingsInvented.join(', ')}</strong>
            </p>
          )}
        </section>
      )}

      <section>
        <h3>Characters</h3>
        {alive.map((c) => (
          <div className="who-card" key={c.id}>
            <h4>
              {c.name}
              {c.createdBy === 'cooper' && <span className="yours">yours!</span>}
            </h4>
            <p className="who-traits">{c.traits.join(' · ')}</p>
            <p className="who-wants">Wants: {c.wants}</p>
            {c.status !== 'fine' && (
              <p className="who-status">
                {c.status}
                {c.statusNote ? ` — ${c.statusNote}` : ''}
              </p>
            )}
          </div>
        ))}
      </section>

      {gone.length > 0 && (
        <section>
          <h3>Gone</h3>
          {gone.map((c) => (
            <div className="who-card who-gone" key={c.id}>
              <h4>{c.name}</h4>
              <p>{c.statusNote ?? 'No longer with us.'}</p>
            </div>
          ))}
        </section>
      )}

      {bible.threads.filter((t) => t.status === 'open').length > 0 && (
        <section>
          <h3>Still to find out</h3>
          <ul className="threads">
            {bible.threads
              .filter((t) => t.status === 'open')
              .map((t) => (
                <li key={t.id}>{t.question}</li>
              ))}
          </ul>
        </section>
      )}
    </div>
  );
}
