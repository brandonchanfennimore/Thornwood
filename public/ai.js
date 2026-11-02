// Thornwood — heuristic AI opponents (shared by server and browser)
(function (root) {
const E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.Engine;

const KEEP = { moon: 5, ambush: 4, forage: 3, rally: 2, provision: 2, hasten: 1 };

function enemyNear(s, f, r) {
  let n = 0;
  for (const a of [r, ...E.ADJ[r]]) for (const p of s.players) if (p.faction !== f) n += E.critters(s, a, p.faction);
  return n;
}
function dice(s, f, r, n) { return f === 'owl' ? Math.min(4, n * 2) : Math.min(3, n); }

function scoreAction(s, f, a) {
  const p = E.P(s, f), R = E.REGIONS, card = a.card ? p.hand.find(c => c.id === a.card) : null;
  const canAct = f === 'otter' ? p.coins > 0 : s.actionsLeft > 0;
  switch (a.type) {
    case 'end': return 0.5;
    case 'discard': return 10 - KEEP[card.type];
    case 'card':
      if (card.type === 'forage') return 12;
      if (card.type === 'provision') return p.hand.length <= 4 ? 6 : 2;
      if (card.type === 'moon') return canAct ? 2 : 1.5;
      if (card.type === 'hasten') return 3;
      if (card.type === 'rally') return 2.5 + (E.buildingsOf(s, a.region, f) ? 1.5 : 0) + Math.min(2, enemyNear(s, f, a.region) * 0.4) + (f === 'rabbit' && R[a.region].terrain === E.season(s) ? 1.5 : 0);
      return 1;
    case 'quarry': {
      const nb = E.buildingsOnMap(s, f);
      return (nb < 6 && p.stone < E.SETT_COST[nb] && p.hand.length >= 3 && KEEP[card.type] <= 2) ? 3 : (p.hand.length >= 5 && KEEP[card.type] <= 1 ? 1 : -1);
    }
    case 'trade': return (p.coins < 3 && KEEP[card.type] <= 2) ? 3 : (p.hand.length >= 5 && KEEP[card.type] <= 1 ? 1 : -1);
    case 'build': return 11 + (f === 'badger' ? E.SETT_VP[E.buildingsOnMap(s, f)] : 2) - Math.min(3, enemyNear(s, f, a.region) * 0.3);
    case 'muster': case 'hatch': return 8;
    case 'hire': return 4 + (enemyNear(s, f, a.region) > 2 ? 2 : 0) - (p.coins < 4 ? 2 : 0);
    case 'burst': return 3 + (R[a.region].terrain === E.season(s) ? 2 : 0) + (enemyNear(s, f, a.region) > 2 ? 1.5 : 0);
    case 'fight': {
      const mine = E.critters(s, a.region, f), theirs = E.critters(s, a.region, a.target);
      const tb = E.buildingsOf(s, a.region, a.target);
      const ad = dice(s, f, a.region, mine), dd = theirs ? dice(s, a.target, a.region, theirs) + (tb ? 1 : 0) : 0;
      let v = 2 + (ad - dd) * 1.5 + tb * 3 + (theirs ? 0 : 3);
      if (f === 'owl') v += Math.min(theirs, 2) * 1.5;
      if (ad < 2 && f !== 'owl') v -= 3;
      // pick on the leader
      const lead = Math.max(...s.players.map(q => q.renown));
      if (E.P(s, a.target).renown === lead && lead > 10) v += 1.5;
      return v;
    }
    case 'move': {
      const n = a.max;
      const fromB = E.buildingsOf(s, a.from, f), keep = fromB ? Math.max(1, Math.min(3, enemyNear(s, f, a.from))) : 0;
      if (n - keep < 1) return -5;
      let v = 1;
      const to = a.to, ruler = E.ruler(s, to);
      const enemies = s.players.filter(q => q.faction !== f).reduce((k, q) => k + E.pieces(s, to, q.faction), 0);
      if (ruler !== f) v += 2;
      if (E.freeSlots(s, to) > 0 && E.FACTIONS[f].building) v += 1.5;
      if (f === 'otter' && E.RIVERSIDE[to] && !E.buildingsOf(s, to, f)) v += 2;
      if (f === 'otter' && ruler && ruler !== f) v += 0.5;
      if (f === 'rabbit' && R[to].terrain === E.season(s)) v += 2;
      if (f === 'rabbit' && R[to].terrain === ['meadow', 'marsh', 'grove'][s.round % 3]) v += 1;
      if (enemies > n - keep + 1) v -= 3;
      if (ruler === f && E.critters(s, to, f) > 3) v -= 2;
      if (E.critters(s, a.from, f) - (n - keep) === 0 && E.ruler(s, a.from) === f && fromB) v -= 4;
      return v;
    }
  }
  return 0;
}

function moveCount(s, f, a) {
  const fromB = E.buildingsOf(s, a.from, f), keep = fromB ? Math.max(1, Math.min(3, enemyNear(s, f, a.from))) : (a.max > 3 ? 1 : 0);
  return Math.max(1, a.max - keep);
}

function chooseAction(s, f) {
  const acts = E.listActions(s, f);
  if (!acts.length) return null;
  let best = null, bv = -Infinity;
  for (const a of acts) {
    const v = scoreAction(s, f, a) + Math.random() * 0.8;
    if (v > bv) { bv = v; best = a; }
  }
  if (s.phase === 'main' && bv < 0.5) best = acts.find(a => a.type === 'end');
  const out = { ...best };
  if (out.type === 'move') out.count = moveCount(s, f, best);
  return out;
}

const api = { chooseAction };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ThornAI = api;
})(typeof window !== 'undefined' ? window : globalThis);
