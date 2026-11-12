import { beforeEach, describe, expect, it } from 'vitest';
import { G } from '../src/core/state.js';
import { isWatched, toggleWatch, watchTick } from '../src/sim/watch.js';
import { game } from './helpers.js';

const lastLog = () => G.log.at(-1).m;

describe('watch list', () => {
  let obj;
  beforeEach(() => {
    game(13);
    obj = { id: 5000, kind: 'rogue', sec: G.home, x: 40, y: 40, hp: 20 };
    G.ext.objs.push(obj);
  });

  it('tracks and untracks', () => {
    expect(toggleWatch('obj', obj.id)).toBe(true);
    expect(isWatched('obj', obj.id)).toBe(true);
    expect(lastLog()).toMatch(/Tracking the rogue drone/);
    expect(toggleWatch('obj', obj.id)).toBe(false);
    expect(isWatched('obj', obj.id)).toBe(false);
  });

  it('reports moving once, damage, and disappearance', () => {
    toggleWatch('obj', obj.id);
    obj.x++;
    watchTick();
    expect(lastLog()).toMatch(/on the move/);
    const n = G.log.length;
    obj.x++;
    watchTick();
    expect(G.log.length).toBe(n);
    obj.hp = 10;
    watchTick();
    expect(lastLog()).toMatch(/took damage/);
    G.ext.objs.splice(G.ext.objs.indexOf(obj), 1);
    watchTick();
    expect(lastLog()).toMatch(/rogue drone is gone/);
    expect(isWatched('obj', obj.id)).toBe(false);
  });

  it('reports when a tracked contact is identified', () => {
    const s = G.sectors.find(s => s.id !== G.home && !s.known);
    s.det = 1;
    toggleWatch('sec', s.id);
    s.det = 2;
    watchTick();
    expect(lastLog()).toMatch(/is identified/);
  });

  it('stays quiet when nothing changes', () => {
    toggleWatch('obj', obj.id);
    const n = G.log.length;
    watchTick();
    watchTick();
    expect(G.log.length).toBe(n);
  });
});
