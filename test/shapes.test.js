import { describe, expect, it } from 'vitest';
import { ROOM_SIZE } from '../src/core/data.js';
import { hallShape, roomShape, rotD, rotDims, rotP, toLocal, toWorld } from '../src/world/shapes.js';

const at = (sh, x, y) => (x >= 0 && y >= 0 && x < sh.w && y < sh.h ? sh.g[y][x] : ' ');

function checkShape(sh) {
  expect(sh.g).toHaveLength(sh.h);
  for (const row of sh.g) expect(row).toHaveLength(sh.w);
  for (const p of sh.ports) {
    expect(at(sh, p.x, p.y)).toBe('P');
    expect(at(sh, p.x - p.dx, p.y - p.dy)).toBe('.');
    expect(at(sh, p.x + p.dx, p.y + p.dy)).toBe(' ');
  }
}

describe('standard shapes', () => {
  it.each(Object.keys(ROOM_SIZE))(
    'room %s: walled floor of the standard size with a door on each long side',
    size => {
      const sh = roomShape(size);
      checkShape(sh);
      const [fw, fh] = ROOM_SIZE[size];
      expect([sh.w, sh.h]).toEqual([fw + 2, fh + 2]);
      expect(sh.ports).toHaveLength(2);
      for (const p of sh.ports) expect(p.x).toBe(sh.w >> 1);
    },
  );

  it('hallway: three tiles wide with end doors and one room door per side', () => {
    const sh = hallShape('hall');
    checkShape(sh);
    expect(sh.h - 2).toBe(3);
    expect(sh.ports.map(p => [p.dx, p.dy])).toEqual(
      expect.arrayContaining([
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]),
    );
  });

  it('hub: a 3 x 3 junction with a door on every side', () => {
    const sh = hallShape('hub');
    checkShape(sh);
    expect([sh.w, sh.h]).toEqual([5, 5]);
    expect(sh.ports).toHaveLength(4);
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
