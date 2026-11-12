import { EGH, EGW, T } from '../core/constants.js';
import { FAC, isRival, mk, TAGK } from '../core/data.js';
import { emit } from '../core/events.js';
import { log, queueModal } from '../core/messages.js';
import { clearSave } from '../core/save.js';
import { G, M, P } from '../core/state.js';
import { D8, idx } from '../core/util.js';
import { occupied } from './stats.js';
import { shares } from '../space/earth.js';
import { fov } from '../world/fov.js';
import { dropItem, online } from '../world/machines.js';

export function playerDied() {
  const pod = G.machines.find(m => m.type === 'pod' && online(m));
  if (G.start === 'clone' && pod && G.stock.rat >= 2) {
    for (const sl of ['tool', 'weap', 'suit']) for (const it of P.eq[sl]) dropItem(P.x, P.y, it);
    for (const it of P.inv) dropItem(P.x, P.y, it);
    G.stock.rat -= 2;
    P.eq = { tool: [mk('multitool', 0.5)], weap: [], suit: [] };
    P.inv = [];
    P.hp = P.hpMax;
    P.o2 = 100;
    P.nut = 60;
    G.stat.deaths++;
    for (const [dx, dy] of D8) {
      const x = pod.x + dx,
        y = pod.y + dy;
      if (M.map[idx(x, y)] === T.FLOOR && !occupied(x, y)) {
        P.x = x;
        P.y = y;
        break;
      }
    }
    log(
      `You died (${G.killer || 'unknown'}). The clone pod cycles. You wake again, sticky and cold. Your old gear is where you fell.`,
      'warn',
    );
    fov();
    return;
  }
  G.over = true;
  clearSave();
  queueModal(
    'VITAL SIGNS: FLATLINE',
    `Cause: ${G.killer || 'unknown'}.\n${G.start === 'clone' ? 'No working clone pod or not enough rations to re-grow you.' : 'Cryo sleepers only get one life.'}\n\nTurns survived: ${G.turn}\nSections docked: ${G.stat.docked}\nSatellites launched: ${G.stat.sats}\n\nKESTREL-9 drifts on, silent.`,
    [{ t: 'New game', f: () => emit('title') }],
  );
}
export function endGame(kind) {
  if (G.over) return;
  G.over = true;
  clearSave();
  const sh = shares();
  const ord = [0, 1, 2, 3].sort((a, b) => sh.c[b] - sh.c[a]);
  const top = ord[0],
    sec = ord[1];
  const pct = f => (sh.tot ? Math.round((sh.c[f] / sh.tot) * 100) : 0);
  const fav = [0, 1, 2, 3].sort((a, b) => G.fac[b].rep - G.fac[a].rep)[0];
  let head, txt;
  if (sh.tot && pct(top) >= 50) {
    head = `${FAC[top].sh} ASCENDANT`;
    txt =
      `The ${FAC[top].n} holds ${pct(top)}% of the settled world. The other delegations sign what they are told to sign.` +
      (G.fac[top].rep >= 30
        ? `\n\nThey credit KESTREL-9 openly. Supply launches keep coming.`
        : G.fac[top].rep <= -30
          ? `\n\nThey remember who you helped. Their first act after the Accord is to petition the old satellites to add the station to the target list.`
          : `\n\nThey treat the station as a useful tool. Nothing more.`);
  } else if (sh.tot && isRival(top, sec) && Math.abs(pct(top) - pct(sec)) <= 10) {
    head = 'COLD ORBIT';
    txt = `Two rival blocs, ${FAC[top].sh} (${pct(top)}%) and ${FAC[sec].sh} (${pct(sec)}%), face each other across the ash with satellites watching both sides. The Accord ends in a ceasefire nobody believes.`;
  } else {
    head = 'THE ACCORD HOLDS';
    txt = `No one can dominate. ${ord.map(f => FAC[f].sh + ' ' + pct(f) + '%').join(', ')}. Four delegations agree to shared orbital lanes, with KESTREL-9 as neutral ground.`;
  }
  txt += `\n\nThe surface is still mostly dead: ${sh.tot} of ${EGW * EGH} map cells are settled. Legacy satellites tagged by you: ${G.legacy.filter(L => L.tags.some(t => t !== TAGK)).length}/${G.legacy.length}.\nYour closest ally: ${FAC[fav].sh} (rep ${Math.round(G.fac[fav].rep)}).\nStation: ${G.mods.length} sections from ${new Set(G.mods.map(m => m.brand)).size} makers. Satellites launched: ${G.stat.sats} (${G.stat.lost} shot down). Turns: ${G.turn}.`;
  queueModal(head, txt, [{ t: 'New game', f: () => emit('title') }]);
}
