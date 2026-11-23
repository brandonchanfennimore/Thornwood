// How to play: a paged guide covering the rules, the three phases, each faction in the game, and the controls.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { E, type Faction } from '../game/engine';
import { PHASES } from '../game/phases';
import { useGame } from '../game/store';
import { Emblem } from './Emblem';

const PH = { dawn: ['Dawn', 'happens by itself'], day: ['Day', 'your actions'], dusk: ['Dusk', 'scoring & cards'] } as const;
const Icon = ({ id, size = 30 }: { id: string; size?: number }) => <svg width={size} height={size} aria-hidden="true"><use href={`#${id}`} width="100%" height="100%" /></svg>;
const Tile = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div className="g-tile"><div className="g-ic">{icon}</div><b>{title}</b><small>{children}</small></div>
);

function PhaseBlock({ f, ph }: { f: Faction; ph: keyof typeof PH }) {
  const P = PHASES[f];
  return (
    <div className={`g-ph g-${ph}`}>
      <div className="g-ph-h"><Icon id={`p-${ph}`} size={26} /><div><b>{PH[ph][0]}</b><small>{ph === 'day' ? P.dayNote : PH[ph][1]}</small></div></div>
      <ul>{P[ph].map(([, n, c, d]) => <li key={n}><b>{n}</b>{c && <span className="cost">{c}</span>}<small>{d}</small></li>)}</ul>
    </div>
  );
}

function pages(facs: Faction[], me: Faction | null) {
  const gems = (...t: string[]) => <span className="gems">{t.map((x, i) => <Icon key={i} id={`t-${x}`} size={22} />)}</span>;
  return [
    { t: 'Welcome to Thornwood', h: <>
      <p className="g-lede">Up to four of eight woodland factions fight over the forest. Each plays by its own rules and scores <b>renown</b> its own way.</p>
      <div className="g-grid">
        <Tile icon={<Icon id="i-star" />} title="Goal">The first to <b>{E.WIN} renown</b> wins at once. After {E.MAX_ROUNDS} rounds, the most renown wins.</Tile>
        <Tile icon={gems('meadow', 'marsh', 'grove')} title="Clearings">13 clearings, each a meadow, marsh or grove. The dashed squares are building slots.</Tile>
        <Tile icon={<svg width="30" height="30" viewBox="0 0 30 34"><path d="M4 2 L4 32" stroke="#3a2f1c" strokeWidth="3" /><path d="M5 3 L28 9 L5 16Z" fill="#d9772b" stroke="#fff" strokeWidth="1.5" /></svg>} title="Rule">Most pieces (critters plus buildings) in a clearing rules it, shown by a flag. A tie means nobody does.</Tile>
        <Tile icon={gems('meadow', 'marsh', 'grove')} title="Seasons">The season moves on every round. Several factions score extra for the season's terrain.</Tile>
        <Tile icon={<span className="g-dice"><span className="die">5</span><span className="die hit">4</span></span>} title="Battle">Each side rolls one die per critter (up to 3). Every 4+ is a hit. Hits remove critters first, then buildings, and destroying a building earns 1 renown.</Tile>
        <Tile icon={<Icon id="c-rally" />} title="Cards">Cards pay terrain costs and have effects. Ambush cards defend you by themselves. You can hold 5.</Tile>
      </div>
    </> },
    { t: 'Every turn has three phases', h: <>
      <p className="g-lede">Each turn runs <b>Dawn → Day → Dusk</b>. What happens in each phase depends on the faction.</p>
      <div className="g-three">
        <div className="g-ph g-dawn"><div className="g-ph-h"><Icon id="p-dawn" /><div><b>Dawn</b><small>happens by itself</small></div></div><p>Your faction gets its boost: stone, new critters, actions, cards or coins.</p></div>
        <div className="g-ph g-day"><div className="g-ph-h"><Icon id="p-day" /><div><b>Day</b><small>your actions</small></div></div><p>Move, attack, build, recruit and play cards. Most factions get 3 actions. Otters pay coins instead.</p></div>
        <div className="g-ph g-dusk"><div className="g-ph-h"><Icon id="p-dusk" /><div><b>Dusk</b><small>scoring &amp; cards</small></div></div><p>Score renown your faction's way, draw cards, then discard down to your hand limit.</p></div>
      </div>
    </> },
    ...facs.map(f => ({ t: E.FACTIONS[f].name, f, you: f === me, h: <>
      <div className="g-fac"><Emblem f={f} size={64} /><div><p className="g-lede">{PHASES[f].tag}</p><p className="g-perk">{PHASES[f].perk}</p></div></div>
      <div className="g-three">{(['dawn', 'day', 'dusk'] as const).map(ph => <PhaseBlock key={ph} f={f} ph={ph} />)}</div>
    </> })),
    { t: 'Playing your turn', h: (
      <div className="g-grid">
        <Tile icon={<svg width="30" height="30" viewBox="0 0 34 34"><circle cx="17" cy="17" r="14" fill="#a7c98a" stroke="#e0b520" strokeWidth="3" strokeDasharray="5 4" /></svg>} title="Gold rings">A dashed gold ring marks a clearing where you can act. Tap it to open its actions beside it.</Tile>
        <Tile icon={<svg width="30" height="30" viewBox="0 0 34 34"><path d="M4 17 L26 17" stroke="#e0b520" strokeWidth="4" strokeDasharray="5 4" /><path d="M24 10 L32 17 L24 24Z" fill="#e0b520" /></svg>} title="Moving">Tap your clearing, set how many with − / +, then tap a glowing clearing to send them.</Tile>
        <Tile icon={<Icon id="c-provision" />} title="Your hand">Your cards fan along the bottom. Tap one to raise it and see what you can do with it.</Tile>
        <Tile icon={<Icon id="i-move" />} title="The map">Drag to look around. Zoom with the scroll wheel or a pinch.</Tile>
        <Tile icon={<Icon id="p-dusk" />} title="End turn">When your Day is done, press End turn at the bottom right. Dusk scoring happens by itself.</Tile>
        <Tile icon={<Icon id="i-star" />} title="Need a reminder?">Open this guide any time with the <b>?</b> button at the top.</Tile>
      </div>
    ) },
  ];
}

export function Guide() {
  const open = useGame(s => s.guideOpen), setOpen = useGame(s => s.setGuide), game = useGame(s => s.game), me = useGame(s => s.me);
  const [i, setI] = useState(0);
  const facs = game ? game.players.map(p => p.faction) : E.FACTION_KEYS.slice();
  if (me) facs.sort((a, b) => Number(b === me) - Number(a === me));
  const list = pages(facs, me), page = list[Math.min(i, list.length - 1)], last = i >= list.length - 1;
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) setI(0); }, [open]);
  useEffect(() => { body.current?.scrollTo(0, 0); }, [i]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); if (e.key === 'ArrowRight') setI(x => Math.min(x + 1, list.length - 1)); if (e.key === 'ArrowLeft') setI(x => Math.max(0, x - 1)); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open, setOpen, list.length]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="g-back" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)}>
          <motion.div className="guide" role="dialog" aria-modal="true" aria-label="How to play" initial={{ y: 30, scale: 0.97 }} animate={{ y: 0, scale: 1 }} exit={{ y: 20, opacity: 0 }} onClick={e => e.stopPropagation()}>
            <div className="g-body" ref={body}>
              <div className="g-eyebrow">Guide · {i + 1} of {list.length}</div>
              <h2>{page.t}{'you' in page && page.you && <span className="tag">you</span>}</h2>
              {page.h}
            </div>
            <div className="g-foot">
              <button className="ghost" onClick={() => setOpen(false)}>Skip</button>
              <div className="g-dots">{list.map((p, k) => <button key={k} className={`g-dot${k === i ? ' on' : ''}`} aria-label={`Page ${k + 1}`} onClick={() => setI(k)}>{'f' in p && p.f ? <Emblem f={p.f} size={18} /> : null}</button>)}</div>
              <button disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
              <button className="primary" onClick={() => (last ? setOpen(false) : setI(i + 1))}>{last ? (game ? 'Start playing' : 'Close') : 'Next'}</button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
