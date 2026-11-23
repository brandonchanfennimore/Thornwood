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
  useEffect(() => { setShown(battle); if (!battle) return; const t = setTimeout(() => setShown(null), 2400); return () => clearTimeout(t); }, [battle]);
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
