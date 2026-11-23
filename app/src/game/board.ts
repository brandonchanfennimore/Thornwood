// Static map art and piece layout, ported from the original artistic style.
import { E, R, type Faction, type State } from './engine';

export const MAP_W = 1020, MAP_H = 790, MAP_X = -10, MAP_Y = -14;

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
type Pt = { x: number; y: number };
function curve(a: Pt, b: Pt, bend: number) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  return `M${a.x} ${a.y} Q${mx - dy / L * bend} ${my + dx / L * bend} ${b.x} ${b.y}`;
}

const P = {
  bg: '#9cc4ae', blobs: ['#8db8a2', '#aed0bd'], trees: ['#e8963a', '#d9772b', '#c4582a', '#eab04a', '#b8481f'], treeHi: 'rgba(255,236,190,.35)', ink: '#3b2418',
  pathIn: '#efd49a', pathDash: '#c9a45e', riverOut: '#2a3a40', riverIn: '#5f9fb0', riverHi: '#d3ece6',
  fill: { meadow: '#f2d98e', marsh: '#bcdcc8', grove: '#d3dc9c' }, flower: ['#fff6e0', '#e5704f'], pond: '#3f7f94', bush: '#c4582a', plate: '#f8ebcd',
};

// The forest runs well past the map edge, so panning never shows a hard border.
export function terrainSvg(): string {
  const rand = rng(7331), ink = ` stroke="${P.ink}" stroke-width="2"`;
  let h = `<rect x="-1500" y="-1500" width="${MAP_W + 3000}" height="${MAP_H + 3000}" fill="${P.bg}"/>`;
  for (let i = 0; i < 160; i++) h += `<ellipse cx="${-600 + rand() * 2200}" cy="${-500 + rand() * 1800}" rx="${30 + rand() * 60}" ry="${20 + rand() * 40}" fill="${rand() < .5 ? P.blobs[0] : P.blobs[1]}" opacity=".6"/>`;
  const top = { x: 330, y: -500 }, bot = { x: 470, y: 1300 };
  const riverPaths: [Pt, Pt][] = [[top, R[1]], ...E.RIVER.map(([a, b]) => [R[a], R[b]] as [Pt, Pt]), [R[12], bot]];
  const segs: [Pt, Pt, number][] = [];
  riverPaths.forEach(([a, b]) => segs.push([a, b, 30]));
  E.EDGES.forEach(([a, b]) => { if (!E.isRiver(a, b)) segs.push([R[a], R[b], 22]); });
  const trees: { x: number; y: number; r: number; c: string }[] = [];
  for (let gx = -520; gx < 1540; gx += 30) for (let gy = -440; gy < 1240; gy += 30) {
    const x = gx + rand() * 22, y = gy + rand() * 22;
    if (R.some(c => Math.hypot(c.x - x, c.y - y) < 100)) continue;
    if (segs.some(([a, b, w]) => segDist(x, y, a.x, a.y, b.x, b.y) < w)) continue;
    if (rand() < .18) continue;
    trees.push({ x, y, r: 12 + rand() * 9, c: P.trees[Math.floor(rand() * 5)] });
  }
  trees.sort((a, b) => a.y - b.y);
  E.EDGES.forEach(([a, b], i) => {
    if (E.isRiver(a, b)) return;
    const d = curve(R[a], R[b], (i % 2 ? 1 : -1) * 14);
    h += `<path d="${d}" stroke="${P.ink}" stroke-width="20" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.pathIn}" stroke-width="15" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.pathDash}" stroke-width="2" stroke-dasharray="3 10" fill="none" stroke-linecap="round"/>`;
  });
  riverPaths.forEach(([a, b], i) => { h += `<path d="${curve(a, b, (i % 2 ? 1 : -1) * 22)}" stroke="${P.riverOut}" stroke-width="32" fill="none" stroke-linecap="round"/>`; });
  riverPaths.forEach(([a, b], i) => { const d = curve(a, b, (i % 2 ? 1 : -1) * 22); h += `<path d="${d}" stroke="${P.riverIn}" stroke-width="27" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.riverHi}" stroke-width="2.5" stroke-dasharray="14 18" fill="none" stroke-linecap="round" opacity=".8"/>`; });
  h += trees.map(t => `<circle cx="${t.x + 3}" cy="${t.y + 5}" r="${t.r}" fill="rgba(0,0,0,.28)"/><circle cx="${t.x}" cy="${t.y}" r="${t.r}" fill="${t.c}"${ink}/><circle cx="${t.x - t.r / 3}" cy="${t.y - t.r / 3}" r="${t.r / 2.2}" fill="${P.treeHi}"/><path d="M${t.x + t.r * .1} ${t.y + t.r * .55} q${t.r * .3} -${t.r * .15} ${t.r * .5} -${t.r * .5}" stroke="${P.ink}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`).join('');
  R.forEach(c => {
    h += `<circle cx="${c.x + 3}" cy="${c.y + 6}" r="76" fill="rgba(0,0,0,.3)"/><circle cx="${c.x}" cy="${c.y}" r="74" fill="${P.ink}"/><circle cx="${c.x}" cy="${c.y}" r="71" fill="${P.fill[c.terrain]}"/>`;
    for (let k = 0; k < 16; k++) {
      const ang = rand() * Math.PI * 2; if (ang > 1.1 && ang < 2.05) continue;
      const rr = 57 + rand() * 8, x = c.x + Math.cos(ang) * rr, y = c.y + Math.sin(ang) * rr;
      if (c.terrain === 'meadow') h += `<circle cx="${x}" cy="${y}" r="2.6" fill="${rand() < .5 ? P.flower[0] : P.flower[1]}" stroke="${P.ink}" stroke-width=".8"/><circle cx="${x}" cy="${y}" r="1" fill="#d99a1a"/>`;
      if (c.terrain === 'marsh') h += rand() < .5 ? `<path d="M${x} ${y + 5} l0 -10 M${x + 3} ${y + 5} l1 -8" stroke="${P.ink}" stroke-width="1.6"/><ellipse cx="${x}" cy="${y - 6}" rx="1.4" ry="3" fill="#7a5a33"/>` : `<ellipse cx="${x}" cy="${y}" rx="6" ry="2.2" fill="none" stroke="${P.pond}" stroke-width="1.2"/>`;
      if (c.terrain === 'grove') h += `<circle cx="${x}" cy="${y}" r="${4 + rand() * 2}" fill="${P.bush}" stroke="${P.ink}" stroke-width="1"/>`;
    }
    const w = c.name.length * 9.5 + 44;
    h += `<g transform="translate(${c.x},${c.y + 84})"><rect x="${-w / 2}" y="-15" width="${w}" height="28" rx="7" fill="${P.plate}" stroke="${P.ink}" stroke-width="2"/>
      <use href="#t-${c.terrain}" x="${-w / 2 + 5}" y="-10" width="19" height="19"/><text class="plate" x="12" y="5" text-anchor="middle">${c.name}</text></g>`;
  });
  return `<g filter="url(#rough)">${h}</g>`;
}

export const PIECE_H: Record<Faction, number> = { badger: 32, rabbit: 36, owl: 33, otter: 31, fox: 34, hedgehog: 33, frog: 32, mole: 31 };
export interface Token { f: Faction; k: number; key: string; x: number; y: number; extra: number }
const ROWS = [{ y: -6, n: 6 }, { y: 18, n: 6 }, { y: 42, n: 4 }];
// Up to 16 critters are drawn per clearing; bigger stacks show a count badge.
export function tokenLayout(st: State, r: number): Token[] {
  const fs = st.players.map(p => p.faction).filter(f => E.critters(st, r, f) > 0);
  const counts = fs.map(f => E.critters(st, r, f)), total = counts.reduce((a, b) => a + b, 0), CAP = 16;
  const vis = counts.map(n => total <= CAP ? n : Math.max(1, Math.round(n * CAP / total)));
  while (vis.reduce((a, b) => a + b, 0) > CAP) vis[vis.indexOf(Math.max(...vis))]--;
  const list: { f: Faction; k: number; extra: number }[] = [];
  fs.forEach((f, i) => { for (let k = 0; k < vis[i]; k++) list.push({ f, k, extra: k === vis[i] - 1 && vis[i] < counts[i] ? counts[i] : 0 }); });
  const out: Token[] = []; let idx = 0;
  for (const row of ROWS) {
    const inRow = list.slice(idx, idx + row.n); if (!inRow.length) break;
    inRow.forEach((t, j) => out.push({ ...t, key: `${r}-${t.f}-${t.k}`, x: R[r].x + (j - (inRow.length - 1) / 2) * 22, y: R[r].y + row.y }));
    idx += row.n;
  }
  return out;
}
export const slotPos = (r: number, k: number) => ({ x: R[r].x - (R[r].slots * 34 - 4) / 2 + k * 34 + 15, y: R[r].y - 40 });
