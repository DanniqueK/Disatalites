# KESTREL-9: Orbital Ward - game documentation

This document describes the features of the game and how the code behind them works. `index.html` holds the markup, `src/style.css` the styles, and `src/` the game as native ES modules (entry point `src/main.js`). There is no build step and no dependency. The Share Tech Mono font (SIL Open Font License) is bundled in `assets/fonts/`.

- [Feature overview](#feature-overview)
- [Views](#views)
- [Gameplay systems](#gameplay-systems)
- [Controls](#controls)
- [Code architecture](#code-architecture)
- [Data tables](#data-tables)
- [Turn pipeline](#turn-pipeline)
- [Rendering](#rendering)
- [UI and input](#ui-and-input)
- [Save system](#save-system)
- [Known quirks](#known-quirks)

## Feature overview

KESTREL-9 is a turn-based roguelike. You wake up on a broken orbital station above a post-apocalyptic Earth and take it back one section at a time. You then grow the station, run drones outside, subdue foreign stations, and shape which surface faction wins the coming Accord.

Main features:

- **Two starts**: a misfiring clone pod (70 body, you can be re-grown on death) or cryo (100 body, worn pistol and armor, one life).
- **Hallway station**: 3-wide hallways and a central junction hub, with standard-size rooms (one job each) docked only onto hallway doors. Rooms come from seven makers (brands) with their own colours and wall pattern. The generator keeps the station compact.
- **Section claiming**: each section runs its own Grid Node. Until you repair and claim it, the section gets no power or air and its machines refuse you.
- **Power, air and survival**: a power bus with junction boxes, generators, batteries and brownouts. Pressure per section, hull breaches, suit O2, nutrition and rations.
- **Machines**: repair, switch on and off, use, uninstall into kits, or strip for parts. Large built-in fixtures, and small gear you can place freely inside rooms.
- **Readable map**: rooms are colour coded by job (crew, power, life support, cargo, engineering, drones, signals, defense) and the ROOMS overlay shows what each room needs.
- **Gear and combat**: tool, weapon and suit slots, an inventory of 8, melee and ranged combat with hit chances, and damage spread over your body and every equipped part.
- **Drones**: Utility, Tug and Guard drones that salvage, fetch, patch, tow, detach, build, hack and fight.
- **Building outside**: a Utility drone builds hallway segments and junction hubs at free doors, constructs rooms from learned schematics on hallway doors, and seals or reopens doors.
- **Orbital map**: 32 sectors in LEO, MEO, GEO and HEO with junk fields, foreign, military and science stations, rogue AIs, legacy weapon platforms, drone graveyards and quiet orbits.
- **Sensors and stealth**: passive detection, loud active sweeps, focused scans, and a signature value that draws hunters and radar strikes. Silent running mode.
- **Hacking minigame**: an intrusion console with typed security layers (AUTH, FIREWALL, WATCHDOG, BLACK ICE, CORE) and a trace meter.
- **Crew and AI allies**: survivors from lifeboats join with a role, and AIs from hacked stations can be recruited for perks.
- **Earth politics**: four bunker factions with rivalries, reputation, requests, satellites, territory spread, IFF spoofing of legacy satellites, and an optional mass driver.
- **Storyteller**: a tension-based event director that paces incidents with rest periods and goes easier when you struggle.
- **Endings**: death (with clone re-grow if possible), the Accord at a deadline, or a faction hegemony.
- **Autosave** to `localStorage`.
- **Responsive layout** with a touch pad, HUD overlay and log tail on narrow or touch screens.

## Views

The map area has four tabs. Tabs other than STATION unlock as you progress.

| Tab      | Unlock                             | What it shows                                                                                                                                          |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| STATION  | always                             | The inside of KESTREL-9 from the player's view, with field of view and memory of seen tiles.                                                           |
| EXTERIOR | first drone activated              | Two maps: the HULL (your station and the build space around it) and LOCAL SPACE / other sectors (debris, wrecks, stations). Drones are commanded here. |
| ORBIT    | first drone activated              | A zoomable sensor chart around Earth with orbital rings, contacts and drone transfers.                                                                 |
| EARTH    | Comms Array online (first contact) | The surface map with faction territory, habitable land, legacy satellites, your satellites and requests.                                               |

The side panels change with the tab:

| Tab      | Top panel                              | Bottom panel                                     |
| -------- | -------------------------------------- | ------------------------------------------------ |
| STATION  | GEAR (slots and carried items)         | SECTIONS (crew, AI allies, machines per section) |
| EXTERIOR | DRONES (cards, recall, deploy)         | ORBIT (sector summary, stations, loose sections) |
| ORBIT    | SENSORS (ranges, lamps, sweep)         | CONTACTS (known and unknown sectors)             |
| EARTH    | FACTIONS (rep, territory, legacy sats) | REQUESTS                                         |

Always visible: LOG and COMBAT scroll panels, STATUS bars (body, suit O2, nutrition, battery, signature) with resources, and the current OBJECTIVE.

## Gameplay systems

### Station and sections

- The station is a list of sections (`G.mods`). Each has a function (`fn`, for example `power`, `life`, `workshop`, or the corridor pieces `hall` and `hub`; `tube` is an older name for a hallway), a brand, a shape, a rotation, an origin, pressure, port links, windows, breaches and a control flag (`ctl`).
- **Layout rules**: rooms use the standard sizes in `ROOM_SIZE` (S 5x5, M 7x5, L 7x7 floor; each `FN` has a size `sz` and grows a size if its machines do not fit) with a door centred on each long side. Corridor pieces (`isHall`) are 3 tiles wide: a `hall` segment runs 7 tiles with doors at both ends and one room door per side, a `hub` is a 3x3 junction. `fitsAt` refuses to dock a room onto another room. Machines are placed so every floor tile stays reachable with straight (4-way) moves.
- The starting station is a junction hub (section 0, the emergency power source) with the pod room plus rack room, power, storage, life support, workshop and hab rooms, sometimes hydroponics. `newGame` docks each room at the free hallway door closest to the centre and only adds a hallway segment when no room fits. Two rooms are "haywire": claiming them may wake hostile maintenance bots.
- Only the pod section is yours at the start. Each other section has a Grid Node (`N`) in a wall. Claiming costs 1 circuit and a number of turns, needs the node at 60% or better, and is refused while the section has a breach.
- A drone with an Interface Module can claim or reboot a node from outside.

### Machines

- Defined in `MD`. A machine runs when its condition is at least 60%, it is switched on, its section is controlled (with a few exceptions such as nodes and lockers) and, if it uses power, it is powered.
- **Fixtures** (`FX`) are large built-in machines (reactor, fabricator, scrubber, racks, and so on). They cannot move. You repair them or gut them for parts.
- **Small gear** (`SMALL`: storage rack, bunk, emergency scrubber, hull turret) can be uninstalled into a kit and installed on any free floor tile next to you (`world/placement.js`). `placeProblem` refuses hallways, rooms you do not control, rooms the gear does not belong in (`GEAR_ROOMS`: storage racks in Storage, Cargo and the Workshop, bunks in a Hab Module or Med Bay, emergency scrubbers anywhere), tiles next to a door, and anything that would cut the room's straight (4-way) walkway. Hull turrets go on an outer wall of the room. There are no mount pads or empty hardpoints.
- Repairs cost 2 scrap (plus 1 circuit for tech machines) and add the repair value of your best tool.
- Tech machines slowly wear while online.
- Notable machines: Fusion Reactor (+10 power), Solar Controller (+8), Battery Bank (+160 capacity), scrubbers (air capacity per floor tile), Clone Pod (re-grow), Drone Rack (3 drones each), Fabricator, Comms Array, Sensor Array, Launch Rail, Maintenance Dock (repair bot), Refinery (scrap to circuits), Hydroponics (rations), Med Pod, Point Defense, Hull Turret, Mass Driver, Ion Drive.

### Power and air

- `gridTick` floods power from generator sections (and the first section) through links. A section whose Junction Box is below 60% is cut off, and so is everything that is only reachable through it.
- `powerTick` adds up generation, sorts consumers by priority (`pri`), powers them from supply and then from the battery, and logs brownouts. It also computes the signature.
- `atmoTick` gives each controlled section pressure from scrubber capacity divided by the total controlled floor area. Breached sections lose 25 pressure per turn.
- `needsTick`: below 35% pressure your suit O2 drains (halved by a Hazard Liner). At 0 O2 you lose body. Nutrition drops over time, and you eat rations automatically when low.

### Gear and combat

- Items are defined in `IT`. Slots: tool (1), weapon (2), suit (2, up to 4 with Suit Hardpoints). Inventory holds 8.
- Enemies (`EN`): Feral Servitor, Scrap Crawler (moves twice), Boarder Drone (ranged), Bloom Horror.
- Melee uses the best melee-capable item. Ranged fire uses every equipped ranged weapon, costs ammo, and needs range and line of sight.
- Damage you take is spread by weighted coverage over your body and every equipped part. Parts can break.
- A Motion Scanner shows hostiles through walls within its range.

### Drones and exterior

- Drone types (`DT`): Utility (salvage, cargo 8, patch, build, hack, slow tow), Tug (fast tow, detach), Guard (combat).
- Drones come dormant from storage, wrecks, faction pods or the Fabricator, and are activated at a working Drone Rack (2 scrap, 1 circuit). They launch from the free port nearest their rack.
- Each drone has one task (`d.task.type`), handled in `droneAct`: `idle`, `goto`, `return`, `salvage`, `fetch`, `iface`, `park`, `scrap`, `scrapmod`, `build`, `seal`, `unseal`, `patch`, `tow`, `detach`, `deploy`, `attack`, `hack`.
- Travel between sectors takes time based on orbital distance. Towing is slower. Thrusters and a pilot crew member speed it up.
- Null pockets in drone graveyards destroy drones that drift into them. Known ones are avoided when pathing.

### Hull editing and structure

- **Corridor pieces**: tapping a free door opens a menu to build a hallway segment (one Hallway Kit from the Fabricator, or 10 scrap and 1 circuit) or a junction hub (8 scrap, 1 circuit). The drone uses the `build` task with `piece: 'hall' | 'hub'`, and the piece docks through `fitsAt` like any other section. Corridor pieces may also start from a room's back door.
- **Construct**: build a section shell from a learned hull schematic. Scrapping a section at the station (or with a Survey Scanner in the field) teaches its hull and small-machine schematics.
- **Seal and reopen**: weld a free door shut (`doSeal`), or cut a sealed door open again (`doUnseal`, the `unseal` task). New doors cannot be cut into walls: rooms and corridor pieces have fixed, standard doors.
- **Detach and redock**: a Tug can unbolt a section (`canDetach` checks you are not inside it, it is not your only rack, it does not split the station, and it faces open space) and tow it to any port it fits.

### Orbit, sensors and signature

- `initSectors` creates sectors per ring and picks a MEO sector as home. It places 6 weapon platforms and 3 rogue AIs, and fills the rest from a pool of junk fields, stations, military and science stations, graveyards and quiet orbits. The nearest sector is known and the next three become unknown contacts.
- `genSectors` populates each sector with objects: debris, wrecks, stations (via `genStation`), rogue swarms, rafts (lifeboats), legacy platforms and null pockets. The home sector gets a calm supply depot and a utility drone wreck. One known neighbour always gets a civil station with a Comms Array.
- Detection levels (`det`): 0 unknown, 1 contact (fuzzy position), 2 identified.
- Passive sensors find loud sectors over time. An active sweep (8 battery, 30 turn cooldown) finds everything in range but may wake legacy platforms (which then fire kinetic strikes) and rogue AIs (which send hunters). A focused scan identifies one contact over several turns and keeps you loud.
- **Signature** (`G.sig`) comes from power draw, drones outside, comms, station movement, fabrication, focused scans and a decaying "hot" value from gunfire and sweeps. High signature raises the chance of hunters and radar strikes. Silent running switches off non-essential machines.

### Foreign stations and hacking

- Stations (`STN` kinds: civil, science, military, rogue) have a security level, turrets, a security core and an AI with a perk.
- **Hack**: a Utility drone next to the station opens the intrusion console. Layers are generated per security level, and the last one is the CORE. Commands: probe (identify the layer, doubles the next brute force), spoof handshake (1 circuit, opens AUTH), brute force, inject worm (1 circuit, strong against FIREWALL), go dark (lowers trace). WATCHDOG raises trace each turn, BLACK ICE damages the drone on brute force. At 100% trace the link burns and the station goes to alert. Rogue AI cores can take over the hacking drone.
- **Force**: Guard drones destroy turrets and the core. About a third of the sections break into debris.
- A subdued station's sections can be towed home. Hacked stations may free prisoners and offer their AI to recruit (perk ally) or wipe (schematic and circuits).

### Crew and allies

- Crew come from lifeboats. Roles (`ROLE`): engineer (walks to and fixes breaches and machines using scrap), pilot, hacker, medic, gunner, botanist. Non-engineers walk to their workstation and only give their bonus while on duty there.
- Crew eat rations. Starving crew stop working and eventually leave.
- AI allies (`PERK`): forge, grid, warden, mender, lantern, cipher.

### Earth and factions

- The surface is a 64 x 28 grid built from land blobs (`BLOBS`) with noise-based habitability. Four factions (`FAC`) start at their homes. `RIVALS` defines three rivalries.
- First contact happens when a Comms Array comes online. It unlocks the EARTH tab and the remaining satellite schematics, and sets the Accord deadline to 4500 turns later.
- Factions send requests: put a satellite over a cell, relay traffic, survey a rival (needs a Sensor Array), launch cargo (needs a Launch Rail), or spoof a legacy satellite. Completing one raises rep with that faction and may lower it with its rivals, and sends a supply pod. Trust at 30 rep unlocks blueprints.
- `territoryTick` spreads factions into habitable cells. Rival borders are contested by power plus nearby RECON and COMMS satellites. WEATHER satellites heal dead land.
- `legacyTick` moves the six legacy satellites. They strike settlements and shoot down satellites of anyone not in their IFF tags.
- IFF spoofing (6 circuits, 30 turns) adds a faction or KESTREL-9 to a legacy satellite's tags. A failed spoof damages your Comms Array.
- Factions at -40 rep or lower sabotage you with hacked drones, boarders or comms jamming.
- Mass driver strikes (15 ammo) erase up to 3 border cells of a faction.

### Storyteller

`directorTick` keeps a tension value that grows with station size, time and signature. After a rest period it may pick an incident from `INC`, weighted by tension, by how recently that incident fired and by whether you are struggling (major incidents are damped when you are low on body, scrap or rations). Major incidents reduce tension more and give a longer rest.

Incidents: hunters, legacy radar sweep, rogue drones, micrometeoroids, solar flare, machine fault, vermin, bloom horror, haunting (lore or a mystery crate), lifeboat ping, beacon signal, drifting wreck, debris cloud, supply cache.

### Objectives and endings

- `OBJ` is a linear list of 18 objectives that acts as a tutorial and progression guide. Each completed objective gives +4 scrap and +2 circuits. The last one ("Shape the balance of power") never completes.
- **Death**: on the clone start, a working Clone Pod and 2 rations re-grow you. Your gear stays where you fell. Otherwise the run ends.
- **Accord**: at the deadline, `endGame('accord')` picks an ending from territory shares: a faction ASCENDANT (50% or more), COLD ORBIT (two rivals within 10%), or THE ACCORD HOLDS.
- **Hegemony**: ends early once 24 or more cells are settled and one faction holds 70% or more.

## Controls

| Context                | Input                                                                | Action                                                       |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------ |
| Station                | WASD (two keys for diagonals), arrows, numpad, vi keys (`hjkl yubn`) | Move or bump-attack                                          |
| Station                | Click or tap a tile                                                  | Walk there (auto-path), or use an adjacent machine or breach |
| Station                | `U`                                                                  | Use an adjacent machine or breach                            |
| Station                | `.` or Space, Numpad 5                                               | Wait 1 turn                                                  |
| Station                | `R`                                                                  | Wait 10 turns                                                |
| Station                | `F` / Tab                                                            | Fire / cycle target                                          |
| Station                | `G` or `,`                                                           | Pick up                                                      |
| Station                | `E`                                                                  | Eat                                                          |
| Station                | `V`                                                                  | ROOMS overlay on / off                                       |
| Station                | `1`-`8`                                                              | Open carried item                                            |
| Exterior               | Click or tap                                                         | Select a drone, then command it on the target                |
| Exterior               | Drag, WASD, arrows                                                   | Pan                                                          |
| Exterior               | Wheel, `+`, `-`                                                      | Zoom                                                         |
| Exterior               | Tab                                                                  | Next drone                                                   |
| Exterior, Orbit, Earth | `.` or Space / `w`                                                   | Wait 1 / wait 10                                             |
| Orbit, Earth           | Wheel, drag                                                          | Zoom and pan                                                 |
| Any                    | `z` / `x` / `o` / `c`                                                | Station / Exterior / Orbit / Earth tab                       |
| Any                    | `t`                                                                  | Cycle labels (see-through, faint, off)                       |
| Any                    | `L` (Shift+L)                                                        | Full log                                                     |
| Any                    | `?` or `/`                                                           | Help                                                         |
| Modal                  | `1`-`9` / Esc                                                        | Pick a button / close                                        |

Dangerous modal actions (for example strip, uninstall, detach, scrap, seal, disconnect) sit behind a "service hatch" cover and need an 800 ms press and hold to confirm.

On touch or narrow screens there is an on-screen d-pad and action buttons, a HUD overlay on the map and a 3-line log tail (tap it for the full log).

## Code architecture

The game is split into ES modules under `src/`, and every module imports what it uses explicitly. Shared mutable state lives in `src/core/state.js` (see [State](#state)).

### Layers

The code is split into a **game core** that knows nothing about the browser, and a **front end** on top of it.

| Layer   | Folders                             | May import           | Notes                                                                                 |
| ------- | ----------------------------------- | -------------------- | ------------------------------------------------------------------------------------- |
| Core    | `core/`, `world/`, `space/`, `sim/` | only other core code | Game state, data and rules. Runs headless in Node (the tests play hundreds of turns). |
| Actions | `actions/`                          | core, `ui/`          | Player commands and their menus: they change state through the core and open dialogs. |
| UI      | `ui/`                               | core, `actions/`     | Canvas rendering, side panels, dialogs, title and help.                               |
| Entry   | `main.js`                           | everything           | Input handling and boot.                                                              |

ESLint enforces the core boundary: core files cannot import from `ui/`, `actions/` or `main.js`, and only have plain JavaScript globals (no `document`, `window` or `localStorage`). When the core needs the UI to react, it **emits an event** from `core/events.js`. `ui/app.js` subscribes and does the browser work:

| Event     | Payload       | Emitted when                                 | UI reaction                                                                   |
| --------- | ------------- | -------------------------------------------- | ----------------------------------------------------------------------------- |
| `changed` |               | `refresh()`: state changed after an action   | Reopen the hack console if needed, redraw panels and map, show queued dialogs |
| `fx`      | effect object | `addFx`: tracer, explosion                   | Timestamp it and run the animation loop                                       |
| `hurt`    |               | The player took damage                       | Flash the map red                                                             |
| `sweep`   | `{ R }`       | Active sensor sweep                          | Draw the sweep ring on ORBIT                                                  |
| `strike`  | `{ x, y }`    | A legacy satellite or mass driver hits Earth | Strike animation on EARTH                                                     |
| `tab`     | view name     | A dialog button asks to switch views         | `setTab`                                                                      |
| `title`   |               | "New game" after death or an ending          | Title screen                                                                  |

New features that react to the game (sound, achievements, statistics) should subscribe to these events instead of being called from the core.

**Randomness.** Every random roll in the core goes through `random()` in `core/rng.js`, whose state is saved in `G`. The same seed and the same player actions give the same run, a loaded save continues the same stream, and tests can pin a seed (`newGame(start, seed)`). ESLint forbids `Math.random` in the core. Purely visual randomness (sparks, the star field, render flicker) uses `fxRandom()` or `Math.random` in `ui/` so redrawing never changes the game. The seed is shown at the bottom of the help screen.

Messages to the player also live in the core (`core/messages.js`): `log` and `cmb` append to `G.log` / `G.cmb`, and `queueModal` queues a dialog in `V.modalQ`, which the UI shows when nothing else is open. Whether a dialog is open is `V.modalOpen`.

### Modules

| Module                            | Responsibility                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core/constants.js`               | World size (`WW` x `WH` = 144 x 100), tile types `T`, `SAVE_VERSION`.                                                                                                                                                                                                                                                                                                                                  |
| `core/data.js`                    | All data tables (see below) plus the item helper `mk`.                                                                                                                                                                                                                                                                                                                                                 |
| `core/state.js`                   | `G`, `P`, `M`, `V` and `setG` / `setP`.                                                                                                                                                                                                                                                                                                                                                                |
| `core/rng.js`                     | Seeded game randomness: `random()` (mulberry32, state in `G.rng`, seed in `G.seed`), `newSeed`, and `fxRandom` for visuals only.                                                                                                                                                                                                                                                                       |
| `core/events.js`                  | `on` / `emit`, the only way the core talks to the UI.                                                                                                                                                                                                                                                                                                                                                  |
| `core/messages.js`                | `log`, `cmb`, `queueModal`.                                                                                                                                                                                                                                                                                                                                                                            |
| `core/save.js`                    | Autosave, load, save versions and migrations (see [Save system](#save-system)).                                                                                                                                                                                                                                                                                                                        |
| `core/types.js`                   | Shared JSDoc types (`ModalButton`, `LogLine`).                                                                                                                                                                                                                                                                                                                                                         |
| `core/util.js`                    | Small helpers: random (`rnd`, `rr`, `pick`, `shuffle`, `pickW`), `clamp`, `idx`, `cheb` (Chebyshev distance), `esc` (HTML escape).                                                                                                                                                                                                                                                                     |
| `world/shapes.js`                 | Standard shapes: `roomShape(size)` and `hallShape(kind)`. Rotation helpers (`rotDims`, `rotP`, `rotD`, `toWorld`, `toLocal`).                                                                                                                                                                                                                                                                          |
| `world/packs.js`                  | A "pack" is a portable section: shape plus machines, crates, items, actors and breaches in local coordinates. `makePack` places fixtures (keeping the floor connected via `shapeFloodOk`), the grid node, terminal, junction box, small gear allowed in the room, hull turrets and windows. `fillDerelict` adds loot and enemies.                                                                      |
| `world/build.js`                  | `rebuildMap` rasterises all sections into `M.map` (tile types), `M.own` (owner section) and `M.room` (floor owner), places breaches and machines, and finds rack hatches. `fitsAt` (rooms only onto corridor pieces) and `dockPack` attach a pack to a free port. `packModule` turns a docked section back into a pack. Also doors (`doSeal`, `doUnseal`, `sealedDoorAt`), `hullNear` and `canDetach`. |
| `world/control.js`                | Section control: `claimDone`, `lockdown` (haywire sections waking their bots), `modBreaches`.                                                                                                                                                                                                                                                                                                          |
| `world/salvage.js`                | `scrapValue` of a section and `learnFrom` (schematics from scrapped sections).                                                                                                                                                                                                                                                                                                                         |
| `world/machines.js`               | `online`, `machineStatus`, `addStock`, `caps` (storage caps from lockers), item dropping, `droneCap`.                                                                                                                                                                                                                                                                                                  |
| `world/placement.js`              | Free placement of small gear: `placeProblem` (the rules), `placeGear`, `removeMachine`.                                                                                                                                                                                                                                                                                                                |
| `world/rooms.js`                  | `roomStatus(mi)`: a room's category, colour, air and problems, for the ROOMS overlay.                                                                                                                                                                                                                                                                                                                  |
| `world/new-game.js`               | `newGame(start)` builds `G` and `P`, the starting station, loot, breaches, sectors, Earth and the intro log.                                                                                                                                                                                                                                                                                           |
| `world/fov.js`                    | Ray-cast field of view (radius 12), line of sight, BFS helpers, pressure lookup.                                                                                                                                                                                                                                                                                                                       |
| `space/exterior-objects.js`       | Spawners for debris, derelicts, wrecks, pods and rogues in local space, `spawnDrone`, and `derHit` (hit test for loose sections).                                                                                                                                                                                                                                                                      |
| `space/sectors.js`                | Sector generation, `genStation`, the intrusion console rules (`hackInit`, `hackTurn`), `subdueStation`, sight (`updateSight`), crew AI (`crewTick`, `crewPath`, `engTarget`), allies, home relocation, sensors (`sensorTick`, `activeSweep`, `startFocus`) and drone transfers.                                                                                                                        |
| `space/earth.js`                  | Land generation, faction territory, `territoryTick`, `legacyTick`.                                                                                                                                                                                                                                                                                                                                     |
| `sim/turn.js`                     | `endTurn`, `waitN`, `refresh`, `canAct`, the per-turn ticks (see [Turn pipeline](#turn-pipeline)) and `fabDone`.                                                                                                                                                                                                                                                                                       |
| `sim/stats.js`                    | `stats` (derived from gear), `hurtPlayer`, actor damage and death, `addFx`.                                                                                                                                                                                                                                                                                                                            |
| `sim/storyteller.js`              | `INC` incident list and `directorTick`.                                                                                                                                                                                                                                                                                                                                                                |
| `sim/exterior-tick.js`            | Drone pathing (`extNext`, `moveTo`), `droneAct`, rogue and swarm AI, turrets and point defense, `extTick`.                                                                                                                                                                                                                                                                                             |
| `sim/earth-tick.js`               | First contact, request generation and completion, reputation, sabotage, IFF spoof resolution, satellite release.                                                                                                                                                                                                                                                                                       |
| `sim/end.js`                      | `playerDied`, `endGame`.                                                                                                                                                                                                                                                                                                                                                                               |
| `actions/player.js`               | Moving, melee, firing, pickup, eating, item and part menus, machine, node, install, patch and fabricator menus, claiming, silent running, satellite deployment.                                                                                                                                                                                                                                        |
| `actions/exterior.js`             | `extTap` dispatches a tap in the exterior to the right drone command or menu. Tow, door (corridor pieces, construct, seal), interface and station menus.                                                                                                                                                                                                                                               |
| `actions/hack.js`                 | The intrusion console dialog (`hackConsole`) and its commands.                                                                                                                                                                                                                                                                                                                                         |
| `actions/earth.js`                | Survey, cargo launch, spoof and mass driver menus.                                                                                                                                                                                                                                                                                                                                                     |
| `ui/app.js`                       | `installUi`: subscribes the UI to core events.                                                                                                                                                                                                                                                                                                                                                         |
| `ui/settings.js`, `ui/palette.js` | Display settings and the status colour palette.                                                                                                                                                                                                                                                                                                                                                        |
| `ui/dom.js`                       | `$` (querySelector).                                                                                                                                                                                                                                                                                                                                                                                   |
| `ui/log-modal.js`                 | `showModal` (buttons, number hotkeys, danger hatch, hold-to-confirm), `flushModals`, `machinePlate`, `showLog`.                                                                                                                                                                                                                                                                                        |
| `ui/render.js`                    | Canvas drawing for all four views, fixture art, labels and effects.                                                                                                                                                                                                                                                                                                                                    |
| `ui/panels.js`                    | Side panels and pad per tab (`updateUI`, `uiStation`, `uiExt`, `uiOrbit`, `uiEarth`, `renderPad`), `padAction`, `setTab`.                                                                                                                                                                                                                                                                              |
| `ui/help-title.js`                | Help text, title screen, new game start and the "save not loaded" dialog.                                                                                                                                                                                                                                                                                                                              |
| `main.js`                         | Click-to-travel, keyboard, pointer (tap, drag, wheel zoom) and resize handling, then boot.                                                                                                                                                                                                                                                                                                             |

### State

All four live in `src/core/state.js`. `G` and `P` are replaced on new game and load, so other modules change them through `setG` and `setP`. ES module imports are live bindings, so every reader sees the current object.

- `G`: the whole game state (turn, sections, machines, items, crates, actors, stock, exterior objects and drones, sectors, stations, factions, requests, Earth grids, timers, stats, log). It is plain JSON so it can be saved.
- `P`: the player (position, body, O2, nutrition, equipped slots, slot caps, inventory).
- `M`: derived, non-saved caches (`map`, `own`, `room`, visibility `vis`, machine lookup `mat`, land and star fields, orbit region grid). Rebuilt by `rebuildMap`, `initLand`, `initStars` and `buildRegions`.
- `V`: view state (current tab, cameras and zoom per view, selection, label mode, effects, modal queue and `modalOpen`, open hack console).

Exterior objects in `G.ext.objs` share one list and are told apart by `kind`: `debris`, `der` (a loose or station section holding a pack), `wreck`, `pod`, `raft`, `rogue`, `turret`, `core`, `sci`, `platform`, `null`. Each has a `sec` (sector id, `HULL` = 999 for the build space, or -1 while in transit).

## Data tables

| Table                            | Contents                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `BR`                             | Brands: name, country code, colours, floor glyph, wall pattern.                                      |
| `MD`                             | Machine definitions: name, glyph, colour, power use or generation, priority, tech flag, description. |
| `MC`                             | Machine material values used for kits, stripping, scrapping and build costs.                         |
| `FX`                             | Fixture placement rules (wall-backed or free-standing, candidate sizes).                             |
| `FN`, `ROOM_SIZE`, `isHall`      | Section functions (machines, standard size, corridor flag) and the standard room footprints.         |
| `DPOOL`                          | Weights for which derelict sections spawn.                                                           |
| `DT`                             | Drone types.                                                                                         |
| `IT`                             | Items (built from `IT0` plus generated kits).                                                        |
| `EN`                             | Enemies.                                                                                             |
| `RC`                             | Fabricator recipes (scrap, circuits, turns).                                                         |
| `RINGS`                          | Orbital bands with radii, altitude ranges and sector counts.                                         |
| `SEC_T`                          | Sector types with glyph, colour and description.                                                     |
| `STN`                            | Foreign station kinds: functions, security range, turrets, names.                                    |
| `PERK`, `AIN`, `AILINES`         | AI ally perks, names and lines.                                                                      |
| `ROLE`, `CREWN`, `CREWS`, `CHAT` | Crew roles, names and chatter.                                                                       |
| `FAC`, `RIVALS`                  | Factions and rivalries.                                                                              |
| `LEGACY`                         | The six legacy defense satellites.                                                                   |
| `ANCH`, `BLOBS`                  | Named Earth regions and continent ellipses.                                                          |
| `LORE`                           | Terminal log texts.                                                                                  |
| `OBJ`                            | Objectives with completion checks.                                                                   |
| `INC`                            | Storyteller incidents.                                                                               |
| `HK`                             | Intrusion layer types.                                                                               |

## Turn pipeline

Every action that takes time calls `endTurn()`, which runs, in order:

1. `powerTick` (grid flood, generation, battery, signature)
2. `atmoTick` (pressure per section)
3. `needsTick` (O2, nutrition)
4. `machineTick` (wear, hydroponics, refinery, med recharge, first contact, maintenance bot spawn, fabricator progress)
5. `botTick` (maintenance bot)
6. `crewTick`
7. `allyTick`
8. `hostileTick` (station enemies chase via a BFS distance map)
9. `extTick` (sensors, sight, station move, drones, rogues, turrets, point defense, foreign defenses)
10. `directorTick` (storyteller)
11. `earthTick` (requests, survey, spoof, legacy reveal, territory and legacy every 50 turns, end checks)
12. `objTick`

Then it recomputes field of view, handles death, emits `changed` so the UI redraws (unless running quietly inside a multi-turn loop) and autosaves every 20 turns.

Multi-turn actions (wait, repair until done, rest, claim) call `endTurn(true)` in a loop and stop early on interrupts: `G.intr` is set by any `bad` or `warn` log line, new visible hostiles, a modal, or game over.

## Rendering

- One `<canvas>` sized to the map area with device pixel ratio scaling. `render()` dispatches to `renderStation`, `renderExt`, `renderOrbit` or `renderEarth`, then `drawFx` for tracers and explosions.
- **Station**: tile glyphs with brand-specific wall patterns, pressure-tinted floors, a faint floor tint per room category (`ROOM_CAT`) in rooms you control, room names at each room centre, dimmed remembered tiles, and procedurally drawn fixture art (`FXART`) rotated to face their backing wall. Animated fixtures re-render every 160 ms.
- **ROOMS overlay** (`V`, `V.rooms`): fills every seen room with its category colour and draws a box with its name, its two most urgent problems from `roomStatus` (`world/rooms.js`: locked, breaches, low air, off the power bus, main machine missing, broken or offline) and its air pressure.
- **Exterior**: the station is drawn as tiles when zoomed in or as coloured blocks when zoomed out (`extTile`). Also drawn: free port highlights, objects, drones with task lines, and an Earth limb in the background.
- **Orbit**: a rotating ASCII Earth projected from the surface map, ring boundaries, sensor envelopes, contacts (pulsing `?` for unknown ones), threat lines and drone transfers.
- **Earth**: an equirectangular glyph map with territory, legacy strike boxes, satellites, blinking request targets and strike animations.
- `drawLabels` places callout labels around targets and avoids overlaps.
- `kick()` runs a `requestAnimationFrame` loop while effects are active. Orbit and Earth re-render every 400 ms.

## UI and input

- `updateUI` rebuilds the status bars, resources, objective, tab-specific side panels, log panels, HUD and pad from state on every refresh.
- Side panel clicks are delegated through `data-*` attributes (`data-a` pad actions, `data-m` machines, `data-d` drones, `data-sec` sectors, `data-rq` requests, and so on).
- Canvas pointer events tell a tap from a drag (10 px threshold). A tap goes to `stationTap`, `extTap`, `orbitTapAt` or the Earth cell description.
- WASD keys are buffered for 45 ms so two held keys make a diagonal step.
- **Settings** (title and help screens, `ui/settings.js`): text size (zooms panels and dialogs, not the map canvas, so tapping the map stays accurate), map tile size in the STATION view, reduced motion (no animated machines, hurt flash, effects, sweep or strike animations, pulsing or CSS animations), status colours (`ui/palette.js`: standard green / amber / red, or colourblind-safe blue / yellow / orange from the Okabe-Ito palette), and label mode. Stored in `localStorage` under `kestrel9.settings`, separately from the save.

## Save system

- `save()` writes `{G, P}` as JSON to `localStorage` key `kestrel9.save` every 20 turns and when the tab is hidden. Saves from older builds under `k9save9` are still read, and moved to the new key on the next save.
- Autosave only runs after the player starts or continues a game (`setAutosave`). The title screen runs on a throwaway background game, and saving that would overwrite the real save.
- If saving fails (storage full or blocked), the log warns once that progress is not being kept, and once more when saving works again.
- `G.v` is the save format version, `SAVE_VERSION` in `core/constants.js`. When the format changes, bump it and add a migration to `MIGRATIONS` in `core/save.js` that upgrades the previous version by one step. `parseSave` runs the chain on load, and rejects saves that are corrupt, too old to convert, or from a newer build, with a reason.
- `loadSave()` returns `{ ok, reason }`. The title screen shows the reason in a "SAVE NOT LOADED" dialog instead of silently starting a new game, and the save is left untouched.
- `applySave` rebuilds the derived caches (`initLand`, `initStars`, `buildRegions`, `rebuildMap`, `fov`).
- The save is cleared on game over.
- **Save files**: the help screen has \"Export save file\" while a game runs (`saveFileName`: `kestrel9-turn<N>-seed<S>.json`). The title screen can import a file (`importSave`: the same checks and migrations as a normal load, then it is stored) and export the stored save as it is (`storedSaveText`), even one this build cannot load.
- `setStorage` swaps the storage backend; the tests use an in-memory one.

## Known quirks

None at the moment. Report new ones as GitHub issues, with the run seed from the help screen.
