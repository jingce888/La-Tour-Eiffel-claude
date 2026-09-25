// Bundles src/ (three.js is tree-shaken + minified) and inlines everything —
// CSS, JS and the compressed Paris map data — into ONE self-contained
// index.html that runs offline (double-click / file://) or from any static host.
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const debug = process.argv.includes('--debug');

async function build() {
  const t0 = Date.now();
  const result = await esbuild.build({
    entryPoints: [path.join(root, 'src/main.js')],
    bundle: true,
    format: 'esm',
    target: ['es2020', 'chrome90', 'firefox90', 'safari15'],
    minify: !debug,
    sourcemap: false,
    write: false,
    legalComments: 'none',
    charset: 'utf8',
    loader: { '.bin': 'base64', '.glsl': 'text' },
    define: { __DEBUG__: String(debug) },
  });
  let js = result.outputFiles[0].text;
  // never let a literal "</script" terminate the inline script early
  js = js.replace(/<\/script/gi, '<\\/script');
  const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
  let html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  html = html.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
  fs.writeFileSync(path.join(root, 'index.html'), html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`built index.html  ${kb} KB  (${Date.now() - t0} ms)`);
}

await build();
if (watch) {
  console.log('watching src/ …');
  let timer = null;
  fs.watch(path.join(root, 'src'), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => build().catch(e => console.error(e.message)), 120);
  });
}
