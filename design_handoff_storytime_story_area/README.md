# Handoff: Storytime — maximised story area, floating composer, owl overlay, and the scroll rule

## Overview

UI design for Storytime, the single-page story-writing game (repo `jportway/storytime`, branch `main`, web client in `web/src`). The design covers the reading/writing screen: a full-page scrolling story, a floating single-line composer, an owl coach that overlays the story rather than reserving space, and a new scroll behaviour that fixes new text scrolling past before it's read.

Three things are being changed relative to the built UI:

1. **The story area is the whole page.** The current `.app` grid reserves a permanent `auto 1fr auto` band for the composer and a 260px owl column. In this design the composer is a floating pill over the paper and the owl's help is an overlay card, so nothing permanent is taken from the reading area.
2. **The owl's help overlays the story.** Board/gate cards are absolutely positioned over the story text with a shadow and a tail pointing at the owl. Story text is not displaced or reflowed when the owl speaks.
3. **New text no longer scrolls past unread.** Replaces the unconditional `scrollIntoView({block:'end'})` in `App.tsx`. See "The scroll rule" below — this is the most important part of this handoff.

## About the design files

The files in this bundle are **design references written as HTML**. They are prototypes showing intended look and behaviour, not production code to copy. The task is to recreate them in the existing `web/` React SPA using its established patterns — `App.tsx`, `components/Story.tsx`, `components/WritingBox.tsx`, `components/Owl.tsx`, and `styles.css` (plain CSS classes, no CSS-in-JS, no utility framework). The design's inline styles are an artefact of the prototyping environment; port the values into `styles.css` as classes alongside the existing ones.

The existing CSS custom properties in `:root` should be extended, not replaced. Where a value below differs slightly from an existing token (e.g. accent `#a8552a` vs the current `--accent: #b5651d`), the new value is intentional but not load-bearing — keeping the existing token is acceptable if preferred.

## Fidelity

**High-fidelity.** Final colours, typography, spacing and interaction states. Recreate pixel-accurately at iPad-landscape size, then let it be fluid. All measurements below are as designed at 1180 × 820 CSS px.

## Target device

Primary target is **tablet, landscape** (designed at 1180 × 820). The layout is fluid: the story column is `max-width: 700px` centred, the composer spans the page with 40px side gutters. It should degrade to portrait tablet and to desktop without a separate design; phone width is out of scope for this handoff.

---

## The scroll rule

This is a behaviour change, not just a layout change, and it is the reason the design exists.

**Problem in the current build.** `App.tsx` runs, on every change to `beats.length`, `livePanels.length` and `fork`:

```ts
bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
```

Because the storyteller streams panel by panel, the pane is repeatedly re-pinned to the bottom while the beat is still arriving. The start of the new beat is pushed off the top of the viewport before she has read it, so she has to scroll up to find where she'd got to and then back down again.

**The rule.**

1. When a beat begins (the first `panel` event of a new beat, i.e. the transition from no live panels to one), scroll **once** so that the **top of the new content** sits just under the header — not the bottom of the pane.
   - The scroll target is the "new from here" divider element that is inserted at the start of each new beat (see below). Scroll so its top aligns with the top of the scroll pane's content box.
   - `behavior: 'smooth'`. This is the only programmatic scroll in the beat's lifetime.
2. **Then stop.** Do not scroll again for the rest of the beat, however many panels arrive. Streamed text grows downward into the empty space below, which she is already looking at. Nothing she has not yet read ever moves.
3. If the beat outgrows the visible pane, show a **"More below ↓"** pill and let her scroll manually. It appears only while `scrollHeight - scrollTop - clientHeight > ~24px`, and disappears once she reaches the bottom. Tapping it scrolls down by one viewport (not to the end).
4. Do not re-pin when the `fork` arrives, and do not re-pin when the owl speaks. The owl's card is an overlay and must not move the story.
5. Respect `prefers-reduced-motion`: the one scroll becomes instant rather than smooth.

**Implementation notes.**

- Replace the `useEffect` on `[beats.length, livePanels.length, fork]` with one that fires only on the beat boundary. A `useRef` holding the current beat number, compared against the incoming one, is enough — the existing `beat.n` is a natural key.
- The scroll target ref goes on the divider element, not on a bottom sentinel. Delete `bottomRef` or repurpose it.
- Prefer `scrollTop` arithmetic against the scroll container over `scrollIntoView` — `scrollIntoView` on a nested scroller can also scroll ancestors, and the target alignment here is "top of pane", which `block: 'start'` approximates but does not guarantee once padding is involved.
- Edge case worth deciding: **a short beat**. With this rule a beat shorter than the pane sits at the top with empty paper below it. That is the honest result and the design accepts it (see 3d, which shows the same band mid-stream). The alternative — keeping the previous line in view above the divider — was not chosen. Do not "fix" this by falling back to bottom-pinning.

### The "new from here" divider

Inserted at the start of every new beat, above her own idea block. It marks the join so she can see where she'd got to.

- Layout: flex row, `align-items: center`, `gap: 12px`, `padding: 6px 0 18px`.
- Label: text `New from here`, Lexend 600, 10px, `letter-spacing: .16em`, `text-transform: uppercase`, colour `#a8552a`, `white-space: nowrap`.
- Rule: `flex: 1`, `height: 1px`, background `rgba(168,85,42,.35)`.
- It persists in the scrollback (it is part of the beat), so scrolling up shows previous joins too. If that reads as noisy in practice, fading all but the most recent to ~40% opacity is an acceptable refinement.

---

## Screens / views

Four states are specified. All share the same shell; only the composer and overlay differ.

### Shell (common to all four)

- Root: `1180 × 820`, background `#f7f2e8`, `position: relative`, `overflow: hidden`, `font-family: Lexend`, colour `#241d14`.
- **Header**: flex row, `justify-content: space-between`, `align-items: center`, `padding: 16px 40px 6px`. Height ≈ 48px.
  - Left: story title, Newsreader 400, 20px, `line-height: 1`, `letter-spacing: .02em`. Content: `Grimwood`.
  - Right: Lexend 500, 11px, `letter-spacing: .14em`, uppercase, `rgba(36,29,20,.35)`. Content: `Chapter one · Two days`.
- **Story pane** (`<main>`): `position: absolute; top: 48px; left: 0; right: 0; bottom: 0; overflow-y: auto` (the prototype uses `overflow: hidden` because it is a static mock — the real one scrolls). Padding `0 40px 108px`; the 108px bottom padding is what lets text scroll *under* the floating composer rather than being cut off by it.
  - Story column: `max-width: 700px; margin: 0 auto`. Newsreader, 22px, `line-height: 1.62`, `text-wrap: pretty`.
  - **Alignment**: top-aligned (no `justify-content`). This is required by the scroll rule — the pane must be a normal top-aligned scroller.
- **Bottom fade**: `position: absolute; left/right/bottom: 0; height: 150px; pointer-events: none;` `background: linear-gradient(to bottom, rgba(247,242,232,0), #f7f2e8 58%)`. Purely a legibility scrim so text passing under the composer doesn't collide with it.
- **Composer row**: `position: absolute; left: 40px; right: 40px; bottom: 24px;` flex row, `align-items: center`, `gap: 16px`.

### Story text styling

- Narration paragraph: Newsreader 400, 22px/1.62, `margin: 0 0 16px`, colour `#241d14`.
- Dialogue paragraph: same, prefixed by a speaker span — Lexend 600, 11px, `letter-spacing: .13em`, uppercase, colour `#a8552a`, `margin-right: 10px`, `vertical-align: .18em`. Speech is wrapped in typographic quotes `“ ”`.
- SFX: Newsreader **italic** 400, 38px, `line-height: 1`, colour `#a8552a`, `margin: 0 0 20px`. (The built UI uses a rotated bold sans; this design uses large italic serif instead. Either is acceptable — the italic serif is quieter and was chosen for this direction.)
- **Her idea block** (`.your-idea`, unchanged in intent from the build): flex row, `gap: 14px`, `margin: 0 0 24px`, `padding: 2px 0 2px 16px`, `border-left: 3px solid #3f7d58`. Label `Your idea` — Lexend 600, 10px, `letter-spacing: .16em`, uppercase, `#3f7d58`, `margin-bottom: 6px`. Body — Newsreader *italic* 400, 19px/1.55, colour `#2f5c42`. No background fill, no card, no radius.

### 3a — Reading (composer collapsed)

Default state. Nothing typed, nothing being asked of her.

- Owl: 70px wide, `flex: none`, `margin-bottom: -6px` so it sits slightly over the composer pill's top edge. `mood: calm` (eyes closed).
- Composer pill: `flex: 1`, flex row, `align-items: center`, `gap: 14px`, background `#fffdf8`, `border: 2px solid #d9cdb4`, `border-radius: 999px`, `padding: 12px 12px 12px 26px`, `box-shadow: 0 4px 18px rgba(90,72,44,.1)`.
  - Placeholder: `flex: 1`, Lexend 400, 19px/1.4, colour `rgba(36,29,20,.35)`. Content: `What happens next?` — or the fork text when the storyteller supplied one.
  - Send button: Lexend 600, 17px, background `#a8552a`, colour `#fff`, `border-radius: 999px`, `padding: 15px 30px`, `flex: none`. Height ≈ 47px (above the 44px minimum).
- Tapping the pill expands it to the multi-line field of 3b. Tapping the owl asks for help (existing `onAskForHelp`).

### 3b — Owl helping, overlaying the story

She is typing; the owl has something to say.

- Owl: 96px wide, `mood: awake` (open eyes), `animation: bob 1.1s ease-in-out infinite` while speaking (`@keyframes bob { 50% { transform: translateY(-6px) } }` — already in `styles.css`).
- Composer expands: same pill, `border-radius: 22px`, `border-color: #a8552a`, `padding: 14px 20px`.
  - Text: Lexend 400, 20px/1.6.
  - Spelling marks: `border-bottom: 2px dotted #d9a441; padding-bottom: 2px`. Reversal marks use `#7ba7c9` instead. Never red, never a squiggle, never a count. (Matches `.spell-mark` in the build.)
  - Caret: 2px × 22px block, `#a8552a`.
  - Second row: `margin-top: 12px`, flex, `justify-content: space-between`. Left hint — Lexend 400, 13px, `rgba(36,29,20,.45)`, content `The dotted words are just worth a look`. Right: send button, `padding: 14px 28px`.
- **Overlay card** (the owl's board): `position: absolute`, anchored above the owl — in the mock `left: 118px; bottom: 196px`. Width 300px, background `#fffdf8`, `border: 2px solid #241d14`, `border-radius: 18px`, `padding: 16px 14px`, `text-align: center`, `box-shadow: 0 10px 30px rgba(60,46,26,.16)`.
  - Tail: 14 × 14px square, same background, `border-right` + `border-bottom` 2px `#241d14`, `transform: rotate(45deg)`, positioned `left: 34px; bottom: -9px` so it points down at the owl's head.
  - Word: Lexend 700, 44px, `letter-spacing: .1em`, `margin-bottom: 12px`. Tricky letters `#a8552a`; the letter being spoken right now additionally gets `display: inline-block; transform: translateY(-8px) scale(1.2)` with a 150ms ease transition — this is the existing `.board-letter.lit` behaviour driven by `spellOut`'s `onLetter` callback.
  - Explanation: Lexend 400, 15px/1.45, `rgba(36,29,20,.7)`, `margin: 0 0 14px`. Emphasised letters in `<strong>` `#a8552a`.
  - Buttons row: flex, `gap: 8px`, centred. Primary `Fix it for me` — Lexend 600, 14px, `#a8552a` on `#fff`, `border-radius: 10px`, `padding: 12px 16px`. Secondary `I'll do it` — Lexend 400, 14px, transparent, `rgba(36,29,20,.55)`, underlined.
  - The card must **not** reflow the story. It is a sibling of `<main>`, not a child, and the story keeps its own scroll position while the card is open.
- The card is bounded by the story column's left edge in the mock; positioning it above the owl and clear of the composer is what matters, not the exact offsets.

### 3c — New beat has landed, autoscroll has stopped

The state immediately after the one scroll. Demonstrates the rule.

- Story pane is top-aligned and the beat overflows it (in the mock, content exceeds the pane by ~74px, so the last line is genuinely cut off at the bottom edge).
- Divider at the top of the pane, then her idea block, then the beat.
- **"More below ↓" pill**: `position: absolute; left: 50%; bottom: 118px; transform: translateX(-50%)`. Background `#fffdf8`, `border: 1.5px solid #d9cdb4`, `border-radius: 999px`, `padding: 9px 18px`, Lexend 500, 13px, `rgba(36,29,20,.6)`, `box-shadow: 0 3px 12px rgba(90,72,44,.12)`. Content: `More below ↓`.
- Composer is collapsed (3a's pill) with send **disabled**: background `#e2d6bd`, colour `rgba(36,29,20,.4)`, `cursor: default`.

### 3d — Streaming

- Composer pill: background `#f3ecdd`, `border: 2px solid #e2d6bd`. Left text Newsreader *italic* 400, 19px/1.4, `rgba(36,29,20,.42)`, content `The story is writing…`. Button label `Writing…`, disabled styling as above.
- Owl at 70px, `mood: calm`, `opacity: .55` — deliberately quiet while the story writes, matching the existing `enabled: !writing` in `useOwl`.
- Streaming caret at the end of the last paragraph: 10 × 22px block, `#a8552a`, `opacity: .5`, `margin-left: 4px`.
- Empty paper below the streamed text is expected and correct — that is the space the rest of the beat will grow into.

---

## The owl

`Owl.dc.html` in this bundle is a **placeholder illustration** — a brush-and-ink pastiche drawn as SVG paths, matching the reference style (`owl.png`, also bundled) but not the reference art. It replaces the cartoon `OwlFace()` currently in `components/Owl.tsx`.

Do not treat it as final art. It should be swapped for a real illustration (single friendly owl, brush-and-ink, warm paper ground). Implement it as an `<Owl mood disc />` component with the same three moods so the swap is one file.

- `viewBox="0 0 120 134"`. Body, eyes and beak use `fill="currentColor"` so the owl takes its colour from the surrounding text colour; the facial disc, wing edge and chest marks use a `disc` colour that must match the background it sits on (`#f7f2e8` on the paper).
- Moods: `calm` (tapered closed-eye flicks — the default and the resting state), `awake` (open eyes — while speaking or asking), `happy` (upward flicks — praise). In the mocks the happy owl is also tinted `#3f7d58`.
- Sizes used: 70px wide collapsed, 96px while helping, 210px on the start screen. Aspect ratio ≈ 1 : 1.117.
- The owl is a button (`onAskForHelp`), so its hit area must be ≥ 44px even at 70px wide — pad the button rather than scaling the art.

---

## Other states carried over from earlier rounds

These were designed in the previous round in the reserved-column layout (turn 2 in the design file) and still apply; port their content into the 3b overlay card rather than a column.

- **Send-gate question.** Card shows the word as typed (Lexend 700, 40px, `letter-spacing: .12em`), then `Is that supposed to say “bed”?` (Lexend 500, 15px/1.45, `#a8552a`), then `Yes, that's it` / `No`. Card border `#241d14`, or `#a8552a` to distinguish a gate from a plain board. **Send stays live** in this state — the gate asks, it does not block.
- **b/d reversal mnemonic.** The existing `BedHands()` SVG from `components/Owl.tsx` unchanged, at 190 × 86, above the question. Caption `Make a bed with your hands — b comes first, d comes second.`
- **Praise.** Speech-bubble card instead of a board: background `#e2eee7`, `border: 2px solid #3f7d58`, `border-radius: 16px`, Lexend 500, 15px/1.45, colour `#2f5c42`, tail as in 3b but in the green. Owl `mood: happy`, tinted `#3f7d58`. Copy: `You got “bed” on your own. I'll stop mentioning it.`
- **Start screen.** Centred column: owl at 210px with the branch, title `Storytime` in Newsreader 400/62px, subhead `You're going to write a comic book.` (Lexend 400, 21px/1.5, `rgba(36,29,20,.6)`), primary button `Start a Grimwood story` (Lexend 600, 20px, `#a8552a` on `#fff`, `border-radius: 999px`, `padding: 18px 40px`), footnote `The owl will read along and help with the hard words.` (Lexend 400, 14px, `rgba(36,29,20,.38)`).

---

## State management

No new server state. Everything here is client-side and additive to `App.tsx`:

| State | Type | Purpose |
| --- | --- | --- |
| `composerExpanded` | `boolean` | Collapsed pill (3a) vs multi-line field (3b). Expand on focus/tap or when a draft is non-empty; collapse on blur with an empty draft and after a successful send. |
| `lastScrolledBeat` | `useRef<number \| null>` | The beat number the one-shot scroll has already fired for. Guards rule 1. |
| `showMoreBelow` | `boolean` | Derived from a scroll listener on the story pane: `scrollHeight - scrollTop - clientHeight > 24`. Throttle with `requestAnimationFrame`. |
| `dividerRef` | `useRef<HTMLDivElement>` | Scroll target — the current beat's "new from here" divider. |

Existing state (`beats`, `livePanels`, `fork`, `draft`, `gate`, `checkingSend`, `owl.response`) is unchanged. The owl overlay renders from `owl.response` / `gate` exactly as today; only its positioning changes from column to overlay.

## Interactions & behaviour

- **Tap owl** → `onAskForHelp` (unchanged). Owl switches to `awake` and bobs while speaking.
- **Tap composer** → expands to multi-line. Enter sends, Shift+Enter newlines (unchanged from `WritingBox`).
- **Send** → always enabled when the draft is non-empty, including while a gate question is open. Disabled only while `writing || checkingSend`.
- **Beat boundary** → the one scroll (see the scroll rule). 
- **Overlay card appear/dismiss** → existing `pop` keyframe (`opacity 0, scale .94` → in, 300ms ease). Cards never animate the story.
- **`prefers-reduced-motion`** → the existing global rule in `styles.css` disables animations; extend it to make the one scroll instant.

## Design tokens

| Token | Value | Use |
| --- | --- | --- |
| paper | `#f7f2e8` | Page background. Slightly warmer than the build's `--paper: #faf6ef`. |
| panel | `#fffdf8` | Composer pill, overlay cards. |
| panel-muted | `#f3ecdd` | Disabled composer (3d). |
| ink | `#241d14` | Body text, card borders. |
| ink-60 | `rgba(36,29,20,.6)` | Secondary copy. |
| ink-45 | `rgba(36,29,20,.45)` | Hints. |
| ink-35 | `rgba(36,29,20,.35)` | Placeholder, header meta. |
| accent | `#a8552a` | Speaker names, SFX, primary button, caret, divider label. |
| accent-soft | `#e2d6bd` | Disabled button fill. |
| border | `#d9cdb4` | Composer border. |
| mark | `#d9a441` | Spelling underline (dotted). |
| mark-reversal | `#7ba7c9` | b/d reversal underline (dotted). |
| hers | `#3f7d58` | Her own words, praise, happy owl. |
| hers-text | `#2f5c42` | Text on her-words / praise. |
| hers-bg | `#e2eee7` | Praise bubble fill. |
| radius-pill | `999px` | Composer, buttons, pills. |
| radius-card | `18px` | Overlay card. |
| radius-field | `22px` | Expanded composer. |
| radius-button | `10px` | Card buttons. |
| shadow-pill | `0 4px 18px rgba(90,72,44,.1)` | Composer. |
| shadow-card | `0 10px 30px rgba(60,46,26,.16)` | Overlay card. |
| shadow-chip | `0 3px 12px rgba(90,72,44,.12)` | "More below" pill. |
| gutter | `40px` | Page side padding. |
| pane-bottom | `108px` | Story pane bottom padding (clears the composer). |

### Typography

Two families only.

- **Newsreader** (Google Fonts, variable, weights 300–600 + italics) — all story prose, the story title, her idea block, SFX. Chosen because the story should read like a book, not like an interface.
- **Lexend** (Google Fonts, 300–800) — every piece of interface text: speaker labels, buttons, hints, the spelling board. Already the build's body font, and kept deliberately for readability.

| Role | Font | Size / line-height | Weight | Tracking |
| --- | --- | --- | --- | --- |
| Story prose | Newsreader | 22 / 1.62 | 400 | — |
| Her idea | Newsreader italic | 19 / 1.55 | 400 | — |
| SFX | Newsreader italic | 38 / 1 | 400 | — |
| Story title | Newsreader | 20 / 1 | 400 | .02em |
| Start title | Newsreader | 62 / 1.05 | 400 | -.01em |
| Speaker label | Lexend | 11 | 600 | .13em, uppercase |
| Divider label | Lexend | 10 | 600 | .16em, uppercase |
| Header meta | Lexend | 11 | 500 | .14em, uppercase |
| Composer text | Lexend | 20 / 1.6 | 400 | — |
| Composer placeholder | Lexend | 19 / 1.4 | 400 | — |
| Board word | Lexend | 44 | 700 | .1em |
| Board explanation | Lexend | 15 / 1.45 | 400 | — |
| Primary button | Lexend | 17 | 600 | — |
| Card button | Lexend | 14 | 600 / 400 | — |
| Hint | Lexend | 13 / 1.4 | 400 | — |

Minimum text size anywhere she reads: 19px. Minimum tap target: 44px.

## Assets

- `owl.png` — the user's style reference for the owl (brush-and-ink, two owlets; the product needs a **single** owl). Provided for whoever draws the final art. Not for shipping.
- `Owl.dc.html` — the placeholder owl SVG, three moods. Lift the path data if useful; expect to replace it.
- No icons. The only glyph used is the `↓` in "More below ↓".
- Fonts from Google Fonts: `Newsreader` (ital, 300–600) and `Lexend` (300–800).

## Files in this bundle

| File | What it is |
| --- | --- |
| `Storytime Mockups.html` | All rounds of the design. **Turn 3 at the top is the approved direction** (options 3a–3d). Turn 2 below it has the six coaching states in the older reserved-column layout; turn 1 at the bottom has the two rejected visual directions — kept for context only. |
| `Owl.dc.html` | The placeholder owl component. |
| `support.js` | Runtime for the two files above, so they open in a browser offline. Not part of the design. |
| `owl.png` | The owl style reference. |
| `screens/*.png` | Rendered screenshots of each state at 2×, for reference while implementing. |

### Screenshots

| File | State |
| --- | --- |
| `screens/3a-reading.png` | 3a — reading, composer collapsed |
| `screens/3b-owl-helping.png` | 3b — owl helping, board overlaying the story |
| `screens/3c-new-beat-landed.png` | 3c — new beat landed, autoscroll stopped, "More below" |
| `screens/3d-streaming.png` | 3d — streaming into empty space |
| `screens/2a-start-screen.png` | Start screen |
| `screens/2d-send-gate-bd-mnemonic.png` | Send-gate question with the b/d hands mnemonic |
| `screens/2f-praise.png` | Praise after she fixed a word herself |

Note: the 2× screenshots are captured from the same HTML and may render shadows and gradients slightly differently from the live page. Where they disagree, the HTML and the measurements in this README are authoritative.

Open `Storytime Mockups.html` in a browser and read top to bottom; each option carries its id (`3a`, `3b`…) as a visible badge.

## Repo files this design changes

| Design | Repo file |
| --- | --- |
| Scroll rule, composer collapse state | `web/src/App.tsx` |
| Composer pill / expanded field, spelling marks | `web/src/components/WritingBox.tsx` |
| Owl art, overlay card, board, gate, praise, mnemonic | `web/src/components/Owl.tsx` |
| Story prose, speaker labels, SFX, her-idea block, divider | `web/src/components/Story.tsx` |
| All tokens and classes | `web/src/styles.css` |
