# ── Build stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json turbo.json tsconfig.base.json ./

# Copy workspace packages
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/

# Install all dependencies
RUN npm ci --ignore-scripts

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/db/ packages/db/
COPY apps/web/ apps/web/

# Build
RUN npx turbo build --filter=@xarra/web

# ── Serve stage ─────────────────────────────────────────────────────────
FROM nginx:alpine AS runner

# Copy custom nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built SPA
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
