import * as THREE from 'three';
import { tex } from './kit.js';
import { RealBody, realModel } from './realbody.js';
import { config, bodyParts, scaled, handGeometry, footGeometry, headGeometry, longHair, chestDecal, scalpCap, hairTufts, BIND, FOOT, BONES } from './body.js';

/*
  Procedural person. Faces +Z. Origin at the feet.
  The body is one skinned surface per material (see body.js), so elbows, knees, shoulders and hips bend without gaps,
  and sleeves and pants move with the limb inside them.
  Real standing height is about 0.9 × h.

  Joint conventions:
   - limbs hang along -Y; rotation.x < 0 swings them forward (+Z)
   - knee/elbow: knee.x > 0 bends the shin back; elbow.x < 0 bends the forearm forward
   - ankle: an.x < 0 lifts the toes
   - neck.x > 0 looks down, neck.y > 0 turns to the person's left (+X)

  Clothing options on top of the usual ones:
   tank (sleeveless with straps), collar (polo), print + printSize + printY (chest print texture),
   slippers (flip-flops; true or a colour), soleColor, female (auto from hair/skirt/tank if left out)
*/
const D = THREE.MathUtils.degToRad;
const SKIN = { light: 0xc08a64, tan: 0xa5714c, brown: 0x8a5a3a, dark: 0x6e4429 };
const SIT_K = 0.79;   // pose "y" values were written for the old, longer legs
const IDENTITY = new THREE.Matrix4();
const TAU = Math.PI * 2;
const _ikT = new THREE.Vector3(), _ikD = new THREE.Vector3(), _ikN = new THREE.Vector3(), _ikW = new THREE.Vector3(), _ikE = new THREE.Vector3(), _ikP = new THREE.Vector3(), _ikC = new THREE.Vector3(), _ikM = new THREE.Matrix4(), _ikQ = new THREE.Quaternion(), _ikR = new THREE.Quaternion();
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const minjerk = t => t * t * t * (10 + t * (6 * t - 15));

function mat(color, rough = 0.85, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...o }); }
function cloth(color, rough = 0.92) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, normalMap: tex('/tex/denim_fabric_nor.jpg', { repeat: [4, 4], srgb: false }) });
  m.normalScale.set(0.55, 0.55); return m;
}
function skinMat(color) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.58, sheen: 0.25, sheenColor: new THREE.Color(0xff9a7a), sheenRoughness: 0.6, clearcoat: 0.05 });
}
function mesh(geo, m) { const x = new THREE.Mesh(geo, m); x.castShadow = true; x.receiveShadow = true; return x; }

const geoCache = new Map();
function fitted(key, geo, s) { const k = key + '|' + s.toFixed(3); if (!geoCache.has(k)) geoCache.set(k, scaled(geo, s)); return geoCache.get(k); }

export class Person {
  constructor(o = {}) {
    const H = this.H = o.h || 1.68;
    const s = this.s = H / 1.7;
    const kid = H < 1.4;
    this.o = o;
    const C = this.C = config({ ...o, h: H });
    const skin = skinMat(SKIN[o.skin] ?? o.skin ?? SKIN.tan);
    const top = o.topMat || cloth(o.top ?? 0x6d7a86);
    const bottom = o.bottomMat || cloth(o.bottom ?? 0x2a2d33);
    const hairM = mat(o.hairColor ?? 0x0d0b0a, 0.5);
    this.skinMat = skin; this.topMat = top;

    // ---- skeleton ----
    const root = this.root = new THREE.Group();
    const bone = (parent, x, y, z) => { const b = new THREE.Bone(); b.position.set(x * s, y * s, z * s); parent.add(b); return b; };
    const hips = this.hips = bone(root, 0, C.hipsY, 0);
    const spine = this.spine = bone(hips, 0, C.spineY - C.hipsY, 0);
    const chest = this.chest = bone(spine, 0, C.chestY - C.spineY, 0);
    const neck = this.neck = bone(chest, 0, C.neckY - C.chestY, 0);
    const head = this.head = bone(neck, 0, 0.062, 0);
    this.arm = {}; this.leg = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const sh = bone(spine, sx * C.shX, C.shY - C.spineY, 0), el = bone(sh, 0, -C.ua, 0), wr = bone(el, 0, -C.fa, 0);
      this.arm[side] = { sh, el, wr };
      const hp = bone(hips, sx * C.hipX, C.hipJ - C.hipsY, 0), kn = bone(hp, 0, C.kneeY - C.hipJ, 0), an = bone(kn, 0, C.ankleY - C.kneeY, 0), toe = bone(an, 0, FOOT.ballY, FOOT.ballZ);
      this.leg[side] = { hp, kn, an, toe };
    }
    const named = { hips, spine, chest, neck, head };
    for (const side of ['L', 'R']) { named['sh' + side] = this.arm[side].sh; named['el' + side] = this.arm[side].el; named['wr' + side] = this.arm[side].wr; named['hp' + side] = this.leg[side].hp; named['kn' + side] = this.leg[side].kn; named['an' + side] = this.leg[side].an; named['toe' + side] = this.leg[side].toe; }
    const bones = BONES.map(n => named[n]);

    // ---- bind in the A-pose the surfaces were modelled in ----
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      this.arm[side].sh.rotation.z = sx * BIND.arm;
      this.leg[side].hp.rotation.z = sx * BIND.leg; this.leg[side].an.rotation.z = -sx * BIND.leg;
    }
    root.updateMatrixWorld(true);
    const skeleton = this.skeleton = new THREE.Skeleton(bones);
    const anklePos = { L: this.leg.L.an.getWorldPosition(new THREE.Vector3()), R: this.leg.R.an.getWorldPosition(new THREE.Vector3()) };
    const skinned = (geo, m, parent = root) => {
      const x = new THREE.SkinnedMesh(geo, m); x.bind(skeleton, IDENTITY); x.frustumCulled = false; x.castShadow = true; x.receiveShadow = true; parent.add(x); return x;
    };

    // ---- surfaces ----
    const parts = bodyParts(C);
    this.torso = skinned(fitted(C.key + 'top', parts.top, s), top);
    this.bottom = skinned(fitted(C.key + 'bot', parts.bottom, s), bottom);
    this.skin = skinned(fitted(C.key + 'skin', parts.skin, s), skin);

    // hands
    const hg = handGeometry();
    for (const side of ['L', 'R']) { const h = mesh(hg[side], skin); h.scale.setScalar(s); this.arm[side].wr.add(h); this.arm[side].hand = h; }

    // feet
    const kind = o.slippers ? 'slipper' : o.barefoot ? 'bare' : 'shoe';
    const footM = kind === 'shoe' ? mat(o.shoes ?? 0x1c1c1c, 0.7) : skin;
    const soleM = mat(kind === 'slipper' ? (o.slippers === true ? 0x17181b : o.slippers) : (o.soleColor ?? 0x3a3835), 0.8);
    for (const side of ['L', 'R']) {
      const fg = footGeometry(kind, side), put = geo => {
        const g = scaled(geo, s), p = g.attributes.position, a = anklePos[side];
        for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + a.x, p.getY(i) + a.y, p.getZ(i) + a.z);
        return g;
      };
      skinned(put(fg.main), footM); if (fg.sole) skinned(put(fg.sole), soleM);
    }

    // skinning pinches the outside of a hard bend, so a ball at each elbow and knee keeps the joint round
    const l = C.limb, inShorts = C.shorts || C.skirt;
    for (const side of ['L', 'R']) {
      const eb = mesh(new THREE.SphereGeometry(0.0345 * l * s, 12, 10), C.long ? top : skin); this.arm[side].el.add(eb);
      const kb = mesh(new THREE.SphereGeometry((inShorts ? 0.045 * l : 0.056 * l + 0.002) * s, 14, 10), inShorts ? skin : bottom); this.leg[side].kn.add(kb);
    }

    // back to the rest pose
    for (const side of ['L', 'R']) { this.arm[side].sh.rotation.z = 0; this.leg[side].hp.rotation.z = 0; this.leg[side].an.rotation.z = 0; }

    // chest print + polo buttons
    if (o.print) {
      const size = o.printSize ?? [0.2, 0.16], y = o.printY ?? 1.13;
      const d = new THREE.Mesh(chestDecal(C, parts, size, y), new THREE.MeshStandardMaterial({ map: o.print, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }));
      d.position.y = -C.spineY * s; d.scale.setScalar(s); spine.add(d); this.print = d;
    }
    if (o.collar) {
      const bm = mat(new THREE.Color(o.top ?? 0x6d7a86).multiplyScalar(0.72).getHex(), 0.5);
      for (const y of [1.205, 1.165]) { let z = 0.2; for (let k = 0; k < 60; k++) { const d = parts.topField(0, y, z); if (d < 0.0008) break; z -= Math.max(d, 0.0008); } const b = mesh(new THREE.SphereGeometry(0.0052 * s, 8, 6), bm); b.scale.z = 0.5; b.position.set(0, (y - C.spineY) * s, (z + 0.002) * s); spine.add(b); }
    }

    // ---- head ----
    const hr = (kid ? 0.105 : 0.098) * s;
    this.hr = hr;
    const face = mesh(headGeometry(C.female), skin); face.scale.setScalar(hr); head.add(face);
    const scl = mat(0xa79c8e, 0.3), iris = new THREE.MeshStandardMaterial({ color: 0x170d08, roughness: 0.1 }), browM = mat(o.hairColor ?? 0x120d0a, 0.9);
    this.eyes = []; this.brows = [];
    for (const sx of [-1, 1]) {
      const e = new THREE.Group(); e.position.set(sx * hr * 0.36, hr * 0.965, hr * 0.79); head.add(e);
      const w = mesh(new THREE.SphereGeometry(hr * 0.15, 14, 10), scl); w.scale.set(1.04, 0.8, 0.8); e.add(w);
      const ir = mesh(new THREE.SphereGeometry(hr * 0.086, 12, 8), iris); ir.position.set(0, 0, hr * 0.086); ir.scale.z = 0.55; e.add(ir);
      this.eyes.push(e);
      const b = mesh(new THREE.BoxGeometry(hr * 0.34, hr * 0.05, hr * 0.07), browM); b.position.set(sx * hr * 0.37, hr * 1.17, hr * 0.92); b.rotation.z = -sx * 0.08; head.add(b); this.brows.push(b); b.userData.sx = sx;
    }
    // mouth: a thin arc we bend for expressions
    const mouthGeo = new THREE.TorusGeometry(hr * 0.2, hr * 0.018, 6, 16, Math.PI * 0.7).rotateZ(Math.PI * 1.15);
    const mouth = this.mouth = mesh(mouthGeo, new THREE.MeshStandardMaterial({ color: 0x3a1a14, roughness: 0.7 }));
    mouth.position.set(0, hr * 0.5, hr * 0.965); head.add(mouth);
    this.mouthBase = mouth.position.y;

    // hair
    this.hair = new THREE.Group(); head.add(this.hair);
    const style = o.hair ?? 'short';
    if (style !== 'none') {
      const cap = mesh(scalpCap(style === 'buzz' ? 0.92 : 1), hairM); cap.scale.setScalar(hr); this.hair.add(cap);
      if (style !== 'buzz') {
        const tufts = mesh(hairTufts(style, !!o.cap), o.tuftMat ?? hairM); tufts.scale.setScalar(hr); this.hair.add(tufts); tufts.material.side = THREE.DoubleSide;
      }
      if (style === 'long') {
        const strands = skinned(fitted('hair' + C.key + hr.toFixed(4), longHair(C, hr / s), s), mat(o.hairColor ?? 0x0d0b0a, o.hairRough ?? 0.34, { side: THREE.DoubleSide }), this.hair);
        this.strands = strands;
      }
      if (style === 'bun' && !o.cap) { const bun = mesh(new THREE.SphereGeometry(hr * 0.38, 14, 10), hairM); bun.position.set(0, hr * 1.25, -hr * 1.08); this.hair.add(bun); }
    }
    if (o.cap) { // crew cap with visor (shades the eyes)
      const cm = mat(o.cap, 0.8);
      const crown = mesh(new THREE.SphereGeometry(hr, 26, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), cm); crown.userData.keep = true; crown.position.set(0, hr * 1.2, -hr * 0.09); crown.rotation.x = -0.2; crown.scale.set(1.0, 0.93, 1.13); head.add(crown);
      const band = mesh(new THREE.CylinderGeometry(hr, hr * 1.005, hr * 0.14, 26, 1, true), cm); band.userData.keep = true; band.position.set(0, hr * 1.17, -hr * 0.09); band.rotation.x = -0.2; band.scale.set(1.0, 1, 1.13); head.add(band);
      const visor = mesh(new THREE.CylinderGeometry(hr * 0.8, hr * 0.8, hr * 0.045, 22, 1, false, -Math.PI * 0.5, Math.PI), cm); visor.userData.keep = true; visor.position.set(0, hr * 1.3, hr * 0.72); visor.rotation.x = 0.1; visor.scale.set(0.95, 1, 0.95); head.add(visor);
    }
    if (o.scarf) { // lola's shawl / kerchief over head and shoulders
      const sm = mat(o.scarf, 0.95, { side: THREE.DoubleSide });
      const hood = mesh(new THREE.SphereGeometry(hr * 1.14, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), sm); hood.position.y = hr * 0.98; hood.rotation.x = D(-20); hood.scale.set(0.98, 1.08, 1.06); head.add(hood);
      const drape = mesh(new THREE.CylinderGeometry(0.11 * s, 0.24 * s, 0.32 * s, 20, 1, true), sm); drape.position.y = -0.1 * s; drape.scale.z = 0.7; chest.add(drape);
    }

    // ---- pose state ----
    this.joints = this.collect();
    this.target = {}; this.base = {};
    for (const k in this.joints) { this.target[k] = this.joints[k].rotation.clone(); this.base[k] = { x: 0, y: 0, z: 0 }; }
    this.rootY = 0; this.rootYTarget = 0;
    this.lookTarget = null; this.lookAmt = 1; this.lookW = 0; this.lookYaw = 0; this.lookPitch = 0;
    this.expr = { smile: 0, sad: 0, worry: 0 }; this.exprT = { smile: 0, sad: 0, worry: 0 };
    this.walk = 0; this.W = 0; this.walkPhase = Math.random(); this.vel = 0; this.turnTo = null;
    this.l1 = (C.hipJ - C.kneeY) * s; this.l2 = (C.kneeY - C.ankleY) * s; this.ll = C.hipJ * s;
    this.stride = this.ll * 1.5; this._p = root.position.clone();
    this.breath = Math.random() * 6; this.blinkT = Math.random() * 3;
    this.anim = null; // custom per-frame animation fn(t, person)
    this.speed = 6;
    this.pose('stand', true);
    const rec = o.real && realModel(o.real);
    if (rec) { // the procedural person keeps working as the puppet; the scanned body copies it (see realbody.js)
      root.updateMatrixWorld(true);
      root.traverse(n => { if (n.isMesh && !n.userData.keep) n.visible = false; });
      this.real = new RealBody(this, rec, { ...o.realOpts, role: o.real }); root.add(this.real.group);
      // the procedural cap never fit a real head: it sat across the face. The real body wears its own.
      root.traverse(n => { if (n.userData.keep) n.visible = false; });
      if (o.cap) this.real.wearCap(o.cap, o.capOpts);
    }
  }

  collect() {
    const j = { hips: this.hips, spine: this.spine, chest: this.chest, neck: this.neck };
    for (const s of ['L', 'R']) { j['sh' + s] = this.arm[s].sh; j['el' + s] = this.arm[s].el; j['wr' + s] = this.arm[s].wr; j['hp' + s] = this.leg[s].hp; j['kn' + s] = this.leg[s].kn; j['an' + s] = this.leg[s].an; }
    return j;
  }

  /** set target rotations. p: { joint: [x,y,z] in degrees } */
  set(p, instant = false) {
    for (const k in p) {
      if (k === 'y') { this.rootYTarget = p.y; if (instant) this.rootY = p.y; continue; }
      const v = p[k]; this.target[k].set(D(v[0] || 0), D(v[1] || 0), D(v[2] || 0));
      if (instant) { const t = this.target[k], b = this.base[k]; b.x = t.x; b.y = t.y; b.z = t.z; this.joints[k].rotation.copy(t); }
    }
    return this;
  }

  pose(name, instant = false) {
    const P = POSES[name]; if (!P) return this;
    const base = {}; for (const k in this.joints) base[k] = [0, 0, 0];
    Object.assign(base, { shL: [0, 0, 6], shR: [0, 0, -6], elL: [-8, 0, 0], elR: [-8, 0, 0], y: 0 });
    const p = typeof P === 'function' ? P(this) : P;
    return this.set({ ...base, ...p }, instant);
  }

  /** darken the whole figure (k=1 normal, k≈0.15 silhouette) so procedural faces never read in key shots */
  shade(k) {
    this.root.traverse(o => {
      if (!o.isMesh || !o.material.color) return;
      const m = o.material; m.userData.c0 ??= m.color.clone();
      m.color.copy(m.userData.c0).multiplyScalar(k);
    });
    return this;
  }

  expression(e) { Object.assign(this.exprT, { smile: 0, sad: 0, worry: 0 }, e); return this; }
  look(target, amt = 1) { this.lookTarget = target; this.lookAmt = amt; return this; }

  /**
   * Bring a hand to a point in the world and keep it there: reach('R', target) with a Vector3 or Object3D (or a function
   * returning one, read every frame), reach('R', null) to let go. The arm is solved each frame, so the hand really arrives,
   * whatever the body is doing. The weight eases in and out, so it never snaps. o: { rate, w, wrist: [x,y,z] degrees,
   * pole: [x,y,z] where the elbow should point, in the person's own space }
   */
  reach(side, target, o = {}) {
    const ik = this.ik ??= {}, a = ik[side] ??= { w: 0, goal: 0, off: new THREE.Vector3(), target: null };
    if (target == null) { a.goal = 0; a.rate = o.rate ?? 6; return this; }
    a.target = target; a.goal = o.w ?? 1; a.rate = o.rate ?? 6; a.wrist = o.wrist ?? null; a.pole = o.pole ?? null; a.twist = o.twist ?? 0;
    return this;
  }

  solveArms(dt) {
    for (const side of ['L', 'R']) {
      const a = this.ik[side]; if (!a) continue;
      a.w += (a.goal - a.w) * (1 - Math.exp(-a.rate * dt));
      if (a.goal === 0 && a.w < 0.003) { a.w = 0; a.target = null; a.off.set(0, 0, 0); continue; }
      if (!a.target) continue;
      const arm = this.arm[side], sp = arm.sh.parent, sx = side === 'L' ? 1 : -1;
      sp.updateWorldMatrix(true, false);
      const raw = typeof a.target === 'function' ? a.target() : a.target;
      const tw = _ikT; if (raw.isVector3) tw.copy(raw); else raw.getWorldPosition(tw);
      a.world = (a.world ??= new THREE.Vector3()).copy(tw);
      _ikM.copy(sp.matrixWorld).invert();
      const d = _ikD.copy(tw).applyMatrix4(_ikM).add(a.off).sub(arm.sh.position);
      const ua = -arm.el.position.y, fa = -arm.wr.position.y, reach = (ua + fa) * 0.985;
      const L = THREE.MathUtils.clamp(d.length(), Math.abs(ua - fa) + 0.02, reach);
      const e = Math.PI - Math.acos(clamp((ua * ua + fa * fa - L * L) / (2 * ua * fa), -1, 1));
      const dir = _ikN.copy(d).normalize();
      const w0 = _ikW.set(0, -ua - fa * Math.cos(e), fa * Math.sin(e)).normalize();
      const q = _ikQ.setFromUnitVectors(w0, dir);
      // swing the elbow round the shoulder-to-hand line until it points where an elbow would: down and out
      const el = _ikE.set(0, -1, 0).applyQuaternion(q), po = _ikP.set(...(a.pole || [sx * 0.75, -1, -0.35]));
      el.addScaledVector(dir, -el.dot(dir)); po.addScaledVector(dir, -po.dot(dir));
      if (el.lengthSq() > 1e-6 && po.lengthSq() > 1e-6) {
        el.normalize(); po.normalize();
        const ang = Math.atan2(_ikC.copy(el).cross(po).dot(dir), el.dot(po));
        q.premultiply(_ikR.setFromAxisAngle(dir, ang));
      }
      arm.sh.quaternion.slerp(q, a.w);
      arm.el.rotation.x += (-e - arm.el.rotation.x) * a.w; arm.el.rotation.y += (D(a.twist) - arm.el.rotation.y) * a.w; arm.el.rotation.z *= 1 - a.w;
      if (a.wrist) { const w = arm.wr.rotation; w.x += (D(a.wrist[0]) - w.x) * a.w; w.y += (D(a.wrist[1]) - w.y) * a.w; w.z += (D(a.wrist[2]) - w.z) * a.w; }
    }
  }

  /** the scanned arm is not quite the puppet's length: nudge the aim by what's left over, so the visible hand lands on the spot */
  settleArms() {
    for (const side of ['L', 'R']) {
      const a = this.ik[side]; if (!a || !a.world || a.w < 0.5) continue;
      const hand = this.real.hand[side]; hand.updateWorldMatrix(true, false);
      const err = _ikD.copy(a.world).sub(_ikT.setFromMatrixPosition(hand.matrixWorld));
      const sp = this.arm[side].sh.parent;
      _ikQ.setFromRotationMatrix(_ikM.extractRotation(sp.matrixWorld)).invert();
      err.applyQuaternion(_ikQ);
      a.off.addScaledVector(err, 0.3);
      if (a.off.length() > 0.14) a.off.setLength(0.14);
    }
  }

  /** where the ankle is for a leg at gait phase f (0 = heel strike, 0..duty = on the ground). Writes this.g */
  footAt(f, L, g) {
    const duty = 0.62, s = this.s, ah = FOOT.ankleH * s, ball = FOOT.ballZ * s, heel = FOOT.heelZ * s;
    const front = L * 0.265;
    const amp = clamp(L / (1.55 * this.ll), 0.55, 1.1), P0 = 0.3 * amp, Pm = 1.08 * amp;
    const plant = (u, z) => {
      const P = u < 0.14 ? P0 * (1 - sstep(0, 0.14, u)) : u > 0.52 ? -Pm * Math.pow((u - 0.52) / 0.48, 1.6) : 0;
      const c = Math.cos(P), sn = Math.sin(P), oz = P > 0 ? heel : P < 0 ? ball : 0, oy = -ah;
      const ry = oy * c + oz * sn, rz = -oy * sn + oz * c;
      g.y = -ry; g.z = z + oz - rz; g.pitch = P; g.toe = P < 0 ? Math.max(P, -0.95) : 0;
    };
    if (f < duty) { plant(f / duty, front - f * L); return; }
    const v = (f - duty) / (1 - duty);
    plant(1, front - duty * L); const y0 = g.y, z0 = g.z, toe0 = g.toe;
    plant(0, front); const y1 = g.y, z1 = g.z;
    const e = minjerk(v), lift = (0.05 * s + 0.028 * L) * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.12)), 1.3) * (1 - 0.3 * v);
    g.y = lerp(y0, y1, e) + lift; g.z = lerp(z0, z1, e);
    g.pitch = lerp(-Pm, P0, minjerk(clamp(v * 1.2, 0, 1))); g.toe = toe0 * (1 - sstep(0, 0.4, v));
  }

  /** two-bone leg IK in the walking plane, so a planted foot really stays planted */
  gaitLeg(side, f, hipY, hipZ, tilt, out) {
    const g = this._g ??= { y: 0, z: 0, pitch: 0, toe: 0 }, l1 = this.l1, l2 = this.l2;
    this.footAt(f, this.stride, g);
    const dy = hipY - g.y, dz = g.z - hipZ, reach = (l1 + l2) * 0.9985, d = Math.min(Math.hypot(dy, dz), reach);
    const th = Math.atan2(dz, dy);
    const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const ga = Math.acos(clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1, 1));
    out.hp = -(th + a) - tilt; out.kn = Math.PI - ga; out.an = -g.pitch - out.hp - out.kn - tilt; out.toe = g.toe; out.dy = dy;
  }

  gait(dt) {
    const r = this.root.position, p = this._p;
    let ds = Math.hypot(r.x - p.x, r.y - p.y, r.z - p.z); p.copy(r);
    if (ds > 4.5 * dt + 0.04) ds = 0; // a cut, not a step
    this.vel += (ds / Math.max(dt, 1e-4) - this.vel) * (1 - Math.exp(-8 * dt));
    this.W += (this.walk - this.W) * (1 - Math.exp(-8 * dt));
    if (this.walk === 0 && this.W < 0.004) { this.W = 0; return; }
    const ll = this.ll, v = Math.max(this.vel, 0.3 * this.s), beta = v / Math.sqrt(9.8 * ll);
    this.stride += (clamp(2.05 * Math.pow(beta, 0.4) * ll, 0.62 * ll, 1.8 * ll) - this.stride) * (1 - Math.exp(-5 * dt));
    this.walkPhase = (this.walkPhase + (ds > 1e-5 ? ds : dt * 0.8 * this.walk) / this.stride) % 1;
  }

  update(dt, t) {
    const k = 1 - Math.exp(-this.speed * dt), J = this.joints, T = this.target, Bs = this.base;
    for (const n in J) {
      const b = Bs[n], tg = T[n];
      b.x += (tg.x - b.x) * k; b.y += (tg.y - b.y) * k; b.z += (tg.z - b.z) * k;
      J[n].rotation.set(b.x, b.y, b.z);
    }
    this.rootY += (this.rootYTarget - this.rootY) * k;
    const hipsY = this.C.hipsY * this.s + this.rootY * SIT_K;
    this.hips.position.set(0, hipsY, 0);
    if (this.turnTo != null) { let d = (this.turnTo - this.root.rotation.y) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; this.root.rotation.y += d * (1 - Math.exp(-9 * dt)); }

    // walking overlays the pose: legs by IK, everything else by small counter-motions
    this.gait(dt);
    const W = this.W;
    this.leg.L.toe.rotation.x = 0; this.leg.R.toe.rotation.x = 0;
    if (W > 0.002) {
      const s = this.s, f = this.walkPhase, L = this.stride, ll = this.ll, amp = clamp(L / (1.55 * ll), 0.5, 1.15);
      const front = L * 0.265, standHip = (this.C.hipJ) * s, ah = FOOT.ankleH * s;
      const low = Math.sqrt(Math.max(0.1 * ll * ll, ((this.l1 + this.l2) * 0.994) ** 2 - (front - 0.02 * s) ** 2)) + ah * 1.18;
      const bob = Math.min(0.036 * s * amp, Math.max(0.006, (standHip - 0.006 * s - low)));
      const hipY = low + bob * (0.5 - 0.5 * Math.cos((f - 0.03) * 2 * TAU));
      const yaw = -0.09 * amp * Math.cos(f * TAU), tilt = 0.055 * amp * Math.sin((f - 0.05) * TAU), pitch = 0.05 + 0.03 * amp;
      const lat = 0.016 * s * Math.sin((f - 0.05) * TAU);
      const lg = this._l ??= {}, rg = this._r ??= {};
      const hx = this.C.hipX * s;
      this.gaitLeg('L', f, hipY + hx * Math.sin(tilt), -hx * Math.sin(yaw), pitch, lg);
      this.gaitLeg('R', (f + 0.5) % 1, hipY - hx * Math.sin(tilt), hx * Math.sin(yaw), pitch, rg);
      const toeOut = 0.12, track = (hx - 0.03 * s);
      for (const [sd, o, sx] of [['L', lg, 1], ['R', rg, -1]]) {
        const l = this.leg[sd], h = J['hp' + sd].rotation, n = J['kn' + sd].rotation, a = J['an' + sd].rotation;
        const roll = Math.atan2(sx * track - (sx * hx * Math.cos(yaw) + lat), o.dy) + Math.sin(o.hp + pitch) * Math.sin(yaw);  // keeps each foot on its own line while the pelvis sways
        h.x = lerp(h.x, o.hp, W); n.x = lerp(n.x, o.kn, W); a.x = lerp(a.x, o.an, W);
        h.y = lerp(h.y, -yaw, W); h.z = lerp(h.z, roll - tilt, W);
        a.y = lerp(a.y, sx * toeOut, W); a.z = lerp(a.z, -roll, W);
        l.toe.rotation.x = o.toe * W;
      }
      this.hips.position.x = lat * W; this.hips.position.y = lerp(hipsY, hipY + 0.02 * s, W);
      const hr = this.hips.rotation, sp = this.spine.rotation, ne = this.neck.rotation;
      hr.y += yaw * W; hr.z += tilt * W; hr.x += pitch * W;
      sp.y -= yaw * 1.9 * W; sp.z -= tilt * 0.9 * W; sp.x += (0.012 - pitch * 0.55) * W;
      ne.y += yaw * 0.9 * W; ne.z -= tilt * 0.1 * W; ne.x += (-0.03 - 0.018 * Math.cos((f - 0.03) * 2 * TAU)) * W;
      const c = Math.cos((f - 0.045) * TAU), swing = (0.1 + 0.2 * amp);
      const aL = this.arm.L, aR = this.arm.R;
      aL.sh.rotation.x += c * swing * W; aR.sh.rotation.x -= c * swing * W;
      aL.el.rotation.x -= (0.1 + 0.42 * (0.5 - 0.5 * c) * amp) * W; aR.el.rotation.x -= (0.1 + 0.42 * (0.5 + 0.5 * c) * amp) * W;
      aL.wr.rotation.x -= 0.06 * (0.5 - 0.5 * c) * W; aR.wr.rotation.x -= 0.06 * (0.5 + 0.5 * c) * W;
    }

    // first-person bodies hide their arms; a skinned sleeve can't just be switched off, so fold it away
    for (const a of [this.arm.L, this.arm.R]) { const q = a.sh.visible ? 1 : 1e-3; if (a.sh.scale.x !== q) a.sh.scale.setScalar(q); }

    // breathing + idle sway
    this.breath += dt;
    const b = Math.sin(this.breath * 1.5);
    this.chest.rotation.x += b * 0.006; this.spine.rotation.x += b * 0.004;
    this.spine.rotation.z += Math.sin(this.breath * 0.37) * 0.004;

    // head look-at
    const kk = 1 - Math.exp(-4 * dt);
    this.lookW += ((this.lookTarget ? 1 : 0) - this.lookW) * kk;
    if (this.lookTarget) {
      const tp = this.lookTarget.isVector3 ? this.lookTarget : this.lookTarget.getWorldPosition(new THREE.Vector3());
      const hp = this.head.getWorldPosition(new THREE.Vector3());
      const inv = new THREE.Quaternion(); this.neck.parent.getWorldQuaternion(inv).invert();
      const d = tp.clone().sub(hp).applyQuaternion(inv);
      const yaw = clamp(Math.atan2(d.x, d.z), -1.1, 1.1), pitch = clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.8);
      this.lookYaw += (yaw * this.lookAmt - this.lookYaw) * kk;
      this.lookPitch += (pitch * this.lookAmt + T.neck.x * (1 - this.lookAmt) - this.lookPitch) * kk;
    }
    if (this.lookW > 0.002) { const n = this.neck.rotation; n.y = lerp(n.y, this.lookYaw, this.lookW); n.x = lerp(n.x, this.lookPitch, this.lookW); }

    // expressions
    for (const e in this.expr) this.expr[e] += (this.exprT[e] - this.expr[e]) * (1 - Math.exp(-3 * dt));
    const { smile, sad, worry } = this.expr, hr = this.hr;
    const curve = smile - sad * 0.9;
    this.mouth.scale.set(1 + smile * 0.25, 0.25 + Math.abs(curve) * 0.9, 1);
    // while speaking (set by cast.js): the mouth works and the head moves a little with the words
    if (this.talking) {
      this.mouth.scale.y += Math.abs(Math.sin(t * 8.5) * Math.sin(t * 2.7 + 1)) * 1.5;
      this.neck.rotation.x += Math.sin(t * 2.6) * 0.035; this.neck.rotation.y += Math.sin(t * 1.7 + 2) * 0.03;
    }
    this.mouth.rotation.z = curve >= 0 ? 0 : Math.PI;
    this.mouth.position.y = this.mouthBase + (curve >= 0 ? hr * 0.0 : -hr * 0.11);
    for (const br of this.brows) { br.rotation.z = br.userData.sx * (sad * 0.35 + worry * 0.25) * -1 - br.userData.sx * 0.08; br.position.y = hr * (1.17 + worry * 0.03 + sad * 0.02); }

    // blink
    this.blinkT -= dt;
    let lid = 1; if (this.blinkT < 0) { lid = 0.12; if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4; }
    for (const e of this.eyes) e.scale.y = lid;

    if (this.anim) this.anim(t, this, dt);
    if (this.ik) this.solveArms(dt);
    if (this.real) { this.real.sync(); if (this.ik) this.settleArms(); }
  }
}

const POSES = {
  stand: {},
  standRelaxed: { shL: [4, 0, 8], shR: [4, 0, -8], spine: [2, 0, 0] },
  armsCrossed: { shL: [-28, 0, 22], shR: [-28, 0, -22], elL: [-105, 0, -40], elR: [-105, 0, 40] },
  slump: { spine: [12, 0, 0], neck: [26, 0, 0], shL: [-6, 0, 4], shR: [-6, 0, -4], elL: [-14, 0, 0], elR: [-14, 0, 0] },
  sit: { y: -0.43, hpL: [-88, 0, 3], hpR: [-88, 0, -3], knL: [88, 0, 0], knR: [88, 0, 0], shL: [-8, 0, 6], shR: [-8, 0, -6], elL: [-48, 0, 0], elR: [-48, 0, 0] },
  sitSlump: { y: -0.44, spine: [16, 0, 0], neck: [20, 0, 0], hpL: [-84, 0, 3], hpR: [-84, 0, -3], knL: [84, 0, 0], knR: [84, 0, 0], shL: [-20, 0, 4], shR: [-20, 0, -4], elL: [-58, 0, 0], elR: [-58, 0, 0] },
  crouch: { y: -0.5, spine: [30, 0, 0], neck: [-10, 0, 0], hpL: [-118, 0, 10], hpR: [-110, 0, -10], knL: [140, 0, 0], knR: [138, 0, 0], anL: [-20, 0, 0], anR: [-22, 0, 0], shL: [-50, 0, 10], shR: [-60, 0, -8], elL: [-30, 0, 0], elR: [-40, 0, 0] },
  // kneeling and sitting back on the heels: how you get down to someone's shoes in a narrow aisle
  kneelDown: p => { const s = p.s, C = p.C, hip = 0.075 * s + p.l2 * 0.34; return { y: (hip + (C.hipsY - C.hipJ) * s - C.hipsY * s) / SIT_K, spine: [40, 0, 0], neck: [18, 0, 0], hpL: [-62, 0, 9], hpR: [-62, 0, -9], knL: [150, 0, 0], knR: [150, 0, 0], anL: [30, 0, 0], anR: [30, 0, 0], shL: [-14, 0, 10], elL: [-70, 0, 0], shR: [-30, 0, -8], elR: [-30, 0, 0] }; },
  reachR: { shR: [-72, 0, -6], elR: [-12, 0, 0], spine: [4, 0, 0] },
  reachL: { shL: [-72, 0, 6], elL: [-12, 0, 0], spine: [4, 0, 0] },
  holdL: { shL: [-14, 0, 8], elL: [-88, 0, 0] },
  phone: { shL: [-20, 0, 10], elL: [-115, 10, 0], wrL: [20, 0, 0], neck: [24, 0, 0] },
  clipboard: { shL: [-12, 0, 14], elL: [-92, -20, 0], shR: [-20, 0, -12], elR: [-80, 30, 0], neck: [20, 0, 0] },
  counting: { shL: [-18, 0, 12], elL: [-100, -15, 0], shR: [-22, 0, -12], elR: [-95, 20, 0], neck: [30, 0, 0], spine: [6, 0, 0] },
  bothHands: { shL: [-52, 0, 4], shR: [-52, 0, -4], elL: [-40, 0, -20], elR: [-40, 0, 20], spine: [8, 0, 0], neck: [6, 0, 0] },
  stoop: { spine: [14, 0, 0], neck: [-6, 0, 0], shL: [-6, 0, 6], shR: [-6, 0, -6], elL: [-20, 0, 0], elR: [-20, 0, 0] },
  signing: { spine: [22, 0, 0], neck: [24, 0, 0], shR: [-38, 0, -8], elR: [-60, 0, 10], shL: [-30, 0, 14], elL: [-60, 0, -10] },
};

export function addPose(name, p) { POSES[name] = p; }
