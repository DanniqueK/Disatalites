// The game core announces what happened; the UI (and later audio) listens. The core never calls the UI.

/**
 * @typedef {object} GameEvents
 * @property {undefined} changed  Game state changed; redraw panels and map.
 * @property {Record<string, any>} fx A visual effect (tracer, explosion) to animate.
 * @property {undefined} hurt     The player took damage.
 * @property {{ R: number, found: number[] }} sweep An active sensor sweep went out with radius R and found these sectors.
 * @property {{ x: number, y: number }} strike A legacy satellite hit an Earth cell.
 * @property {string} tab         Switch the map to this view.
 * @property {undefined} title    Show the title screen.
 * @property {number} hack        Open the intrusion console for this drone id.
 * @property {{ m: string, c: string }} log A line was added to the log (sound, notifications).
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * @template {keyof GameEvents} K
 * @param {K} type
 * @param {(payload: GameEvents[K]) => void} fn
 * @returns {() => void} Call to unsubscribe.
 */
export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => listeners.get(type).delete(fn);
}

/**
 * @template {keyof GameEvents} K
 * @param {K} type
 * @param {GameEvents[K]} [payload]
 */
export function emit(type, payload) {
  const set = listeners.get(type);
  if (set) for (const fn of [...set]) fn(payload);
}
