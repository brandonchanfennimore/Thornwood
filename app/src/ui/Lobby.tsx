// Room lobby: share the code, choose factions, fill seats with AI, then the host starts the game.
import { useState } from 'react';
import { motion } from 'motion/react';
import { E, type Faction, type Level } from '../game/engine';
import { isHost, useGame } from '../game/store';
import { AI_NAMES } from '../game/text';
import { Emblem, RandomEmblem } from './Emblem';
import { MapPicker } from './MapPicker';

export function Lobby() {
  const room = useGame(s => s.room), uid = useGame(s => s.uid), host = useGame(isHost);
  const editRoom = useGame(s => s.editRoom), startOnline = useGame(s => s.startOnline), quit = useGame(s => s.quit), netError = useGame(s => s.netError);
  const [copied, setCopied] = useState('');
  if (!room) return <div className="setup-wrap"><div className="setup"><p>{netError || 'Connecting to the room…'}</p><button onClick={quit}>Back</button></div></div>;
  const link = `${location.origin}${location.pathname}#${room.code}`;
  const copy = async (text: string, what: string) => { try { await navigator.clipboard.writeText(text); setCopied(what); } catch { setCopied('fail'); } setTimeout(() => setCopied(''), 1500); };
  // Picking a faction another seat has swaps the two. Random keeps a placeholder faction until the game starts.
  const setFaction = (i: number, v: string) => editRoom(g => {
    if (v === 'random') { g.seats[i].random = true; return; }
    const f = v as Faction, o = g.seats.find(x => x.faction === f); if (o) o.faction = g.seats[i].faction; g.seats[i].faction = f; delete g.seats[i].random;
  });
  return (
    <div className="setup-wrap">
      <motion.div className="setup lobby" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
        <div className="lobby-head">
          <div><span className="lbl">Room code</span><div className="code">{room.code}</div></div>
          <div className="lobby-share">
            <button onClick={() => copy(room.code, 'code')}>{copied === 'code' ? 'Copied' : 'Copy code'}</button>
            <button onClick={() => copy(link, 'link')}>{copied === 'link' ? 'Copied' : 'Copy invite link'}</button>
          </div>
        </div>
        <p className="muted small">{host ? 'You are the host. Friends join with the code or the invite link.' : 'Waiting for the host to start the game…'}</p>
        <div className="seats">
          {room.seats.map((s, i) => {
            const you = s.uid === uid;
            return (
              <div key={i} className="seat">
                {s.random ? <RandomEmblem size={36} /> : <Emblem f={s.faction} size={36} />}
                <span className="who">{s.type === 'open' ? <span className="muted">Open seat: waiting for a friend</span> : s.type === 'ai' ? <>{s.random ? 'Random AI' : AI_NAMES[s.faction]} <span className="tag">AI</span></> : <>{s.name}{you && <span className="tag">you</span>}</>}</span>
                {host || you
                  ? <select aria-label="Faction" value={s.random ? 'random' : s.faction} onChange={e => setFaction(i, e.target.value)}>{E.FACTION_KEYS.map(f => <option key={f} value={f}>{E.FACTIONS[f].name}</option>)}<option value="random">Random</option></select>
                  : <span className="tag">{s.random ? 'Random' : E.FACTIONS[s.faction].name}</span>}
                {host && !you && <>
                  <select aria-label="Seat type" value={s.type === 'ai' ? 'ai' : 'open'} onChange={e => editRoom(g => { g.seats[i] = { faction: g.seats[i].faction, type: e.target.value === 'ai' ? 'ai' : 'open' }; })}>
                    <option value="open">Human</option><option value="ai">AI</option>
                  </select>
                  {room.seats.length > 2 && <button className="ghost" aria-label="Remove seat" onClick={() => editRoom(g => { g.seats.splice(i, 1); })}>✕</button>}
                </>}
              </div>
            );
          })}
        </div>
        <div><span className="lbl">Map</span><MapPicker value={room.map || 'autumn'} disabled={!host} onChange={k => editRoom(g => { g.map = k; })} /></div>
        {host && <div className="setup-row">
          <button disabled={room.seats.length >= 4} onClick={() => editRoom(g => { g.seats.push({ type: 'ai', faction: E.FACTION_KEYS.find(f => !g.seats.some(x => x.faction === f))! }); })}>+ Add a seat</button>
          <div><span className="lbl">AI difficulty</span><div className="seg">{(['easy', 'medium', 'hard'] as const).map(x => <button key={x} className={(room.level || 'medium') === x ? 'on' : ''} onClick={() => editRoom(g => { g.level = x as Level; })}>{x[0].toUpperCase() + x.slice(1)}</button>)}</div></div>
          <button className="primary big" onClick={startOnline}>Start game</button>
        </div>}
        <p className="err" role="alert">{netError}</p>
        <button className="ghost" onClick={quit}>Leave room</button>
      </motion.div>
    </div>
  );
}
