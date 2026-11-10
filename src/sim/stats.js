import { EN, IT, mk } from '../core/data.js';
import { G, P, V } from '../core/state.js';
import { $, idx, pick, rnd, rr } from '../core/util.js';
import { HULL } from '../space/sectors.js';
import { cmb, log } from '../ui/log-modal.js';
import { kick } from '../ui/render.js';
import { dropItem } from '../world/machines.js';

export function stats(){const s={o2Max:100,eva:10,rep:5,scan:0,vacMul:1};for(const sl of ['tool','weap','suit'])for(const it of P.eq[sl]){const d=IT[it.key];if(d.o2)s.o2Max+=d.o2;if(d.eva)s.eva+=d.eva;if(d.rep)s.rep=Math.max(s.rep,d.rep);if(d.scan)s.scan=Math.max(s.scan,d.scan);if(d.vac)s.vacMul=Math.min(s.vacMul,d.vac)}return s}
export function hurtPlayer(dmg,src){
  const pool=[{w:100,it:null}];for(const sl of ['tool','weap','suit'])for(const it of P.eq[sl])pool.push({w:IT[it.key].cov||30,it,sl});
  let r=Math.random()*pool.reduce((s,p)=>s+p.w,0),ch=pool[0];for(const p of pool){r-=p.w;if(r<=0){ch=p;break}}
  if(ch.it){ch.it.hp-=dmg;const nm=IT[ch.it.key].n;if(ch.it.hp<=0){P.eq[ch.sl].splice(P.eq[ch.sl].indexOf(ch.it),1);log(`${nm} destroyed!`,'bad');cmb(`${nm} destroyed (${dmg})`,'bad');P.o2=Math.min(P.o2,stats().o2Max)}else cmb(`${nm} takes ${dmg}`,'warn')}
  else{P.hp-=dmg;cmb(`Body takes ${dmg}`,'bad');G.killer=src}
  const mw=$('#mapWrap');mw.classList.add('hurt');clearTimeout(hurtPlayer.t);hurtPlayer.t=setTimeout(()=>mw.classList.remove('hurt'),220);
}
export function damageActor(a,dmg){a.hp-=dmg;a.alert=true;if(a.hp<=0)killActor(a)}
function killActor(a){if(a.dead)return;a.dead=true;a.hp=0;const d=EN[a.type];log(`${d.n} destroyed.`);G.stat.kills++;if(G.target===a.id)G.target=null;
  if(d.drop&&Math.random()<0.35)dropItem(a.x,a.y,mk(pick(d.drop),0.4+Math.random()*0.5));if(Math.random()<0.4)G.crates[idx(a.x,a.y)]={scrap:rr(2,5),circ:rnd(3)}}
export const actorAt=(x,y)=>G.actors.find(a=>a.hp>0&&a.x===x&&a.y===y);
export const occupied=(x,y)=>(P.x===x&&P.y===y)||!!actorAt(x,y)||(G.bot&&G.bot.x===x&&G.bot.y===y)||(G.crew||[]).some(c=>c.x===x&&c.y===y);
export function addFx(f){f.t0=performance.now();f.view=f.view||'station';if(f.view==='ext'&&f.sec==null)f.sec=HULL;V.fx.push(f);kick()}
