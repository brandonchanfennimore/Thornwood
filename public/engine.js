// Thornwood — game engine (shared by server and browser)
(function (root) {
  'use strict';

  const TERRAINS = ['meadow', 'marsh', 'grove'];
  const REGIONS = [
    { name: 'Oakhollow',   terrain: 'grove',  slots: 2, x: 120, y: 110 },
    { name: 'Fernbank',    terrain: 'marsh',  slots: 1, x: 350, y: 85 },
    { name: 'Thistledown', terrain: 'meadow', slots: 2, x: 590, y: 105 },
    { name: 'Brambleside', terrain: 'grove',  slots: 1, x: 860, y: 100 },
    { name: 'Mossmere',    terrain: 'marsh',  slots: 2, x: 215, y: 300 },
    { name: 'Stonecrop',   terrain: 'meadow', slots: 2, x: 450, y: 275 },
    { name: 'Reedwater',   terrain: 'marsh',  slots: 2, x: 690, y: 290 },
    { name: 'Hazelden',    terrain: 'meadow', slots: 1, x: 905, y: 330 },
    { name: 'Willowmere',  terrain: 'grove',  slots: 2, x: 100, y: 520 },
    { name: 'Cloverfield', terrain: 'meadow', slots: 1, x: 330, y: 495 },
    { name: 'Mirefen',     terrain: 'marsh',  slots: 1, x: 570, y: 470 },
    { name: 'Ashgrove',    terrain: 'grove',  slots: 2, x: 830, y: 540 },
    { name: 'Lowmeadow',   terrain: 'meadow', slots: 2, x: 480, y: 640 },
  ];
  const EDGES = [
    [0, 1], [0, 4], [1, 2], [1, 4], [1, 5], [2, 3], [2, 5], [2, 6], [3, 6], [3, 7],
    [4, 5], [4, 8], [4, 9], [5, 6], [5, 9], [5, 10], [6, 7], [6, 10], [6, 11], [7, 11],
    [8, 9], [9, 10], [9, 12], [10, 11], [10, 12], [11, 12],
  ];
  const RIVER = [[1, 5], [4, 5], [5, 10], [6, 10], [10, 12]];
  const ADJ = REGIONS.map((_, i) => EDGES.filter(e => e.includes(i)).map(e => (e[0] === i ? e[1] : e[0])));
  const isRiver = (a, b) => RIVER.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const RIVERSIDE = REGIONS.map((_, i) => RIVER.some(e => e.includes(i)));

  const FACTIONS = {
    badger: { name: 'Badger Clans',   short: 'Badgers', color: '#4b4f58', critters: 20, building: 'sett', maxB: 6, start: 0 },
    rabbit: { name: 'Rabbit Warrens', short: 'Rabbits', color: '#d9822b', critters: 28, building: null,   maxB: 0, start: 3 },
    owl:    { name: 'Owl Parliament', short: 'Owls',    color: '#7b5ea7', critters: 10, building: 'nest', maxB: 4, start: 8 },
    otter:  { name: 'Otter Company',  short: 'Otters',  color: '#2f7fb5', critters: 14, building: 'post', maxB: 5, start: 12 },
  };
  const FACTION_KEYS = Object.keys(FACTIONS);

  const WIN = 30, MAX_ROUNDS = 20, HAND_LIMIT = 5;
  const SETT_COST = [0, 1, 2, 2, 3, 3];   // stone to place a sett, indexed by setts already on the map
  const SETT_VP = [0, 1, 1, 2, 2, 3];     // renown for placing it
  const OWL_NEST_VP = [0, 0, 1, 2, 3];
  const OTTER_COST = { move: 1, fight: 2, hire: 2, post: 3 };

  const CARD_TYPES = {
    ambush:    { name: 'Ambush',    text: 'Triggers by itself when you are attacked in a matching region: deal 2 hits first. The attacker can cancel it with a matching Ambush.' },
    rally:     { name: 'Rally',     text: 'Place 2 critters (owls: 1) in a matching region where you have a piece.' },
    forage:    { name: 'Forage',    text: 'Gain 2 renown if you rule 2 or more regions of this terrain.' },
    hasten:    { name: 'Hasten',    text: '+1 action this turn (otters: +2 coins).' },
    provision: { name: 'Provision', text: 'Draw 2 cards.' },
    moon:      { name: 'Moonlight', text: 'Wild: pays any terrain cost. Play it to draw 1 card and get +1 action (otters: +1 coin).' },
  };

  // ---------- helpers ----------
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function buildDeck() {
    let id = 1; const cards = [];
    for (const t of TERRAINS) {
      for (const [type, n] of [['ambush', 2], ['rally', 3], ['forage', 3], ['hasten', 2], ['provision', 2]]) {
        for (let i = 0; i < n; i++) cards.push({ id: id++, terrain: t, type });
      }
    }
    for (let i = 0; i < 6; i++) cards.push({ id: id++, terrain: 'moon', type: 'moon' });
    return shuffle(cards);
  }
  const P = (s, f) => s.players.find(p => p.faction === f);
  const fname = f => FACTIONS[f].short;
  const critters = (s, r, f) => s.regions[r].c[f] || 0;
  const buildingsOf = (s, r, f) => s.regions[r].b.filter(b => b === f).length;
  const pieces = (s, r, f) => critters(s, r, f) + buildingsOf(s, r, f);
  const onMap = (s, f) => s.regions.reduce((n, R) => n + (R.c[f] || 0), 0);
  const buildingsOnMap = (s, f) => s.regions.reduce((n, R) => n + R.b.filter(b => b === f).length, 0);
  const supply = (s, f) => FACTIONS[f].critters - onMap(s, f);
  const freeSlots = (s, r) => REGIONS[r].slots - s.regions[r].b.length;
  const season = s => TERRAINS[(s.round - 1) % 3];
  const matches = (card, t) => card.terrain === t || card.terrain === 'moon';
  const cardName = c => `${c.terrain === 'moon' ? '' : cap(c.terrain) + ' '}${CARD_TYPES[c.type].name}`;
  function cap(x) { return x[0].toUpperCase() + x.slice(1); }

  function ruler(s, r) {
    let best = null, bv = 0, tie = false;
    for (const p of s.players) {
      const v = pieces(s, r, p.faction);
      if (v > bv) { best = p.faction; bv = v; tie = false; } else if (v === bv && v > 0) tie = true;
    }
    return tie ? null : best;
  }
  const rules = (s, f, r) => ruler(s, r) === f;
  const ruledCount = (s, f, t) => REGIONS.reduce((n, R, i) => n + ((!t || R.terrain === t) && rules(s, f, i) ? 1 : 0), 0);

  function log(s, msg) { s.logN = (s.logN || 0) + 1; s.log.push(msg); if (s.log.length > 200) s.log.shift(); }
  function place(s, r, f, n) {
    n = Math.max(0, Math.min(n, supply(s, f)));
    if (n) s.regions[r].c[f] = critters(s, r, f) + n;
    return n;
  }
  function draw(s, p, n) {
    let got = 0;
    for (let i = 0; i < n; i++) {
      if (!s.deck.length) { s.deck = shuffle(s.discard); s.discard = []; }
      if (!s.deck.length) break;
      p.hand.push(s.deck.pop()); got++;
    }
    return got;
  }
  function takeCard(s, p, id) {
    const i = p.hand.findIndex(c => c.id === id);
    if (i < 0) return null;
    const [c] = p.hand.splice(i, 1);
    s.discard.push(c);
    return c;
  }
  function gain(s, f, n, why) {
    if (n <= 0 || s.winner) return;
    const p = P(s, f);
    p.renown += n;
    if (why) log(s, `${fname(f)} gain ${n} renown (${why}).`);
    if (p.renown >= WIN) { s.winner = f; s.phase = 'over'; log(s, `🏆 ${p.name} (${fname(f)}) reach ${WIN} renown and win!`); }
  }
  const CARD_KEEP = { moon: 5, ambush: 4, forage: 3, rally: 2, provision: 2, hasten: 1 };
  function costCard(p, t) {
    const opts = p.hand.filter(c => matches(c, t));
    opts.sort((a, b) => CARD_KEEP[a.type] - CARD_KEEP[b.type]);
    return opts[0] || null;
  }
  function within2(r) {
    const set = new Set(ADJ[r]);
    for (const a of ADJ[r]) for (const b of ADJ[a]) set.add(b);
    set.delete(r);
    return [...set];
  }

  // ---------- setup & turn flow ----------
  function newGame(seats) {
    const s = {
      players: seats.map(x => ({ faction: x.faction, name: x.name, ai: !!x.ai, renown: 0, hand: [], stone: 0, coins: 0 })),
      regions: REGIONS.map(() => ({ c: {}, b: [] })),
      deck: buildDeck(), discard: [], current: 0, round: 1, phase: 'main',
      actionsLeft: 0, flags: {}, log: [], winner: null, lastBattle: null, seq: 0,
    };
    for (const p of s.players) {
      const f = p.faction, st = FACTIONS[f].start;
      if (f === 'badger') { s.regions[st].b.push('badger'); place(s, st, f, 2); for (const a of ADJ[st]) place(s, a, f, 1); }
      if (f === 'rabbit') { place(s, st, f, 4); place(s, 7, f, 2); }
      if (f === 'owl') { s.regions[st].b.push('owl'); place(s, st, f, 3); }
      if (f === 'otter') { s.regions[st].b.push('otter'); place(s, st, f, 3); p.coins = 2; }
      draw(s, p, 4);
    }
    log(s, 'The war for Thornwood begins. First to 30 renown wins.');
    startTurn(s);
    return s;
  }

  function startTurn(s) {
    const p = s.players[s.current], f = p.faction;
    s.flags = {}; s.phase = 'main'; s.actionsLeft = 0;
    log(s, `— Round ${s.round} (${season(s)} season): ${p.name}'s turn (${fname(f)}) —`);
    if (f === 'badger') {
      const n = buildingsOnMap(s, f); p.stone = Math.min(10, p.stone + n); s.actionsLeft = 3;
      log(s, `Badgers gather ${n} stone (now ${p.stone}).`);
    } else if (f === 'rabbit') {
      const ruled = REGIONS.map((_, i) => i).filter(i => rules(s, f, i)).sort((a, b) => critters(s, a, f) - critters(s, b, f)).slice(0, 4);
      let n = 0; for (const r of ruled) n += place(s, r, f, 1);
      log(s, `Rabbits breed: +${n} rabbit${n === 1 ? '' : 's'}.`);
      s.actionsLeft = 3;
    } else if (f === 'owl') {
      s.actionsLeft = 2 + buildingsOnMap(s, f);
      log(s, `Owls take wing with ${s.actionsLeft} actions.`);
    } else if (f === 'otter') {
      const inc = 1 + buildingsOnMap(s, f); p.coins = Math.min(12, p.coins + inc);
      log(s, `Otters collect ${inc} coins.`);
    }
  }

  function endTurn(s) {
    const p = s.players[s.current], f = p.faction;
    let d = 1;
    if (f === 'badger') {
      const n = s.regions.reduce((k, R, i) => k + (REGIONS[i].terrain === season(s) ? R.b.filter(b => b === f).length : 0), 0);
      gain(s, f, n, `setts in ${season(s)}`);
      if (buildingsOnMap(s, f) >= 4) d++;
    } else if (f === 'rabbit') {
      const n = ruledCount(s, f, season(s)) + Math.floor(ruledCount(s, f) / 3);
      gain(s, f, n, `ruling the ${season(s)}`);
    } else if (f === 'owl') {
      gain(s, f, OWL_NEST_VP[buildingsOnMap(s, f)], 'nests');
    } else if (f === 'otter') {
      let n = 0;
      s.regions.forEach((R, i) => { const k = R.b.filter(b => b === f).length; if (k) { const rl = ruler(s, i); n += k * (rl && rl !== f ? 2 : 1); } });
      const posts = buildingsOnMap(s, f);
            gain(s, f, n, 'trade');
      if (posts >= 3) d++;
    }
    if (s.phase === 'over') return;
    const got = draw(s, p, d);
    log(s, `${fname(f)} draw ${got} card${got === 1 ? '' : 's'}.`);
    if (p.hand.length > HAND_LIMIT) { s.phase = 'discard'; return; }
    nextTurn(s);
  }

  function nextTurn(s) {
    if (s.winner) return;
    s.current = (s.current + 1) % s.players.length;
    if (s.current === 0) s.round++;
    if (s.round > MAX_ROUNDS) {
      const best = s.players.slice().sort((a, b) => b.renown - a.renown)[0];
      s.winner = best.faction; s.phase = 'over';
      log(s, `The seasons run out. ${best.name} (${fname(best.faction)}) win with the most renown.`);
      return;
    }
    startTurn(s);
  }

  // ---------- actions ----------
  function canPay(s, p, kind) {
    return p.faction === 'otter' ? p.coins >= OTTER_COST[kind] : s.actionsLeft > 0;
  }
  function pay(s, p, kind) {
    if (p.faction === 'otter') p.coins -= OTTER_COST[kind]; else s.actionsLeft--;
  }

  function listActions(s, f) {
    if (s.phase === 'over' || s.players[s.current].faction !== f) return [];
    const p = P(s, f), out = [], N = REGIONS.length, RN = i => REGIONS[i].name;
    if (s.phase === 'discard') {
      for (const c of p.hand) out.push({ type: 'discard', card: c.id, label: `Discard ${cardName(c)}` });
      return out;
    }
    out.push({ type: 'end', label: 'End turn' });

    for (const c of p.hand) {
      const nm = cardName(c);
      if (c.type === 'forage' && ruledCount(s, f, c.terrain) >= 2) out.push({ type: 'card', card: c.id, label: `Play ${nm}: +2 renown` });
      if (c.type === 'rally' && supply(s, f) > 0) {
        for (let r = 0; r < N; r++) if (REGIONS[r].terrain === c.terrain && pieces(s, r, f) > 0)
          out.push({ type: 'card', card: c.id, region: r, label: `Play ${nm} in ${RN(r)}` });
      }
      if (c.type === 'hasten') out.push({ type: 'card', card: c.id, label: `Play ${nm}: ${f === 'otter' ? '+2 coins' : '+1 action'}` });
      if (c.type === 'provision') out.push({ type: 'card', card: c.id, label: `Play ${nm}: draw 2` });
      if (c.type === 'moon') out.push({ type: 'card', card: c.id, label: `Play ${nm}: draw 1, ${f === 'otter' ? '+1 coin' : '+1 action'}` });
      if (f === 'badger' && p.stone < 10) out.push({ type: 'quarry', card: c.id, label: `Quarry: discard ${nm} for 1 stone` });
      if (f === 'otter' && p.coins < 12) out.push({ type: 'trade', card: c.id, label: `Trade: sell ${nm} for 1 coin` });
    }

    if (canPay(s, p, 'move')) {
      for (let r = 0; r < N; r++) {
        const n = critters(s, r, f); if (!n) continue;
        const dests = f === 'owl' ? within2(r) : ADJ[r];
        for (const d of dests) {
          if (f === 'owl' || (f === 'otter' && isRiver(r, d)) || rules(s, f, r) || rules(s, f, d))
            out.push({ type: 'move', from: r, to: d, max: n, label: `${f === 'owl' ? 'Fly' : 'Move'} ${RN(r)} → ${RN(d)}` });
        }
      }
    }
    if (canPay(s, p, 'fight')) {
      for (let r = 0; r < N; r++) {
        if (!critters(s, r, f)) continue;
        for (const q of s.players) if (q.faction !== f && pieces(s, r, q.faction) > 0)
          out.push({ type: 'fight', region: r, target: q.faction, label: `Attack ${fname(q.faction)} in ${RN(r)}` });
      }
    }

    const nb = buildingsOnMap(s, f);
    if (f === 'badger' && s.actionsLeft > 0) {
      if (!s.flags.mustered && nb > 0 && supply(s, f) > 0) out.push({ type: 'muster', label: 'Muster: +1 badger at each sett' });
      if (nb < 6 && p.stone >= SETT_COST[nb]) {
        for (let r = 0; r < N; r++) if (freeSlots(s, r) > 0 && rules(s, f, r))
          out.push({ type: 'build', region: r, label: `Dig a sett in ${RN(r)} (${SETT_COST[nb]} stone, +${SETT_VP[nb]} renown)` });
      }
    }
    if (f === 'owl' && s.actionsLeft > 0) {
      if (!s.flags.hatched && nb > 0 && supply(s, f) > 0) out.push({ type: 'hatch', label: 'Hatch: +1 owl at each nest' });
      if (nb < 4) for (let r = 0; r < N; r++)
        if (critters(s, r, f) && freeSlots(s, r) > 0 && rules(s, f, r) && costCard(p, REGIONS[r].terrain))
          out.push({ type: 'build', region: r, label: `Build a nest in ${RN(r)} (pay a ${REGIONS[r].terrain} card)` });
    }
    if (f === 'rabbit' && s.actionsLeft > 0 && supply(s, f) > 0) {
      for (let r = 0; r < N; r++) if (critters(s, r, f) && costCard(p, REGIONS[r].terrain))
        out.push({ type: 'burst', region: r, label: `Burrow burst in ${RN(r)}: +3 rabbits (pay a ${REGIONS[r].terrain} card)` });
    }
    if (f === 'otter') {
      if (p.coins >= OTTER_COST.hire && supply(s, f) > 0)
        for (let r = 0; r < N; r++) if (buildingsOf(s, r, f)) out.push({ type: 'hire', region: r, label: `Hire 2 otters at ${RN(r)} (2 coins)` });
      if (p.coins >= OTTER_COST.post && nb < 5)
        for (let r = 0; r < N; r++) if (RIVERSIDE[r] && critters(s, r, f) && freeSlots(s, r) > 0 && costCard(p, REGIONS[r].terrain))
          out.push({ type: 'build', region: r, label: `Open a trading post in ${RN(r)} (3 coins + ${REGIONS[r].terrain} card)` });
    }
    return out;
  }

  const KEYS = ['type', 'card', 'region', 'from', 'to', 'target'];
  const same = (a, b) => KEYS.every(k => (a[k] === undefined ? undefined : a[k]) === (b[k] === undefined ? undefined : b[k]));

  function apply(s, f, a) {
    const m = listActions(s, f).find(x => same(x, a));
    if (!m) throw new Error('That action is not allowed right now.');
    const p = P(s, f), RN = i => REGIONS[i].name;
    s.seq++;
    switch (a.type) {
      case 'discard': { const c = takeCard(s, p, a.card); log(s, `${fname(f)} discard ${cardName(c)}.`); if (p.hand.length <= HAND_LIMIT) nextTurn(s); break; }
      case 'end': endTurn(s); break;
      case 'card': {
        const c = takeCard(s, p, a.card);
        log(s, `${fname(f)} play ${cardName(c)}.`);
        if (c.type === 'forage') gain(s, f, 2, 'forage');
        if (c.type === 'rally') { const n = place(s, a.region, f, f === 'owl' ? 1 : 2); log(s, `+${n} ${fname(f)} in ${RN(a.region)}.`); }
        if (c.type === 'hasten') { if (f === 'otter') p.coins = Math.min(12, p.coins + 2); else s.actionsLeft++; }
        if (c.type === 'provision') draw(s, p, 2);
        if (c.type === 'moon') { draw(s, p, 1); if (f === 'otter') p.coins = Math.min(12, p.coins + 1); else s.actionsLeft++; }
        break;
      }
      case 'quarry': { const c = takeCard(s, p, a.card); p.stone++; log(s, `Badgers quarry ${cardName(c)} for 1 stone.`); break; }
      case 'trade': { const c = takeCard(s, p, a.card); p.coins++; log(s, `Otters sell ${cardName(c)} for 1 coin.`); break; }
      case 'move': {
        const n = Math.max(1, Math.min(m.max, Math.floor(Number(a.count) || m.max)));
        pay(s, p, 'move');
        s.regions[a.from].c[f] -= n; s.regions[a.to].c[f] = critters(s, a.to, f) + n;
        log(s, `${fname(f)} move ${n} from ${RN(a.from)} to ${RN(a.to)}.`);
        if (f !== 'otter' && buildingsOf(s, a.to, 'otter') && P(s, 'otter')) {
          const o = P(s, 'otter'); o.coins = Math.min(12, o.coins + 1); log(s, `Otters collect a toll in ${RN(a.to)}.`);
        }
        break;
      }
      case 'fight': pay(s, p, 'fight'); battle(s, f, a.target, a.region); break;
      case 'muster': {
        s.actionsLeft--; s.flags.mustered = true; let n = 0;
        s.regions.forEach((R, i) => { for (const b of R.b) if (b === f) n += place(s, i, f, 1); });
        log(s, `Badgers muster ${n} warriors.`); break;
      }
      case 'hatch': {
        s.actionsLeft--; s.flags.hatched = true; let n = 0;
        s.regions.forEach((R, i) => { for (const b of R.b) if (b === f) n += place(s, i, f, 1); });
        log(s, `Owls hatch ${n} owlets.`); break;
      }
      case 'build': {
        const nb = buildingsOnMap(s, f), t = REGIONS[a.region].terrain;
        if (f === 'badger') { p.stone -= SETT_COST[nb]; s.actionsLeft--; s.regions[a.region].b.push(f); log(s, `Badgers dig a sett in ${RN(a.region)}.`); gain(s, f, SETT_VP[nb], 'new sett'); }
        if (f === 'owl') { const c = costCard(p, t); takeCard(s, p, c.id); s.actionsLeft--; s.regions[a.region].b.push(f); log(s, `Owls build a nest in ${RN(a.region)}.`); }
        if (f === 'otter') { const c = costCard(p, t); takeCard(s, p, c.id); p.coins -= OTTER_COST.post; s.regions[a.region].b.push(f); log(s, `Otters open a trading post in ${RN(a.region)}.`); gain(s, f, 1, 'new post'); }
        break;
      }
      case 'burst': {
        const c = costCard(p, REGIONS[a.region].terrain); takeCard(s, p, c.id); s.actionsLeft--;
        const n = place(s, a.region, f, 3); log(s, `Rabbits burst out in ${RN(a.region)}: +${n}.`); break;
      }
      case 'hire': {
        p.coins -= OTTER_COST.hire; const n = place(s, a.region, f, 2); log(s, `Otters hire ${n} in ${RN(a.region)}.`); break;
      }
    }
    return s;
  }

  // ---------- battle ----------
  function removeHits(s, f, r, hits, by, hunting) {
    const R = s.regions[r]; let rc = 0, rb = 0;
    while (hits > 0 && (R.c[f] || 0) > 0) { R.c[f]--; hits--; rc++; }
    while (hits > 0) { const i = R.b.indexOf(f); if (i < 0) break; R.b.splice(i, 1); hits--; rb++; }
    let why = [];
    if (rb) why.push(`${rb} ${FACTIONS[f].building} destroyed`);
    if (hunting && rc) why.push('hunt');
    gain(s, by, rb + (hunting && rc ? 1 : 0), why.join(', '));
    return { rc, rb };
  }
  const diceFor = (s, f, r) => f === 'owl' ? Math.min(4, critters(s, r, f) * 2) : Math.min(3, critters(s, r, f));
  const roll = n => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6));

  function battle(s, att, def, r) {
    const ap = P(s, att), dp = P(s, def), t = REGIONS[r].terrain;
    const res = { region: r, att, def, attRolls: [], defRolls: [], notes: [], seq: s.seq };
    s.lastBattle = res;
    log(s, `⚔ ${fname(att)} attack ${fname(def)} in ${REGIONS[r].name}.`);
    const amb = dp.hand.find(c => c.type === 'ambush' && c.terrain === t);
    if (amb) {
      takeCard(s, dp, amb.id);
      const counter = ap.hand.find(c => c.type === 'ambush' && c.terrain === t);
      if (counter) { takeCard(s, ap, counter.id); res.notes.push('Ambush! …countered by an ambush of their own.'); log(s, `${fname(def)} spring an ambush, but ${fname(att)} counter it.`); }
      else {
        const x = removeHits(s, att, r, 2, def, false);
        res.notes.push(`Ambush! ${fname(att)} lose ${x.rc + x.rb}.`); log(s, `${fname(def)} spring an ambush: 2 hits.`);
        if (!critters(s, r, att) || s.winner) { res.notes.push('The attack is broken.'); return; }
      }
    }
    const defCritters = critters(s, r, def);
    const ad = diceFor(s, att, r);
    const dd = defCritters ? diceFor(s, def, r) + (buildingsOf(s, r, def) ? 1 : 0) : 0;
    res.attRolls = roll(ad); res.defRolls = roll(dd);
    const defNeed = def === 'badger' ? 3 : 4;
    let ah = res.attRolls.filter(x => x >= 4).length, dh = res.defRolls.filter(x => x >= defNeed).length;
    if (!defCritters) { ah++; res.notes.push('Defenseless: +1 hit.'); }
    res.attHits = ah; res.defHits = dh;
    const xd = removeHits(s, def, r, ah, att, att === 'owl');
    const xa = removeHits(s, att, r, dh, def, false);
    res.defLost = xd.rc + xd.rb; res.attLost = xa.rc + xa.rb;
    res.notes.push(`${fname(att)} deal ${ah} hit${ah === 1 ? '' : 's'}, ${fname(def)} deal ${dh}.`);
    log(s, `Rolls: ${fname(att)} [${res.attRolls.join(' ')}] vs ${fname(def)} [${res.defRolls.join(' ')}] → ${fname(def)} lose ${xd.rc + xd.rb}, ${fname(att)} lose ${xa.rc + xa.rb}.`);
  }

  // ---------- view ----------
  function viewFor(s, f) {
    const v = JSON.parse(JSON.stringify(s));
    v.deckCount = s.deck.length; delete v.deck;
    v.discardCount = s.discard.length; delete v.discard;
    v.players.forEach(p => { p.handCount = p.hand.length; if (p.faction !== f) p.hand = []; });
    v.log = s.log.slice(-60);
    v.me = f || null;
    v.actions = f ? listActions(s, f) : [];
    v.season = season(s);
    return v;
  }

  const api = {
    TERRAINS, REGIONS, EDGES, RIVER, ADJ, RIVERSIDE, FACTIONS, FACTION_KEYS, CARD_TYPES, WIN, MAX_ROUNDS, HAND_LIMIT,
    SETT_COST, SETT_VP, OTTER_COST, OWL_NEST_VP,
    newGame, listActions, apply, viewFor, ruler, rules, critters, buildingsOf, pieces, supply, buildingsOnMap,
    ruledCount, season, isRiver, within2, cardName, freeSlots, P,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
