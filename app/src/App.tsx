import { useEffect } from 'react';
import sprites from './assets/sprites.svg?raw';
import { isHost, useGame } from './game/store';
import { Lobby } from './ui/Lobby';
import { Board } from './ui/Board';
import { Hand } from './ui/Hand';
import { Hud } from './ui/Hud';
import { BattleRoll, Banner, Feed, PhaseBar } from './ui/Overlays';
import { Setup } from './ui/Setup';
import { TurnPanel } from './ui/TurnPanel';
import { Guide } from './ui/Guide';

export default function App() {
  const game = useGame(s => s.game), battle = useGame(s => s.battle), aiStep = useGame(s => s.aiStep);
  // AI acts in its Day, and also while it must discard down to its hand limit (shown as Dusk).
  const day = useGame(s => s.turnPhase === 'day' || s.game?.phase === 'discard'), speed = useGame(s => s.speed), guide = useGame(s => s.guideOpen), mode = useGame(s => s.mode), host = useGame(isHost), seated = useGame(s => !!s.me), netError = useGame(s => s.netError);
  // AI players take one action at a time, with a pause so you can follow along (longer after a battle).
  // Online, the host's browser plays the AI. If the host goes quiet, any seated player takes over after 15 seconds.
  useEffect(() => {
    if (!game || game.phase === 'over' || !game.players[game.current].ai) return;
    if (guide || !day || (mode === 'online' && !host && !seated)) return;
    const flying = !!useGame.getState().flight, k = mode === 'solo' ? { slow: 1.7, normal: 1, fast: 0.5 }[speed] : 1;
    const t = setTimeout(aiStep, mode === 'online' && !host ? 15000 : (battle ? 2400 : flying ? 1300 : 750) * k);
    return () => clearTimeout(t);
  }, [game, battle, aiStep, mode, host, seated, guide, day, speed]);
  return (
    <>
      <div dangerouslySetInnerHTML={{ __html: sprites }} />
      <Board />
      {game ? <><Hud /><PhaseBar /><Banner /><Feed /><TurnPanel /><Hand /><BattleRoll /></> : mode === 'online' ? <Lobby /> : <Setup />}
      {game && netError && <div className="net-err" role="alert">{netError}</div>}
      <Guide />
    </>
  );
}
