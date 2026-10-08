# Copp IT production image (used by Railway, works on any Docker host).

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Toolchain in case a native module (better-sqlite3, sharp) has no prebuilt binary for this platform.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY public ./public
# Database and photos live on the volume Railway mounts (RAILWAY_VOLUME_MOUNT_PATH, e.g. /data).
EXPOSE 3002
CMD ["node", "dist/server.js"]
