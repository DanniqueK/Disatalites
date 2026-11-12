import { describe, expect, it } from 'vitest';
import { on } from '../src/core/events.js';
import { G } from '../src/core/state.js';
import { activeSweep, det } from '../src/space/sectors.js';
import { game } from './helpers.js';

describe('active sweep', () => {
  it('reports the contacts it found, so the ORBIT view can reveal them as the ring passes', () => {
    game(12);
    G.bat = 100;
    G.timers.sweep = 0;
    const before = new Set(G.sectors.filter(s => det(s)).map(s => s.id));
    let payload = null;
    const off = on('sweep', p => (payload = p));
    activeSweep();
    off();
    expect(payload).toBeTruthy();
    expect(payload.R).toBeGreaterThan(0);
    const after = G.sectors.filter(s => det(s)).map(s => s.id);
    const newlyFound = after.filter(id => !before.has(id));
    expect(payload.found.sort()).toEqual(newlyFound.sort());
  });
});
