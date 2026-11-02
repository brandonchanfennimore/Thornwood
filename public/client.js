// Thornwood — browser client
(() => {
  const E = window.Engine;
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  let room = null, token = null, es = null, state = null, sel = null, lastBattleSeq = null, toastTimer = null;

  async function post(path, data) {
    const r = await fetch('/api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room, token, ...data }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Request failed');
    return j;
  }
  function show(id) { for (const s of ['home', 'lobby', 'game']) $(s).classList.toggle('hidden', s !== id); }

  // ---------- home ----------
  $('nameIn').value = store.get('tw-name') || '';
  const qs = new URLSearchParams(location.search);
  if (qs.get('room')) $('codeIn').value = qs.get('room').toUpperCase();
  async function enter(kind) {
    $('homeErr').textContent = '';
    const name = $('nameIn').value.trim() || 'Wanderer';
    store.set('tw-name', name);
    try {
      const code = $('codeIn').value.trim().toUpperCase();
      if (kind === 'join' && !code) throw new Error('Enter a room code.');
      room = kind === 'join' ? code : null;
      const prev = kind === 'join' ? store.get('tw-token-' + code) : null;
      const j = await post(kind, { name, room, token: prev });
      room = j.room; token = j.token; store.set('tw-token-' + room, token);
      history.replaceState(null, '', '?room=' + room);
      connect();
    } catch (e) { $('homeErr').textContent = e.message; }
  }
  $('createBtn').onclick = () => enter('create');
  $('joinBtn').onclick = () => enter('join');
  $('codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') enter('join'); });
  // auto-rejoin
  if (qs.get('room') && store.get('tw-token-' + qs.get('room').toUpperCase())) enter('join');

  function connect() {
    if (es) es.close();
    es = new EventSource(`/api/events?room=${room}&token=${token}`);
    es.onmessage = ev => { const d = JSON.parse(ev.data); render(d); };
    es.onerror = () => { $('roomTag').textContent = `Room ${room} · reconnecting…`; };
    es.onopen = () => { $('roomTag').textContent = `Room ${room}`; };
  }

  // ---------- lobby ----------
  function render(d) {
    $('roomTag').textContent = `Room ${room}`;
    if (!d.game) { state = null; show('lobby'); renderLobby(d.lobby); return; }
    show('game'); state = d.game; state.lobby = d.lobby; renderGame();
  }
  function renderLobby(L) {
    $('lobbyCode').textContent = L.code;
    $('inviteLink').value = `${location.origin}/?room=${L.code}`;
    const fopts = cur => E.FACTION_KEYS.map(f => `<option value="${f}" ${f === cur ? 'selected' : ''}>${E.FACTIONS[f].name}</option>`).join('');
    $('seats').innerHTML = L.seats.map(s => {
      const canFaction = L.host || s.you;
      const label = s.type === 'open' ? '<span class="muted">Waiting for a player…</span>' : esc(s.name) + (s.you ? ' <span class="tag">you</span>' : '') + (s.type === 'human' && !s.online ? ' <span class="tag">offline</span>' : '');
      const hostCtl = L.host && !(s.you && L.host && s.i === 0) && !s.you ? `
        <select data-op="type" data-i="${s.i}"><option value="open" ${s.type !== 'ai' ? 'selected' : ''}>Human</option><option value="ai" ${s.type === 'ai' ? 'selected' : ''}>AI</option></select>
        ${L.seats.length > 2 ? `<button data-op="remove" data-i="${s.i}" class="ghost" title="Remove seat">✕</button>` : ''}` : '';
      return `<div class="seat"><span class="dot" style="background:var(--${s.faction})"></span><span class="who">${label}</span>
        ${canFaction ? `<select data-op="faction" data-i="${s.i}">${fopts(s.faction)}</select>` : `<span class="tag">${E.FACTIONS[s.faction].name}</span>`}${hostCtl}</div>`;
    }).join('');
    $('seats').querySelectorAll('select,button').forEach(el => {
      const ev = el.tagName === 'SELECT' ? 'onchange' : 'onclick';
      el[ev] = () => post('seat', { op: el.dataset.op, i: +el.dataset.i, value: el.value }).catch(e => $('lobbyErr').textContent = e.message);
    });
    $('hostRow').classList.toggle('hidden', !L.host);
    $('addSeatBtn').disabled = L.seats.length >= 4;
    $('lobbyMsg').textContent = L.host ? 'You are the host.' : 'Waiting for the host to start…';
  }
  $('addSeatBtn').onclick = () => post('seat', { op: 'add' }).catch(e => $('lobbyErr').textContent = e.message);
  $('startBtn').onclick = () => post('start', {}).catch(e => $('lobbyErr').textContent = e.message);
  $('copyBtn').onclick = () => { $('inviteLink').select(); navigator.clipboard?.writeText($('inviteLink').value); $('copyBtn').textContent = 'Copied'; setTimeout(() => $('copyBtn').textContent = 'Copy link', 1500); };

  // ---------- game ----------
  const NS = 'http://www.w3.org/2000/svg';
  function regionActs(r) {
    return state.actions.filter(a => a.region === r || a.from === r);
  }
  function renderMap() {
    const s = state, svg = $('map');
    const act = new Set(); state.actions.forEach(a => { if (a.region !== undefined) act.add(a.region); if (a.from !== undefined) act.add(a.from); });
    let h = '';
    for (const [a, b] of E.EDGES) {
      const A = E.REGIONS[a], B = E.REGIONS[b];
      if (E.isRiver(a, b)) h += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="var(--river)" stroke-width="14" stroke-linecap="round" opacity=".75"/>`;
      h += `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" stroke="var(--path)" stroke-width="5" stroke-dasharray="2 9" stroke-linecap="round"/>`;
    }
    E.REGIONS.forEach((R, i) => {
      const reg = s.regions[i], rl = E.ruler(s, i);
      const cls = ['region', act.has(i) ? 'can' : '', sel === i ? 'sel' : ''].join(' ');
      h += `<g class="${cls}" data-r="${i}">`;
      h += `<circle class="body" cx="${R.x}" cy="${R.y}" r="64" fill="var(--${R.terrain})"/>`;
      if (rl) h += `<circle cx="${R.x}" cy="${R.y}" r="70" fill="none" stroke="var(--${rl})" stroke-width="4" opacity=".8"/>`;
      h += `<text class="rname" x="${R.x}" y="${R.y - 74}" text-anchor="middle">${R.name}${E.RIVERSIDE[i] ? ' ≈' : ''}</text>`;
      // slots
      for (let k = 0; k < R.slots; k++) {
        const x = R.x - (R.slots * 30 - 6) / 2 + k * 30, y = R.y - 46, b = reg.b[k];
        h += `<rect x="${x}" y="${y}" width="24" height="24" rx="5" fill="${b ? `var(--${b})` : 'rgba(255,255,255,.55)'}" stroke="rgba(0,0,0,.35)"/>`;
        if (b) h += `<text class="pc" x="${x + 12}" y="${y + 17}" text-anchor="middle">${{ badger: '⌂', owl: '◉', otter: '⚓' }[b]}</text>`;
      }
      // critters
      const fs = s.players.map(p => p.faction).filter(f => reg.c[f] > 0);
      fs.forEach((f, k) => {
        const n = fs.length, x = R.x - (n - 1) * 17 + k * 34, y = R.y + 10;
        h += `<circle cx="${x}" cy="${y}" r="15" fill="var(--${f})" stroke="#fff" stroke-width="2"/><text class="pc" x="${x}" y="${y + 5}" text-anchor="middle">${reg.c[f]}</text>`;
      });
      h += `<text x="${R.x}" y="${R.y + 48}" text-anchor="middle" font-size="11" fill="var(--ink)" opacity=".6">${R.terrain}</text>`;
      h += `</g>`;
    });
    svg.innerHTML = h;
    svg.querySelectorAll('.region').forEach(g => g.onclick = () => { const r = +g.dataset.r; sel = sel === r ? null : r; renderGame(); });
  }

  function doAct(a, extra) {
    const { label, max, ...clean } = a;
    post('action', { action: { ...clean, ...extra } }).catch(e => toast(esc(e.message)));
  }
  function btn(a, text) {
    const b = document.createElement('button'); b.textContent = text || a.label; b.onclick = () => doAct(a); return b;
  }

  function renderGame() {
    const s = state, me = s.me, mp = me && s.players.find(p => p.faction === me);
    const cur = s.players[s.current], myTurn = cur.faction === me;
    renderMap();

    // turnbar
    let tb;
    if (s.phase === 'over') {
      const w = s.players.find(p => p.faction === s.winner);
      tb = `<span class="winner">🏆 ${esc(w.name)} (${E.FACTIONS[w.faction].name}) win!</span> ${s.lobby.host ? '<button id="rematch">Back to lobby</button>' : ''}`;
    } else {
      tb = `Round ${s.round}/${E.MAX_ROUNDS} · <b>${s.season}</b> season · ${myTurn ? '<b>Your turn</b>' : `${esc(cur.name)} is playing…`}`;
    }
    $('turnbar').innerHTML = tb;
    if ($('rematch')) $('rematch').onclick = () => post('rematch', {});

    // players
    $('players').innerHTML = s.players.map((p, i) => {
      const F = E.FACTIONS[p.faction], nb = E.buildingsOnMap(s, p.faction);
      const res = p.faction === 'badger' ? `🪨 ${p.stone} stone · ${nb}/6 setts` : p.faction === 'otter' ? `🪙 ${p.coins} coins · ${nb}/5 posts` : p.faction === 'owl' ? `${nb}/4 nests` : `${E.ruledCount(s, 'rabbit')} regions ruled`;
      return `<div class="pl ${i === s.current && s.phase !== 'over' ? 'cur' : ''}"><div class="bar" style="background:var(--${p.faction})"></div>
        <div><div class="nm">${esc(p.name)}${p.faction === me ? ' (you)' : ''}${p.ai ? ' <span class="tag">AI</span>' : ''}</div>
        <div class="sub">${F.name} · ${res} · ${p.handCount} cards · ${E.supply(s, p.faction)} in supply</div>
        <div class="vpbar"><i style="width:${Math.min(100, p.renown / E.WIN * 100)}%;background:var(--${p.faction})"></i></div></div>
        <div class="vp">${p.renown}</div></div>`;
    }).join('');

    // actions
    const ap = $('actionPanel'); ap.innerHTML = '';
    const head = document.createElement('div'); head.className = 'status';
    if (!me) head.textContent = 'You are watching this game.';
    else if (s.phase === 'over') head.textContent = 'The game is over.';
    else if (!myTurn) head.textContent = `Waiting for ${cur.name}…`;
    else if (s.phase === 'discard') head.textContent = `Hand limit: discard down to ${E.HAND_LIMIT} cards (pick from your hand).`;
    else head.innerHTML = me === 'otter' ? `Your turn · <b>${mp.coins}</b> coins (move 1, attack 2, hire 2, post 3)` : `Your turn · <b>${s.actionsLeft}</b> action${s.actionsLeft === 1 ? '' : 's'} left${me === 'badger' ? ` · ${mp.stone} stone` : ''}`;
    ap.appendChild(head);

    if (myTurn && s.phase === 'main') {
      const list = document.createElement('div'); list.className = 'acts';
      const add = (title, arr, fn) => { if (!arr.length) return; const h = document.createElement('div'); h.className = 'sec'; h.textContent = title; list.appendChild(h); arr.forEach(a => list.appendChild(fn(a))); };
      const plain = a => { const d = document.createElement('div'); d.className = 'act'; d.appendChild(btn(a)); return d; };
      add('Turn', s.actions.filter(a => ['muster', 'hatch'].includes(a.type)), plain);
      if (sel !== null) {
        const RA = regionActs(sel);
        const nm = E.REGIONS[sel].name;
        const h = document.createElement('div'); h.className = 'sec'; h.textContent = `In ${nm}`; list.appendChild(h);
        if (!RA.length) { const p = document.createElement('div'); p.className = 'muted'; p.textContent = 'Nothing you can do here right now.'; list.appendChild(p); }
        RA.filter(a => a.type === 'move').forEach(a => {
          const d = document.createElement('div'); d.className = 'act';
          const inp = document.createElement('input'); inp.type = 'number'; inp.min = 1; inp.max = a.max; inp.value = a.max; inp.title = 'How many';
          const b = document.createElement('button'); b.textContent = `${me === 'owl' ? 'Fly' : 'Move'} to ${E.REGIONS[a.to].name}${E.isRiver(a.from, a.to) ? ' (river)' : ''}`;
          b.onclick = () => doAct(a, { count: +inp.value });
          d.append(inp, b); list.appendChild(d);
        });
        RA.filter(a => a.type !== 'move' && a.type !== 'card').forEach(a => list.appendChild(plain(a)));
        RA.filter(a => a.type === 'card').forEach(a => list.appendChild(plain(a)));
      } else {
        const p = document.createElement('div'); p.className = 'muted'; p.style.margin = '6px 0';
        p.textContent = 'Select a region on the map to move, attack or build there. Highlighted regions have options.';
        list.appendChild(p);
      }
      const end = s.actions.find(a => a.type === 'end');
      const d = document.createElement('div'); d.className = 'act'; d.style.marginTop = '10px';
      const eb = btn(end, 'End turn →'); eb.classList.add('primary'); d.appendChild(eb); list.appendChild(d);
      ap.appendChild(list);
    }

    // hand
    const hand = $('hand'); hand.innerHTML = '';
    if (mp) {
      if (!mp.hand.length) hand.innerHTML = '<span class="muted">No cards.</span>';
      for (const c of mp.hand) {
        const el = document.createElement('div'); el.className = `cardv ${c.terrain}`;
        el.innerHTML = `<div class="ct">${esc(E.cardName(c))}</div><div class="cx">${esc(E.CARD_TYPES[c.type].text)}</div>`;
        const btns = document.createElement('div'); btns.className = 'btns';
        for (const a of s.actions.filter(a => a.card === c.id)) {
          let t = { discard: 'Discard', quarry: 'Quarry +1 stone', trade: 'Sell +1 coin' }[a.type];
          if (a.type === 'card') t = a.region !== undefined ? `Rally: ${E.REGIONS[a.region].name}` : 'Play';
          btns.appendChild(btn(a, t));
        }
        el.appendChild(btns); hand.appendChild(el);
      }
    }

    // log
    $('log').innerHTML = s.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('');

    // battle toast
    const b = s.lastBattle;
    if (b && lastBattleSeq !== null && b.seq !== lastBattleSeq) {
      const dice = (rs, need) => `<span class="dice">${rs.map(x => `<span class="die ${x >= need ? 'hit' : ''}">${x}</span>`).join('') || '—'}</span>`;
      toast(`<b>⚔ ${E.FACTIONS[b.att].short} attack ${E.FACTIONS[b.def].short} in ${E.REGIONS[b.region].name}</b><br>
        ${E.FACTIONS[b.att].short} ${dice(b.attRolls, 4)} vs ${E.FACTIONS[b.def].short} ${dice(b.defRolls, b.def === 'badger' ? 3 : 4)}<br>
        <span class="muted">${b.notes.map(esc).join(' ')}</span>`);
    }
    lastBattleSeq = b ? b.seq : -1;
  }

  function toast(html) {
    const t = $('toast'); t.innerHTML = html; t.classList.remove('hidden');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 4500);
  }

  $('rulesBtn').onclick = () => $('rules').showModal();
  $('closeRules').onclick = () => $('rules').close();
})();
