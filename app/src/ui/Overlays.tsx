// Transient overlays: the action banner, the recent-moves feed, and the dice roll for a battle.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { R } from '../game/engine';
import { useGame } from '../game/store';
import { short } from '../game/text';
import { Emblem } from './Emblem';

export function Banner() {
  const banner = useGame(s => s.banner);
  return (
    <div className="banner-slot">
      <AnimatePresence mode="popLayout">
        {banner && (
          <motion.div key={banner.id} className="banner" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 10, opacity: 0 }}>
            {banner.f && <Emblem f={banner.f} size={26} />}<span>{banner.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Dawn › Day › Dusk for whoever's turn it is, just under the scores.
const PH = [['dawn', 'Dawn'], ['day', 'Day'], ['dusk', 'Dusk']] as const;
export function PhaseBar() {
  const ph = useGame(s => s.turnPhase), pf = useGame(s => s.phaseF), game = useGame(s => s.game), me = useGame(s => s.me);
  if (!game || game.phase === 'over') return null;
  const f = pf || game.players[game.current].faction, p = game.players.find(x => x.faction === f)!, i = PH.findIndex(x => x[0] === ph);
  return (
    <div className="phasebar" role="status" aria-live="polite">
      <Emblem f={f} size={26} /><span className="pb-who">{f === me ? 'Your turn' : `${p.name}'s turn`}</span>
      {PH.map(([k, label], j) => (
        <span key={k} className={`pb-step${j === i ? ' now' : j < i ? ' done' : ''} pb-${k}`}>
          {j > 0 && <span className="pb-arrow">›</span>}
          <svg width="20" height="20" aria-hidden="true"><use href={`#p-${k}`} width="100%" height="100%" /></svg>{label}
        </span>
      ))}
    </div>
  );
}

export function Speed() {
  const speed = useGame(s => s.speed), setSpeed = useGame(s => s.setSpeed), solo = useGame(s => s.mode === 'solo');
  if (!solo) return null;
  return (
    <div className="seg speed" role="radiogroup" aria-label="Playback speed">
      {(['slow', 'normal', 'fast'] as const).map(x => <button key={x} role="radio" aria-checked={speed === x} className={speed === x ? 'on' : ''} onClick={() => setSpeed(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}
    </div>
  );
}

export function Feed() {
  const feed = useGame(s => s.feed);
  const [open, setOpen] = useState(true);
  return (
    <div className="feed">
      <button className="feed-t" onClick={() => setOpen(!open)}>What just happened {open ? '▾' : '▸'}</button>
      {open && <div className="feed-list">
        {feed.length ? feed.slice(0, 6).map(x => <div key={x.id}>{x.f ? <Emblem f={x.f} size={18} /> : <span style={{ width: 18 }} />}<span>{x.text}</span></div>) : <span className="muted">Moves will appear here.</span>}
      </div>}
    </div>
  );
}

export function BattleRoll() {
  const battle = useGame(s => s.battle);
  const [shown, setShown] = useState(battle);
  const k = useGame(s => (s.mode === 'solo' ? { slow: 1.7, normal: 1, fast: 0.5 }[s.speed] : 1));
  useEffect(() => { setShown(battle); if (!battle) return; const t = setTimeout(() => setShown(null), 2400 * k); return () => clearTimeout(t); }, [battle, k]);
  const b = shown;
  return (
    <AnimatePresence>
      {b && (
        <motion.div className="battle" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={() => setShown(null)}>
          <h3>Battle in {R[b.region].name}</h3>
          {b.notes.filter(n => /Ambush|Spines/.test(n)).map(n => <div key={n} className="bnote">{n}</div>)}
          {([['attack', b.att, b.attRolls, 4], ['defend', b.def, b.defRolls, b.def === 'badger' ? 3 : 4]] as const).map(([k, f, rolls, need]) => (
            <div key={k} className="bside">
              <Emblem f={f} size={40} />
              <div><small>{short(f)} {k}</small>
                <div className="dice">{rolls.length ? rolls.map((x, i) => <motion.span key={i} className={`die${x >= need ? ' hit' : ''}`} initial={{ rotate: -180, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ delay: i * 0.08 }}>{x}</motion.span>) : <span className="muted small">no dice</span>}</div>
              </div>
            </div>
          ))}
          {b.attHits !== undefined ? <div className="bres">{short(b.att)} deal {b.attHits} · {short(b.def)} deal {b.defHits}</div> : <div className="bres">The ambush breaks the attack.</div>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
