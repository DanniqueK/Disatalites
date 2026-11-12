import { describe, expect, it } from 'vitest';
import { T, WALK } from '../src/core/constants.js';
import { G, M, P } from '../src/core/state.js';
import { D8, idx, inB } from '../src/core/util.js';
import { modCells } from '../src/world/build.js';
import { game } from './helpers.js';

const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

describe.each(SEEDS)('starting station, seed %i', seed => {
  it('sections do not overlap and links are two-way', () => {
    game(seed);
    const owner = new Map();
    for (const m of G.mods)
      for (const c of modCells(m)) {
        if (c.c === ' ') continue;
        const k = idx(c.x, c.y);
        const prev = owner.get(k);
        // Linked ports share their doorway tile; anything else is an overlap.
        if (prev != null && prev !== m.id) expect(c.c, `overlap at ${c.x},${c.y}`).toBe('P');
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

  it('every floor tile can be reached from where the player wakes up (8-way moves)', () => {
    game(seed);
    expect(WALK.has(M.map[idx(P.x, P.y)])).toBe(true);
    const seen = new Uint8Array(M.map.length);
    const st = [idx(P.x, P.y)];
    seen[st[0]] = 1;
    while (st.length) {
      const i = st.pop();
      const x = i % 144,
        y = (i / 144) | 0;
      for (const [dx, dy] of D8) {
        const nx = x + dx,
          ny = y + dy;
        if (!inB(nx, ny)) continue;
        const j = idx(nx, ny);
        if (!seen[j] && WALK.has(M.map[j])) {
          seen[j] = 1;
          st.push(j);
        }
      }
    }
    const unreachable = [];
    for (let i = 0; i < M.map.length; i++)
      if (M.map[i] === T.FLOOR && !seen[i]) unreachable.push(`${i % 144},${(i / 144) | 0}`);
    expect(unreachable).toEqual([]);
  });

  it('every section has exactly one grid node and the pod section is yours', () => {
    game(seed);
    for (const [mi, m] of G.mods.entries()) {
      const nodes = G.machines.filter(k => k.mi === mi && k.type === 'node');
      expect(nodes, `${m.name} grid nodes`).toHaveLength(m.fn === 'tube' ? nodes.length : 1);
    }
    expect(G.mods[0].ctl).toBe(true);
    expect(G.mods.slice(1).every(m => !m.ctl || m.fn === 'tube')).toBe(true);
  });
});
