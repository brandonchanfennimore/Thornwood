// Typed bridge to the shared rules engine and AI in ../public. Those files register themselves on window
// (they also run in Node for the old server and the balance simulations), so importing them for their side effect is enough.
import '../../../public/engine.js';
import '../../../public/ai.js';

export type Faction = 'badger' | 'rabbit' | 'owl' | 'otter' | 'fox' | 'hedgehog' | 'frog' | 'mole';
export type Terrain = 'meadow' | 'marsh' | 'grove';
export type CardType = 'ambush' | 'rally' | 'forage' | 'hasten' | 'provision' | 'moon';
export type Level = 'easy' | 'medium' | 'hard';

export interface Card { id: number; terrain: Terrain | 'moon'; type: CardType }
export interface Player { faction: Faction; name: string; ai: boolean; renown: number; hand: Card[]; stone: number; coins: number }
export interface RegionState { c: Partial<Record<Faction, number>>; b: Faction[] }
export interface Battle {
  region: number; att: Faction; def: Faction; attRolls: number[]; defRolls: number[]; notes: string[]; seq: number;
  attHits?: number; defHits?: number; attLost?: number; defLost?: number;
}
export interface State {
  players: Player[]; regions: RegionState[]; deck: Card[]; discard: Card[];
  map?: MapKey; current: number; round: number; phase: 'main' | 'discard' | 'over'; actionsLeft: number;
  flags: Record<string, boolean>; log: string[]; logN?: number; winner: Faction | null; lastBattle: Battle | null; seq: number;
}
export interface Action {
  type: 'end' | 'discard' | 'card' | 'quarry' | 'trade' | 'move' | 'fight' | 'muster' | 'hatch' | 'build' | 'burst' | 'hire' | 'raid' | 'raise';
  label?: string; card?: number; region?: number; from?: number; to?: number; target?: Faction; max?: number; count?: number;
}
export interface RegionDef { name: string; terrain: Terrain; slots: number; x: number; y: number }
export type MapKey = 'autumn' | 'spring' | 'summer' | 'winter';
export interface MapDef {
  key: MapKey; name: string; rule: 'blossom' | 'fair' | 'dens' | null; ruleText: string;
  regions: RegionDef[]; edges: [number, number][]; river: [number, number][]; adj: number[][]; riverside: boolean[];
  riverIn: { x: number; y: number; to: number }; riverOut: { from: number; x: number; y: number };
  blossoms?: number[]; fair?: number; dens?: number[];
}
export interface FactionDef { name: string; short: string; color: string; critters: number; building: string | null; maxB: number; start: number }

interface EngineAPI {
  MAPS: Record<MapKey, MapDef>; MAP_KEYS: MapKey[]; mapOf(s: State): MapDef;
  TERRAINS: Terrain[]; REGIONS: RegionDef[]; EDGES: [number, number][]; RIVER: [number, number][]; ADJ: number[][]; RIVERSIDE: boolean[];
  FACTIONS: Record<Faction, FactionDef>; FACTION_KEYS: Faction[]; CARD_TYPES: Record<CardType, { name: string; text: string }>;
  WIN: number; MAX_ROUNDS: number; HAND_LIMIT: number;
  newGame(seats: { faction: Faction; name: string; ai: boolean }[], map?: MapKey): State;
  listActions(s: State, f: Faction): Action[];
  apply(s: State, f: Faction, a: Action): State;
  ruler(s: State, r: number): Faction | null;
  critters(s: State, r: number, f: Faction): number;
  buildingsOf(s: State, r: number, f: Faction): number;
  pieces(s: State, r: number, f: Faction): number;
  supply(s: State, f: Faction): number;
  buildingsOnMap(s: State, f: Faction): number;
  ruledCount(s: State, f: Faction, t?: Terrain): number;
  season(s: State): Terrain;
  isRiver(a: number, b: number): boolean;
  cardName(c: Card): string;
  handLimit(f: Faction): number;
  chorus(s: State, f: Faction): number;
}

const w = window as unknown as { Engine: EngineAPI; ThornAI: { chooseAction(s: State, f: Faction, level: Level): Action | null } };
export const E = w.Engine;
export const AI = w.ThornAI;
// The map on screen. Only one game shows at a time, so the store switches this whenever the game (or the map picked on
// the start screen) changes, and the UI reads MAP and R directly. ES module bindings are live, so importers see the switch.
export let MAP: MapDef = E.MAPS.autumn;
export let R: RegionDef[] = MAP.regions;
export function selectMap(key: MapKey | undefined) { const m = E.MAPS[key || 'autumn'] || E.MAPS.autumn; if (m !== MAP) { MAP = m; R = m.regions; } }
