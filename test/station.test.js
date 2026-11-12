import { describe, expect, it } from 'vitest';
import { T, WALK, WW } from '../src/core/constants.js';
import { FN, isHall, ROOM_SIZE } from '../src/core/data.js';
import { G, M, P } from '../src/core/state.js';
import { D4, idx, inB } from '../src/core/util.js';
import { modCells } from '../src/world/build.js';
import { game } from './helpers.js';

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

function reachableFrom(x, y, steps) {
  const seen = new Uint8Array(M.map.length);
  const st = [idx(x, y)];
  seen[st[0]] = 1;
  while (st.length) {
    const i = st.pop();
    const cx = i % WW,
      cy = (i / WW) | 0;
    for (const [dx, dy] of steps) {
      const nx = cx + dx,
        ny = cy + dy;
      if (!inB(nx, ny)) continue;
      const j = idx(nx, ny);
      if (!seen[j] && WALK.has(M.map[j])) {
        seen[j] = 1;
        st.push(j);
      }
    }
  }
  return seen;
}

describe.each(SEEDS)('starting station, seed %i', seed => {
  it('sections do not overlap and links are two-way', () => {
    game(seed);
    const owner = new Map();
    for (const m of G.mods)
      for (const c of modCells(m)) {
        const k = idx(c.x, c.y);
        expect(owner.has(k), `${m.name} overlaps another section at ${c.x},${c.y}`).toBe(false);
        owner.set(k, m.id);
      }
    for (const m of G.mods)
      for (const [pi, l] of Object.entries(m.links)) {
        const o = G.mods.find(x => x.id === l.mod);
        expect(o, `${m.name} links to a missing section`).toBeTruthy();
        expect(o.links[l.pi]?.mod).toBe(m.id);
        expect(o.links[l.pi]?.pi).toBe(+pi);
      }
  });

  it('rooms only connect to hallways, and every room is a standard size', () => {
    game(seed);
    for (const m of G.mods) {
      if (isHall(m.fn)) continue;
      for (const l of Object.values(m.links)) {
        const o = G.mods.find(x => x.id === l.mod);
        expect(isHall(o.fn), `${m.name} is docked to ${o.name}, a room`).toBe(true);
      }
      const fl = [m.shape.w - 2, m.shape.h - 2].sort().join('x');
      expect(Object.values(ROOM_SIZE).map(s => [...s].sort().join('x'))).toContain(fl);
      expect(FN[m.fn].sz).toBeTruthy();
    }
  });

  it('every floor tile is reachable with straight moves from where the player wakes up', () => {
    game(seed);
    expect(WALK.has(M.map[idx(P.x, P.y)])).toBe(true);
    const seen = reachableFrom(P.x, P.y, D4);
    const unreachable = [];
    for (let i = 0; i < M.map.length; i++)
      if (M.map[i] === T.FLOOR && !seen[i]) unreachable.push(`${i % WW},${(i / WW) | 0}`);
    expect(unreachable).toEqual([]);
  });

  it('is compact: the whole station fits in a 45 x 45 box', () => {
    game(seed);
    let x0 = WW,
      y0 = WW,
      x1 = 0,
      y1 = 0;
    for (let i = 0; i < M.map.length; i++)
      if (M.map[i] !== T.VOID) {
        const x = i % WW,
          y = (i / WW) | 0;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    expect(x1 - x0 + 1).toBeLessThanOrEqual(45);
    expect(y1 - y0 + 1).toBeLessThanOrEqual(45);
  });

  it('rooms have one grid node, hallways none, and only the pod room and hallways start yours', () => {
    game(seed);
    for (const [mi, m] of G.mods.entries()) {
      const nodes = G.machines.filter(k => k.mi === mi && k.type === 'node');
      expect(nodes, `${m.name} grid nodes`).toHaveLength(isHall(m.fn) ? 0 : 1);
      expect(m.ctl, `${m.name} control`).toBe(isHall(m.fn) || m.fn.startsWith('pod_'));
    }
  });
});
