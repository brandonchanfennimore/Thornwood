// Thornwood — multiplayer server (no dependencies). Run: node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const E = require('./public/engine.js');
const AI = require('./public/ai.js');

const PORT = process.env.PORT || 3000;
const PUB = path.join(__dirname, 'public');
const rooms = new Map();
const AI_NAMES = { badger: 'Old Brock', rabbit: 'Clover', owl: 'Hootsworth', otter: 'Captain Slick' };

const tok = () => crypto.randomBytes(12).toString('hex');
function code() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c; do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}

function lobbyView(room, token) {
  return {
    code: room.code, started: !!room.game, host: room.host === token,
    seats: room.seats.map((s, i) => ({ i, type: s.type, faction: s.faction, name: s.type === 'ai' ? AI_NAMES[s.faction] + ' (AI)' : s.name, you: s.token === token, online: s.type === 'human' && room.clients.some(c => c.token === s.token) })),
  };
}
function payload(room, token) {
  const seat = room.seats.find(s => s.token === token);
  const out = { lobby: lobbyView(room, token) };
  if (room.game) out.game = E.viewFor(room.game, seat ? seat.faction : null);
  return out;
}
function broadcast(room) {
  room.touched = Date.now();
  for (const c of room.clients) c.res.write(`data: ${JSON.stringify(payload(room, c.token))}\n\n`);
  scheduleAI(room);
}
function scheduleAI(room) {
  const g = room.game;
  if (!g || g.phase === 'over' || room.aiTimer) return;
  const cur = g.players[g.current];
  if (!cur.ai) return;
  room.aiTimer = setTimeout(() => {
    room.aiTimer = null;
    try { const a = AI.chooseAction(g, cur.faction); if (a) E.apply(g, cur.faction, a); }
    catch (e) { console.error('AI error', e); E.apply(g, cur.faction, { type: 'end' }); }
    broadcast(room);
  }, 650);
}

function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
function body(req) {
  return new Promise((ok, bad) => {
    let d = ''; req.on('data', x => { d += x; if (d.length > 1e5) req.destroy(); });
    req.on('end', () => { try { ok(d ? JSON.parse(d) : {}); } catch (e) { bad(e); } });
  });
}
const clean = n => String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 20) || 'Wanderer';

const routes = {
  async create(b) {
    const room = { code: code(), seats: [], clients: [], game: null, touched: Date.now() };
    const t = tok(); room.host = t;
    room.seats.push({ type: 'human', faction: 'badger', name: clean(b.name), token: t });
    room.seats.push({ type: 'ai', faction: 'owl' });
    rooms.set(room.code, room);
    return { room: room.code, token: t };
  },
  async join(b) {
    const room = rooms.get(String(b.room || '').toUpperCase());
    if (!room) throw new Error('No room with that code.');
    if (b.token && room.seats.some(s => s.token === b.token)) return { room: room.code, token: b.token };
    if (room.game) throw new Error('That game has already started.');
    const t = tok();
    let seat = room.seats.find(s => s.type === 'open');
    if (!seat) {
      if (room.seats.length >= 4) throw new Error('The room is full.');
      const used = room.seats.map(s => s.faction);
      seat = { faction: E.FACTION_KEYS.find(f => !used.includes(f)) }; room.seats.push(seat);
    }
    Object.assign(seat, { type: 'human', name: clean(b.name), token: t });
    broadcast(room);
    return { room: room.code, token: t };
  },
  async seat(b, room) {
    // host edits seats: {op:'add'|'remove'|'type'|'faction', i, value}
    if (room.game) throw new Error('Game already started.');
    const me = room.seats.find(s => s.token === b.token);
    const s = room.seats[b.i];
    if (b.op === 'faction') {
      if (!s || !(room.host === b.token || s === me)) throw new Error('Not allowed.');
      if (!E.FACTIONS[b.value]) throw new Error('Unknown faction.');
      const other = room.seats.find(x => x.faction === b.value);
      if (other) other.faction = s.faction; // swap
      s.faction = b.value;
    } else {
      if (room.host !== b.token) throw new Error('Only the host can do that.');
      if (b.op === 'add') {
        if (room.seats.length >= 4) throw new Error('Four seats at most.');
        const used = room.seats.map(x => x.faction);
        room.seats.push({ type: 'ai', faction: E.FACTION_KEYS.find(f => !used.includes(f)) });
      } else if (b.op === 'remove') {
        if (!s || s.token === room.host || room.seats.length <= 2) throw new Error('Cannot remove that seat.');
        room.seats.splice(b.i, 1);
      } else if (b.op === 'type') {
        if (!s || s.token === room.host) throw new Error('Cannot change that seat.');
        if (s.type === 'human') { delete s.token; delete s.name; }
        s.type = b.value === 'ai' ? 'ai' : 'open';
      }
    }
    broadcast(room); return { ok: true };
  },
  async start(b, room) {
    if (room.host !== b.token) throw new Error('Only the host can start.');
    if (room.game) throw new Error('Already started.');
    if (room.seats.some(s => s.type === 'open')) throw new Error('Fill or remove the open seats first (or make them AI).');
    room.game = E.newGame(room.seats.map(s => ({ faction: s.faction, name: s.type === 'ai' ? AI_NAMES[s.faction] : s.name, ai: s.type === 'ai' })));
    broadcast(room); return { ok: true };
  },
  async rematch(b, room) {
    if (room.host !== b.token) throw new Error('Only the host can do that.');
    room.game = null; broadcast(room); return { ok: true };
  },
  async action(b, room) {
    const seat = room.seats.find(s => s.token === b.token);
    if (!seat || !room.game) throw new Error('Not in this game.');
    E.apply(room.game, seat.faction, b.action || {});
    broadcast(room); return { ok: true };
  },
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/events') {
    const room = rooms.get(url.searchParams.get('room'));
    if (!room) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const client = { res, token: url.searchParams.get('token') };
    room.clients.push(client);
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => { clearInterval(ping); room.clients = room.clients.filter(c => c !== client); broadcast(room); });
    return broadcast(room);
  }
  if (url.pathname.startsWith('/api/') && req.method === 'POST') {
    const name = url.pathname.slice(5);
    if (!routes[name]) return json(res, 404, { error: 'Unknown endpoint' });
    try {
      const b = await body(req);
      let room = null;
      if (!['create', 'join'].includes(name)) { room = rooms.get(b.room); if (!room) throw new Error('Room not found.'); }
      json(res, 200, await routes[name](b, room));
    } catch (e) { json(res, 400, { error: e.message }); }
    return;
  }
  let p = path.normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(PUB, p);
  if (!file.startsWith(PUB)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Thornwood running at http://localhost:${PORT}`));

// clean up rooms idle for 6 hours
setInterval(() => { for (const [k, r] of rooms) if (!r.clients.length && Date.now() - r.touched > 6 * 3600e3) rooms.delete(k); }, 600e3);
