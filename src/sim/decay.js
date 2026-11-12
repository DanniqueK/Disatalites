// Low Earth orbit has a thin atmosphere: loose objects there slowly fall and burn up, and a station
// based in LEO loses altitude until it reboosts with an Ion Drive.
import { DT } from '../core/data.js';
import { log } from '../core/messages.js';
import { random } from '../core/rng.js';
import { G } from '../core/state.js';
import { rr } from '../core/util.js';
import { removeObj } from '../space/exterior-objects.js';
import { HULL } from '../space/sectors.js';
import { addBreachMod } from '../world/build.js';

const DECAYS = ['debris', 'wreck', 'der', 'pod'];
/** Battery cost of a reboost burn. */
export const REBOOST_COST = 15;

const ringOf = sec => {
  const s = G.sectors[sec === HULL ? G.home : sec];
  return s ? s.ring : -1;
};
export const homeInLowOrbit = () => ringOf(G.home) === 0;

/** Turns until a low-orbit object burns up, or null if it is not decaying. */
export function decayLeft(o) {
  return o.decay != null ? Math.max(0, o.decay - G.turn) : null;
}

const objName = o =>
  o.kind === 'wreck'
    ? `${DT[o.dt].n} wreck`
    : o.kind === 'der'
      ? o.pack.name
      : o.kind === 'pod'
        ? 'supply pod'
        : 'debris';

export function decayTick() {
  for (const o of G.ext.objs.slice()) {
    if (!DECAYS.includes(o.kind) || o.st != null || o.sec === HULL || o.sec < 0 || ringOf(o.sec) !== 0)
      continue;
    if (o.decay == null) {
      o.decay = G.turn + rr(500, 900);
      continue;
    }
    if (o.tow || G.turn < o.decay) continue;
    removeObj(o);
    if (o.seen !== false) log(`The ${objName(o)} dipped into the atmosphere and burned up.`, 'info');
  }

  if (!homeInLowOrbit()) {
    G.alt = 100;
    return;
  }
  const before = G.alt ?? 100;
  G.alt = Math.max(0, before - 0.12);
  for (const mark of [50, 25])
    if (before > mark && G.alt <= mark)
      log(
        `ORBIT DECAYING: altitude ${mark}%. Reboost with an Ion Drive before the atmosphere starts eating the hull.`,
        'warn',
      );
  if (G.alt === 0 && G.turn % 20 === 0) {
    addBreachMod(Math.floor(random() * G.mods.length));
    log('Atmospheric drag is heating the hull. A plate tears loose: hull breach. Reboost now.', 'bad');
  }
}

/** Fire the Ion Drives to restore altitude. Returns why it failed, or null. */
export function reboost() {
  if (!homeInLowOrbit()) return 'KESTREL-9 is above the atmosphere here.';
  if (G.bat < REBOOST_COST) return `Not enough battery (needs ${REBOOST_COST}).`;
  G.bat -= REBOOST_COST;
  G.alt = 100;
  G.hot = (G.hot || 0) + 25;
  log('Ion drives burn. KESTREL-9 climbs back to a safe altitude. Everything nearby heard that.', 'good');
  return null;
}
