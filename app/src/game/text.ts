import { E, R, type Action, type Card, type Faction, type State } from './engine';

export const AI_NAMES: Record<Faction, string> = { badger: 'Old Brock', rabbit: 'Clover', owl: 'Hootsworth', otter: 'Captain Slick', fox: 'Vixen Ash', hedgehog: 'Mother Bristle', frog: 'Croakwell', mole: 'Digby' };
export const BLURB: Record<Faction, string> = {
  badger: 'Dig stone, build setts, and hold firm when attacked.',
  rabbit: 'Breed fast and rule the land of the current season.',
  owl: 'Few, fierce and flying. Score by hunting.',
  otter: 'Pay coins to act, ride the river, and profit from neighbors.',
  fox: 'Slip past any border and steal cards from rivals.',
  hedgehog: 'Hoard cards and prick anyone who attacks.',
  frog: 'Leap across wet ground and link a chain of clearings.',
  mole: 'Dig tunnels under anyone and pop up across the map.',
};
export const BUILD_NAME: Partial<Record<Faction, string>> = { badger: 'Dig a sett', owl: 'Build a nest', otter: 'Open a trading post', hedgehog: 'Build a hollow', frog: 'Float a lily pad', mole: 'Dig a tunnel' };
const BUILD_VERB: Partial<Record<Faction, string>> = { badger: 'digs a sett', owl: 'builds a nest', otter: 'opens a trading post', hedgehog: 'builds a hollow', frog: 'floats a lily pad', mole: 'digs a tunnel' };
export const CARD_TEXT: Record<Card['type'], string> = {
  ambush: 'Defends by itself: 2 hits first when you are attacked in a matching clearing.',
  rally: 'Add 2 critters (owls: 1) to a matching clearing where you have a piece.',
  forage: '+2 renown if you rule 2 or more matching clearings.',
  hasten: '+1 action this turn (otters: +2 coins).',
  provision: 'Draw 2 cards.',
  moon: 'Pays any terrain cost. Play it to draw 1 and get +1 action.',
};
export const short = (f: Faction) => E.FACTIONS[f].short;

// "You" takes the plain verb: "You hop", "Clover hops".
const plain = (v: string) => v.replace(/ies$/, 'y').replace(/(ch|sh)es$/, '$1').replace(/s$/, '');
export function describe(st: State, f: Faction, a: Action): string {
  const p = st.players.find(p => p.faction === f)!, n = short(f).toLowerCase();
  const text = describe3(p.name, f, n, st, a);
  return p.name === 'You' ? text.replace(/^You (\S+)/, (_, v: string) => 'You ' + plain(v)) : text;
}
function describe3(who: string, f: Faction, n: string, st: State, a: Action): string {
  const p = st.players.find(p => p.faction === f)!;
  const card = a.card !== undefined ? p.hand.find(c => c.id === a.card) : undefined;
  switch (a.type) {
    case 'move': { const c = a.count || 1; return `${who} ${{ owl: 'flies', frog: 'hops' }[f as string] || 'moves'} ${c} ${c === 1 ? (f === 'fox' ? 'fox' : n.replace(/s$/, '')) : n} from ${R[a.from!].name} to ${R[a.to!].name}`; }
    case 'fight': return `${who} attacks the ${short(a.target!)} in ${R[a.region!].name}`;
    case 'muster': return `${who} musters a badger at every sett`;
    case 'hatch': return `${who} hatches an owl at every nest`;
    case 'build': return `${who} ${BUILD_VERB[f]} in ${R[a.region!].name}`;
    case 'burst': return `${who} bursts 3 rabbits out in ${R[a.region!].name}`;
    case 'hire': return `${who} hires 2 otters at ${R[a.region!].name}`;
    case 'raid': return `${who} raids the ${short(a.target!)} in ${R[a.region!].name}`;
    case 'raise': return `${who} raises 2 hedgehogs at ${R[a.region!].name}`;
    case 'card': return `${who} plays ${card ? E.cardName(card) : 'a card'}${a.region !== undefined ? ' in ' + R[a.region].name : ''}`;
    case 'quarry': return `${who} turns a card into stone`;
    case 'trade': return `${who} sells a card for a coin`;
    case 'discard': return `${who} discards a card`;
    case 'end': return `${who} ends the turn`;
  }
}
