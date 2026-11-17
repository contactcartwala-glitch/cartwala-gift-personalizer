import {build} from 'esbuild';
import {resolve} from 'node:path';
import {builtinModules} from 'node:module';
export async function buildWorker({entry = 'workers/native-worker.mts', write = true, outfile = 'dist/native-worker.mjs'} = {}) {
  return build({entryPoints: [entry], outfile, bundle: true, minify: true,
    platform: 'neutral', mainFields: ['module', 'main'], conditions: ['workerd', 'worker', 'browser'],
    resolveExtensions: ['.mts','.ts','.tsx','.mjs','.js','.json'],
    format: 'esm', write, external: ['node:*', 'cloudflare:*'],
    banner: {js: 'import {createRequire as __createRequire} from "node:module";const require=__createRequire("/worker/native-worker.mjs");'},
    define: {'process.env.SHOPIFY_API_SECRET': 'requestEnvironment.SHOPIFY_API_SECRET'},
    inject: [resolve('workers/environment.mts')],
    plugins: [{name: 'cod-worker-adapters', setup(api) {
      api.onResolve({filter: /.*/}, ({path}) => builtinModules.includes(path) ? {path: path.startsWith('node:') ? path : `node:${path}`, external: true} : undefined);
      api.onResolve({filter: /(?:^|\/)db\.server$/}, () => ({path: resolve('workers/database.mts')}));
      api.onResolve({filter: /(?:^|\/)shopify\.server$/}, () => ({path: resolve('workers/shopify.mts')}));
      api.onResolve({filter: /(?:^|\/)native-cod-hooks\.server$/}, () => ({path: resolve('workers/hooks.mts')}));
      api.onResolve({filter: /(?:^|\/)cod-published-theme\.server$/}, () => ({path: resolve('workers/published-theme.mts')}));
      // pg-native is optional; Workers uses pg's portable JavaScript driver.
      api.onResolve({filter: /^pg-native$/}, () => ({path: 'pg-native', namespace: 'unsupported'}));
      api.onLoad({filter: /.*/, namespace: 'unsupported'}, () => ({contents: 'throw new Error("Native PostgreSQL driver unavailable");'}));
    }}],
  });
}
if (process.argv[1] === new URL(import.meta.url).pathname) await buildWorker();
