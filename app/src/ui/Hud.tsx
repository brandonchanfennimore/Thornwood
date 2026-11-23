// Player stats floating along the top of the map.
import { E, type Player, type State } from '../game/engine';
import { useGame } from '../game/store';
import { Emblem } from './Emblem';

function resources(st: State, p: Player): string[] {
  const f = p.faction, nb = E.buildingsOnMap(st, f), mx = E.FACTIONS[f].maxB;
  switch (f) {
    case 'badger': return [`${p.stone} stone`, `${nb}/${mx} setts`];
    case 'otter': return [`${p.coins} coins`, `${nb}/${mx} posts`];
    case 'rabbit': case 'fox': return [`rules ${E.ruledCount(st, f)}`];
    case 'frog': return [`${nb}/${mx} pads`, `chain ${E.chorus(st, f)}`];
    case 'owl': return [`${nb}/${mx} nests`];
    case 'hedgehog': return [`${nb}/${mx} hollows`];
    case 'mole': return [`${nb}/${mx} tunnels`];
  }
}

export function Hud() {
  const game = useGame(s => s.game)!, me = useGame(s => s.me), quit = useGame(s => s.quit);
  return (
    <div className="hud">
      <button className="brand" onClick={() => { if (confirm('Leave this game?')) quit(); }} title="Leave game">Thornwood</button>
      <div className="chips">
        {game.players.map((p, i) => {
          const tot = E.FACTIONS[p.faction].critters, cur = i === game.current && game.phase !== 'over';
          return (
            <div key={p.faction} className={`chip${cur ? ' cur' : ''}`} style={{ '--pc': E.FACTIONS[p.faction].color } as React.CSSProperties}>
              <Emblem f={p.faction} size={38} />
              <div className="chip-main">
                <div className="chip-name">{p.name}</div>
                <div className="chip-stats">
                  <span>{tot - E.supply(game, p.faction)}/{tot} warriors</span>
                  {resources(game, p).map(r => <span key={r}>{r}</span>)}
                  <span>{p.hand.length} cards</span>
                </div>
              </div>
              <div className="chip-vp">{p.renown}<small>/{E.WIN}</small></div>
              <i className="chip-bar" style={{ width: `${Math.min(100, (p.renown / E.WIN) * 100)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="season">Round {game.round}<small>{E.season(game)} season</small></div>
    </div>
  );
}
