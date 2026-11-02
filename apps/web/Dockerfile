# Build from repository root: docker build -f apps/web/Dockerfile .
FROM node:26-slim AS build
WORKDIR /app

# Cache reproducible npm workspace installation separately from application code.
COPY package.json package-lock.json ./
COPY apps/terminal/package.json ./apps/terminal/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci

COPY . .
RUN npm run web:build
RUN npm prune --omit=dev

FROM node:26-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# runuser is explicit, not assumed to exist in the slim base image.
RUN apt-get update && apt-get install -y --no-install-recommends util-linux && rm -rf /var/lib/apt/lists/*

# Runtime TS imports shared scheduler and note types from the monorepo root.
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/web/package.json ./apps/web/package.json
COPY --from=build --chown=node:node /app/apps/web/server ./apps/web/server
COPY --from=build --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=node:node /app/fsrs ./fsrs
COPY --from=build --chown=node:node /app/services ./services
COPY --from=build --chown=node:node /app/models ./models
COPY --from=build --chown=node:node /app/constants.ts ./constants.ts

# The image-layer directory is not the Fly volume: its ownership is fixed at startup.
RUN mkdir -p /data && chown node:node /data
COPY --chmod=755 apps/web/docker-entrypoint.sh /usr/local/bin/vutadex-entrypoint
EXPOSE 3001
ENTRYPOINT ["/usr/local/bin/vutadex-entrypoint"]
CMD ["node", "--experimental-strip-types", "apps/web/server/index.ts"]
