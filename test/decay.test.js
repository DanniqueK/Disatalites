import { beforeEach, describe, expect, it } from 'vitest';
import { G } from '../src/core/state.js';
import { decayLeft, decayTick, homeInLowOrbit, reboost, REBOOST_COST } from '../src/sim/decay.js';
import { HULL } from '../src/space/sectors.js';
import { salvageEstimate } from '../src/world/salvage.js';
import { game } from './helpers.js';

const leo = () => G.sectors.find(s => s.ring === 0 && s.id !== G.home);
const meo = () => G.sectors.find(s => s.ring === 1 && s.id !== G.home);
const debris = sec => {
  const o = { id: 7000 + G.ext.objs.length, kind: 'debris', sec, x: 50, y: 50, res: { scrap: 5 } };
  G.ext.objs.push(o);
  return o;
};

describe('orbital decay of loose objects', () => {
  beforeEach(() => game(14));

  it('objects in LEO get a timer and burn up when it runs out', () => {
    const o = debris(leo().id);
    decayTick();
    expect(decayLeft(o)).toBeGreaterThan(0);
    G.turn = o.decay;
    decayTick();
    expect(G.ext.objs).not.toContain(o);
  });

  it('objects higher up, in the hull yard, or under tow do not decay', () => {
    const high = debris(meo().id);
    const yard = debris(HULL);
    const towed = debris(leo().id);
    decayTick();
    expect(decayLeft(high)).toBeNull();
    expect(decayLeft(yard)).toBeNull();
    towed.tow = 1;
    G.turn = towed.decay + 10;
    decayTick();
    expect(G.ext.objs).toContain(towed);
  });

  it('the salvage preview shows the time left', () => {
    const o = debris(leo().id);
    decayTick();
    expect(salvageEstimate(o).hazards.some(h => /burns up in about/.test(h))).toBe(true);
  });
});

describe('station altitude in LEO', () => {
  beforeEach(() => {
    game(14);
    G.sectors[G.home].ring = 0;
  });

  it('drops while home is in LEO, with a warning at 50%', () => {
    expect(homeInLowOrbit()).toBe(true);
    G.alt = 50.05;
    decayTick();
    expect(G.alt).toBeLessThan(50);
    expect(G.log.at(-1).m).toMatch(/ORBIT DECAYING: altitude 50%/);
  });

  it('at zero altitude the hull starts breaching', () => {
    G.alt = 0;
    G.turn = 40;
    const before = G.mods.reduce((n, m) => n + m.breaches.length, 0);
    decayTick();
    expect(G.mods.reduce((n, m) => n + m.breaches.length, 0)).toBeGreaterThan(before);
  });

  it('a reboost restores altitude for battery power', () => {
    G.alt = 30;
    G.bat = 40;
    expect(reboost()).toBeNull();
    expect(G.alt).toBe(100);
    expect(G.bat).toBe(40 - REBOOST_COST);
    G.bat = 1;
    expect(reboost()).toMatch(/Not enough battery/);
  });

  it('higher orbits keep full altitude', () => {
    G.sectors[G.home].ring = 1;
    G.alt = 40;
    decayTick();
    expect(G.alt).toBe(100);
    expect(reboost()).toMatch(/above the atmosphere/);
  });
});
