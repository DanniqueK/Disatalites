import { describe, expect, it } from 'vitest';
import { G } from '../src/core/state.js';
import { HULL } from '../src/space/sectors.js';
import { estimateText, salvageEstimate } from '../src/world/salvage.js';
import { game } from './helpers.js';

const debris = sec => ({ id: 1, kind: 'debris', sec, x: 50, y: 50, res: { scrap: 10, circ: 5, rat: 0 } });
const farSector = () => G.sectors.find(s => s.id !== G.home).id;

describe('salvageEstimate', () => {
  it('is exact for targets around the station', () => {
    game(3);
    const e = salvageEstimate(debris(HULL));
    expect(e.exact).toBe(true);
    expect(e.loot).toEqual(['10 scrap, 5 circuits']);
  });

  it('gives a range further out, and exact numbers with a Survey Scanner', () => {
    game(3);
    const o = debris(farSector());
    expect(salvageEstimate(o).loot).toEqual(['6-14 scrap, 3-7 circuits']);
    expect(salvageEstimate(o, { scan: true }).loot).toEqual(['10 scrap, 5 circuits']);
  });

  it('describes wrecks, lifeboats and loose rooms', () => {
    game(3);
    expect(salvageEstimate({ kind: 'wreck', dt: 'tug', sec: HULL, x: 0, y: 0 }).loot[0]).toMatch(
      /Tug drone wreck/,
    );
    expect(salvageEstimate({ kind: 'raft', n: 2, sec: HULL, x: 0, y: 0 }).loot[0]).toMatch(/2 survivors/);
    const der = G.ext.objs.find(o => o.kind === 'der');
    const e = salvageEstimate({ ...der, sec: HULL }, null);
    expect(e.loot.some(l => l.startsWith('scrapped:'))).toBe(true);
  });

  it('lists rogue drones and null pockets near the target', () => {
    game(3);
    const sec = farSector();
    const o = debris(sec);
    G.ext.objs.push(
      { id: 900, kind: 'rogue', sec, x: 53, y: 50 },
      { id: 901, kind: 'null', sec, x: 51, y: 51 },
    );
    const e = salvageEstimate(o);
    expect(e.hazards).toEqual(
      expect.arrayContaining(['1 rogue drone nearby', 'a known null pocket close by']),
    );
    expect(estimateText(e)).toContain(' ! 1 rogue drone nearby');
  });

  it('says so when there is nothing and no threat', () => {
    game(3);
    const text = estimateText(salvageEstimate({ kind: 'debris', sec: HULL, x: 0, y: 0, res: {} }));
    expect(text).toContain('nothing worth taking');
    expect(text).toContain('no known threats');
  });
});
