import { describe, expect, it } from 'vitest';
import { FN, isHall, MD, ROOM_CAT } from '../src/core/data.js';
import { G } from '../src/core/state.js';
import { gridTick, powerTick } from '../src/sim/turn.js';
import { roomStatus } from '../src/world/rooms.js';
import { game, ownEverything } from './helpers.js';

const idxOf = fn => G.mods.findIndex(m => m.fn === fn);

function working() {
  game(8);
  ownEverything();
  for (const m of G.mods) m.pressure = 100;
  G.bat = 500;
  gridTick();
  powerTick();
}

describe('room categories', () => {
  it('every room type has a colour category, and corridor pieces are hallways', () => {
    for (const [fn, f] of Object.entries(FN)) {
      expect(ROOM_CAT[f.cat], fn).toBeTruthy();
      expect(f.cat === 'hall').toBe(isHall(fn));
    }
  });
});

describe('roomStatus', () => {
  it('rooms you have not claimed say they are locked; hallways never do', () => {
    game(8);
    for (const [mi, m] of G.mods.entries()) {
      const st = roomStatus(mi);
      expect(st.problems.includes('locked')).toBe(!m.ctl && !isHall(m.fn));
    }
  });

  it('a claimed, repaired, powered room reports no problems', () => {
    working();
    const st = roomStatus(idxOf('power'));
    expect(st.problems).toEqual([]);
    expect(st.cat).toBe('power');
    expect(st.color).toBe(ROOM_CAT.power.c);
  });

  it('reports a broken or missing main machine', () => {
    working();
    const mi = idxOf('power');
    const reactor = G.machines.find(k => k.mi === mi && k.type === 'reactor');
    reactor.cond = 20;
    expect(roomStatus(mi).problems).toContain(`${MD.reactor.n} broken`);
    G.machines.splice(G.machines.indexOf(reactor), 1);
    expect(roomStatus(mi).problems).toContain(`no ${MD.reactor.n}`);
  });

  it('reports breaches, low air and being off the power bus', () => {
    working();
    const mi = idxOf('storage');
    G.brk.push({ id: 1, mod: mi, x: 0, y: 0 });
    G.mods[mi].pressure = 10;
    G.mods[mi].onGrid = false;
    expect(roomStatus(mi).problems).toEqual(
      expect.arrayContaining(['breach', 'low air', 'off the power bus']),
    );
  });
});
