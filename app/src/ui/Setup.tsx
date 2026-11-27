// Start screen, floating over the empty map: play solo against the AI, or create or join an online room.
import { useState } from 'react';
import { motion } from 'motion/react';
import { E, type Faction, type Level } from '../game/engine';
import { useGame } from '../game/store';
import { BLURB } from '../game/text';
import { Emblem, RandomEmblem } from './Emblem';
import { MapPicker } from './MapPicker';
import { LookSwitch } from './LookSwitch';
import { Logo } from './Logo';

const hashCode = () => (/^#[A-Z]{4}$/i.test(location.hash) ? location.hash.slice(1).toUpperCase() : '');

export function Setup() {
  const start = useGame(s => s.start), create = useGame(s => s.create), join = useGame(s => s.join);
  const mapPick = useGame(s => s.mapPick), pickMap = useGame(s => s.pickMap), setGuide = useGame(s => s.setGuide), name = useGame(s => s.name), setName = useGame(s => s.setName), netError = useGame(s => s.netError), busy = useGame(s => s.busy);
  const [tab, setTab] = useState<'solo' | 'online'>(hashCode() ? 'online' : 'solo');
  // Remember the faction choice (including Random) between games, like the map choice.
  const [f, setFState] = useState<Faction | 'random'>(() => {
    try { const v = localStorage.getItem('tw-faction'); if (v === 'random' || (E.FACTION_KEYS as string[]).includes(v || '')) return v as Faction | 'random'; } catch { /* private mode */ }
    return 'badger';
  });
  const setF = (v: Faction | 'random') => { setFState(v); try { localStorage.setItem('tw-faction', v); } catch { /* private mode */ } };
  const [n, setN] = useState(4);
  const [level, setLevel] = useState<Level>('medium');
  const [code, setCode] = useState(hashCode());
  return (
    <div className="setup-wrap">
      <motion.div className="setup" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <div className="setup-top"><h1><Logo /></h1><LookSwitch /></div>
        <p className="muted">Eight woodland factions, up to four per game. The first to {E.WIN} renown wins. <button className="link" onClick={() => setGuide(true)}>How to play</button></p>
        <div className="seg tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'solo'} className={tab === 'solo' ? 'on' : ''} onClick={() => setTab('solo')}>Play solo</button>
          <button role="tab" aria-selected={tab === 'online'} className={tab === 'online' ? 'on' : ''} onClick={() => setTab('online')}>Play online with friends</button>
        </div>
        {tab === 'solo' ? <>
          <div className="fac-grid with-random" role="radiogroup" aria-label="Your faction">
            <button role="radio" aria-checked={f === 'random'} className={`fac random${f === 'random' ? ' on' : ''}`} onClick={() => setF('random')}>
              <RandomEmblem size={48} /><span><b>Random faction</b><small>Any of the eight, picked when the game starts.</small></span>
            </button>
            {E.FACTION_KEYS.map(k => (
              <button key={k} role="radio" aria-checked={f === k} className={`fac${f === k ? ' on' : ''}`} onClick={() => setF(k)}>
                <Emblem f={k} size={40} /><span><b>{E.FACTIONS[k].name}</b><small>{BLURB[k]}</small></span>
              </button>
            ))}
          </div>
          <div><span className="lbl">Map</span><MapPicker value={mapPick} onChange={pickMap} /></div>
          <div className="setup-row">
            <div><span className="lbl">Players</span><div className="seg">{[2, 3, 4].map(x => <button key={x} className={n === x ? 'on' : ''} onClick={() => setN(x)}>{x}</button>)}</div></div>
            <div><span className="lbl">AI difficulty</span><div className="seg">{(['easy', 'medium', 'hard'] as const).map(x => <button key={x} className={level === x ? 'on' : ''} onClick={() => setLevel(x)}>{x[0].toUpperCase() + x.slice(1)}</button>)}</div></div>
            <button className="primary big" onClick={() => start(f, n, level)}>Start solo game</button>
          </div>
        </> : <div className="online">
          <label className="field"><span className="lbl">Your name</span><input value={name} maxLength={20} placeholder="e.g. Hazel" onChange={e => setName(e.target.value.replace(/[<>&"]/g, ''))} /></label>
          <div className="online-grid">
            <div className="online-box">
              <b>Start a room</b><p className="muted small">You'll get a 4-letter code to share. You pick factions and fill empty seats with AI in the lobby.</p>
              <button className="primary big" disabled={busy} onClick={create}>Create a room</button>
            </div>
            <form className="online-box" onSubmit={e => { e.preventDefault(); join(code); }}>
              <b>Join a friend</b><p className="muted small">Enter the code your friend shared.</p>
              <div className="join-row"><input aria-label="Room code" value={code} maxLength={4} placeholder="ABCD" className="code-in" onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} /><button className="primary" disabled={busy || code.length !== 4}>Join</button></div>
            </form>
          </div>
          <p className="err" role="alert">{busy ? 'Connecting…' : netError}</p>
        </div>}
      </motion.div>
    </div>
  );
}
