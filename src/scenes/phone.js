import * as THREE from 'three';
import { ell, rell, cone, blend, surfaceNets } from '../engine/sdfmesh.js';
import { canvasTex } from '../engine/kit.js';
import { animate } from '../engine/tween.js';

/*
  The phone in his right hand, first person. Model space: origin at the middle of the phone, +Y up the long side,
  +Z out of the screen toward his eyes, +X to his right. Palm behind, fingers around the left edge, thumb over the lower right.
  The message sits in the top half on purpose so the hand never covers it. Type is the size people set on their parents' phones:
  it has to read from the back of a classroom.
*/
const W = 0.076, H = 0.16, T = 0.0085, CORNER = 0.0105;
const SW = W - 0.0042, SH = H - 0.0042, PXW = 1080, PXH = Math.round(PXW * SH / SW);
const UI = '-apple-system, "SF Pro Text", "Helvetica Neue", "Segoe UI", Roboto, Arial, sans-serif';

function rounded(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}
function geo(m) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(m.indices, 1));
  g.computeVertexNormals();
  return g;
}

function statusBar(c, w, ink = '#eef1f5') {
  c.fillStyle = ink; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.font = `600 54px ${UI}`; c.fillText('6:42', 76, 88);
  c.fillStyle = '#000'; c.beginPath(); c.arc(w / 2, 62, 25, 0, 7); c.fill();
  c.fillStyle = ink;
  for (let i = 0; i < 4; i++) { c.globalAlpha = i < 3 ? 1 : 0.35; c.beginPath(); c.roundRect(w - 262 + i * 19, 86 - (i + 1) * 11, 13, (i + 1) * 11, 3); c.fill(); }
  c.globalAlpha = 1;
  c.font = `600 40px ${UI}`; c.fillText('LTE', w - 172, 86);
  c.strokeStyle = ink; c.lineWidth = 4; c.beginPath(); c.roundRect(w - 84, 52, 56, 34, 9); c.stroke();
  c.fillRect(w - 24, 62, 6, 14);
  c.beginPath(); c.roundRect(w - 78, 58, 30, 22, 5); c.fill();
}

function wrap(c, text, width) {
  const out = []; let line = '';
  for (const word of text.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (c.measureText(t).width > width && line) { out.push(line); line = word; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

function messagesScreen(c, w, h) {
  {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    statusBar(c, w, '#12151a');
    // who it's from: a number he doesn't know
    c.strokeStyle = '#2a2f37'; c.lineWidth = 9; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(82, 170); c.lineTo(50, 205); c.lineTo(82, 240); c.stroke();
    c.fillStyle = '#aab3bf'; c.beginPath(); c.arc(170, 205, 56, 0, 7); c.fill();
    c.fillStyle = '#ffffff'; c.beginPath(); c.arc(170, 188, 21, 0, 7); c.fill(); c.beginPath(); c.ellipse(170, 245, 36, 25, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#0d1014'; c.font = `600 62px ${UI}`; c.textAlign = 'left'; c.fillText('+63 917 ••• 4821', 248, 202);
    c.fillStyle = '#5c6672'; c.font = `400 42px ${UI}`; c.fillText('Hindi naka-save', 248, 256);
    c.fillStyle = '#d5dae1'; c.fillRect(0, 298, w, 3);
    // the message
    const x = 36, pad = 46, font = `700 102px ${UI}`, lh = 134;
    c.font = font;
    const lines = wrap(c, 'CONGRATS! Nanalo ang number mo ng P25,000. I-claim dito bago mag-expire:', w - 2 * x - 2 * pad - 20);
    lines.push('bit.ly/...');
    const top = 326, bh = lines.length * lh + 2 * pad - 14;
    c.fillStyle = '#d3dae3'; c.beginPath(); c.roundRect(x, top, w - 2 * x - 12, bh, [64, 64, 64, 14]); c.fill();
    lines.forEach((l, i) => {
      const y = top + pad + 92 + i * lh, link = i === lines.length - 1;
      c.fillStyle = link ? '#0a47b8' : '#05070a'; c.fillText(l, x + pad, y);
      if (link) c.fillRect(x + pad, y + 13, c.measureText(l).width, 7);
    });
    c.fillStyle = '#5c6672'; c.font = `400 44px ${UI}`; c.fillText('6:42 AM', x + 18, top + bh + 66);
    // the box he never types in
    c.fillStyle = '#e9edf2'; c.beginPath(); c.roundRect(40, h - 216, w - 80, 118, 59); c.fill();
    c.fillStyle = '#6a7480'; c.font = `400 46px ${UI}`; c.fillText('Mag-text', 96, h - 142);
    c.fillStyle = 'rgba(0,0,0,.5)'; c.beginPath(); c.roundRect(w / 2 - 150, h - 44, 300, 11, 6); c.fill();
  }
}

function homeScreen(c, w, h) {
  {
    const g = c.createLinearGradient(0, 0, w * 0.4, h);
    g.addColorStop(0, '#1a2a3d'); g.addColorStop(0.55, '#10202b'); g.addColorStop(1, '#0a1218');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    statusBar(c, w);
    c.fillStyle = '#eef1f5'; c.textAlign = 'center';
    c.font = `300 250px ${UI}`; c.fillText('6:42', w / 2, 640);
    c.font = `500 58px ${UI}`; c.fillText('Martes', w / 2, 730);
    const cols = ['#4f8f6b', '#c98b3e', '#4a79b5', '#a2566a'];
    for (let i = 0; i < 4; i++) { c.fillStyle = cols[i]; c.beginPath(); c.roundRect(96 + i * 232, h - 320, 170, 170, 44); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.roundRect(w / 2 - 150, h - 44, 300, 11, 6); c.fill();
  }
}

/** Ate Weng's phone: her thread with her eldest */
export function chatScreen(c, w, h) {
  c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
  statusBar(c, w, '#12151a');
  c.fillStyle = '#7ba0c4'; c.beginPath(); c.arc(112, 205, 56, 0, 7); c.fill();
  c.fillStyle = '#ffffff'; c.font = `600 56px ${UI}`; c.textAlign = 'center'; c.fillText('A', 112, 225); c.textAlign = 'left';
  c.fillStyle = '#0d1014'; c.font = `600 66px ${UI}`; c.fillText('Anak ko', 196, 226);
  c.fillStyle = '#d5dae1'; c.fillRect(0, 298, w, 3);
  const bubble = (text, y, mine) => {
    c.font = `600 82px ${UI}`;
    const lines = wrap(c, text, 760), lh = 108, bh = lines.length * lh + 72, bw = Math.max(...lines.map(l => c.measureText(l).width)) + 88, x = mine ? w - bw - 30 : 30;
    c.fillStyle = mine ? '#1f7a56' : '#d3dae3'; c.beginPath(); c.roundRect(x, y, bw, bh, mine ? [56, 56, 12, 56] : [56, 56, 56, 12]); c.fill();
    c.fillStyle = mine ? '#ffffff' : '#05070a'; lines.forEach((l, i) => c.fillText(l, x + 44, y + 106 + i * lh));
    return y + bh;
  };
  const y = bubble('Ma, yung project ko po bukas na po deadline', 340, false);
  const z = bubble("Anak, sa Sabado na lang 'yung pambili ng project mo ha.", y + 44, true);
  c.fillStyle = '#5c6672'; c.font = `400 44px ${UI}`; c.textAlign = 'right'; c.fillText('2:41 PM', w - 44, z + 62); c.textAlign = 'left';
}

/** the phone on the bed at night */
export function alarmScreen(c, w, h) {
  c.fillStyle = '#06080c'; c.fillRect(0, 0, w, h);
  statusBar(c, w);
  c.fillStyle = '#eef1f5'; c.textAlign = 'center';
  c.font = `300 270px ${UI}`; c.fillText('10:05', w / 2, 640);
  c.font = `500 66px ${UI}`; c.fillText('Martes', w / 2, 750);
  c.textAlign = 'left';
  c.fillStyle = '#1b2230'; c.beginPath(); c.roundRect(48, 880, w - 96, 270, 56); c.fill();
  c.fillStyle = '#f2a33a'; c.beginPath(); c.arc(150, 1015, 46, 0, 7); c.fill();
  c.fillStyle = '#eef1f5'; c.font = `600 72px ${UI}`; c.fillText('Alarm', 236, 990);
  c.fillStyle = '#b8c3d0'; c.font = `400 62px ${UI}`; c.fillText('5:30 AM · bukas', 236, 1072);
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.roundRect(w / 2 - 150, h - 44, 300, 11, 6); c.fill();
}

const screenShader = {
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uA, uB; uniform float uSlide, uOn, uGain;
    varying vec2 vUv;
    void main(){
      vec3 c;
      if (vUv.x < uSlide) {
        c = texture2D(uB, vUv).rgb * (0.55 + 0.45 * uSlide);
        c *= 1.0 - 0.6 * smoothstep(0.08, 0.0, uSlide - vUv.x);    // the sheet lifting off casts a soft shadow
      } else c = texture2D(uA, vec2(vUv.x - uSlide, vUv.y)).rgb;
      gl_FragColor = vec4(c * uGain * uOn, 1.0);
    }`,
};

function handMeshes() {
  const P = [
    [rell([0.012, -0.056, -0.0215], [0.041, 0.052, 0.0155], [0, 0, -0.25])],
    [ell(-0.012, -0.094, -0.0235, 0.024, 0.032, 0.0165), 0.014],                    // heel of the hand, below the phone
    [cone([0.03, -0.112, -0.026], [0.052, -0.07, -0.012], 0.021, 0.0145), 0.012],   // the thumb's muscle
    [cone([0.008, -0.116, -0.032], [0.03, -0.185, -0.058], 0.0285, 0.0272, 0.72), 0.018],
    [cone([0.03, -0.185, -0.058], [0.1, -0.44, -0.215], 0.0272, 0.042, 0.8), 0.012],
  ];
  // four fingers pressed together, slanting up round the left edge; only the tips separate
  const tips = [];
  [[-0.0225, 0.0094], [-0.0385, 0.0097], [-0.0545, 0.0092], [-0.0695, 0.0079]].forEach(([y, r], i) => {
    const k = [0.022 - i * 0.004, y - 0.032, -0.0225], a = [-0.024, y - 0.017, -0.0158], b = [-0.0482, y - 0.0065, -0.0022], t = [-0.0392 - i * 0.0008, y + 0.0035, 0.0088];
    P.push([cone(k, a, r * 1.04, r), 0.007], [cone(a, b, r, r * 0.96), 0.0045], [cone(b, t, r * 0.96, r * 0.72), 0.0016]);
    tips.push({ t, r: r * 0.72, d: [t[0] - b[0], t[1] - b[1]] });
  });
  const hand = geo(surfaceNets(blend(P), [-0.064, -0.47, -0.28], [0.135, 0.03, 0.03], 0.0016, { smooth: 2 }));
  // the thumb has its own pivot at the base so it can swipe
  const O = new THREE.Vector3(0.05, -0.1, -0.016);
  const J = [[0.05, -0.1, -0.016], [0.0595, -0.073, 0.0005], [0.0465, -0.052, 0.0132], [0.0265, -0.039, 0.0138]].map(p => [p[0] - O.x, p[1] - O.y, p[2] - O.z]);
  const Th = [[cone(J[0], J[1], 0.0152, 0.0122)], [cone(J[1], J[2], 0.0122, 0.0102), 0.004], [cone(J[2], J[3], 0.0102, 0.0083), 0.003]];
  const thumb = geo(surfaceNets(blend(Th), [-0.04, -0.02, -0.022], [0.03, 0.085, 0.05], 0.0013, { smooth: 2 }));
  return { hand, thumb, O, tips, tip: new THREE.Vector3(...J[3]), dir: new THREE.Vector3(J[3][0] - J[2][0], J[3][1] - J[2][1], J[3][2] - J[2][2]).normalize() };
}

/** the handset alone: screen faces +Z. draw(c, w, h) paints a 1080-wide screen. */
export function phoneModel(draw, { gain = 1.5, under = null } = {}) {
  const G = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(rounded(W - 0.002, H - 0.002, CORNER), { depth: T - 0.002, bevelEnabled: true, bevelSize: 0.001, bevelThickness: 0.001, bevelSegments: 3, curveSegments: 12 }),
    new THREE.MeshStandardMaterial({ color: 0x8d939c, metalness: 0.75, roughness: 0.38, emissive: 0x1b1e23 }));
  body.position.z = -T / 2 + 0.001; G.add(body);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(rounded(W - 0.0012, H - 0.0012, CORNER - 0.0006), 12), new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.06, metalness: 0.2 }));
  glass.position.z = T / 2 + 0.00006; G.add(glass);

  const scrG = new THREE.ShapeGeometry(rounded(SW, SH, 0.0082), 12);
  { const p = scrG.attributes.position, uv = scrG.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / SW + 0.5, p.getY(i) / SH + 0.5); }
  const A = canvasTex(PXW, PXH, draw), B = under ? canvasTex(PXW, PXH, under) : A;
  for (const t of [A, B]) { t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
  const U = G.screen = { uA: { value: A }, uB: { value: B }, uSlide: { value: 0 }, uOn: { value: 1 }, uGain: { value: gain } };
  const screen = new THREE.Mesh(scrG, new THREE.ShaderMaterial({ uniforms: U, ...screenShader }));
  screen.position.z = T / 2 + 0.00014; G.add(screen);
  return G;
}

export function makePhone(scene) {
  const G = phoneModel(messagesScreen, { under: homeScreen }), U = G.screen; U.uOn.value = 0;

  const skin = new THREE.MeshPhysicalMaterial({ color: 0x9a6a4a, roughness: 0.66, sheen: 0.12, sheenColor: new THREE.Color(0xff9a7a), sheenRoughness: 0.7 });
  const { hand, thumb, O, tips, tip, dir } = handMeshes();
  G.add(new THREE.Mesh(hand, skin));
  const th = new THREE.Group(); th.position.copy(O); G.add(th);
  th.add(new THREE.Mesh(thumb, skin));
  const nail = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), new THREE.MeshStandardMaterial({ color: 0xb48a76, roughness: 0.34 }));
  nail.scale.set(0.0058, 0.0072, 0.0012);
  nail.position.copy(tip).addScaledVector(dir, 0.0014).add(new THREE.Vector3(0, 0, 0.0074));
  nail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir.x, dir.y, 0).normalize()); th.add(nail);

  const fnail = new THREE.MeshStandardMaterial({ color: 0xb08672, roughness: 0.36 });
  for (const f of tips) {
    const n = new THREE.Mesh(nail.geometry, fnail), L = Math.hypot(f.d[0], f.d[1]);
    n.scale.set(f.r * 0.72, f.r * 0.86, 0.0009);
    n.position.set(f.t[0] + f.d[0] / L * f.r * 0.32, f.t[1] + f.d[1] / L * f.r * 0.32, f.t[2] + f.r * 0.8);
    n.rotation.z = Math.atan2(-f.d[0], f.d[1]); G.add(n);
  }

  // the screen is the light in this shot: it falls on the thumb, the fingers and his shirt
  // it stays in the scene at zero: adding or removing a light recompiles every material and stalls the shot
  const light = new THREE.PointLight(0xdbe7ff, 0, 0.9, 1.8); scene.add(light);
  const lightAt = new THREE.Vector3(0, -0.01, 0.15);

  G.pos = new THREE.Vector3(); G.buzz = 0;
  G.setScreen = name => { U.uSlide.value = name === 'home' ? 1 : 0; };
  G.wake = (on, dur = 0.3) => animate(k => { const v = on ? k : 1 - k; U.uOn.value = v; light.intensity = 0.085 * v; }, dur, 'out');
  G.update = (dt, t, road = 0) => {
    G.buzz = Math.max(0, G.buzz - dt);
    const b = G.buzz > 0 ? Math.sin(t * 210) * 0.0012 : 0;
    G.position.set(G.pos.x + Math.sin(t * 1.13) * 0.0011 + b, G.pos.y + Math.sin(t * 1.71 + 1) * 0.0009 + road, G.pos.z + Math.sin(t * 0.83 + 2) * 0.0011);
    light.position.copy(lightAt).applyQuaternion(G.quaternion).add(G.position);
  };
  /** the thumb reaches in and drags the conversation away to the right */
  G.swipe = async () => {
    await animate(k => { th.rotation.z = 0.2 * k; th.position.z = O.z + 0.002 * Math.sin(k * Math.PI); }, 0.4, 'head');
    await animate((k, raw) => { th.rotation.z = 0.2 - 0.26 * k; U.uSlide.value = Math.min(1, raw * raw * (3 - 2 * raw) * 1.02); }, 0.55, 'linear');
    U.uSlide.value = 1;
    await animate(k => { th.rotation.z = -0.06 * (1 - k); }, 0.3, 'head');
  };
  return G;
}
