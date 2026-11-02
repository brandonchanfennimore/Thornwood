// Thornwood — artifact client: illustrated board, physical pieces, card dock, and step-by-step playback of every move.
(() => {
  const E = window.Engine, AI = window.ThornAI;
  const $ = id => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  const AI_NAMES = { badger: 'Old Brock', rabbit: 'Clover', owl: 'Hootsworth', otter: 'Captain Slick' };
  const VB = { badger: '-14 -17 28 32', rabbit: '-14 -21 28 36', owl: '-14 -18 28 33', otter: '-14 -16 28 31' };
  const PIECE_H = { badger: 32, rabbit: 36, owl: 33, otter: 31 };
  const emblem = (f, size = 40) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#m-${f}" width="100%" height="100%"/></svg>`;
  const R = E.REGIONS;

  // ---------- state ----------
  let db = null, me = null, mode = null, game = null, docRef = null, unsub = null, writing = false;
  let shown = null, latest = null, gid = null, queue = [], playing = false, aiTimer = null, stallTimer = null;
  let sel = null, moveCount = null, feed = [], speed = +(ls.get('tw-speed') || 1), toastTimer = null;

  // ---------- boot ----------
  (async () => {
    try {
      const [d, u] = await Promise.all([window.claude?.use?.('db'), window.claude?.use?.('user')]);
      db = d || null;
      if (u) { try { me = await u.id(); } catch {} }
    } catch {}
    if (!me) { me = ls.get('tw-local-id'); if (!me) { me = 'local-' + Math.random().toString(36).slice(2, 10); ls.set('tw-local-id', me); } }
    $('onlineBox').hidden = !db; $('offlineNote').hidden = !!db;
    if (db && /^#[A-Z]{4}$/i.test(location.hash) && !mode) joinRoom(location.hash.slice(1).toUpperCase());
  })();
  drawTerrain();
  document.querySelectorAll('#speed button').forEach(b => {
    b.classList.toggle('on', +b.dataset.s === speed);
    b.onclick = () => { speed = +b.dataset.s; ls.set('tw-speed', speed); document.querySelectorAll('#speed button').forEach(x => x.classList.toggle('on', x === b)); };
  });

  function show(id) { for (const s of ['home', 'lobby', 'game']) $(s).hidden = s !== id; }
  function err(id, m) { $(id).textContent = m || ''; }
  function toast(html) { const t = $('toast'); t.innerHTML = html; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 4000); }

  // ---------- home ----------
  $('nameIn').value = ls.get('tw-name') || '';
  const myName = () => { const n = ($('nameIn').value.trim() || 'Wanderer').replace(/[<>&"]/g, '').slice(0, 20); ls.set('tw-name', n); return n; };
  if (/^#[A-Z]{4}$/i.test(location.hash)) $('codeIn').value = location.hash.slice(1).toUpperCase();
  const seatsToPlayers = seats => seats.map(s => ({ faction: s.faction, name: s.type === 'ai' ? AI_NAMES[s.faction] : s.name, ai: s.type === 'ai' }));
  const newGid = () => Math.random().toString(36).slice(2, 10);

  $('soloBtn').onclick = () => {
    const f = $('soloFaction').value, n = +$('soloCount').value;
    const others = E.FACTION_KEYS.filter(x => x !== f).sort(() => Math.random() - 0.5).slice(0, n - 1);
    const seats = [{ faction: f, type: 'human', uid: me, name: myName() }, ...others.map(x => ({ faction: x, type: 'ai' }))]
      .sort((a, b) => E.FACTION_KEYS.indexOf(a.faction) - E.FACTION_KEYS.indexOf(b.faction));
    mode = 'solo';
    receive({ seats, status: 'playing', hostId: me, gid: newGid(), state: E.newGame(seatsToPlayers(seats)), last: null });
  };
  const code = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  $('createBtn').onclick = async () => {
    err('homeErr');
    if (!db) return err('homeErr', 'Online play needs this page opened in Claude while signed in.');
    const c = code();
    try {
      await db.doc('games/' + c).set({ code: c, hostId: me, status: 'lobby', rev: 1, seats: [{ faction: 'badger', type: 'human', uid: me, name: myName() }, { faction: 'owl', type: 'ai' }], state: null, last: null });
      openRoom(c);
    } catch (e) { err('homeErr', e.code === 'invalid_argument' ? 'You can only view this page, so you can\'t create games. Ask the owner for Contributor access.' : 'Could not create the game: ' + e.message); }
  };
  $('joinBtn').onclick = () => joinRoom($('codeIn').value.trim().toUpperCase());
  $('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom($('codeIn').value.trim().toUpperCase()); });

  async function joinRoom(c) {
    err('homeErr');
    if (!db) return err('homeErr', 'Online play needs this page opened in Claude while signed in.');
    if (!/^[A-Z]{4}$/.test(c)) return err('homeErr', 'Room codes are 4 letters.');
    const ref = db.doc('games/' + c);
    try {
      const lease = await ref.acquire({ holder: me, ttlMs: 4000 });
      if (!lease.acquired) return err('homeErr', 'Someone else is joining right now. Try again in a moment.');
      const snap = await ref.get();
      if (!snap.exists) return err('homeErr', 'No game with that code.');
      const g = clone(snap.data());
      if (!g.seats.some(s => s.uid === me)) {
        if (g.status !== 'lobby') return err('homeErr', 'That game has already started.');
        let seat = g.seats.find(s => s.type === 'open');
        if (!seat) {
          if (g.seats.length >= 4) return err('homeErr', 'That game is full.');
          seat = { faction: E.FACTION_KEYS.find(f => !g.seats.some(s => s.faction === f)) }; g.seats.push(seat);
        }
        Object.assign(seat, { type: 'human', uid: me, name: myName() });
        g.rev++; await ref.set(g);
      }
      openRoom(c);
    } catch (e) { err('homeErr', e.code === 'invalid_argument' ? 'You can only view this page, so you can\'t join. Ask the owner for Contributor access.' : 'Could not join: ' + e.message); }
  }
  function openRoom(c) {
    mode = 'online';
    try { history.replaceState(null, '', '#' + c); } catch {}
    if (unsub) unsub();
    docRef = db.doc('games/' + c);
    const t = setTimeout(() => toast('Still connecting to the game…'), 10000);
    unsub = docRef.onSnapshot(snap => {
      clearTimeout(t);
      if (!snap.exists) return toast('That game no longer exists.');
      receive(clone(snap.data()));
    }, e => toast('Lost connection to the game (' + esc(e.code) + '). Reload the page to reconnect.'));
  }
  async function save(g) {
    if (mode === 'solo') return receive(g);
    if (writing) return;
    writing = true; g.rev = (g.rev || 0) + 1;
    try { await docRef.set(g); } catch (e) { toast('Could not save that move: ' + esc(e.message)); } finally { writing = false; }
  }
  function leave() { if (unsub) unsub(); unsub = null; clearTimeout(aiTimer); clearTimeout(stallTimer); game = null; mode = null; shown = latest = null; queue = []; show('home'); $('roomTag').hidden = true; }
  $('homeLink').onclick = leave; $('leaveBtn').onclick = leave;

  // ---------- lobby ----------
  const isHost = () => game && game.hostId === me;
  function renderLobby() {
    const g = game, host = isHost();
    $('lobbyCode').textContent = g.code;
    const fopts = cur => E.FACTION_KEYS.map(f => `<option value="${f}" ${f === cur ? 'selected' : ''}>${E.FACTIONS[f].name}</option>`).join('');
    $('seats').innerHTML = g.seats.map((s, i) => {
      const you = s.uid === me;
      const label = s.type === 'open' ? '<span class="muted">Open seat: waiting for a friend</span>' : s.type === 'ai' ? `${AI_NAMES[s.faction]} <span class="tag">AI</span>` : esc(s.name) + (you ? ' <span class="tag">you</span>' : '');
      const fac = (host || you) ? `<select id="fac${i}" data-op="faction" data-i="${i}" aria-label="Faction">${fopts(s.faction)}</select>` : `<span class="tag">${E.FACTIONS[s.faction].name}</span>`;
      const ctl = host && !you ? `<select id="typ${i}" data-op="type" data-i="${i}" aria-label="Seat type"><option value="open" ${s.type !== 'ai' ? 'selected' : ''}>Human</option><option value="ai" ${s.type === 'ai' ? 'selected' : ''}>AI</option></select>
        ${g.seats.length > 2 ? `<button data-op="remove" data-i="${i}" class="ghost" aria-label="Remove seat">✕</button>` : ''}` : '';
      return `<div class="seat">${emblem(s.faction, 34)}<span class="who">${label}</span>${fac}${ctl}</div>`;
    }).join('');
    $('seats').querySelectorAll('select,button').forEach(el => { el[el.tagName === 'SELECT' ? 'onchange' : 'onclick'] = () => seatOp(el.dataset.op, +el.dataset.i, el.value); });
    $('hostRow').hidden = !host;
    $('addSeatBtn').disabled = g.seats.length >= 4;
    $('lobbyMsg').textContent = host ? 'You are the host. Friends join with the code above.' : 'Waiting for the host to start the game…';
  }
  function seatOp(op, i, value) {
    const g = clone(game), s = g.seats[i];
    if (op === 'faction') { const o = g.seats.find(x => x.faction === value); if (o) o.faction = s.faction; s.faction = value; }
    if (op === 'type') { delete s.uid; delete s.name; s.type = value === 'ai' ? 'ai' : 'open'; }
    if (op === 'remove') g.seats.splice(i, 1);
    if (op === 'add') g.seats.push({ type: 'ai', faction: E.FACTION_KEYS.find(f => !g.seats.some(x => x.faction === f)) });
    save(g);
  }
  $('addSeatBtn').onclick = () => seatOp('add');
  $('startBtn').onclick = () => {
    err('lobbyErr');
    const g = clone(game);
    if (g.seats.some(s => s.type === 'open')) return err('lobbyErr', 'Some seats are still open. Wait for friends, switch the seats to AI, or remove them.');
    Object.assign(g, { status: 'playing', gid: newGid(), state: E.newGame(seatsToPlayers(g.seats)), last: null });
    save(g);
  };
  $('copyBtn').onclick = async () => {
    try { await navigator.clipboard.writeText(game.code); $('copyBtn').textContent = 'Copied'; } catch { $('copyBtn').textContent = 'Code: ' + game.code; }
    setTimeout(() => $('copyBtn').textContent = 'Copy code', 1500);
  };

  // ---------- receiving states & playback queue ----------
  function receive(g) {
    game = g;
    if (mode === 'online') { $('roomTag').hidden = false; $('roomTag').textContent = 'Room ' + g.code; }
    if (g.status === 'lobby' || !g.state) { shown = latest = null; queue = []; show('lobby'); renderLobby(); return; }
    show('game');
    if (g.gid !== gid || !latest) {
      gid = g.gid; queue = []; feed = []; sel = null;
      shown = latest = g.state; renderAll();
      if (!ls.get('tw-tut-' + gid)) { ls.set('tw-tut-' + gid, '1'); openTutorial(0); }
      queue.push({ intro: true, prev: g.state, next: g.state });
      pump(); return;
    }
    if (g.state.seq !== latest.seq) {
      queue.push({ prev: latest, next: g.state, last: g.last });
      latest = g.state; pump();
    }
  }
  async function pump() {
    if (playing) return;
    playing = true; renderAll();
    while (queue.length) {
      while (tutOpen) await wait(200);
      const step = queue.shift();
      try { await playStep(step); } catch (e) { console.error(e); }
      shown = step.next; renderAll();
    }
    playing = false; banner(null); renderAll(); kickAI();
  }
  const idle = () => !playing && !queue.length && shown === latest;

  // ---------- AI driver ----------
  function kickAI() {
    clearTimeout(aiTimer); clearTimeout(stallTimer);
    const s = latest;
    if (!s || s.phase === 'over' || !s.players[s.current].ai || !idle() || tutOpen) return;
    const run = () => {
      if (writing || !idle() || tutOpen) return;
      const g = clone(game), st = g.state, f = st.players[st.current].faction;
      if (!st.players[st.current].ai || st.phase === 'over') return;
      let a;
      try { a = AI.chooseAction(st, f); E.apply(st, f, a); } catch (e) { a = { type: 'end' }; try { E.apply(st, f, a); } catch {} }
      g.last = { seq: st.seq, f, a: stripAct(a) };
      save(g);
    };
    if (mode === 'solo' || isHost()) aiTimer = setTimeout(run, 200 * speed);
    else if (game.seats.some(x => x.uid === me)) stallTimer = setTimeout(run, 15000);
  }
  const stripAct = a => { const { label, max, ...rest } = a; return rest; };
  const myFaction = () => { const s = game && game.seats.find(x => x.uid === me && x.type === 'human'); return s ? s.faction : null; };
  const pname = (st, f) => { const p = st.players.find(p => p.faction === f); return p ? p.name : f; };
  const short = f => E.FACTIONS[f].short;

  function doAct(a, extra) {
    if (writing || !idle()) return;
    const g = clone(game), f = myFaction(), act = { ...stripAct(a), ...extra };
    try { E.apply(g.state, f, act); } catch (e) { return toast(esc(e.message)); }
    g.last = { seq: g.state.seq, f, a: act };
    sel = null; moveCount = null;
    save(g);
  }

  // ---------- describing moves ----------
  function describe(st, f, a) {
    const who = `<b>${esc(pname(st, f))}</b>`, n = E.FACTIONS[f].short.toLowerCase();
    const p = st.players.find(p => p.faction === f);
    const card = a.card ? p.hand.find(c => c.id === a.card) : null;
    switch (a.type) {
      case 'move': { const c = a.count || 1; return `${who} ${f === 'owl' ? 'flies' : 'moves'} ${c} ${c === 1 ? n.replace(/s$/, '') : n} from ${R[a.from].name} to ${R[a.to].name}`; }
      case 'fight': return `${who} attacks the ${short(a.target)} in ${R[a.region].name}`;
      case 'muster': return `${who} musters a badger at every sett`;
      case 'hatch': return `${who} hatches an owl at every nest`;
      case 'build': return `${who} ${{ badger: 'digs a sett', owl: 'builds a nest', otter: 'opens a trading post' }[f]} in ${R[a.region].name}`;
      case 'burst': return `${who} bursts 3 rabbits out in ${R[a.region].name}`;
      case 'hire': return `${who} hires 2 otters at ${R[a.region].name}`;
      case 'card': return `${who} plays ${card ? E.cardName(card) : 'a card'}${a.region !== undefined ? ' in ' + R[a.region].name : ''}`;
      case 'quarry': return `${who} turns a card into stone`;
      case 'trade': return `${who} sells a card for a coin`;
      case 'discard': return `${who} discards a card`;
      case 'end': return `${who} ends the turn`;
    }
    return who;
  }
  function banner(html, f) {
    const b = $('banner');
    if (!html) { b.classList.add('off'); return; }
    b.innerHTML = (f ? emblem(f, 30) : `<svg width="30" height="30"><use href="#i-star" width="100%" height="100%"/></svg>`) + `<span>${html}</span>`;
    b.classList.remove('off');
  }
  function pushFeed(f, html) { feed.unshift({ f, html }); feed = feed.slice(0, 7); }

  // ---------- phases: data shown in the tracker and the tutorial ----------
  const PH_NAME = { dawn: 'Dawn', day: 'Day', dusk: 'Dusk' };
  const PH_SUB = { dawn: 'happens by itself', day: 'your actions', dusk: 'scoring & cards' };
  const phaseTag = ph => `<span class="phtag ph-${ph}">${PH_NAME[ph]}</span>`;
  const phaseIcon = (ph, s = 22) => `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#p-${ph}" width="100%" height="100%"/></svg>`;
  const MOVE = ['move', 'Move', '1 action', 'Move any number of your critters to an adjacent clearing. You must rule the clearing you leave or the one you enter.'];
  const FIGHT = ['fight', 'Attack', '1 action', 'Start a battle in a clearing where you have critters.'];
  const CARDS = ['card', 'Play cards', 'free', 'Rally, Forage, Hasten, Provision and Moonlight cards can be played at any time during your Day.'];
  const DUSK_END = [['', 'Discard', '', 'If you hold more than 5 cards, discard down to 5.']];
  const PHASES = {
    badger: {
      tag: 'Builders who dig in. Turn stone into setts and hold them stubbornly.',
      perk: 'Stubborn: when defending, badgers hit on 3+ instead of 4+.',
      dawn: [['', 'Gather stone', 'automatic', 'Gain 1 stone for every sett on the map (you can hold up to 10).']],
      dayNote: 'You have 3 actions.',
      day: [MOVE, FIGHT, ['muster', 'Muster', '1 action · once per turn', 'Add 1 badger at every sett.'], ['build', 'Dig a sett', '1 action + 1–3 stone', 'Build a sett in a clearing you rule that has a free slot. Gain 1–3 renown.'], ['quarry', 'Quarry', 'free', 'Discard a card to gain 1 stone.'], CARDS],
      dusk: [['', 'Score setts', '', 'Gain 1 renown for every sett in a clearing of the season\'s terrain.'], ['', 'Draw', '', 'Draw 1 card, or 2 if you have 4 or more setts.'], ...DUSK_END],
    },
    rabbit: {
      tag: 'A swarm. Breed fast, spread wide, and rule the land the season favors.',
      perk: 'Swarm: 28 rabbits, more critters than any other faction.',
      dawn: [['', 'Breed', 'automatic', 'Add 1 rabbit in up to 4 clearings you rule (thinnest first).']],
      dayNote: 'You have 3 actions.',
      day: [MOVE, FIGHT, ['burst', 'Burrow burst', '1 action + matching card', 'Add 3 rabbits to a clearing where you already have a rabbit. Pay a card of that clearing\'s terrain.'], CARDS],
      dusk: [['', 'Score the season', '', 'Gain 1 renown for every clearing you rule in the season\'s terrain, plus 1 for every 3 clearings you rule anywhere.'], ['', 'Draw', '', 'Draw 1 card.'], ...DUSK_END],
    },
    owl: {
      tag: 'Few, fierce and flying. Hunt the other factions and raise nests.',
      perk: 'Talons: each owl rolls 2 dice in battle (up to 4).',
      dawn: [['', 'Take wing', 'automatic', 'You get 2 actions, plus 1 for every nest on the map.']],
      dayNote: 'You have 2 actions + 1 per nest.',
      day: [['move', 'Fly', '1 action', 'Move owls up to 2 clearings away. Owls ignore rule when they fly.'], ['fight', 'Hunt', '1 action', 'Attack in a clearing with your owls. Gain 1 renown when the attack removes enemy critters.'], ['hatch', 'Hatch', '1 action · once per turn', 'Add 1 owl at every nest.'], ['build', 'Build a nest', '1 action + matching card', 'Build a nest where you have owls, rule the clearing and have a free slot.'], CARDS],
      dusk: [['', 'Score nests', '', 'Gain 0 / 1 / 2 / 3 renown for 1 / 2 / 3 / 4 nests on the map.'], ['', 'Draw', '', 'Draw 1 card.'], ...DUSK_END],
    },
    otter: {
      tag: 'River merchants. Pay coins to act and profit when others rule around your posts.',
      perk: 'Tolls: whenever another faction moves into a clearing with your post, you get 1 coin.',
      dawn: [['', 'Collect income', 'automatic', 'Gain 1 coin, plus 1 for every trading post (you can hold up to 12).']],
      dayNote: 'No action limit: every action costs coins.',
      day: [['move', 'Move', '1 coin', 'Move to an adjacent clearing. Along a river you ignore rule.'], ['fight', 'Attack', '2 coins', 'Start a battle in a clearing where you have otters.'], ['hire', 'Hire', '2 coins', 'Add 2 otters at one of your trading posts.'], ['build', 'Open a trading post', '3 coins + matching card', 'In a riverside clearing where you have an otter and a free slot. Gain 1 renown.'], ['trade', 'Sell a card', 'free', 'Discard a card to gain 1 coin.'], CARDS],
      dusk: [['', 'Score trade', '', 'Each trading post scores 1 renown, or 2 if another faction rules its clearing.'], ['', 'Draw', '', 'Draw 1 card, or 2 if you have 3 or more posts.'], ...DUSK_END],
    },
  };
  let displayPhase = 'day';

  function renderPhases() {
    const st = shown, el = $('phasePanel'); if (!st || !el) return;
    if (st.phase === 'over') { el.hidden = true; return; } el.hidden = false;
    const f = st.players[st.current].faction, P = PHASES[f], mineNow = f === myFaction();
    const avail = new Set(mineNow && idle() ? E.listActions(st, f).map(a => a.type) : []);
    const ord = ['dawn', 'day', 'dusk'], ci = ord.indexOf(displayPhase);
    const compact = mineNow && idle() && displayPhase === 'day';
    el.innerHTML = `<div class="ph-head">${emblem(f, 26)}<span><b>${mineNow ? 'Your turn' : esc(pname(st, f)) + '\'s turn'}</b> · ${E.FACTIONS[f].name}</span></div>
      <div class="ph-steps">${ord.map((ph, i) => `<div class="ph-step ${i === ci ? 'now' : i < ci ? 'done' : ''}">${phaseIcon(ph, 18)}<span>${PH_NAME[ph]}</span></div>`).join('<span class="ph-arrow">›</span>')}</div>
      ${ord.map(ph => {
        const items = P[ph], open = ph === displayPhase;
        return `<div class="ph ${open ? 'open' : ''}"><div class="ph-t">${phaseIcon(ph)}<b>${PH_NAME[ph]}</b><span class="muted">${ph === 'day' ? P.dayNote : PH_SUB[ph]}</span></div>
          ${open ? `<ul class="${compact ? 'compact' : ''}">${items.map(([k, n, c, d]) => `<li class="${ph === 'day' && mineNow && idle() && k && !avail.has(k) ? 'off' : ''}" title="${d.replace(/"/g, '&quot;')}"><b>${n}</b>${c ? `<span class="cost">${c}</span>` : ''}${compact ? '' : `<small>${d}</small>`}</li>`).join('')}</ul>${compact ? '<div class="ph-sum" style="padding-left:0">Faded actions aren\'t possible right now. Hover an action for details.</div>' : ''}`
                 : `<div class="ph-sum">${items.map(x => x[1]).join(' · ')}</div>`}</div>`;
      }).join('')}`;
  }

  // ---------- playback of one step ----------
  const NARR = /gain \d+ renown|breed|gather|take wing|collect \d+|toll|ambush|win|run out|draw \d+ card/i;
  async function narrate(lines, T) {
    for (const l of lines) {
      if (!NARR.test(l)) continue;
      const f = E.FACTION_KEYS.find(k => l.startsWith(short(k)));
      banner(phaseTag(displayPhase) + ' ' + esc(l), f); pushFeed(f, esc(l)); renderFeed(); await T(950);
    }
  }
  async function playStep(step) {
    const { prev, next, last } = step;
    const mine = last && last.f === myFaction();
    const T = ms => wait(ms * speed * (mine ? 0.55 : 1));
    if (step.intro) {
      await turnBanner(next, T);
      const h = next.log.map(l => l.startsWith('—')).lastIndexOf(true);
      await narrate(next.log.slice(h + 1), T); await dayBanner(next, T); return;
    }
    const n = (next.logN || 0) - (prev.logN || 0);
    const lines = n > 0 ? next.log.slice(-Math.min(n, next.log.length)) : [];
    const acted = last && last.seq === next.seq, isEnd = acted && last.a.type === 'end';
    if (acted && !isEnd) {
      const a = last.a, f = last.f, text = describe(prev, f, a);
      banner(phaseTag(displayPhase) + ' ' + text, f); pushFeed(f, text); renderFeed();
      [a.region, a.from, a.to].filter(x => x !== undefined).forEach(r => flash(r));
      if (a.type === 'move') await flyPieces(prev, next, f, a.from, a.to, a.count || 1, T);
      else if (a.type === 'fight') { await T(500); await showBattle(next.lastBattle, T); }
      else if (a.type === 'card' && !mine) { const c = prev.players.find(p => p.faction === f).hand.find(c => c.id === a.card); if (c) await bigCard(c, T); }
      else await T(650);
      await diffPieces(prev, next, a.type === 'move' ? { f, from: a.from, to: a.to } : null, T);
    } else if (!isEnd) await diffPieces(prev, next, null, T);
    if (isEnd) {
      displayPhase = 'dusk'; renderPhases();
      const text = `${describe(prev, last.f, last.a)}. ${mine ? 'Your' : 'Their'} Dusk begins.`;
      banner(phaseTag('dusk') + ' ' + text, last.f); pushFeed(last.f, text); renderFeed(); await T(1000);
    }
    floats(prev, next);
    let turned = false;
    for (const l of lines) {
      if (l.startsWith('—')) {
        turned = true;
        if (isEnd) await diffPieces(prev, next, null, T); else { shown = next; renderAll(); }
        await turnBanner(next, T); continue;
      }
      if (NARR.test(l)) await narrate([l], T);
    }
    if (isEnd && !turned) await diffPieces(prev, next, null, T);
    if (turned) await dayBanner(next, T);
    else if (next.phase === 'over' && prev.phase !== 'over') { shown = next; renderAll(); await turnBanner(next, T); }
    else await T(250);
  }
  async function turnBanner(st, T) {
    if (st.phase === 'over') { const w = st.players.find(p => p.faction === st.winner); banner(`<b>${esc(w.name)}</b> wins the game!`, w.faction); await T(1800); return; }
    const p = st.players[st.current], mineNow = p.faction === myFaction();
    displayPhase = 'dawn'; renderPhases();
    banner(`${phaseTag('dawn')} Round ${st.round} · ${mineNow ? '<b>Your turn</b>' : `<b>${esc(p.name)}</b>'s turn (${short(p.faction)})`}`, p.faction);
    await wait((mineNow ? 1000 : 1200) * speed);
  }
  async function dayBanner(st, T) {
    if (st.phase === 'over') return;
    const p = st.players[st.current], mineNow = p.faction === myFaction();
    displayPhase = 'day'; renderPhases();
    banner(`${phaseTag('day')} ${mineNow ? '<b>Your Day</b>: take your actions' : `<b>${esc(p.name)}</b> takes their actions`}`, p.faction);
    await wait((mineNow ? 900 : 900) * speed);
  }
  function floats(prev, next) {
    next.players.forEach(p => {
      const q = prev.players.find(x => x.faction === p.faction), d = p.renown - (q ? q.renown : 0);
      if (d > 0) { const chip = document.querySelector(`.pchip[data-f="${p.faction}"]`); if (chip) { const s = document.createElement('span'); s.className = 'float'; s.textContent = '+' + d; chip.appendChild(s); setTimeout(() => s.remove(), 1700); } }
    });
  }
  function flash(r) { const g = document.querySelector(`.clr[data-r="${r}"]`); if (g) { g.classList.add('flash'); setTimeout(() => g.classList.remove('flash'), 1600); } }

  async function flyPieces(prev, next, f, from, to, n, T) {
    const a = tokenLayout(prev, from).filter(t => t.f === f).slice(-n);
    const b = tokenLayout(next, to).filter(t => t.f === f).slice(-n);
    const fx = $('fxLayer'), els = [];
    a.forEach((t, i) => {
      const orig = document.querySelector(`[data-key="${t.key}"]`); if (orig) orig.style.opacity = 0;
      const dst = b[i] || { x: R[to].x, y: R[to].y };
      const g = pieceEl(f, t.x, t.y); fx.appendChild(g); els.push(g);
      g.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${(dst.x - t.x) * .5}px, ${(dst.y - t.y) * .5 - 40}px)`, offset: .5 }, { transform: `translate(${dst.x - t.x}px, ${dst.y - t.y}px)` }],
        { duration: 900 * speed, delay: i * 70 * speed, easing: 'ease-in-out', fill: 'forwards' });
    });
    await T(1000 + n * 70);
    shown = next; renderAll({ skipNew: { f, r: to } });
    els.forEach(e => e.remove());
  }
  async function diffPieces(prev, next, moved, T) {
    // mark losses on the board as it stands, then reveal the new state with gains popping in
    let dying = 0;
    R.forEach((_, r) => {
      for (const p of prev.players) {
        const f = p.faction, a = E.critters(prev, r, f), b = E.critters(next, r, f);
        if (moved && f === moved.f && (r === moved.from || r === moved.to)) continue;
        if (b < a) tokenLayout(prev, r).filter(t => t.f === f).slice(-(a - b)).forEach(t => { const el = document.querySelector(`[data-key="${t.key}"]`); if (el) { el.classList.add('dying'); dying++; } });
      }
      const pb = prev.regions[r].b, nb = next.regions[r].b;
      pb.forEach((f, k) => { if (nb[k] !== f) { const el = document.querySelector(`[data-key="b-${r}-${k}"]`); if (el) { el.classList.add('dying'); dying++; } } });
    });
    if (dying) await T(650);
    const before = shown; shown = next; renderAll({ diffFrom: prev, moved });
    if (before !== next) await T(450);
  }
  async function showBattle(b, T) {
    if (!b) return;
    const wrap = document.createElement('div'); wrap.className = 'battle';
    const side = (f, rolls, need, key) => `<div class="bside">${emblem(f, 44)}<div><div class="lbl">${short(f)} ${key}</div><div class="dice" id="d-${key}">${rolls.map(() => '<span class="die roll">?</span>').join('') || '<span class="muted" style="font-size:12px">no dice: no critters here</span>'}</div></div></div>`;
    wrap.innerHTML = `<div class="bx"><h3>Battle in ${R[b.region].name}</h3>
      ${b.notes.filter(n => /Ambush/.test(n)).map(n => `<div class="bnote" style="color:#8a2d22">${esc(n)}</div>`).join('')}
      ${side(b.att, b.attRolls, 4, 'attack')}${side(b.def, b.defRolls, b.def === 'badger' ? 3 : 4, 'defend')}
      <div class="bnote" id="bres"></div></div>`;
    $('mapwrap').appendChild(wrap);
    const spin = setInterval(() => wrap.querySelectorAll('.die.roll').forEach(d => d.textContent = 1 + Math.floor(Math.random() * 6)), 80);
    await T(900);
    clearInterval(spin);
    const fill = (id, rolls, need) => { const el = wrap.querySelector('#d-' + id); if (rolls.length) el.innerHTML = rolls.map(x => `<span class="die ${x >= need ? 'hit' : ''}">${x}</span>`).join(''); };
    fill('attack', b.attRolls, 4); fill('defend', b.defRolls, b.def === 'badger' ? 3 : 4);
    if (b.attHits !== undefined) wrap.querySelector('#bres').innerHTML = `${short(b.att)} deal ${b.attHits} hit${b.attHits === 1 ? '' : 's'}${b.notes.some(n => /Defenseless/.test(n)) ? ' (incl. +1 defenseless)' : ''} · ${short(b.def)} deal ${b.defHits}`;
    else wrap.querySelector('#bres').textContent = 'The ambush breaks the attack.';
    await T(1700);
    wrap.remove();
  }
  async function bigCard(c, T) {
    const el = cardEl(c, []); el.classList.add('big-card'); $('mapwrap').appendChild(el);
    await T(1300); el.remove();
  }

  // ---------- map: static terrain ----------
  function rng(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); }
  function curve(a, b, bend) { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); return `M${a.x} ${a.y} Q${mx - dy / L * bend} ${my + dx / L * bend} ${b.x} ${b.y}`; }
  function drawTerrain() {
    const rand = rng(7331); let h = '';
    h += `<rect x="-10" y="-14" width="1020" height="790" fill="#4f6e47"/>`;
    for (let i = 0; i < 70; i++) h += `<ellipse cx="${rand() * 1000}" cy="${rand() * 770}" rx="${30 + rand() * 60}" ry="${20 + rand() * 40}" fill="${rand() < .5 ? '#47643f' : '#58784e'}" opacity=".6"/>`;
    const segs = [];
    // river: a trunk from the north edge to the south edge, with two tributaries
    const top = { x: 330, y: -14 }, bot = { x: 470, y: 780 };
    const riverPaths = [[top, R[1]], ...E.RIVER.map(([a, b]) => [R[a], R[b]]), [R[12], bot]];
    riverPaths.forEach(([a, b]) => segs.push([a, b, 30]));
    E.EDGES.forEach(([a, b]) => { if (!E.isRiver(a, b)) segs.push([R[a], R[b], 22]); });
    // trees
    const trees = [];
    for (let gx = -10; gx < 1010; gx += 30) for (let gy = -14; gy < 776; gy += 30) {
      const x = gx + rand() * 22, y = gy + rand() * 22;
      if (R.some(c => Math.hypot(c.x - x, c.y - y) < 100)) continue;
      if (segs.some(([a, b, w]) => segDist(x, y, a.x, a.y, b.x, b.y) < w)) continue;
      if (rand() < .18) continue;
      trees.push({ x, y, r: 12 + rand() * 9, c: ['#2d5531', '#376640', '#284b2b', '#41743f', '#31603a'][Math.floor(rand() * 5)] });
    }
    trees.sort((a, b) => a.y - b.y);
    const treeSvg = trees.map(t => `<circle cx="${t.x + 3}" cy="${t.y + 5}" r="${t.r}" fill="rgba(0,0,0,.28)"/><circle cx="${t.x}" cy="${t.y}" r="${t.r}" fill="${t.c}"/><circle cx="${t.x - t.r / 3}" cy="${t.y - t.r / 3}" r="${t.r / 2.2}" fill="rgba(255,255,255,.1)"/>`).join('');
    // paths
    E.EDGES.forEach(([a, b], i) => {
      if (E.isRiver(a, b)) return;
      const d = curve(R[a], R[b], (i % 2 ? 1 : -1) * 14);
      h += `<path d="${d}" stroke="#7f6a45" stroke-width="20" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#cdb487" stroke-width="13" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#b39a6c" stroke-width="2" stroke-dasharray="3 10" fill="none" stroke-linecap="round"/>`;
    });
    riverPaths.forEach(([a, b], i) => { const d = curve(a, b, (i % 2 ? 1 : -1) * 22); h += `<path d="${d}" stroke="#2d5e84" stroke-width="32" fill="none" stroke-linecap="round"/>`; });
    riverPaths.forEach(([a, b], i) => { const d = curve(a, b, (i % 2 ? 1 : -1) * 22); h += `<path d="${d}" stroke="#4f97cc" stroke-width="24" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#a9d5f0" stroke-width="2.5" stroke-dasharray="14 18" fill="none" stroke-linecap="round" opacity=".8"/>`; });
    h += treeSvg;
    // clearings
    const FILL = { meadow: '#e6d38c', marsh: '#a3cdb9', grove: '#b4d090' };
    const EDGE = { meadow: '#b9a35a', marsh: '#6fa392', grove: '#7fa35f' };
    R.forEach((c, i) => {
      h += `<circle cx="${c.x + 3}" cy="${c.y + 6}" r="76" fill="rgba(0,0,0,.3)"/><circle cx="${c.x}" cy="${c.y}" r="74" fill="${EDGE[c.terrain]}"/><circle cx="${c.x}" cy="${c.y}" r="69" fill="${FILL[c.terrain]}"/>`;
      for (let k = 0; k < 16; k++) {
        const ang = rand() * Math.PI * 2; if (ang > 1.1 && ang < 2.05) continue; // keep the name plate area clear
        const rr = 57 + rand() * 8, x = c.x + Math.cos(ang) * rr, y = c.y + Math.sin(ang) * rr;
        if (c.terrain === 'meadow') h += `<circle cx="${x}" cy="${y}" r="2.6" fill="${rand() < .5 ? '#fff7e0' : '#e98a9b'}"/><circle cx="${x}" cy="${y}" r="1" fill="#d99a1a"/>`;
        if (c.terrain === 'marsh') h += rand() < .5 ? `<path d="M${x} ${y + 5} l0 -10 M${x + 3} ${y + 5} l1 -8" stroke="#3f7a5a" stroke-width="1.6"/><ellipse cx="${x}" cy="${y - 6}" rx="1.4" ry="3" fill="#7a5a33"/>` : `<ellipse cx="${x}" cy="${y}" rx="6" ry="2.2" fill="none" stroke="#5f9fbf" stroke-width="1.2"/>`;
        if (c.terrain === 'grove') h += `<circle cx="${x}" cy="${y}" r="${4 + rand() * 2}" fill="#5f8f45"/><circle cx="${x - 1}" cy="${y - 1}" r="2" fill="rgba(255,255,255,.15)"/>`;
      }
      const w = c.name.length * 9.5 + 44;
      h += `<g transform="translate(${c.x},${c.y + 84})"><rect x="${-w / 2}" y="-15" width="${w}" height="28" rx="7" fill="#f3ead2" stroke="#8b7650" stroke-width="1.5"/>
        <use href="#t-${c.terrain}" x="${-w / 2 + 5}" y="-10" width="19" height="19"/><text class="plate" x="12" y="5" text-anchor="middle">${c.name}</text></g>`;
    });
    $('terrainLayer').innerHTML = h;
  }

  // ---------- map: dynamic layers ----------
  const ROWS = [{ y: -6, n: 6 }, { y: 18, n: 6 }, { y: 42, n: 4 }];
  function tokenLayout(st, r) {
    const fs = st.players.map(p => p.faction).filter(f => E.critters(st, r, f) > 0);
    const counts = fs.map(f => E.critters(st, r, f)), total = counts.reduce((a, b) => a + b, 0), CAP = 16;
    const vis = counts.map(n => total <= CAP ? n : Math.max(1, Math.round(n * CAP / total)));
    while (vis.reduce((a, b) => a + b, 0) > CAP) vis[vis.indexOf(Math.max(...vis))]--;
    const list = []; fs.forEach((f, i) => { for (let k = 0; k < vis[i]; k++) list.push({ f, k, extra: k === vis[i] - 1 && vis[i] < counts[i] ? counts[i] : 0 }); });
    const out = []; let idx = 0;
    for (const row of ROWS) {
      const inRow = list.slice(idx, idx + row.n); if (!inRow.length) break;
      inRow.forEach((t, j) => out.push({ ...t, key: `${r}-${t.f}-${t.k}`, x: R[r].x + (j - (inRow.length - 1) / 2) * 22, y: R[r].y + row.y }));
      idx += row.n;
    }
    return out;
  }
  function pieceEl(f, x, y, cls = '') {
    const g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'piece ' + cls);
    const h = PIECE_H[f] * 0.9;
    g.innerHTML = `<use href="#m-${f}" x="${x - 13}" y="${y - h / 2 - 4}" width="26" height="${h}"/>`;
    return g;
  }
  function renderBoard(opts = {}) {
    const st = shown; if (!st) return;
    const myF = myFaction(), canAct = idle() && st.players[st.current].faction === myF && st.phase === 'main';
    const acts = canAct ? E.listActions(st, myF) : [];
    const actR = new Set(); acts.forEach(a => { if (a.region !== undefined && a.type !== 'card') actR.add(a.region); if (a.from !== undefined) actR.add(a.from); });
    const dests = sel !== null ? acts.filter(a => a.type === 'move' && a.from === sel) : [];
    const destR = new Set(dests.map(a => a.to));
    // marks: highlight rings, ruler flags, move arrows
    let m = '';
    if (dests.length) dests.forEach(a => {
      const A = R[a.from], B = R[a.to], L = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
      m += `<path d="M${A.x + ux * 78} ${A.y + uy * 78} L${B.x - ux * 84} ${B.y - uy * 84}" stroke="#ffe27a" stroke-width="5" stroke-dasharray="8 7" marker-end="url(#arrowhead)"/>`;
    });
    R.forEach((c, i) => {
      const rl = E.ruler(st, i);
      const cls = ['clr', actR.has(i) ? 'can' : '', destR.has(i) ? 'dest' : '', sel === i ? 'sel' : ''].join(' ');
      m += `<g class="${cls}" data-r="${i}" tabindex="0" role="button" aria-label="${c.name}"><circle class="hl" cx="${c.x}" cy="${c.y}" r="80"/><circle cx="${c.x}" cy="${c.y}" r="76" fill="rgba(0,0,0,0)"/></g>`;
      if (rl) m += `<g transform="translate(${c.x + 52},${c.y - 70})" pointer-events="none"><path d="M0 0 L0 30" stroke="#3a2f1c" stroke-width="2.5"/><path d="M1 1 L24 6 L1 13Z" fill="${E.FACTIONS[rl].color}" stroke="#fff" stroke-width="1.2"/></g>`;
    });
    $('markLayer').innerHTML = `<defs><marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#ffe27a"/></marker></defs>` + m;
    $('markLayer').querySelectorAll('.clr').forEach(g => {
      const pick = () => clickRegion(+g.dataset.r, dests);
      g.onclick = pick; g.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } };
    });
    // pieces
    const layer = $('pieceLayer'); layer.innerHTML = ''; layer.setAttribute('pointer-events', 'none');
    const prev = opts.diffFrom;
    R.forEach((c, r) => {
      const slots = c.slots;
      for (let k = 0; k < slots; k++) {
        const x = c.x - (slots * 34 - 4) / 2 + k * 34 + 15, y = c.y - 40, b = st.regions[r].b[k];
        if (!b) { const e = document.createElementNS(NS, 'rect'); Object.entries({ x: x - 14, y: y - 14, width: 28, height: 28, rx: 6, fill: 'rgba(255,255,255,.35)', stroke: 'rgba(60,45,20,.55)', 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }).forEach(([k2, v]) => e.setAttribute(k2, v)); layer.appendChild(e); continue; }
        const g = document.createElementNS(NS, 'g');
        const isNew = prev && prev.regions[r].b[k] !== b;
        g.setAttribute('class', 'piece' + (isNew ? ' new' : '')); g.dataset.key = `b-${r}-${k}`;
        g.innerHTML = `<use href="#b-${b}" x="${x - 15}" y="${y - 15}" width="30" height="30"/>`;
        layer.appendChild(g);
      }
      const toks = tokenLayout(st, r);
      const prevCount = {};
      if (prev) for (const p of st.players) prevCount[p.faction] = tokenLayout(prev, r).filter(t => t.f === p.faction).length;
      for (const t of toks) {
        let isNew = prev && t.k >= (prevCount[t.f] || 0);
        if (opts.moved && opts.moved.f === t.f && (r === opts.moved.to || r === opts.moved.from)) isNew = false;
        if (opts.skipNew && opts.skipNew.f === t.f && opts.skipNew.r === r) isNew = false;
        const g = pieceEl(t.f, t.x, t.y, isNew ? 'new' : ''); g.dataset.key = t.key;
        if (t.extra) g.innerHTML += `<circle cx="${t.x + 10}" cy="${t.y + 8}" r="9" fill="#fff" stroke="#333"/><text x="${t.x + 10}" y="${t.y + 12}" text-anchor="middle" font-size="11" font-weight="800" fill="#222">${t.extra}</text>`;
        layer.appendChild(g);
      }
    });
  }
  function clickRegion(r, dests) {
    if (!idle()) return;
    const d = dests.find(a => a.to === r);
    if (d) { doAct(d, { count: Math.min(moveCount || d.max, d.max) }); return; }
    sel = sel === r ? null : r; moveCount = null; renderAll();
  }

  // ---------- cards ----------
  const CARD_TEXT = {
    ambush: 'Defends by itself: 2 hits first when you are attacked in a matching clearing.',
    rally: 'Add 2 critters (owls: 1) to a matching clearing where you have a piece.',
    forage: '+2 renown if you rule 2 or more matching clearings.',
    hasten: '+1 action this turn (otters: +2 coins).',
    provision: 'Draw 2 cards.',
    moon: 'Pays any terrain cost. Play it to draw 1 and get +1 action.',
  };
  const CARD_BG = { meadow: 'linear-gradient(160deg,#f3df8e,#d9b94e)', marsh: 'linear-gradient(160deg,#b4e0d0,#6fae9c)', grove: 'linear-gradient(160deg,#c3e0a0,#77a957)', moon: 'linear-gradient(160deg,#b9b4ec,#6c66b8)' };
  function cardEl(c, acts) {
    const el = document.createElement('div'); el.className = 'card'; el.tabIndex = 0;
    el.innerHTML = `<div class="art" style="background:${CARD_BG[c.terrain]}"><svg class="gem"><use href="#t-${c.terrain}" width="100%" height="100%"/></svg><svg class="cart"><use href="#c-${c.type}" width="100%" height="100%"/></svg></div>
      <div class="cnm">${esc(E.CARD_TYPES[c.type].name)}</div><div class="ctx"><b>${c.terrain === 'moon' ? 'Wild' : esc(c.terrain[0].toUpperCase() + c.terrain.slice(1))}</b> · ${esc(CARD_TEXT[c.type])}</div>`;
    if (acts.length) {
      const bx = document.createElement('div'); bx.className = 'cbtns';
      for (const a of acts) {
        const b = document.createElement('button');
        b.textContent = a.type === 'discard' ? 'Discard' : a.type === 'quarry' ? 'Quarry: +1 stone' : a.type === 'trade' ? 'Sell: +1 coin' : a.region !== undefined ? `Play in ${R[a.region].name}` : 'Play';
        if (a.type === 'card' || a.type === 'discard') b.classList.add('primary');
        b.onclick = e => { e.stopPropagation(); doAct(a); };
        bx.appendChild(b);
      }
      el.appendChild(bx);
    }
    return el;
  }
  function renderHand() {
    const st = shown, myF = myFaction(), mp = myF && st.players.find(p => p.faction === myF);
    $('dock').hidden = !mp;
    if (!mp) return;
    const myTurn = idle() && st.players[st.current].faction === myF;
    const acts = myTurn ? E.listActions(st, myF) : [];
    $('handTitle').textContent = `Your hand · ${mp.hand.length} card${mp.hand.length === 1 ? '' : 's'}`;
    $('handHint').textContent = st.phase === 'discard' && myTurn ? 'Too many cards: discard down to 5.' : myTurn ? 'Cards you can use show buttons.' : 'Ambush cards defend you by themselves.';
    const h = $('hand'); h.innerHTML = '';
    if (!mp.hand.length) h.innerHTML = '<span class="muted">No cards. You draw at the end of your turn.</span>';
    for (const c of mp.hand) {
      const ca = acts.filter(a => a.card === c.id);
      const el = cardEl(c, ca);
      if (myTurn && !ca.length) el.classList.add('dim');
      h.appendChild(el);
    }
  }

  // ---------- players + guide ----------
  function renderTrack() {
    const st = shown, myF = myFaction();
    $('track').innerHTML = st.players.map((p, i) => {
      const nb = E.buildingsOnMap(st, p.faction);
      const res = p.faction === 'badger' ? `${p.stone} stone · ${nb}/6 setts` : p.faction === 'otter' ? `${p.coins} coins · ${nb}/5 posts` : p.faction === 'owl' ? `${nb}/4 nests` : `rules ${E.ruledCount(st, 'rabbit')} clearings`;
      return `<div class="pchip ${i === st.current && st.phase !== 'over' ? 'cur' : ''}" data-f="${p.faction}" style="--pc:${E.FACTIONS[p.faction].color}">
        ${emblem(p.faction, 40)}<div style="min-width:0"><div class="nm">${esc(p.name)}${p.faction === myF ? ' (you)' : ''}</div><div class="sub">${E.FACTIONS[p.faction].name}${p.ai ? ' · AI' : ''}<br>${res} · ${p.hand.length} cards</div></div>
        <div class="vp">${p.renown}<small>RENOWN</small></div><div class="bar"><i style="width:${Math.min(100, p.renown / E.WIN * 100)}%"></i></div></div>`;
    }).join('');
  }
  function icon(id) { return `<svg class="ic"><use href="#i-${id}" width="100%" height="100%"/></svg>`; }
  function renderGuide() {
    const st = shown, myF = myFaction(), cur = st.players[st.current], myTurn = cur.faction === myF, g = $('guide');
    g.innerHTML = '';
    const add = html => { const d = document.createElement('div'); d.innerHTML = html; g.appendChild(d); return d; };
    if (st.phase === 'over') {
      const w = st.players.find(p => p.faction === st.winner);
      add(`<div class="who-turn">${emblem(w.faction, 44)}<div><b>${esc(w.name)} wins!</b><span class="muted">${E.FACTIONS[w.faction].name} · ${w.renown} renown</span></div></div>`);
      const b = document.createElement('button'); b.className = 'primary endturn';
      b.textContent = mode === 'solo' ? 'New game' : isHost() ? 'Back to lobby' : 'Leave';
      b.onclick = () => { if (mode === 'online' && isHost()) save({ ...clone(game), status: 'lobby', state: null, last: null }); else leave(); };
      g.appendChild(b); return;
    }
    g.hidden = false;
    if (!myTurn || !idle()) {
      if (myF) { g.hidden = true; return; }
      add(`<div class="who-turn">${emblem(cur.faction, 44)}<div><b>${myTurn ? 'Your turn' : esc(cur.name)}</b><span class="muted">${myTurn ? 'Get ready…' : E.FACTIONS[cur.faction].name + ' · taking their turn'}</span></div></div>`);
      add(`<p class="hint">${myTurn ? 'Hold on while the last moves finish.' : 'Watch the map: each move is shown as it happens.'}</p>`);
      if (!myF) add('<p class="hint">You are watching this game.</p>');
      return;
    }
    const mp = st.players.find(p => p.faction === myF), acts = E.listActions(st, myF);
    const res = myF === 'otter'
      ? `<div class="pips">${Array.from({ length: mp.coins }, () => '<span class="coin"></span>').join('') || '<span class="muted">no coins</span>'}</div><span class="hint">Move 1 · Attack 2 · Hire 2 · Post 3</span>`
      : `<div class="pips">${Array.from({ length: Math.max(st.actionsLeft, 0) }, () => '<span class="pip full"></span>').join('')}${st.actionsLeft ? '' : '<span class="muted">no actions left</span>'}</div><span class="hint">${st.actionsLeft} action${st.actionsLeft === 1 ? '' : 's'} left${myF === 'badger' ? ` · ${mp.stone} stone` : ''}</span>`;
    add(`<h3>Your Day actions</h3><span class="hint">Round ${st.round} · ${E.season(st)} season</span>`);
    add(res);
    if (st.phase === 'discard') { add('<p class="hint"><b>Too many cards.</b> Pick a card to discard in your hand below.</p>'); return; }
    const box = document.createElement('div'); box.className = 'abtns'; g.appendChild(box);
    const abtn = (a, ic, title, sub) => {
      const b = document.createElement('button'); b.className = 'abtn';
      b.innerHTML = `${icon(ic)}<span>${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</span>`;
      b.onclick = () => doAct(a); box.appendChild(b);
    };
    const whole = acts.filter(a => a.type === 'muster' || a.type === 'hatch');
    whole.forEach(a => abtn(a, 'add', a.type === 'muster' ? 'Muster' : 'Hatch', a.type === 'muster' ? '+1 badger at every sett' : '+1 owl at every nest'));
    if (sel === null) {
      add(`<p class="hint">Click a clearing with a <b>dashed gold ring</b> to act there.${myF === 'owl' ? ' Owls fly up to 2 clearings.' : ''}</p>`);
    } else {
      const c = R[sel], rl = E.ruler(st, sel);
      const here = st.players.filter(p => E.pieces(st, sel, p.faction) > 0).map(p => `${short(p.faction)} ${E.critters(st, sel, p.faction)}${E.buildingsOf(st, sel, p.faction) ? ' + building' : ''}`).join(' · ') || 'empty';
      const ri = add(`<div class="regioninfo"><span class="rn">${c.name}</span><span class="hint">${c.terrain}${E.RIVERSIDE[sel] ? ' · on the river' : ''} · ${rl ? 'ruled by ' + short(rl) : 'nobody rules'}</span><span class="hint">${here}</span></div>`);
      g.insertBefore(ri, box);
      const moves = acts.filter(a => a.type === 'move' && a.from === sel);
      if (moves.length) {
        const max = moves[0].max; if (!moveCount || moveCount > max) moveCount = max;
        const mv = document.createElement('div'); mv.className = 'panel'; mv.style.padding = '10px';
        mv.innerHTML = `<div class="hint"><b>${myF === 'owl' ? 'Fly' : 'Move'}:</b> choose how many, then click a <b>glowing clearing</b>.</div>
          <div class="stepper"><button id="mvMinus" aria-label="Fewer">−</button><output id="mvOut">${moveCount}</output><button id="mvPlus" aria-label="More">+</button><span class="hint">of ${max}</span></div>`;
        box.appendChild(mv);
        mv.querySelector('#mvMinus').onclick = () => { moveCount = Math.max(1, moveCount - 1); mv.querySelector('#mvOut').textContent = moveCount; };
        mv.querySelector('#mvPlus').onclick = () => { moveCount = Math.min(max, moveCount + 1); mv.querySelector('#mvOut').textContent = moveCount; };
      }
      for (const a of acts.filter(a => a.region === sel && a.type !== 'card')) {
        if (a.type === 'fight') {
          const mine = E.critters(st, sel, myF), theirs = E.critters(st, sel, a.target);
          const md = myF === 'owl' ? Math.min(4, mine * 2) : Math.min(3, mine);
          const td = theirs ? (a.target === 'owl' ? Math.min(4, theirs * 2) : Math.min(3, theirs)) + (E.buildingsOf(st, sel, a.target) ? 1 : 0) : 0;
          abtn(a, 'fight', `Attack the ${short(a.target)}`, theirs ? `You roll ${md} dice, they roll ${td}` : `They have no defenders: +1 hit for you`);
        } else if (a.type === 'build') abtn(a, 'build', { badger: 'Dig a sett', owl: 'Build a nest', otter: 'Open a trading post' }[myF], a.label.replace(/^.*\(/, '').replace(/\)$/, ''));
        else if (a.type === 'burst') abtn(a, 'add', 'Burrow burst: +3 rabbits', `Pay a ${c.terrain} card`);
        else if (a.type === 'hire') abtn(a, 'add', 'Hire 2 otters', '2 coins');
      }
      if (!acts.some(a => a.region === sel || a.from === sel)) add('<p class="hint">Nothing you can do here right now.</p>');
      const cl = document.createElement('button'); cl.className = 'ghost'; cl.textContent = 'Deselect clearing'; cl.onclick = () => { sel = null; renderAll(); }; g.appendChild(cl);
    }
    const end = acts.find(a => a.type === 'end');
    const eb = document.createElement('button'); eb.className = 'primary endturn';
    eb.innerHTML = `End turn${myF !== 'otter' && st.actionsLeft > 0 ? ` <small style="opacity:.8">(${st.actionsLeft} unused)</small>` : ''}`;
    eb.onclick = () => doAct(end); g.appendChild(eb);
  }
  function renderFeed() {
    $('feed').innerHTML = feed.length ? feed.map(x => `<div>${x.f ? emblem(x.f, 22) : '<span></span>'}<span>${x.html}</span></div>`).join('') : '<span class="muted">Moves will appear here.</span>';
  }
  function renderAll(opts) {
    if (!shown) return;
    if (idle()) displayPhase = shown.phase === 'discard' ? 'dusk' : 'day';
    renderTrack(); renderBoard(opts); renderPhases(); renderGuide(); renderHand(); renderFeed();
    $('log').innerHTML = shown.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('');
  }

  // ---------- tutorial ----------
  let tutOpen = false, tutPage = 0, tutPages = [];
  const gem = (t, s = 18) => `<svg width="${s}" height="${s}" style="vertical-align:-4px"><use href="#t-${t}" width="100%" height="100%"/></svg>`;
  function phaseBlock(f, ph) {
    const P = PHASES[f];
    return `<div class="tp-ph ph-bg-${ph}"><div class="tp-ph-h">${phaseIcon(ph, 26)}<div><b>${PH_NAME[ph]}</b><small>${ph === 'day' ? P.dayNote : PH_SUB[ph]}</small></div></div>
      <ul>${P[ph].map(([, n, c, d]) => `<li><b>${n}</b>${c ? ` <span class="cost">${c}</span>` : ''}<small>${d}</small></li>`).join('')}</ul></div>`;
  }
  function buildTutorial() {
    const myF = myFaction();
    const facs = latest ? latest.players.map(p => p.faction) : E.FACTION_KEYS.slice();
    if (myF) facs.sort((a, b) => (b === myF) - (a === myF));
    tutPages = [
      { t: 'Welcome to Thornwood', h: `
        <p class="tp-lede">Up to four woodland factions fight over the forest. Each faction plays by its own rules and scores <b>renown</b> in its own way.</p>
        <div class="tp-grid">
          <div class="tp-tile"><svg width="34" height="34"><use href="#i-star" width="100%" height="100%"/></svg><b>Goal</b><small>The first to <b>30 renown</b> wins at once. After 20 rounds, the most renown wins.</small></div>
          <div class="tp-tile"><div>${gem('meadow', 22)} ${gem('marsh', 22)} ${gem('grove', 22)}</div><b>Clearings</b><small>13 clearings, each meadow, marsh or grove. The squares on a clearing are building slots.</small></div>
          <div class="tp-tile"><svg width="34" height="34" viewBox="0 0 30 34"><path d="M4 2 L4 32" stroke="#3a2f1c" stroke-width="3"/><path d="M5 3 L28 9 L5 16Z" fill="#d9772b" stroke="#fff" stroke-width="1.5"/></svg><b>Rule</b><small>Most pieces (critters plus buildings) in a clearing rules it, shown by a flag. A tie means nobody rules.</small></div>
          <div class="tp-tile"><div>${gem('meadow', 22)} › ${gem('marsh', 22)} › ${gem('grove', 22)}</div><b>Seasons</b><small>The season moves on every round. Several factions score for the season's terrain.</small></div>
          <div class="tp-tile"><div><span class="die">5</span> <span class="die hit">4</span></div><b>Battle</b><small>One d6 per critter (max 3) on each side, and each 4+ is a hit. Hits remove critters first, then buildings. Destroying a building earns 1 renown.</small></div>
          <div class="tp-tile"><svg width="34" height="34"><use href="#c-rally" width="100%" height="100%"/></svg><b>Cards</b><small>Cards pay terrain costs and have effects. Ambush cards defend you by themselves. You can hold 5.</small></div>
        </div>` },
      { t: 'Every turn has three phases', h: `
        <p class="tp-lede">Each turn runs <b>Dawn → Day → Dusk</b>. What happens in each phase depends on the faction.</p>
        <div class="tp-three">
          <div class="tp-ph ph-bg-dawn"><div class="tp-ph-h">${phaseIcon('dawn', 30)}<div><b>Dawn</b><small>happens by itself</small></div></div><p>Your faction gets its boost for the turn: stone, new rabbits, actions or coins.</p></div>
          <div class="tp-ph ph-bg-day"><div class="tp-ph-h">${phaseIcon('day', 30)}<div><b>Day</b><small>your actions</small></div></div><p>Move, attack, build, recruit and play cards. Most factions get a set number of actions. Otters pay coins.</p></div>
          <div class="tp-ph ph-bg-dusk"><div class="tp-ph-h">${phaseIcon('dusk', 30)}<div><b>Dusk</b><small>scoring &amp; cards</small></div></div><p>Score renown your faction's way, draw cards, then discard down to 5.</p></div>
        </div>
        <p class="hint">During every turn, the <b>Turn phases</b> panel beside the map shows whose turn it is, which phase they're in, and what that faction can do.</p>` },
      ...facs.map(f => ({ t: `${E.FACTIONS[f].name}${f === myF ? ' <span class="tag">you</span>' : ''}`, f, h: `
        <div class="tp-fac">${emblem(f, 64)}<div><p class="tp-lede">${PHASES[f].tag}</p><p class="hint"><b>${PHASES[f].perk}</b></p></div></div>
        <div class="tp-three">${['dawn', 'day', 'dusk'].map(ph => phaseBlock(f, ph)).join('')}</div>` })),
      { t: 'Playing your turn', h: `
        <div class="tp-grid">
          <div class="tp-tile"><svg width="34" height="34" viewBox="0 0 34 34"><circle cx="17" cy="17" r="14" fill="#a7c98a" stroke="#e0b520" stroke-width="3" stroke-dasharray="5 4"/></svg><b>Gold rings</b><small>Clearings with a dashed gold ring are where you can act. Click one to see its options beside the map.</small></div>
          <div class="tp-tile"><svg width="34" height="34" viewBox="0 0 34 34"><path d="M4 17 L26 17" stroke="#e0b520" stroke-width="4" stroke-dasharray="5 4"/><path d="M24 10 L32 17 L24 24Z" fill="#e0b520"/></svg><b>Moving</b><small>Select a clearing with your critters, pick how many with − / +, then click a glowing destination.</small></div>
          <div class="tp-tile"><svg width="34" height="34"><use href="#c-provision" width="100%" height="100%"/></svg><b>Your hand</b><small>Your cards sit below the map. Cards you can use right now show buttons.</small></div>
          <div class="tp-tile"><svg width="34" height="34"><use href="#p-dusk" width="100%" height="100%"/></svg><b>End turn</b><small>When you're done with your Day, click End turn. Dusk scoring then happens by itself.</small></div>
          <div class="tp-tile"><svg width="34" height="34"><use href="#m-owl" width="100%" height="100%"/></svg><b>Other players</b><small>Every move by the AI or your friends plays out on the map. Change the pace with Slow / Normal / Fast.</small></div>
          <div class="tp-tile"><svg width="34" height="34"><use href="#i-star" width="100%" height="100%"/></svg><b>Need a reminder?</b><small>Open this guide any time with <b>How to play</b> at the top.</small></div>
        </div>` },
    ];
  }
  function openTutorial(start = 0) { buildTutorial(); tutPage = start; tutOpen = true; renderTut(); try { $('tut').showModal(); } catch { $('tut').setAttribute('open', ''); } }
  function renderTut() {
    const p = tutPages[tutPage], last = tutPage === tutPages.length - 1;
    $('tutBody').innerHTML = `<div class="eyebrow">Guide · ${tutPage + 1} of ${tutPages.length}</div><h2>${p.t}</h2>${p.h}`;
    $('tutDots').innerHTML = tutPages.map((x, i) => `<button class="tdot ${i === tutPage ? 'on' : ''}" data-i="${i}" aria-label="Page ${i + 1}">${x.f ? emblem(x.f, 18) : ''}</button>`).join('');
    $('tutDots').querySelectorAll('button').forEach(b => b.onclick = () => { tutPage = +b.dataset.i; renderTut(); });
    $('tutPrev').disabled = tutPage === 0;
    $('tutNext').textContent = last ? (latest ? 'Start playing' : 'Close') : 'Next';
    $('tutBody').scrollTop = 0;
  }
  $('tutPrev').onclick = () => { if (tutPage > 0) { tutPage--; renderTut(); } };
  $('tutNext').onclick = () => { if (tutPage < tutPages.length - 1) { tutPage++; renderTut(); } else $('tut').close(); };
  $('tutSkip').onclick = () => $('tut').close();
  $('tut').addEventListener('close', () => { tutOpen = false; kickAI(); if (!playing && queue.length) pump(); });
  $('rulesBtn').onclick = () => openTutorial(0);
})();
