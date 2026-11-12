import { MD } from '../src/core/data.js';
import { G } from '../src/core/state.js';
import { newGame } from '../src/world/new-game.js';

/** A seeded new game. */
export function game(seed = 1, start = 'clone') {
  newGame(start, seed);
  return G;
}

/** Claim every section and fully repair and switch on every machine. */
export function ownEverything() {
  for (const m of G.mods) m.ctl = true;
  for (const k of G.machines) {
    k.cond = 100;
    k.on = true;
  }
  G.brk = [];
}

export const machinesOf = type => G.machines.filter(k => k.type === type);
export const generators = () => G.machines.filter(k => MD[k.type].gen);
export const consumers = () => G.machines.filter(k => MD[k.type].use);
