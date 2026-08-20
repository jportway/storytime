# Frank: sumi-e art direction and Nano Banana prompts

Prompts for generating Frank — the owl — as a finished sumi-e design plus
animation frames, to replace the placeholder SVG in
`web/src/components/Owl.tsx`.

---

## Should this be one prompt or a script?

**A script, in two stages.** Three constraints make the single-prompt version
a false economy:

1. **The API returns one image per response.** The only way to get "all the
   frames from one prompt" is to ask for a contact sheet inside a single
   image.
2. **Contact-sheet frames don't register.** Frames sliced out of one image
   won't sit on a common pivot, so the owl shifts a few pixels between frames
   and the animation jitters. Fixing that by hand is worse than generating
   separately. You also can't regenerate a single bad frame without redoing
   the whole sheet.
3. **There is no documented seed parameter.** You cannot re-roll the same
   image twice, so you will generate more frames than you need and pick. That
   is fine in a loop and tedious by hand.

Meanwhile the model's headline strength is character consistency *from
reference images* — Nano Banana Pro accepts up to 5 character references and
3 dedicated style references. That maps exactly onto the pipeline below.

### The pipeline

| Stage | How | Why |
| --- | --- | --- |
| **1. Master design** | By hand, conversationally in AI Studio | This is a taste loop. Iterate until Frank is *right*, then freeze one PNG as the canonical reference. Don't automate judgement. |
| **2. Frames** | Scripted, one API call per frame | Each call = master PNG + style refs + one pose instruction. Same model, aspect ratio and resolution every time. |
| **3. Registration** | Scripted, no AI | Key white to alpha, auto-crop to content, align on a declared pivot, pad to a uniform canvas. This is where jitter actually gets fixed, deterministically. |

Stage 3 is the part people skip and then wonder why the animation wobbles. It
is ordinary image processing and it is worth more than any amount of prompt
tuning.

### Model choice

`gemini-3-pro-image` (Nano Banana Pro) for both stages. It is the only one
with dedicated style-reference slots, which is exactly what you have —
supplied sumi-e reference images. `gemini-3.1-flash-image` is cheaper and
would do, but treats all 14 inputs as one undifferentiated pile.

Generate at **2K, 1:1**. The owl renders at 86×86 in a 260px column, so
square is native and 2K leaves room to downsample cleanly (downsampling is
what will keep the ink edges crisp).

---

## What the app actually needs

From `Owl.tsx` and `styles.css`, Frank currently has exactly one animation:
`.owl-thinking` bobs while he's consulting. Everything else is a static face.
The states that exist in the code and deserve distinct art:

- **idle** — the default, most of the time
- **thinking / checkingSend** — he's off consulting the model
- **praise** — rare, and *grudging*; see the character note below
- **nudge / gate** — he's asking her about a word
- **spelling out** — he reads letters aloud one at a time

### A character note that matters for the animation

Frank is "no-nonsense, deeply unimpressed, wants a quiet life." The prompts
below are written to hold that line, and the animation should too:

**Sumi-e suits limited animation, and so does Frank.** Hold poses, change
sharply, don't interpolate smoothly. A brush painting is a decision made once
and not corrected — tweening between two ink drawings fights the medium. Two
or three frames held on twos will read better than twelve smooth ones, and
will look far more like the reference material.

His praise animation in particular should be *small*. The whole point of the
owl rewrite was that constant praise is annoying and Frank doesn't gush. A
single slow blink and the barest nod is more in character — and more
affecting when it's rare — than anything enthusiastic.

---

## Stage 1 — the master design prompt

Attach your sumi-e reference images as **style references**. Paste this as the
prompt.

```text
A sumi-e ink painting of a single owl character, painted on off-white washi
paper.

The owl is stout and round-bodied, sitting upright and quite still. His eyes
are heavily hooded — half-closed, permanently on the edge of sleep — but they
are focused, and they are looking directly at the viewer. He misses nothing
and is impressed by nothing. His feathers are rumpled and slightly untidy,
as though he has just been woken and resents it. He is a small, dry,
world-weary character who would very much like everyone to leave him alone,
and who is fonder of them than he lets on.

Paint him the way the reference images are painted. Load the brush once and
place each stroke a single time, without correction or reinforcement. Build
his body mass from a few broad wet strokes that bleed softly into the paper.
Suggest the texture of his feathers with a dry, split brush dragged across
the grain, letting the paper show through. Reserve the darkest black for
three or four decisive accents only: the pupils, the beak, the tips of the
ear tufts. Let the rest fall away into pale grey wash.

Leave most of the paper empty. The negative space around him is part of the
composition, and he sits off-centre within it. Imply the edges of his form
rather than drawing a continuous outline around him — let strokes break, and
let his silhouette dissolve into the paper at the bottom.

Full body, seen straight on at eye level, at a respectful distance so that
there is generous empty paper on all four sides. Monochrome sumi ink: black
through several greys to the bare cream of the paper, and no other colour.
Plain undecorated background with no border, no frame, no seal, no
calligraphy and no text.
```

### Notes on that prompt

- **It describes a scene, not a keyword list.** Google's prompting guide is
  explicit that narrative description outperforms comma-separated tags, and
  it's noticeably true for style work.
- **No red seal, no calligraphy.** Traditional sumi-e usually carries a red
  hanko, and it is very tempting. Leave it out: it would sit in a different
  spot in every frame and strobe horribly during animation. Add one by hand
  to a static title image later if you want it.
- **"Imply the edges rather than outlining"** is doing real work. Without it
  the model drifts toward cartoon ink-outline-and-fill, which is the single
  most likely way this goes wrong.
- **Everything about personality is described as behaviour, not adjectives.**
  "Would like everyone to leave him alone" produces a better pose than
  "grumpy", which tends to produce a scowling cartoon.

Iterate on this conversationally until he's right. Then **save one PNG as
`frank-master.png`** — that file is the reference every frame is generated
against, and re-rolling it later invalidates every frame you've made.

Worth also generating a **turnaround sheet** once (front, 3/4, side) as a
second reference. It measurably helps consistency on any frame involving a
head turn.

---

## Stage 2 — the per-frame prompt template

Every frame is one API call with the **same** inputs: `frank-master.png` as a
character reference, your sumi-e images as style references, and this prompt
with `{POSE}` substituted.

```text
Using the attached owl as the character reference, paint the same owl in the
same sumi-e ink style on the same off-white washi paper.

{POSE}

Keep everything else identical to the reference: the same owl, the same body
shape and proportions, the same feather markings, the same brush handling and
the same ink tones. He is the same size in the frame as in the reference,
seen from the same distance and the same eye-level angle, standing in the
same position on the paper.

Change only what the pose description above calls for. Plain background, no
border, no frame, no seal, no calligraphy, no text.
```

The rigid "keep everything else identical / change only what the pose calls
for" clause is the most important part. Without it the model helpfully
redesigns him a little on every call.

### The frames

Ordered by how much they matter. The first three get you a usable owl; the
rest are polish.

| # | Frame | `{POSE}` |
| --- | --- | --- |
| 1 | **idle** | *(the master image itself — no call needed)* |
| 2 | **blink-half** | `His hooded eyes are drooping further closed than in the reference, about halfway shut, as though he is losing the battle to stay awake.` |
| 3 | **blink-shut** | `His eyes are fully closed, two simple curved strokes. His face is otherwise completely unchanged and entirely untroubled.` |
| 4 | **think-up** | `He is lifted very slightly, feathers a little more settled, head tilted a few degrees to one side as though listening to something distant and not especially interesting.` |
| 5 | **think-down** | `He has settled back down, slightly more compact and hunched than the reference, head level again.` |
| 6 | **talk-open** | `His beak is open, a small sharp wedge of dark ink. His expression has not changed at all — he is saying something flat and brief.` |
| 7 | **talk-wide** | `His beak is open wider, mid-word. His eyes remain just as hooded and unimpressed as before.` |
| 8 | **look-down** | `His eyes are turned downward, as though reading something on the ground in front of him. His head is tipped very slightly forward.` |
| 9 | **approve** | `His head is dipped in the smallest possible nod of approval, barely a degree or two, and one eye is closed in something that is almost — but not quite — a wink. He would deny it.` |
| 10 | **gesture-wing** | `One wing is lifted slightly away from his body and extended forward, a single broad ink stroke, indicating something in front of him.` |

**Frames 2–3** give you a blink; hold idle for 3–5 seconds, blink over two
frames, return. That alone makes a static drawing feel alive and is by far
the best value on this list.

**Frames 4–5** replace the existing CSS `bob` with a two-frame hold that
actually looks drawn rather than transformed.

**Frames 6–7** cut against idle while `useSpeech` is talking. Two mouth
positions is plenty; this is a woodcut, not a Pixar rig.

### Generation strategy

Generate **4–6 variants of every frame** and pick by eye. There's no seed, so
variance is unavoidable — lean into it and select rather than fighting for a
deterministic result you can't have. It's cheap.

---

## Stage 3 — registration

Non-negotiable if the animation is to look intentional. For every accepted
frame, in this order:

1. **Key to alpha.** Ink on near-white keys out trivially: alpha from
   luminance, so paper → transparent and ink → opaque, keeping the soft
   grey wash edges intact. Do *not* threshold; you'll destroy the dry-brush
   texture that makes it sumi-e.
2. **Auto-crop** to the bounding box of non-transparent pixels.
3. **Align on a declared pivot.** Pick one — the centre of the beak is the
   most stable landmark across all ten frames — and translate every frame so
   that point lands identically.
4. **Pad to a uniform canvas** and export at 2× the display size (172px for
   an 86px render) for retina.

Step 3 is the one that turns ten separate paintings into one character.

---

## Things worth knowing before you start

- **Outputs carry a SynthID watermark.** Invisible, and irrelevant for a
  family project, but it is there.
- **Palette clash.** The app is currently warm browns and cream
  (`--owl: #8b6b4a`). A monochrome ink owl will read as a different design
  language. Either warm the ink slightly toward sepia, or take the
  opportunity to move the whole palette toward paper-and-ink — the second is
  probably the better-looking result.
- **`OwlFace` is inline SVG.** Swapping to raster frames means replacing that
  component and its `.owl-thinking` CSS animation with something
  frame-driven. Contained change, one component.
- **Freeze the master early.** Every frame is generated against it, so
  re-rolling `frank-master.png` after you've made frames means making them
  all again.
