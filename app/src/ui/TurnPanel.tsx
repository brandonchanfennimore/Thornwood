// Bottom-right: whose turn it is, what you have left, faction-wide actions, and End turn.
import { E } from '../game/engine';
import { isHost, isMyTurn, myActions, useGame } from '../game/store';
import { Emblem } from './Emblem';
import { ACTION_TOKEN, ResIcon, Tokens } from './Res';

const HINT: Record<string, string> = {
  owl: 'Owls fly up to 2 clearings.', frog: 'Frogs leap up to 2 clearings into wet ground.',
  mole: 'Moles travel between any two tunnels.', fox: 'Foxes ignore rule when they move.',
};

export function TurnPanel() {
  const game = useGame(s => s.game)!, me = useGame(s => s.me), act = useGame(s => s.act), quit = useGame(s => s.quit), start = useGame(s => s.start), level = useGame(s => s.level);
  const mode = useGame(s => s.mode), host = useGame(isHost), editRoom = useGame(s => s.editRoom);
  const cur = game.players[game.current], mine = isMyTurn(game, me), acts = myActions(game, me), p = game.players.find(x => x.faction === me);
  if (game.phase === 'over') {
    const w = game.players.find(x => x.faction === game.winner)!;
    return (
      <div className="turn">
        <div className="turn-who"><Emblem f={w.faction} size={44} /><div><b>{w.faction === me ? 'You win!' : `${w.name} wins`}</b><small>{E.FACTIONS[w.faction].name} · {w.renown} renown</small></div></div>
        {mode === 'online'
          ? host ? <button className="primary big" onClick={() => editRoom(g => Object.assign(g, { status: 'lobby', state: null, last: null }))}>Back to lobby</button> : null
          : <button className="primary big" onClick={() => start(me!, game.players.length, level)}>Play again</button>}
        <button className="ghost" onClick={quit}>{mode === 'online' ? 'Leave game' : 'Back to menu'}</button>
      </div>
    );
  }
  if (!mine || !me || !p) return (
    <div className="turn">
      <div className="turn-who"><Emblem f={cur.faction} size={44} /><div><b>{cur.name}</b><small>{E.FACTIONS[cur.faction].name} · taking their turn…</small></div></div>
      {!me && <small className="muted">You are watching this game.</small>}
    </div>
  );
  const whole = acts.filter(a => a.type === 'muster' || a.type === 'hatch');
  const end = acts.find(a => a.type === 'end');
  return (
    <div className="turn mine">
      <div className="turn-who"><Emblem f={me} size={44} /><div><b>Your turn</b><small>{game.phase === 'discard' ? 'Discard down to the hand limit' : me === 'otter' ? `${p.coins} coin${p.coins === 1 ? '' : 's'}` : `${game.actionsLeft} action${game.actionsLeft === 1 ? '' : 's'} left${me === 'badger' ? ` · ${p.stone} stone` : ''}`}</small></div></div>
      {game.phase === 'main' && <div className="purse">
        {me !== 'otter' && <Tokens id={ACTION_TOKEN[me]!} n={game.actionsLeft} label="action" />}
        {me === 'badger' && <Tokens id="stone" n={p.stone} size={22} cap={6} label="stone" />}
        {me === 'otter' && (p.coins ? <Tokens id="coin" n={p.coins} size={24} cap={6} label="coin" /> : <span className="muted small">No coins</span>)}
      </div>}
      {me === 'otter' && game.phase === 'main' && <div className="price">{([['Move', 1], ['Attack', 2], ['Hire', 2], ['Post', 3]] as const).map(([k, c]) => <span key={k}>{k} <b>{c}</b><ResIcon id="coin" size={14} /></span>)}</div>}
      {game.phase === 'main' && <p className="small muted">Tap a clearing with a gold ring to act there. {HINT[me] || ''}</p>}
      {whole.map((a, i) => <button key={i} className="act" onClick={() => act(a)}><b>{a.type === 'muster' ? 'Muster' : 'Hatch'}</b><small>{a.type === 'muster' ? '+1 badger at every sett' : '+1 owl at every nest'}</small></button>)}
      {end && <button className="primary big" onClick={() => act(end)}>End turn{me !== 'otter' && game.actionsLeft > 0 ? ` (${game.actionsLeft} unused)` : ''}</button>}
    </div>
  );
}
