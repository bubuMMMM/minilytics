/** Build-time prerender of `/`, `/signup` and `/demo` so crawlers get real HTML. */
import { build } from 'vite';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const templatePath = resolve(root, 'dist/app.html');
copyFileSync(resolve(root, 'dist/index.html'), templatePath);

await build({
  configFile: resolve(root, 'vite.config.ts'),
  build: {
    ssr: 'ssr.tsx',
    outDir: '../../dist-ssr',
    emptyOutDir: true,
    sourcemap: false,
    minify: false,
  },
  logLevel: 'warn',
});

const { render } = await import(pathToFileURL(resolve(root, 'dist-ssr/ssr.js')).href);
const template = readFileSync(templatePath, 'utf8');

function replaceAttr(html, attr, value) {
  const re = new RegExp(`(<meta[^>]+${attr}="[^"]+"[^>]*content=")[^"]*(")`, 'g');
  const re2 = new RegExp(`(<meta[^>]+content=")[^"]*("[^>]+${attr}="[^"]+")`, 'g');
  let out = html.replace(re, `$1${value}$2`);
  out = out.replace(re2, `$1${value}$2`);
  return out;
}

function inject(tmpl, page) {
  let out = tmpl.replace('<div id="root"></div>', `<div id="root">${page.html}</div>`);
  out = out.replace(/<title>[^<]*<\/title>/, `<title>${page.title}</title>`);
  out = out.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${page.canonical}$2`);
  out = out.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${page.canonical}$2`);
  out = replaceAttr(out, 'property="og:title"', page.ogTitle);
  out = replaceAttr(out, 'name="twitter:title"', page.ogTitle);
  if (page.path !== '/') {
    out = replaceAttr(out, 'name="description"', page.description);
    out = replaceAttr(out, 'property="og:description"', page.description);
    out = replaceAttr(out, 'name="twitter:description"', page.description);
  }
  return out;
}

const files = { '/': 'dist/index.html', '/signup': 'dist/signup/index.html', '/demo': 'dist/demo/index.html' };
for (const [path, file] of Object.entries(files)) {
  const page = render(path);
  if (!page) throw new Error(`prerender: no route for ${path}`);
  const dest = resolve(root, file);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, inject(template, page));
  console.log(`prerendered ${path} → ${file} (${page.html.length} bytes of markup)`);
}

rmSync(resolve(root, 'dist-ssr'), { recursive: true, force: true });
