// Static map art and piece layout, ported from the original artistic style.
import { E, R, type Faction, type MapDef, type MapKey, type State } from './engine';
import { INK_CLR, INK_GROUND, inkTrees } from './ink';

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

type Palette = {
  bg: string; blobs: string[]; trees: string[]; treeHi: string; pine?: boolean; snow?: boolean;
  pathIn: string; pathDash: string; riverOut: string; riverIn: string; riverHi: string;
  fill: Record<'meadow' | 'marsh' | 'grove', string>; flower: string[]; pond: string; bush: string; plate: string;
};
const INK = '#3b2418';
// Each map's season sets the colors: autumn leaves, spring blossom, golden summer grass, winter snow and pines.
export const PALETTES: Record<MapKey, Palette> = {
  autumn: {
    bg: '#9cc4ae', blobs: ['#8db8a2', '#aed0bd'], trees: ['#e8963a', '#d9772b', '#c4582a', '#eab04a', '#b8481f'], treeHi: 'rgba(255,236,190,.35)',
    pathIn: '#efd49a', pathDash: '#c9a45e', riverOut: '#2a3a40', riverIn: '#5f9fb0', riverHi: '#d3ece6',
    fill: { meadow: '#f2d98e', marsh: '#bcdcc8', grove: '#d3dc9c' }, flower: ['#fff6e0', '#e5704f'], pond: '#3f7f94', bush: '#c4582a', plate: '#f8ebcd',
  },
  spring: {
    bg: '#a9d69c', blobs: ['#9ccc8e', '#bde2ae'], trees: ['#f4b6c8', '#f9d5e0', '#8cc46b', '#6fae55', '#e98aa8'], treeHi: 'rgba(255,255,255,.4)',
    pathIn: '#f1e2b0', pathDash: '#cdb57a', riverOut: '#2a3a40', riverIn: '#6db5c9', riverHi: '#e2f4f7',
    fill: { meadow: '#f6e9a4', marsh: '#c2e4d2', grove: '#d4ecb0' }, flower: ['#ffffff', '#f29bb8'], pond: '#4a93a8', bush: '#e98aa8', plate: '#fbf3dc',
  },
  summer: {
    bg: '#d8c27a', blobs: ['#cdb468', '#e2d08f'], trees: ['#7aa83a', '#5f9030', '#a7c24a', '#4f7d2a', '#8fb240'], treeHi: 'rgba(255,250,200,.35)',
    pathIn: '#f3dfa8', pathDash: '#c49a52', riverOut: '#2a3a40', riverIn: '#7fb9c4', riverHi: '#e8f6f4',
    fill: { meadow: '#f5dc7c', marsh: '#c6dcb4', grove: '#c9d98e' }, flower: ['#fff6d0', '#e2522c'], pond: '#4f8f9c', bush: '#6f9a34', plate: '#fbf0d2',
  },
  winter: {
    bg: '#e3ecef', blobs: ['#d6e3e8', '#f1f6f7'], trees: ['#2f5a4a', '#3c6e5a', '#27483d', '#4a7d6a', '#345f50'], treeHi: 'rgba(255,255,255,.0)', pine: true, snow: true,
    pathIn: '#f7f4ec', pathDash: '#b9c4c8', riverOut: '#5a7484', riverIn: '#cfe7f0', riverHi: '#ffffff',
    fill: { meadow: '#f5f3ea', marsh: '#d5e7ee', grove: '#dfe9de' }, flower: ['#ffffff', '#b3243b'], pond: '#7fa6b8', bush: '#2f5a4a', plate: '#fbfaf5',
  },
};
export const boardBg = (k: MapKey) => PALETTES[k].bg;

// Marks for each map's special clearings: blossom trees, the fair tent, snug dens.
function ruleMarks(m: MapDef): string {
  const at = (r: number) => ({ x: m.regions[r].x - 56, y: m.regions[r].y - 52 });
  let h = '';
  for (const r of m.blossoms || []) { const { x, y } = at(r); h += `<g transform="translate(${x},${y})"><circle r="17" fill="#fff" stroke="${INK}" stroke-width="2"/>${[0, 72, 144, 216, 288].map(a => `<circle cx="${Math.cos(a * Math.PI / 180) * 7}" cy="${Math.sin(a * Math.PI / 180) * 7}" r="5.5" fill="#f29bb8" stroke="${INK}" stroke-width="1"/>`).join('')}<circle r="3.5" fill="#f2c43a"/></g>`; }
  if (m.fair !== undefined) { const { x, y } = at(m.fair); h += `<g transform="translate(${x},${y})"><circle r="17" fill="#fff" stroke="${INK}" stroke-width="2"/><path d="M-11 7 L0 -9 L11 7Z" fill="#e2522c" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/><path d="M-4 7 L0 -9 L4 7" fill="#fff6d0" stroke="${INK}" stroke-width="1"/><path d="M0 -9 L0 -14 L6 -12 L0 -10" fill="#2f7fb5" stroke="${INK}" stroke-width=".8"/></g>`; }
  for (const r of m.dens || []) { const { x, y } = at(r); h += `<g transform="translate(${x},${y})"><circle r="17" fill="#fff" stroke="${INK}" stroke-width="2"/><path d="M-11 8 Q-10 -9 0 -9 Q10 -9 11 8Z" fill="#8a6a43" stroke="${INK}" stroke-width="1.5"/><path d="M-5 8 Q-5 -1 0 -1 Q5 -1 5 8Z" fill="#1d1810"/><path d="M-11 -1 Q-6 -12 0 -11 Q6 -12 11 -1 Q5 -6 0 -5 Q-5 -6 -11 -1Z" fill="#fff" stroke="${INK}" stroke-width=".8"/></g>`; }
  return h;
}

// The land runs well past the map edge, so panning never shows a hard border.
// simple: the flat look. No inked outlines or hand-drawn wobble; paths and clearings get soft colored borders instead.
const EDGE = { meadow: '#b9a35a', marsh: '#6fa392', grove: '#7fa35f' };
export function terrainSvg(m: MapDef, simple = false): string {
  const P = PALETTES[m.key], R = m.regions, pathOut = simple ? '#8a7350' : INK;
  const rand = rng(7331), ink = ` stroke="${INK}" stroke-width="2"`;
  const big = `x="-1500" y="-1500" width="${MAP_W + 3000}" height="${MAP_H + 3000}"`;
  // Artistic: tiled ink ground and clearing textures. The ground sits outside the wobble filter, which only blurs a tile.
  const art = simple ? '' : `<defs><pattern id="ink-ground" patternUnits="userSpaceOnUse" width="60" height="60"><image href="${INK_GROUND[m.key]}" width="60" height="60"/></pattern>${
    (['meadow', 'marsh', 'grove'] as const).map(t => `<pattern id="ink-${t}" patternUnits="userSpaceOnUse" width="170" height="170"><image href="${INK_CLR[t]}" width="170" height="170"/></pattern>`).join('')}</defs><rect ${big} fill="${P.bg}"/><rect ${big} fill="url(#ink-ground)" opacity=".85"/>`;
  let h = simple ? `<rect ${big} fill="${P.bg}"/>` : '';
  if (simple) for (let i = 0; i < 160; i++) h += `<ellipse cx="${-600 + rand() * 2200}" cy="${-500 + rand() * 1800}" rx="${30 + rand() * 60}" ry="${20 + rand() * 40}" fill="${rand() < .5 ? P.blobs[0] : P.blobs[1]}" opacity=".6"/>`;
  // the river runs on past the board edge in the direction it enters and leaves
  const away = (edge: Pt, c: Pt) => { const dx = edge.x - c.x, dy = edge.y - c.y, L = Math.hypot(dx, dy) || 1; return { x: edge.x + dx / L * 600, y: edge.y + dy / L * 600 }; };
  const inC = R[m.riverIn.to], outC = R[m.riverOut.from];
  const riverPaths: [Pt, Pt][] = [[away(m.riverIn, inC), inC], ...m.river.map(([a, b]) => [R[a], R[b]] as [Pt, Pt]), [outC, away(m.riverOut, outC)]];
  const isRiv = (a: number, b: number) => m.river.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  const segs: [Pt, Pt, number][] = [];
  riverPaths.forEach(([a, b]) => segs.push([a, b, 30]));
  m.edges.forEach(([a, b]) => { if (!isRiv(a, b)) segs.push([R[a], R[b], 22]); });
  const trees: { x: number; y: number; r: number; c: string }[] = [];
  for (let gx = -520; gx < 1540; gx += 30) for (let gy = -440; gy < 1240; gy += 30) {
    const x = gx + rand() * 22, y = gy + rand() * 22;
    if (R.some(c => Math.hypot(c.x - x, c.y - y) < 100)) continue;
    if (segs.some(([a, b, w]) => segDist(x, y, a.x, a.y, b.x, b.y) < w)) continue;
    if (rand() < (simple ? .18 : .6)) continue; // ink trees are bigger, so fewer of them
    trees.push({ x, y, r: 12 + rand() * 9, c: P.trees[Math.floor(rand() * 5)] });
  }
  trees.sort((a, b) => a.y - b.y);
  m.edges.forEach(([a, b], i) => {
    if (isRiv(a, b)) return;
    const d = curve(R[a], R[b], (i % 2 ? 1 : -1) * 14);
    h += `<path d="${d}" stroke="${pathOut}" stroke-width="20" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.pathIn}" stroke-width="15" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.pathDash}" stroke-width="2" stroke-dasharray="3 10" fill="none" stroke-linecap="round"/>`;
  });
  riverPaths.forEach(([a, b], i) => { h += `<path d="${curve(a, b, (i % 2 ? 1 : -1) * 22)}" stroke="${P.riverOut}" stroke-width="32" fill="none" stroke-linecap="round"/>`; });
  riverPaths.forEach(([a, b], i) => { const d = curve(a, b, (i % 2 ? 1 : -1) * 22); h += `<path d="${d}" stroke="${P.riverIn}" stroke-width="27" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${P.riverHi}" stroke-width="2.5" stroke-dasharray="14 18" fill="none" stroke-linecap="round" opacity=".8"/>`; });
  // Artistic: side-on ink trees standing on their spot, drawn after the wobble filter so the art stays crisp.
  const inks = simple ? [] : inkTrees(m.key);
  const stamps = trees.map((t, i) => {
    const w = t.r * 2.9, x = t.x - w / 2 + (i % 3 - 1) * 2, flip = i % 2 ? ` transform="translate(${2 * t.x} 0) scale(-1 1)"` : '';
    return `<ellipse cx="${t.x + 3}" cy="${t.y + t.r * .9}" rx="${t.r * .9}" ry="${t.r * .32}" fill="rgba(0,0,0,.25)"/><image href="${inks[i % inks.length]}" x="${x}" y="${t.y + t.r - w * 1.15}" width="${w}" height="${w * 1.15}" preserveAspectRatio="xMidYMax meet"${flip}/>`;
  }).join('');
  if (!simple) trees.length = 0;
  h += trees.map(t => P.pine
    // winter: snowy pines
    ? `<path d="M${t.x + 3} ${t.y - t.r * 1.1 + 5} L${t.x + t.r + 3} ${t.y + t.r * .8 + 5} L${t.x - t.r + 3} ${t.y + t.r * .8 + 5}Z" fill="rgba(40,60,70,.22)"/><path d="M${t.x} ${t.y - t.r * 1.2} L${t.x + t.r} ${t.y + t.r * .8} L${t.x - t.r} ${t.y + t.r * .8}Z" fill="${t.c}"${ink} stroke-linejoin="round"/><path d="M${t.x} ${t.y - t.r * 1.2} L${t.x + t.r * .45} ${t.y - t.r * .3} Q${t.x} ${t.y - t.r * .1} ${t.x - t.r * .45} ${t.y - t.r * .3}Z" fill="#fff"/>`
    : `<circle cx="${t.x + 3}" cy="${t.y + 5}" r="${t.r}" fill="rgba(0,0,0,.28)"/><circle cx="${t.x}" cy="${t.y}" r="${t.r}" fill="${t.c}"${ink}/><circle cx="${t.x - t.r / 3}" cy="${t.y - t.r / 3}" r="${t.r / 2.2}" fill="${P.treeHi}"/><path d="M${t.x + t.r * .1} ${t.y + t.r * .55} q${t.r * .3} -${t.r * .15} ${t.r * .5} -${t.r * .5}" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`).join('');
  if (P.snow) for (let i = 0; i < 260; i++) h += `<circle cx="${-500 + rand() * 2000}" cy="${-400 + rand() * 1600}" r="${1 + rand() * 1.6}" fill="#fff" opacity=".9"/>`;
  const pre = h; h = ''; // trees stand between the land and the clearings, so plates and clearings stay on top
  R.forEach(c => {
    h += `<circle cx="${c.x + 3}" cy="${c.y + 6}" r="76" fill="rgba(0,0,0,.3)"/><circle cx="${c.x}" cy="${c.y}" r="74" fill="${simple ? EDGE[c.terrain] : INK}"/><circle cx="${c.x}" cy="${c.y}" r="71" fill="${P.fill[c.terrain]}"/>`;
    if (!simple) h += `<circle cx="${c.x}" cy="${c.y}" r="71" fill="url(#ink-${c.terrain})" opacity=".6" style="mix-blend-mode:multiply"/>`;
    for (let k = 0; k < 16; k++) {
      const ang = rand() * Math.PI * 2; if (ang > 1.1 && ang < 2.05) continue;
      const rr = 57 + rand() * 8, x = c.x + Math.cos(ang) * rr, y = c.y + Math.sin(ang) * rr;
      if (c.terrain === 'meadow') h += `<circle cx="${x}" cy="${y}" r="2.6" fill="${rand() < .5 ? P.flower[0] : P.flower[1]}" stroke="${INK}" stroke-width=".8"/><circle cx="${x}" cy="${y}" r="1" fill="#d99a1a"/>`;
      if (c.terrain === 'marsh') h += rand() < .5 ? `<path d="M${x} ${y + 5} l0 -10 M${x + 3} ${y + 5} l1 -8" stroke="${INK}" stroke-width="1.6"/><ellipse cx="${x}" cy="${y - 6}" rx="1.4" ry="3" fill="#7a5a33"/>` : `<ellipse cx="${x}" cy="${y}" rx="6" ry="2.2" fill="none" stroke="${P.pond}" stroke-width="1.2"/>`;
      if (c.terrain === 'grove') h += `<circle cx="${x}" cy="${y}" r="${4 + rand() * 2}" fill="${P.bush}" stroke="${INK}" stroke-width="1"/>`;
    }
    const w = c.name.length * 9.5 + 44;
    h += `<g transform="translate(${c.x},${c.y + 84})"><rect x="${-w / 2}" y="-15" width="${w}" height="28" rx="7" fill="${P.plate}" stroke="${INK}" stroke-width="2"/>
      <use href="#t-${c.terrain}" x="${-w / 2 + 5}" y="-10" width="19" height="19"/><text class="plate" x="12" y="5" text-anchor="middle">${c.name}</text></g>`;
  });
  h += ruleMarks(m);
  if (simple) return (pre + h).replace(/ stroke="#3b2418" stroke-width="[\d.]+"/g, '').replace(/<path d="M[^"]*q[^"]*" stroke="#3b2418"[^>]*\/>/g, '');
  return `${art}<g filter="url(#rough)">${pre}</g>${stamps}<g filter="url(#rough)">${h}</g>`;
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
