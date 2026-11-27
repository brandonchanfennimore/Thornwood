// Ink-and-marker art (drawn with Recraft) for the Artistic and 3D looks: item icons, ground and clearing textures, and
// side-on trees for each season. Simple keeps the flat vector art in sprites.svg.
import type { MapKey } from './engine';

type Glob = Record<string, string>;
const byName = (g: Glob) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k.split('/').pop()!.replace('.webp', ''), v]));
const icons = byName(import.meta.glob('../assets/ink/icons/*.webp', { eager: true, query: '?url', import: 'default' }));
const trees = byName(import.meta.glob('../assets/ink/trees/*.webp', { eager: true, query: '?url', import: 'default' }));
export const INK_GROUND = byName(import.meta.glob('../assets/ink/ground/*.webp', { eager: true, query: '?url', import: 'default' })) as Record<MapKey, string>;
export const INK_CLR = byName(import.meta.glob('../assets/ink/clr/*.webp', { eager: true, query: '?url', import: 'default' })) as Record<'meadow' | 'marsh' | 'grove', string>;
export const inkTrees = (k: MapKey) => Object.keys(trees).filter(n => n.startsWith(k + '-')).sort().map(n => trees[n]);

// #ui-rough wobbles the edges of the parchment and wood UI (ui-art.css).
// Same ids and viewBoxes as sprites.svg. App puts this sheet first, so `<use href="#r-coin">` finds the ink one.
const VB: Record<string, string> = { b: '-14 -14 28 28', t: '-12 -12 24 24', c: '-30 -30 60 60', p: '0 0 32 32', r: '-12 -12 24 24' };
export const INK_SPRITES = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><filter id="ui-rough" x="-4%" y="-8%" width="108%" height="116%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="4"/><feDisplacementMap in="SourceGraphic" scale="5" xChannelSelector="R" yChannelSelector="G"/></filter>${Object.entries(icons).map(([id, url]) => {
  const [x, y, w, h] = VB[id[0]].split(' ');
  return `<symbol id="${id}" viewBox="${VB[id[0]]}"><image href="${url}" x="${x}" y="${y}" width="${w}" height="${h}"/></symbol>`;
}).join('')}</defs></svg>`;
