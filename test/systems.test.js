import { beforeEach, describe, expect, it } from 'vitest';
import { EGH, EGW } from '../src/core/constants.js';
import { MD } from '../src/core/data.js';
import { G, M } from '../src/core/state.js';
import { atmoTick, gridTick, powerTick } from '../src/sim/turn.js';
import { isHome } from '../src/space/earth.js';
import { hackInit, hackTurn } from '../src/space/sectors.js';
import { territoryTick } from '../src/space/earth.js';
import { consumers, game, generators, machinesOf, ownEverything } from './helpers.js';

describe('power grid', () => {
  beforeEach(() => {
    game(5);
    ownEverything();
  });

  it('a fully repaired station is all on the bus', () => {
    gridTick();
    expect(G.mods.every(m => m.onGrid)).toBe(true);
  });

  it('a broken junction box cuts its section off the bus', () => {
    const j = machinesOf('junc').find(k => k.mi > 0);
    j.cond = 10;
    gridTick();
    expect(G.mods[j.mi].onGrid).toBe(false);
    expect(G.mods[j.mi].jOK).toBe(false);
    expect(G.mods[0].onGrid).toBe(true);
  });

  it('generation is the sum of online generators', () => {
    powerTick();
    const expected = generators()
      .filter(k => G.mods[k.mi]?.onGrid !== false)
      .reduce((s, k) => s + MD[k.type].gen, 0);
    expect(G.pw.gen).toBe(expected);
  });

  it('with no generation and an empty battery nothing that needs power runs', () => {
    for (const k of generators()) k.cond = 0;
    G.bat = 0;
    powerTick();
    const live = consumers().filter(k => !MD[k.type].busyUse);
    expect(live.length).toBeGreaterThan(0);
    expect(live.every(k => !k.powered)).toBe(true);
  });

  it('the battery covers a shortfall and drains', () => {
    for (const k of generators()) k.cond = 0;
    G.bat = 1000;
    powerTick();
    const live = consumers().filter(k => !MD[k.type].busyUse);
    expect(live.every(k => k.powered)).toBe(true);
    expect(G.bat).toBeLessThan(1000);
  });

  it('losing power on a running machine logs a brownout warning', () => {
    G.bat = 1000;
    powerTick();
    for (const k of generators()) k.cond = 0;
    G.bat = 0;
    G.turn += 200;
    powerTick();
    expect(G.log.some(l => l.m.startsWith('BROWNOUT') && l.c === 'warn')).toBe(true);
  });
});

describe('air', () => {
  beforeEach(() => {
    game(5);
    ownEverything();
  });

  it('a breached section loses 25 pressure per turn down to 0', () => {
    G.mods[1].pressure = 60;
    G.brk.push({ mod: 1, x: 0, y: 0 });
    atmoTick();
    expect(G.mods[1].pressure).toBe(35);
    atmoTick();
    atmoTick();
    expect(G.mods[1].pressure).toBe(0);
  });

  it('scrubbers refill controlled sections up to 100', () => {
    for (const m of G.mods) m.pressure = 50;
    gridTick();
    powerTick();
    for (let i = 0; i < 100; i++) atmoTick();
    if (G.atmo.cap > 0) expect(G.mods.every(m => m.pressure === 100)).toBe(true);
    else expect(G.mods.every(m => m.pressure < 50)).toBe(true);
  });

  it('sections you do not control slowly leak', () => {
    G.mods[1].ctl = false;
    G.mods[1].pressure = 50;
    atmoTick();
    expect(G.mods[1].pressure).toBeCloseTo(49.9);
  });
});

describe('intrusion console', () => {
  let st, d;
  beforeEach(() => {
    game(9);
    st = G.stations.find(s => s.ice >= 2);
    st.hk = null;
    st.alert = false;
    st.mad = false;
    d = { id: 9999, name: 'TEST', hp: 30, sec: st.sec, task: { type: 'hack', st: st.id, on: 1 } };
    G.ext.drones.push(d);
    hackInit(st);
  });
  const cmd = c => {
    d.task.cmd = c;
    hackTurn(d, st, d.task);
  };

  it('builds one layer per security level plus a known CORE', () => {
    expect(st.hk.L).toHaveLength(st.ice + 1);
    expect(st.hk.L.at(-1)).toMatchObject({ k: 'CORE', known: true });
    expect(st.hk.L.slice(0, -1).every(l => !l.known)).toBe(true);
    expect(st.hk.trace).toBe(0);
  });

  it('probe identifies the layer and adds 3 trace', () => {
    st.hk.L[0].k = 'FIREWALL';
    cmd('probe');
    expect(st.hk.L[0].known).toBe(true);
    expect(st.hk.probed).toBe(true);
    expect(st.hk.trace).toBe(3);
  });

  it('spoof opens an AUTH layer for one circuit', () => {
    st.hk.L[0] = { k: 'AUTH', hp: 5, max: 5, known: true };
    G.stock.circ = 2;
    cmd('spoof');
    expect(G.stock.circ).toBe(1);
    expect(st.hk.i).toBe(1);
  });

  it('a WATCHDOG layer adds 3 extra trace to every command except going dark', () => {
    st.hk.L[0].k = 'WATCHDOG';
    cmd('probe');
    expect(st.hk.trace).toBe(6);
  });

  it('going dark lowers trace', () => {
    st.hk.trace = 50;
    st.hk.L[0].k = 'AUTH';
    cmd('dark');
    expect(st.hk.trace).toBe(35);
  });

  it('a full trace burns the link, damages the drone and alerts the station', () => {
    st.hk.L[0] = { k: 'AUTH', hp: 99, max: 99, known: true };
    st.hk.trace = 95;
    cmd('brute');
    expect(st.alert).toBe(true);
    expect(d.task.type).toBe('idle');
    expect(d.hp).toBe(22);
  });

  it('breaking every layer subdues the station', () => {
    for (const l of st.hk.L) l.hp = 0;
    while (st.state !== 'subdued' && st.hk.i < st.hk.L.length) cmd('probe');
    expect(st.state).toBe('subdued');
  });
});

describe('Earth territory', () => {
  it('factions only ever hold habitable land, and keep their homes', () => {
    game(3);
    for (let n = 0; n < 60; n++) territoryTick();
    for (let i = 0; i < EGW * EGH; i++) {
      const o = G.owner[i];
      if (o < 0) continue;
      expect(M.land[i]).toBeTruthy();
      expect(G.hab[i] || isHome(o, i)).toBeTruthy();
    }
    for (let f = 0; f < 4; f++) expect(G.owner.some(o => o === f)).toBe(true);
  });
});
