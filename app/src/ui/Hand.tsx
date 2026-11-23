// Your cards, held in a fan along the bottom edge. Tap a card to raise it and see what you can do with it.
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { E, R, type Action, type Card } from '../game/engine';
import { isMyTurn, myActions, useGame } from '../game/store';
import { CARD_TEXT } from '../game/text';

const BG: Record<Card['terrain'], string> = { meadow: 'linear-gradient(160deg,#f3df8e,#d9b94e)', marsh: 'linear-gradient(160deg,#b4e0d0,#6fae9c)', grove: 'linear-gradient(160deg,#c3e0a0,#77a957)', moon: 'linear-gradient(160deg,#b9b4ec,#6c66b8)' };
const btnText = (a: Action) => a.type === 'discard' ? 'Discard' : a.type === 'quarry' ? 'Quarry: +1 stone' : a.type === 'trade' ? 'Sell: +1 coin' : a.region !== undefined ? `Play in ${R[a.region].name}` : 'Play';

export function Hand() {
  const game = useGame(s => s.game)!, me = useGame(s => s.me), act = useGame(s => s.act);
  const [up, setUp] = useState<number | null>(null);
  const hand = game.players.find(p => p.faction === me)?.hand || [];
  const acts = myActions(game, me), mine = isMyTurn(game, me);
  const n = hand.length, spread = Math.min(5, 24 / Math.max(1, n));
  return (
    <div className="hand" onPointerLeave={() => setUp(null)}>
      {game.phase === 'discard' && mine && <div className="hand-note">Too many cards: discard down to {E.handLimit(me!)}.</div>}
      <AnimatePresence>
        {hand.map((c, i) => {
          const ca = acts.filter(a => a.card === c.id), lifted = up === c.id, mid = (n - 1) / 2;
          return (
            <motion.div key={c.id} className={`card${mine && !ca.length ? ' dim' : ''}${lifted ? ' up' : ''}`} tabIndex={0}
              initial={{ y: 200, opacity: 0 }} exit={{ y: 200, opacity: 0 }}
              animate={{ rotate: lifted ? 0 : (i - mid) * spread, y: lifted ? -110 : Math.abs(i - mid) * 6, x: lifted ? 0 : (i - mid) * 96, opacity: 1, zIndex: lifted ? 50 : i }}
              whileHover={lifted ? undefined : { y: -36 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              onClick={() => setUp(lifted ? null : c.id)} onKeyDown={e => { if (e.key === 'Enter') setUp(lifted ? null : c.id); }}>
              <div className="card-art" style={{ background: BG[c.terrain] }}>
                <svg className="gem"><use href={`#t-${c.terrain}`} width="100%" height="100%" /></svg>
                <svg className="cart"><use href={`#c-${c.type}`} width="100%" height="100%" /></svg>
              </div>
              <div className="card-name">{E.CARD_TYPES[c.type].name}</div>
              <div className="card-text"><b>{c.terrain === 'moon' ? 'Wild' : c.terrain[0].toUpperCase() + c.terrain.slice(1)}</b> · {CARD_TEXT[c.type]}</div>
              {lifted && ca.length > 0 && (
                <div className="card-btns">
                  {ca.map((a, k) => <button key={k} className={a.type === 'card' || a.type === 'discard' ? 'primary' : ''} onClick={e => { e.stopPropagation(); setUp(null); act(a); }}>{btnText(a)}</button>)}
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
