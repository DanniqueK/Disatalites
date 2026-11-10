import { T } from '../core/constants.js';
import { MD } from '../core/data.js';
import { G, M, P } from '../core/state.js';
import { D8, idx, inB } from '../core/util.js';

export const ctlOK=m=>{const mod=G.mods[m.mi];return !mod||mod.ctl||['node','junc','pod','cryo','terminal','locker'].includes(m.type)};
export function online(m){const d=MD[m.type];if(m.cond<60||!m.on||!ctlOK(m))return false;if(d.use&&!m.powered)return false;if(m.type==='comms'&&G.jam>G.turn)return false;return true}
export const hasOnline=t=>G.machines.some(m=>m.type===t&&online(m));
export const commsOnline=()=>hasOnline('comms');
export function addStock(k,n){const c=caps();G.stock[k]=Math.min(c[k],G.stock[k]+n)}
export function caps(){const l=G.machines.filter(m=>m.type==='locker').length;return {scrap:50+50*l,circ:25+25*l,rat:8+6*l,ammo:40+60*l}}
export function dropItem(x,y,it){const i=idx(x,y);(G.items[i]||(G.items[i]=[])).push(it)}
export function dropNear(x,y,it){for(let r=1;r<6;r++)for(const [dx,dy] of D8){const nx=x+dx*r,ny=y+dy*r;if(inB(nx,ny)&&M.map[idx(nx,ny)]===T.FLOOR){dropItem(nx,ny,it);return}}dropItem(P.x,P.y,it)}
export const droneCap=()=>G.machines.filter(k=>k.type==='rack'&&online(k)).length*3;
