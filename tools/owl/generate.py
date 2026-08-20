"""Generate Frank's animation frames with Nano Banana Pro on Vertex AI.

Every call sends the same character reference (the squared-up master) plus
one pose instruction, so each frame is a variation on one drawing rather
than a fresh owl. That is the model's actual strength — character
consistency from a reference — and it is why this is a script rather than
one prompt asking for a sheet of poses: the API returns one image per call,
and frames sliced out of a contact sheet cannot be registered.

    python generate.py --pose blink-shut --variants 3
    python generate.py --all --variants 10
    python generate.py --boil idle --variants 10

Auth is Application Default Credentials — no API key. Output lands in
frames/<pose>/<pose>-NN.png.
"""

from __future__ import annotations

import argparse
import pathlib
import sys
import time

from google import genai
from google.genai import types

HERE = pathlib.Path(__file__).parent
PROJECT = 'storytime-cooper'
LOCATION = 'global'
MODEL = 'gemini-3-pro-image'

# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

STYLE = """Using the attached owl as the character reference, paint the same
owl in the same sumi-e ink style on the same off-white washi paper.

{pose}

Keep everything else identical to the reference: the same owl, the same body
shape and proportions, the same feather markings, the same brush handling and
the same ink tones. He is the same size in the frame as in the reference, seen
from the same distance and the same eye-level angle, sitting in the same
position on the paper.

Change only what the pose description above calls for. Plain background, no
border, no frame, no seal, no calligraphy, no text."""

# Ordered by how much each earns its place. The first three are the
# calibration set: they prove the prompt against the real master before
# anything is spent on the rest.
POSES: dict[str, str] = {
    'idle': (
        'Paint him exactly as he is in the reference, unchanged — the same '
        'hooded, half-asleep, entirely unimpressed expression, looking '
        'directly at the viewer.'
    ),
    'blink-half': (
        'His hooded eyes are drooping further closed than in the reference, '
        'about halfway shut, as though he is losing the battle to stay awake. '
        'Nothing else about him changes.'
    ),
    'blink-shut': (
        'His eyes are fully closed — each one a single simple curved stroke of '
        'the brush. His face is otherwise completely unchanged and entirely '
        'untroubled.'
    ),
    # "Open the beak" reliably produced a shut beak and rounder eyes instead:
    # the model treats the beak as part of the face it is preserving. Naming
    # the *gap* as the thing being painted is what actually works.
    'talk-open': (
        'His beak is parted. The lower half of the beak has dropped away from '
        'the upper half, leaving a small dark triangular gap of empty space '
        'between them, so that his mouth is clearly open. His eyes stay '
        'exactly as hooded and unimpressed as in the reference — he is saying '
        'something flat and brief and is not enjoying it.'
    ),
    'talk-wide': (
        'His beak is parted wide, caught mid-word. The lower half of the beak '
        'has dropped well away from the upper half, leaving an obvious dark '
        'open gap between them. His eyes remain just as hooded and '
        'unimpressed as before.'
    ),
    'think-tilt': (
        'His head is tilted a few degrees to one side, as though listening to '
        'something distant and not especially interesting. His feathers are a '
        'little more settled.'
    ),
    'approve': (
        'His head is dipped in the smallest possible nod of approval, barely a '
        'degree or two, and one eye is closed in something that is almost — but '
        'not quite — a wink. He would deny it.'
    ),
}

CALIBRATION = ['blink-shut', 'talk-open', 'approve']

# Boiling: the same drawing, painted again. Wanted variation is in the
# brushwork only — if the owl moves, the animation wobbles instead of boiling.
BOIL = """Using the attached owl as the reference, paint this exact same owl
in this exact same pose again, from scratch, with a freshly loaded brush.

It is the same drawing, painted a second time by the same hand: every stroke
lands in the same place and says the same thing, but no two brushstrokes are
ever truly identical. Let the dry-brush texture break differently, let the wet
washes bleed a slightly different shape, let the edges of each stroke wander by
a hair.

His pose, expression, size, position on the paper and proportions are exactly
as in the reference and must not change at all. Only the brushwork itself is
painted anew. Plain background, no border, no frame, no seal, no text."""


def client() -> genai.Client:
    return genai.Client(vertexai=True, project=PROJECT, location=LOCATION)


def reference_part(path: pathlib.Path) -> types.Part:
    return types.Part.from_bytes(data=path.read_bytes(), mime_type='image/png')


def generate(cli: genai.Client, prompt: str, ref: pathlib.Path, out: pathlib.Path) -> bool:
    """One image. Returns whether an image actually came back."""
    response = cli.models.generate_content(
        model=MODEL,
        contents=[reference_part(ref), types.Part.from_text(text=prompt)],
        config=types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE'],
            image_config=types.ImageConfig(aspect_ratio='1:1', image_size='2K'),
        ),
    )

    for candidate in response.candidates or []:
        for part in candidate.content.parts or []:
            if part.inline_data and part.inline_data.data:
                out.parent.mkdir(parents=True, exist_ok=True)
                out.write_bytes(part.inline_data.data)
                return True
            if part.text:
                # The model sometimes explains itself instead of drawing.
                print(f'    [text] {part.text.strip()[:160]}', file=sys.stderr)
    return False


def run(poses: list[str], variants: int, ref: pathlib.Path, boil: bool) -> None:
    cli = client()
    made = 0
    for pose in poses:
        prompt = BOIL if boil else STYLE.format(pose=POSES[pose])
        # Boiled variants are painted against the chosen frame for that pose,
        # not against the master — otherwise they drift back towards idle.
        source = HERE / 'frames' / pose / 'chosen.png' if boil else ref
        if boil and not source.exists():
            print(f'  {pose}: no chosen.png to boil from — skipping', file=sys.stderr)
            continue

        for i in range(1, variants + 1):
            name = f'{pose}-boil-{i:02d}.png' if boil else f'{pose}-{i:02d}.png'
            out = HERE / 'frames' / pose / name
            if out.exists():
                print(f'  {name}: already there')
                continue
            try:
                ok = generate(cli, prompt, source, out)
                print(f'  {name}: {"ok" if ok else "NO IMAGE RETURNED"}')
                made += ok
            except Exception as err:  # noqa: BLE001 — one bad frame must not stop the run
                print(f'  {name}: failed — {err}', file=sys.stderr)
            time.sleep(1)
    print(f'\n{made} image(s) generated.')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--pose', action='append', choices=sorted(POSES))
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--calibrate', action='store_true', help=f'just {", ".join(CALIBRATION)}')
    ap.add_argument('--boil', action='append', choices=sorted(POSES),
                    help='paint fresh brushwork of an already-chosen frame')
    ap.add_argument('--variants', type=int, default=2)
    ap.add_argument('--ref', default=str(HERE / 'master-square.png'))
    args = ap.parse_args()

    if args.boil:
        run(args.boil, args.variants, pathlib.Path(args.ref), boil=True)
        return

    poses = (
        sorted(POSES) if args.all
        else CALIBRATION if args.calibrate
        else args.pose or CALIBRATION
    )
    run(poses, args.variants, pathlib.Path(args.ref), boil=False)


if __name__ == '__main__':
    main()
