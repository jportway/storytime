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

`.env` goes in the **repo root**, next to `.env.example` — not in `server/`.
It's gitignored, and the server loads it by absolute path so it works
whichever directory you run a command from.

Only `ANTHROPIC_API_KEY` is required. The `ELEVENLABS_*` keys are optional:
without them the owl falls back to the browser's built-in voice, which works
fine but is noticeably less charming.

`DAILY_TOKEN_BUDGET` (default 2M) is a safety net — the server refuses
Anthropic calls once a day's usage passes it, so a runaway loop can't quietly
spend real money while Cooper is playing unsupervised. A normal hour-long
session is roughly 40k tokens.

```bash
npm test                 # 61 tests, no API key needed
npm run replay           # run a scripted session headlessly (needs a key)
npm run typecheck
```

## Deploying it

The app is designed to cost nothing when nobody is playing. It runs as a
single **Cloud Run** service that scales to zero: you pay while a request is
in flight and not otherwise, which for an hour a week sits inside Google's
free tier. The only real running cost stays what it always was — Anthropic
tokens and ElevenLabs characters.

Everything that used to be a file becomes an object in one GCS bucket. Set
`STORAGE_BUCKET` and the server switches over; leave it unset and development
is exactly as it was, on the local filesystem, with no cloud account needed.

Region is `europe-north2` (Stockholm): 100% carbon-free energy at 3 gCO2eq/kWh
— the cleanest grid Google runs — and Tier 1 pricing, so it is also among the
cheapest. Latency from the UK is ~35ms rather than ~5ms from London, which is
invisible next to a multi-second Opus call. London is both dirtier (79% CFE)
and Tier 2, so it loses on every axis that matters here.

```bash
BUCKET=storytime-cooper-data
REGION=europe-north2   # Stockholm: 100% carbon-free energy, and Tier 1 pricing

# 1. One bucket for stories, the profile, the template and cached audio.
#    Uniform access: nothing in here is public, it holds a child's writing.
gcloud storage buckets create gs://$BUCKET --location=$REGION \
  --uniform-bucket-level-access

# 2. Secrets. Never bake these into the image.
for s in ANTHROPIC_API_KEY ELEVENLABS_API_KEY APP_PASSWORD ADMIN_PASSWORD; do
  gcloud secrets create $s --replication-policy=automatic
  printf '%s' "$VALUE" | gcloud secrets versions add $s --data-file=-
done

# 3. Move the audio already cached on this machine into the bucket, rather
#    than paying ElevenLabs to generate 76 clips a second time.
STORAGE_BUCKET=$BUCKET npm run seed-audio

# 4. Deploy. Cloud Build builds the Dockerfile remotely — no local Docker.
gcloud run deploy storytime --source . \
  --region=$REGION --allow-unauthenticated \
  --max-instances=1 --timeout=600 --memory=512Mi --cpu-boost \
  --set-env-vars=STORAGE_BUCKET=$BUCKET \
  --set-secrets=ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,\
ELEVENLABS_API_KEY=ELEVENLABS_API_KEY:latest,\
APP_PASSWORD=APP_PASSWORD:latest,\
ADMIN_PASSWORD=ADMIN_PASSWORD:latest
```

`--allow-unauthenticated` is about Google IAM, not about the app being open:
the app has its own password gate, because IAM sign-in is not something a
ten-year-old can do on an iPad. `--max-instances=1` is deliberate — with one
player it costs nothing and guarantees exactly one container exists, so the
in-memory session cache stays coherent and two writes can never race.

**Two passwords.** `APP_PASSWORD` opens the game; `ADMIN_PASSWORD` opens
`/admin`. They are separate on purpose: Cooper has the first one by
definition, and the tool that rewrites her story world should not be one URL
away from her. The server **refuses to start** if `STORAGE_BUCKET` is set and
either is missing — an internet-facing URL with a metered API key behind it
is a standing bill, and a warning in a log nobody reads is not protection.

Sessions are signed cookies valid for 90 days, keyed off the password itself,
so changing a password signs everyone out.

## How it works

```
Cooper types  ──▶  owl (Haiku)          ──▶  spoken help + board
     │             + local spell check
     ▼
  normalise  ──▶  storyteller (Opus 5)  ──▶  streamed panels + a fork
     ▲                  │
     │                  ├──▶  archivist (Haiku)  ──▶  story bible
     │                  │                                (in parallel)
     └── stage note ◀───┴──▶  director (Haiku)   ──▶  the plan
```

**Model roles.** The storyteller (`claude-opus-5`, streaming) writes the
prose. Everything else is `claude-haiku-4-5` and runs off the critical path.
The archivist extracts state changes while she reads. The director decides
where the story is heading (below). A titler names the book, once, when she
finishes it. The owl coach handles writing help. A seeder will replace the
fixed cast later.

The archivist and the director run *in parallel* on the same beat. The
archivist already gates the response — the writing box stays disabled until
it returns — so a sequential director call would have added its whole latency
to the time she cannot type.

**Two memories.** The storyteller's memory is the conversation itself — the
system prompt is static and history only appends, so prompt caching works
naturally. The *bible* is a separate structured record maintained by the
archivist, used for credit tracking, save/resume, the director's view of the
world, and (later) character consistency in generated art. The bible is deliberately
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
   The single exception is the landing beat, where the story has to close —
   and even there the storyteller's job is to make sure the fork she answers
   at beat nine *is* the climax, not to write the ending for her.
4. **The owl never blocks, never shames, never nags.** Corrections are offered,
   never applied automatically. Send is always live. Once she's mastered a
   word the owl stops mentioning it.
5. **Her spelling mistakes never appear in the story.** Input is normalised
   before the storyteller sees it — only high-confidence fixes, so we never
   silently change what she meant. Her raw text is kept for the profile.
6. **Redirect, don't refuse.** If a direction goes out of bounds the story
   bends in-fiction — a door slams, someone interrupts. She never sees a
   refusal or an error dialog.

## Where a story is heading

Everything above is reactive: she types, the storyteller writes the smallest
beat that makes her idea real, and it stops on a cliffhanger. That is the
right instinct, but on its own it means a story never arrives anywhere and
never ends.

A **director** runs after each beat and keeps a private plan. Cooper never
sees any of it, and the storyteller sees at most two lines.

**The plan is data, not prose.** The obvious design — hold a written plan and
revise it each turn — fails, and it fails quietly. A model asked to reconcile
a plan with what just happened rewrites the plan to describe what just
happened, so within about three turns the plan is a summary. Here the arc's
`destination` and `phases` are frozen when it is dealt and have **no field in
the director's output schema**. It cannot rewrite the destination because it
is given nowhere to say so. `plan.ts` owns the phase index, the card
bookkeeping and the pacing; the model answers only what needs a reader.

**It aims the fork, not the beat.** The fork is already the steering wheel —
it just used to steer at random. A fork is an *offer*: she can walk straight
past it, and the prompt has always insisted she must be able to invent a
third option nobody thought of. The other lever is the one small complication
the storyteller was already allowed, so the director never gets a bigger
share of her story — it chooses what the existing share is about.

**When she is driving, nothing happens to her story that she didn't ask
for.** The director reports whether her direction carried a real intention.
When it did, the complication is downgraded to a fork — aiming survives, the
intrusion doesn't. If a note and her direction ever pull different ways, the
storyteller is told plainly that hers wins and the note is discarded.

**Pressure prefers her own material.** Everything in the bible is tagged
`createdBy`. Bringing back the giant worm *she* invented four beats ago
steers the story and hands her back something of hers; it is the only lever
here that doesn't spend a little of her authorship to buy control. Authored
trouble cards, edited in `/admin`, are the fallback.

**Stories end, but they are not hurried to it.** Around sixteen beats is
normal and twenty is fine; ten turned out to be an anecdote rather than a
story. The pace comes from the director judging when a phase has done its
work, with a per-phase ceiling as a backstop against idling. That ceiling is
derived from the arc rather than fixed, because arcs are authored in `/admin`
and don't all have the same number of phases — otherwise the phase count
would silently decide how long a story is. The last beat resolves instead of
forking (`[LANDING]`) and she is asked whether that was the end. If she says yes the book is named — at the
end, because that is the first moment there is anything to name — and goes on
the shelf. If she says keep going, a different arc is dealt and the story
carries on with no visible seam, so one session can hold several complete
little stories.

Arcs and trouble live in the template and are edited in `/admin`. **A
template with no arcs deals no plan, and a story with no plan behaves exactly
as it did before any of this existed.**

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
shared/     types, the fixed Cooperworld cast and arcs, the spelling engine
server/     express + SSE, the Claude roles, prompts as markdown
web/        React SPA — the shelf, panels, writing box, owl
data/       her stories and writing profile (gitignored)
```

In the cloud, `data/` and the audio cache become one GCS bucket; see
`server/src/storage.ts`, which is the only file that knows the difference.

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
