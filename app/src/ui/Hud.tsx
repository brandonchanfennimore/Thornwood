// Player stats floating along the top of the map.
import { E, MAP, type Player, type State } from '../game/engine';
import { useGame } from '../game/store';
import { Emblem } from './Emblem';
import { ResIcon } from './Res';

function resources(st: State, p: Player): React.ReactNode[] {
  const B = (n: string) => <><svg width={13} height={13} aria-hidden="true"><use href={`#b-${p.faction}`} width="100%" height="100%" /></svg>{n}</>;
  const f = p.faction, nb = E.buildingsOnMap(st, f), mx = E.FACTIONS[f].maxB;
  switch (f) {
    case 'badger': return [<><ResIcon id="stone" size={14} />{p.stone}</>, B(`${nb}/${mx}`)];
    case 'otter': return [<><ResIcon id="coin" size={14} />{p.coins}</>, B(`${nb}/${mx}`)];
    case 'rabbit': case 'fox': return [`rules ${E.ruledCount(st, f)}`];
    case 'frog': return [B(`${nb}/${mx}`), `chain ${E.chorus(st, f)}`];
    case 'owl': return [B(`${nb}/${mx}`)];
    case 'hedgehog': return [B(`${nb}/${mx}`)];
    case 'mole': return [B(`${nb}/${mx}`)];
  }
}

export function Hud() {
  const game = useGame(s => s.game)!, quit = useGame(s => s.quit), setGuide = useGame(s => s.setGuide);
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
                  {resources(game, p).map((r, k) => <span key={k}>{r}</span>)}
                  <span>{p.hand.length} cards</span>
                </div>
              </div>
              <div className="chip-vp">{p.renown}<small>/{E.WIN}</small></div>
              <i className="chip-bar" style={{ width: `${Math.min(100, (p.renown / E.WIN) * 100)}%` }} />
            </div>
          );
        })}
      </div>
      <div className="hud-r">
        <div className="season" title={`${MAP.name}: ${MAP.ruleText}`}>Round {game.round}<small>{E.season(game)} season</small><small className="map-name">{MAP.name}</small></div>
        <button className="help" aria-label="How to play" title="How to play" onClick={() => setGuide(true)}>?</button>
      </div>
    </div>
  );
}
