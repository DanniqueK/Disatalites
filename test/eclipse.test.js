import { beforeEach, describe, expect, it } from 'vitest';
import { MD } from '../src/core/data.js';
import { G } from '../src/core/state.js';
import { ECLIPSE_WARNING, SUN, sunState } from '../src/sim/eclipse.js';
import { powerTick } from '../src/sim/turn.js';
import { game, ownEverything } from './helpers.js';

function addSolar() {
  G.machines.push({
    id: G.nid++,
    mod: G.mods[0].id,
    mi: 0,
    type: 'solar',
    lx: 1,
    ly: 1,
    cond: 100,
    on: true,
    prog: 0,
    fx: true,
    fw: 1,
    fh: 1,
  });
}

/** First turn at or after `from` with the given shadow state. */
function findTurn(inShadow, from = 0) {
  for (let t = from; t < from + 2000; t++) if (sunState(t).inShadow === inShadow) return t;
  throw new Error('no such turn');
}

describe('sunState', () => {
  it.each(SUN.map((s, ring) => [ring, s]))(
    'ring %i: each lap has the right number of dark turns',
    (ring, { lap, shadow }) => {
      game(2);
      G.sectors[G.home].ring = ring;
      let dark = 0;
      for (let t = 0; t < lap; t++) if (sunState(t).inShadow) dark++;
      expect(dark).toBe(Math.round(lap * shadow));
    },
  );

  it('counts down to the next change', () => {
    game(2);
    const t = findTurn(true, findTurn(false));
    expect(sunState(t - 1).untilChange).toBe(1);
    expect(sunState(t - 1).inShadow).toBe(false);
  });
});

describe('solar power and the eclipse', () => {
  beforeEach(() => {
    game(2);
    ownEverything();
    G.sectors[G.home].ring = 0;
    addSolar();
  });

  it('a Solar Controller makes nothing in the shadow', () => {
    G.turn = findTurn(false);
    powerTick();
    const sunGen = G.pw.gen;
    G.turn = findTurn(true, G.turn);
    powerTick();
    expect(sunGen - G.pw.gen).toBe(MD.solar.gen);
  });

  it(`warns ${ECLIPSE_WARNING} turns before the shadow`, () => {
    const dark = findTurn(true, findTurn(false));
    G.turn = dark - ECLIPSE_WARNING;
    powerTick();
    expect(G.log.at(-1).m).toMatch(/Earth's shadow in 5 turns/);
    expect(G.log.at(-1).c).toBe('warn');
  });

  it('does not warn a station without solar power', () => {
    G.machines = G.machines.filter(k => k.type !== 'solar');
    const dark = findTurn(true, findTurn(false));
    G.turn = dark - ECLIPSE_WARNING;
    const n = G.log.length;
    powerTick();
    expect(G.log.slice(n).some(l => /shadow/.test(l.m))).toBe(false);
  });
});
