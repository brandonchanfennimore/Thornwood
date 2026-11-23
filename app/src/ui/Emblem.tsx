import type { Faction } from '../game/engine';
import { useGame } from '../game/store';
// Piece art: storybook critters (a-*) for Artistic and 3D, wooden discs (m-*) for Simple.
export const usePieceSet = () => useGame(s => (s.look === 'simple' ? 'm' : 'a'));
// Stand-in emblem for a faction picked at random when the game starts.
export const RandomEmblem = ({ size = 40 }: { size?: number }) => <span className="rand-emb" style={{ width: size, height: size, fontSize: size * 0.55 }} aria-hidden="true">?</span>;
export function Emblem({ f, size = 40 }: { f: Faction; size?: number }) {
  const set = usePieceSet();
  return <svg width={size} height={size} aria-hidden="true" className="emblem"><use href={`#${set}-${f}`} width="100%" height="100%" /></svg>;
}
