// The 3D style: a toy tabletop drawn with three.js, ported from the original site's 3D view. It follows the same game state
// as the 2D map, uses the current map's layout and season colors, and opens the same clearing popup. Loaded only when picked.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { E, MAP, type Faction, type MapDef } from '../game/engine';
import { PALETTES, slotPos, tokenLayout } from '../game/board';
import { myActions, useGame } from '../game/store';
import { ClearingPopup } from './ClearingPopup';
import { INK_CLR, INK_GROUND, inkTrees } from '../game/ink';

THREE.ColorManagement.enabled = false; // match the flat, saturated colors of the original 3D view

const V3 = (x: number, y: number, h = 0) => new THREE.Vector3((x - 500) * 0.01, h, (y - 390) * 0.01);
const FUR: Record<Faction, string> = { badger: '#5b544d', rabbit: '#efd36a', owl: '#d9692c', otter: '#8a5a38', fox: '#e07a3a', hedgehog: '#e9cfa4', frog: '#8fd16a', mole: '#4e3f4a' };
const CLOAK: Record<Faction, string> = { badger: '#6e7c8c', rabbit: '#d9772b', owl: '#7a58a8', otter: '#2f7fb5', fox: '#c0392b', hedgehog: '#8d6e3f', frog: '#3f9a4a', mole: '#c2507f' };
const EYE: Record<Faction, number> = { badger: .03, rabbit: .03, owl: .037, otter: .027, fox: .028, hedgehog: .027, frog: .034, mole: .018 };
const TER = { meadow: '#f2d98e', marsh: '#bcdcc8', grove: '#d3dc9c' };

interface Scene3D {
  board: THREE.Group; rings: THREE.Mesh[]; ringOn: { on: boolean; dest: boolean; sel: boolean }[];
  pieces: Map<string, { obj: THREE.Object3D; t0: number; size: number; dying?: boolean }>;
  make: { critter(f: Faction): THREE.Group; building(f: Faction): THREE.Group; flag(f: Faction): THREE.Group; count(n: number): THREE.Sprite };
  project(r: number): DOMRect;
}

function build(cv: HTMLCanvasElement, m: MapDef, onPick: (r: number) => void, onDrag: () => boolean) {
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  (renderer as unknown as { useLegacyLights: boolean }).useLegacyLights = true;
  const pal = PALETTES[m.key], scene = new THREE.Scene();
  scene.background = new THREE.Color(m.key === 'winter' ? '#e8eef0' : '#e9dcc0');
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  const view = { x: 0, z: 0.3, zoom: 0.9 }; // pulled back a little so the board clears the stats bar and the hand
  const placeCamera = () => { camera.position.set(view.x, 9.7 / view.zoom, 8.0 / view.zoom + view.z); camera.lookAt(view.x, 0, 0.5 + view.z); };
  placeCamera();
  scene.add(new THREE.HemisphereLight('#fff4e0', '#7a6d5c', 0.58));
  const sun = new THREE.DirectionalLight('#fff0d8', 0.62); sun.position.set(-5, 10, 6); sun.castShadow = true;
  Object.assign(sun.shadow.camera, { left: -7, right: 7, top: 6, bottom: -6, near: 1, far: 30 }); sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008;
  scene.add(sun);
  const mats: Record<string, THREE.Material> = {};
  const M = (c: string, toon?: boolean) => mats[c + toon] ||= toon ? new THREE.MeshToonMaterial({ color: c }) : new THREE.MeshLambertMaterial({ color: c });
  const mesh = (geo: THREE.BufferGeometry, color: string, pos?: THREE.Vector3 | null, o: { toon?: boolean; scale?: number[]; rot?: number[]; cast?: boolean } = {}) => {
    const x = new THREE.Mesh(geo, M(color, o.toon)); if (pos) x.position.copy(pos);
    if (o.scale) x.scale.set(o.scale[0], o.scale[1], o.scale[2]); if (o.rot) x.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
    x.castShadow = o.cast !== false; x.receiveShadow = true; return x;
  };
  const R = m.regions, board = new THREE.Group(); scene.add(board);
  board.add(mesh(new THREE.BoxGeometry(10.8, 0.3, 8.5), '#7a5232', new THREE.Vector3(0, -0.16, 0)));
  // ink art: the season's ground tiled across the board, clearing textures tinted by the season's fill color
  const tex = (url: string, rx = 1, ry = rx) => { const t = new THREE.TextureLoader().load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; };
  const ground = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.02, 8.1), new THREE.MeshLambertMaterial({ map: tex(INK_GROUND[m.key], 13, 10.1) }));
  ground.position.y = -0.01; ground.receiveShadow = true; board.add(ground);
  const clrMat = Object.fromEntries((['meadow', 'marsh', 'grove'] as const).map(t => [t, new THREE.MeshLambertMaterial({ color: pal.fill[t] || TER[t], map: tex(INK_CLR[t]) })]));
  const tops: THREE.Mesh[] = [], rings: THREE.Mesh[] = [];
  R.forEach((c, i) => {
    board.add(mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.08, 64), '#3b2418', V3(c.x, c.y, 0.04)));
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.71, 0.71, 0.1, 64), clrMat[c.terrain]); t.position.copy(V3(c.x, c.y, 0.05)); t.receiveShadow = true;
    t.userData.r = i; tops.push(t); board.add(t);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.03, 8, 64), new THREE.MeshBasicMaterial({ color: '#ffe27a', transparent: true }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(V3(c.x, c.y, 0.11)); ring.visible = false; board.add(ring); rings.push(ring);
  });
  // paths and river: flattened tubes along the same bends as the 2D map
  type Pt = { x: number; y: number };
  const tube = (a: Pt, b: Pt, bend: number, r: number, h: number, color: string) => {
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy), mx = (a.x + b.x) / 2 - dy / L * bend, my = (a.y + b.y) / 2 + dx / L * bend;
    const x = mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(V3(a.x, a.y), V3(mx, my), V3(b.x, b.y)), 24, r, 8), color, null, { cast: false });
    x.scale.y = 0.12; x.position.y = h; board.add(x);
  };
  const isRiv = (a: number, b: number) => m.river.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
  m.edges.forEach(([a, b], i) => { if (!isRiv(a, b)) tube(R[a], R[b], (i % 2 ? 1 : -1) * 14, 0.1, 0.004, pal.pathIn); });
  const riverPaths: [Pt, Pt][] = [[m.riverIn, R[m.riverIn.to]], ...m.river.map(([a, b]) => [R[a], R[b]] as [Pt, Pt]), [R[m.riverOut.from], m.riverOut]];
  riverPaths.forEach(([a, b], i) => { tube(a, b, (i % 2 ? 1 : -1) * 22, 0.17, 0.0, pal.riverOut); tube(a, b, (i % 2 ? 1 : -1) * 22, 0.14, 0.008, pal.riverIn); });
  // name plates with canvas-drawn labels
  const label = (txt: string, w: number, h: number, font: string, color = '#2a1a12', bg: string | null = null) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d')!;
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 2);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
  };
  const plates = R.map(c => {
    const w = c.name.length * 0.075 + 0.12, p = V3(c.x, c.y + 86, 0.04);
    board.add(mesh(new THREE.BoxGeometry(w, 0.06, 0.2), '#f8ebcd', p));
    const top = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.2), new THREE.MeshBasicMaterial({ map: label(c.name, 512, 96, '800 64px Grandstander, sans-serif', '#2a1a12', '#f8ebcd') }));
    top.rotation.x = -Math.PI / 2; top.position.set(p.x, 0.072, p.z); board.add(top);
    return { x: p.x, z: p.z, w };
  });
  // special clearings get a little marker post: blossom, fair tent, den
  const marks: [number, string][] = [...(m.blossoms || []).map(r => [r, '#f29bb8'] as [number, string]), ...(m.fair !== undefined ? [[m.fair, '#e2522c'] as [number, string]] : []), ...(m.dens || []).map(r => [r, '#8a6a43'] as [number, string])];
  for (const [r, col] of marks) { const p = V3(R[r].x - 56, R[r].y - 52, 0); board.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), '#5a3e28', p.clone().setY(0.15))); board.add(mesh(new THREE.SphereGeometry(0.07, 16, 12), col, p.clone().setY(0.33), { toon: true })); }
  // trees: one instanced canopy mesh and one trunk mesh, placed like the 2D map and kept off paths and plates
  let seed = 7331; const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const segDist = (p: Pt, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
  const segs: [Pt, Pt, number][] = [...riverPaths.map(([a, b]) => [a, b, 34] as [Pt, Pt, number]), ...m.edges.filter(([a, b]) => !isRiv(a, b)).map(([a, b]) => [R[a], R[b], 24] as [Pt, Pt, number])];
  const spots: { v: THREE.Vector3; r: number; h: number; col: number }[] = [];
  for (let gx = -10; gx < 1010; gx += 30) for (let gy = -14; gy < 776; gy += 30) {
    const p = { x: gx + rand() * 22, y: gy + rand() * 22 };
    if (R.some(c => Math.hypot(c.x - p.x, c.y - p.y) < 100) || segs.some(([a, b, w]) => segDist(p, a, b) < w) || rand() < .6) continue;
    const v = V3(p.x, p.y), r = (12 + rand() * 9) * .01, h = r * (1.4 + rand() * .6), col = Math.floor(rand() * 5);
    if (plates.some(q => Math.abs(v.x - q.x) < q.w / 2 + .25 && v.z - q.z > -.25 && v.z - q.z < 1)) continue;
    spots.push({ v, r, h, col });
  }
  // ink trees as billboards: the camera only pans and zooms, so they always stand upright facing it
  const kinds = inkTrees(m.key).map(u => {
    const k = { mat: new THREE.SpriteMaterial({ alphaTest: 0.5 }), sprites: [] as THREE.Sprite[] };
    // widen each sprite to its picture's shape once it loads (mirrored on every other tree for variety)
    k.mat.map = new THREE.TextureLoader().load(u, t => { const ar = t.image.width / t.image.height; k.sprites.forEach(sp => { sp.scale.x = sp.scale.y * ar * Math.sign(sp.scale.x); }); });
    return k;
  });
  const shade = new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: .22, depthWrite: false }), disc = new THREE.CircleGeometry(1, 20);
  spots.forEach((s, i) => {
    const k = kinds[(i + s.col) % kinds.length], sp = new THREE.Sprite(k.mat), h = s.h * 2.3;
    sp.scale.set(h * .9 * (i % 2 ? -1 : 1), h, 1); sp.center.set(.5, 0); sp.position.set(s.v.x, 0, s.v.z); k.sprites.push(sp); board.add(sp);
    const d = new THREE.Mesh(disc, shade); d.rotation.x = -Math.PI / 2; d.scale.set(s.r * 1.1, s.r * .7, 1); d.position.set(s.v.x + .03, .003, s.v.z + .02); board.add(d);
  });
  // critters and buildings, as storybook toys (toon shaded). Front faces the camera (+z).
  const sph = new THREE.SphereGeometry(1, 20, 14), cone = new THREE.ConeGeometry(1, 1, 16), cyl = new THREE.CylinderGeometry(1, 1, 1, 20), box = new THREE.BoxGeometry(1, 1, 1);
  const P3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const part = (g: THREE.Group, geo: THREE.BufferGeometry, color: string, pos: THREE.Vector3, scale: number[], rot?: number[]) => g.add(mesh(geo, color, pos, { toon: true, scale, rot }));
  const make: Scene3D['make'] = {
    critter(f) {
      const g = new THREE.Group(), e = EYE[f];
      g.add(mesh(new THREE.CylinderGeometry(.065, .11, .17, 24), CLOAK[f], P3(0, .085, 0), { toon: true }));
      part(g, sph, FUR[f], P3(0, .225, 0), [.088, .088, .088]);
      for (const s of [-1, 1]) { part(g, sph, '#fffaf0', P3(s * .036, .238, .068), [e, e, e]); part(g, sph, '#2a1a12', P3(s * .033, .243, .068 + e * .82), [e * .5, e * .5, e * .5]); }
      if (f === 'badger') {
        part(g, sph, '#fffaf0', P3(0, .262, .05), [.024, .05, .045]); part(g, sph, '#2a1a12', P3(0, .205, .088), [.016, .016, .016]);
        for (const s of [-1, 1]) part(g, sph, FUR[f], P3(s * .062, .292, -.005), [.03, .03, .03]);
      } else if (f === 'rabbit') {
        part(g, sph, '#f2a9a0', P3(0, .205, .087), [.012, .012, .012]);
        for (const s of [-1, 1]) { part(g, sph, FUR[f], P3(s * .035, .35, 0), [.026, .085, .016], [0, 0, -s * .17]); part(g, sph, '#f2a9a0', P3(s * .035, .35, .012), [.012, .065, .008], [0, 0, -s * .17]); }
      } else if (f === 'owl') {
        for (const s of [-1, 1]) part(g, cone, '#b8481f', P3(s * .055, .31, 0), [.028, .07, .028], [0, 0, -s * .44]);
        part(g, cone, '#f2bf34', P3(0, .205, .09), [.018, .045, .018], [1.75, 0, 0]);
      } else if (f === 'otter') {
        part(g, sph, '#f1dcc0', P3(0, .2, .068), [.048, .032, .03]); part(g, sph, '#2a1a12', P3(0, .21, .096), [.014, .014, .014]);
        for (const s of [-1, 1]) part(g, sph, FUR[f], P3(s * .066, .278, 0), [.024, .024, .024]);
      } else if (f === 'fox') {
        part(g, sph, '#fbeedd', P3(0, .2, .07), [.05, .03, .035]); part(g, sph, '#2a1a12', P3(0, .207, .103), [.013, .013, .013]);
        for (const s of [-1, 1]) part(g, cone, FUR[f], P3(s * .05, .325, 0), [.03, .08, .022], [0, 0, -s * .3]);
      } else if (f === 'hedgehog') {
        part(g, sph, '#2a1a12', P3(0, .212, .09), [.014, .014, .014]);
        for (let k = 0; k < 9; k++) { const a = -1.3 + k * .325; part(g, cone, '#4a3524', P3(Math.sin(a) * .07, .24 + Math.cos(a) * .07, -.035), [.026, .075, .026], [-.5, 0, -a]); }
      } else if (f === 'frog') {
        g.children.slice(-4).forEach(c => { c.position.y += .055; });
        for (const s of [-1, 1]) part(g, sph, FUR[f], P3(s * .036, .292, .045), [.042, .042, .042]);
        part(g, box, '#2a1a12', P3(0, .2, .083), [.07, .006, .01]);
      } else if (f === 'mole') {
        part(g, sph, '#f0a3b8', P3(0, .207, .09), [.03, .022, .024]);
        part(g, sph, '#ffd84a', P3(0, .3, .055), [.02, .02, .02]); part(g, cyl, '#6b5a3a', P3(0, .3, .035), [.03, .012, .03], [Math.PI / 2, 0, 0]);
      }
      return g;
    },
    building(f) {
      const g = new THREE.Group();
      const flag = (x: number, z: number, h: number) => { part(g, cyl, '#5a3e28', P3(x, h / 2, z), [.008, h, .008]); part(g, box, CLOAK[f], P3(x + .05, h - .04, z), [.1, .07, .008]); };
      if (f === 'badger') { part(g, sph, '#8a6a43', P3(0, 0, 0), [.15, .12, .14]); part(g, cyl, '#1e140e', P3(0, .04, .13), [.05, .06, .05], [Math.PI / 2, 0, 0]); flag(.1, -.06, .36); }
      if (f === 'owl') {
        part(g, cyl, '#a6794a', P3(0, .06, 0), [.11, .12, .11]); g.add(mesh(new THREE.TorusGeometry(.1, .04, 10, 32), '#785430', P3(0, .14, 0), { toon: true, rot: [Math.PI / 2, 0, 0] }));
        for (const x of [-.03, .035]) part(g, sph, '#f1dcc0', P3(x, .14, 0), [.03, .038, .03]);
        flag(.12, -.05, .4);
      }
      if (f === 'otter') { part(g, box, '#a6794a', P3(0, .075, 0), [.22, .15, .2]); part(g, cone, CLOAK[f], P3(0, .2, 0), [.18, .12, .18], [0, Math.PI / 4, 0]); part(g, box, '#1e140e', P3(0, .05, .1), [.06, .1, .01]); flag(.13, -.05, .42); }
      if (f === 'hedgehog') { part(g, cyl, '#8a6440', P3(0, .08, 0), [.09, .26, .09], [Math.PI / 2, 0, 0]); part(g, cyl, '#1e140e', P3(0, .08, .131), [.06, .01, .06], [Math.PI / 2, 0, 0]); part(g, sph, '#c4582a', P3(-.04, .17, -.05), [.05, .03, .05]); flag(.12, -.08, .38); }
      if (f === 'frog') { part(g, cyl, '#5f9fb0', P3(0, .01, 0), [.16, .02, .16]); part(g, cyl, '#5aa84a', P3(0, .03, 0), [.13, .02, .13]); part(g, cone, '#f2a9c4', P3(.03, .07, .02), [.035, .06, .035]); flag(.12, -.06, .36); }
      if (f === 'mole') { part(g, sph, '#7a5a3a', P3(0, 0, 0), [.13, .1, .12]); part(g, cyl, '#1e140e', P3(0, .05, .11), [.045, .01, .045], [1.2, 0, 0]); for (const x of [-.09, .08]) part(g, sph, '#9a948a', P3(x, .02, .07), [.03, .025, .03]); flag(.1, -.06, .36); }
      return g;
    },
    flag(f) { const g = new THREE.Group(); part(g, cyl, '#3a2f1c', P3(0, .2, 0), [.012, .4, .012]); part(g, box, E.FACTIONS[f].color, P3(.1, .34, 0), [.2, .12, .01]); return g; },
    count(n) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: label('×' + n, 128, 64, '800 44px Grandstander, sans-serif', '#2a1a12', '#fff6e3') })); s.scale.set(.26, .13, 1); return s; },
  };
  // input: drag to pan, wheel to zoom, click a clearing
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const pick = (e: MouseEvent) => { const b = cv.getBoundingClientRect(); ptr.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1); ray.setFromCamera(ptr, camera); const h = ray.intersectObjects(tops)[0]; return h ? (h.object.userData.r as number) : null; };
  const onClick = (e: MouseEvent) => { if (onDrag()) return; const r = pick(e); if (r !== null) onPick(r); };
  const onMove = (e: MouseEvent) => { const r = pick(e); cv.style.cursor = r !== null && rings[r].visible ? 'pointer' : 'grab'; };
  const onWheel = (e: WheelEvent) => { e.preventDefault(); view.zoom = Math.min(2.6, Math.max(0.75, view.zoom * Math.exp(-e.deltaY * 0.0015))); placeCamera(); };
  cv.addEventListener('click', onClick); cv.addEventListener('pointermove', onMove); cv.addEventListener('wheel', onWheel, { passive: false });
  const resize = () => { const w = cv.clientWidth, h = cv.clientHeight; if (w && h) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); } };
  const ro = new ResizeObserver(resize); ro.observe(cv); resize();
  const s: Scene3D = {
    board, rings, ringOn: R.map(() => ({ on: false, dest: false, sel: false })), pieces: new Map(), make,
    project(r) { const v = V3(R[r].x, R[r].y, .1).project(camera), b = cv.getBoundingClientRect(), x = b.left + (v.x + 1) / 2 * b.width, y = b.top + (1 - v.y) / 2 * b.height, k = 70 * view.zoom; return new DOMRect(x - k, y - k * .7, k * 2, k * 1.4); },
  };
  let raf = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    for (const [k, p] of s.pieces) {
      const t = Math.min(1, (now - p.t0) / 450), sc = p.dying ? 1 - t : t < 1 ? 1 + Math.sin(t * Math.PI) * .25 * (1 - t) - (1 - t) * (1 - t) : 1;
      p.obj.scale.setScalar(Math.max(0.001, sc * p.size));
      if (p.dying && t >= 1) { board.remove(p.obj); s.pieces.delete(k); }
    }
    rings.forEach((g, i) => { const st = s.ringOn[i]; (g.material as THREE.MeshBasicMaterial).opacity = st.dest ? .55 + .45 * Math.sin(now / 160) : 1; });
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  const pan = (dx: number, dy: number) => { const k = 0.012 / view.zoom; view.x = Math.max(-5, Math.min(5, view.x - dx * k)); view.z = Math.max(-4, Math.min(4, view.z - dy * k)); placeCamera(); };
  const dispose = () => {
    cancelAnimationFrame(raf); ro.disconnect();
    cv.removeEventListener('click', onClick); cv.removeEventListener('pointermove', onMove); cv.removeEventListener('wheel', onWheel);
    scene.traverse(x => { const mm = x as THREE.Mesh; mm.geometry?.dispose(); const mat = mm.material as THREE.Material & { map?: THREE.Texture }; mat?.map?.dispose(); mat?.dispose?.(); });
    renderer.dispose();
  };
  return { s, pan, dispose };
}

export default function Board3D() {
  const game = useGame(s => s.game), me = useGame(s => s.me), sel = useGame(s => s.selected), select = useGame(s => s.select), act = useGame(s => s.act);
  const mapKey = useGame(s => s.game?.map || (s.mode === 'online' ? s.room?.map : s.mapPick) || 'autumn');
  const cv = useRef<HTMLCanvasElement>(null), api = useRef<ReturnType<typeof build> | null>(null), drag = useRef({ moved: false, x: 0, y: 0, down: false });
  const [ready, setReady] = useState(0);
  const acts = useMemo(() => myActions(game, me), [game, me]);
  const dests = sel !== null ? acts.filter(a => a.type === 'move' && a.from === sel) : [];
  const click = useRef<(r: number) => void>(() => {});
  click.current = r => { const d = dests.find(a => a.to === r); if (d) act(d); else select(sel === r ? null : r); };

  // build the scene for this map; rebuild when the map changes
  useEffect(() => {
    const m = mapKey === 'random' ? E.MAPS.autumn : E.MAPS[mapKey] || MAP;
    api.current = build(cv.current!, m, r => click.current(r), () => drag.current.moved);
    setReady(x => x + 1);
    return () => { api.current?.dispose(); api.current = null; };
  }, [mapKey]);

  // mirror the game state: rings, pieces, flags
  useEffect(() => {
    const s = api.current?.s; if (!s) return;
    const actR = new Set<number>(); acts.forEach(a => { if (a.region !== undefined && a.type !== 'card') actR.add(a.region); if (a.from !== undefined) actR.add(a.from); });
    const destR = new Set(dests.map(a => a.to!));
    s.rings.forEach((g, i) => {
      const st = { on: actR.has(i) || destR.has(i) || sel === i, dest: destR.has(i), sel: sel === i };
      s.ringOn[i] = st; g.visible = st.on; (g.material as THREE.MeshBasicMaterial).color.set(st.sel ? '#ffffff' : '#ffe27a'); g.scale.setScalar(st.dest ? 1.03 : 1);
    });
    const want = new Map<string, { make: () => THREE.Object3D; pos: THREE.Vector3; size: number }>(), now = performance.now();
    if (game) MAP.regions.forEach((c, r) => {
      game.regions[r].b.forEach((b, k) => { const p = slotPos(r, k); want.set(`b-${r}-${k}-${b}`, { make: () => s.make.building(b), pos: V3(p.x, p.y, .1), size: 1.2 }); });
      for (const t of tokenLayout(game, r)) {
        want.set(t.key, { make: () => s.make.critter(t.f), pos: V3(t.x, t.y + 6, .1), size: 1.25 });
        if (t.extra) want.set(`n-${t.key}-${t.extra}`, { make: () => s.make.count(t.extra), pos: V3(t.x + 8, t.y + 6, .6), size: 1.2 });
      }
      const rl = E.ruler(game, r); if (rl) want.set(`f-${r}-${rl}`, { make: () => s.make.flag(rl), pos: V3(c.x + 56, c.y - 62, .1), size: 1 });
    });
    for (const [k, p] of s.pieces) if (!want.has(k) && !p.dying) { p.dying = true; p.t0 = now; }
    for (const [k, w] of want) {
      const p = s.pieces.get(k);
      if (p && !p.dying) { p.obj.position.copy(w.pos); continue; }
      if (p) s.board.remove(p.obj);
      const obj = w.make(); obj.position.copy(w.pos); obj.rotation.y = (k.length * 7 % 5 - 2) * .06; obj.scale.setScalar(.001);
      s.board.add(obj); s.pieces.set(k, { obj, t0: now, size: w.size });
    }
  });

  // the popup follows a clearing on screen through a virtual anchor
  const anchor = useMemo(() => (sel === null ? null : { getBoundingClientRect: () => api.current?.s.project(sel) ?? new DOMRect() }), [sel, ready]);
  return (
    <div className="board board3d"
      onPointerDown={e => { drag.current = { moved: false, x: e.clientX, y: e.clientY, down: true }; }}
      onPointerMove={e => { const d = drag.current; if (!d.down) return; if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return; d.moved = true; api.current?.pan(e.clientX - d.x, e.clientY - d.y); d.x = e.clientX; d.y = e.clientY; }}
      onPointerUp={() => { drag.current.down = false; }} onPointerCancel={() => { drag.current.down = false; }}>
      <canvas ref={cv} className="map" aria-label="Forest map in 3D" />
      {game && sel !== null && anchor && <ClearingPopup r={sel} anchor={anchor} key={sel} />}
    </div>
  );
}
