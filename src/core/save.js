import { SAVE_VERSION } from './constants.js';
import { log } from './messages.js';
import { G, P, setG, setP, V } from './state.js';
import { initLand } from '../space/earth.js';
import { buildRegions, HULL } from '../space/sectors.js';
import { rebuildMap } from '../world/build.js';
import { fov } from '../world/fov.js';
import { initStars } from '../world/new-game.js';

export const SAVE_KEY = 'kestrel9.save';
/** Keys used by older builds. Read once and migrated to SAVE_KEY. */
const LEGACY_KEYS = ['k9save9'];

/**
 * Upgrades a save from version N to N + 1. Add one entry per format change and bump SAVE_VERSION.
 * @type {Record<number, (data: { G: any, P: any }) => void>}
 */
export const MIGRATIONS = {};

/**
 * @typedef {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} SaveStorage
 * @typedef {{ ok: boolean, reason?: string }} LoadResult `reason` is set when `ok` is false.
 */

/** @type {SaveStorage | null} */
let storage = null;
try {
  storage = globalThis.localStorage ?? null;
} catch (e) {
  storage = null;
}
let saveFailing = false;
// The title screen runs on a throwaway background game; saving it would overwrite the real save.
let autosave = false;

/** Turn autosave on once the player starts or continues a game. */
export function setAutosave(/** @type {boolean} */ on) {
  autosave = on;
}

/** Swap the storage backend (tests use an in-memory one). */
export function setStorage(/** @type {SaveStorage | null} */ s) {
  storage = s;
  saveFailing = false;
}

/** The current game as a save string. */
export function serialize() {
  return JSON.stringify({ G, P });
}

/**
 * Parse a save string and upgrade it to SAVE_VERSION. Does not touch the running game.
 * @param {string} text
 * @returns {{ ok: boolean, data?: { G: any, P: any }, reason?: string }}
 */
export function parseSave(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, reason: 'the save data is corrupt' };
  }
  if (!data || typeof data !== 'object' || !data.G || !data.P || typeof data.G.v !== 'number')
    return { ok: false, reason: 'the save data is not a KESTREL-9 save' };
  if (data.G.v > SAVE_VERSION)
    return { ok: false, reason: `it was made by a newer version of the game (format ${data.G.v})` };
  while (data.G.v < SAVE_VERSION) {
    const step = MIGRATIONS[data.G.v];
    if (!step) return { ok: false, reason: `its format (${data.G.v}) is too old to convert` };
    try {
      step(data);
    } catch (e) {
      return { ok: false, reason: `converting it from format ${data.G.v} failed` };
    }
    data.G.v++;
  }
  return { ok: true, data };
}

/** Autosave. Warns once in the log while saving fails, and once when it works again. */
export function save() {
  if (!autosave || !G || G.over) return false;
  try {
    if (!storage) throw new Error('no storage');
    storage.setItem(SAVE_KEY, serialize());
    for (const k of LEGACY_KEYS) storage.removeItem(k);
    if (saveFailing) log('Autosave is working again.', 'info');
    saveFailing = false;
    return true;
  } catch (e) {
    if (!saveFailing)
      log(
        `Autosave failed: ${e && e.name === 'QuotaExceededError' ? 'browser storage is full' : 'browser storage is unavailable'}. Progress is not being kept.`,
        'warn',
      );
    saveFailing = true;
    return false;
  }
}

export function clearSave() {
  try {
    for (const k of [SAVE_KEY, ...LEGACY_KEYS]) storage?.removeItem(k);
  } catch (e) {}
}

function readRaw() {
  try {
    for (const k of [SAVE_KEY, ...LEGACY_KEYS]) {
      const v = storage?.getItem(k);
      if (v) return v;
    }
  } catch (e) {}
  return null;
}

export function hasSave() {
  return readRaw() != null;
}

/**
 * Replace the running game with a parsed save and rebuild everything derived from it.
 * @param {{ G: any, P: any }} data
 */
export function applySave(data) {
  setG(data.G);
  setP(data.P);
  initLand();
  initStars();
  buildRegions();
  rebuildMap();
  fov();
  V.tab = 'station';
  V.ecam = null;
  V.sec = HULL;
  autosave = true;
}

/** @returns {LoadResult} */
export function loadSave() {
  const raw = readRaw();
  if (raw == null) return { ok: false, reason: 'there is no saved game' };
  const parsed = parseSave(raw);
  if (!parsed.ok) return parsed;
  try {
    applySave(parsed.data);
  } catch (e) {
    return { ok: false, reason: 'the saved station could not be rebuilt' };
  }
  return { ok: true };
}
