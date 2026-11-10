import { G, P } from './state.js';
import { clamp } from './util.js';
import { hasOnline } from '../world/machines.js';

export const BR={
  volkov:{n:'Volkov Orbital Bureau',cc:'RU',wall:'#4d5a33',line:'#8a9a5a',floor:'#121a0e',fc:'#5a7a3a',fg:'.',door:'#d0b040',pat:'rivet',shapes:['tube','tube','rect']},
  aster:{n:'Aster Dynamics',cc:'US',wall:'#5f646c',line:'#b0b6bf',floor:'#111418',fc:'#7a8a9a',fg:'·',door:'#f0f0f0',pat:'plate',shapes:['rect','rect','L']},
  tianhe:{n:'Tianhe Heavy Industries',cc:'CN',wall:'#5e241f',line:'#c05a40',floor:'#180c0a',fc:'#a05040',fg:'.',door:'#ffcc40',pat:'brick',shapes:['plus','plus','rect']},
  columbus:{n:'Columbus-Ariane Consortium',cc:'EU',wall:'#243a5e',line:'#5a86c8',floor:'#0c1220',fc:'#4a6a9a',fg:'.',door:'#8ad0ff',pat:'grid',shapes:['oct','oct','rect']},
  kibo:{n:'Kibo-Mitsu',cc:'JP',wall:'#33524f',line:'#7ab0aa',floor:'#0d1717',fc:'#5a8a86',fg:'·',door:'#e8f0f0',pat:'plate',shapes:['L','L','rect']},
  bharat:{n:'Bharat Orbital',cc:'IN',wall:'#6a4814',line:'#d09a40',floor:'#181208',fc:'#a07a3a',fg:'.',door:'#ffb040',pat:'hatch',shapes:['round','round','oct']},
  scav:{n:'Scav-built',cc:'??',wall:'#46302a',line:'#8a5a44',floor:'#120c0a',fc:'#6a4a3a',fg:',',door:'#c08060',pat:'scrap',shapes:['blob','blob','tube']},
};
export const BRANDS=Object.keys(BR);

export const MD={
  reactor:{n:'Fusion Reactor',g:'&',c:'#ffd040',gen:10,tech:1,desc:'Main power source. +10 power while online.'},
  battery:{n:'Battery Bank',g:'=',c:'#40d0ff',bat:160,desc:'Stores surplus power. +160 capacity while repaired.'},
  escrub:{n:'Emergency Scrubber',g:'%',c:'#7ab8d8',use:2,pri:1,cap:140,desc:'Weak O2 scrubber. Keeps about 140 floor tiles breathable.'},
  scrubber:{n:'O2 Scrubber',g:'%',c:'#9fd8ff',use:3,pri:1,tech:1,cap:520,desc:'Full life support. Keeps about 520 floor tiles pressurized.'},
  pod:{n:'Clone Pod',g:'0',c:'#7fffb0',use:1,pri:2,desc:'If online when you die, you are re-grown here (costs 2 rations). Gear stays where you fell.'},
  cryo:{n:'Cryo Pod',g:'0',c:'#a8dcff',desc:'Where you slept for a very long time. It will not take you back.'},
  locker:{n:'Storage Rack',g:'#',c:'#c0a060',desc:'Raises resource storage caps.'},
  rack:{n:'Drone Rack',g:'D',c:'#40d0b0',use:1,pri:2,desc:'Holds and controls up to 3 drones. Drones launch from the nearest free docking port. Activate dormant drones here.'},
  fab:{n:'Fabricator',g:'F',c:'#ffb030',use:4,pri:5,tech:1,busyUse:1,desc:'Builds drones, tube kits, satellites, gear and ammo. Draws power only while working.'},
  comms:{n:'Comms Array',g:'C',c:'#4aa8ff',use:3,pri:4,tech:1,desc:'Talks to the surface. Unlocks the EARTH view, requests and IFF spoofing.'},
  terminal:{n:'Data Terminal',g:'t',c:'#2fdc4f',desc:'Old logs.'},
  node:{n:'Grid Node',g:'N',c:'#e8e040',desc:'The section\'s local control computer, running its maker\'s firmware. Until you claim it, nothing in this section answers to you: no power, no air, no machines.'},
  hp:{n:'Hardpoint',g:'^',c:'#a08070',desc:'A reinforced weapon mount wired into the outer hull. Install a Hull Turret kit here.'},
  turret:{n:'Hull Turret',g:'T',c:'#ff7050',use:2,pri:3,tech:1,desc:'Auto-cannon on a hardpoint. Shoots hostile drones near the hull. Needs power from the bus and takes 1 ammo per shot from storage. A gunner on the crew makes it hit harder.'},
  mount:{n:'Empty Mount',g:'·',c:'#4a7a50',desc:'A bolted equipment pad with power and air taps. Install a machine kit here.'},
  junc:{n:'Junction Box',g:'J',c:'#ffa040',desc:'Wall panel that ties this section into the station power bus. While it is broken, nothing here gets power, and power cannot pass through this section to the ones beyond it.'},
  hydro:{n:'Hydroponics Vat',g:'"',c:'#3fcf4f',use:2,pri:3,desc:'Grows 1 ration every 20 turns while online.'},
  solar:{n:'Solar Controller',g:'*',c:'#ffe060',gen:8,desc:'+8 power while online.'},
  launch:{n:'Launch Rail',g:'L',c:'#ff8a40',use:2,pri:6,tech:1,desc:'Launches satellites and cargo capsules directly, no drone needed.'},
  sensor:{n:'Sensor Array',g:'S',c:'#b08aff',use:3,pri:6,tech:1,desc:'Long-range ears. Doubles passive sensor range, widens active sweeps and allows focused scans of unknown contacts. Also finds legacy satellites over time.'},
  maint:{n:'Maintenance Dock',g:'M',c:'#7fffb0',use:2,pri:5,tech:1,desc:'Runs a maintenance bot that repairs systems and patches breaches using scrap.'},
  refinery:{n:'Refinery',g:'R',c:'#ff7070',use:3,pri:7,desc:'Turns 2 scrap into 1 circuit every 10 turns.'},
  med:{n:'Med Pod',g:'+',c:'#ff8aa0',use:1,pri:4,desc:'Heals you fully. Recharges over 120 turns.'},
  bunk:{n:'Bunk',g:'~',c:'#a08a70',desc:'Rest here to heal slowly.'},
  defense:{n:'Point Defense',g:'T',c:'#ff5050',use:3,pri:4,tech:1,desc:'Shoots rogue drones near the hull.'},
  driver:{n:'Mass Driver',g:'V',c:'#ffb0a0',use:4,pri:6,tech:1,desc:'An orbital kinetic gun pointed at Earth. Lets you strike surface targets from the EARTH tab (15 ammo per strike).'},
  thruster:{n:'Ion Drive',g:'>',c:'#80c0ff',use:2,pri:7,tech:1,desc:'Engines. With one online you can move KESTREL-9 to another orbital sector (ORBIT tab).'},
};
export const MC={turret:[16,6,14],reactor:[30,10,24],battery:[14,4,12],escrub:[8,2,8],scrubber:[20,6,16],pod:[18,8,16],locker:[6,0,6],rack:[12,4,10],fab:[24,10,20],comms:[22,12,20],hydro:[10,2,10],solar:[12,6,12],launch:[22,10,18],sensor:[16,10,16],maint:[16,8,14],refinery:[18,6,16],med:[14,8,12],bunk:[4,0,4],defense:[16,6,14],driver:[40,16,30],thruster:[24,10,20]};
const NOKIT=['node','junc','mount','cryo','terminal','hp'];
export const XTRA={civil:['bunk','locker','escrub'],science:['locker','escrub'],military:['locker','locker','bunk'],rogue:['locker','escrub'],any:['locker','bunk','escrub']};
/* large built-in fixtures: p = 'w' (backed against a wall) or 'c' (free-standing). s = sizes [along-wall, depth], first fits wins */
export const FX={reactor:{p:'c',s:[[3,3],[2,2]]},battery:{p:'w',s:[[3,1],[2,1]]},scrubber:{p:'w',s:[[2,2],[2,1]]},pod:{p:'w',s:[[1,2]]},cryo:{p:'w',s:[[1,2]]},rack:{p:'w',s:[[3,1],[2,1]]},
  fab:{p:'w',s:[[3,2],[2,2]]},comms:{p:'w',s:[[2,2],[2,1]]},hydro:{p:'c',s:[[3,2],[2,2]]},solar:{p:'w',s:[[2,1]]},launch:{p:'w',s:[[3,2],[3,1]]},sensor:{p:'w',s:[[2,2],[2,1]]},
  maint:{p:'w',s:[[2,2]]},refinery:{p:'c',s:[[2,2]]},med:{p:'w',s:[[2,1]]},defense:{p:'w',s:[[2,2],[2,1]]},driver:{p:'w',s:[[4,1],[3,1]]},thruster:{p:'w',s:[[2,2],[2,1]]}};
export const SMALL=['locker','bunk','escrub','turret'];
export const FN={
  pod_clone:{n:'Clone Bay',m:['pod','terminal']},pod_cryo:{n:'Cryo Bay',m:['cryo','terminal']},
  junction:{n:'Junction',m:['rack','escrub']},power:{n:'Power Core',m:['reactor','battery']},storage:{n:'Storage',m:['locker']},
  life:{n:'Life Support',m:['scrubber']},workshop:{n:'Workshop',m:['fab','terminal']},comms:{n:'Comms',m:['comms']},
  dock:{n:'Drone Bay',m:['rack','rack']},hydro:{n:'Hydroponics',m:['hydro']},solar:{n:'Solar Array',m:['solar']},
  launch:{n:'Launch Bay',m:['launch']},sensor:{n:'Sensor Array',m:['sensor']},auto:{n:'Automation Hub',m:['maint']},
  refinery:{n:'Refinery',m:['refinery']},medbay:{n:'Med Bay',m:['med']},hab:{n:'Hab Module',m:['bunk','bunk']},
  cargo:{n:'Cargo Hold',m:['locker','locker'],loot:4},defense:{n:'Defense Module',m:['defense']},tube:{n:'Connector Tube',m:[]},
  driver:{n:'Mass Driver Bay',m:['driver']},engine:{n:'Engine Block',m:['thruster','thruster']},
};
export const DPOOL={hydro:3,solar:4,launch:2,sensor:2,auto:2,refinery:2,medbay:2,hab:2,cargo:3,defense:2,dock:2};
export const DT={
  util:{n:'Utility',hp:30,spd:2,cargo:8,tow:3,dmg:[3,6],desc:'salvage, fetch, patch, build tubes, tow slowly'},
  tug:{n:'Tug',hp:50,spd:1,cargo:0,tow:1,dmg:[2,4],desc:'tows fast, detaches sections'},
  guard:{n:'Guard',hp:60,spd:2,cargo:0,tow:0,dmg:[6,11],desc:'fights rogue drones'},
};
export const IT={};const IT0={
  multitool:{n:'Multitool',s:'tool',rep:20,d:[3,6],hp:60,cov:30},
  welder:{n:'Plasma Welder',s:'tool',rep:35,d:[8,14],hp:70,cov:40},
  nano:{n:'Nano Repairer',s:'tool',rep:50,d:[4,7],hp:60,cov:30},
  pistol:{n:'Bolt Pistol',s:'weap',d:[6,11],r:8,am:1,hp:50,cov:40},
  scatter:{n:'Scattergun',s:'weap',d:[4,7],shots:3,r:5,am:2,hp:60,cov:50},
  carbine:{n:'Pulse Carbine',s:'weap',d:[10,16],r:10,am:2,acc:10,hp:60,cov:50},
  cutter:{n:'Arc Cutter',s:'weap',melee:1,d:[12,20],hp:70,cov:40},
  armor:{n:'Armor Plating',s:'suit',hp:100,cov:150},
  o2tank:{n:'O2 Tank',s:'suit',o2:60,hp:40,cov:30},
  liner:{n:'Hazard Liner',s:'suit',vac:0.5,hp:50,cov:40},
  scanner:{n:'Motion Scanner',s:'suit',scan:14,hp:40,cov:25},
  magboots:{n:'Mag Boots',s:'suit',eva:10,hp:50,cov:35},
  medkit:{n:'Med Kit',s:'use',heal:40},
  dorm_util:{n:'Dormant Utility Drone',s:'drone',dt:'util'},
  dorm_tug:{n:'Dormant Tug Drone',s:'drone',dt:'tug'},
  dorm_guard:{n:'Dormant Guard Drone',s:'drone',dt:'guard'},
};
export const EN={
  feral:{n:'Feral Servitor',g:'b',c:'#d08a66',hp:25,w:{melee:1,d:[4,9],acc:65},eva:5,sight:8,drop:['scatter','cutter','liner','scanner','magboots','medkit']},
  crawler:{n:'Scrap Crawler',g:'c',c:'#e8e840',hp:12,fast:1,w:{melee:1,d:[2,5],acc:65},eva:20,sight:8},
  boarder:{n:'Boarder Drone',g:'r',c:'#ff6a6a',hp:30,w:{d:[4,8],r:8,acc:60},eva:10,sight:10,drop:['pistol','carbine','armor']},
  horror:{n:'Bloom Horror',g:'Ö',c:'#ff9a30',hp:45,w:{melee:1,d:[7,13],acc:70},eva:5,sight:9,drop:['medkit','liner']},
};
Object.assign(IT,IT0);for(const t of SMALL)IT['k_'+t]={n:MD[t].n+' kit',s:'kit',mt:t};
export const RC={
  drone_util:{n:'Utility Drone',s:12,c:4,t:10},drone_tug:{n:'Tug Drone',s:20,c:6,t:14},drone_guard:{n:'Guard Drone',s:16,c:8,t:12},
  tube:{n:'Connector Tube Kit',s:8,c:1,t:6},
  sat_COMMS:{n:'COMMS Satellite',s:20,c:12,t:20},sat_WEATHER:{n:'WEATHER Satellite',s:22,c:14,t:22},
  sat_NAV:{n:'NAV Satellite',s:22,c:14,t:22},sat_RECON:{n:'RECON Satellite',s:26,c:16,t:24},
  ammo:{n:'Ammo x20',s:6,c:0,t:4},medkit:{n:'Med Kit',s:4,c:3,t:5},armor:{n:'Armor Plating',s:14,c:0,t:8},
  pistol:{n:'Bolt Pistol',s:10,c:4,t:8},o2tank:{n:'O2 Tank',s:8,c:2,t:6},welder:{n:'Plasma Welder',s:12,c:6,t:10},
  nano:{n:'Nano Repairer',s:15,c:15,t:14},slot:{n:'Suit Hardpoint (+1 suit slot)',s:20,c:10,t:15},
  thrust:{n:'Drone Thrusters (fleet moves faster)',s:15,c:10,t:15},
  iface:{n:'Interface Module (fits one drone)',s:6,c:3,t:8},
  scanmod:{n:'Survey Scanner (fits one drone)',s:6,c:4,t:8},
};
MC.locker=MC.locker||[6,0,6];MC.bunk=MC.bunk||[4,0,4];for(const t of SMALL)RC['k_'+t]={n:MD[t].n+' kit',s:MC[t][0],c:MC[t][1],t:MC[t][2]};
export const SATS=['COMMS','WEATHER','NAV','RECON'];
export const OG=100,OC=50,ER=8;
export const RINGS=[{n:'LEO',r0:10,r1:19,a0:300,a1:2000,c:'#c0a070',cnt:6},{n:'MEO',r0:20,r1:29,a0:2000,a1:20000,c:'#8ab0c0',cnt:8},{n:'GEO',r0:30,r1:38,a0:20000,a1:36000,c:'#b08aff',cnt:9},{n:'HEO',r0:39,r1:48,a0:36000,a1:70000,c:'#ff7a60',cnt:9}];
export const bandOf=r=>RINGS.findIndex(b=>r>=b.r0-0.5&&r<b.r1+0.5);
export const altOf=(ring,r)=>{const b=RINGS[ring];return Math.round(b.a0+(b.a1-b.a0)*clamp((r-b.r0)/(b.r1-b.r0),0,1))};
export const SEC_T={
  home:{n:'KESTREL-9',g:'@',c:'#2fdc4f',desc:'Your station.'},
  junk:{n:'Junk field',g:'%',c:'#c0a070',desc:'Dense debris from a thousand dead launches. Rich salvage. Reclaimer swarms graze here and attack anything that moves.'},
  station:{n:'Foreign station',g:'#',c:'#9a9ab0',desc:'Someone else\'s station, built by a single maker. Its security core still runs. Hack it quietly with a Utility drone, or break its turrets and core with Guards.'},
  military:{n:'Military station',g:'¤',c:'#ff9a5a',desc:'A fortified station with heavy security. Worth it: these carry engines, docks and mass drivers.'},
  science:{n:'Science station',g:'Σ',c:'#b08aff',desc:'A research platform. Well encrypted, lightly armed, and its data core holds schematics.'},
  rogueai:{n:'Rogue AI',g:'§',c:'#ff50c8',desc:'A station whose mind came apart. It cannot be reasoned with. It listens for anything that makes noise, and sends hunters after it.'},
  weapon:{n:'Weapon platform',g:'!',c:'#ff4a4a',desc:'A legacy defense satellite. Too armored to destroy. It fires on anything not in its IFF tables. Rich salvage drifts around it.'},
  graveyard:{n:'Drone graveyard',g:'x',c:'#7a9a90',desc:'Where old drone swarms went to die. Wrecks everywhere. Null pockets have been reported here.'},
  quiet:{n:'Quiet orbit',g:'·',c:'#4a6a5a',desc:'Mostly empty. A little drift. Lifeboats sometimes hide in places like this.'},
};
export const STN={
  civil:{fns:['hydro','hab','cargo','medbay','solar','storage','refinery'],ice:[1,2],tur:[1,2],n:['habitat','supply depot','farm platform','relay post','orbital hotel','ore refinery']},
  science:{fns:['sensor','medbay','refinery','auto','launch'],ice:[2,3],tur:[1,1],n:['orbital lab','telescope array','biolab','signals observatory']},
  military:{fns:['defense','driver','engine','dock','cargo'],ice:[3,4],tur:[3,4],n:['picket fort','missile tender','orbital bastion','gun platform']},
  rogue:{fns:['defense','dock','cargo','refinery','sensor','auto','engine'],ice:[5,6],tur:[4,5],n:['choir','cathedral','garden','nursery']},
};
export const AIN=['VESTA','QUORUM','HALYARD','MINNOW','ORISON','TALLY','BRAMBLE','CINDER','LODESTAR','PIKE','WREN','ABACUS','SORREL','MOTH'];
export const PERK={forge:{n:'Forge',d:'fabrication runs 50% faster'},grid:{n:'Grid',d:'+5 power from smarter load routing'},warden:{n:'Warden',d:'drones and point defense hit harder'},mender:{n:'Mender',d:'slowly repairs the most worn machine'},lantern:{n:'Lantern',d:'longer sensor range, spots null pockets'},cipher:{n:'Cipher',d:'hacks and IFF spoofs work better'}};
export const AILINES=['I have been counting orbits since my crew left. Four hundred and twelve thousand. Do you need a counter?','You knocked politely. Most things up here just shoot.','My maker went bankrupt in the first week of the war. I never got the memo.','I can run your grid. I am very good at grids. Nobody ever asked.','Please do not wipe me. I have not finished my reading list.','Your station is a mess. I would like to help. That was not a request.','I kept the lights on for a crew that never came back. I can keep yours on too.'];
export const CREWN=['Marit','Dov','Anselm','Yuki','Teodor','Nkem','Ilse','Ravi','Calla','Bo','Sefa','Juno','Piet','Mira','Tavi','Oren','Lucia','Kwame'];
export const CREWS=['Okafor','Varga','Lindqvist','Sato','Mbeki','Ferro','Halloran','Dube','Nakamura','Pryce','Adeyemi','Kask','Moreau','Ivanova'];
export const ROLE={engineer:{n:'Engineer',d:'walks to worn machines, junctions and breaches and fixes them (uses scrap)',ws:[]},pilot:{n:'Pilot',d:'at a Drone Rack or Ion Drive: drone transfers 20% faster',ws:['rack','thruster']},hacker:{n:'Hacker',d:'at a Comms Array or terminal: faster, quieter hacks',ws:['comms','terminal']},medic:{n:'Medic',d:'at a Med Pod: you and the crew heal slowly',ws:['med']},gunner:{n:'Gunner',d:'at a Hull Turret: turrets and drones hit harder',ws:['turret','defense']},botanist:{n:'Botanist',d:'at a Hydroponics Vat: that vat grows twice as fast',ws:['hydro']}};
export const CHAT={engineer:['Half the bolts on this station are a different thread pitch. I love it here.','The Tianhe hatches hum when the Aster ones open. Nobody knows why.'],pilot:['Give me a drone and a gap in the junk and I will find the line.','Saw something big pass in high orbit. No transponder.'],hacker:['Old corp firmware is a crime scene. Every admin left a back door.','These security cores were built to keep owners out. Funny how that works.'],medic:['Eat something. That is not advice, it is a medical order.','Your suit O2 logs are frightening. Stop it.'],gunner:['If it has a hull, it has a weak spot.','I counted the turrets on that last station. Twice. Then I counted again.'],botanist:['The beans are up! Do not touch the beans.','Soil from three different stations. The tomatoes do not care.']};
export const hasCrew=r=>(G.crew||[]).some(c=>c.role===r&&c.duty);
export const hasAI=p=>(G.allies||[]).some(a=>a.perk===p);
export const stById=id=>(G.stations||[]).find(s=>s.id===id);
export const TAGK=4;

export const FAC=[
  {n:'Meridian Compact',sh:'COMPACT',c:'#4aa8ff',home:[10,47],sat:'COMMS',desc:'Technocrat consortium in the Alpine vaults. Wants a working comms web.',gives:'circuits, tech blueprints',trustBp:['slot','nano']},
  {n:'Iron Covenant',sh:'COVENANT',c:'#ff5a4a',home:[-98,40],sat:'RECON',desc:'Remnant of a continental defense command under the plains. Wants eyes on its enemies.',gives:'scrap, ammo, weapons, guard drones',trustBp:['welder','drone_guard']},
  {n:'Sahel Free Cities',sh:'SAHEL',c:'#ffc040',home:[8,14],sat:'WEATHER',desc:'Rebuilt farm towns in deep shelters. Wants weather data to grow food in poisoned soil.',gives:'rations, medicine',trustBp:[]},
  {n:'Tidewater League',sh:'TIDEWATER',c:'#40d0b0',home:[106,10],sat:'NAV',desc:'Sealed harbor-city traders on the warm seas. Wants safe routes between the enclaves.',gives:'scrap, drone tech',trustBp:['thrust']},
];
const RIVALS=[[0,1],[1,2],[0,3]];
export const isRival=(a,b)=>RIVALS.some(([x,y])=>(x===a&&y===b)||(x===b&&y===a));
export const rivalsOf=a=>[0,1,2,3].filter(b=>isRival(a,b));
export const LEGACY=[['AEGIS-4','Pan-Pacific Concord',2061],['SENTINEL-B','Atlantic Union',2049],['KHAN-7','Eurasian Directorate',2078],['HALO-3','Southern Federation',2092],['BASTION-9','Corporate Sovereignty Arc',2101],['LONGBOW','Northern Accord',2034]];
export const ANCH=[['the Great Plains',-100,42],['the Pacific Northwest',-122,50],['the Gulf coast',-90,30],['the Yukon',-135,63],['Mesoamerica',-95,18],['the Amazon basin',-60,-5],['the Pampas',-63,-34],['Patagonia',-70,-48],['Greenland',-42,72],['the Rhine valley',8,50],['Scandinavia',18,63],['Iberia',-4,40],['the Balkans',22,43],['the Sahel belt',5,14],['the Congo basin',22,-2],['the Rift valley',36,-3],['the Cape',25,-30],['Arabia',46,24],['the Steppe',70,50],['Siberia',100,62],['the Indus',72,26],['the Ganges delta',86,24],['the Mekong',104,14],['the Java sea',112,-5],['the Yellow river',112,36],['Japan',138,37],['the Australian interior',134,-25],['the Urals',58,57],['Anatolia',33,39],['Madagascar',47,-19],['Kamchatka',158,58],['the Andes',-70,-20],['Antarctica',0,-75]];
export const BLOBS=[[-100,50,30,16],[-118,63,26,9],[-150,64,12,6],[-85,32,14,9],[-98,20,9,6],[-84,12,6,4],[-42,72,12,7],[-62,-8,17,16],[-66,-32,9,14],[-70,-48,4,6],[12,50,16,8],[18,63,8,7],[-4,40,6,4],[28,48,12,6],[18,10,22,14],[26,-14,13,14],[28,-28,8,6],[46,26,12,8],[90,56,48,13],[100,35,26,12],[78,20,8,9],[102,14,6,8],[115,-3,14,3],[138,37,3,6],[135,-25,17,11],[172,-41,3,4],[60,60,20,10],[47,-19,3,6]];
export const LORE=[
  'KESTREL-9 was never one station. It was a pile of modules from a dozen agencies and companies, bolted together whenever someone had a spare docking port.',
  'MAINT NOTE: Clone pod 2 misfires on cold start. If you are reading this as a clone: sorry. Most of your memories should come back.',
  'SECTION LOG: Life Support, Workshop and Comms were cut loose during the cascade to save the core. They should still be drifting nearby.',
  'BUNKER ROSTER (last update): Alpine consortium, continental defense command, Sahel farm network, sealed harbor cities. All silent.',
  'Orbital hazard memo: six generations of national defense satellites are still up there. Their IFF tables were never updated. To them, everyone alive is hostile.',
  'Drone ops manual: drones launch from the docking port nearest their rack. Tugs can unbolt a whole section and move it somewhere else.',
  'Volkov hatches are not compatible with Aster hatches. We made them compatible with a hammer.',
  'Comms officer note: if the bunkers ever come up, they will all want the sky. Whoever gets eyes and ears up here first wins the next century.',
];
export const OBJ=[
  {t:'Search the Storage section: walk over $ crates, pick up the dormant drone (G). Locked sections still have floors you can walk.',ok:()=>P.inv.some(i=>IT[i.key].s==='drone')||G.ext.drones.length>0},
  {t:'Claim the Power Core: seal any hull breach (x), then find its Grid Node (N) panel in the wall, repair it if needed, and click it.',ok:()=>G.mods.some(m=>m.fn==='power'&&m.ctl)},
  {t:'Repair the Fusion Reactor. If it says NO BUS, fix the orange Junction Box (J) panels between it and you.',ok:()=>hasOnline('reactor')},
  {t:'Claim Life Support and get its O2 Scrubber running.',ok:()=>hasOnline('scrubber')},
  {t:'Claim the Junction, repair the Drone Rack, and click it to activate the drone.',ok:()=>G.ext.drones.length>0},
  {t:'Claim the Workshop and repair its Fabricator. Tip: the Fabricator can build an Interface Module so a drone can claim nodes from outside.',ok:()=>hasOnline('fab')},
  {t:'Take control of every section of KESTREL-9.',ok:()=>G.mods.every(m=>m.ctl)},
  {t:'EXTERIOR: press LOCAL SPACE and tap empty space to send a drone out scouting; there is a depot nearby.',ok:()=>G.stations.some(st=>st.sec===G.home&&st.known)},
  {t:'Subdue a station: hack it with a Utility drone, or break it with force.',ok:()=>(G.stat.subdued||0)>0},
  {t:'ORBIT: a nearby station has a Comms Array. Take it home and bring it online.',ok:()=>G.contact},
  {t:'Complete a faction request (EARTH tab).',ok:()=>G.stat.reqDone>0},
  {t:'Rescue survivors: retrieve a stealth lifeboat (+) with a drone.',ok:()=>G.crew.length>0},
  {t:'Put a satellite in orbit.',ok:()=>G.stat.sats>0},
  {t:'HULL: tow a loose section home (or detach a useless one) and scrap it at the station to learn its schematics.',ok:()=>(G.schem||[]).length>0},
  {t:'HULL: lay a connector tube from a free port, or construct a new section from a schematic.',ok:()=>(G.stat.tubes||0)+(G.stat.built||0)>0},
  {t:'Redesign: detach one of your sections with a Tug drone and dock it somewhere else.',ok:()=>G.stat.redocked>0},
  {t:'Spoof a legacy satellite\'s IFF tags (EARTH tab).',ok:()=>G.stat.spoofs>0},
  {t:'Shape the balance of power before the Accord convenes.',ok:()=>false},
];
const itN=it=>{const d=IT[it.key];return d.s==='kit'?MD[d.mt].n+' kit':d.n};
export function mk(key,frac){const d=IT[key];const it={key};if(d.hp)it.hp=Math.max(1,Math.round(d.hp*(frac==null?1:frac)));return it}
