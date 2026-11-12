import { beforeEach, describe, expect, it } from 'vitest';
import { G, P } from '../src/core/state.js';
import { crewTick } from '../src/space/sectors.js';
import { drinkWater, endTurn } from '../src/sim/turn.js';
import { game, ownEverything } from './helpers.js';

describe('water', () => {
  beforeEach(() => game(15));

  it('new games start with water and hydration, and Life Support has a Water Reclaimer', () => {
    expect(G.stock.water).toBeGreaterThan(0);
    expect(P.hyd).toBeGreaterThan(0);
    const life = G.mods.findIndex(m => m.fn === 'life');
    expect(G.machines.some(k => k.mi === life && k.type === 'reclaim')).toBe(true);
  });

  it('you drink automatically when hydration is low', () => {
    P.hyd = 25.1;
    const w = G.stock.water;
    endTurn(true);
    expect(P.hyd).toBeGreaterThan(60);
    expect(G.stock.water).toBeLessThanOrEqual(w);
  });

  it('without water you dehydrate and lose body', () => {
    G.stock.water = 0;
    P.hyd = 0.1;
    const hp = P.hp;
    endTurn(true);
    expect(P.hyd).toBe(0);
    expect(P.hp).toBeLessThan(hp);
    expect(G.killer).toBe('dehydration');
  });

  it('a running Water Reclaimer recovers most of the water drunk', () => {
    ownEverything();
    G.bat = 500;
    endTurn(true);
    G.stock.water = 1000;
    let used = 0;
    for (let i = 0; i < 200; i++) {
      const w = G.stock.water;
      drinkWater();
      used += w - G.stock.water;
    }
    expect(used).toBeLessThan(100);
  });

  it('hydroponics needs water to grow rations', () => {
    ownEverything();
    const hydro = G.machines.find(k => k.type === 'hydro');
    if (!hydro) return;
    G.bat = 500;
    G.stock.water = 0;
    hydro.prog = 19;
    endTurn(true);
    expect(G.log.some(l => /Hydroponics is dry/.test(l.m))).toBe(true);
  });

  it('the crew drink too', () => {
    G.crew.push({ name: 'Test', role: 'medic', x: P.x, y: P.y });
    G.stock.water = 10;
    G.crewWater = 0.99;
    crewTick();
    expect(G.stock.water).toBeLessThanOrEqual(10);
    expect(G.crewWater).toBeLessThan(1);
  });
});
