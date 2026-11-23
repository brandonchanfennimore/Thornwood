// One store for the whole game: the engine state, who you are, what's selected on the map, the move feed,
// and, when playing online, the Firestore room the state lives in.
import { create } from 'zustand';
import { AI, E, type Action, type Battle, type Faction, type Level, type State } from './engine';
import { AI_NAMES, describe } from './text';
import { connect, createRoom, joinRoom, saveRoom, watchRoom, type Room, type Seat } from '../net/rooms';

export interface FeedItem { id: number; f: Faction | null; text: string }
type Last = Room['last'];
const NOTABLE = /gain \d+ renown|breed|gather|take wing|collect \d+|toll|ambush|win|run out|prowl|forage|spawn|surface/i;
let nextId = 1;
let unsub: (() => void) | null = null;

const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };
const newGid = () => Math.random().toString(36).slice(2, 10);
const toPlayers = (seats: Seat[]) => seats.map(s => ({ faction: s.faction, name: s.type === 'ai' ? AI_NAMES[s.faction] : s.name || 'Wanderer', ai: s.type === 'ai' }));

interface GameStore {
  mode: 'solo' | 'online' | null;
  game: State | null; me: Faction | null; level: Level;
  room: Room | null; uid: string | null; name: string; netError: string; busy: boolean;
  selected: number | null; moveCount: number;
  feed: FeedItem[]; banner: FeedItem | null; battle: Battle | null;
  start(f: Faction, players: number, level: Level): void;
  quit(): void;
  act(a: Action): void;
  aiStep(): void;
  select(r: number | null): void;
  setMoveCount(n: number): void;
  setName(n: string): void;
  create(): Promise<void>;
  join(code: string): Promise<void>;
  editRoom(fn: (r: Room) => void): void;
  startOnline(): void;
}

export const useGame = create<GameStore>((set, get) => {
  // Turn a state change into the banner line, feed entries and battle overlay. Runs for solo moves and for every room update.
  function ingest(prev: State | null, next: State, last: Last) {
    if (!prev || next.seq === prev.seq) return set({ game: next });
    const n = (next.logN || 0) - (prev.logN || 0);
    const lines = n > 0 ? next.log.slice(-Math.min(n, next.log.length)) : [];
    const head: FeedItem | null = last && last.seq === next.seq ? { id: nextId++, f: last.f, text: describe(prev, last.f, last.a) } : null;
    const extra = lines.filter(l => NOTABLE.test(l)).map(l => ({ id: nextId++, f: E.FACTION_KEYS.find(k => l.startsWith(E.FACTIONS[k].short)) || null, text: l }));
    const battle = last?.a.type === 'fight' && next.lastBattle?.seq === next.seq ? next.lastBattle : null;
    set({ game: next, banner: head || get().banner, feed: [...extra.reverse(), ...(head ? [head] : []), ...get().feed].slice(0, 30), battle });
  }
  // Apply one action for faction f. Solo: show it now. Online: write it, and the room snapshot shows it to everyone.
  function step(f: Faction, a: Action): boolean {
    const { game: prev, mode, room } = get(); if (!prev) return false;
    const next = structuredClone(prev);
    try { E.apply(next, f, a); } catch (e) { console.error(e); return false; }
    const { label: _l, max: _m, ...clean } = a;
    const last = { seq: next.seq, f, a: clean };
    if (mode === 'online' && room) {
      if (get().busy) return false;
      set({ busy: true });
      saveRoom({ ...room, state: next, last }).catch(e => set({ netError: e.message })).finally(() => set({ busy: false }));
    } else ingest(prev, next, last);
    return true;
  }
  function onRoom(r: Room | null) {
    if (!r) return set({ netError: 'That game no longer exists.' });
    const { uid, room: old, game } = get();
    const seat = r.seats.find(s => s.uid === uid && s.type === 'human');
    const fresh = !old || r.gid !== old.gid || !r.state;
    set({ room: r, me: seat?.faction || null, level: r.level || 'medium', netError: '' });
    if (!r.state || r.status !== 'playing') return set({ game: null, feed: [], banner: null, battle: null, selected: null });
    if (fresh || !game) set({ game: r.state, feed: [], banner: null, battle: null, selected: null });
    else ingest(game, r.state, r.last);
  }
  async function open(code: string) {
    unsub?.();
    const { uid } = await connect();
    set({ mode: 'online', uid, room: null, game: null });
    try { history.replaceState(null, '', '#' + code); } catch { /* sandboxed */ }
    unsub = await watchRoom(code, onRoom, e => set({ netError: e.message }));
  }
  return {
    mode: null, game: null, me: null, level: 'medium', room: null, uid: null, name: ls.get('tw-name') || '', netError: '', busy: false,
    selected: null, moveCount: 1, feed: [], banner: null, battle: null,
    start(f, players, level) {
      const others = E.FACTION_KEYS.filter(x => x !== f).sort(() => Math.random() - 0.5).slice(0, players - 1);
      const seats = [f, ...others].sort((a, b) => E.FACTION_KEYS.indexOf(a) - E.FACTION_KEYS.indexOf(b))
        .map(x => ({ faction: x, name: x === f ? 'You' : AI_NAMES[x], ai: x !== f }));
      set({ mode: 'solo', game: E.newGame(seats), me: f, level, selected: null, feed: [], banner: null, battle: null });
    },
    quit() {
      unsub?.(); unsub = null;
      try { history.replaceState(null, '', location.pathname); } catch { /* sandboxed */ }
      set({ mode: null, room: null, game: null, me: null, selected: null, feed: [], banner: null, battle: null, netError: '' });
    },
    act(a) {
      const { me, moveCount } = get(); if (!me) return;
      if (step(me, a.type === 'move' ? { ...a, count: Math.min(moveCount, a.max || 1) } : a)) set({ selected: null });
    },
    aiStep() {
      const { game, level } = get(); if (!game || game.phase === 'over') return;
      const f = game.players[game.current].faction;
      const a = AI.chooseAction(game, f, level);
      if (!a || !step(f, a)) step(f, { type: 'end' });
    },
    select(r) {
      const { game, me } = get();
      const max = r !== null && game && me ? E.critters(game, r, me) : 1;
      set({ selected: r, moveCount: Math.max(1, max) });
    },
    setMoveCount(n) { set({ moveCount: n }); },
    setName(n) { set({ name: n }); ls.set('tw-name', n); },
    async create() {
      set({ netError: '', busy: true });
      try { await open(await createRoom(get().name.trim() || 'Wanderer')); } catch (e) { set({ netError: (e as Error).message }); } finally { set({ busy: false }); }
    },
    async join(code) {
      code = code.trim().toUpperCase();
      if (!/^[A-Z]{4}$/.test(code)) return set({ netError: 'Room codes are 4 letters.' });
      set({ netError: '', busy: true });
      try { await joinRoom(code, get().name.trim() || 'Wanderer', E.FACTION_KEYS); await open(code); } catch (e) { set({ netError: (e as Error).message }); } finally { set({ busy: false }); }
    },
    editRoom(fn) {
      const r = get().room; if (!r) return;
      const copy = structuredClone(r); fn(copy);
      saveRoom(copy).catch(e => set({ netError: e.message }));
    },
    startOnline() {
      const r = get().room; if (!r) return;
      if (r.seats.some(s => s.type === 'open')) return set({ netError: 'Some seats are still open. Wait for friends, switch them to AI, or remove them.' });
      get().editRoom(g => Object.assign(g, { status: 'playing', gid: newGid(), state: E.newGame(toPlayers(g.seats)), last: null }));
    },
  };
});

// Derived helpers used by several components.
export const isMyTurn = (g: State | null, me: Faction | null) => !!g && !!me && g.phase !== 'over' && g.players[g.current].faction === me;
export const myActions = (g: State | null, me: Faction | null) => (isMyTurn(g, me) ? E.listActions(g!, me!) : []);
export const isHost = (s: { room: Room | null; uid: string | null }) => !!s.room && s.room.hostId === s.uid;
