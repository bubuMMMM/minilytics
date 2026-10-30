// Minify the tracking script in dist/ after `vite build` (public/ is copied verbatim). Source stays readable in public/js.
import { readFileSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { transform } from 'esbuild';

const file = new URL('../dist/js/script.js', import.meta.url);
const src = readFileSync(file, 'utf8');
const { code } = await transform(src, { minify: true, target: 'es2017', legalComments: 'none' });
writeFileSync(file, code);
const kb = (n) => (n / 1024).toFixed(1) + ' KiB';
console.log(`tracker: ${kb(src.length)} → ${kb(code.length)} (gzip ${kb(gzipSync(code).length)}, brotli ${kb(brotliCompressSync(code).length)}; before: gzip ${kb(gzipSync(src).length)}, brotli ${kb(brotliCompressSync(src).length)})`);
