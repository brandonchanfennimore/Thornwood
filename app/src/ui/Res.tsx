// Faction resource and action-token icons (drawn in assets/sprites.svg as r-*).
import type { Faction } from '../game/engine';

// Each faction's actions are shown as its own token: a badger pickaxe, a rabbit carrot, an owl feather and so on.
export const ACTION_TOKEN: Partial<Record<Faction, string>> = { badger: 'pick', rabbit: 'carrot', owl: 'feather', fox: 'paw', hedgehog: 'acorn', frog: 'lily', mole: 'shovel' };
export const RES_NAME: Record<string, string> = { stone: 'stone', coin: 'coin', pick: 'action', carrot: 'action', feather: 'action', paw: 'action', acorn: 'action', lily: 'action', shovel: 'action' };

export const ResIcon = ({ id, size = 18 }: { id: string; size?: number }) => (
  <svg width={size} height={size} aria-hidden="true" className="res-ic"><use href={`#r-${id}`} width="100%" height="100%" /></svg>
);

// A row of tokens, e.g. three carrots for three actions left. Past `cap`, it shows one token and a count.
export function Tokens({ id, n, size = 26, cap = 8, label }: { id: string; n: number; size?: number; cap?: number; label: string }) {
  if (n <= 0) return null;
  return (
    <div className="tokens" role="img" aria-label={`${n} ${label}${n === 1 ? '' : 's'}`}>
      {n > cap ? <><ResIcon id={id} size={size} /><b>×{n}</b></> : Array.from({ length: n }, (_, i) => <ResIcon key={i} id={id} size={size} />)}
    </div>
  );
}
