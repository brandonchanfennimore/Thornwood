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
  const AI_NAMES = { badger: 'Old Brock', rabbit: 'Clover', owl: 'Hootsworth', otter: 'Captain Slick', fox: 'Vixen Ash', hedgehog: 'Mother Bristle', frog: 'Croakwell', mole: 'Digby' };
  const PIECE_H = { badger: 32, rabbit: 36, owl: 33, otter: 31, fox: 34, hedgehog: 33, frog: 32, mole: 31 };
  // visual style: 'simple' (wooden discs, flat map), 'art' (storybook critters, inked autumn map) or '3d' (artistic page with a
  // three.js board); symbols are #m-* (simple) or #a-* (art and 3d)
  let style = ['art', '3d'].includes(ls.get('tw-style')) ? ls.get('tw-style') : 'simple';
  const mk = () => style === 'simple' ? 'm' : 'a';
  const emblem = (f, size = 40) => `<svg width="${size}" height="${size}" aria-hidden="true"><use href="#${mk()}-${f}" width="100%" height="100%"/></svg>`;
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
  function applyStyle() {
    document.documentElement.dataset.style = style === 'simple' ? 'simple' : 'art';
    $('styleSel').value = style;
    document.querySelectorAll('use').forEach(u => { const h = u.getAttribute('href'); if (/^#[ma]-/.test(h)) u.setAttribute('href', '#' + mk() + h.slice(2)); });
    drawTerrain(); set3D(style === '3d');
  }
  $('styleSel').onchange = () => { style = $('styleSel').value; ls.set('tw-style', style); applyStyle(); };
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
    receive({ seats, level: $('soloLevel').value, status: 'playing', hostId: me, gid: newGid(), state: E.newGame(seatsToPlayers(seats)), last: null });
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
    $('lobbyLevel').value = g.level || 'medium'; $('lobbyLevel').disabled = !host;
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
  $('lobbyLevel').onchange = () => save({ ...clone(game), level: $('lobbyLevel').value });
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
      try { a = AI.chooseAction(st, f, game.level); E.apply(st, f, a); } catch (e) { a = { type: 'end' }; try { E.apply(st, f, a); } catch {} }
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

  const BUILD_VERB = { badger: 'Digs a sett', owl: 'Builds a nest', otter: 'Opens a trading post', hedgehog: 'Builds a hollow', frog: 'Floats a lily pad', mole: 'Digs a tunnel' };
  const BUILD_BTN = { badger: 'Dig a sett', owl: 'Build a nest', otter: 'Open a trading post', hedgehog: 'Build a hollow', frog: 'Float a lily pad', mole: 'Dig a tunnel' };
  const MOVE_VERB = { owl: 'Fly', frog: 'Move or leap', mole: 'Move or tunnel' };
  const MOVE_HINT = { owl: ' Owls fly up to 2 clearings.', frog: ' Frogs leap up to 2 clearings into marsh or riverside clearings.', mole: ' Moles can travel between any two of their tunnels.', fox: ' Foxes ignore rule when they move.' };
  // ---------- describing moves ----------
  function describe(st, f, a) {
    const who = `<b>${esc(pname(st, f))}</b>`, n = E.FACTIONS[f].short.toLowerCase();
    const p = st.players.find(p => p.faction === f);
    const card = a.card ? p.hand.find(c => c.id === a.card) : null;
    switch (a.type) {
      case 'move': { const c = a.count || 1; return `${who} ${{ owl: 'flies', frog: 'hops' }[f] || 'moves'} ${c} ${c === 1 ? (f === 'fox' ? 'fox' : n.replace(/s$/, '')) : n} from ${R[a.from].name} to ${R[a.to].name}`; }
      case 'fight': return `${who} attacks the ${short(a.target)} in ${R[a.region].name}`;
      case 'muster': return `${who} musters a badger at every sett`;
      case 'hatch': return `${who} hatches an owl at every nest`;
      case 'build': return `${who} ${BUILD_VERB[f].toLowerCase()} in ${R[a.region].name}`;
      case 'raid': return `${who} raids the ${short(a.target)} in ${R[a.region].name} and steals a card`;
      case 'raise': return `${who} raises 2 hedgehogs at ${R[a.region].name}`;
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
  const DRAW1 = ['', 'Draw', '', 'Draw 1 card.'];
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
    fox: {
      tag: 'Raiders and thieves. Slip past any border, steal cards and lurk by other factions\' buildings.',
      perk: 'Sly: foxes move without needing to rule either clearing.',
      dawn: [['', 'Prowl', 'automatic', 'Add 2 foxes to the clearing where you have the most foxes.']],
      dayNote: 'You have 3 actions.',
      day: [['move', 'Move', '1 action', 'Move any number of foxes to an adjacent clearing. Foxes ignore rule.'], FIGHT, ['raid', 'Raid', '1 action · once per faction', 'In a clearing where you have a fox and another faction has a piece, steal a random card from them and gain 1 renown.'], CARDS],
      dusk: [['', 'Score lurking', '', 'Gain 1 renown for every clearing where your foxes sit beside another faction\'s building (up to 2).'], DRAW1, ...DUSK_END],
    },
    hedgehog: {
      tag: 'Prickly hoarders. Stockpile cards, curl up in hollows and make attackers pay.',
      perk: 'Spines: when hedgehogs defend, they deal 1 extra hit.',
      dawn: [['', 'Forage', 'automatic', 'Draw 1 card for every hollow on the map (up to 2).']],
      dayNote: 'You have 3 actions.',
      day: [MOVE, FIGHT, ['raise', 'Raise', '1 action', 'Add 2 hedgehogs at one of your hollows.'], ['build', 'Build a hollow', '1 action + matching card', 'In a clearing you rule that has a free slot. Gain 1 renown.'], CARDS],
      dusk: [['', 'Score the hoard', '', 'Gain 1 renown for every 2 cards in your hand (up to 2).'], DRAW1, ['', 'Discard', '', 'Hedgehogs can hold 7 cards. Discard down to 7.']],
    },
    frog: {
      tag: 'A marsh choir. Leap across wet ground and link a long chain of clearings.',
      perk: 'Leap: frogs jump up to 2 clearings into any marsh or riverside clearing, ignoring rule.',
      dawn: [['', 'Spawn', 'automatic', 'Add 1 frog at every lily pad and in every marsh clearing you rule.']],
      dayNote: 'You have 3 actions.',
      day: [['move', 'Move or leap', '1 action', 'Move to an adjacent clearing (you must rule one end), or leap up to 2 clearings into a marsh or riverside clearing.'], FIGHT, ['build', 'Float a lily pad', '1 action + matching card', 'In a marsh or riverside clearing you rule that has a free slot. Gain 1 renown.'], CARDS],
      dusk: [['', 'Sing in chorus', '', 'Gain 1 renown for every clearing in your largest group of connected clearings you rule.'], DRAW1, ...DUSK_END],
    },
    mole: {
      tag: 'Diggers from below. Tunnel under anyone and pop up across the map.',
      perk: 'Underground: tunnels never count toward rule, so you can dig where others rule.',
      dawn: [['', 'Surface', 'automatic', 'Add 1 mole at every tunnel.']],
      dayNote: 'You have 3 actions.',
      day: [['move', 'Move or tunnel', '1 action', 'Move to an adjacent clearing (you must rule one end), or travel from a tunnel to any other tunnel.'], FIGHT, ['build', 'Dig a tunnel', '1 action + matching card', 'In any clearing with your mole and a free slot, ruled or not. Gain 1 renown.'], CARDS],
      dusk: [['', 'Score tunnels', '', 'Gain 1 renown for every tunnel in a clearing of the season\'s terrain, plus 1 for every 2 tunnels on the map.'], DRAW1, ...DUSK_END],
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
  const NARR = /gain \d+ renown|breed|gather|take wing|collect \d+|toll|ambush|win|run out|draw \d+ card|prowl|forage|spawn|surface/i;
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
  function flash(r) { if (T3.on) T3.flash[r] = performance.now(); const g = document.querySelector(`.clr[data-r="${r}"]`); if (g) { g.classList.add('flash'); setTimeout(() => g.classList.remove('flash'), 1600); } }

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
    if (b.attHits !== undefined) wrap.querySelector('#bres').innerHTML = `${short(b.att)} deal ${b.attHits} hit${b.attHits === 1 ? '' : 's'}${b.notes.some(n => /Defenseless/.test(n)) ? ' (incl. +1 defenseless)' : ''} · ${short(b.def)} deal ${b.defHits}${b.notes.some(n => /Spines/.test(n)) ? ' (incl. +1 spines)' : ''}`;
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
  const PALETTE = {
    simple: {
      bg: '#4f6e47', blobs: ['#47643f', '#58784e'], trees: ['#2d5531', '#376640', '#284b2b', '#41743f', '#31603a'], treeHi: 'rgba(255,255,255,.1)', ink: null,
      pathOut: '#7f6a45', pathIn: '#cdb487', pathDash: '#b39a6c', riverOut: '#2d5e84', riverIn: '#4f97cc', riverHi: '#a9d5f0',
      fill: { meadow: '#e6d38c', marsh: '#a3cdb9', grove: '#b4d090' }, edge: { meadow: '#b9a35a', marsh: '#6fa392', grove: '#7fa35f' },
      flower: ['#fff7e0', '#e98a9b'], reed: '#3f7a5a', pond: '#5f9fbf', bush: '#5f8f45', plate: '#f3ead2', plateEdge: '#8b7650',
    },
    // autumn storybook: mint forest floor, orange and rust canopies, everything outlined in brown ink
    art: {
      bg: '#9cc4ae', blobs: ['#8db8a2', '#aed0bd'], trees: ['#e8963a', '#d9772b', '#c4582a', '#eab04a', '#b8481f'], treeHi: 'rgba(255,236,190,.35)', ink: '#3b2418',
      pathOut: '#3b2418', pathIn: '#efd49a', pathDash: '#c9a45e', riverOut: '#2a3a40', riverIn: '#5f9fb0', riverHi: '#d3ece6',
      fill: { meadow: '#f2d98e', marsh: '#bcdcc8', grove: '#d3dc9c' }, edge: { meadow: '#3b2418', marsh: '#3b2418', grove: '#3b2418' },
      flower: ['#fff6e0', '#e5704f'], reed: '#3b2418', pond: '#3f7f94', bush: '#c4582a', plate: '#f8ebcd', plateEdge: '#3b2418',
    },
  };
  function drawTerrain() {
    const rand = rng(7331), P = PALETTE[style === 'simple' ? 'simple' : 'art'], ink = P.ink ? ` stroke="${P.ink}" stroke-width="2"` : '';
    let h = '';
    h += `<rect x="-10" y="-14" width="1020" height="790" fill="${P.bg}"/>`;
    for (let i = 0; i < 70; i++) h += `<ellipse cx="${rand() * 1000}" cy="${rand() * 770}" rx="${30 + rand() * 60}" ry="${20 + rand() * 40}" fill="${rand() < .5 ? P.blobs[0] : P.blobs[1]}" opacity=".6"/>`;
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
      trees.push({ x, y, r: 12 + rand() * 9, c: P.trees[Math.floor(rand() * 5)] });
    }
    trees.sort((a, b) => a.y - b.y);
    const treeSvg = trees.map(t => `<circle cx="${t.x + 3}" cy="${t.y + 5}" r="${t.r}" fill="rgba(0,0,0,.28)"/><circle cx="${t.x}" cy="${t.y}" r="${t.r}" fill="${t.c}"${ink}/><circle cx="${t.x - t.r / 3}" cy="${t.y - t.r / 3}" r="${t.r / 2.2}" fill="${P.treeHi}"/>` +
      (P.ink ? `<path d="M${t.x + t.r * .1} ${t.y + t.r * .55} q${t.r * .3} -${t.r * .15} ${t.r * .5} -${t.r * .5}" stroke="${P.ink}" stroke-width="1.4" fill="none" stroke-linecap="round"/>` : '')).join('');
    // paths
    E.EDGES.forEach(([a, b], i) => {
      if (E.isRiver(a, b)) return;
      const d = curve(R[a], R[b], (i % 2 ? 1 : -1) * 14);
      h += `<path d="${d}" stroke="${P.pathOut}" stroke-width="20" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.pathIn}" stroke-width="${P.ink ? 15 : 13}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.pathDash}" stroke-width="2" stroke-dasharray="3 10" fill="none" stroke-linecap="round"/>`;
    });
    riverPaths.forEach(([a, b], i) => { const d = curve(a, b, (i % 2 ? 1 : -1) * 22); h += `<path d="${d}" stroke="${P.riverOut}" stroke-width="32" fill="none" stroke-linecap="round"/>`; });
    riverPaths.forEach(([a, b], i) => { const d = curve(a, b, (i % 2 ? 1 : -1) * 22); h += `<path d="${d}" stroke="${P.riverIn}" stroke-width="${P.ink ? 27 : 24}" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.riverHi}" stroke-width="2.5" stroke-dasharray="14 18" fill="none" stroke-linecap="round" opacity=".8"/>`; });
    h += treeSvg;
    // clearings
    R.forEach((c, i) => {
      h += `<circle cx="${c.x + 3}" cy="${c.y + 6}" r="76" fill="rgba(0,0,0,.3)"/><circle cx="${c.x}" cy="${c.y}" r="74" fill="${P.edge[c.terrain]}"/><circle cx="${c.x}" cy="${c.y}" r="${P.ink ? 71 : 69}" fill="${P.fill[c.terrain]}"/>`;
      for (let k = 0; k < 16; k++) {
        const ang = rand() * Math.PI * 2; if (ang > 1.1 && ang < 2.05) continue; // keep the name plate area clear
        const rr = 57 + rand() * 8, x = c.x + Math.cos(ang) * rr, y = c.y + Math.sin(ang) * rr;
        if (c.terrain === 'meadow') h += `<circle cx="${x}" cy="${y}" r="2.6" fill="${rand() < .5 ? P.flower[0] : P.flower[1]}"${P.ink ? ` stroke="${P.ink}" stroke-width=".8"` : ''}/><circle cx="${x}" cy="${y}" r="1" fill="#d99a1a"/>`;
        if (c.terrain === 'marsh') h += rand() < .5 ? `<path d="M${x} ${y + 5} l0 -10 M${x + 3} ${y + 5} l1 -8" stroke="${P.reed}" stroke-width="1.6"/><ellipse cx="${x}" cy="${y - 6}" rx="1.4" ry="3" fill="#7a5a33"/>` : `<ellipse cx="${x}" cy="${y}" rx="6" ry="2.2" fill="none" stroke="${P.pond}" stroke-width="1.2"/>`;
        if (c.terrain === 'grove') h += `<circle cx="${x}" cy="${y}" r="${4 + rand() * 2}" fill="${P.bush}"${P.ink ? ` stroke="${P.ink}" stroke-width="1"` : ''}/><circle cx="${x - 1}" cy="${y - 1}" r="2" fill="rgba(255,255,255,.15)"/>`;
      }
      const w = c.name.length * 9.5 + 44;
      h += `<g transform="translate(${c.x},${c.y + 84})"><rect x="${-w / 2}" y="-15" width="${w}" height="28" rx="7" fill="${P.plate}" stroke="${P.plateEdge}" stroke-width="${P.ink ? 2 : 1.5}"/>
        <use href="#t-${c.terrain}" x="${-w / 2 + 5}" y="-10" width="19" height="19"/><text class="plate" x="12" y="5" text-anchor="middle">${c.name}</text></g>`;
    });
    // art style: wobble every line like it was inked by hand, then lay paper grain over the map
    if (P.ink) h = `<g filter="url(#rough)">${h}</g><rect x="-10" y="-14" width="1020" height="790" filter="url(#grain)" opacity=".3" pointer-events="none"/>`;
    $('terrainLayer').innerHTML = h;
  }
  // ---------- map: 3D view ----------
  // A three.js tabletop built from the same recipes as the Blender model in 3d/. It mirrors the game state on every board
  // render; the SVG map stays in the page (hidden) so playback timing and the 2D view keep working unchanged.
  const T3 = { on: false, ready: null, scene: null, pieces: new Map(), flash: {}, rings: [], dests: [] };
  const THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
  function set3D(on) {
    T3.on = on;
    $('map').style.display = on ? 'none' : '';
    const cv = $('map3d'); if (cv) cv.style.display = on ? '' : 'none';
    if (!on) return;
    T3.ready = T3.ready || new Promise((ok, no) => { const s = document.createElement('script'); s.src = THREE_URL; s.onload = ok; s.onerror = no; document.head.appendChild(s); })
      .then(() => document.fonts.ready).then(init3D);
    T3.ready.then(() => { if (T3.on && shown) renderBoard(); })
      .catch(e => { console.error(e); T3.ready = null; toast('The 3D view could not load. Showing the artistic style instead.'); style = 'art'; ls.set('tw-style', style); applyStyle(); });
  }
  const V3 = (x, y, h = 0) => new THREE.Vector3((x - 500) * .01, h, (y - 390) * .01);
  function init3D() {
    const cv = document.createElement('canvas'); cv.id = 'map3d'; cv.tabIndex = 0; cv.setAttribute('aria-label', 'Forest map in 3D');
    $('map').after(cv);
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9dcc0');
    const camera = new THREE.PerspectiveCamera(36, 1020 / 790, 0.1, 100);
    camera.position.set(0, 9.7, 8.0); camera.lookAt(0, 0, 0.5);
    scene.add(new THREE.HemisphereLight('#fff4e0', '#7a6d5c', 0.58));
    const sun = new THREE.DirectionalLight('#fff0d8', 0.62); sun.position.set(-5, 10, 6); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008;
    scene.add(sun);
    const mats = {}, M = (c, toon) => mats[c + toon] || (mats[c + toon] = toon ? new THREE.MeshToonMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c }));
    const mesh = (geo, color, pos, opts = {}) => {
      const m = new THREE.Mesh(geo, M(color, opts.toon)); if (pos) m.position.copy(pos);
      if (opts.scale) m.scale.set(...opts.scale); if (opts.rot) m.rotation.set(...opts.rot);
      m.castShadow = opts.cast !== false; m.receiveShadow = true; return m;
    };
    const board = new THREE.Group(); scene.add(board);
    board.add(mesh(new THREE.BoxGeometry(10.8, 0.3, 8.5), '#7a5232', new THREE.Vector3(0, -0.16, 0)));
    board.add(mesh(new THREE.BoxGeometry(10.4, 0.02, 8.1), '#9cc4ae', new THREE.Vector3(0, -0.01, 0), { cast: false }));
    const TER = { meadow: '#f2d98e', marsh: '#bcdcc8', grove: '#d3dc9c' }, tops = [];
    R.forEach((c, i) => {
      board.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 64), '#3b2418', V3(c.x, c.y, 0.04)));
      const t = mesh(new THREE.CylinderGeometry(0.71, 0.71, 0.1, 64), TER[c.terrain], V3(c.x, c.y, 0.05)); t.userData.r = i; tops.push(t); board.add(t);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true }));
      ring.rotation.x = -Math.PI / 2; ring.position.copy(V3(c.x, c.y, 0.11)); ring.visible = false; board.add(ring); T3.rings.push(ring);
    });
    // paths and river: flattened tubes along the same bends as the 2D map
    const tube = (a, b, bend, r, h, color) => {
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), mx = (a.x + b.x) / 2 - dy / L * bend, my = (a.y + b.y) / 2 + dx / L * bend;
      const m = mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(a.x, a.y), V3(mx, my), V3(b.x, b.y)), 24, r, 8), color, null, { cast: false });
      m.scale.y = 0.12; m.position.y = h; board.add(m);
    };
    E.EDGES.forEach(([a, b], i) => { if (!E.isRiver(a, b)) tube(R[a], R[b], (i % 2 ? 1 : -1) * 14, 0.1, 0.004, '#efd49a'); });
    const riverPaths = [[{ x: 330, y: -14 }, R[1]], ...E.RIVER.map(([a, b]) => [R[a], R[b]]), [R[12], { x: 470, y: 776 }]];
    riverPaths.forEach(([a, b], i) => { tube(a, b, (i % 2 ? 1 : -1) * 22, 0.17, 0.0, '#2a3a40'); tube(a, b, (i % 2 ? 1 : -1) * 22, 0.14, 0.008, '#5f9fb0'); });
    // name plates with canvas-drawn labels
    const label = (txt, w, h, font, color = '#2a1a12', bg = null) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
      g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 2);
      const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
    };
    const plates = R.map(c => {
      const w = c.name.length * 0.075 + 0.12, p = V3(c.x, c.y + 86, 0.04);
      board.add(mesh(new THREE.BoxGeometry(w, 0.06, 0.2), '#f8ebcd', p));
      const top = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.2), new THREE.MeshBasicMaterial({ map: label(c.name, 512, 96, '800 64px Grandstander, Alegreya, serif', '#2a1a12', '#f8ebcd') }));
      top.rotation.x = -Math.PI / 2; top.position.set(p.x, 0.072, p.z); board.add(top);
      return { x: p.x, z: p.z, w };
    });
    // autumn trees: one instanced canopy mesh and one trunk mesh, placed like the 2D map and kept off the plates
    const rand = rng(7331), segs = [];
    riverPaths.forEach(([a, b]) => segs.push([a, b, 34]));
    E.EDGES.forEach(([a, b]) => { if (!E.isRiver(a, b)) segs.push([R[a], R[b], 24]); });
    const spots = [];
    for (let gx = -10; gx < 1010; gx += 30) for (let gy = -14; gy < 776; gy += 30) {
      const x = gx + rand() * 22, y = gy + rand() * 22;
      if (R.some(c => Math.hypot(c.x - x, c.y - y) < 100)) continue;
      if (segs.some(([a, b, w]) => segDist(x, y, a.x, a.y, b.x, b.y) < w)) continue;
      if (rand() < .18) continue;
      const v = V3(x, y), r = (12 + rand() * 9) * .01, h = r * (1.4 + rand() * .6), col = Math.floor(rand() * 5);
      if (plates.some(p => Math.abs(v.x - p.x) < p.w / 2 + .25 && v.z - p.z > -.25 && v.z - p.z < 1)) continue;
      spots.push({ v, r, h, col });
    }
    const LEAF = ['#e8963a', '#d9772b', '#c4582a', '#eab04a', '#b8481f'].map(c => new THREE.Color(c));
    const canG = new THREE.IcosahedronGeometry(1, 1), trG = new THREE.CylinderGeometry(1, 1, 1, 7);
    const can = new THREE.InstancedMesh(canG, new THREE.MeshLambertMaterial({ flatShading: true }), spots.length);
    const tr = new THREE.InstancedMesh(trG, new THREE.MeshLambertMaterial({ color: '#6e6080' }), spots.length);
    const o = new THREE.Object3D();
    spots.forEach((s, i) => {
      o.position.set(s.v.x, s.h / 2, s.v.z); o.scale.set(s.r * .18, s.h, s.r * .18); o.rotation.set(0, 0, 0); o.updateMatrix(); tr.setMatrixAt(i, o.matrix);
      o.position.set(s.v.x, s.h + s.r * .55, s.v.z); o.scale.set(s.r * 1.15, s.r * .95, s.r * 1.15); o.rotation.y = i; o.updateMatrix(); can.setMatrixAt(i, o.matrix);
      can.setColorAt(i, LEAF[s.col]);
    });
    can.castShadow = tr.castShadow = true; board.add(can, tr);
    // critters and buildings, as storybook toys (toon shaded). Front faces the camera (+z).
    const sph = new THREE.SphereGeometry(1, 20, 14), cone = new THREE.ConeGeometry(1, 1, 16), cyl = new THREE.CylinderGeometry(1, 1, 1, 20), box = new THREE.BoxGeometry(1, 1, 1);
    const P3 = (x, y, z) => new THREE.Vector3(x, y, z);
    const part = (g, geo, color, pos, scale, rot) => g.add(mesh(geo, color, pos, { toon: true, scale, rot }));
    const FUR = { badger: '#5b544d', rabbit: '#efd36a', owl: '#d9692c', otter: '#8a5a38', fox: '#e07a3a', hedgehog: '#e9cfa4', frog: '#8fd16a', mole: '#4e3f4a' };
    const CLOAK = { badger: '#6e7c8c', rabbit: '#d9772b', owl: '#7a58a8', otter: '#2f7fb5', fox: '#c0392b', hedgehog: '#8d6e3f', frog: '#3f9a4a', mole: '#c2507f' };
    const EYE = { badger: .03, rabbit: .03, owl: .037, otter: .027, fox: .028, hedgehog: .027, frog: .034, mole: .018 };
    T3.make = { critter(f) {
      const g = new THREE.Group(), e = EYE[f];
      g.add(mesh(new THREE.CylinderGeometry(.065, .11, .17, 24), CLOAK[f], P3(0, .085, 0), { toon: true }));
      part(g, sph, FUR[f], P3(0, .225, 0), [.088, .088, .088]);
      for (const s of [-1, 1]) { part(g, sph, '#fffaf0', P3(s * .036, .238, .068), [e, e, e]); part(g, sph, '#2a1a12', P3(s * .033, .243, .068 + e * .82), [e * .5, e * .5, e * .5]); }
      if (f === 'badger') {
        part(g, sph, '#fffaf0', P3(0, .262, .05), [.024, .05, .045]); part(g, sph, '#2a1a12', P3(0, .205, .088), [.016, .016, .016]);
        for (const s of [-1, 1]) part(g, sph, FUR[f], P3(s * .062, .292, -.005), [.03, .03, .03]);
      } else if (f === 'rabbit') {
        part(g, sph, '#f2a9a0', P3(0, .205, .087), [.012, .012, .012]);
        for (const s of [-1, 1]) { part(g, sph, FUR[f], P3(s * .035, .35, 0), [.026, .085, .016], [0, 0, -s * .17]); part(g, sph, '#f2a9a0', P3(s * .035, .35, .012), [.012, .065, .008], [0, 0, -s * .17]); }
      } else if (f === 'owl') {
        for (const s of [-1, 1]) part(g, cone, '#b8481f', P3(s * .055, .31, 0), [.028, .07, .028], [0, 0, -s * .44]);
        part(g, cone, '#f2bf34', P3(0, .205, .09), [.018, .045, .018], [1.75, 0, 0]);
      } else if (f === 'otter') {
        part(g, sph, '#f1dcc0', P3(0, .2, .068), [.048, .032, .03]); part(g, sph, '#2a1a12', P3(0, .21, .096), [.014, .014, .014]);
        for (const s of [-1, 1]) part(g, sph, FUR[f], P3(s * .066, .278, 0), [.024, .024, .024]);
      } else if (f === 'fox') {
        part(g, sph, '#fbeedd', P3(0, .2, .07), [.05, .03, .035]); part(g, sph, '#2a1a12', P3(0, .207, .103), [.013, .013, .013]);
        for (const s of [-1, 1]) part(g, cone, FUR[f], P3(s * .05, .325, 0), [.03, .08, .022], [0, 0, -s * .3]);
      } else if (f === 'hedgehog') {
        part(g, sph, '#2a1a12', P3(0, .212, .09), [.014, .014, .014]);
        for (let k = 0; k < 9; k++) { const a = -1.3 + k * .325; part(g, cone, '#4a3524', P3(Math.sin(a) * .07, .24 + Math.cos(a) * .07, -.035), [.026, .075, .026], [-.5, 0, -a]); }
      } else if (f === 'frog') {
        g.children.slice(-4).forEach(m => { m.position.y += .055; });
        for (const s of [-1, 1]) part(g, sph, FUR[f], P3(s * .036, .292, .045), [.042, .042, .042]);
        part(g, box, '#2a1a12', P3(0, .2, .083), [.07, .006, .01]);
      } else if (f === 'mole') {
        part(g, sph, '#f0a3b8', P3(0, .207, .09), [.03, .022, .024]);
        part(g, sph, '#ffd84a', P3(0, .3, .055), [.02, .02, .02]); part(g, cyl, '#6b5a3a', P3(0, .3, .035), [.03, .012, .03], [Math.PI / 2, 0, 0]);
      }
      return g;
    }, building(f) {
      const g = new THREE.Group();
      const flag = (x, z, h) => { part(g, cyl, '#5a3e28', P3(x, h / 2, z), [.008, h, .008]); part(g, box, CLOAK[f], P3(x + .05, h - .04, z), [.1, .07, .008]); };
      if (f === 'badger') { part(g, sph, '#8a6a43', P3(0, 0, 0), [.15, .12, .14]); part(g, cyl, '#1e140e', P3(0, .04, .13), [.05, .06, .05], [Math.PI / 2, 0, 0]); flag(.1, -.06, .36); }
      if (f === 'owl') {
        part(g, cyl, '#a6794a', P3(0, .06, 0), [.11, .12, .11]); g.add(mesh(new THREE.TorusGeometry(.1, .04, 10, 32), '#785430', P3(0, .14, 0), { toon: true, rot: [Math.PI / 2, 0, 0] }));
        for (const x of [-.03, .035]) part(g, sph, '#f1dcc0', P3(x, .14, 0), [.03, .038, .03]);
        flag(.12, -.05, .4);
      }
      if (f === 'otter') { part(g, box, '#a6794a', P3(0, .075, 0), [.22, .15, .2]); part(g, cone, CLOAK[f], P3(0, .2, 0), [.18, .12, .18], [0, Math.PI / 4, 0]); part(g, box, '#1e140e', P3(0, .05, .1), [.06, .1, .01]); flag(.13, -.05, .42); }
      if (f === 'hedgehog') { part(g, cyl, '#8a6440', P3(0, .08, 0), [.09, .26, .09], [Math.PI / 2, 0, 0]); part(g, cyl, '#1e140e', P3(0, .08, .131), [.06, .01, .06], [Math.PI / 2, 0, 0]); part(g, sph, '#c4582a', P3(-.04, .17, -.05), [.05, .03, .05]); flag(.12, -.08, .38); }
      if (f === 'frog') { part(g, cyl, '#5f9fb0', P3(0, .01, 0), [.16, .02, .16]); part(g, cyl, '#5aa84a', P3(0, .03, 0), [.13, .02, .13]); part(g, cone, '#f2a9c4', P3(.03, .07, .02), [.035, .06, .035]); flag(.12, -.06, .36); }
      if (f === 'mole') { part(g, sph, '#7a5a3a', P3(0, 0, 0), [.13, .1, .12]); part(g, cyl, '#1e140e', P3(0, .05, .11), [.045, .01, .045], [1.2, 0, 0]); for (const x of [-.09, .08]) part(g, sph, '#9a948a', P3(x, .02, .07), [.03, .025, .03]); flag(.1, -.06, .36); }
      return g;
    }, flag(f) {
      const g = new THREE.Group(); part(g, cyl, '#3a2f1c', P3(0, .2, 0), [.012, .4, .012]); part(g, box, E.FACTIONS[f].color, P3(.1, .34, 0), [.2, .12, .01]); return g;
    }, count(n) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: label('×' + n, 128, 64, '800 44px Grandstander, Alegreya, sans-serif', '#2a1a12', '#fff6e3') }));
      s.scale.set(.26, .13, 1); return s;
    } };
    // clicks: pick a clearing under the pointer
    const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
    const pick = e => { const b = cv.getBoundingClientRect(); ptr.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1); ray.setFromCamera(ptr, camera); const h = ray.intersectObjects(tops)[0]; return h ? h.object.userData.r : null; };
    cv.addEventListener('click', e => { const r = pick(e); if (r !== null) clickRegion(r, T3.dests); });
    cv.addEventListener('pointermove', e => { const r = pick(e); cv.style.cursor = r !== null && T3.rings[r].visible ? 'pointer' : 'default'; });
    new ResizeObserver(() => { const w = cv.clientWidth, h = cv.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } }).observe(cv);
    Object.assign(T3, { scene, board, renderer, camera, cv });
    const loop = now => {
      requestAnimationFrame(loop);
      if (!T3.on || $('game').hidden) return;
      for (const [k, p] of T3.pieces) {
        const t = Math.min(1, (now - p.t0) / 450), s = p.dying ? 1 - t : t < 1 ? 1 + Math.sin(t * Math.PI) * .25 * (1 - t) - (1 - t) * (1 - t) : 1;
        p.obj.scale.setScalar(Math.max(0.001, s * p.size));
        if (p.dying && t >= 1) { board.remove(p.obj); T3.pieces.delete(k); }
      }
      T3.rings.forEach((g, i) => {
        const fl = T3.flash[i] && now - T3.flash[i] < 1600;
        if (fl) { g.visible = true; g.material.color.set('#d99a1c'); }
        g.material.opacity = g.userData.dest || fl ? .55 + .45 * Math.sin(now / 160) : 1;
        if (!fl && T3.flash[i]) { delete T3.flash[i]; g.visible = !!g.userData.on; g.material.color.set(g.userData.color || '#ffe27a'); }
      });
      renderer.render(scene, camera);
    };
    requestAnimationFrame(loop);
  }
  function sync3D(st, actR, destR, dests) {
    T3.dests = dests;
    T3.rings.forEach((g, i) => {
      const on = actR.has(i) || destR.has(i) || sel === i;
      g.userData = { on, dest: destR.has(i), color: sel === i ? '#ffffff' : '#ffe27a' };
      g.visible = on || !!T3.flash[i]; g.material.color.set(g.userData.color); g.scale.setScalar(destR.has(i) ? 1.03 : 1);
    });
    // desired pieces this frame, keyed so unchanged pieces stay put and only new ones pop in
    const want = new Map(), now = performance.now();
    R.forEach((c, r) => {
      st.regions[r].b.forEach((b, k) => want.set(`b-${r}-${k}-${b}`, { make: () => T3.make.building(b), pos: V3(c.x - (c.slots * 34 - 4) / 2 + k * 34 + 15, c.y - 40, .1), size: 1.2 }));
      for (const t of tokenLayout(st, r)) {
        want.set(`${t.key}`, { make: () => T3.make.critter(t.f), pos: V3(t.x, t.y + 6, .1), size: 1.25 });
        if (t.extra) want.set(`n-${t.key}-${t.extra}`, { make: () => T3.make.count(t.extra), pos: V3(t.x + 8, t.y + 6, .6), size: 1.2 });
      }
      const rl = E.ruler(st, r); if (rl) want.set(`f-${r}-${rl}`, { make: () => T3.make.flag(rl), pos: V3(c.x + 56, c.y - 62, .1), size: 1 });
    });
    for (const [k, p] of T3.pieces) if (!want.has(k) && !p.dying) { p.dying = true; p.t0 = now; }
    for (const [k, w] of want) {
      const p = T3.pieces.get(k);
      if (p && !p.dying) { p.obj.position.copy(w.pos); continue; }
      if (p) T3.board.remove(p.obj);
      const obj = w.make(); obj.position.copy(w.pos); obj.rotation.y = (k.length * 7 % 5 - 2) * .06; obj.scale.setScalar(.001);
      T3.board.add(obj); T3.pieces.set(k, { obj, t0: now, size: w.size });
    }
  }
  applyStyle();

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
    g.innerHTML = `<use href="#${mk()}-${f}" x="${x - 13}" y="${y - h / 2 - 4}" width="26" height="${h}"/>`;
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
    if (T3.on && T3.scene) sync3D(st, actR, destR, dests);
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
    $('handHint').textContent = st.phase === 'discard' && myTurn ? `Too many cards: discard down to ${E.handLimit(myF)}.` : myTurn ? 'Cards you can use show buttons.' : 'Ambush cards defend you by themselves.';
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
      const nb = E.buildingsOnMap(st, p.faction), tot = E.FACTIONS[p.faction].critters;
      const mx = E.FACTIONS[p.faction].maxB, bn = { hedgehog: 'hollows', frog: 'pads', mole: 'tunnels', owl: 'nests' }[p.faction];
      const res = p.faction === 'badger' ? [`<b>${p.stone}</b> stone`, `<b>${nb}/6</b> setts`] : p.faction === 'otter' ? [`<b>${p.coins}</b> coins`, `<b>${nb}/5</b> posts`]
        : p.faction === 'rabbit' ? [`rules <b>${E.ruledCount(st, 'rabbit')}</b> clearings`]
        : p.faction === 'fox' ? [`rules <b>${E.ruledCount(st, 'fox')}</b> clearings`]
        : p.faction === 'frog' ? [`<b>${nb}/${mx}</b> ${bn}`, `chain of <b>${E.chorus(st, 'frog')}</b>`] : [`<b>${nb}/${mx}</b> ${bn}`];
      const stats = [`<span class="wr"><b>${tot - E.supply(st, p.faction)}/${tot}</b> warriors</span>`, ...res.map(x => `<span>${x}</span>`), `<span><b>${p.hand.length}</b> cards</span>`];
      return `<div class="pchip ${i === st.current && st.phase !== 'over' ? 'cur' : ''}" data-f="${p.faction}" style="--pc:${E.FACTIONS[p.faction].color}">
        ${emblem(p.faction, 40)}<div style="min-width:0"><div class="nm">${esc(p.name)}${p.faction === myF ? ' (you)' : ''}</div><div class="sub">${E.FACTIONS[p.faction].name}${p.ai ? ' · AI' : ''}</div></div>
        <div class="vp">${p.renown}<small>RENOWN</small></div><div class="stats">${stats.join('')}</div><div class="bar"><i style="width:${Math.min(100, p.renown / E.WIN * 100)}%"></i></div></div>`;
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
      add(`<p class="hint">Click a clearing with a <b>dashed gold ring</b> to act there.${MOVE_HINT[myF] || ''}</p>`);
    } else {
      const c = R[sel], rl = E.ruler(st, sel);
      const here = st.players.filter(p => E.pieces(st, sel, p.faction) > 0).map(p => `${short(p.faction)} ${E.critters(st, sel, p.faction)}${E.buildingsOf(st, sel, p.faction) ? ' + building' : ''}`).join(' · ') || 'empty';
      const ri = add(`<div class="regioninfo"><span class="rn">${c.name}</span><span class="hint">${c.terrain}${E.RIVERSIDE[sel] ? ' · on the river' : ''} · ${rl ? 'ruled by ' + short(rl) : 'nobody rules'}</span><span class="hint">${here}</span></div>`);
      g.insertBefore(ri, box);
      const moves = acts.filter(a => a.type === 'move' && a.from === sel);
      if (moves.length) {
        const max = moves[0].max; if (!moveCount || moveCount > max) moveCount = max;
        const mv = document.createElement('div'); mv.className = 'panel'; mv.style.padding = '10px';
        mv.innerHTML = `<div class="hint"><b>${MOVE_VERB[myF] || 'Move'}:</b> choose how many, then click a <b>glowing clearing</b>.</div>
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
        } else if (a.type === 'build') abtn(a, 'build', BUILD_BTN[myF], a.label.replace(/^.*\(/, '').replace(/\)$/, ''));
        else if (a.type === 'raid') abtn(a, 'card', `Raid the ${short(a.target)}`, 'Steal a random card, +1 renown');
        else if (a.type === 'raise') abtn(a, 'add', 'Raise 2 hedgehogs', '1 action');
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
        <p class="tp-lede">Up to four of eight woodland factions fight over the forest. Each faction plays by its own rules and scores <b>renown</b> in its own way.</p>
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
