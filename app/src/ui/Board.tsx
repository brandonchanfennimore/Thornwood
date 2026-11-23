// The whole page is the map: pan with a drag, zoom with the wheel or a pinch. Clearings open the action popup.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { E, MAP, R, type Faction } from '../game/engine';
import { MAP_H, MAP_W, MAP_X, MAP_Y, PIECE_H, slotPos, terrainSvg, tokenLayout } from '../game/board';
import { FLIGHT_MS, FLIGHT_STAGGER, myActions, useGame, type Flight } from '../game/store';
import { ClearingPopup } from './ClearingPopup';

type View = { x: number; y: number; k: number };
const HUD_TOP = 92, HAND_PEEK = 150;
const isPhone = () => window.innerWidth < 760;

export function Board() {
  const game = useGame(s => s.game), me = useGame(s => s.me), sel = useGame(s => s.selected);
  const select = useGame(s => s.select), act = useGame(s => s.act);
  const wrap = useRef<HTMLDivElement>(null);
  const clearingEls = useRef<(SVGCircleElement | null)[]>([]);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const fitK = useRef(1);
  const mapKey = useGame(s => s.game?.map || (s.mode === 'online' ? s.room?.map : s.mapPick) || 'autumn');
  const terrain = useMemo(() => terrainSvg(E.MAPS[mapKey] || MAP), [mapKey]);

  // Fit the map between the stats bar and the hand, and refit when the window changes size.
  useLayoutEffect(() => {
    const fit = () => {
      const el = wrap.current; if (!el) return;
      const w = el.clientWidth, h = el.clientHeight, avail = Math.max(200, h - HUD_TOP - HAND_PEEK);
      // phones start zoomed in on the middle of the map; drag to see the rest
      const k = isPhone() ? Math.min(avail / MAP_H, (w * 1.7) / MAP_W) : Math.min(w / MAP_W, avail / MAP_H) * 0.98;
      fitK.current = k;
      setView({ k, x: (w - MAP_W * k) / 2 - MAP_X * k, y: HUD_TOP + (avail - MAP_H * k) / 2 - MAP_Y * k });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Pan and zoom. A drag only starts after 5px, so a plain click still reaches the clearing under the pointer.
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef({ moved: false, sx: 0, sy: 0, pinch: 0 });
  const zoomAt = (px: number, py: number, factor: number) => setView(v => {
    const k = Math.min(fitK.current * 3.5, Math.max(fitK.current * 0.7, v.k * factor)), f = k / v.k;
    return { k, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
  });
  useEffect(() => {
    const el = wrap.current!;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const b = el.getBoundingClientRect(); zoomAt(e.clientX - b.left, e.clientY - b.top, Math.exp(-e.deltaY * 0.0015)); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const onPointerDown = (e: React.PointerEvent) => {
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.current.size === 1) drag.current = { moved: false, sx: e.clientX, sy: e.clientY, pinch: 0 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = ptrs.current.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y), bb = wrap.current!.getBoundingClientRect();
      if (drag.current.pinch) zoomAt((a.x + b.x) / 2 - bb.left, (a.y + b.y) / 2 - bb.top, d / drag.current.pinch);
      drag.current.pinch = d; drag.current.moved = true; return;
    }
    if (!drag.current.moved && Math.hypot(e.clientX - drag.current.sx, e.clientY - drag.current.sy) < 5) return;
    if (!drag.current.moved) { drag.current.moved = true; wrap.current!.setPointerCapture(e.pointerId); }
    setView(v => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = (e: React.PointerEvent) => { ptrs.current.delete(e.pointerId); if (ptrs.current.size < 2) drag.current.pinch = 0; };

  const acts = useMemo(() => myActions(game, me), [game, me]);
  const actR = useMemo(() => { const s = new Set<number>(); acts.forEach(a => { if (a.region !== undefined && a.type !== 'card') s.add(a.region); if (a.from !== undefined) s.add(a.from); }); return s; }, [acts]);
  const dests = sel !== null ? acts.filter(a => a.type === 'move' && a.from === sel) : [];
  const destR = new Set(dests.map(a => a.to!));

  const clickClearing = (r: number) => {
    if (drag.current.moved) return;
    const d = dests.find(a => a.to === r);
    if (d) return act(d);
    select(sel === r ? null : r);
  };

  return (
    <div ref={wrap} className="board" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onClick={e => { if (e.target === e.currentTarget || (e.target as Element).closest('.terrain')) { if (!drag.current.moved) select(null); } }}>
      <svg className="map">
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          <g className="terrain" dangerouslySetInnerHTML={{ __html: terrain }} />
          {dests.map(a => {
            const A = R[a.from!], B = R[a.to!], L = Math.hypot(B.x - A.x, B.y - A.y), ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
            return <path key={a.to} d={`M${A.x + ux * 78} ${A.y + uy * 78} L${B.x - ux * 84} ${B.y - uy * 84}`} className="arrow" markerEnd="url(#arrowhead)" />;
          })}
          {R.map((c, i) => {
            const rl = game ? E.ruler(game, i) : null;
            const cls = ['clr', actR.has(i) && 'can', destR.has(i) && 'dest', sel === i && 'sel'].filter(Boolean).join(' ');
            return (
              <g key={i} className={cls} role="button" tabIndex={0} aria-label={c.name}
                onClick={() => clickClearing(i)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clickClearing(i); } }}>
                <circle className="hl" cx={c.x} cy={c.y} r={80} />
                <circle ref={el => { clearingEls.current[i] = el; }} cx={c.x} cy={c.y} r={76} fill="transparent" />
                {rl && <g transform={`translate(${c.x + 52},${c.y - 70})`} pointerEvents="none"><path d="M0 0 L0 30" stroke="#3a2f1c" strokeWidth={2.5} /><path d="M1 1 L24 6 L1 13Z" fill={E.FACTIONS[rl].color} stroke="#fff" strokeWidth={1.2} /></g>}
              </g>
            );
          })}
          <g pointerEvents="none">{game && <Pieces />}<Flyers /></g>
          <defs><marker id="arrowhead" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L10 5 L0 10Z" fill="#ffe27a" /></marker></defs>
        </g>
      </svg>
      {game && sel !== null && <ClearingPopup r={sel} anchor={clearingEls.current[sel]} key={sel} />}
    </div>
  );
}

function Pieces() {
  const game = useGame(s => s.game)!, flight = useGame(s => s.flight);
  const items: React.ReactNode[] = [];
  R.forEach((c, r) => {
    for (let k = 0; k < c.slots; k++) {
      const { x, y } = slotPos(r, k), b = game.regions[r].b[k];
      if (!b) items.push(<rect key={`s-${r}-${k}`} x={x - 14} y={y - 14} width={28} height={28} rx={6} className="slot" />);
      else items.push(<Pop key={`b-${r}-${k}-${b}`} id={`b-${r}-${k}-${b}`} x={x} y={y}><use href={`#b-${b}`} x={x - 15} y={y - 15} width={30} height={30} /></Pop>);
    }
    for (const t of tokenLayout(game, r)) {
      const h = PIECE_H[t.f as Faction] * 0.9;
      items.push(
        <Pop key={t.key} id={t.key} x={t.x} y={t.y} hidden={!!flight?.landing.has(t.key)}>
          <use href={`#a-${t.f}`} x={t.x - 13} y={t.y - h / 2 - 4} width={26} height={h} />
          {t.extra > 0 && <><circle cx={t.x + 10} cy={t.y + 8} r={9} fill="#fff" stroke="#333" /><text x={t.x + 10} y={t.y + 12} textAnchor="middle" fontSize={11} fontWeight={800} fill="#222">{t.extra}</text></>}
        </Pop>,
      );
    }
  });
  // Critters that just took off vanish at once (a flyer takes their place); everything else shrinks away.
  return <AnimatePresence custom={flight?.leaving}>{items}</AnimatePresence>;
}

// Critters crossing the map: each one hops along an arc from its old spot to its new one, a beat after the last.
function Flyers() {
  const flight = useGame(s => s.flight), land = useGame(s => s.land);
  useEffect(() => {
    if (!flight) return;
    const t = setTimeout(() => land(flight.id), FLIGHT_MS + FLIGHT_STAGGER * flight.paths.length + 60);
    return () => clearTimeout(t);
  }, [flight, land]);
  if (!flight) return null;
  return <>{flight.paths.map((p, i) => <Flyer key={`${flight.id}-${i}`} f={flight} p={p} delay={i * FLIGHT_STAGGER} />)}</>;
}
function Flyer({ f, p, delay }: { f: Flight; p: Flight['paths'][number]; delay: number }) {
  const h = PIECE_H[f.f] * 0.9, lift = Math.min(90, 30 + Math.hypot(p.dx - p.sx, p.dy - p.sy) * 0.18);
  return (
    <motion.g initial={{ x: p.sx, y: p.sy }} animate={{ x: [p.sx, (p.sx + p.dx) / 2, p.dx], y: [p.sy, (p.sy + p.dy) / 2 - lift, p.dy] }}
      transition={{ duration: FLIGHT_MS / 1000, delay: delay / 1000, ease: 'easeInOut', times: [0, 0.5, 1] }}>
      <use href={`#a-${f.f}`} x={-13} y={-h / 2 - 4} width={26} height={h} />
    </motion.g>
  );
}

// Pieces pop in when they arrive and shrink away when they leave. The outer translate puts the scale origin on the piece.
function Pop({ id, x, y, hidden = false, children }: { id: string; x: number; y: number; hidden?: boolean; children: React.ReactNode }) {
  // A landing critter is already full size: it just turns visible when its flyer arrives.
  const landing = useRef(hidden).current;
  return (
    <g transform={`translate(${x} ${y})`}>
      <motion.g style={{ transformBox: 'view-box', transformOrigin: '0px 0px' }}
        variants={{ exit: (leaving?: Set<string>) => leaving?.has(id) ? { opacity: 0, transition: { duration: 0 } } : { scale: 0, opacity: 0 } }}
        initial={landing ? { scale: 1, opacity: 0 } : { scale: 0, opacity: 0 }}
        animate={hidden ? { scale: 1, opacity: 0 } : { scale: 1, opacity: 1 }} exit="exit"
        transition={landing ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 22 }}>
        <g transform={`translate(${-x} ${-y})`}>{children}</g>
      </motion.g>
    </g>
  );
}
