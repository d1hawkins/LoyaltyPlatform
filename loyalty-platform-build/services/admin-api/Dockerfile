# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS builder
WORKDIR /workspace
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile=false && pnpm -r build

FROM node:20-alpine AS runner
RUN addgroup -S app && adduser -S app -G app && apk add --no-cache curl
WORKDIR /app
COPY --from=builder /workspace /workspace
USER app
ENV NODE_ENV=production
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3000/health || exit 1
CMD ["node", "/workspace/services/admin-api/dist/index.js"]
