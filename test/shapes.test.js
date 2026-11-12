import { describe, expect, it } from 'vitest';
import { genShape, rotD, rotDims, rotP, toLocal, toWorld } from '../src/world/shapes.js';

const KINDS = ['rect', 'tube', 'truss', 'L', 'plus', 'oct', 'round', 'blob'];

describe('genShape', () => {
  it.each(KINDS)('%s: walled, connected floor with 2-4 outward ports', kind => {
    for (let n = 0; n < 25; n++) {
      const sh = genShape(kind);
      expect(sh.g).toHaveLength(sh.h);
      for (const row of sh.g) expect(row).toHaveLength(sh.w);

      const at = (x, y) => (x >= 0 && y >= 0 && x < sh.w && y < sh.h ? sh.g[y][x] : ' ');
      const floors = [];
      for (let y = 0; y < sh.h; y++) for (let x = 0; x < sh.w; x++) if (at(x, y) === '.') floors.push([x, y]);
      expect(floors.length).toBeGreaterThan(0);

      for (const [x, y] of floors)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) expect(at(x + dx, y + dy)).not.toBe(' ');

      const seen = new Set([floors[0].join()]);
      const stack = [floors[0]];
      while (stack.length) {
        const [x, y] = stack.pop();
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const k = [x + dx, y + dy].join();
          if (at(x + dx, y + dy) === '.' && !seen.has(k)) {
            seen.add(k);
            stack.push([x + dx, y + dy]);
          }
        }
      }
      expect(seen.size).toBe(floors.length);

      expect(sh.ports.length).toBeGreaterThanOrEqual(2);
      expect(sh.ports.length).toBeLessThanOrEqual(4);
      for (const p of sh.ports) {
        expect(at(p.x, p.y)).toBe('P');
        expect(at(p.x - p.dx, p.y - p.dy)).toBe('.');
        expect(at(p.x + p.dx, p.y + p.dy)).toBe(' ');
      }
    }
  });
});

describe('rotation helpers', () => {
  it('rotD turns a direction 90 degrees clockwise per step', () => {
    const r = (dx, dy, rot) => rotD(dx, dy, rot).map(v => v + 0);
    expect(r(1, 0, 1)).toEqual([0, 1]);
    expect(r(1, 0, 2)).toEqual([-1, 0]);
    expect(r(0, -1, 1)).toEqual([1, 0]);
    expect(r(0, -1, 4)).toEqual([0, -1]);
  });

  it('rotP keeps points inside the rotated bounds', () => {
    const w = 5,
      h = 3;
    for (let rot = 0; rot < 4; rot++) {
      const [rw, rh] = rotDims({ w, h }, rot);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const [rx, ry] = rotP(x, y, rot, w, h);
          expect(rx).toBeGreaterThanOrEqual(0);
          expect(ry).toBeGreaterThanOrEqual(0);
          expect(rx).toBeLessThan(rw);
          expect(ry).toBeLessThan(rh);
        }
    }
  });

  it('toLocal undoes toWorld for every rotation', () => {
    const shape = { w: 6, h: 4 };
    for (let rot = 0; rot < 4; rot++) {
      const m = { shape, rot, ox: 40, oy: 17 };
      for (let y = 0; y < shape.h; y++)
        for (let x = 0; x < shape.w; x++) {
          const [wx, wy] = toWorld(m, x, y);
          expect(toLocal(m, wx, wy)).toEqual([x, y]);
        }
    }
  });
});
