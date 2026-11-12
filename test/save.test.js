import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SAVE_VERSION } from '../src/core/constants.js';
import {
  hasSave,
  loadSave,
  MIGRATIONS,
  parseSave,
  save,
  SAVE_KEY,
  serialize,
  setAutosave,
  setStorage,
} from '../src/core/save.js';
import { G, P } from '../src/core/state.js';
import { endTurn } from '../src/sim/turn.js';
import { newGame } from '../src/world/new-game.js';

function memoryStorage() {
  const m = new Map();
  return {
    m,
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: k => void m.delete(k),
  };
}

let store;
const realMigrations = { ...MIGRATIONS };
beforeEach(() => {
  store = memoryStorage();
  setStorage(store);
  newGame('clone');
  setAutosave(true);
});
afterEach(() => {
  for (const k of Object.keys(MIGRATIONS)) delete MIGRATIONS[k];
  Object.assign(MIGRATIONS, realMigrations);
});

describe('save and load', () => {
  it('round-trips the game and rebuilds derived state', () => {
    for (let i = 0; i < 25; i++) endTurn(true);
    const before = serialize();
    expect(save()).toBe(true);
    newGame('cryo');
    expect(loadSave()).toEqual({ ok: true });
    expect(serialize()).toBe(before);
    endTurn(true);
    expect(G.turn).toBe(26);
  });

  it('does not autosave the background game behind the title screen', () => {
    setAutosave(false);
    expect(save()).toBe(false);
    expect(hasSave()).toBe(false);
  });

  it('reads the old k9save9 key and moves it to the new key on the next save', () => {
    store.setItem('k9save9', serialize());
    expect(hasSave()).toBe(true);
    expect(loadSave().ok).toBe(true);
    save();
    expect(store.getItem('k9save9')).toBeNull();
    expect(store.getItem(SAVE_KEY)).not.toBeNull();
  });

  it('runs migrations in order up to the current version', () => {
    const data = JSON.parse(serialize());
    data.G.v = SAVE_VERSION - 2;
    MIGRATIONS[SAVE_VERSION - 2] = d => (d.G.a = 1);
    MIGRATIONS[SAVE_VERSION - 1] = d => (d.G.b = d.G.a + 1);
    const res = parseSave(JSON.stringify(data));
    expect(res.ok).toBe(true);
    expect(res.data.G.v).toBe(SAVE_VERSION);
    expect(res.data.G.b).toBe(2);
  });

  it('gives v9 saves (before the seeded RNG) a seed', () => {
    const data = JSON.parse(serialize());
    data.G.v = 9;
    delete data.G.seed;
    delete data.G.rng;
    const res = parseSave(JSON.stringify(data));
    expect(res.ok).toBe(true);
    expect(res.data.G.seed).toBeTypeOf('number');
    expect(res.data.G.rng).toBe(res.data.G.seed);
  });

  it.each([
    ['{"G":', 'corrupt'],
    ['{"x":1}', 'not a KESTREL-9 save'],
  ])('rejects %s with a reason', (text, reason) => {
    const res = parseSave(text);
    expect(res.ok).toBe(false);
    expect(res.reason).toContain(reason);
  });

  it('rejects saves that are too old or too new', () => {
    const data = JSON.parse(serialize());
    data.G.v = SAVE_VERSION + 1;
    expect(parseSave(JSON.stringify(data)).reason).toContain('newer version');
    data.G.v = 8;
    expect(parseSave(JSON.stringify(data)).reason).toContain('too old');
  });

  it('warns once when saving fails and once when it recovers', () => {
    let fail = true;
    setStorage({
      ...store,
      setItem: (k, v) => {
        if (fail) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
        store.setItem(k, v);
      },
    });
    const warnings = () => G.log.filter(l => /Autosave/.test(l.m)).map(l => l.m);
    expect(save()).toBe(false);
    expect(save()).toBe(false);
    expect(warnings()).toEqual([expect.stringContaining('storage is full')]);
    fail = false;
    expect(save()).toBe(true);
    expect(warnings()).toHaveLength(2);
    expect(warnings()[1]).toContain('working again');
  });

  it('keeps the player in the save', () => {
    P.hp = 33;
    save();
    P.hp = 70;
    loadSave();
    expect(P.hp).toBe(33);
  });
});
