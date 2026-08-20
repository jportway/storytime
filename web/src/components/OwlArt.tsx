import { useEffect, useRef, useState } from 'react';

/**
 * Frank, animated frame by frame.
 *
 * Each pose is a sprite sheet of several complete drawings of that pose —
 * the same brush strokes painted again rather than the same image reused.
 * At runtime we cycle through them in a shuffled order, which is the
 * traditional "boiling line" effect: the ink appears to breathe because it
 * was genuinely drawn more than once. That is why nothing here is tinted or
 * transformed with CSS. A recoloured or scaled brush drawing reads as a
 * recoloured or scaled brush drawing, and the whole point of the medium is
 * that it looks hand-made.
 *
 * The frames are registered to a common origin before shipping (see
 * tools/owl/register.py), so only the ink moves — never the owl.
 */

export type OwlMood =
  | 'idle'
  | 'blink-half'
  | 'blink-shut'
  | 'talk-open'
  | 'talk-wide'
  | 'think-tilt'
  | 'approve';

interface Manifest {
  size: number;
  poses: Record<string, number>;
}

let manifestPromise: Promise<Manifest | null> | null = null;

function loadManifest(): Promise<Manifest | null> {
  manifestPromise ??= fetch('/owl/frames.json')
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
    .catch(() => null);
  return manifestPromise;
}

/** A shuffled order, so the boil never settles into a visible loop. */
function shuffled(n: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

/**
 * What the owl is doing, as opposed to which drawing is on screen.
 *
 * Kept separate because a pose is a single drawing and a performance is a
 * sequence of them: resting means idle punctuated by blinks, talking means
 * the beak actually moving. Callers say what is happening; this decides what
 * he does about it.
 */
export type OwlState = 'resting' | 'thinking' | 'talking' | 'pleased';

const BLINK: OwlMood[] = ['blink-half', 'blink-shut', 'blink-half'];

/** One frame of a blink. Fast — a blink that lingers looks like a nap. */
const BLINK_MS = 110;

export function useOwlPerformance(state: OwlState): OwlMood {
  const [pose, setPose] = useState<OwlMood>('idle');

  useEffect(() => {
    let cancelled = false;
    const timers: number[] = [];

    const base: OwlMood =
      state === 'thinking' ? 'think-tilt'
      : state === 'pleased' ? 'approve'
      : 'idle';

    if (state === 'talking') {
      // Two mouth positions is plenty. This is a woodcut, not a lip-sync rig.
      setPose('talk-open');
      let open = true;
      const id = window.setInterval(() => {
        open = !open;
        setPose(open ? 'talk-open' : 'talk-wide');
      }, 190);
      timers.push(id);
      return () => timers.forEach(window.clearInterval);
    }

    setPose(base);

    // Pleased is a held beat — he is not going to blink through his one
    // moment of visible approval.
    if (state === 'pleased') return;

    const blink = () => {
      if (cancelled) return;
      BLINK.forEach((m, i) => {
        timers.push(window.setTimeout(() => !cancelled && setPose(m), i * BLINK_MS));
      });
      timers.push(
        window.setTimeout(() => !cancelled && setPose(base), BLINK.length * BLINK_MS),
      );
      // Irregular, because a metronomic blink is worse than none.
      timers.push(window.setTimeout(blink, 2600 + Math.random() * 4200));
    };
    timers.push(window.setTimeout(blink, 1200 + Math.random() * 2600));

    return () => {
      cancelled = true;
      timers.forEach((t) => {
        window.clearTimeout(t);
        window.clearInterval(t);
      });
    };
  }, [state]);

  return pose;
}

interface OwlArtProps {
  mood: OwlMood;
  /** ms per drawing. Slow — this is a held brush drawing, not a cartoon. */
  boilMs?: number;
}

export function OwlArt({ mood, boilMs = 420 }: OwlArtProps) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [frame, setFrame] = useState(0);
  const order = useRef<number[]>([]);
  const cursor = useRef(0);

  useEffect(() => {
    let live = true;
    void loadManifest().then((m) => {
      if (live) setManifest(m);
    });
    return () => {
      live = false;
    };
  }, []);

  const count = manifest?.poses[mood] ?? 0;

  // Reshuffle whenever the pose changes, so a mood switch never lands on the
  // same drawing it left on.
  useEffect(() => {
    if (count < 1) return;
    order.current = shuffled(count);
    cursor.current = 0;
    setFrame(order.current[0] ?? 0);
  }, [mood, count]);

  useEffect(() => {
    if (count < 2) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const id = window.setInterval(() => {
      cursor.current += 1;
      if (cursor.current >= order.current.length) {
        // Reshuffle each pass rather than repeating the same cycle.
        order.current = shuffled(count);
        cursor.current = 0;
      }
      setFrame(order.current[cursor.current] ?? 0);
    }, boilMs);
    return () => window.clearInterval(id);
  }, [count, boilMs, mood]);

  // Before the manifest lands there is nothing to draw. An empty box is
  // better than a flash of the wrong owl.
  if (!manifest || count < 1) return <span className="owl-art" aria-hidden="true" />;

  return (
    <span
      className="owl-art"
      aria-hidden="true"
      style={{
        backgroundImage: `url(/owl/${mood}.webp)`,
        backgroundSize: `${count * 100}% 100%`,
        backgroundPosition: `${count > 1 ? (frame / (count - 1)) * 100 : 0}% 0`,
      }}
    />
  );
}
