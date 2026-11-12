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
// Format 11 (hallway station layout) cannot be converted from older layouts, so older saves are rejected.
export const MIGRATIONS = {
  // v12: mount pads and empty hardpoints are gone; gear is placed freely.
  11: d => {
    d.G.machines = d.G.machines.filter(k => k.type !== 'mount' && k.type !== 'hp');
  },
  // v13: the tube planner, connector pieces and port cutting are gone; drones on those jobs stop.
  12: d => {
    for (const dr of d.G.ext.drones)
      if (['tube', 'tube2', 'cut', 'brace'].includes(dr.task.type)) {
        if (dr.task.type === 'tube') d.G.kits++;
        if (dr.task.type === 'tube2' && dr.task.plan && dr.task.plan.paid)
          d.G.kits += dr.task.plan.paid.k || 0;
        dr.task = { type: 'idle' };
      }
  },
  // v14: water. Old stations get a starting supply and a full canteen; drone cargo holds water.
  13: d => {
    d.G.stock.water = d.G.stock.water ?? 12;
    d.P.hyd = d.P.hyd ?? 80;
    for (const dr of d.G.ext.drones) if (dr.cargo) dr.cargo.water = dr.cargo.water || 0;
  },
};

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

/** True while a game the player started or continued is running (not the title-screen background game). */
export const autosaveOn = () => autosave;

/** File name for an exported save of the running game. */
export function saveFileName() {
  return `kestrel9-turn${G.turn}-seed${G.seed}.json`;
}

/** The stored save as text, for exporting it from the title screen. */
export function storedSaveText() {
  return readRaw();
}

/**
 * Load a save from an imported file, with the same checks as loading from storage, then store it.
 * @param {string} text
 * @returns {LoadResult}
 */
export function importSave(text) {
  const parsed = parseSave(text);
  if (!parsed.ok) return parsed;
  try {
    applySave(parsed.data);
  } catch (e) {
    return { ok: false, reason: 'the saved station could not be rebuilt' };
  }
  save();
  return { ok: true };
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
