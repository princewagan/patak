import * as THREE from 'three';
import { prewarm } from '../engine/prewarm.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbr, std, glow, box, cyl, at, canvasTex, envFrom, tex } from '../engine/kit.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { cast } from '../engine/cast.js';
import { animate } from '../engine/tween.js';
import { photo3d } from '../engine/photo3d.js';
import { glassPass } from '../engine/glass.js';
import { povArm, dropsTexture } from './labas.js';

const _w = new THREE.Vector3(), _e = new THREE.Vector3(), _u = new THREE.Vector3();

/* Aug 17, 2026, played by whoever is holding the controls: until the story turns into ours, it's Sir at the wheel.
   Camera = the driver, at the origin, looking down -Z. The view through the windshield is the real photos
   (depth-mapped), so the photo cameras also sit at the origin. */
const PI = Math.PI;
const SEAT_X = 0.74;                                  // the cabin was modelled from the passenger seat: shift it so the wheel is in front of us
const PIVOT = [[-0.55, -0.06], [0.2, -0.06]], ARM = [0.4, 0.34], BLADE = [0.6, 0.5], MID = 0.45, AMP = 1.05, PARK = MID + AMP + 0.015;

/** a bar bent into a shallow arch along Y, the shape of a wiper's stamped yokes. Springs toward -z (away from the glass). */
function arch(len, w, h, rise, mat) {
  const g = new THREE.BoxGeometry(w, len, h, 1, 18, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getY(i) / len * 2; p.setZ(i, p.getZ(i) - rise * (1 - u * u)); p.setX(i, p.getX(i) * (1 - 0.32 * u * u)); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}
/** One complete wiper, built the way a real one is: spindle under a cap, spring head, stamped arm with its hook,
    a primary yoke on the hook, two secondary yokes, six claws gripping the steel backing of a rubber squeegee.
    Group origin is the spindle; the arm points along +Y; -Z is away from the glass. rotation.z sweeps it. */
function wiper(armLen, bladeLen) {
  const G = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0b0c, roughness: 0.38, metalness: 0.65 });
  const satin = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.55, metalness: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.62 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.3, metalness: 0.9 });
  // spindle, nut and its plastic cap
  G.add(at(cyl(0.017, 0.022, 0.03, satin, 20), 0, 0, -0.03, 0, PI / 2));
  G.add(at(cyl(0.0125, 0.0125, 0.01, steel, 6), 0, 0, -0.05, 0, PI / 2));
  // spring head: wider, hinged, carries the tension that keeps the rubber on the glass
  const head = arch(0.1, 0.03, 0.016, 0.0, black); head.position.set(0, 0.05, -0.052); G.add(head);
  for (const sx of [-1, 1]) G.add(at(cyl(0.0035, 0.0035, 0.012, steel, 8), sx * 0.012, 0.09, -0.052, 0, 0, PI / 2));
  // the arm itself: a stamped U channel, tapering toward the hook and dropping toward the glass
  const L = armLen - 0.1, armG = new THREE.BoxGeometry(0.018, L, 0.009, 1, 12, 1), ap = armG.attributes.position;
  for (let i = 0; i < ap.count; i++) { const u = ap.getY(i) / L + 0.5; ap.setX(i, ap.getX(i) * (1.15 - 0.55 * u)); ap.setZ(i, ap.getZ(i) * (1.1 - 0.3 * u) + (-0.052 + 0.016 * u)); }
  armG.computeVertexNormals();
  const arm = new THREE.Mesh(armG, black); arm.position.y = 0.1 + L / 2; arm.castShadow = true; G.add(arm);
  // the washer line clipped along it
  const hose = cyl(0.0016, 0.0016, L * 0.78, new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.7 }), 6); hose.position.set(0.0075, 0.1 + L * 0.46, -0.043); G.add(hose);
  // hook at the end of the arm, the bit that latches into the blade
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.0068, 0.0022, 6, 14, PI), steel); hook.rotation.set(0, PI / 2, 0); hook.position.set(0, armLen + 0.002, -0.033); G.add(hook);

  // ---- the blade, centred on the end of the arm ----
  const B = new THREE.Group(); B.position.set(0, armLen, 0); G.add(B);
  // rubber: a tall thin lip standing on the glass, with a wider root
  B.add(at(box(0.0028, bladeLen, 0.0065, rubber), 0, 0, -0.0035));
  B.add(at(box(0.0075, bladeLen - 0.004, 0.0048, rubber), 0, 0, -0.0088));
  // steel vertebrae the claws grip
  B.add(at(box(0.0095, bladeLen - 0.014, 0.0012, steel), 0, 0, -0.0118));
  const pri = bladeLen * 0.62, sec = bladeLen * 0.34;
  // primary yoke: the long arch, with the saddle for the hook in the middle
  const py = arch(pri, 0.0145, 0.0045, 0.015, black); py.position.z = -0.0165; B.add(py);
  B.add(at(box(0.017, 0.038, 0.011, satin, 0.002), 0, 0, -0.033));
  B.add(at(cyl(0.0024, 0.0024, 0.019, steel, 8), 0, 0, -0.033, 0, 0, PI / 2));
  for (const s of [-1, 1]) {
    const y = s * pri / 2, sy = arch(sec, 0.0125, 0.004, 0.0085, black); sy.position.set(0, y, -0.0128); B.add(sy);
    B.add(at(cyl(0.0022, 0.0022, 0.016, steel, 8), 0, y, -0.0225, 0, 0, PI / 2));   // rivet where the yokes pivot
    for (const c of [-1, 1]) {
      // a claw at each end of each secondary yoke, folded round the steel
      const cy = y + c * sec * 0.47;
      if (Math.abs(cy) < bladeLen / 2) for (const sx of [-1, 1]) B.add(at(box(0.0022, 0.012, 0.007, black), sx * 0.0058, cy, -0.0118));
      if (Math.abs(cy) < bladeLen / 2) B.add(at(box(0.0135, 0.012, 0.0018, black), 0, cy, -0.0152));
    }
    B.add(at(box(0.0098, 0.009, 0.0072, rubber, 0.002), 0, s * (bladeLen / 2 - 0.0035), -0.0098));   // end cap
  }
  G.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return G;
}

const WHEEL_R = 0.19;
const UPG = new THREE.Vector3(0, 0.75, 0.47).normalize(), NG = new THREE.Vector3(0, -UPG.z, UPG.y);   // up the windshield; off it, into the cabin
const GLASS = { x: -0.22, y: -0.33, z: -1.02, w: 0.98, l: 0.88 };                                     // the windshield in car space (glass.js uG0/uGW/uGL)

function cabinMats() {
  const grain = rep => tex('/tex/leather_red_03_nor.jpg', { repeat: rep, srgb: false });
  const mat = (color, rough, nrm, ns = 0.3) => new THREE.MeshStandardMaterial({ color, roughness: rough, normalMap: nrm || null, normalScale: new THREE.Vector2(ns, ns) });
  return {
    dash: Object.assign(mat(0x1e1f22, 0.78, grain([7, 7]), 0.35), { envMapIntensity: 2 }),
    door: mat(0x55585e, 0.74, grain([8, 8]), 0.3),
    trim: mat(0x4a4c51, 0.66),
    wheel: Object.assign(mat(0x232427, 0.38, grain([40, 3]), 0.75), { envMapIntensity: 5 }),
    visor: Object.assign(mat(0x222326, 0.55, grain([9, 9]), 0.3), { envMapIntensity: 3 }),
    pad: mat(0x191a1c, 0.74, grain([10, 10]), 0.25),
    cloth: pbr('denim_fabric', { noDiff: true, repeat: [7, 7], color: 0x6a6d73, normalScale: 0.7 }),
    headliner: std(0x77736d, { rough: 0.97 }),
    black: std(0x0e0f10, { rough: 0.5 }),
    satin: std(0x1b1c1e, { rough: 0.4, metal: 0.3 }),
    rubber: std(0x080808, { rough: 0.9 }),
    carpet: std(0x232427, { rough: 1 }),
    stitch: std(0x5a5c60, { rough: 0.85 }),
    chrome: std(0xd2d6da, { rough: 0.16, metal: 1 }),
    mirror: std(0xa4abb2, { rough: 0.03, metal: 1, env: 1.6 }),
    paint: new THREE.MeshPhysicalMaterial({ color: 0x8f979f, metalness: 0.6, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.4 }),
  };
}

/** a rounded bar from a to b, w0 → w1 wide; its flat side (t thick) faces +z of whatever it hangs in */
function strut(a, b, w0, w1, t, mat) {
  const L = a.distanceTo(b), W = Math.max(w0, w1), g = new RoundedBoxGeometry(W, L, t, 3, Math.min(W, t) * 0.45), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (w0 + (w1 - w0) * (p.getY(i) / L + 0.5)) / W);
  const m = new THREE.Mesh(g, mat); m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return m;
}
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
/** smooth normals across a rounded box's faces, after its vertices were pushed around */
function smooth(g) { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); g.computeVertexNormals(); return g; }

/** the dashboard: one moulded piece, drawn as its side profile and run the width of the car. Car space, metres. */
function dashboard(M) {
  const G = new THREE.Group(), s = new THREE.Shape();
  // profile: u = how far forward of you, v = height
  s.moveTo(1.12, -0.352);
  s.bezierCurveTo(0.95, -0.338, 0.8, -0.326, 0.71, -0.329);       // the top, running under the glass
  s.bezierCurveTo(0.655, -0.332, 0.632, -0.362, 0.628, -0.402);    // the rolled lip
  s.bezierCurveTo(0.622, -0.47, 0.63, -0.55, 0.655, -0.6);         // the face
  s.bezierCurveTo(0.668, -0.63, 0.62, -0.66, 0.6, -0.7);           // under it, the knee panel
  s.lineTo(0.585, -0.84); s.lineTo(0.64, -0.92); s.lineTo(1.12, -0.92); s.closePath();
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 1.9, curveSegments: 16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelOffset: -0.025, bevelSegments: 5 }), M.dash);
  m.rotation.y = PI / 2; m.position.x = -1.19; m.castShadow = m.receiveShadow = true; G.add(m);
  // defroster slots along the foot of the glass
  const slots = canvasTex(512, 32, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; for (let x = 4; x < w - 4; x += 8) c.fillRect(x, 5, 4, h - 10); }, { srgb: false });
  const def = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.045), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6, alphaMap: slots, transparent: true, depthWrite: false }));
  def.rotation.x = -PI / 2; def.position.set(-0.25, -0.333, -0.97); G.add(def);
  // the round vent at your end of the dash
  const v = new THREE.Group(); v.position.set(-1.09, -0.43, -0.617); G.add(v);
  v.add(new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.007, 10, 40), M.satin), at(new THREE.Mesh(new THREE.CircleGeometry(0.04, 32), M.rubber), 0, 0, -0.012));
  for (let i = -2; i <= 2; i++) v.add(at(box(0.074 * Math.sqrt(1 - (i / 2.7) ** 2), 0.0035, 0.018, M.black), 0, i * 0.0145, -0.004, 0, -0.35));
  v.add(at(box(0.009, 0.013, 0.012, M.satin, 0.003), 0, 0, 0.006));
  // a clock in the middle of the dash
  return G;
}

/** gauges in their hood, in front of the wheel. Origin under your eye; `set(kph, rpm, fuel, temp)` moves the needles. */
function cluster(M) {
  const G = new THREE.Group(), W = 0.2, H = 0.18, RY = 0.075, w = 0.18, ry = 0.06, N = 28, BASE = -0.338, FZ = -0.86;
  const arch = (sw, sr, rev) => { const pts = [new THREE.Vector2(-sw, 0), new THREE.Vector2(-sw, H)]; for (let i = 1; i < N; i++) { const a = PI - PI * i / N; pts.push(new THREE.Vector2(sw * Math.cos(a), H + sr * Math.sin(a))); } pts.push(new THREE.Vector2(sw, H), new THREE.Vector2(sw, 0)); return rev ? pts.reverse() : pts; };
  // the hood: an arch-shaped band pushed back into the dash, its lip rolled
  const hood = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([...arch(W, RY), ...arch(w, ry, true)]), { depth: 0.19, curveSegments: 4, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.009, bevelOffset: -0.009, bevelSegments: 5 }), M.visor);
  hood.position.set(0, BASE, -0.875); G.add(hood);
  // the face, lit from behind
  const k = 1024 / (2 * w), FH = Math.round((H + ry) * k), X = x => (x + w) * k, Y = y => (H + ry - y) * k;
  const D = { tach: [-0.1, 0.186, 0.038], speed: [0, 0.192, 0.045], combo: [0.1, 0.186, 0.038] };
  const face = canvasTex(1024, FH, c => {
    const bg = c.createLinearGradient(0, 0, 0, FH); bg.addColorStop(0, '#0a0b0d'); bg.addColorStop(0.7, '#121418'); bg.addColorStop(1, '#0b0c0e'); c.fillStyle = bg; c.fillRect(0, 0, 1024, FH);
    const dial = ([dx, dy, dr], { a0, a1, n, sub = 1, labels, red, unit, small }) => {
      const x = X(dx), y = Y(dy), r = dr * k, P = (a, rr) => [x + Math.sin(a) * rr, y - Math.cos(a) * rr];
      if (!small) { const g = c.createRadialGradient(x, y, r * 0.1, x, y, r); g.addColorStop(0, '#16181b'); g.addColorStop(1, '#0b0c0e'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, PI * 2); c.fill(); }
      if (red) { c.strokeStyle = '#d8342a'; c.lineWidth = r * 0.08; c.beginPath(); c.arc(x, y, r * 0.86, red[0] - PI / 2, red[1] - PI / 2); c.stroke(); }
      for (let i = 0, S = n * sub; i <= S; i++) {
        const a = a0 + (a1 - a0) * i / S, major = i % sub === 0, [x0, y0] = P(a, r * (major ? 0.76 : 0.83)), [x1, y1] = P(a, r * 0.93);
        c.strokeStyle = '#e8ebee'; c.lineWidth = major ? r * 0.035 : r * 0.016; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
        if (major && labels?.[i / sub]) { const [lx, ly] = P(a, r * 0.6); c.fillStyle = '#e8ebee'; c.font = `600 ${Math.round(r * (small ? 0.24 : 0.2))}px "Barlow Condensed"`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(labels[i / sub], lx, ly); }
      }
      if (unit) { c.font = `500 ${Math.round(r * 0.11)}px Barlow`; c.fillStyle = '#8f989e'; c.textAlign = 'center'; c.fillText(unit, x, y + r * 0.3); }
      return [x, y, r];
    };
    const d135 = 135 * PI / 180;
    const [sx, sy, sr] = dial(D.speed, { a0: -d135, a1: d135, n: 9, sub: 2, labels: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180].map(String), unit: 'km/h' });
    // odometer
    c.fillStyle = '#020303'; c.fillRect(sx - sr * 0.32, sy + sr * 0.44, sr * 0.64, sr * 0.17);
    c.fillStyle = '#9fb7a4'; c.font = `500 ${Math.round(sr * 0.13)}px "Barlow Condensed"`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('1 4 8 2 0 7', sx, sy + sr * 0.53);
    dial(D.tach, { a0: -d135, a1: d135, n: 8, sub: 2, labels: '012345678'.split(''), red: [-d135 + 2 * d135 * 6.5 / 8, d135], unit: 'x1000r/min' });
    // fuel on top, water temperature underneath, one face
    const cb = D.combo, f50 = 50 * PI / 180;
    const [cx, cy, cr] = dial(cb, { a0: -f50, a1: f50, n: 2, sub: 2, labels: ['E', '', 'F'], small: false });
    dial(cb, { a0: PI + f50, a1: PI - f50, n: 2, sub: 1, labels: ['C', '', 'H'], small: true });
    c.fillStyle = '#8f989e'; c.font = `600 ${Math.round(cr * 0.16)}px Barlow`; c.fillText('FUEL', cx, cy - cr * 0.28); c.fillText('TEMP', cx, cy + cr * 0.3);
    // turn arrows, off
    c.strokeStyle = '#1f3a28'; c.lineWidth = 3;
    for (const s of [-1, 1]) { const ax = X(s * 0.06), ay = Y(0.13); c.beginPath(); c.moveTo(ax + s * 16, ay); c.lineTo(ax - s * 2, ay - 12); c.lineTo(ax - s * 2, ay + 12); c.closePath(); c.stroke(); }
  });
  const fg = new THREE.ShapeGeometry(new THREE.Shape(arch(w, ry)), 1), uv = fg.attributes.uv, pp = fg.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pp.getX(i) + w) / (2 * w), pp.getY(i) / (H + ry));
  G.add(at(new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: face, color: new THREE.Color(1.15, 1.15, 1.15) })), 0, BASE, FZ));
  // bezels, needles and their caps
  const needles = {};
  for (const [name, [dx, dy, dr]] of Object.entries(D)) {
    G.add(at(new THREE.Mesh(new THREE.TorusGeometry(dr + 0.002, 0.0022, 8, 64), M.chrome), dx, BASE + dy, FZ + 0.003));
    const mk = (len, col) => {
      const s = new THREE.Shape(); s.moveTo(-0.0018, -len * 0.2); s.lineTo(0.0018, -len * 0.2); s.lineTo(0.0006, len); s.lineTo(-0.0006, len); s.closePath();
      const n = new THREE.Mesh(new THREE.ShapeGeometry(s), glow(col, 2.4)); n.position.set(dx, BASE + dy, FZ + 0.004); G.add(n); return n;
    };
    if (name === 'combo') { needles.fuel = mk(dr * 0.82, 0xff5a1f); needles.temp = mk(dr * 0.6, 0xff5a1f); }
    else needles[name] = mk(dr * 0.88, 0xff5a1f);
    G.add(at(cyl(0.0068, 0.0078, 0.006, M.black, 20), dx, BASE + dy, FZ + 0.007, 0, PI / 2));
  }
  const deg = PI / 180;
  G.userData.set = (kph, rpm, fuel, temp) => {
    needles.speed.rotation.z = -(-135 + 270 * Math.min(kph, 180) / 180) * deg;
    needles.tach.rotation.z = -(-135 + 270 * Math.min(rpm, 8000) / 8000) * deg;
    needles.fuel.rotation.z = -(-50 + 100 * fuel) * deg;
    needles.temp.rotation.z = -(230 - 100 * temp) * deg;
  };
  return G;
}

/** the wheel itself (it turns): a leather rim sewn along the inside, a padded hub, four spokes. Ring in XY, you on +Z. */
function steeringWheel(M) {
  const G = new THREE.Group(), R = WHEEL_R, tube = 0.017;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 20, 160), M.wheel); rim.scale.z = 1.12; G.add(rim);
  // cross-stitches either side of the seam, on the inner face of the rim, toward you
  const n = 170, st = new THREE.InstancedMesh(new THREE.BoxGeometry(0.0042, 0.0011, 0.0009), M.stitch, n * 2), o = new THREE.Object3D();
  const T = new THREE.Vector3(), Nn = new THREE.Vector3(), B = new THREE.Vector3(), Xd = new THREE.Vector3(), m4 = new THREE.Matrix4();
  for (let i = 0; i < n; i++) for (const s of [-1, 1]) {
    const a = (i + 0.5) / n * PI * 2;
    T.set(Math.cos(a), -Math.sin(a), 0); Nn.set(-Math.sin(a), -Math.cos(a), 1.12).normalize(); B.crossVectors(Nn, T);
    o.position.set(Math.sin(a) * R, Math.cos(a) * R, 0).addScaledVector(Nn.clone().multiply(new THREE.Vector3(1, 1, 1.12)), tube * 1.02).addScaledVector(B, s * 0.0021);
    Xd.copy(T).multiplyScalar(0.8).addScaledVector(B, -s * 0.6).normalize();
    o.quaternion.setFromRotationMatrix(m4.makeBasis(Xd, Nn.clone().cross(Xd), Nn)); o.updateMatrix(); st.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), o.matrix);
  }
  G.add(st);
  // the padded hub, with a plain oval badge
  const pad = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRect(0.2, 0.14, 0.05), { depth: 0.02, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.018, bevelOffset: -0.018, bevelSegments: 6 }), M.pad);
  pad.position.set(0, -0.012, -0.078); G.add(pad);
  const badge = cyl(0.015, 0.015, 0.003, M.chrome, 32); badge.scale.x = 1.45; G.add(at(badge, 0, -0.004, -0.0365, 0, PI / 2));
  // four spokes, dished down from the rim to the hub
  for (const s of [-1, 1]) {
    G.add(strut(new THREE.Vector3(s * 0.094, -0.03, -0.056), new THREE.Vector3(s * 0.177, -0.034, -0.004), 0.05, 0.034, 0.016, M.pad));
    G.add(strut(new THREE.Vector3(s * 0.05, -0.074, -0.056), new THREE.Vector3(s * 0.085, -0.159, -0.004), 0.04, 0.03, 0.015, M.pad));
  }
  return G;
}

/** what the wheel turns on (it doesn't turn): the boss, the shroud, the two stalks */
function column(M) {
  const G = new THREE.Group();
  G.add(at(cyl(0.034, 0.04, 0.08, M.satin, 24), 0, -0.012, -0.12, 0, PI / 2));
  const sh = new THREE.Mesh(new RoundedBoxGeometry(0.125, 0.11, 0.3, 4, 0.04), M.dash); sh.position.set(0, -0.035, -0.3); G.add(sh);
  for (const s of [-1, 1]) {
    // left: the indicator; right: the wipers, with a ribbed end you twist
    const k = new THREE.Group(); k.position.set(s * 0.058, -0.01, -0.175); k.rotation.set(0, -s * 0.25, -s * 0.12); G.add(k);
    k.add(at(cyl(0.0062, 0.0052, 0.13, M.black, 12), s * 0.065, 0, 0, 0, 0, -s * PI / 2));
    const tip = s > 0 ? 0.0095 : 0.0078, tl = s > 0 ? 0.042 : 0.03;
    k.add(at(cyl(tip, tip * 0.92, tl, M.black, 16), s * (0.13 + tl / 2), 0, 0, 0, 0, -s * PI / 2));
    if (s > 0) for (const x of [0.14, 0.152, 0.164]) k.add(at(new THREE.Mesh(new THREE.TorusGeometry(tip, 0.0012, 6, 20), M.satin), x, 0, 0, PI / 2));
  }
  return G;
}

/** the trim over a windshield pillar: moulded, bowed toward you, narrower at the roof. side: +1 = the glass is on its +x edge */
function aPillar(M, side) {
  const L = 1.02, W = 0.13, T = 0.045;
  let g = new RoundedBoxGeometry(W, L, T, 4, 0.018); const p = g.attributes.position, e = side * W / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) / L + 0.5;
    if (p.getZ(i) > 0) p.setZ(i, p.getZ(i) + 0.018 * (1 - (2 * x / W) ** 2));
    p.setX(i, e + (x - e) * (1 - 0.3 * y));
  }
  g = smooth(g);
  const m = new THREE.Mesh(g, M.trim), edge = side > 0 ? GLASS.x - GLASS.w : GLASS.x + GLASS.w;
  m.rotation.x = Math.atan2(UPG.z, UPG.y);
  m.position.set(edge - side * (W / 2 - 0.022), GLASS.y, GLASS.z).addScaledVector(UPG, L * 0.43).addScaledVector(NG, 0.03);
  return m;
}

/** a black band printed round the inside edge of the glass, fading out in dots */
function fritBands(P) {
  const T = canvasTex(64, 256, (c, w, h) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, w, h * 0.5);
    for (let y = h * 0.5 + 4; y < h; y += 8) { const r = 3.6 * (1 - (y - h * 0.5) / (h * 0.5)); for (let x = 4 + ((y / 8) % 2) * 4; x < w; x += 8) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); } }
  }, { srgb: false });
  const out = [];
  for (const [len, x, y, rz] of [[GLASS.w * 2, 0, 0.04, PI], [GLASS.l, -GLASS.w + 0.04, GLASS.l / 2, PI / 2], [GLASS.l, GLASS.w - 0.04, GLASS.l / 2, -PI / 2]]) {
    const t = T.clone(); t.wrapS = THREE.RepeatWrapping; t.repeat.set(len / 0.02, 1); t.needsUpdate = true;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.08), new THREE.MeshBasicMaterial({ color: 0x040404, alphaMap: t, transparent: true, depthWrite: false }));
    m.position.set(x, y, 0.002); m.rotation.z = rz; P.add(m); out.push(m);
  }
  return out;
}

export default {
  grade: { lift: [0.0, 0.016, 0.026], gain: [0.82, 0.98, 1.1], sat: 1.2, grain: 0.065, bloom: 0.3, bloomThreshold: 0.85, exposure: 0.42, vignette: 1.15, black: 0.045, gamma: 1.2, curve: 0.5 },

  async build(engine) {
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0x9aa3aa);
    S.environment = await envFrom(engine.renderer, '/tex/kloofendal_overcast_puresky_1k.hdr');
    S.environmentIntensity = 0.25;
    S.add(new THREE.HemisphereLight(0xc4ccd4, 0x2a2826, 0.85));
    const key = new THREE.DirectionalLight(0xc8d2dc, 1.0); key.position.set(0.5, 3, -4); S.add(key);

    // ---- the real street outside (swappable) ----
    this.views = {
      street: photo3d({ name: 'IMG_6458', aspect: 0.75, hfov: 67, near: 2.2, far: 70, extend: 1.9, water: { y: -1.6, strength: 0.4 } }),
      exitA: photo3d({ name: 'IMG_6448', aspect: 0.75, hfov: 67, near: 2.0, far: 70, extend: 1.9, water: { y: -1.2, strength: 1.2 } }),
      exitB: photo3d({ name: 'IMG_6457', aspect: 0.75, hfov: 67, near: 2.6, far: 80, extend: 1.9, cut: 0.06, water: { y: -1.2, strength: 1.2 } }),
    };
    for (const v of Object.values(this.views)) { v.visible = false; v.position.y = 0.25; S.add(v); }
    this.view = null;

    // ---- car interior ----
    const C = this.car = new THREE.Group(); C.position.x = SEAT_X; S.add(C);
    const M = cabinMats();
    C.add(dashboard(M));
    const pod = cluster(M); pod.position.x = -0.74; C.add(pod); this.gauges = pod.userData.set;
    this.kph = 0; this.rpm = 0; this.engineOn = true;
    // steering: the column holds still, the wheel turns on it
    const steer = new THREE.Group(); steer.position.set(-0.74, -0.234, -0.5); steer.rotation.x = -0.45; C.add(steer);
    steer.add(column(M));
    this.wheel = steeringWheel(M); steer.add(this.wheel);
    // the pillars either side of the glass, the strip over it, the roof lining
    C.add(aPillar(M, 1), aPillar(M, -1));
    C.add(at(box(GLASS.w * 2 + 0.1, 0.07, 0.035, M.trim, 0.014), GLASS.x, GLASS.y + UPG.y * GLASS.l + 0.01, GLASS.z + UPG.z * GLASS.l + 0.025, 0, Math.atan2(UPG.z, UPG.y)));
    C.add(at(box(2.1, 0.035, 1.3, M.headliner, 0.015), -0.24, 0.455, 0.08));
    // sun visors folded up, and the mirror on its stalk
    for (const [x, wd] of [[-0.74, 0.36], [0.26, 0.34]]) {
      C.add(at(box(wd, 0.017, 0.16, std(0x6c6862, { rough: 0.95 }), 0.007), x, 0.427, -0.42, 0, 0.08));
      C.add(at(cyl(0.005, 0.005, wd * 0.9, M.satin, 8), x, 0.43, -0.51, 0, 0, PI / 2));
    }
    { const mg = new THREE.Group(); mg.position.set(-0.24, 0.33, -0.47); mg.rotation.set(0.15, -0.35, 0); C.add(mg);
      const hs = new RoundedBoxGeometry(0.24, 0.07, 0.035, 4, 0.016), hp = hs.attributes.position;
      for (let i = 0; i < hp.count; i++) { const u = Math.abs(hp.getX(i)) / 0.12; hp.setY(i, hp.getY(i) * (1 - 0.25 * u * u)); }
      mg.add(new THREE.Mesh(hs, M.black), at(new THREE.Mesh(new THREE.PlaneGeometry(0.226, 0.054), M.mirror), 0, 0, 0.0181));
      C.add(strut(new THREE.Vector3(-0.24, 0.335, -0.49), new THREE.Vector3(-0.24, 0.385, -0.565), 0.016, 0.022, 0.012, M.black)); }
    // the hood out past the glass, wet paint with a crease down each side and a rise in the middle
    { const hg = new THREE.PlaneGeometry(2.0, 1.45, 72, 24), p = hg.attributes.position;
      for (let i = 0; i < p.count; i++) { const u = p.getX(i), v = p.getY(i) / 0.725;
        p.setZ(i, -u * u * 0.05 - (v + 1) * (v + 1) * 0.03 + 0.013 * Math.exp(-((u / 0.24) ** 2)) + 0.006 * Math.exp(-(((Math.abs(u) - 0.46) / 0.026) ** 2))); }
      hg.computeVertexNormals();
      const hood = this.hood = new THREE.Mesh(hg, M.paint); hood.rotation.x = -PI / 2 + 0.05; hood.position.set(-0.25, -0.41, -1.72); C.add(hood); }
    // center console with clock
    this.clockTex = canvasTex(256, 96, (c) => { c.fillStyle = '#06080a'; c.fillRect(0, 0, 256, 96); });
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshBasicMaterial({ map: this.clockTex }));
    clock.position.set(-0.24, -0.47, -0.6); C.add(clock); this.clock = clock;
    // driver seat back + headrest
    C.add(at(box(0.5, 0.75, 0.12, M.cloth, 0.05), -0.74, -0.35, 0.22));
    C.add(at(box(0.26, 0.2, 0.1, M.cloth, 0.05), -0.74, 0.18, 0.24));

    // ---- your door, hinged at its front edge; everything on it swings out together. Local -x is the cabin side ----
    const door = this.door = new THREE.Group(); door.position.set(-1.24, 0, -0.78); door.scale.x = -1; C.add(door);
    door.add(at(box(0.07, 0.74, 1.24, M.door, 0.02), 0.022, -0.6, 0.62));                        // the card
    door.add(at(box(0.06, 0.055, 1.18, M.dash, 0.02), -0.004, -0.255, 0.64));                    // the sill along the glass
    door.add(at(box(0.024, 0.1, 0.7, M.cloth, 0.01), -0.014, -0.34, 0.8));                        // cloth band between the armrest and the sill
    door.add(at(box(0.035, 0.12, 0.62, M.door, 0.012), -0.025, -0.86, 0.82), at(box(0.02, 0.006, 0.58, M.black), -0.03, -0.8, 0.82));   // map pocket
    door.add(at(box(0.014, 0.07, 1.2, M.carpet, 0.005), -0.017, -0.935, 0.62));                 // carpet strip at the foot
    { const s = new THREE.Shape(); s.moveTo(-0.012, -0.53); s.bezierCurveTo(-0.05, -0.51, -0.085, -0.475, -0.092, -0.443); s.bezierCurveTo(-0.096, -0.42, -0.09, -0.405, -0.07, -0.403); s.lineTo(-0.012, -0.41); s.closePath();
      const ar = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.58, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.012, bevelOffset: -0.012, bevelSegments: 5 }), M.door);
      ar.position.z = 0.5; door.add(ar);                                                         // armrest
      door.add(at(box(0.042, 0.006, 0.11, M.black, 0.003), -0.054, -0.401, 0.6)); }               // the cup you pull it shut by
    // the handle: a chrome lever in a black recess, pivoting at its front end
    door.add(at(box(0.008, 0.052, 0.17, M.black, 0.004), -0.014, -0.31, 0.335));
    const lever = this.doorLever = new THREE.Group(); lever.position.set(-0.027, -0.31, 0.262); door.add(lever);
    lever.add(at(box(0.012, 0.02, 0.13, M.chrome, 0.005), 0, 0, 0.062));
    // lock knob through the sill, window crank, speaker
    door.add(at(cyl(0.0058, 0.0064, 0.034, M.satin, 12), -0.012, -0.214, 1.08), at(new THREE.Mesh(new THREE.SphereGeometry(0.0062, 12, 8), M.satin), -0.012, -0.197, 1.08));
    door.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.002, 6, 20), M.chrome), -0.012, -0.229, 1.08, 0, PI / 2));
    { const k = new THREE.Group(); k.position.set(-0.03, -0.62, 0.78); k.rotation.x = 0.75; door.add(k);
      k.add(at(cyl(0.022, 0.024, 0.014, M.satin, 24), 0, 0, 0, 0, 0, PI / 2), at(box(0.008, 0.1, 0.017, M.chrome, 0.004), -0.01, -0.046, 0), at(cyl(0.011, 0.011, 0.034, M.black, 16), -0.03, -0.09, 0, 0, 0, PI / 2)); }
    { const gt = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#2b2d31'; c.fillRect(0, 0, w, h); c.fillStyle = '#0a0a0b'; for (let y = 6, r = 0; y < h; y += 10, r++) for (let x = 6 + (r % 2) * 5; x < w; x += 10) if (Math.hypot(x - 128, y - 128) < 118) { c.beginPath(); c.arc(x, y, 3, 0, 7); c.fill(); } });
      const sp = new THREE.Group(); sp.position.set(-0.016, -0.79, 0.3); sp.rotation.y = -PI / 2; door.add(sp);
      sp.add(new THREE.Mesh(new THREE.CircleGeometry(0.072, 40), new THREE.MeshStandardMaterial({ map: gt, roughness: 0.75 })), new THREE.Mesh(new THREE.TorusGeometry(0.074, 0.006, 8, 48), M.satin)); }
    // the window frame: its front edge leans back along the pillar
    const wf = (a, b, t = 0.04) => door.add(strut(new THREE.Vector3(...a), new THREE.Vector3(...b), t, t, 0.03, M.satin));
    wf([0.02, 0.43, 0.32], [0.02, 0.43, 1.22]); wf([0.02, -0.23, 1.21], [0.02, 0.44, 1.21]); wf([0.02, -0.23, 0.06], [0.02, 0.44, 0.33]);
    // the mirror's sail in the front corner, and the mirror itself outside it
    { const s = new THREE.Shape([new THREE.Vector2(0, -0.235), new THREE.Vector2(0.17, -0.235), new THREE.Vector2(0.06, 0.05), new THREE.Vector2(0, 0.05)]);
      const sail = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelOffset: -0.006, bevelSegments: 2 }), M.black);
      sail.rotation.y = -PI / 2; sail.position.x = 0.01; door.add(sail);
      door.add(at(cyl(0.007, 0.009, 0.02, M.satin, 12), -0.026, -0.17, 0.06, 0, 0, PI / 2));
      const mh = new RoundedBoxGeometry(0.075, 0.11, 0.18, 5, 0.035), mp = mh.attributes.position;
      for (let i = 0; i < mp.count; i++) { const f = 1 - 0.45 * Math.max(0, -mp.getZ(i) / 0.09); mp.setX(i, mp.getX(i) * f); mp.setY(i, mp.getY(i) * (0.55 + 0.45 * f)); }
      const mirror = new THREE.Group(); mirror.position.set(0.11, -0.16, 0.06); door.add(mirror);
      mirror.add(new THREE.Mesh(mh, M.paint), at(new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.094), M.mirror), 0, 0, 0.091)); }
    // side glass with rain on it (a drawn texture, the windshield pass only covers the front)
    const dropsT = dropsTexture();
    { const s = new THREE.Shape([new THREE.Vector2(0.07, -0.235), new THREE.Vector2(1.2, -0.235), new THREE.Vector2(1.2, 0.42), new THREE.Vector2(0.32, 0.42)]);
      const pg = new THREE.ShapeGeometry(s), uv = pg.attributes.uv, pp = pg.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - (pp.getX(i) - 0.07) / 1.13, (pp.getY(i) + 0.235) / 0.655);
      const pane = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: dropsT, transparent: true, depthWrite: false, opacity: 0.85, side: THREE.DoubleSide }));
      pane.rotation.y = -PI / 2; pane.position.x = 0.02; door.add(pane); }
    // pillar behind the door with your seatbelt up it, roof edge
    C.add(at(box(0.1, 1.0, 0.1, M.trim, 0.03), -1.27, -0.02, 0.5), at(box(0.1, 0.1, 1.5, M.headliner, 0.03), -1.32, 0.46, -0.2));
    C.add(at(box(0.005, 0.76, 0.046, std(0x1d1f22, { rough: 0.8 })), -1.217, -0.12, 0.47), at(box(0.014, 0.03, 0.062, M.satin, 0.006), -1.214, 0.27, 0.47));
    // what is out that side: the wet side of the street, only ever seen soft through glass and rain
    const sideM = new THREE.MeshBasicMaterial({ map: canvasTex(1024, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d7e1ea'); g.addColorStop(0.46, '#c3cfd9'); g.addColorStop(0.47, '#5f6a70'); g.addColorStop(0.62, '#4b5358'); g.addColorStop(0.63, '#646b6e'); g.addColorStop(1, '#3b4145'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.filter = 'blur(26px)';
      for (const [x, wd, top, col] of [[20, 300, 90, '#6f6c68'], [340, 240, 40, '#85827b'], [600, 420, 110, '#63666a'], [860, 200, 60, '#77746f']]) { c.fillStyle = col; c.fillRect(x, top, wd, h * 0.56 - top); }
      for (let i = 0; i < 14; i++) { c.fillStyle = 'rgba(46,54,48,.4)'; c.beginPath(); c.arc(Math.random() * w, h * 0.46 + Math.random() * 40, 30 + Math.random() * 50, 0, 7); c.fill(); }
    }), side: THREE.BackSide, fog: false, color: new THREE.Color(2.4, 2.4, 2.4) });
    const side = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 16, 48, 1, true, PI * 0.19, PI * 0.57), sideM); side.position.y = 0.6; side.scale.x = -1; side.visible = false; S.add(side); this.sideWorld = side;
    // your own arms: the left goes to the door later; both are on the wheel while you drive
    this.armL = povArm({ left: true }); this.armR = povArm(); S.add(this.armL, this.armR);
    this.dayLight = new THREE.PointLight(0xdfe8f2, 2.2, 7, 1.2); this.dayLight.position.set(-1.2, 0.3, -0.1); S.add(this.dayLight);

    // rain outside the car
    this.rain = new Rain({ count: 9000, size: [18, 10, 26], speed: 9, opacity: 0.4, wind: [0.3, 0.8] }).exclude([-1.4, -1.3, -1.1], [1.0, 0.7, 1.3]);
    S.add(this.rain.mesh);

    this.glass = glassPass({ y0: 0.2, y1: 1.0 });
    this.passes = [this.glass];
    this.drive = 0;
    // ---- the wipers, in the plane of the windshield ----
    { const u = this.glass.uniforms, G0 = u.uG0.value; G0.x += SEAT_X;
      const X = new THREE.Vector3(1, 0, 0), Y = u.uGUp.value.clone(), Z = X.clone().cross(Y).normalize();
      const P = this.pane = new THREE.Group(); P.position.copy(G0); P.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); S.add(P);
      this.wipers = PIVOT.map(([x, y], i) => { const w = wiper(ARM[i], BLADE[i]); w.position.set(x, y, -0.006); w.rotation.z = -PARK; P.add(w); return w; });
      this.bladeAng = [PARK, PARK]; this.wipersOn = false;
      u.uR1.value.set(ARM[0] - BLADE[0] / 2, ARM[0] + BLADE[0] / 2); u.uR2.value.set(ARM[1] - BLADE[1] / 2, ARM[1] + BLADE[1] / 2);
      u.uMid.value = MID; u.uAmp.value = AMP; u.uP1.value.set(...PIVOT[0]); u.uP2.value.set(...PIVOT[1]); }
    // the cabin is in front of the glass: tell the rain pass where, so no drops land on the wheel or your arms
    const frit = fritBands(this.pane);
    for (const o of [C, this.armL, this.armR, ...frit]) o.traverse(n => n.layers.enable(1));
    this.hood.layers.disable(1);
  },

  setClock(text) {
    const c = this.clockTex.image.getContext('2d');
    c.fillStyle = '#06080a'; c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#7fd4ff'; c.font = '600 58px Inter'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 50);
    this.clockTex.needsUpdate = true;
  },

  show(name) {
    for (const [k, v] of Object.entries(this.views)) v.visible = k === name;
    this.view = this.views[name]; this.view.position.z = 0;
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.35; engine.rig.jolt = 0.25;
    engine.rig.set({ pos: [0, 0, 0], look: [0.04, -0.07, -2], fov: 42 });
    this.show('street');
    this.glass.inside = { scene: this.scene, camera: engine.camera, layer: 1 };
    this.engineOn = true;
    prewarm(engine);
    audio.rain(0.5, 0.8); audio.roof(0.3); audio.carEngine(0.8, 0.5); audio.scape('kotse');
  },
  exit() { audio.layer('roof', 0); audio.layer('carEngine', 0); audio.scape(null); },

  update(dt, t, raw) {
    if (this.view) { this.view.update(t); this.view.position.z += this.drive * dt; }
    this.rain.update(t, this.engine.camera);
    this.glass.update(t, innerWidth, innerHeight, this.engine.camera);
    // the blades: the same sweep the water is cleared by, and when they're switched off they run home and park
    const u = this.glass.uniforms, W = 2 * PI / u.uWipeT.value;
    for (let i = 0; i < 2; i++) {
      const run = MID + AMP * Math.sin(W * (t + i * 0.05));
      this.bladeAng[i] = this.wipersOn ? run : this.bladeAng[i] + (PARK - this.bladeAng[i]) * (1 - Math.exp(-5 * dt));
      this.wipers[i].rotation.z = -this.bladeAng[i];
    }
    u.uA1.value = this.bladeAng[0]; u.uA2.value = this.bladeAng[1];
    // the gauges: slow through the village, the engine ticking over
    this.kph += ((this.engineOn ? this.drive * 38 : 0) - this.kph) * (1 - Math.exp(-1.2 * dt));
    this.rpm += ((this.engineOn ? 780 + this.kph * 62 + Math.sin(t * 7) * 15 : 0) - this.rpm) * (1 - Math.exp(-2.5 * dt));
    this.gauges(this.kph, this.rpm, 0.34, 0.48);
    // hands closed round the rim while you're driving, the wheel moving a little under them
    if (this.onWheel) {
      this.wheel.rotation.z = Math.sin(t * 0.7) * 0.05 + Math.sin(t * 1.9) * 0.012;
      this.wheel.updateWorldMatrix(true, false);
      for (const [arm, a, e] of [[this.armL, -0.98, [-0.3, -0.6, 0.06]], [this.armR, 0.98, [0.3, -0.6, 0.06]]]) {   // ten to two, where you see your knuckles over the rim
        _w.set(Math.sin(a) * WHEEL_R, Math.cos(a) * WHEEL_R, 0); this.wheel.localToWorld(_w);
        _u.set(Math.cos(a), -Math.sin(a), 0).multiplyScalar(-Math.sign(a)).transformDirection(this.wheel.matrixWorld);   // along the rim, toward the top
        arm.grip(_w, _u, _e.set(...e));
      }
    }
  },

  /* ================= Part Three, in the car: he plays it himself ================= */
  async play(D, S) {
    const rig = this.engine.rig, g = this.glass.uniforms;
    const cam = (look, dur = 2.5, fov) => rig.move({ look, dur, fov });
    this.drive = 0.5; g.uWipe.value = 1; g.uWipeT.value = 1.35; this.wipersOn = true;
    this.onWheel = true; this.armL.visible = this.armR.visible = true;
    await D.black(false, 2.4);
    await D.say('', 'Malakas ang ulan. Nag-shortcut ka sa loob ng isang village sa San Francisco del Monte.');
    await D.wait(1.2);
    // every exit flooded
    const exit = async (name, line) => {
      await D.black(true, 0.5);
      this.show(name); this.drive = 0.6; rig.set({ look: name === 'exitB' ? [0.25, -0.05, -2] : [0.05, -0.08, -2], fov: 38 });
      await D.black(false, 0.8);
      await animate(k => { this.drive = 0.6 * (1 - k); }, 2.2, 'out');
      audio.tone(70, .5, { vol: .25 });
      await D.say('', line);
    };
    await exit('exitA', 'Sinubukan mong lumabas. Baha.');
    await exit('exitB', 'Sa kabilang daan. Baha rin.');
    await D.black(true, 0.5); this.show('street'); this.drive = 0; rig.set({ look: [0.04, -0.07, -2], fov: 42 }); await D.black(false, 0.8);
    await D.say('', 'Mataas pala ang gitna ng village. Lahat ng labasan, pababa. Lahat, lubog.');
    // parked: the wipers run home and the rain takes the glass back, drop by drop
    this.wipersOn = false; audio.carEngine(0.7, 0.2);
    animate(k => { g.uWipe.value = 1 - k; }, 6, 'sine');
    await D.say('', 'Nag-park ka. Naka-on ang makina.');
    await cam([-0.2, -0.1, -2], 3, 38);
    await D.wait(1.6);
    const pick = await D.choose(['Maghintay|Dito na lang sa kotse', 'Bumaba|Lumabas sa ulan'], { timer: 12, id: 'baba', def: 0 });
    S.baba = pick;
    if (pick === 0) {
      audio.rain(0.5, 0.2); audio.layer('roof', 0.2);
      await D.say('', D.lastTimedOut ? 'Hindi ka kumilos. Lumipas ang kalahating oras.' : 'Naghintay ka. Lumipas ang kalahating oras.', { hold: 3.2 });
      await D.say('', 'Nandoon pa rin ang tubig. Bumaba ka na rin.', { hold: 3 });
    }
    // the door: you turn to it, pull the handle, it swings out, rain and daylight come in
    audio.layer('carEngine', 0, null, 1.2); this.engineOn = false;
    const u = this.engine.final.uniforms, arm = this.armL;
    this.onWheel = false; this.armR.visible = false;
    this.sideWorld.visible = true;
    await rig.move({ pos: [-0.07, -0.03, -0.02], look: [-1.0, -0.3, -0.34], dur: 2.0, fov: 52, e: 'inOut' });
    await D.wait(0.2);
    const w = new THREE.Vector3(), ax = new THREE.Vector3(), el = new THREE.Vector3(), eye = this.engine.camera;
    const elbow = () => el.set(-0.1, -0.62, 0.06).applyQuaternion(eye.quaternion).add(eye.position);
    // fingers round the lever, thumb forward: its free end, and the way it runs
    const hold = () => { this.doorLever.updateWorldMatrix(true, false); w.set(0, 0, 0.095); this.doorLever.localToWorld(w); ax.set(0, 0, -1).transformDirection(this.doorLever.matrixWorld); arm.grip(w, ax, elbow()); };
    hold(); const wrist = arm.position.clone();
    const reach = rest => { elbow(); const p = wrist.clone(); if (rest) p.lerp(el.clone().add(new THREE.Vector3(-0.05, -0.4, 0.05)), rest); arm.reach(p, el, -1.2); };
    reach(1); arm.visible = true;
    await animate(k => reach(1 - k), 0.75, 'inOut');
    hold();
    audio.tone(1200, 0.03, { vol: 0.08 }); audio.noiseHit(0.05, { f: 2400, vol: 0.14 }); audio.tone(240, 0.08, { vol: 0.2, to: 150, delay: 0.05 });
    await animate(k => { this.doorLever.rotation.y = -0.42 * k; this.door.rotation.y = -0.05 * k; hold(); }, 0.16, 'out');
    audio.rain(1.2, 0.0); audio.layer('roof', 0, null, 0.4);
    await D.wait(0.18);
    animate(k => { this.door.rotation.y = -0.05 - 0.72 * k; this.dayLight.intensity = 2.2 + 14 * k; hold(); }, 1.4, 'out');
    await animate(k => { const w = k * k * k; u.uLift.value.set(this.grade.lift[0] + (1 - this.grade.lift[0]) * w, this.grade.lift[1] + (1 - this.grade.lift[1]) * w, this.grade.lift[2] + (1 - this.grade.lift[2]) * w); }, 1.5, 'linear');
    arm.visible = false;
  },
};
