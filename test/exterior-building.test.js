import { describe, expect, it } from 'vitest';
import { T } from '../src/core/constants.js';
import { isHall } from '../src/core/data.js';
import { G, M } from '../src/core/state.js';
import { idx } from '../src/core/util.js';
import { endTurn } from '../src/sim/turn.js';
import { spawnDrone } from '../src/space/exterior-objects.js';
import { doSeal, doUnseal, fitsAt, freePorts, sealedDoorAt } from '../src/world/build.js';
import { hallShape, roomShape } from '../src/world/shapes.js';
import { game, ownEverything } from './helpers.js';

const hallDoor = () => freePorts().find(p => isHall(G.mods[p.mi].fn));
const roomDoor = () => freePorts().find(p => !isHall(G.mods[p.mi].fn));

describe('docking rules', () => {
  it('rooms fit on hallway doors but never on room doors', () => {
    game(6);
    const room = { fn: 'storage', shape: roomShape('S') };
    const hp = freePorts().filter(p => isHall(G.mods[p.mi].fn));
    expect(hp.some(p => fitsAt(room, p).length > 0)).toBe(true);
    for (const p of freePorts().filter(p => !isHall(G.mods[p.mi].fn))) expect(fitsAt(room, p)).toEqual([]);
  });

  it("corridor pieces may start from a room's back door", () => {
    game(6);
    const hall = { fn: 'hall', shape: hallShape('hall') };
    const rp = freePorts().filter(p => !isHall(G.mods[p.mi].fn));
    expect(rp.some(p => fitsAt(hall, p).length > 0)).toBe(true);
  });
});

describe('sealing doors', () => {
  it('a sealed door becomes wall and can be opened again', () => {
    game(6);
    const fp = roomDoor();
    const m = G.mods[fp.mi];
    expect(doSeal(m, fp.pi)).toBe(true);
    expect(M.map[idx(fp.x, fp.y)]).toBe(T.WALL);
    expect(freePorts().some(p => p.mid === fp.mid && p.pi === fp.pi)).toBe(false);
    const sd = sealedDoorAt(fp.x, fp.y);
    expect(sd).toEqual({ m, pi: fp.pi });
    expect(doUnseal(m, fp.pi)).toBe(true);
    expect(M.map[idx(fp.x, fp.y)]).toBe(T.PORT);
    expect(sealedDoorAt(fp.x, fp.y)).toBeNull();
  });
});

describe('a Utility drone builds corridor pieces', () => {
  it.each(['hall', 'hub'])('builds a %s at a free hallway door', piece => {
    game(6);
    ownEverything();
    G.bat = 200;
    G.stock.scrap = 50;
    G.stock.circ = 10;
    G.kits = 1;
    spawnDrone('util');
    const d = G.ext.drones.at(-1);
    const fp = hallDoor();
    const before = G.mods.length;
    d.task = {
      type: 'build',
      piece,
      mid: fp.mid,
      pi: fp.pi,
      w: 0,
      need: 3,
      paid: { s: 0, c: 0, k: 1 },
    };
    for (let i = 0; i < 80 && d.task.type === 'build'; i++) endTurn(true);
    expect(d.task.type).toBe('idle');
    expect(G.mods).toHaveLength(before + 1);
    const built = G.mods.at(-1);
    expect(built.fn).toBe(piece);
    expect(built.ctl).toBe(true);
    expect(G.mods.find(m => m.id === fp.mid).links[fp.pi]?.mod).toBe(built.id);
    expect(G.log.some(l => l.m.includes(piece === 'hub' ? 'junction hub' : 'hallway segment'))).toBe(true);
  });
});
