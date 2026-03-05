# ── Build stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./

# Copy workspace packages
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Install all dependencies
RUN npm ci --ignore-scripts

# Copy source code
COPY packages/db/ packages/db/
COPY packages/shared/ packages/shared/
COPY apps/api/ apps/api/

# Build packages in dependency order
RUN npx turbo build --filter=@xarra/api

# ── Production stage ────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache tini chromium

# Puppeteer needs to use the system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy workspace structure for production deps
COPY package.json package-lock.json ./
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN npm ci --omit=dev --ignore-scripts

# Copy built output
COPY --from=builder /app/packages/db/dist packages/db/dist
COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/apps/api/dist apps/api/dist

# Non-root user
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001
USER appuser

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/server.js"]
