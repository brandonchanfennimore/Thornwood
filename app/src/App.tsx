import { useEffect } from 'react';
import sprites from './assets/sprites.svg?raw';
import { useGame } from './game/store';
import { Board } from './ui/Board';
import { Hand } from './ui/Hand';
import { Hud } from './ui/Hud';
import { BattleRoll, Banner, Feed } from './ui/Overlays';
import { Setup } from './ui/Setup';
import { TurnPanel } from './ui/TurnPanel';

export default function App() {
  const game = useGame(s => s.game), battle = useGame(s => s.battle), aiStep = useGame(s => s.aiStep);
  // AI players take one action at a time, with a pause so you can follow along (longer after a battle).
  useEffect(() => {
    if (!game || game.phase === 'over' || !game.players[game.current].ai) return;
    const t = setTimeout(aiStep, battle ? 2400 : 750);
    return () => clearTimeout(t);
  }, [game, battle, aiStep]);
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: sprites }} />
      <Board />
      {game ? <><Hud /><Banner /><Feed /><TurnPanel /><Hand /><BattleRoll /></> : <Setup />}
    </>
  );
}
