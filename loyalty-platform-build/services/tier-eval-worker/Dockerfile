# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS builder
WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm -r build

FROM node:20-alpine AS runner
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=builder /workspace /workspace
USER app
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD pgrep -f "node.*tier-eval-worker" > /dev/null || exit 1
CMD ["node", "/workspace/services/tier-eval-worker/dist/index.js"]
