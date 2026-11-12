import { OBJ } from '../core/data.js';
import { log } from '../core/messages.js';
import { hasSave, loadSave, setAutosave } from '../core/save.js';
import { G, V } from '../core/state.js';
import { refresh } from '../sim/turn.js';
import { HULL } from '../space/sectors.js';
import { modalBtns, showModal } from './log-modal.js';
import { newGame } from '../world/new-game.js';

export function showHelp() {
  showModal(
    'HOW TO PLAY',
    `You wake alone in a tiny, half-dead cluster of modules over a ruined Earth. KESTREL-9 was always a patchwork of sections from different countries and companies. Rebuild it, grow it, and decide which surface power gets the sky.

STATION view (inside, you):
 Move with WASD (hold two keys, like W+D, for diagonals), arrows, numpad, vi keys (hjkl yubn) or the pad. R waits 10 turns. Tap a tile to walk there.
 Every section runs its own maker's grid. Only your pod section knows you at first. Find each section's Grid Node (N), repair it, and claim it (1 circuit and a few turns). Until then the section gets no power or air and its machines refuse you. Some nodes wake old maintenance bots when you claim them.
 Click a machine (or stand next to it and press U) to repair, switch, or use it. Any machine can also be stripped for parts, even in a locked section, so you can always get scrap. Repairs cost scrap and circuits. Machines need 60% condition and power to run.
 Every room has one job, and its main machine (reactor, fabricator, scrubber, vats, racks...) is a large fixture built into it. Fixtures cannot be moved: repair them, or gut them for parts (they drop to 0% and can be rebuilt with repairs). Small gear (storage racks, bunks, emergency scrubbers, turrets) can be uninstalled into a kit and installed again on any free floor tile of a room where it belongs: storage racks in Storage, Cargo or the Workshop, bunks in a Hab Module or Med Bay, emergency scrubbers anywhere. Doorways and the walkway through a room always stay clear.
 Junction Boxes (J) carry power between sections. A broken one cuts that section and everything past it off the bus.
 Hull Turret kits go on any outer wall of a room. Turrets need power and use 1 ammo per shot from storage; Storage Racks raise the ammo cap.
 Crew go to work by themselves: engineers fix things (using scrap), others staff their station (pilot: Drone Rack or Ion Drive, hacker: Comms or terminal, medic: Med Pod, gunner: turrets, botanist: hydroponics). Their bonus only counts while they are on duty. They avoid vacuum, except engineers.
 Click a red x (hull breach) to patch it. Low pressure drains your suit O2. Scrubbers have a capacity: a bigger station needs more air.
 $ crates hold resources. G picks up gear and dormant drones. F fires, TAB targets. Shift+L opens the full log (plain L is a vi move key here).

EXTERIOR view (drones). It has two maps: the HULL (your station and the space right around it, where you build) and LOCAL SPACE (the region around you: debris, wrecks, stations). Drones fly between them in a couple of turns; tap KESTREL-9 in local space to send a drone back.
 HULL EDITING (Utility drone): tap a free port to weld on a prefab connector (collar, straight tube, long spine, elbow, T-junction, cross, node hub), to lay a tube along any clear route (to open space, or to another free port to make a loop), to construct a section from a hull schematic, or to seal it. Tap an outer wall to cut a new port.
 LAYOUT: KESTREL-9 is built around 3-wide hallways and a central junction hub. Rooms are standard sizes and only dock onto hallway doors, never onto each other, so you can always walk the station along its corridors. A Connector Tube kit from the Fabricator adds another hallway segment.
 SENSORS (ORBIT tab): space starts unknown. Passive sensors slowly pick up loud things nearby. ACTIVE SWEEP finds every contact in range but tells everything in range where you are: dormant platforms may lock on and fire, rogue AIs may send hunters. Unknown contacts (?) can be identified with a focused scan (needs a Sensor Array or Comms Array, keeps you loud for a while) or by sending a drone.
 HACKING: a Utility drone at a foreign station opens the INTRUSION console. Each security layer has a type: AUTH (spoof a handshake), FIREWALL (inject a worm), WATCHDOG (raises trace while you sit on it), BLACK ICE (burns the drone on brute force). Probe to identify a layer and double your next brute force. At 100% trace the link burns and the station wakes up. You can also let the drone run its own script.
 SCRAPPING: tow a loose section to the hull yard (or detach one of yours) and scrap it there: materials plus its hull and machine schematics. Scrapping out in the field only gives salvage, unless the drone carries a Survey Scanner (Fabricator).
 Drones: Utility (salvage, fetch, patch, tubes, slow towing), Tug (fast towing, detach sections), Guard (fights rogues).
 Get drones by recovering wrecks, finding dormant ones, or building them at a Fabricator. Activate them at a Drone Rack.
 Nothing is known at first: sensors only see a little way past your hull. Send drones out to find what is there.
 Other stations sit in orbit, each built by a single maker, each with a security core and turrets. Subdue them by HACKING (a Utility drone parks against the hull and cracks the core: quiet, keeps everything intact, lets you recruit the station's AI) or by FORCE (Guards kill turrets and the core: loud, some sections break apart).
 Once a station is subdued, tow its sections to any free hallway door on KESTREL-9: they snap on in whatever rotation fits. Connector tubes let you reach open space.
 Stealth lifeboats (+) hold survivors. Bring them home and they join your crew, each with a skill that runs part of the station for you.
 Tugs can unbolt a section and move it, so you can redesign the station later.

SIGNATURE: everything that runs makes noise: power draw, drones outside, comms, the fabricator, gunfire. Living things are rare up here because anything that shows up on sensors gets hunted. Rogue AIs send hunters after loud stations, and legacy radar fires on strong emissions. SILENT RUNNING switches off everything non-essential.

ORBIT view (the chart around Earth):
 A zoomable tile chart. Rings mark the boundaries of LEO, MEO, GEO and HEO; each band is cut into local regions. Pinch or use +/- to zoom, drag to pan, FOCUS to jump to home or a drone. 32 regions in low, medium and geostationary orbit: junk fields with reclaimer swarms, drone graveyards with null pockets, civil, science and military stations, mad rogue AIs, and legacy weapon platforms. The surface heals slowly over time, faster under WEATHER satellites.
 Select a drone and tap a sector to send it. Weapon platforms can't be destroyed: spoof their IFF to tag KESTREL-9 as friendly.
 With a working Ion Drive (military stations carry them) KESTREL-9 itself can move to another sector. With a Mass Driver you can strike surface positions from the EARTH tab.

EARTH view (politics):
 Factions send requests: satellites, relays, surveys, cargo, IFF spoofs. Rewards come up as pods and schematics. Helping one angers its rivals.
 Legacy satellites shoot settlements and satellites of anyone not in their IFF tables. Spoofing tags is your strongest lever.

Events are paced by a storyteller: quiet stretches, then trouble, then time to recover. It goes easier on you when you are struggling.
Keys: Z/X/O/C views, T tags, Shift+L log (L also works outside the STATION view), . or SPACE wait, ? help. Autosaves in this browser.${G && G.seed != null ? `\n\nRun seed: ${G.seed} (mention it when reporting a bug)` : ''}`,
    [{ t: 'Close' }],
  );
}
export function showTitle() {
  const btns = [];
  if (hasSave())
    btns.push({
      t: 'Continue saved station',
      f: () => {
        const res = loadSave();
        if (res.ok) {
          log('Session restored.', 'info');
          refresh();
          return;
        }
        showModal(
          'SAVE NOT LOADED',
          `The saved station could not be loaded: ${res.reason}.\n\nThe save is left as it is until a new game autosaves over it.`,
          [{ t: 'Back to title', f: showTitle }],
          true,
        );
      },
    });
  btns.push({
    t: 'Wake from a misfiring CLONE POD (70 body, can re-grow on death)',
    f: () => startNew('clone'),
  });
  btns.push({ t: 'Wake from CRYO (100 body, worn pistol + armor, one life)', f: () => startNew('cryo') });
  btns.push({
    t: 'How to play',
    f: () => {
      showHelp();
      modalBtns[0].f = showTitle;
    },
  });
  showModal(
    'K E S T R E L - 9   //   O R B I T A L   W A R D',
    `Earth below is a nuclear wasteland. The survivors are still in their bunkers, because old defense satellites from long-dead nations fire on anything their IFF tables don't recognize. That is everyone alive.

KESTREL-9 was a patchwork relay, built from whatever modules the agencies and companies of the old world could spare. In the cascade it broke apart. All that is left is a handful of mismatched sections, and the feeling that something on board is watching.

You can barely see past your own hull. Out there are other stations, still guarded by their old security cores. Wake up. Get a drone outside. Take what you need, by hacking or by force.`,
    btns,
    true,
  );
}
function startNew(s) {
  V.tab = 'station';
  V.ecam = null;
  V.ez = 1;
  V.fx = [];
  newGame(s);
  setAutosave(true);
  V.sec = HULL;
  refresh();
  showModal(
    'WAKE UP',
    `${s === 'clone' ? 'You fall out of a clone pod that should not have fired. Your memories come back in pieces.' : 'The cryo lid hisses open. Your breath fogs. The station is dark.'}\n\nThe station has almost nothing left: no scrap in the bins, emergency battery only. Only your pod section answers to you. Every other section runs its own grid and has to be claimed, one Grid Node at a time. Whatever supplies survived are in the Storage section.\n\nFirst: ${OBJ[0].t}\n\nClick machines to use them (or press U next to them). Press HELP or ? anytime.`,
    [{ t: 'Start' }],
  );
}
