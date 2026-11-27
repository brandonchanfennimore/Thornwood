// Title logo for the Artistic and 3D looks; Simple keeps the plain text title.
import logo from '../assets/ink/logo.webp';
import { useGame } from '../game/store';

export function Logo() {
  const simple = useGame(s => s.look === 'simple');
  return simple ? <>Thornwood</> : <img className="logo" src={logo} alt="Thornwood" />;
}
