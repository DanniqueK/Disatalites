// The home orbit passes through Earth's shadow once per lap. Solar Controllers make nothing there.
import { RINGS } from '../core/data.js';
import { G } from '../core/state.js';

/** Lap length in turns and the share of each lap spent in Earth's shadow, per orbital band. */
export const SUN = [
  { lap: 90, shadow: 0.38 },
  { lap: 240, shadow: 0.2 },
  { lap: 720, shadow: 0.06 },
  { lap: 960, shadow: 0.1 },
];

/** Turns of warning before the station enters the shadow. */
export const ECLIPSE_WARNING = 5;

/**
 * Where the station is on its lap at `turn`.
 * @param {number} [turn]
 * @returns {{ band: string, inShadow: boolean, untilChange: number, dark: number }}
 */
export function sunState(turn = G.turn) {
  const s = G.sectors && G.sectors[G.home];
  const ring = s && SUN[s.ring] ? s.ring : 1;
  const { lap, shadow } = SUN[ring];
  const dark = Math.round(lap * shadow),
    start = lap - dark,
    t = turn % lap;
  const inShadow = t >= start;
  return { band: RINGS[ring].n, inShadow, untilChange: inShadow ? lap - t : start - t, dark };
}
