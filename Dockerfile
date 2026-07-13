# syntax=docker/dockerfile:1
#
# Multi-stage build for pool-maintenance.
#
# Builder stage: install dependencies and build with pnpm.
# Runtime stage: serve static assets with nginx.

# ============================================================== builder
FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json tsconfig.app.json vite.config.ts ./
COPY src/ src/
COPY index.html .

RUN pnpm build

# ============================================================= runtime
FROM nginx:alpine

RUN rm -f /etc/nginx/conf.d/default.conf

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
