// Start screen, floating over the empty map.
import { useState } from 'react';
import { motion } from 'motion/react';
import { E, type Faction, type Level } from '../game/engine';
import { useGame } from '../game/store';
import { BLURB } from '../game/text';
import { Emblem } from './Emblem';

export function Setup() {
  const start = useGame(s => s.start);
  const [f, setF] = useState<Faction>('badger');
  const [n, setN] = useState(4);
  const [level, setLevel] = useState<Level>('medium');
  return (
    <div className="setup-wrap">
      <motion.div className="setup" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <h1>Thornwood</h1>
        <p className="muted">Eight woodland factions, up to four per game. The first to {E.WIN} renown wins.</p>
        <div className="fac-grid" role="radiogroup" aria-label="Your faction">
          {E.FACTION_KEYS.map(k => (
            <button key={k} role="radio" aria-checked={f === k} className={`fac${f === k ? ' on' : ''}`} onClick={() => setF(k)}>
              <Emblem f={k} size={40} /><span><b>{E.FACTIONS[k].name}</b><small>{BLURB[k]}</small></span>
            </button>
          ))}
        </div>
        <div className="setup-row">
          <div><span className="lbl">Players</span><div className="seg">{[2, 3, 4].map(x => <button key={x} className={n === x ? 'on' : ''} onClick={() => setN(x)}>{x}</button>)}</div></div>
          <div><span className="lbl">AI difficulty</span><div className="seg">{(['easy', 'medium', 'hard'] as const).map(x => <button key={x} className={level === x ? 'on' : ''} onClick={() => setLevel(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}</div></div>
          <button className="primary big" onClick={() => start(f, n, level)}>Start solo game</button>
        </div>
      </motion.div>
    </div>
  );
}
