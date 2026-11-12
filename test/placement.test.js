import { describe, expect, it } from 'vitest';
import { T, WW } from '../src/core/constants.js';
import { gearAllowedIn, isHall, SMALL } from '../src/core/data.js';
import { G, M } from '../src/core/state.js';
import { D4, idx } from '../src/core/util.js';
import { modCells } from '../src/world/build.js';
import { placeGear, placeProblem, removeMachine } from '../src/world/placement.js';
import { game, ownEverything } from './helpers.js';

const roomOf = fn => G.mods.findIndex(m => m.fn === fn);
const floorOf = mi =>
  modCells(G.mods[mi]).filter(c => M.map[idx(c.x, c.y)] === T.FLOOR && M.room[idx(c.x, c.y)] === mi);

function freeFloorConnected(mi) {
  const free = new Set(floorOf(mi).map(c => idx(c.x, c.y)));
  const [first] = free;
  const seen = new Set([first]);
  const st = [first];
  while (st.length) {
    const i = st.pop();
    for (const [dx, dy] of D4) {
      const j = idx((i % WW) + dx, ((i / WW) | 0) + dy);
      if (free.has(j) && !seen.has(j)) {
        seen.add(j);
        st.push(j);
      }
    }
  }
  return seen.size === free.size;
}

describe('generated stations have no mounts', () => {
  it.each(Array.from({ length: 20 }, (_, i) => i + 1))(
    'seed %i: no pads, gear only where it belongs',
    seed => {
      game(seed);
      for (const k of G.machines) {
        expect(['mount', 'hp']).not.toContain(k.type);
        if (SMALL.includes(k.type) && !isHall(G.mods[k.mi].fn))
          expect(gearAllowedIn(k.type, G.mods[k.mi].fn), `${k.type} in ${G.mods[k.mi].fn}`).toBe(true);
      }
    },
  );
});

describe('placing gear', () => {
  it('refuses hallways, rooms you do not control, and rooms where it does not belong', () => {
    game(4);
    const hall = G.mods.findIndex(m => isHall(m.fn));
    const hc = floorOf(hall)[0] || modCells(G.mods[hall]).find(c => c.c === '.');
    expect(placeProblem('escrub', hc.x, hc.y)).toBe('hallways stay clear');
    const hab = roomOf('hab');
    const c = floorOf(hab)[0];
    expect(placeProblem('escrub', c.x, c.y)).toMatch(/does not answer to you/);
    G.mods[hab].ctl = true;
    expect(placeProblem('locker', c.x, c.y)).toMatch(/does not belong/);
  });

  it('keeps doorways clear', () => {
    game(4);
    ownEverything();
    const st = roomOf('storage');
    const nearDoor = floorOf(st).find(c =>
      [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => M.map[idx(c.x + dx, c.y + dy)] === T.DOOR)),
    );
    expect(placeProblem('locker', nearDoor.x, nearDoor.y)).toBe('doorways stay clear');
  });

  it('places and removes gear on a free floor tile', () => {
    game(4);
    ownEverything();
    const st = roomOf('storage');
    const spot = floorOf(st).find(c => placeProblem('locker', c.x, c.y) == null);
    expect(spot).toBeTruthy();
    const m = placeGear('locker', spot.x, spot.y, 80);
    expect(M.map[idx(spot.x, spot.y)]).toBe(T.MACH);
    expect(m.mi).toBe(st);
    removeMachine(m);
    expect(M.map[idx(spot.x, spot.y)]).toBe(T.FLOOR);
    expect(G.machines).not.toContain(m);
  });

  it.each([1, 2, 3, 4, 5])('seed %i: filling a room never cuts its walkway', seed => {
    game(seed);
    ownEverything();
    for (const fn of ['storage', 'hab', 'power']) {
      const mi = roomOf(fn);
      const type = fn === 'hab' ? 'bunk' : fn === 'storage' ? 'locker' : 'escrub';
      let placed = 0;
      for (;;) {
        const spot = floorOf(mi).find(c => placeProblem(type, c.x, c.y) == null);
        if (!spot) break;
        placeGear(type, spot.x, spot.y);
        placed++;
        expect(freeFloorConnected(mi), `${fn} after ${placed} placements`).toBe(true);
      }
      expect(placed).toBeGreaterThan(0);
    }
  });

  it('turrets go on an outer wall that faces into the room', () => {
    game(4);
    ownEverything();
    const mi = roomOf('power');
    const floor = floorOf(mi)[0];
    expect(placeProblem('turret', floor.x, floor.y)).toBe('a turret goes on an outer wall');
    const wall = modCells(G.mods[mi]).find(c => placeProblem('turret', c.x, c.y) == null);
    expect(wall).toBeTruthy();
    const m = placeGear('turret', wall.x, wall.y);
    expect(m.wall).toBe(true);
    expect(m.face).toBeTruthy();
  });
});
