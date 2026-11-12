/* =========================================================
   KESTREL-9 v4
   Design notes (from research):
   - The station is a frame of 3-wide hallways. Standard-size rooms, one job each, dock
     onto hallway doors; unused doors stay as hatches to space (see #33).
   - Each maker brand has its own colours and wall pattern, not its own shapes.
   - A storyteller (tension curve + weighted incidents + rest periods) paces events.
   - Power is scarce like FTL: systems need both condition and power.
   - Early resources are scarce and mostly sit in Storage; salvage drives growth.
   ========================================================= */
export const WW = 144,
  WH = 100,
  EGW = 64,
  EGH = 28;
export const T = { VOID: 0, FLOOR: 1, WALL: 2, DOOR: 3, PORT: 4, BREACH: 5, WINDOW: 6, MACH: 7 };
export const WALK = new Set([T.FLOOR, T.DOOR]);
export const OPQ = new Set([T.WALL, T.PORT]);
/** Version of the saved game format (`G.v`). Bump it and add a migration in core/save.js when the format changes. */
export const SAVE_VERSION = 13;
