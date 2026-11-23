// Action popup anchored beside the selected clearing. It follows the clearing while the map pans or zooms.
import { autoUpdate, flip, offset, shift, useFloating, FloatingPortal } from '@floating-ui/react';
import { motion } from 'motion/react';
import { E, R, type Action } from '../game/engine';
import { myActions, useGame } from '../game/store';
import { BUILD_NAME, short } from '../game/text';
import { Emblem } from './Emblem';

export function ClearingPopup({ r, anchor }: { r: number; anchor: Element | null }) {
  const game = useGame(s => s.game)!, me = useGame(s => s.me), act = useGame(s => s.act), select = useGame(s => s.select);
  const moveCount = useGame(s => s.moveCount), setMoveCount = useGame(s => s.setMoveCount);
  const { refs, floatingStyles } = useFloating({
    elements: { reference: anchor }, placement: 'right', middleware: [offset(14), flip({ fallbackPlacements: ['left', 'bottom', 'top'] }), shift({ padding: 12 })],
    whileElementsMounted: (ref, fl, upd) => autoUpdate(ref, fl, upd, { animationFrame: true }),
  });

  const c = R[r], rl = E.ruler(game, r);
  const here = game.players.filter(p => E.pieces(game, r, p.faction) > 0);
  const acts = myActions(game, me);
  const moves = acts.filter(a => a.type === 'move' && a.from === r);
  const local = acts.filter(a => a.region === r && a.type !== 'card');
  const max = moves[0]?.max || 0;

  const label = (a: Action): [string, string] => {
    switch (a.type) {
      case 'fight': {
        const mine = E.critters(game, r, me!), theirs = E.critters(game, r, a.target!);
        const dice = (f: string, n: number) => (f === 'owl' ? Math.min(4, n * 2) : Math.min(3, n));
        const td = theirs ? dice(a.target!, theirs) + (E.buildingsOf(game, r, a.target!) ? 1 : 0) : 0;
        return [`Attack the ${short(a.target!)}`, theirs ? `You roll ${dice(me!, mine)} dice, they roll ${td}` : 'No defenders: +1 hit for you'];
      }
      case 'build': return [BUILD_NAME[me!] || 'Build', a.label!.replace(/^.*\(/, '').replace(/\)$/, '')];
      case 'burst': return ['Burrow burst', `+3 rabbits · pay a ${c.terrain} card`];
      case 'hire': return ['Hire 2 otters', '2 coins'];
      case 'raid': return [`Raid the ${short(a.target!)}`, 'Steal a random card, +1 renown'];
      case 'raise': return ['Raise 2 hedgehogs', '1 action'];
      default: return [a.label || a.type, ''];
    }
  };

  return (
    <FloatingPortal>
      <div ref={refs.setFloating} style={{ ...floatingStyles, zIndex: 40 }} onPointerDown={e => e.stopPropagation()}>
      <motion.div className="popup" initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.15 }}>
        <div className="popup-head">
          <svg width="22" height="22"><use href={`#t-${c.terrain}`} width="100%" height="100%" /></svg>
          <b>{c.name}</b>
          <button className="x" aria-label="Close" onClick={() => select(null)}>×</button>
        </div>
        <div className="popup-sub">{c.terrain}{E.RIVERSIDE[r] ? ' · on the river' : ''} · {rl ? `ruled by ${short(rl)}` : 'nobody rules'}</div>
        {here.length > 0 && (
          <div className="popup-here">
            {here.map(p => (
              <span key={p.faction}><Emblem f={p.faction} size={20} />{E.critters(game, r, p.faction)}{E.buildingsOf(game, r, p.faction) ? ' + 🏠' : ''}</span>
            ))}
          </div>
        )}
        {moves.length > 0 && (
          <div className="popup-move">
            <span>Move</span>
            <div className="stepper">
              <button onClick={() => setMoveCount(Math.max(1, moveCount - 1))} aria-label="Fewer">−</button>
              <output>{Math.min(moveCount, max)}</output>
              <button onClick={() => setMoveCount(Math.min(max, moveCount + 1))} aria-label="More">+</button>
              <small>of {max}</small>
            </div>
            <small className="muted">then tap a glowing clearing</small>
          </div>
        )}
        {local.map((a, i) => {
          const [t, sub] = label(a);
          return <button key={i} className="act" onClick={() => act(a)}><b>{t}</b>{sub && <small>{sub}</small>}</button>;
        })}
        {!moves.length && !local.length && <p className="muted small">{acts.length ? 'Nothing you can do here right now.' : 'Not your turn.'}</p>}
      </motion.div>
      </div>
    </FloatingPortal>
  );
}
