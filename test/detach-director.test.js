import { describe, expect, it } from 'vitest';
import { isHall } from '../src/core/data.js';
import { G, M, P } from '../src/core/state.js';
import { idx } from '../src/core/util.js';
import { directorTick } from '../src/sim/storyteller.js';
import { canDetach, dockPack, fitsAt, freePorts, packModule } from '../src/world/build.js';
import { game } from './helpers.js';

const podIndex = () => G.mods.findIndex(m => m.fn.startsWith('pod_'));

describe('canDetach', () => {
  it('refuses the room you are standing in', () => {
    game(11);
    expect(canDetach(M.room[idx(P.x, P.y)])).toBe('You are standing inside it.');
  });

  it('refuses a corridor piece that holds the station together', () => {
    game(11);
    const hub = G.mods[0];
    expect(isHall(hub.fn)).toBe(true);
    expect(Object.keys(hub.links).length).toBeGreaterThan(1);
    expect(canDetach(0)).toBe('Removing it would cut the station in two.');
  });

  it('allows at least one outlying room', () => {
    game(11);
    const ok = G.mods.map((m, mi) => mi).filter(mi => mi !== podIndex() && canDetach(mi) === null);
    expect(ok.length).toBeGreaterThan(0);
  });
});

describe('detaching and docking a room again', () => {
  it('keeps the room and its machines', () => {
    game(11);
    const mi = G.mods.findIndex((m, i) => i !== podIndex() && !isHall(m.fn) && canDetach(i) === null);
    const m = G.mods[mi];
    const machines = G.machines
      .filter(k => k.mod === m.id)
      .map(k => k.type)
      .sort();
    const [link] = Object.values(m.links);
    const { pack } = packModule(mi);
    expect(G.mods.includes(m)).toBe(false);
    expect(G.machines.some(k => k.mod === m.id)).toBe(false);
    const fp = freePorts().find(p => p.mid === link.mod && p.pi === link.pi);
    expect(fp).toBeTruthy();
    const fits = fitsAt(pack, fp);
    expect(fits.length).toBeGreaterThan(0);
    const back = dockPack(pack, fp, fits[0], true);
    expect(
      G.machines
        .filter(k => k.mod === back.id)
        .map(k => k.type)
        .sort(),
    ).toEqual(machines);
    expect(back.links[fits[0].pi].mod).toBe(link.mod);
  });
});

describe('storyteller', () => {
  function run(seed) {
    game(seed);
    G.dir.rest = 0;
    G.dir.tension = 3;
    for (let t = 0; t < 600; t++) {
      G.turn++;
      directorTick();
    }
    return { ...G.dir.recent };
  }

  it('fires incidents and rests after them', () => {
    const recent = run(4);
    expect(Object.keys(recent).length).toBeGreaterThan(0);
    expect(G.dir.rest).toBeGreaterThan(Math.min(...Object.values(recent)));
  });

  it('picks the same incidents for the same seed', () => {
    expect(run(9)).toEqual(run(9));
  });
});
