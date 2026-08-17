# Storytime

A writing game for Cooper.

She writes a comic book. The AI writes small chunks of story between her
decisions, always stopping at a fork, and a friendly owl helps her with
spelling out loud while she types.

The point is **not** to have the AI write a story. The point is for Cooper to
finish a session thinking "I wrote that." Every design decision below follows
from that.

## Running it

```bash
cp .env.example .env     # add your ANTHROPIC_API_KEY
npm install
npm run dev              # server on :8787, web on :5173
```

The `ELEVENLABS_*` keys are optional — without them the owl falls back to the
browser's built-in voice, which works fine but is noticeably less charming.

```bash
npm test                 # 58 tests, no API key needed
npm run replay           # run a scripted session headlessly (needs a key)
npm run typecheck
```

## How it works

```
Cooper types  ──▶  owl (Haiku)          ──▶  spoken help + board
     │             + local spell check
     ▼
  normalise  ──▶  storyteller (Opus 5)  ──▶  streamed panels + a fork
                        │
                        └──▶  archivist (Haiku)  ──▶  story bible
```

**Four model roles.** The storyteller (`claude-opus-5`, streaming) writes the
prose. The archivist (`claude-haiku-4-5`) extracts state changes in the
background while she reads, so its latency is free. The owl coach
(`claude-haiku-4-5`) handles writing help. A seeder will replace the fixed
cast later.

**Two memories.** The storyteller's memory is the conversation itself — the
system prompt is static and history only appends, so prompt caching works
naturally. The *bible* is a separate structured record maintained by the
archivist, used for the Who's Who page, credit tracking, save/resume, and
(later) character consistency in generated art. The bible is deliberately
**not** re-injected each turn; that would change the cached prefix and throw
the cache away on every beat. Every ~8 beats it re-grounds via a
mid-conversation `system` message, which preserves the cache.

## The design rules

These are load-bearing. If something is ambiguous, resolve it against these.

1. **She writes as much as possible.** Beats are 80–150 words and always end
   on a fork. A long beat is a failure even if it's well written.
2. **Her words survive.** The storyteller reuses her distinctive phrasing
   verbatim, so she can find her own words in the story.
3. **The AI never resolves what she set up.** It sets up; it doesn't pay off.
4. **The owl never blocks, never shames, never nags.** Corrections are offered,
   never applied automatically. Send is always live. Once she's mastered a
   word the owl stops mentioning it.
5. **Her spelling mistakes never appear in the story.** Input is normalised
   before the storyteller sees it — only high-confidence fixes, so we never
   silently change what she meant. Her raw text is kept for the profile.
6. **Redirect, don't refuse.** If a direction goes out of bounds the story
   bends in-fiction — a door slams, someone interrupts. She never sees a
   refusal or an error dialog.

## The spelling engine

Layer order is deliberate and load-bearing:

1. **Reversals first.** Cooper reverses `b`/`d`. This is not a spelling
   problem — she knows the word, her hand wrote the mirror image. A
   dictionary fed `deb` proposes `debt`/`den` and buries the diagnosis;
   swapping `b`↔`d` yields `bed`, and the owl can name the actual trick and
   show the hands mnemonic.
2. **Curated child-misspelling table.** ~250 entries, exact and instant.
   Grows from her profile as she accepts corrections.
3. **Phonetic fallback.** Metaphone-ish key plus edit distance, for novel
   sound-alike spellings. Marked low confidence and never auto-applied.

Story names are never flagged. Underlining a character a child just invented
teaches her that inventing things is an error.

## Layout

```
shared/     types, the fixed Grimwood cast, the spelling engine
server/     express + SSE, the three Claude roles, prompts as markdown
web/        React SPA — panels, writing box, owl, Who's Who
data/       her stories and writing profile (gitignored)
```

**Prompts live in `server/src/prompts/*.md`, not in TypeScript.** Nearly all
the iteration here is prompt tuning, and it shouldn't require touching code.
They hot-reload in dev.

## Current state

Phase 1 is text-only, and the starting cast is **fixed** — Ted, Nancy, Willow
and the rest of Grimwood, from Nadia Shireen's books. That stands in for a
character-generation step so the story loop could be built and tuned first;
nothing in the codebase assumes Grimwood exists, and swapping in a seeder is
a contained change. Note those are someone else's characters — fine for a
private family toy, not something to publish.

Not built yet: the seeder, story export, and Phase 2's comic panels
(Nano Banana). The `appearance` fields on every character, place and thing are
already maintained from beat one, because character consistency in generated
art depends on having them, and back-filling them across a finished story is
far more work than keeping them current.
