// What each room is for and what is wrong with it, for the ROOMS overlay.
import { FN, FX, isHall, MD, ROOM_CAT } from '../core/data.js';
import { G } from '../core/state.js';
import { modBreaches } from './control.js';
import { online } from './machines.js';

/**
 * @typedef {object} RoomStatus
 * @property {string} name
 * @property {string} cat Category key in ROOM_CAT.
 * @property {string} color
 * @property {boolean} hall
 * @property {number} pressure
 * @property {string[]} problems Short, most urgent first. Empty when the room works.
 */

/**
 * @param {number} mi Index into G.mods.
 * @returns {RoomStatus}
 */
export function roomStatus(mi) {
  const m = G.mods[mi];
  const f = FN[m.fn] || {};
  const cat = f.cat || 'hall';
  const hall = isHall(m.fn);
  const problems = [];
  if (!hall && !m.ctl) problems.push('locked');
  const nb = modBreaches(mi);
  if (nb) problems.push(nb > 1 ? `${nb} breaches` : 'breach');
  if (m.pressure < 35) problems.push('low air');
  if (m.onGrid === false) problems.push('off the power bus');
  for (const t of (f.m || []).filter(t => FX[t])) {
    const k = G.machines.find(k => k.mi === mi && k.type === t);
    if (!k) problems.push(`no ${MD[t].n}`);
    else if (k.cond < 60) problems.push(`${MD[t].n} broken`);
    else if (m.ctl && !online(k)) problems.push(`${MD[t].n} offline`);
  }
  return { name: m.name, cat, color: ROOM_CAT[cat].c, hall, pressure: Math.round(m.pressure), problems };
}
