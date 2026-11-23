// What each faction does in each phase of its turn, shown in the guide. Ported from the original interface.
import type { Faction } from './engine';

// [action key, name, cost, description]. The key matches an engine action type, or is empty for automatic steps.
export type Step = [string, string, string, string];
export interface FactionGuide { tag: string; perk: string; dawn: Step[]; dayNote: string; day: Step[]; dusk: Step[] }

const MOVE: Step = ['move', 'Move', '1 action', 'Move any number of your critters to an adjacent clearing. You must rule the clearing you leave or the one you enter.'];
const FIGHT: Step = ['fight', 'Attack', '1 action', 'Start a battle in a clearing where you have critters.'];
const CARDS: Step = ['card', 'Play cards', 'free', 'Rally, Forage, Hasten, Provision and Moonlight cards can be played at any time during your Day.'];
const DUSK_END: Step[] = [['', 'Discard', '', 'If you hold more than 5 cards, discard down to 5.']];
const DRAW1: Step = ['', 'Draw', '', 'Draw 1 card.'];
export const PHASES: Record<Faction, FactionGuide> = {
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
