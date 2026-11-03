import * as THREE from 'three';
import { box, canvasTex } from './kit.js';

/*
  A family meal, made of real things: a monobloc chair, a plastic mantel draped over the table, plates, kutsara at tinidor,
  and an Eater that brings real rice from the plate to the mouth.

  Every held thing is a child of the hand that holds it (Person.arm[side].wr), so it can never float away from the hand.
  The Eater decides where the spoon has to be and which way it faces, and works the arm back from that:
  the hand goes where the spoon needs it (Person.reach) and turns so the spoon faces the right way (Person.aim).
*/
const PI = Math.PI;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mj = t => { t = clamp(t, 0, 1); return t * t * t * (10 + t * (6 * t - 15)); };   // minimum jerk: how a hand moves
const span = (u, a, b) => clamp((u - a) / (b - a), 0, 1);
const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

/** the quaternion whose +Z is dir and whose +Y is as close to up as it can be */
export function facing(dir, up = _y.set(0, 1, 0), out = new THREE.Quaternion()) {
  _z.copy(dir).normalize();
  _x.crossVectors(up, _z); if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0); _x.normalize();
  const y = new THREE.Vector3().crossVectors(_z, _x);
  _m.makeBasis(_x, y, _z);
  return out.setFromRotationMatrix(_m);
}

/* ---------------- materials ---------------- */
const steel = () => new THREE.MeshStandardMaterial({ color: 0xd6dadd, metalness: 0.55, roughness: 0.3 });   // half metal: under one bulb a full mirror reads as a black stick
let riceTex;
export function riceMaterial() {
  // cooked rice, grain by grain: a map and a bump from the same drawing
  riceTex ??= canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#d9d2c1'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * w, y = Math.random() * h, a = Math.random() * PI, l = 5 + Math.random() * 3;
      const v = 222 + Math.random() * 30 | 0;
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = `rgb(${v},${v - 4},${v - 14})`; c.beginPath(); c.ellipse(0, 0, l, l * 0.42, 0, 0, PI * 2); c.fill();
      c.strokeStyle = 'rgba(120,108,86,.35)'; c.lineWidth = 0.8; c.stroke();
      c.restore();
    }
  });
  riceTex.wrapS = riceTex.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({ map: riceTex, bumpMap: riceTex, bumpScale: 0.6, roughness: 0.62, color: 0xf2eee6 });
}

/* ---------------- kutsara at tinidor ----------------
   Both have their grip at the origin (where the fist closes), point toward +Z, and face +Y. */
function handleGeo(len, back = 0.0125, neck = 0.006) {
  const s = new THREE.Shape();
  s.moveTo(-neck / 2, 0); s.lineTo(-back / 2, -len * 0.82); s.quadraticCurveTo(-back / 2, -len, 0, -len); s.quadraticCurveTo(back / 2, -len, back / 2, -len * 0.82); s.lineTo(neck / 2, 0); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0022, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 1, curveSegments: 6 });
  g.rotateX(PI / 2); g.translate(0, 0.0011, 0);   // the length now runs along +Z (handle end at -len), thickness along Y
  return g;
}
export function spoon(m = steel()) {
  const g = new THREE.Group();
  const neckZ = 0.042;
  const pivot = new THREE.Group(); pivot.position.z = neckZ; pivot.rotation.x = 0.11; g.add(pivot);   // the handle rises a little from the bowl
  const h = new THREE.Mesh(handleGeo(0.122), m); h.castShadow = true; pivot.add(h);
  const cup = new THREE.SphereGeometry(1, 28, 8, 0, PI * 2, PI * 0.62, PI * 0.38); cup.translate(0, 0.368, 0);
  const bowl = new THREE.Mesh(cup, m.clone()); bowl.material.side = THREE.DoubleSide;
  bowl.scale.set(0.0185 / 0.93, 0.0075 / 0.632, 0.027 / 0.93); bowl.position.set(0, 0.0, neckZ + 0.026); bowl.castShadow = true; g.add(bowl);
  g.userData.tip = new THREE.Vector3(0, 0.002, neckZ + 0.026);   // the middle of the bowl: what goes in the mouth
  return g;
}
export function fork(m = steel()) {
  const g = new THREE.Group();
  const neckZ = 0.042;
  const pivot = new THREE.Group(); pivot.position.z = neckZ; pivot.rotation.x = 0.11; g.add(pivot);
  const h = new THREE.Mesh(handleGeo(0.122), m); h.castShadow = true; pivot.add(h);
  const head = new THREE.Group(); head.position.z = neckZ; head.rotation.x = -0.06; g.add(head);
  const base = box(0.022, 0.0022, 0.022, m); base.position.z = 0.011; head.add(base);
  for (let i = 0; i < 4; i++) { const t = box(0.0032, 0.0022, 0.03, m); t.position.set(-0.0093 + i * 0.0062, 0.0006, 0.036); t.rotation.x = -0.08; head.add(t); }
  g.userData.tip = new THREE.Vector3(0, 0, neckZ + 0.05);
  return g;
}

/* ---------------- plates, bowls, glasses ---------------- */
const plateM = () => new THREE.MeshPhysicalMaterial({ color: 0xeae6dc, roughness: 0.22, clearcoat: 0.5, clearcoatRoughness: 0.2 });
/** a real plate: a foot ring, a flat well and a sloping rim. r: the outer radius */
export function plate(r = 0.115, m = plateM()) {
  const k = r / 0.115;
  const pts = [[0, 0.0045], [0.066, 0.0045], [0.086, 0.0105], [0.11, 0.0185], [0.115, 0.0182], [0.113, 0.0158], [0.09, 0.0075], [0.064, 0.0015], [0.058, 0], [0.052, 0.0012], [0, 0.0018]]
    .map(([x, y]) => new THREE.Vector2(x * k, y * Math.min(1.15, k)));
  const p = new THREE.Mesh(new THREE.LatheGeometry(pts, 56), m); p.castShadow = true; p.receiveShadow = true;
  p.userData.top = 0.0045;
  return p;
}
/** a mound of rice off the sandok: irregular, grainy */
export function riceMound(r = 0.062, h = 0.036, m = riceMaterial(), seed = 1) {
  const g = new THREE.SphereGeometry(1, 40, 18, 0, PI * 2, 0, PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const lump = 1 + 0.07 * Math.sin(a * 3 + seed) + 0.05 * Math.sin(a * 7 + seed * 2.3) * Math.sin(y * 5 + seed) + 0.025 * Math.sin(a * 17 + y * 13);
    p.setXYZ(i, x * r * lump, Math.pow(Math.max(0, y), 0.85) * h * (1 + 0.06 * Math.sin(a * 2 + seed)), z * r * lump);
  }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
/** one spoonful, for the bowl of a spoon */
export function bite(m = riceMaterial()) { const b = riceMound(0.0135, 0.011, m, 3); b.castShadow = false; return b; }

/** a soup bowl (mangkok) with sabaw in it */
export function soupBowl(r = 0.075, soupColor = 0x6b5a2a) {
  const k = r / 0.075, m = plateM();
  const pts = [[0, 0.002], [0.035, 0.002], [0.036, 0], [0.042, 0], [0.06, 0.02], [0.073, 0.048], [0.075, 0.056], [0.071, 0.056], [0.069, 0.047], [0.056, 0.02], [0.04, 0.008], [0, 0.008]].map(([x, y]) => new THREE.Vector2(x * k, y * k));
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), m); b.castShadow = true; b.receiveShadow = true; g.add(b);
  const soup = new THREE.Mesh(new THREE.CircleGeometry(0.064 * k, 40), new THREE.MeshPhysicalMaterial({ color: soupColor, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 }));
  soup.rotation.x = -PI / 2; soup.position.y = 0.04 * k; g.add(soup);
  const veg = new THREE.MeshStandardMaterial({ color: 0x4f6b2a, roughness: 0.6 });
  for (let i = 0; i < 6; i++) { const a = i * 2.4 + 0.3, d = 0.012 + (i % 3) * 0.014; const v = box(0.016, 0.006, 0.011, veg); v.position.set(Math.cos(a) * d * k, 0.041 * k, Math.sin(a) * d * k); v.rotation.set(0.2, a, 0.1); g.add(v); }
  return g;
}
/** a fried galunggong, golden at the edges, darker on the back */
export function friedFish(len = 0.12) {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x7a4a1e, roughness: 0.42 }), d = new THREE.MeshStandardMaterial({ color: 0x4a2c12, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), m); body.scale.set(len * 0.2, len * 0.11, len * 0.42); body.position.y = len * 0.08; body.castShadow = true; g.add(body);
  const back = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 8), d); back.scale.set(len * 0.12, len * 0.06, len * 0.36); back.position.y = len * 0.15; g.add(back);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(len * 0.13, len * 0.2, 3), m); tail.scale.z = 0.25; tail.rotation.set(-PI / 2, 0, 0); tail.position.set(0, len * 0.07, -len * 0.5); g.add(tail);
  return g;
}
/** a plain drinking glass with water in it */
export function glass(r = 0.031, h = 0.1, fill = 0.62) {
  const g = new THREE.Group();
  const gm = new THREE.MeshPhysicalMaterial({ color: 0xeaf2f4, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.88, h, 28, 1, true), gm); wall.position.y = h / 2; wall.renderOrder = 3; g.add(wall);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 0.88, 0.006, 28), gm); base.position.y = 0.003; base.renderOrder = 3; g.add(base);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.85, h * fill, 28), new THREE.MeshPhysicalMaterial({ color: 0xc9dde3, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false }));
  water.position.y = 0.006 + h * fill / 2; water.renderOrder = 2; g.add(water);
  g.userData.h = h; g.userData.r = r;
  return g;
}

/* ---------------- the table ---------------- */
/** a plastic mantel draped over a w × d table whose top is at y = top: it rounds the edge and hangs, folding, longer at the corners */
export function mantel(w, d, top, over = 0.16) {
  const W = w + over * 2, Dp = d + over * 2;
  const geo = new THREE.PlaneGeometry(W, Dp, 120, 90); geo.rotateX(-PI / 2);
  const p = geo.attributes.position, r = 0.012, bend = r * PI / 2;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), cx = clamp(x, -w / 2, w / 2), cz = clamp(z, -d / 2, d / 2), ox = x - cx, oz = z - cz, dd = Math.hypot(ox, oz);
    if (dd < 1e-6) { p.setY(i, top); continue; }
    const nx = ox / dd, nz = oz / dd;
    const corner = Math.min(Math.abs(ox), Math.abs(oz)) / over;               // how far into a corner: the spare cloth stands out there
    const along = Math.abs(nx) > Math.abs(nz) ? cz : cx;
    let hx, hy;
    if (dd < bend) { const a = dd / r; hx = Math.sin(a) * r; hy = (1 - Math.cos(a)) * r; }
    else {
      const hang = dd - bend, flare = 0.05 + 0.32 * corner;
      const fold = Math.sin(along * 41 + (nx + nz) * 3) * 0.0045 + Math.sin(along * 97) * 0.0015;
      hx = r + hang * flare + fold * Math.min(1, hang / 0.05); hy = r + hang * Math.sqrt(1 - flare * flare);
    }
    p.setXYZ(i, cx + nx * hx, top - hy, cz + nz * hx);
  }
  geo.computeVertexNormals();
  const t = canvasTex(1024, 1024, (c, s) => {
    // a cheap printed floral: cream ground, red and pink roses, green leaves, little blue sprigs
    c.fillStyle = '#ece3cf'; c.fillRect(0, 0, s, s);
    const rose = (x, y, R, col, dark) => {
      for (let k = 0; k < 2; k++) { const lx = x + (k ? 1 : -1) * R * 1.3, ly = y + R * 0.9; c.fillStyle = '#4f7a3a'; c.beginPath(); c.ellipse(lx, ly, R * 0.95, R * 0.42, (k ? -0.6 : 0.6), 0, PI * 2); c.fill(); }
      for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2; c.fillStyle = col; c.beginPath(); c.ellipse(x + Math.cos(a) * R * 0.55, y + Math.sin(a) * R * 0.55, R * 0.62, R * 0.45, a, 0, PI * 2); c.fill(); }
      c.fillStyle = dark; c.beginPath(); c.arc(x, y, R * 0.42, 0, PI * 2); c.fill();
      c.strokeStyle = 'rgba(255,240,230,.45)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, R * 0.25, 0.3, 4.5); c.stroke();
    };
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const x = (i + (j % 2) * 0.5) * 256 + 64, y = j * 256 + 70;
      rose(x % s, y, 34, i % 2 ? '#c2414a' : '#d97a86', i % 2 ? '#8e2330' : '#b44e5c');
      c.fillStyle = '#5b7fa8'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc((x + 120 + k * 9) % s, y + 120 - k * 7, 5, 0, PI * 2); c.fill(); }
    }
    for (let i = 0; i < 9000; i++) { c.fillStyle = `rgba(80,60,40,${Math.random() * 0.04})`; c.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(W / 0.34, Dp / 0.34);
  const m = new THREE.MeshPhysicalMaterial({ map: t, color: 0xd9d2c6, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.35, side: THREE.DoubleSide });   // under a bare bulb a white mantel blows out
  const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; mesh.castShadow = true;
  return mesh;
}

/** a monobloc chair: one piece of moulded plastic, splayed legs, a curved slatted back. Faces +Z; seat top at 0.44 */
export function monobloc(color = 0xe7e4dc) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.45, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  const C = new THREE.Group(), up = new THREE.Vector3(0, 1, 0);
  const seat = box(0.43, 0.028, 0.41, m, 0.012); seat.position.set(0, 0.426, 0.0); C.add(seat);
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.41, 10), m); lip.rotation.z = PI / 2; lip.position.set(0, 0.418, 0.2); C.add(lip);  // the rolled front edge
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const top = new THREE.Vector3(sx * 0.18, 0.42, sz * 0.17), bot = new THREE.Vector3(sx * 0.225, 0, sz * 0.22), len = top.distanceTo(bot);
    const leg = box(0.05, len, 0.034, m, 0.012); leg.quaternion.setFromUnitVectors(up, top.clone().sub(bot).normalize()); leg.position.copy(top).add(bot).multiplyScalar(0.5); leg.castShadow = true; C.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 10), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8 })); foot.position.set(bot.x, 0.004, bot.z); C.add(foot);
  }
  const back = new THREE.Group(); back.position.set(0, 0.43, -0.185); back.rotation.x = -0.17; C.add(back);
  for (const sx of [-1, 1]) { const u = box(0.045, 0.44, 0.028, m, 0.01); u.position.set(sx * 0.195, 0.22, 0.0); back.add(u); }
  const band = (y, h) => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, h, 18, 1, true, PI - 0.39, 0.78), m); b.material.side = THREE.DoubleSide;
    b.position.set(0, y, 0.55 - 0.004); b.castShadow = true; back.add(b);
  };
  band(0.4, 0.075); band(0.3, 0.045); band(0.215, 0.045); band(0.13, 0.045); band(0.05, 0.03);
  C.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  C.userData.seat = 0.44;
  return C;
}

/** how far to lower a person's hips for the sit pose, so they sit ON a seat of this height (see Person SIT_K) */
export function sitY(person, seat = 0.44) { const s = person.s; return (seat + 0.045 * s - person.C.hipsY * s) / 0.79; }

/* ---------------- holding things ---------------- */
const _hA = new THREE.Vector3(), _hQ = new THREE.Quaternion(), _hQ2 = new THREE.Quaternion();
/** where a hand has to be so that the point `local` of a thing it holds (a child of that hand) lands at `at`, with the thing turned to q */
export function handTarget(prop, local, at, q, out = new THREE.Vector3()) {
  const inHand = _hA.copy(local).applyQuaternion(prop.quaternion).add(prop.position);
  _hQ.copy(q).multiply(_hQ2.copy(prop.quaternion).invert());
  return out.copy(inHand).applyQuaternion(_hQ).negate().add(at);
}
/** hold a thing at a place, turned a given way: the arm reaches and the hand turns. pos() and q() are read every frame */
export function holdAt(person, side, prop, local, pos, q, o = {}) {
  const out = new THREE.Vector3();
  person.reach(side, () => handTarget(prop, local, pos(), q(), out), { rate: o.rate ?? 8, pole: o.pole ?? (side === 'R' ? [-0.9, -1, -0.4] : [0.9, -1, -0.4]) });
  person.aim(side, prop, q, { rate: o.rate ?? 8, bend: o.bend ?? 1.1, roll: o.roll ?? 1.6 });
}

/* ---------------- eating ---------------- */
/**
 * Someone eating with kutsara (right hand) and tinidor (left), the Filipino way.
 * The spoon goes plate → mouth → plate in a believable rhythm: a scoop helped by the fork, the lift, the head coming down to meet it,
 * the lips closing, the chew. The rice on the plate goes down a little with every spoonful.
 * o: { plate (Object3D), rice (mound), period, phase, bites, fwd (Vector3 the person faces) }
 */
export class Eater {
  constructor(p, o) {
    this.p = p; Object.assign(this, { period: 5, phase: 0, lean: 8, neck: 20 }, o);
    const m = o.riceMat;
    this.spoon = spoon(); this.fork = fork();
    this.bite = bite(m); this.bite.position.copy(this.spoon.userData.tip).add(new THREE.Vector3(0, -0.003, 0)); this.bite.visible = false; this.spoon.add(this.bite);
    // held the everyday way: the handle lies along the first two fingers, the thumb on top, the bowl going on past the fingertips
    const hs = p.s / 0.9;   // hands scale with the body
    const g = o.grip ?? [0.006, -0.088, 0.022];
    this.spoon.position.set(g[0] * hs, g[1] * hs, g[2] * hs);
    this.fork.position.set(-g[0] * hs, g[1] * hs, g[2] * hs);
    facing(new THREE.Vector3(0, -0.8, 0.6), new THREE.Vector3(-1, 0, 0), this.spoon.quaternion);   // right hand: the hollow faces the back of the hand
    facing(new THREE.Vector3(0, -0.8, 0.6), new THREE.Vector3(1, 0, 0), this.fork.quaternion);
    this.held = [[this.spoon, p.arm.R.wr, this.spoon.position.clone(), this.spoon.quaternion.clone()], [this.fork, p.arm.L.wr, this.fork.position.clone(), this.fork.quaternion.clone()]];
    this.hold();
    this.mouth = new THREE.Object3D();
    (p.real ? p.real.headFrame() : p.head).add(this.mouth);
    this.mouth.position.set(0, o.mouthY ?? 0.036, o.mouthZ ?? 0.088);
    this.B = new THREE.Vector3(); this.F = new THREE.Vector3(); this.qS = new THREE.Quaternion(); this.qF = new THREE.Quaternion();
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this.on = false; this.done = 0; this.last = -1;
  }

  /** where a point on a held thing is, given where the thing has to be and how it faces: the hand target */
  handFor(prop, at, q, out) {
    const local = this._b.copy(prop.userData.tip).applyQuaternion(prop.quaternion).add(prop.position);   // the point, in the hand's space
    return out.copy(local).applyQuaternion(this._q2.copy(q).multiply(this._q.copy(prop.quaternion).invert())).negate().add(at);
  }

  /** spoon and fork back in the hands that hold them */
  hold() { for (const [o, hand, pos, q] of this.held) { hand.add(o); o.position.copy(pos); o.quaternion.copy(q); } }

  start(t0 = 0) {
    const p = this.p; this.on = true; this.t0 = t0; this.hold();
    p.grip('R', 'pinch'); p.grip('L', 'pinch');
    const hR = new THREE.Vector3(), hL = new THREE.Vector3();
    p.reach('R', () => this.handFor(this.spoon, this.B, this.qS, hR), { rate: 30, pole: [-0.9, -1, -0.5] });
    p.reach('L', () => this.handFor(this.fork, this.F, this.qF, hL), { rate: 30, pole: [0.9, -1, -0.5] });
    p.aim('R', this.spoon, () => this.qS, { rate: 30, bend: 1.1, roll: 1.7 });
    p.aim('L', this.fork, () => this.qF, { rate: 30, bend: 1.1, roll: 1.7 });
    p.anim = (t, q, dt) => this.tick(t, dt);
    this.tick(t0, 0);
  }
  stop() {
    const p = this.p; this.on = false; p.anim = null; p.chew = 0;
    p.reach('R', null); p.reach('L', null); p.aim('R', null); p.aim('L', null);
  }

  tick(t) {
    const p = this.p, root = p.root, fwd = this._a.set(Math.sin(root.rotation.y), 0, Math.cos(root.rotation.y));
    const left = new THREE.Vector3(fwd.z, 0, -fwd.x);   // the person's own left
    const pl = this.plate.getWorldPosition(new THREE.Vector3()), top = pl.y + 0.0045;
    const n = Math.floor((t - this.t0) / this.period + this.phase), u = ((t - this.t0) / this.period + this.phase) % 1;
    if (n !== this.last) {   // a new spoonful: somewhere else on the rice each time
      this.last = n; const r = Math.sin(n * 12.9898 + this.phase * 78.2) * 43758.5; this.pick = (r - Math.floor(r)) * 2 - 1;
      if (n > 0 && this.rice) { this.done++; this.rice.scale.y = Math.max(0.35, 1 - this.done * 0.05); this.rice.scale.x = this.rice.scale.z = Math.max(0.7, 1 - this.done * 0.02); }
    }
    const riceTop = top + (this.rice ? 0.026 * this.rice.scale.y : 0);
    // the scoop: in at the near side of the rice, across, a little up
    const side = left.clone().multiplyScalar(0.02 * this.pick);
    const s0 = pl.clone().addScaledVector(fwd, 0.035).add(side).setY(riceTop - 0.006);
    const s1 = pl.clone().addScaledVector(fwd, -0.01).add(side).setY(riceTop + 0.004);
    const rest = pl.clone().addScaledVector(fwd, -0.06).addScaledVector(left, -0.05).setY(top + 0.016);
    const mouth = this.mouth.getWorldPosition(new THREE.Vector3());
    const near = mouth.clone().addScaledVector(fwd, 0.05).add(new THREE.Vector3(0, -0.025, 0));
    const inMouth = mouth.clone().addScaledVector(fwd, 0.004);
    // spoon facings: across the plate, tip a little down; into the mouth from in front, below and to the right
    const qPlate = facing(fwd.clone().applyAxisAngle(_y.set(0, 1, 0), 0.5).add(new THREE.Vector3(0, -0.22, 0)), new THREE.Vector3(0, 1, 0), this._q2.clone());
    const qMouth = facing(fwd.clone().multiplyScalar(-0.75).addScaledVector(left, 0.3).add(new THREE.Vector3(0, 0.5, 0)), new THREE.Vector3(0, 1, 0), new THREE.Quaternion());
    let raise = 0;
    const B = this.B;
    if (u < 0.2) { const k = mj(span(u, 0.02, 0.2)); B.lerpVectors(rest, s0, mj(span(u, 0, 0.07))).lerp(s1, k); this.qS.copy(qPlate); this.bite.visible = u > 0.12; }
    else if (u < 0.42) { const k = mj(span(u, 0.2, 0.42)); B.lerpVectors(s1, near, k); B.y += Math.sin(k * PI) * 0.035; this.qS.slerpQuaternions(qPlate, qMouth, mj(span(u, 0.2, 0.38))); raise = k; this.bite.visible = true; }
    else if (u < 0.5) { const k = mj(span(u, 0.42, 0.5)); B.lerpVectors(near, inMouth, k); this.qS.copy(qMouth); raise = 1; this.bite.visible = u < 0.47; }
    else if (u < 0.58) { const k = mj(span(u, 0.5, 0.58)); B.lerpVectors(inMouth, near, k); this.qS.copy(qMouth); raise = 1 - k * 0.3; this.bite.visible = false; }
    else if (u < 0.78) { const k = mj(span(u, 0.58, 0.78)); B.lerpVectors(near, rest, k); B.y += Math.sin(k * PI) * 0.02; this.qS.slerpQuaternions(qMouth, qPlate, mj(span(u, 0.6, 0.76))); raise = 0.7 * (1 - k); this.bite.visible = false; }
    else { B.copy(rest); this.qS.copy(qPlate); this.bite.visible = false; }
    // the fork holds the rice from the other side, and pushes it onto the spoon
    const push = Math.sin(span(u, 0.04, 0.2) * PI);
    this.F.copy(pl).addScaledVector(fwd, -0.035).addScaledVector(left, 0.05 - push * 0.018).setY(top + 0.004 + (1 - push) * 0.004);
    facing(fwd.clone().applyAxisAngle(_y.set(0, 1, 0), -0.6).add(new THREE.Vector3(0, -0.5, 0)), new THREE.Vector3(0, 1, 0), this.qF);
    // the body: lean in over the plate; the head comes down to meet the spoon; the jaw opens for it and chews after
    p.spine.rotation.x += (this.lean + raise * 4) * PI / 180;
    p.neck.rotation.x += (this.neck + raise * 6) * PI / 180;
    const open = Math.max(0, Math.sin(span(u, 0.38, 0.54) * PI)) * 0.42;
    const chew = u > 0.56 ? Math.abs(Math.sin((u - 0.56) * this.period * PI * 1.6)) * 0.14 * (u < 0.98 ? 1 : 0) : 0;
    p.chew = Math.max(open, chew);
  }
}

/** an aluminium kaldero with its lid on: rolled rim, two black grips, a knob */
export function kaldero(r = 0.095) {
  const g = new THREE.Group(), al = new THREE.MeshStandardMaterial({ color: 0xb9bdc0, metalness: 0.85, roughness: 0.42 }), blk = new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.55 });
  const k = r / 0.095;
  const body = [[0, 0], [0.086, 0], [0.095, 0.009], [0.095, 0.102], [0.0985, 0.105], [0.0985, 0.109], [0.093, 0.109], [0.091, 0.102], [0.091, 0.012], [0.084, 0.004], [0, 0.004]].map(([x, y]) => new THREE.Vector2(x * k, y * k));
  const pot = new THREE.Mesh(new THREE.LatheGeometry(body, 48), al); pot.castShadow = pot.receiveShadow = true; g.add(pot);
  const lidP = [[0, 0.028], [0.03, 0.026], [0.07, 0.016], [0.094, 0.004], [0.099, 0], [0.096, -0.002], [0.0, 0.024]].map(([x, y]) => new THREE.Vector2(x * k, y * k));
  const lid = new THREE.Mesh(new THREE.LatheGeometry(lidP, 48), al); lid.position.y = 0.109 * k; lid.castShadow = true; g.add(lid);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * k, 0.016 * k, 0.018 * k, 16), blk); knob.position.y = (0.109 + 0.028 + 0.009) * k; g.add(knob);
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.TorusGeometry(0.016 * k, 0.0045 * k, 6, 14, PI), blk); h.rotation.set(PI / 2, 0, sx > 0 ? -PI / 2 : PI / 2); h.position.set(sx * 0.097 * k, 0.09 * k, 0); g.add(h);
  }
  return g;
}

/** a plastic water pitcher, half full, coloured lid */
export function pitcher() {
  const g = new THREE.Group();
  const pm = new THREE.MeshPhysicalMaterial({ color: 0x9cc6d2, roughness: 0.22, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
  const P = [[0, 0.002], [0.05, 0.002], [0.056, 0.008], [0.06, 0.06], [0.061, 0.15], [0.057, 0.2], [0.059, 0.205]].map(([x, y]) => new THREE.Vector2(x, y));
  const w = new THREE.Mesh(new THREE.LatheGeometry(P, 40), pm); w.renderOrder = 3; g.add(w);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.053, 0.11, 32), new THREE.MeshPhysicalMaterial({ color: 0xb8d6de, roughness: 0.05, transparent: true, opacity: 0.32, depthWrite: false }));
  water.position.y = 0.06; water.renderOrder = 2; g.add(water);
  const lidM = new THREE.MeshStandardMaterial({ color: 0x2f6f9a, roughness: 0.45 });
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.061, 0.06, 0.016, 32), lidM); lid.position.y = 0.212; lid.castShadow = true; g.add(lid);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.009, 8, 20, PI), pm.clone()); handle.material.opacity = 0.7; handle.material.depthWrite = true;
  handle.rotation.z = -PI / 2; handle.scale.set(1, 0.55, 1); handle.position.set(-0.058, 0.115, 0); g.add(handle);
  return g;
}
