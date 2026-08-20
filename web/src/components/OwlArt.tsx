/**
 * The owl, in three moods.
 *
 * A brush-and-ink placeholder, ported from the design handoff. It is not
 * final art — see docs/owl-art-direction.md for the sumi-e replacement it is
 * standing in for. Kept in its own file so that swap is one file.
 *
 * Body, eyes and beak are `currentColor` so the owl takes its colour from
 * whatever it sits in; the facial disc and chest marks use `disc`, which
 * must match the background behind it — they are cut-outs, not white paint.
 */

export type OwlMood = 'calm' | 'awake' | 'happy';

interface OwlArtProps {
  mood: OwlMood;
  /** The branch he perches on. Used on the start screen only. */
  branch?: boolean;
  /** Must match the background this sits on. */
  disc?: string;
}

const BODY =
  'M57,4 C82,2 104,21 107,49 C110,73 105,95 95,108 C88,118 74,124 58,122 C35,120 14,103 11,75 C8,48 16,25 33,12 C40,7 48,5 57,4 Z';
const WING =
  'M91,40 C101,58 100,86 87,104 C95,84 95,58 87,42 Z';
const FACE =
  'M26,44 C26,21 43,15 60,32 C77,15 94,22 93,45 C92,71 77,89 60,89 C42,89 26,70 26,44 Z';
const BEAK = 'M60,49 C63,56 65,62 60,73 C55,62 57,56 60,49 Z';
const BRANCH =
  'M-6,132 C28,120 62,126 96,116 C110,112 118,109 124,105 C118,113 108,118 96,122 C62,132 28,127 -4,136 Z';

const CHEST = [
  'M41,90 C43,94 43,100 40,104 C38,99 38,94 41,90 Z',
  'M50,94 C52,98 52,104 49,108 C47,103 47,98 50,94 Z',
  'M60,95 C62,99 62,105 59,109 C57,104 57,99 60,95 Z',
  'M70,94 C72,98 71,104 68,108 C67,103 67,98 70,94 Z',
  'M79,90 C81,94 80,100 77,104 C76,99 76,94 79,90 Z',
];

/** Closed, awake and pleased. The eyes are the whole performance. */
const EYES: Record<OwlMood, string[]> = {
  calm: [
    'M33,48 C39,37 50,34 57,42 C49,39 41,42 33,48 Z',
    'M64,41 C71,33 81,36 86,47 C79,41 71,39 64,41 Z',
  ],
  awake: [
    'M44,35 C51,35 55,41 54,47 C53,53 48,56 43,54 C38,52 36,45 39,39 C40,36 42,35 44,35 Z',
    'M76,35 C82,35 85,41 84,47 C83,53 78,56 73,54 C68,52 66,45 69,39 C71,36 73,35 76,35 Z',
  ],
  happy: [
    'M33,47 C38,35 51,33 57,44 C49,38 40,40 33,47 Z',
    'M63,44 C69,33 82,35 87,47 C80,40 71,38 63,44 Z',
  ],
};

export function OwlArt({ mood, branch = false, disc = '#f7f2e8' }: OwlArtProps) {
  return (
    <svg
      viewBox="0 0 120 134"
      width="100%"
      height="100%"
      style={{ display: 'block', overflow: 'visible' }}
      aria-hidden="true"
    >
      <path d={BODY} fill="currentColor" />
      <path d={WING} fill={disc} />
      <path d={FACE} fill={disc} />
      {EYES[mood].map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
      <path d={BEAK} fill="currentColor" />
      <g fill={disc}>
        {CHEST.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {branch && <path d={BRANCH} fill="currentColor" />}
    </svg>
  );
}
