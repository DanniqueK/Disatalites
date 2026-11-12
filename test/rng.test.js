import { describe, expect, it } from 'vitest';
import { random } from '../src/core/rng.js';
import { applySave, serialize, setAutosave } from '../src/core/save.js';
import { G } from '../src/core/state.js';
import { endTurn } from '../src/sim/turn.js';
import { newGame } from '../src/world/new-game.js';

function play(seed, turns) {
  newGame('clone', seed);
  for (let i = 0; i < turns && !G.over; i++) endTurn(true);
  return serialize();
}

describe('seeded RNG', () => {
  it('produces numbers in [0, 1)', () => {
    newGame('clone', 1);
    for (let i = 0; i < 1000; i++) {
      const r = random();
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
    }
  });

  it('the same seed gives the same world and the same 200 turns', () => {
    expect(play(12345, 200)).toBe(play(12345, 200));
  });

  it('different seeds give different worlds', () => {
    expect(play(1, 0)).not.toBe(play(2, 0));
  });

  it('a loaded save continues the same random stream', () => {
    newGame('clone', 777);
    for (let i = 0; i < 50; i++) endTurn(true);
    const mid = JSON.parse(serialize());
    for (let i = 0; i < 50; i++) endTurn(true);
    const straight = serialize();
    applySave(mid);
    setAutosave(false);
    for (let i = 0; i < 50; i++) endTurn(true);
    expect(serialize()).toBe(straight);
  });
});
