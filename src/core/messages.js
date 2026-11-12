import { G, V } from './state.js';

/** @typedef {import('./types.js').ModalButton} ModalButton */

/**
 * Add a line to the log. `warn` and `bad` lines interrupt multi-turn actions.
 * @param {string} m
 * @param {string} [c]
 */
export function log(m, c) {
  G.log.push({ n: G.turn, m, c: c || '' });
  if (G.log.length > 150) G.log.shift();
  if (c === 'bad' || c === 'warn') G.intr = true;
}

/**
 * Add a line to the combat panel.
 * @param {string} m
 * @param {string} [c]
 */
export function cmb(m, c) {
  G.cmb.push({ n: G.turn, m, c: c || '' });
  if (G.cmb.length > 100) G.cmb.shift();
}

/**
 * Queue a dialog; the UI shows queued dialogs one at a time when nothing else is open.
 * @param {string} title
 * @param {string} body
 * @param {ModalButton[]} [btns]
 */
export function queueModal(title, body, btns) {
  V.modalQ.push([title, body, btns]);
}
