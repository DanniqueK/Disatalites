import { G, P, V, setG, setP } from './state.js';
import { initLand } from '../space/earth.js';
import { HULL, buildRegions } from '../space/sectors.js';
import { rebuildMap } from '../world/build.js';
import { fov } from '../world/fov.js';
import { initStars } from '../world/new-game.js';

export function save(){try{if(G&&!G.over)localStorage.setItem('k9save9',JSON.stringify({G,P}))}catch(e){}}
export function clearSave(){try{localStorage.removeItem('k9save9')}catch(e){}}
export function loadSave(){try{const s=JSON.parse(localStorage.getItem('k9save9')||'null');if(!s||s.G.v!==9)return false;setG(s.G);setP(s.P);initLand();initStars();buildRegions();rebuildMap();fov();V.tab='station';V.ecam=null;V.sec=HULL;return true}catch(e){return false}}
export function hasSave(){try{return !!localStorage.getItem('k9save9')}catch(e){return false}}
