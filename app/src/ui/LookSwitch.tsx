// Visual style: Artistic (storybook), Simple (flat, follows dark mode) or 3D (a tabletop).
import { useGame, type Look } from '../game/store';

export function LookSwitch() {
  const look = useGame(s => s.look), setLook = useGame(s => s.setLook);
  return (
    <select className="look" aria-label="Visual style" value={look} onChange={e => setLook(e.target.value as Look)}>
      <option value="art">Artistic</option><option value="simple">Simple</option><option value="3d">3D</option>
    </select>
  );
}
