import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../node_modules/firebase/package.json', import.meta.url)));

await build({
  entryPoints: [new URL('./firebase-entry.js', import.meta.url).pathname],
  outfile: new URL('../app/vendor/firebase.js', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
  banner: { js: `// Firebase JS SDK ${version}, bundled by scripts/build-firebase.js. Do not edit.` },
});
console.log(`Built app/vendor/firebase.js from Firebase ${version}`);
