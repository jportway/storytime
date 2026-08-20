# Storytime on Cloud Run.
#
# Two stages so the runtime image carries no compiler, no dev dependencies and
# no TypeScript source. The build stage needs the whole workspace because
# `tsc -b` walks the project references (shared -> server) and vite bundles the
# web app against shared's source.

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM node:20-slim AS builder

WORKDIR /app

# Copy every workspace manifest before the sources so `npm ci` is cached and
# only re-runs when a dependency actually changes.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/

RUN npm ci

COPY . .

# Builds shared -> server (including the copy-assets step that puts prompts/
# and admin/ into server/dist, which tsc does not do) then bundles the SPA.
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:20-slim AS runtime

# Production mode matters beyond convention here: loadPrompt() deliberately
# re-reads prompt files from disk on every call when NODE_ENV is not
# production, so that prompt edits land without a restart during development.
ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/

# Production dependencies only. The workspace symlink for @storytime/shared is
# created here; the compiled output it points at arrives in the next step.
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/shared/dist shared/dist
COPY --from=builder /app/server/dist server/dist
COPY --from=builder /app/web/dist web/dist

# Cloud Run injects PORT and config.port already reads it. This is only
# documentation for anyone running the image by hand.
EXPOSE 8080

CMD ["node", "server/dist/index.js"]
