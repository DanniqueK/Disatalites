import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildSite } from '../scripts/build-site.mjs';

const out = mkdtempSync(join(tmpdir(), 'k9-site-'));
afterAll(() => rmSync(out, { recursive: true, force: true }));

describe('buildSite', () => {
  it('puts the modules under a versioned folder and points index.html at it', () => {
    const { base } = buildSite(out, 'abc123def4567890');
    expect(base).toBe('v/abc123def456/');
    const html = readFileSync(join(out, 'index.html'), 'utf8');
    expect(html).toContain('src="v/abc123def456/src/main.js"');
    expect(html).toContain('href="v/abc123def456/src/style.css"');
    expect(html).not.toContain('src="src/main.js"');
    expect(existsSync(join(out, base, 'src/main.js'))).toBe(true);
    expect(existsSync(join(out, base, 'src/core/state.js'))).toBe(true);
    expect(existsSync(join(out, base, 'assets/fonts/ShareTechMono-Regular.ttf'))).toBe(true);
    expect(existsSync(join(out, '.nojekyll'))).toBe(true);
  });

  it('keeps only safe characters from the version', () => {
    expect(buildSite(out, '../../etc').base).toBe('v/etc/');
  });
});
