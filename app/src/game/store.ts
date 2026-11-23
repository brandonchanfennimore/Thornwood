// One store for the whole game: the engine state, who you are, what's selected on the map, and the move feed.
import { create } from 'zustand';
import { AI, E, type Action, type Battle, type Faction, type Level, type State } from './engine';
import { AI_NAMES, describe } from './text';

export interface FeedItem { id: number; f: Faction | null; text: string }
const NOTABLE = /gain \d+ renown|breed|gather|take wing|collect \d+|toll|ambush|win|run out|prowl|forage|spawn|surface/i;
let nextId = 1;

interface GameStore {
  game: State | null; me: Faction | null; level: Level;
  selected: number | null; moveCount: number;
  feed: FeedItem[]; banner: FeedItem | null; battle: Battle | null;
  start(f: Faction, players: number, level: Level): void;
  quit(): void;
  act(a: Action): void;
  aiStep(): void;
  select(r: number | null): void;
  setMoveCount(n: number): void;
}

export const useGame = create<GameStore>((set, get) => {
  // Apply one action for faction f, then record what happened for the banner, feed and battle overlay.
  function step(f: Faction, a: Action) {
    const prev = get().game!; const next = structuredClone(prev);
    try { E.apply(next, f, a); } catch (e) { console.error(e); return false; }
    const n = (next.logN || 0) - (prev.logN || 0);
    const lines = n > 0 ? next.log.slice(-Math.min(n, next.log.length)) : [];
    const head: FeedItem = { id: nextId++, f, text: describe(prev, f, a) };
    const extra = lines.filter(l => NOTABLE.test(l)).map(l => ({ id: nextId++, f: E.FACTION_KEYS.find(k => l.startsWith(E.FACTIONS[k].short)) || null, text: l }));
    const battle = a.type === 'fight' && next.lastBattle && next.lastBattle.seq === next.seq ? next.lastBattle : null;
    set({ game: next, banner: head, feed: [...extra.reverse(), head, ...get().feed].slice(0, 30), battle });
    return true;
  }
  return {
    game: null, me: null, level: 'medium', selected: null, moveCount: 1, feed: [], banner: null, battle: null,
    start(f, players, level) {
      const others = E.FACTION_KEYS.filter(x => x !== f).sort(() => Math.random() - 0.5).slice(0, players - 1);
      const seats = [f, ...others].sort((a, b) => E.FACTION_KEYS.indexOf(a) - E.FACTION_KEYS.indexOf(b))
        .map(x => ({ faction: x, name: x === f ? 'You' : AI_NAMES[x], ai: x !== f }));
      set({ game: E.newGame(seats), me: f, level, selected: null, feed: [], banner: null, battle: null });
    },
    quit() { set({ game: null, me: null, selected: null, feed: [], banner: null, battle: null }); },
    act(a) {
      const { game, me, moveCount } = get(); if (!game || !me) return;
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
  };
});

// Derived helpers used by several components.
export const isMyTurn = (g: State | null, me: Faction | null) => !!g && !!me && g.phase !== 'over' && g.players[g.current].faction === me;
export const myActions = (g: State | null, me: Faction | null) => (isMyTurn(g, me) ? E.listActions(g!, me!) : []);
