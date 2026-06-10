#!/usr/bin/env node
// Generates service scaffold files for the loyalty platform.
// Run: node scripts/gen-service-scaffolds.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const services = [
  { name: 'member-service', port: 3001, kind: 'http' },
  { name: 'loyalty-engine', port: 3002, kind: 'http' },
  { name: 'offer-service', port: 3003, kind: 'http' },
  { name: 'notification-service', port: 3004, kind: 'http' },
  { name: 'analytics-service', port: 3005, kind: 'http' },
  { name: 'admin-api', port: 3006, kind: 'http' },
  { name: 'tier-eval-worker', port: 0, kind: 'worker' },
  { name: 'webhook-worker', port: 0, kind: 'worker' },
];

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

const tsconfig = `{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
`;

const jestCfg = `module.exports = require('../../jest.config.base.js');\n`;

const dockerignore = `node_modules
dist
coverage
.env
.env.*
*.log
tests
`;

const gitignore = `node_modules\ndist\ncoverage\n*.log\n.env\n`;

function pkgJsonHttp(name) {
  return JSON.stringify(
    {
      name: `@loyalty/${name}`,
      version: '0.1.0',
      private: true,
      main: 'dist/index.js',
      scripts: {
        build: 'tsc -p tsconfig.json',
        typecheck: 'tsc -p tsconfig.json --noEmit',
        start: 'node dist/index.js',
        dev: 'ts-node src/index.ts',
        test: 'jest',
        lint: 'eslint src --ext .ts',
      },
      dependencies: {
        '@loyalty/shared-db-client': 'workspace:*',
        '@loyalty/shared-errors': 'workspace:*',
        '@loyalty/shared-events': 'workspace:*',
        '@loyalty/shared-logger': 'workspace:*',
        '@loyalty/shared-middleware': 'workspace:*',
        '@loyalty/shared-types': 'workspace:*',
        express: '4.19.2',
        zod: '3.23.8',
      },
      devDependencies: {
        '@types/express': '4.17.21',
        '@types/jest': '29.5.12',
        '@types/node': '20.12.12',
        '@types/supertest': '6.0.2',
        jest: '29.7.0',
        supertest: '7.0.0',
        'ts-jest': '29.2.5',
        'ts-node': '10.9.2',
        typescript: '5.5.4',
      },
    },
    null,
    2,
  ) + '\n';
}

function pkgJsonWorker(name) {
  return JSON.stringify(
    {
      name: `@loyalty/${name}`,
      version: '0.1.0',
      private: true,
      main: 'dist/index.js',
      scripts: {
        build: 'tsc -p tsconfig.json',
        typecheck: 'tsc -p tsconfig.json --noEmit',
        start: 'node dist/index.js',
        dev: 'ts-node src/index.ts',
        test: 'jest --passWithNoTests',
        lint: 'eslint src --ext .ts',
      },
      dependencies: {
        '@loyalty/shared-db-client': 'workspace:*',
        '@loyalty/shared-errors': 'workspace:*',
        '@loyalty/shared-events': 'workspace:*',
        '@loyalty/shared-logger': 'workspace:*',
        '@loyalty/shared-types': 'workspace:*',
        zod: '3.23.8',
      },
      devDependencies: {
        '@types/jest': '29.5.12',
        '@types/node': '20.12.12',
        jest: '29.7.0',
        'ts-jest': '29.2.5',
        'ts-node': '10.9.2',
        typescript: '5.5.4',
      },
    },
    null,
    2,
  ) + '\n';
}

const configTs = `import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().optional(),
  KEY_VAULT_URI: z.string().optional(),
  CONTROL_PLANE_SQL_CONNSTR: z.string().optional(),
  REDIS_URL: z.string().optional(),
  SERVICE_BUS_CONNECTION_STRING: z.string().optional(),
  APPLICATIONINSIGHTS_CONNECTION_STRING: z.string().optional(),
  SKIP_AUTH: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid config', parsed.error.flatten());
    throw new Error('Invalid configuration');
  }
  return parsed.data;
}
`;

function indexHttp(name) {
  return `import express, { Express } from 'express';
import { createLogger, Logger } from '@loyalty/shared-logger';
import {
  correlationId,
  requestLogger,
  errorHandler,
} from '@loyalty/shared-middleware';
import { loadConfig } from './config';

const SERVICE_NAME = '${name}';
const VERSION = '0.1.0';

export function createApp(): { app: Express; logger: Logger } {
  const logger = createLogger(SERVICE_NAME);
  const app: Express = express();
  app.use(express.json());
  app.use(correlationId());
  app.use(requestLogger(logger));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: SERVICE_NAME, version: VERSION });
  });
  app.get('/ready', (_req, res) => {
    res.json({ ready: true });
  });

  app.use(errorHandler(logger));
  return { app, logger };
}

if (require.main === module) {
  const config = loadConfig();
  const { app, logger } = createApp();
  app.listen(config.PORT, () => {
    logger.info({ port: config.PORT, service: SERVICE_NAME }, 'service.started');
  });
}
`;
}

function indexWorker(name) {
  return `import { createLogger } from '@loyalty/shared-logger';
import { loadConfig } from './config';

const SERVICE_NAME = '${name}';
const VERSION = '0.1.0';

export function startWorker() {
  const logger = createLogger(SERVICE_NAME);
  const config = loadConfig();
  logger.info({ service: SERVICE_NAME, version: VERSION, env: config.NODE_ENV }, 'worker.started');

  const interval = setInterval(() => {
    logger.info({ service: SERVICE_NAME }, 'worker.heartbeat');
  }, 30_000);

  const shutdown = () => {
    clearInterval(interval);
    logger.info({ service: SERVICE_NAME }, 'worker.shutdown');
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return { stop: shutdown };
}

if (require.main === module) {
  startWorker();
}
`;
}

const healthTest = `import request from 'supertest';
import { createApp } from '../src/index';

describe('health endpoints', () => {
  const { app } = createApp();

  it('GET /health returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBeDefined();
    expect(res.body.version).toBeDefined();
  });

  it('GET /ready returns ready true', async () => {
    const res = await request(app).get('/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
  });
});
`;

function dockerfileHttp() {
  return `# syntax=docker/dockerfile:1.6
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD curl -fsS http://localhost:3000/health || exit 1
CMD ["node", "/workspace/services/SERVICE_NAME/dist/index.js"]
`;
}

function dockerfileWorker() {
  return `# syntax=docker/dockerfile:1.6
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
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \\
  CMD pgrep -f "node.*SERVICE_NAME" > /dev/null || exit 1
CMD ["node", "/workspace/services/SERVICE_NAME/dist/index.js"]
`;
}

for (const svc of services) {
  const dir = path.join(root, 'services', svc.name);
  const pkg = svc.kind === 'http' ? pkgJsonHttp(svc.name) : pkgJsonWorker(svc.name);
  write(path.join(dir, 'package.json'), pkg);
  write(path.join(dir, 'tsconfig.json'), tsconfig);
  write(path.join(dir, 'jest.config.js'), jestCfg);
  write(path.join(dir, '.gitignore'), gitignore);
  write(path.join(dir, '.dockerignore'), dockerignore);
  write(path.join(dir, 'src/config.ts'), configTs);
  write(
    path.join(dir, 'src/index.ts'),
    svc.kind === 'http' ? indexHttp(svc.name) : indexWorker(svc.name),
  );
  write(
    path.join(dir, 'Dockerfile'),
    (svc.kind === 'http' ? dockerfileHttp() : dockerfileWorker()).replaceAll(
      'SERVICE_NAME',
      svc.name,
    ),
  );
  write(
    path.join(dir, 'README.md'),
    `# @loyalty/${svc.name}\n\n${svc.kind === 'http' ? `Port: ${svc.port}. Health: GET /health, GET /ready.` : 'Background worker. Heartbeat every 30s.'}\n`,
  );
  if (svc.kind === 'http') {
    write(path.join(dir, 'tests/health.test.ts'), healthTest);
  }
}

// eslint-disable-next-line no-console
console.log('Scaffolds generated for', services.length, 'services');
