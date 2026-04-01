// Custom esbuild config for Contentful functions.
// The functions run in a Node.js environment on Contentful's backend,
// so we use platform: 'node' and mark all built-in Node modules as external.
// This avoids the browser-polyfill errors caused by the default build config.

const { builtinModules } = require('node:module');

/** @type {import('esbuild').BuildOptions} */
module.exports = {
  entryPoints: { 'functions/index': './functions/index.ts' },
  bundle: true,
  outdir: 'build',
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  minify: false,
  external: [
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
    'contentful-management',
  ],
  logLevel: 'info',
};
