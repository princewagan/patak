import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { std, glow, canvasTex, halo, beam, pbr } from '../engine/kit.js';
import { Person } from '../engine/person.js';
import { animate, moveTo, walkPath } from '../engine/tween.js';

/*
  The jeepney stop across Aurora Blvd, seen out of the open back of your jeep in Part Two.
  Three jeeps wait at the far curb with their backs to you, lit inside. The sidewalk is full: a waiting shed, a sari-sari
  store, a fishball cart, a barker calling Cubao. Kids with the same envelopes and the same rag climb in, one jeep each,
  so it reads at a glance: what happened in your jeep is happening in all of them.

  Coordinates are the jeep scene's: road at y = -0.8, the jeep floors at y = 0, the far sidewalk is x -14.2 … -11.8.
  The whole set is one group; it slides with the street (group.position.z) once your jeep pulls away.
  Its four lights are borrowed from the jeep scene (see JeepStop.lights), so no shader recompiles at the cut.
*/
const PI = Math.PI;
const ROAD = -0.8, WALK = -0.62;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** pieces that never move, merged into one mesh per material */
class Parts {
  constructor() { this.by = new Map(); }
  add(geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
    const m = new THREE.Matrix4().compose(V(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V(...s));
    if (!this.by.has(mat)) this.by.set(mat, []);
    this.by.get(mat).push(geo.clone().applyMatrix4(m));
    return this;
  }
  box(w, h, d, mat, p, r) { return this.add(new THREE.BoxGeometry(w, h, d), mat, p, r); }
  cyl(rt, rb, h, mat, p, r, seg = 12) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, p, r); }
  plane(w, h, mat, p, r) { return this.add(new THREE.PlaneGeometry(w, h), mat, p, r); }
  build(parent) {
    for (const [mat, gs] of this.by) parent.add(new THREE.Mesh(mergeGeometries(gs), mat));
    this.by.clear(); return parent;
  }
}

/* ---------------- jeepneys ---------------- */
const LIVERIES = [
  { base: '#cfd3d6', stripe: ['#c0262d', '#f2c230', '#1f5fae'], ink: '#b3191b', ink2: '#ffffff', name: 'Joana', back: ['IN GOD', 'WE TRUST'], route: 'CUBAO · AURORA · MARIKINA', plate: 'TVK 6218' },
  { base: '#2b62a8', stripe: ['#f4f1e6', '#e23b2e', '#f2c230'], ink: '#ffffff', ink2: '#12305a', name: 'Lolo Ben', back: ['GOD BLESS', 'OUR TRIP'], route: 'CUBAO · AURORA · ANONAS', plate: 'TXA 3071' },
  { base: '#a82228', stripe: ['#f4f1e6', '#f2c230', '#1d8a4d'], ink: '#ffffff', ink2: '#4a0d10', name: 'Maricel', back: ['SLOW', 'DOWN'], route: 'CUBAO · STA. MESA · QUIAPO', plate: 'TVR 5540' },
];

function grime(c, w, h, from = 0.6) {
  const g = c.createLinearGradient(0, h * from, 0, h); g.addColorStop(0, 'rgba(40,30,20,0)'); g.addColorStop(1, 'rgba(40,30,20,.55)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(60,40,25,${Math.random() * .12})`; c.fillRect(Math.random() * w, h * from + Math.random() * h * (1 - from), 3 + Math.random() * 10, 2 + Math.random() * 6); }
}

/** the painted side: airbrushed stripes, the route in big letters, a chrome rivet line, road dirt low down */
function livery(L) {
  return canvasTex(1024, 300, (c, w, h) => {
    c.fillStyle = L.base; c.fillRect(0, 0, w, h);
    L.stripe.forEach((col, i) => {
      c.strokeStyle = col; c.lineWidth = 18 - i * 4; c.beginPath();
      const y = h * 0.64 + i * 22;
      c.moveTo(-10, y + 34); c.bezierCurveTo(w * 0.3, y - 46, w * 0.62, y + 56, w + 10, y - 24); c.stroke();
    });
    c.font = 'bold 66px "Barlow Condensed", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 9; c.strokeStyle = L.ink2; c.strokeText(L.route, w / 2, h * 0.3);
    c.fillStyle = L.ink; c.fillText(L.route, w / 2, h * 0.3);
    c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(0, 6, w, 5);
    for (let x = 12; x < w; x += 34) { c.beginPath(); c.arc(x, 21, 2.5, 0, PI * 2); c.fill(); }
    grime(c, w, h);
  });
}
/** the back: a name over the door, a blessing split across the two panels */
function rearArt(L, part) {
  return canvasTex(part === 'head' ? 512 : 160, part === 'head' ? 96 : 420, (c, w, h) => {
    c.fillStyle = L.base; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (part === 'head') {
      c.font = 'italic bold 64px Georgia, serif'; c.lineWidth = 6; c.strokeStyle = L.ink2; c.strokeText(L.name, w / 2, h / 2); c.fillStyle = L.ink; c.fillText(L.name, w / 2, h / 2);
    } else {
      L.stripe.forEach((col, i) => { c.fillStyle = col; c.fillRect(0, h * 0.62 + i * 16, w, 9); });
      c.font = 'bold 40px "Barlow Condensed", Impact, sans-serif'; c.fillStyle = L.ink; c.lineWidth = 5; c.strokeStyle = L.ink2;
      const t = L.back[part === 'L' ? 0 : 1]; c.strokeText(t, w / 2, h * 0.3); c.fillText(t, w / 2, h * 0.3);
      grime(c, w, h, 0.7);
    }
  });
}
/** public utility vehicles carry yellow plates */
function plateTex(text) {
  return canvasTex(256, 90, (c, w, h) => {
    c.fillStyle = '#f0c419'; c.fillRect(0, 0, w, h); c.strokeStyle = '#222'; c.lineWidth = 6; c.strokeRect(4, 4, w - 8, h - 8);
    c.fillStyle = '#151515'; c.font = 'bold 54px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 3);
  });
}

const M = {};
function mats() {
  if (M.chrome) return M;
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.25 });
  M.dark = std(0x1a1c1f, { rough: 0.7 });
  M.vinyl = std(0x6e1a1a, { rough: 0.5 });
  M.tire = std(0x121212, { rough: 0.9 });
  M.floor = pbr('metal_plate', { repeat: [1.5, 4], metal: 0.15, rough: 0.85, color: 0x8d9093 });
  // the inside reads as lit from across the road: a pale ceiling that gives off a little of the tube's light
  M.ceil = new THREE.MeshStandardMaterial({ color: 0xd9d5cc, roughness: 0.8, emissive: 0xcfdcea, emissiveIntensity: 0.35 });
  M.tube = glow(0xe8f2ff, 5);
  M.led = glow(0x9a46ff, 2.6);
  M.tail = glow(0xff2a1a, 3.2);
  M.head = glow(0xfff1d6, 4);
  M.glass = new THREE.MeshStandardMaterial({ color: 0x1b242c, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.55 });
  M.trapal = std(0x1f3a5a, { rough: 0.85 });
  M.flap = std(0x1a1a1a, { rough: 0.9 });
  M.steel = std(0x5d6670, { rough: 0.45, metal: 0.65 });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xe6e0cf, roughness: 0.9, side: THREE.DoubleSide });
  M.pile = std(0xe4ddcc, { rough: 0.95, emissive: 0xe4ddcc, ei: 0.12 });
  return M;
}

/** a whole jeepney, in the same frame as yours: floor y = 0, aisle along z, front at -z, open back at z = 2.2 */
function jeepney(L) {
  const { chrome, dark, vinyl, tire, floor, ceil, tube, led, tail, head, glass, trapal, flap } = mats();
  const G = new THREE.Group(), P = new Parts();
  const paint = std(new THREE.Color(L.base).getHex(), { rough: 0.42, metal: 0.35 });
  const side = new THREE.MeshStandardMaterial({ map: livery(L), roughness: 0.45, metalness: 0.25 });
  P.box(1.84, 0.06, 4.4, floor, [0, -0.03, 0]);
  P.box(1.7, 0.34, 6.4, dark, [0, -0.28, -1.0]);
  for (const sx of [-1, 1]) {
    P.box(0.03, 1.3, 4.4, paint, [sx * 0.93, 0.27, 0]);
    P.plane(4.4, 1.3, side, [sx * 0.948, 0.27, 0], [0, sx * PI / 2, 0]);
    P.box(0.38, 0.09, 4.0, vinyl, [sx * 0.67, 0.38, 0.05]);
    P.box(0.36, 0.34, 4.0, dark, [sx * 0.68, 0.17, 0.05]);
    P.box(0.07, 0.4, 4.0, vinyl, [sx * 0.86, 0.66, 0.05]);
    P.box(0.05, 0.035, 4.4, chrome, [sx * 0.935, 0.935, 0]);
    for (const z of [-2.15, -1.43, -0.71, 0, 0.71, 1.43, 2.15]) P.box(0.05, 0.5, 0.06, paint, [sx * 0.93, 1.19, z]);
    P.box(0.03, 0.12, 4.4, paint, [sx * 0.93, 1.47, 0]);
    P.cyl(0.05, 0.05, 4.3, trapal, [sx * 1.0, 1.4, 0], [PI / 2, 0, 0], 8);
    P.box(0.02, 0.02, 4.0, led, [sx * 0.7, 1.5, 0.05]);
    P.cyl(0.015, 0.015, 5.6, chrome, [sx * 0.86, 1.66, -0.75], [PI / 2, 0, 0], 6);   // roof rack
    // wheels, hubs, fenders, mud flaps
    for (const z of [1.35, -3.95]) {
      P.cyl(0.36, 0.36, 0.24, tire, [sx * 0.86, -0.44, z], [0, 0, PI / 2], 18);
      P.cyl(0.19, 0.19, 0.25, chrome, [sx * 0.86, -0.44, z], [0, 0, PI / 2], 14);
      P.box(0.3, 0.05, 0.95, paint, [sx * 0.86, -0.04, z]);
    }
    P.box(0.28, 0.32, 0.012, flap, [sx * 0.86, -0.62, 1.82]);
    // cab: low sides you climb over, the pillar, the mirror
    P.box(0.03, 0.75, 1.35, paint, [sx * 0.93, 0.17, -2.88]);
    P.box(0.05, 0.64, 0.06, paint, [sx * 0.93, 1.25, -3.5]);
    P.box(0.12, 0.17, 0.03, chrome, [sx * 1.12, 1.02, -3.42]);
    P.box(0.2, 0.015, 0.015, chrome, [sx * 1.02, 1.0, -3.44]);
  }
  P.box(2.02, 0.07, 5.95, paint, [0, 1.56, -0.68]);
  P.box(1.8, 0.02, 4.35, ceil, [0, 1.515, 0]);
  P.cyl(0.018, 0.018, 1.2, tube, [0, 1.49, -0.7], [PI / 2, 0, 0], 8);
  P.cyl(0.018, 0.018, 1.2, tube, [0, 1.49, 1.0], [PI / 2, 0, 0], 8);
  // the back: two panels, a header with her name, the step and the grab poles everyone holds
  for (const sx of [-1, 1]) {
    P.box(0.47, 1.85, 0.04, paint, [sx * 0.695, 0.545, 2.2]);
    P.plane(0.47, 1.25, new THREE.MeshStandardMaterial({ map: rearArt(L, sx < 0 ? 'L' : 'R'), roughness: 0.5, metalness: 0.2 }), [sx * 0.695, 0.25, 2.224]);
    P.cyl(0.016, 0.016, 1.55, chrome, [sx * 0.43, 0.55, 2.16], [0, 0, 0], 8);
    P.box(0.11, 0.22, 0.03, tail, [sx * 0.8, 0.04, 2.235]);
    P.box(0.04, 0.3, 0.04, dark, [sx * 0.4, -0.17, 2.32]);
  }
  P.box(1.86, 0.18, 0.04, paint, [0, 1.38, 2.2]);
  P.plane(0.9, 0.17, new THREE.MeshStandardMaterial({ map: rearArt(L, 'head'), roughness: 0.5 }), [0, 1.38, 2.224]);
  P.cyl(0.014, 0.014, 0.86, chrome, [0, 1.27, 2.16], [0, 0, PI / 2], 8);
  P.box(0.4, 0.05, 0.03, tail, [0, 1.51, 2.226]);
  P.box(0.95, 0.045, 0.32, chrome, [0, -0.33, 2.38]);
  P.plane(0.38, 0.13, new THREE.MeshStandardMaterial({ map: plateTex(L.plate), roughness: 0.5 }), [0, -0.17, 2.226]);
  // front: divider, dashboard, windshield, hood, grille, bumper, lamps, the chrome horses
  P.box(1.86, 0.5, 0.05, paint, [0, 0.47, -2.2]);
  P.box(1.86, 0.5, 0.5, dark, [0, 0.25, -3.3]);
  P.box(1.5, 0.5, 1.25, paint, [0, 0.06, -4.17]);
  P.box(1.0, 0.45, 0.04, chrome, [0, 0.03, -4.8]);
  P.box(1.95, 0.12, 0.14, chrome, [0, -0.3, -4.86]);
  for (const sx of [-1, 1]) { P.cyl(0.08, 0.08, 0.04, head, [sx * 0.55, 0.12, -4.81], [PI / 2, 0, 0], 12); P.box(0.04, 0.17, 0.2, chrome, [sx * 0.4, 0.4, -4.45]); }
  P.build(G);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.78, 0.62), glass); ws.position.set(0, 1.18, -3.52); ws.rotation.set(-0.12, PI, 0); G.add(ws);
  // tail lights glow through the rain
  for (const sx of [-1, 1]) { const h = halo(0xff2a1a, 0.75, 0.65); h.position.set(sx * 0.8, 0.04, 2.3); G.add(h); }
  const hb = halo(0xff2a1a, 0.6, 0.45); hb.position.set(0, 1.51, 2.28); G.add(hb);
  const th = halo(0xdcebff, 1.1, 0.35); th.position.set(0, 1.45, 1.0); G.add(th);
  return G;
}

/* ---------------- the sidewalk ---------------- */
/** a lit shopfront: the wall, the sign, the bright inside behind a grille. Returns { map, em } */
function shopTex(kind) {
  const draw = (c, w, h, em) => {
    const k = em ? 0 : 1;
    c.fillStyle = em ? '#000' : '#bdb39b'; c.fillRect(0, 0, w, h);
    if (!em) for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(50,45,35,${0.08 + Math.random() * 0.12})`; c.fillRect(Math.random() * w, Math.random() * h * 0.3, 4 + Math.random() * 16, h); }
    // sign band
    const sc = kind === 'sari' ? '#c3262b' : '#1d6b3c';
    c.fillStyle = em ? 'rgba(120,70,50,1)' : sc; c.fillRect(0, 20, w, 120);
    c.fillStyle = em ? '#3a3a3a' : '#fff'; c.font = 'bold 66px "Barlow Condensed", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(kind === 'sari' ? "ALING TESS SARI-SARI STORE" : 'CARINDERIA · LUTONG BAHAY', w / 2, 82);
    // the inside, warm and bright
    const x0 = 90, y0 = 190, x1 = w - 90, y1 = h - 90;
    const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, '#ffe7b8'); g.addColorStop(1, '#e9b874');
    c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (kind === 'sari') {
      // shelves packed with goods, sachet strips hanging down the front
      for (const sy of [y0 + 110, y0 + 220, y0 + 330]) {
        c.fillStyle = '#6b4a2b'; c.fillRect(x0, sy, x1 - x0, 10);
        for (let x = x0 + 4; x < x1 - 20; x += 14 + Math.random() * 10) { c.fillStyle = `hsl(${Math.random() * 360},${55 + Math.random() * 30}%,${40 + Math.random() * 25}%)`; const bh = 30 + Math.random() * 60; c.fillRect(x, sy - bh, 10 + Math.random() * 10, bh); }
      }
      for (let i = 0; i < 16; i++) { const x = x0 + 30 + i * (x1 - x0 - 60) / 15, hue = Math.random() * 360; for (let j = 0; j < 9; j++) { c.fillStyle = `hsl(${hue + (j % 2) * 30},70%,${45 + (j % 2) * 15}%)`; c.fillRect(x - 9, y0 + 6 + j * 15, 18, 13); } }
      // the grille, with the little window where you pay
      c.fillStyle = em ? '#000' : '#2f3b2a';
      for (let x = x0; x <= x1; x += 26) if (!(x > w / 2 - 90 && x < w / 2 + 90)) c.fillRect(x, y0, 5, y1 - y0); else c.fillRect(x, y0, 5, y1 - y0 - 120);
      for (let y = y0; y <= y1; y += 70) c.fillRect(x0, y, x1 - x0, 5);
      if (!em) { c.fillStyle = '#f4f1e8'; c.fillRect(x1 - 210, y0 + 20, 180, 56); c.fillStyle = '#111'; c.font = 'bold 26px Inter, sans-serif'; c.fillText('BAWAL ANG UTANG', x1 - 120, y0 + 48); }
    } else {
      // a counter of pots under a glass case, a menu board, a ceiling fan's shadow
      c.fillStyle = '#7a5434'; c.fillRect(x0, y1 - 120, x1 - x0, 120);
      for (let i = 0; i < 7; i++) { const x = x0 + 70 + i * (x1 - x0 - 140) / 6; c.fillStyle = '#9aa0a6'; c.beginPath(); c.ellipse(x, y1 - 130, 48, 18, 0, 0, PI * 2); c.fill(); c.fillStyle = ['#7a3b1a', '#c4892f', '#3e6b2f', '#8a2a1a', '#d9b25a', '#5a3a22', '#b0562a'][i]; c.beginPath(); c.ellipse(x, y1 - 132, 40, 13, 0, 0, PI * 2); c.fill(); }
      if (!em) { c.fillStyle = '#1f2a22'; c.fillRect(x0 + 40, y0 + 30, 300, 170); c.fillStyle = '#e8e2c8'; c.font = 'bold 28px "Barlow Condensed", sans-serif'; c.textAlign = 'left'; ['ADOBO ........ 70', 'SINIGANG .... 75', 'GINISANG MONGGO 45', 'KANIN ........ 15'].forEach((t, i) => c.fillText(t, x0 + 60, y0 + 64 + i * 38)); c.textAlign = 'center'; }
    }
    if (!em) { c.strokeStyle = '#3a3128'; c.lineWidth = 10; c.strokeRect(x0, y0, x1 - x0, y1 - y0); }
    void k;
  };
  return { map: canvasTex(1024, 660, (c, w, h) => draw(c, w, h, false)), em: canvasTex(1024, 660, (c, w, h) => draw(c, w, h, true)) };
}

function shopfront(kind, z0, len, P, G) {
  const { map, em } = shopTex(kind);
  const face = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 0.85, roughness: 0.85 });
  const wall = std(0x8d857a, { rough: 0.95 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 3.0, len), [face, wall, wall, wall, wall, wall]);
  b.position.set(-14.62, WALK + 1.5, z0 + len / 2); G.add(b);
  // a tarp awning out over the sidewalk, and the bulb under it
  const tarp = std(kind === 'sari' ? 0x2f5f9e : 0xb8452e, { rough: 0.8, side: THREE.DoubleSide });
  P.box(1.5, 0.03, len, tarp, [-13.4, WALK + 2.5, z0 + len / 2], [0, 0, -0.22]);
  for (const z of [z0 + 0.15, z0 + len - 0.15]) P.cyl(0.02, 0.02, 2.2, mats().steel, [-12.7, WALK + 1.1, z]);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glow(0xffe3b0, 5)); bulb.position.set(-13.6, WALK + 2.25, z0 + len / 2); G.add(bulb);
  const h = halo(0xffd9a0, 1.6, 0.6); h.position.copy(bulb.position); G.add(h);
}

function tarpTex(lines, bg, fg) {
  return canvasTex(768, 300, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach(([t, f], i) => { c.font = f; c.fillText(t, w / 2, h * (i + 1) / (lines.length + 1)); });
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(40,30,20,${Math.random() * 0.06})`; c.fillRect(Math.random() * w, Math.random() * h, 4, 4); }
  });
}

/** the steel waiting shed every jeep stop has, with a bench and a fluorescent tube */
function shed(z0, len, P, G) {
  const { steel } = mats();
  const roofM = pbr('corrugated_iron_02', { repeat: [2, 1], color: 0x9aa3a8, metal: 0.6, rough: 0.6 });
  for (const x of [-13.85, -12.35]) for (const z of [z0 + 0.1, z0 + len - 0.1]) P.cyl(0.035, 0.035, 2.45, steel, [x, WALK + 1.22, z], [0, 0, 0], 8);
  P.box(1.9, 0.04, len + 0.3, roofM, [-13.1, WALK + 2.45, z0 + len / 2], [0, 0, -0.08]);
  P.box(0.42, 0.05, len - 0.5, steel, [-13.55, WALK + 0.43, z0 + len / 2]);
  for (const z of [z0 + 0.5, z0 + len - 0.5]) P.box(0.05, 0.42, 0.05, steel, [-13.55, WALK + 0.21, z]);
  const back = new THREE.MeshStandardMaterial({ map: tarpTex([['INGAT SA BIYAHE!', 'bold 72px "Barlow Condensed", sans-serif'], ['Mula sa Pamunuan ng Barangay', '36px Barlow, sans-serif']], '#f1ece0', '#1d3f8f'), roughness: 0.8 });
  P.plane(len - 0.3, 1.3, back, [-13.88, WALK + 1.55, z0 + len / 2], [0, PI / 2, 0]);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 1.2, 8), glow(0xe8f2ff, 5)); t.rotation.x = PI / 2; t.position.set(-13.1, WALK + 2.36, z0 + len / 2); G.add(t);
  const h = halo(0xdcebff, 1.5, 0.5); h.position.copy(t.position); G.add(h);
}

/** sodium lamp on a concrete pole leaning out over the road */
function lampPost(x, z, P, G) {
  const pole = std(0x8d8a83, { rough: 0.9 });
  P.cyl(0.09, 0.13, 7.2, pole, [x, WALK + 3.6, z]);
  P.box(1.7, 0.09, 0.09, pole, [x + 0.8, WALK + 6.95, z]);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.13, 0.26), glow(0xffa040, 4)); head.position.set(x + 1.6, WALK + 6.88, z); G.add(head);
  const h = halo(0xffa850, 3.2, 0.9); h.position.copy(head.position); G.add(h);
  const b = beam(0xffb060, { radius: 3.4, length: 7.2, intensity: 0.06, top: 0.15 }); b.position.copy(head.position); G.add(b);
  return b;
}

/** the fishball cart: steel box on bicycle wheels, a wok of oil, a striped umbrella and one bright bulb */
function kariton(x, z, P, G) {
  const { steel, dark } = mats();
  P.box(0.55, 0.55, 1.05, steel, [x, WALK + 0.68, z]);
  P.box(0.58, 0.03, 1.1, std(0x6b4a2b, { rough: 0.8 }), [x, WALK + 0.97, z]);
  for (const dz of [-0.4, 0.4]) P.add(new THREE.TorusGeometry(0.26, 0.025, 6, 20), dark, [x + 0.3, WALK + 0.27, z + dz], [0, PI / 2, 0]);
  P.add(new THREE.SphereGeometry(0.22, 16, 8, 0, PI * 2, PI / 2, PI / 2), std(0x2a2826, { metal: 0.6, rough: 0.4 }), [x - 0.05, WALK + 1.18, z + 0.2]);
  P.cyl(0.2, 0.2, 0.01, new THREE.MeshStandardMaterial({ color: 0x5a3a12, roughness: 0.05, metalness: 0.2 }), [x - 0.05, WALK + 1.12, z + 0.2], [0, 0, 0], 16);
  P.box(0.3, 0.22, 0.38, new THREE.MeshStandardMaterial({ color: 0xcfe0e8, roughness: 0.05, transparent: true, opacity: 0.35 }), [x, WALK + 1.1, z - 0.25]);
  P.cyl(0.11, 0.11, 0.35, std(0x2a5a8a, { rough: 0.5 }), [x - 0.15, WALK + 0.2, z - 0.3]);   // LPG tank underneath
  P.cyl(0.02, 0.02, 2.0, steel, [x - 0.22, WALK + 1.6, z]);
  const stripes = canvasTex(256, 256, (c, w, h) => { for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? '#f2efe6' : ['#c0262d', '#1f5fae', '#f2c230'][i % 3]; c.beginPath(); c.moveTo(w / 2, h / 2); c.arc(w / 2, h / 2, w, i / 12 * PI * 2, (i + 1) / 12 * PI * 2); c.fill(); } });
  const can = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.42, 12, 1, true), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.7, side: THREE.DoubleSide }));
  can.position.set(x - 0.22, WALK + 2.55, z); G.add(can);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), glow(0xfff0d0, 6)); bulb.position.set(x - 0.1, WALK + 2.05, z); G.add(bulb);
  const h = halo(0xfff0d0, 1.4, 0.75); h.position.copy(bulb.position); G.add(h);
  return V(x - 0.05, WALK + 1.2, z + 0.2);   // the wok, for the vendor's hand
}

/* ---------------- props people carry ---------------- */
function umbrella(color) {
  const G = new THREE.Group(), R = 0.55, T = PI * 0.36;
  const g = new THREE.SphereGeometry(R, 24, 6, 0, PI * 2, 0, T), p = g.attributes.position;
  // the cloth sags between the eight ribs, so the edge is scalloped
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), pol = Math.acos(Math.min(1, y / R)) / T, ph = Math.atan2(z, x); p.setY(i, y - 0.05 * pol * pol * (0.5 + 0.5 * Math.cos(8 * ph))); }
  g.computeVertexNormals();
  const can = new THREE.Mesh(g, std(color, { rough: 0.55, side: THREE.DoubleSide })); can.scale.y = 0.6; can.position.y = 0.6; G.add(can);
  const sm = std(0x222222, { metal: 0.6, rough: 0.4 });
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.98, 6), sm); sh.position.y = 0.47; G.add(sh);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.07, 6), sm); tip.position.y = 0.97; G.add(tip);
  const grip = new THREE.Object3D(); grip.position.y = 0.02; G.add(grip); G.userData.grip = grip;
  return G;
}
function phoneProp() {
  const G = new THREE.Group();
  G.add(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.009), std(0x15171b, { rough: 0.3, metal: 0.4 })));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(0.062, 0.13), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfd6ff).multiplyScalar(1.6), side: THREE.DoubleSide }));
  s.position.z = 0.006; G.add(s);
  G.position.set(0, -0.09, 0.03); return G;
}
function bagProp() {
  const g = new THREE.SphereGeometry(0.11, 10, 8), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.18 * Math.sin(x * 40 + y * 31) * Math.cos(z * 37); p.setXYZ(i, x * k, y * k * 1.3, z * k * 0.8); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, std([0xe8e4dc, 0xd9a3b6, 0x3a3a3a][Math.floor(Math.random() * 3)], { rough: 0.45 })); m.position.set(0, -0.2, 0); return m;
}
function backpack(s) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.3 * s, 0.38 * s, 0.14 * s), std(0x22262c, { rough: 0.8 })); m.position.set(0, -0.06, -0.17 * s); return m; }
/** the envelopes a kid carries: a little pile gripped upright in the left hand */
function pile() {
  const P = new Parts(), G = new THREE.Group();
  for (let i = 0; i < 11; i++) P.box(0.0016, 0.16, 0.1, mats().pile, [-i * 0.0019, 0, 0], [(i - 5) * 0.012, 0, 0]);
  P.build(G); G.position.set(-0.012, -0.08, 0.03); return G;
}
function rag() {
  const g = new THREE.IcosahedronGeometry(0.05, 3), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.22 * Math.sin(x * 60 + y * 41) * Math.cos(z * 53 + x * 23); p.setXYZ(i, x * k * 1.25, y * k * 0.5, z * k); }
  g.computeVertexNormals(); return new THREE.Mesh(g, std(0x6d6a63, { rough: 1 }));
}

/* ---------------- who is there ---------------- */
// the three jeeps: x of the aisle, z of the open back
const JEEPS = [{ x: -9.8, zr: 9.0 }, { x: -9.85, zr: 19.0 }, { x: -9.9, zr: 28.8 }];
// seated inside: [jeep, side (1 = curb bench), how far forward from the back (m), model, height, extra]
const RIDERS = [
  [0, 1, 0.3, 'commuter', 1.6], [0, 1, 1.05, 'tatay', 1.68, 'doze'], [0, 1, 1.75, 'joy', 1.56, 'phone'], [0, -1, 0.55, 'keira', 1.58], [0, -1, 2.0, 'driver', 1.68],
  [1, 1, 0.4, 'tindera', 1.55], [1, 1, 1.15, 'mark', 1.72, 'phone'], [1, -1, 0.7, 'weng', 1.56], [1, -1, 1.7, 'kuya', 1.7, 'doze'],
  [2, 1, 0.5, 'nanay', 1.54],
];
// on the sidewalk: [x, z, model, height, what they're doing]
const CROWD = [
  [-13.5, 9.1, 'nanay', 1.54, 'sit'], [-13.5, 10.0, 'tatay', 1.68, 'sitPhone'], [-13.5, 11.0, 'tindera', 1.55, 'sitSlump'],
  [-12.7, 9.0, 'commuter', 1.6, 'phone'], [-12.95, 10.45, 'kuya', 1.7, 'armsCrossed'], [-12.45, 11.25, 'keira', 1.58, 'bag'],
  [-11.3, 9.3, 'mark', 1.72, 'backpack'],                                    // he boards first
  [-13.15, 7.0, 'driver', 1.66, 'vendor'], [-11.98, 6.75, 'anak', 1.45, 'eat'], [-12.0, 7.6, 'weng', 1.56, 'umbrella', 0x1c2a44],
  [-12.4, 5.6, 'prince', 1.72, 'umbrella', 0x111111], [-13.62, 4.9, 'joy', 1.56, 'buy'], [-12.85, 4.3, 'panganay', 1.5, 'bag'],
  [-12.05, 8.35, 'nanay', 1.52, 'umbrella', 0x5a1a22],
  [-12.5, 13.6, 'commuter', 1.6, 'umbrella', 0x1f3b2a], [-13.1, 14.9, 'tatay', 1.66, 'stand'], [-12.4, 22.6, 'mark', 1.7, 'umbrella', 0x2a2a30], [-12.9, 24.3, 'tindera', 1.55, 'stand'],
];

export class JeepStop {
  constructor() {
    const G = this.group = new THREE.Group(), P = new Parts();
    this.people = []; this.idle = [];
    // jeepneys, backs to you, lit inside
    this.jeeps = JEEPS.map((j, i) => {
      const g = jeepney(LIVERIES[i]); g.rotation.y = PI; g.position.set(j.x, 0, j.zr + 2.2); G.add(g);
      return { ...j, g };
    });
    // the sidewalk
    shopfront('sari', 3.2, 4.4, P, G);
    shopfront('carinderia', 13.2, 4.6, P, G);
    shed(8.4, 4.0, P, G);
    this.lampBeam = lampPost(-11.95, 12.9, P, G);
    this.wok = kariton(-12.5, 7.0, P, G);
    const signM = new THREE.MeshStandardMaterial({ map: tarpTex([['LOADING &', 'bold 80px "Barlow Condensed", sans-serif'], ['UNLOADING ZONE', 'bold 80px "Barlow Condensed", sans-serif']], '#1d4fa0', '#ffffff'), roughness: 0.5 });
    P.cyl(0.03, 0.03, 2.6, mats().steel, [-11.95, WALK + 1.3, 8.0], [0, 0, 0], 8);
    P.plane(0.62, 0.42, signM, [-11.93, WALK + 2.35, 8.0], [0, PI / 2 - 0.5, 0]);
    P.build(G);

    // riders
    this.riders = RIDERS.map(([ji, sd, back, real, h, extra]) => {
      const J = this.jeeps[ji], p = this.person(real, h);
      p.pose(extra === 'doze' ? 'sitSlump' : 'sit', true);
      p.set({ shL: [-26, 0, 6], elL: [-58, 0, 0], shR: [-26, 0, -6], elR: [-58, 0, 0] }, true);
      if (extra === 'doze') p.set({ neck: [38, 0, 6] }, true);
      if (extra === 'phone') { p.set({ shL: [-30, 0, 10], elL: [-112, 10, 0], neck: [26, 0, 0] }, true); p.arm.L.wr.add(phoneProp()); }
      p.root.position.set(J.x - sd * 0.73, 0, J.zr + back); p.root.rotation.y = sd * PI / 2;
      p.jeep = ji; p.side = sd;
      return p;
    });

    // the crowd
    this.crowd = CROWD.map(([x, z, real, h, what, color]) => {
      const p = this.person(real, h), s = p.s, hs = 0.9 * h;
      p.root.position.set(x, WALK, z);
      p.root.rotation.y = what === 'buy' ? -PI / 2 : what === 'vendor' ? PI / 2 : Math.atan2(-9.5 - x, 1.2) + (Math.random() - 0.5) * 0.5;
      if (what.startsWith('sit')) { p.pose(what === 'sitSlump' ? 'sitSlump' : 'sit', true); p.root.rotation.y = PI / 2; p.set({ shL: [-26, 0, 6], elL: [-58, 0, 0], shR: [-26, 0, -6], elR: [-58, 0, 0] }, true); }
      if (what === 'sitPhone') { p.set({ shL: [-30, 0, 10], elL: [-112, 10, 0], neck: [26, 0, 0] }, true); p.arm.L.wr.add(phoneProp()); }
      if (what === 'phone') { p.pose('phone', true); p.arm.L.wr.add(phoneProp()); }
      if (what === 'armsCrossed') p.pose('armsCrossed', true);
      if (what === 'bag') p.arm.L.wr.add(bagProp());
      if (what === 'backpack') p.chest.add(p.pack = backpack(s));
      if (what === 'umbrella') {
        const u = umbrella(color); u.position.set(-0.12 * s, 0.6 * hs, 0.2 * s); u.rotation.set(-0.12, 0, 0.06 + Math.random() * 0.08); p.root.add(u);
        p.reach('R', u.userData.grip, { rate: 40, pole: [-1, -1, -0.3] }); p.umbrella = u;
      }
      if (what === 'eat') { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.22, 4), std(0xc9b48a)); st.position.set(0, -0.12, 0.02); st.rotation.x = 0.4; p.arm.R.wr.add(st); }
      p.what = what;
      this.idle.push(p);
      return p;
    });
    this.boarder = this.crowd[6];
    this.vendor = this.crowd[7];
    this.eater = this.crowd[8];
    // two who are talking under the shed
    this.pair = [this.crowd[4], this.crowd[5]];

    // walkers
    this.walkers = [this.person('commuter', 1.62), this.person('prince', 1.7)];
    { const u = umbrella(0x26262c), w = this.walkers[0]; u.position.set(-0.12 * w.s, 0.6 * 0.9 * 1.62, 0.2 * w.s); u.rotation.set(-0.12, 0, 0.08); w.root.add(u); w.reach('R', u.userData.grip, { rate: 40, pole: [-1, -1, -0.3] }); }

    // the barker: on the road at the back of the first jeep, calling out the route
    this.barker = this.person('kuya', 1.7);

    // the kids: same envelopes, same rag
    this.kids = [['batang1', 1.22], ['batang2', 1.12], ['batang3', 1.16]].map(([real, h]) => {
      const k = this.person(real, h, { skin: 'brown', build: 0.8 });
      k.stack = pile(); k.arm.L.wr.add(k.stack);
      k.rag = rag(); k.arm.R.wr.add(k.rag); k.rag.position.set(0, -0.085, 0.015);
      k.hold = { shL: [-24, 0, 12], elL: [-92, 0, 0] };
      return k;
    });

    // envelopes the kids leave on laps
    this.envs = Array.from({ length: 3 }, () => { const e = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), mats().paper); e.visible = false; G.add(e); return e; });

    for (const p of this.people) G.add(p.root);
    G.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    // where the borrowed lights go, in the set's own coordinates
    this.lightAt = { lamp: V(-10.6, 5.7, 12.9), shop: V(-9.3, 2.3, 7.2), a: V(JEEPS[0].x, 1.3, JEEPS[0].zr + 0.5), b: V(JEEPS[1].x, 1.3, JEEPS[1].zr + 0.5) };
    G.visible = false;
  }

  person(real, h, o = {}) {
    const p = new Person({ real, h, build: 1, ...o });
    this.people.push(p); return p;
  }

  /** set-local → world (the set never turns, it only shifts) */
  w(x, y, z) { return V(x, y, z).add(this.group.position); }

  /** the four lights the jeep scene lends us: { lamp, shop, a, b } → PointLights. Saves what they were. */
  borrow(lights) {
    this.lights = lights;
    this.saved = Object.fromEntries(Object.entries(lights).map(([k, l]) => [k, { color: l.color.clone(), distance: l.distance, decay: l.decay, pos: l.position.clone(), intensity: l.intensity }]));
    const set = (l, c, i, d, dec) => { l.color.set(c); l.intensity = i; l.distance = d; l.decay = dec; };
    set(lights.lamp, 0xffa24a, 34, 19, 1.3);
    set(lights.shop, 0xffd7a0, 8, 8, 1.4);   // behind the first jeep, road side: it catches the kids at the step
    set(lights.a, 0xdcebff, 3.2, 4.6, 1.3);
    set(lights.b, 0xdcebff, 3.2, 4.6, 1.3);
    this.placeLights();
  }
  giveBack() {
    if (!this.lights) return;
    for (const [k, l] of Object.entries(this.lights)) { const s = this.saved[k]; l.color.copy(s.color); l.distance = s.distance; l.decay = s.decay; l.position.copy(s.pos); l.intensity = s.intensity; }
    this.lights = null;
  }
  placeLights() { if (this.lights) for (const k in this.lightAt) this.lights[k].position.copy(this.lightAt[k]).add(this.group.position); }

  /** everyone back to their marks */
  reset(shift = 0) {
    const B = this.barker;
    this.group.position.set(shift, 0, 0);
    B.root.position.set(-11.4, ROAD, 8.05); B.root.rotation.y = -2.3; B.pose('stand', true);
    B.anim = (t, q) => {
      // he calls in bursts: arm up, hand flapping toward the jeep, then a breath
      const k = THREE.MathUtils.smoothstep(Math.sin(t * 0.95), -0.1, 0.4);
      q.arm.R.sh.rotation.x = THREE.MathUtils.lerp(q.arm.R.sh.rotation.x, -2.55, k); q.arm.R.sh.rotation.z = THREE.MathUtils.lerp(q.arm.R.sh.rotation.z, -0.35, k);
      q.arm.R.el.rotation.x = THREE.MathUtils.lerp(q.arm.R.el.rotation.x, -0.35 - 0.55 * (0.5 + 0.5 * Math.sin(t * 8)), k);
      q.neck.rotation.y += 0.25 * Math.sin(t * 0.5); q.talking = k > 0.5;
    };
    const bo = this.boarder; bo.root.position.set(-11.3, ROAD, 9.3); bo.pose('stand', true); bo.root.rotation.y = 2.6; bo.pack?.position.set(0, -0.06, -0.17 * bo.s);
    const [kA, kB, kC] = this.kids;
    for (const k of this.kids) { k.pose('stand', true); k.set(k.hold, true); k.look(null); k.reach('L', null); k.reach('R', null); k.stack.visible = true; }
    kA.root.position.set(-12.0, WALK, 10.4); kA.root.rotation.y = 2.4;
    kB.root.position.set(-8.45, ROAD, 11.2); kB.root.rotation.y = 0;
    kC.root.position.set(-8.5, ROAD, 24.6); kC.root.rotation.y = 0;
    this.walkers[0].root.position.set(-12.9, WALK, -1.8); this.walkers[0].root.rotation.y = 0;
    this.walkers[1].root.position.set(-12.05, WALK, 13.1); this.walkers[1].root.rotation.y = 0;
    this.envs.forEach(e => (e.visible = false));
    // the vendor stirs, the eater eats
    const wok = this.wok;
    this.vendor.reach('R', () => this.w(wok.x + 0.04 * Math.cos(this.t * 3.1), wok.y + 0.06, wok.z + 0.07 * Math.sin(this.t * 3.1)), { rate: 20, pole: [-1, -1, -0.4] });
    this.vendor.set({ spine: [14, 0, 0], neck: [26, 0, 0] }, true);
    this.eater.anim = (t, q) => { const k = 0.5 + 0.5 * Math.sin(t * 1.3); q.arm.R.sh.rotation.x -= 0.9 * k; q.arm.R.el.rotation.x -= 1.5 * k; q.neck.rotation.x -= 0.1 * k; };
    // everyone else just waits: weight shifting from foot to foot, a look around now and then
    this.idle.forEach((p, i) => {
      if (p === this.eater) return;
      const ph = i * 1.7;
      p.anim = (t, q) => { const a = t * 0.33 + ph; q.hips.position.x += Math.sin(a) * 0.012 * q.s; q.hips.rotation.z += Math.sin(a) * 0.02; q.spine.rotation.z -= Math.sin(a) * 0.024; };
      p.nextLook = Math.random() * 2;
    });
    this.t = 0;
    for (let i = 0; i < 6; i++) for (const p of this.people) p.update(0.05, i * 0.05);
  }

  update(dt, t) {
    this.t = t;
    // heads turn: toward the barker, the jeeps, the road, or nowhere in particular
    for (const p of this.idle) {
      if (p === this.vendor || p === this.eater || p.busy) continue;
      p.nextLook -= dt;
      if (p.nextLook < 0) {
        p.nextLook = 2 + Math.random() * 4;
        const r = Math.random();
        p.look(r < 0.3 ? this.barker.head : r < 0.6 ? this.w(-9.8, 0.8, 9 + Math.random() * 12) : r < 0.8 ? this.w(-7, 0.6, p.root.position.z - 6 + Math.random() * 12) : null, 0.7);
      }
    }
    const talk = Math.floor(t / 1.6) % 3;
    this.pair[0].talking = talk === 0; this.pair[1].talking = talk === 1;
    if (talk !== 2) { this.pair[0].look(this.pair[1].head, 0.8); this.pair[1].look(this.pair[0].head, 0.8); }
    this.lampBeam.userData.tick(t);
    for (const p of this.people) p.update(dt, t);
    this.placeLights();
  }

  /* ---------------- what happens ---------------- */

  /** up the step at the back and in: a hand on the pole, one foot, then the other. Adults duck under the header. */
  async climb(p, J, wait, duck = 0) {
    const x = J.x, zr = J.zr;
    p.turnTo = 0; p.look(this.w(x, 0.9, zr + 1.6), 0.6);
    p.reach('R', () => this.w(x - 0.43, 0.3, zr - 0.04), { rate: 7, pole: [-1, -0.4, -0.3] });
    await wait(0.4);
    p.set({ hpR: [-72, 0, 0], knR: [98, 0, 0], spine: [14, 0, 0] });
    await wait(0.2);
    await moveTo(p.root, [x - 0.06, -0.31, zr - 0.17], 0.42);
    p.set({ hpR: [-8, 0, 0], knR: [6, 0, 0], hpL: [-66, 0, 0], knL: [96, 0, 0], spine: [duck * 0.6, 0, 0] });
    await wait(0.2);
    await moveTo(p.root, [x - 0.04, 0, zr + 0.3], 0.44);
    p.set({ hpL: [0, 0, 0], knL: [0, 0, 0], spine: [duck, 0, 0], neck: [-duck * 0.4, 0, 0] });
    p.reach('R', null, { rate: 5 });
    await wait(0.15);
  }

  /** what Totoy did, here too: an envelope on the lap, then the rag on the shoes */
  async serve(k, rider, env, wait, dur = 3.2) {
    const s = this.spots(rider), f = rider.side;          // f: +1 the rider faces +x (curb bench)
    const kx = s.feet.x + f * 0.3;
    await walkPath(k, [[kx, 0, s.feet.z - 0.04]], 0.7);
    k.turnTo = f > 0 ? -PI / 2 : PI / 2;
    k.look(this.w(s.lap.x, s.lap.y, s.lap.z), 0.8);
    k.set({ spine: [28, 0, 0], neck: [6, 0, 0] });
    await wait(0.3);
    // the envelope goes from the pile in his hand onto the lap
    k.reach('L', () => this.w(s.lap.x + f * 0.07, s.lap.y + 0.08, s.lap.z), { rate: 9, pole: [1, -0.4, -0.6] });
    await wait(0.35);
    const a = new THREE.Vector3();
    env.visible = true;
    await animate(t => {
      k.stack.getWorldPosition(a).sub(this.group.position);
      env.position.lerpVectors(a, s.lap, t); env.position.y += Math.sin(t * PI) * 0.04;
      env.rotation.set(-PI / 2 * t, 0, (f > 0 ? -1 : 1) * 0.3 * t);
    }, 0.5, 'inOut');
    k.reach('L', null, { rate: 7 }); k.set(k.hold);
    // down on his knees at the shoes, rag in hand
    k.pose('kneelDown'); k.set(k.hold); k.look(this.w(s.feet.x, 0.1, s.feet.z), 0.7);
    await wait(0.3);
    const t0 = this.t;
    k.reach('R', () => {
      const now = this.t - t0, m = THREE.MathUtils.smoothstep((now % 2.4) / 2.4, 0.42, 0.58);
      return this.w(s.feet.x + f * (0.07 + Math.sin(now * 5.5) * 0.02), 0.13 + Math.abs(Math.sin(now * 13)) * 0.012, s.feet.z + (m - 0.5) * 0.2 + Math.sin(now * 13) * 0.04);
    }, { rate: 11, pole: [-1, -0.6, -0.5] });
    await wait(dur);
  }

  /** where a seated rider's lap and shoes are, in set coordinates */
  spots(p) {
    const R = p.real, f = p.side, q = new THREE.Vector3(), g = this.group.position;
    const wp = o => { o.updateWorldMatrix(true, false); return q.setFromMatrixPosition(o.matrixWorld).clone().sub(g); };
    if (R) {
      const lap = wp(R.thigh.L).lerp(wp(R.calf.L), 0.6).lerp(wp(R.thigh.R).lerp(wp(R.calf.R), 0.6), 0.5); lap.y += 0.095 * p.s;
      const feet = wp(R.foot.L).lerp(wp(R.foot.R), 0.5); feet.x += f * 0.08;
      return { lap, feet };
    }
    const r = p.root.position;
    return { lap: V(r.x + f * 0.25, 0.5, r.z), feet: V(r.x + f * 0.45, 0.07, r.z) };
  }

  /** the whole beat, as seen from your seat. Resolves when the last kid is down at someone's shoes. */
  async play(D, cast) {
    const wait = s => D.wait(s), [kA, kB, kC] = this.kids, [J0, J1, J2] = this.jeeps;
    const C = cast;
    D.wait(0.7).then(() => C?.bark(this.barker, 'Cubao! Cubao! Dalawa na lang!', 2.6));
    D.wait(4.6).then(() => C?.bark(this.barker, 'Isa pa, isa pa!', 2.0));
    // walkers: one arrives at the stop, one heads down to the next jeep
    walkPath(this.walkers[0], [[-12.75, WALK, 3.5]], 1.05).then(() => { this.walkers[0].look(this.w(-9.8, 0.7, 12), 0.7); });
    walkPath(this.walkers[1], [[-12.1, WALK, 21.0]], 1.0);
    // a man boards first, ducking in, and takes a seat
    const boarding = (async () => {
      const p = this.boarder; p.busy = true;
      await wait(0.3);
      await walkPath(p, [[-11.1, ROAD, 8.7], [J0.x - 0.06, ROAD, J0.zr - 0.72]], 1.15);
      await this.climb(p, J0, wait, 32);
      await walkPath(p, [[J0.x + 0.1, 0, J0.zr + 1.2]], 0.8);
      p.turnTo = -PI / 2; await wait(0.3);
      await moveTo(p.root, [J0.x + 0.73, 0, J0.zr + 1.25], 0.6);
      p.pose('sit'); p.set({ shL: [-30, 0, 6], elL: [-70, 0, 0], shR: [-30, 0, -6], elR: [-70, 0, 0] }); p.side = -1;
      p.pack?.position.set(0, -0.2, 0.2 * p.s);   // the bag comes off his back onto his lap
    })();
    // the first kid, right behind him, to the curb bench by the door
    const first = (async () => {
      kA.busy = true;
      await wait(1.2);
      await walkPath(kA, [[-11.5, ROAD, 9.6], [-11.15, ROAD, 8.75], [J0.x - 0.05, ROAD, J0.zr - 0.7]], 1.2);
      kA.set(kA.hold);
      await wait(0.35);
      await this.climb(kA, J0, wait);
      kA.set(kA.hold);
      await this.serve(kA, this.riders[0], this.envs[0], wait, 6);
    })();
    // the second, already out on the road, walking up along the first jeep to the one behind
    const second = (async () => {
      await wait(2.6);
      await walkPath(kB, [[-8.42, ROAD, 17.0], [J1.x - 0.05, ROAD, J1.zr - 0.7]], 1.35);
      kB.set(kB.hold);
      await wait(0.3);
      await this.climb(kB, J1, wait);
      kB.set(kB.hold);
      await this.serve(kB, this.riders[5], this.envs[1], wait, 6);
    })();
    // a third, far off, at the last jeep
    const third = (async () => {
      await wait(2.4);
      await walkPath(kC, [[J2.x - 0.05, ROAD, J2.zr - 0.7]], 1.2);
      await this.climb(kC, J2, wait);
      kC.set(kC.hold);
      await this.serve(kC, this.riders[9], this.envs[2], wait, 6);
    })();
    this.running = Promise.all([boarding, first, second, third]);
    return this.running;
  }
}
