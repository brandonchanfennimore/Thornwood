import type { Faction } from '../game/engine';
// Stand-in emblem for a faction picked at random when the game starts.
export const RandomEmblem = ({ size = 40 }: { size?: number }) => <span className="rand-emb" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden="true">?</span>;
export const Emblem = ({ f, size = 40 }: { f: Faction; size?: number }) => (
  <svg width={size} height={size} aria-hidden="true" className="emblem"><use href={`#a-${f}`} width="100%" height="100%" /></svg>
);
