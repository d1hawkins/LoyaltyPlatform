import { build } from 'esbuild';

// ESM bundle
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/index.mjs',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: false,
});

// CJS bundle
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'cjs',
  outfile: 'dist/index.js',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: false,
});

// UMD bundle (for CDN / script tag usage)
await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  globalName: 'LoyaltySDK',
  outfile: 'dist/loyalty-sdk.umd.js',
  platform: 'browser',
  target: 'es2020',
  sourcemap: true,
  minify: true,
});

console.log('esbuild: ESM + CJS + UMD bundles created');
