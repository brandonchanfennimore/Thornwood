import type { Faction } from '../game/engine';
export const Emblem = ({ f, size = 40 }: { f: Faction; size?: number }) => (
  <svg width={size} height={size} aria-hidden="true" className="emblem"><use href={`#a-${f}`} width="100%" height="100%" /></svg>
);
