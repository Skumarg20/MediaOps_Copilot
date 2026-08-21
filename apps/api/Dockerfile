
# ---------- deps ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --workspace=apps/api --include-workspace-root

# ---------- build ----------
FROM deps AS build
WORKDIR /repo
COPY apps/api ./apps/api
RUN npm run build --workspace=apps/api


RUN mkdir -p apps/api/dist/modules/platform/data \
 && cp apps/api/src/modules/platform/data/*.json apps/api/dist/modules/platform/data/ \
 && cp -r apps/api/src/modules/platform/data/mockDocs apps/api/dist/modules/platform/data/mockDocs \
 && cp apps/api/src/modules/classifier/model.json apps/api/dist/modules/classifier/model.json

# ---------- prune ----------
FROM deps AS prod-deps
WORKDIR /repo
RUN npm prune --omit=dev --workspace=apps/api --include-workspace-root

RUN mkdir -p apps/api/node_modules

# ---------- runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production \
    PROJECT_ENV=production \
    PORT=8080

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/package.json
COPY apps/api/knexfile.js ./apps/api/knexfile.js
COPY apps/api/migrations ./apps/api/migrations
COPY package.json ./package.json

COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN useradd --system --uid 10001 --create-home copilot \
 && chown -R copilot:copilot /repo
USER copilot

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]
