// All game randomness comes from one seeded stream whose state lives in G (G.seed, G.rng),
// so a run is reproducible from its seed and a save continues the same stream.
import { G } from './state.js';

/** A fresh random 32-bit seed. */
export function newSeed() {
  return (Math.random() * 2 ** 32) >>> 0;
}

/**
 * Next number in [0, 1) from the game's seeded stream (mulberry32).
 * Before a game exists (boot, title screen) it falls back to Math.random.
 */
export function random() {
  if (!G) return Math.random();
  let t = (G.rng = (G.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Randomness for visuals only (sparks, star field). It must never change game state. */
export const fxRandom = () => Math.random();
