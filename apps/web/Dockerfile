# syntax=docker/dockerfile:1

# ---------- deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace=apps/web --include-workspace-root

# ---------- build ----------
FROM deps AS build
WORKDIR /repo
COPY apps/web ./apps/web

# The API base URL is inlined into the client bundle at build time, so it is a
# build arg rather than a runtime env var.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build --workspace=apps/web

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --create-home nextjs

# `output: 'standalone'` emits a server bundle with only the modules it needs.
COPY --from=build --chown=nextjs:nextjs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nextjs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nextjs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
