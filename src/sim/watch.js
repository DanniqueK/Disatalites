// The watch list: sectors and exterior objects the player pins to keep an eye on.
import { DT } from '../core/data.js';
import { log } from '../core/messages.js';
import { G } from '../core/state.js';
import { cid, det, secName } from '../space/sectors.js';

/** @typedef {{ kind: 'sec' | 'obj', id: number, sig?: string, moving?: boolean, name?: string }} Watch */

const list = () => (G.watch = G.watch || []);
const target = w => (w.kind === 'sec' ? G.sectors[w.id] : G.ext.objs.find(o => o.id === w.id));

export function isWatched(kind, id) {
  return list().some(w => w.kind === kind && w.id === id);
}

/** A short name for a watched thing. */
export function watchName(w) {
  const t = target(w);
  if (!t) return 'lost contact';
  if (w.kind === 'sec') return det(t) === 2 ? `${t.name} (${secName(t)})` : `${cid(t)} unknown contact`;
  if (t.kind === 'wreck') return `${DT[t.dt].n} wreck`;
  if (t.kind === 'der') return t.pack.name;
  if (t.kind === 'raft') return 'lifeboat';
  if (t.kind === 'rogue') return 'rogue drone';
  return t.kind;
}

/** What we can see of it now; a change from last turn is worth a log line. */
function signature(w) {
  const t = target(w);
  if (!t) return 'gone';
  if (w.kind === 'sec') return `det${det(t)}`;
  return `${t.sec}|${t.x},${t.y}|${t.hp ?? ''}`;
}

/** Start or stop tracking. */
export function toggleWatch(kind, id) {
  const ws = list();
  const i = ws.findIndex(w => w.kind === kind && w.id === id);
  if (i >= 0) {
    log(`Stopped tracking the ${watchName(ws[i])}.`);
    ws.splice(i, 1);
    return false;
  }
  const w = { kind, id };
  w.sig = signature(w);
  w.name = watchName(w);
  ws.push(w);
  log(`Tracking the ${watchName(w)}. It is on the watch list and will blink on the map.`, 'info');
  return true;
}

/** Once per turn: report what changed about each tracked thing. */
export function watchTick() {
  for (const w of list().slice()) {
    const sig = signature(w);
    if (sig === w.sig) {
      w.moving = false;
      continue;
    }
    const [was, now] = [w.sig || '', sig];
    w.sig = sig;
    const name = now === 'gone' ? w.name : (w.name = watchName(w));
    if (now === 'gone') {
      log(`Tracked: the ${w.name || 'contact'} is gone (salvaged, destroyed or out of sight).`, 'info');
      list().splice(list().indexOf(w), 1);
    } else if (w.kind === 'sec')
      log(`Tracked: ${name} is ${now === 'det2' ? 'identified' : 'on sensors'}.`, 'info');
    else {
      const [s0, p0, h0] = was.split('|'),
        [s1, p1, h1] = now.split('|');
      if (h0 !== h1 && h1 !== '') log(`Tracked: the ${name} took damage.`, 'info');
      else if (s0 !== s1) log(`Tracked: the ${name} left the sector.`, 'info');
      else if (p0 !== p1 && !w.moving) log(`Tracked: the ${name} is on the move.`, 'info');
      w.moving = p0 !== p1;
    }
  }
}
