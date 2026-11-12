// Packages the game for static hosting (GitHub Pages). Not needed to play locally.
//
// Usage: node scripts/build-site.mjs <outDir> <version>
//
// Every deploy puts its modules under v/<version>/, and index.html points there. Module URLs therefore
// change with each deploy, so a browser can never combine a cached module from an old deploy with a new
// one (which breaks imports). index.html itself is small and revalidated by the browser.
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/**
 * @param {string} outDir
 * @param {string} version
 */
export function buildSite(outDir, version) {
  const v =
    String(version)
      .replace(/[^\w-]/g, '')
      .slice(0, 12) || 'dev';
  const base = `v/${v}/`;
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, base), { recursive: true });
  cpSync(join(root, 'src'), join(outDir, base, 'src'), { recursive: true });
  cpSync(join(root, 'assets'), join(outDir, base, 'assets'), { recursive: true });
  const html = readFileSync(join(root, 'index.html'), 'utf8')
    .replace('href="src/style.css"', `href="${base}src/style.css"`)
    .replace('src="src/main.js"', `src="${base}src/main.js"`);
  if (!html.includes(`${base}src/main.js`) || !html.includes(`${base}src/style.css`))
    throw new Error('index.html no longer references src/main.js and src/style.css as expected');
  writeFileSync(join(outDir, 'index.html'), html);
  writeFileSync(join(outDir, '.nojekyll'), '');
  return { base };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const [outDir = '_site', version = 'dev'] = process.argv.slice(2);
  const { base } = buildSite(resolve(outDir), version);
  console.log(`site written to ${outDir} (modules under ${base})`);
}
