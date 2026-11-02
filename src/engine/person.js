import * as THREE from 'three';
import { tex } from './kit.js';

/*
  Procedural person. Faces +Z. Origin at the feet.
  Joint conventions:
   - limbs hang along -Y; rotation.x < 0 swings them forward (+Z)
   - knee/elbow: knee.x > 0 bends the shin back; elbow.x < 0 bends the forearm forward
   - neck.x > 0 looks down, neck.y > 0 turns to the person's left (+X)
*/
const D = THREE.MathUtils.degToRad;
const SKIN = { light: 0xc08a64, tan: 0xa5714c, brown: 0x8a5a3a, dark: 0x6e4429 };

function mat(color, rough = 0.85, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...o }); }
function cloth(color, rough = 0.92) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: rough, normalMap: tex('/tex/denim_fabric_nor.jpg', { repeat: [4, 4], srgb: false }) });
  m.normalScale.set(0.7, 0.7); return m;
}
// roughen a geometry along its normals (hair, so it doesn't read as a helmet)
function rough(geo, amt) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) { const k = (Math.sin(p.getX(i) * 91 + p.getY(i) * 57) * Math.cos(p.getZ(i) * 73 + p.getX(i) * 31)) * amt; p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k); }
  geo.computeVertexNormals(); return geo;
}
function skinMat(color) {
  const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.58, sheen: 0.25, sheenColor: new THREE.Color(0xff9a7a), sheenRoughness: 0.6, clearcoat: 0.05 });
  return m;
}
function mesh(geo, m) { const x = new THREE.Mesh(geo, m); x.castShadow = true; x.receiveShadow = true; return x; }
function capsule(r, len, m, seg = 12) { const x = mesh(new THREE.CapsuleGeometry(r, len, 6, seg), m); x.position.y = -len / 2 - r * 0.15; return x; }
function taper(r0, r1, len, m, seg = 14) {
  // tapered limb (top radius r0, bottom r1), hanging down from its joint
  const V = (x, y) => new THREE.Vector2(x, y);
  const pts = [V(0.0001, r0 * 0.55), V(r0 * 0.72, r0 * 0.38), V(r0 * 0.97, 0)];
  for (let i = 1; i < 10; i++) { const t = i / 10; pts.push(V(THREE.MathUtils.lerp(r0, r1, t) * (1 + 0.06 * Math.sin(t * Math.PI)), -t * len)); }
  pts.push(V(r1 * 0.97, -len), V(r1 * 0.72, -len - r1 * 0.38), V(0.0001, -len - r1 * 0.55));
  return mesh(new THREE.LatheGeometry(pts, seg), m);
}

export class Person {
  constructor(o = {}) {
    const H = this.H = o.h || 1.68;
    const s = H / 1.7;
    const build = o.build ?? 1;           // 0.85 slim … 1.25 heavy
    const kid = H < 1.4;
    this.o = o;
    const skin = skinMat(SKIN[o.skin] ?? o.skin ?? SKIN.tan);
    const top = o.topMat || cloth(o.top ?? 0x6d7a86);
    const bottom = o.bottomMat || cloth(o.bottom ?? 0x2a2d33);
    const hairM = mat(o.hairColor ?? 0x0d0b0a, 0.5);
    this.skinMat = skin; this.topMat = top;

    const root = this.root = new THREE.Group();
    const hips = this.hips = new THREE.Group(); hips.position.y = 0.53 * H; root.add(hips);

    // pelvis / shorts
    const pelvis = mesh(new THREE.SphereGeometry(0.135 * s * build, 18, 12), bottom);
    pelvis.scale.set(1.12, 0.62, 0.78); pelvis.position.y = 0.0; hips.add(pelvis);

    // spine + chest (lathe torso, elliptical)
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.04 * s; hips.add(spine);
    const torsoPts = [[0.001, -0.03], [0.126, -0.02], [0.13, 0.06], [0.127, 0.13], [0.14, 0.2], [0.158, 0.25], [0.163, 0.282], [0.142, 0.312], [0.09, 0.334], [0.045, 0.345], [0.001, 0.35]]
      .map(([x, y]) => new THREE.Vector2(x * s * (kid ? 0.95 : 1) * (0.85 + 0.15 * build), y * s));
    const torso = mesh(new THREE.LatheGeometry(torsoPts, 22), top);
    torso.scale.z = 0.62 * (o.belly ? 1.15 : 1); spine.add(torso);
    this.torso = torso;
    const chest = this.chest = new THREE.Group(); chest.position.y = 0.3 * s; spine.add(chest);

    // neck + head
    const neck = this.neck = new THREE.Group(); neck.position.y = 0.035 * s; chest.add(neck);
    const neckM = mesh(new THREE.CylinderGeometry(0.042 * s, 0.05 * s, 0.09 * s, 12), skin); neckM.position.y = 0.035 * s; neck.add(neckM);
    const head = this.head = new THREE.Group(); head.position.y = 0.085 * s; neck.add(head);
    const hr = (kid ? 0.105 : 0.098) * s;
    this.hr = hr;
    const skull = mesh(new THREE.SphereGeometry(hr, 28, 20), skin); skull.scale.set(0.9, 1.06, 1.0); skull.position.y = hr * 0.95; head.add(skull);
    const jaw = mesh(new THREE.SphereGeometry(hr * 0.78, 22, 14), skin); jaw.scale.set(0.95, 0.85, 0.95); jaw.position.set(0, hr * 0.55, hr * 0.12); head.add(jaw);
    const nose = mesh(new THREE.SphereGeometry(hr * 0.17, 10, 8), skin); nose.scale.set(0.9, 0.8, 1.1); nose.position.set(0, hr * 0.82, hr * 0.92); head.add(nose);
    for (const sx of [-1, 1]) {
      const ear = mesh(new THREE.SphereGeometry(hr * 0.2, 10, 8), skin); ear.scale.set(0.45, 1, 0.7); ear.position.set(sx * hr * 0.9, hr * 0.95, 0); head.add(ear);
    }
    // eyes (dark, slightly glossy) + lids for blinking
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x120c09, roughness: 0.15 });
    const browM = mat(o.hairColor ?? 0x120d0a, 0.9);
    this.eyes = []; this.brows = [];
    for (const sx of [-1, 1]) {
      const e = mesh(new THREE.SphereGeometry(hr * 0.085, 10, 8), eyeM); e.scale.set(1.25, 0.8, 0.6); e.position.set(sx * hr * 0.34, hr * 1.02, hr * 0.86); head.add(e); this.eyes.push(e);
      const b = mesh(new THREE.BoxGeometry(hr * 0.32, hr * 0.045, hr * 0.06), browM); b.position.set(sx * hr * 0.35, hr * 1.2, hr * 0.88); head.add(b); this.brows.push(b); b.userData.sx = sx;
    }
    // mouth: a thin arc we bend for expressions
    const mouthGeo = new THREE.TorusGeometry(hr * 0.22, hr * 0.022, 6, 16, Math.PI * 0.7);
    const mouth = this.mouth = mesh(mouthGeo, new THREE.MeshStandardMaterial({ color: 0x4a2219, roughness: 0.7 }));
    mouth.position.set(0, hr * 0.62, hr * 0.9); mouth.rotation.z = Math.PI + Math.PI * 0.15; head.add(mouth);
    this.mouthBase = mouth.position.y;

    // hair
    this.hair = new THREE.Group(); head.add(this.hair);
    const style = o.hair ?? 'short';
    if (style !== 'none') {
      const cap = mesh(rough(new THREE.SphereGeometry(hr * 1.06, 40, 24, 0, Math.PI * 2, 0, Math.PI * (style === 'buzz' ? 0.45 : 0.52)), style === 'messy' ? hr * 0.07 : hr * 0.035), hairM);
      cap.scale.set(0.93, 1.08, 1.04); cap.position.y = hr * 0.97; cap.rotation.x = D(-14); this.hair.add(cap);
      const backH = style === 'long' ? 0.95 : style === 'bun' ? 0.55 : 0.42;
      const back = mesh(new THREE.SphereGeometry(hr * 1.04, 22, 14, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.3, Math.PI * backH), hairM);
      back.rotation.y = Math.PI; back.scale.set(0.93, 1.1, 1.0); back.position.set(0, hr * 0.95, -hr * 0.04); this.hair.add(back);
      if (style === 'long') {
        const fall = mesh(new THREE.CapsuleGeometry(hr * 0.8, hr * 1.6, 6, 14), hairM); fall.scale.set(1.05, 1, 0.42); fall.position.set(0, hr * 0.05, -hr * 0.55); this.hair.add(fall);
      }
      if (style === 'bun') { const bun = mesh(new THREE.SphereGeometry(hr * 0.38, 14, 10), hairM); bun.position.set(0, hr * 1.25, -hr * 0.95); this.hair.add(bun); }
      if (style === 'messy' || style === 'short') {
        // fringe
        const fr = mesh(new THREE.SphereGeometry(hr * 1.02, 18, 8, Math.PI * 0.2, Math.PI * 0.6, Math.PI * 0.18, Math.PI * 0.16), hairM);
        fr.rotation.y = 0; fr.position.set(0, hr * 1.0, hr * 0.05); fr.scale.set(0.95, 1.08, 1.07); this.hair.add(fr);
      }
    }
    if (o.cap) { // crew cap with visor (shades the eyes)
      const cm = mat(o.cap, 0.8);
      const crown = mesh(new THREE.SphereGeometry(hr * 1.1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), cm); crown.position.y = hr * 1.12; crown.scale.set(0.95, 0.8, 1.02); head.add(crown);
      const visor = mesh(new THREE.CylinderGeometry(hr * 0.75, hr * 0.75, hr * 0.04, 20, 1, false, -Math.PI * 0.5, Math.PI), cm); visor.position.set(0, hr * 1.18, hr * 0.62); visor.rotation.x = D(8); visor.scale.set(1, 1, 0.9); head.add(visor);
    }
    if (o.scarf) { // lola's shawl / kerchief over head and shoulders
      const sm = mat(o.scarf, 0.95, { side: THREE.DoubleSide });
      const hood = mesh(new THREE.SphereGeometry(hr * 1.14, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), sm); hood.position.y = hr * 0.98; hood.rotation.x = D(-20); hood.scale.set(0.98, 1.08, 1.06); head.add(hood);
      const drape = mesh(new THREE.CylinderGeometry(0.11 * s, 0.24 * s, 0.32 * s, 20, 1, true), sm); drape.position.y = -0.1 * s; drape.scale.z = 0.7; chest.add(drape);
    }

    // arms
    this.arm = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const sh = new THREE.Group(); sh.position.set(sx * 0.152 * s * (0.92 + 0.08 * build), 0.262 * s, 0); spine.add(sh);
      const shoulderBall = mesh(new THREE.SphereGeometry(0.047 * s * build, 12, 10), top); shoulderBall.position.x = -sx * 0.008; sh.add(shoulderBall);
      const up = taper(0.047 * s * build, 0.036 * s, 0.27 * s, o.longSleeve ? top : skin); sh.add(up);
      if (!o.longSleeve) { const sleeve = taper(0.051 * s * build, 0.047 * s * build, o.sleeve ?? 0.13 * s, top); sh.add(sleeve); }
      const el = new THREE.Group(); el.position.y = -0.28 * s; sh.add(el);
      const fore = taper(0.036 * s, 0.027 * s, 0.24 * s, o.longSleeve ? top : skin); el.add(fore);
      const wr = new THREE.Group(); wr.position.y = -0.25 * s; el.add(wr);
      const hand = mesh(new THREE.SphereGeometry(0.038 * s, 10, 8), skin); hand.scale.set(0.75, 1.3, 0.45); hand.position.y = -0.045 * s; wr.add(hand);
      const thumb = mesh(new THREE.CapsuleGeometry(0.011 * s, 0.03 * s, 4, 6), skin); thumb.position.set(-sx * 0.0, -0.03 * s, 0.024 * s); thumb.rotation.x = D(30); wr.add(thumb);
      this.arm[side] = { sh, el, wr, hand };
    }

    // legs
    this.leg = {};
    for (const side of ['L', 'R']) {
      const sx = side === 'L' ? 1 : -1;
      const hp = new THREE.Group(); hp.position.set(sx * 0.085 * s * build, -0.02 * s, 0); hips.add(hp);
      const th = taper(0.075 * s * build, 0.05 * s, 0.42 * s, o.shorts ? skin : bottom); hp.add(th);
      if (o.shorts || o.skirt) { const sh = taper(0.085 * s * build, 0.075 * s * build, o.skirt ? 0.4 * s : 0.22 * s, bottom); hp.add(sh); }
      const kn = new THREE.Group(); kn.position.y = -0.43 * s; hp.add(kn);
      const shin = taper(0.05 * s, 0.035 * s, 0.4 * s, (o.shorts || o.skirt) ? skin : bottom); kn.add(shin);
      const an = new THREE.Group(); an.position.y = -0.42 * s; kn.add(an);
      const footM = o.barefoot ? skin : mat(o.shoes ?? 0x1c1c1c, 0.7);
      const foot = mesh(new THREE.BoxGeometry(0.075 * s, 0.045 * s, 0.22 * s), footM); foot.geometry.translate(0, -0.03 * s, 0.06 * s); an.add(foot);
      this.leg[side] = { hp, kn, an };
    }

    // pose state
    this.joints = this.collect();
    this.target = {}; for (const k in this.joints) this.target[k] = this.joints[k].rotation.clone();
    this.rootY = 0; this.rootYTarget = 0;
    this.lookTarget = null; this.lookAmt = 1;
    this.expr = { smile: 0, sad: 0, worry: 0 }; this.exprT = { smile: 0, sad: 0, worry: 0 };
    this.walk = 0; this.walkPhase = 0; this.breath = Math.random() * 6; this.blinkT = Math.random() * 3;
    this.anim = null; // custom per-frame animation fn(t, person)
    this.speed = 6;
    this.pose('stand', true);
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
      if (instant) this.joints[k].rotation.copy(this.target[k]);
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

  expression(e) { Object.assign(this.exprT, { smile: 0, sad: 0, worry: 0 }, e); return this; }
  look(target, amt = 1) { this.lookTarget = target; this.lookAmt = amt; return this; }

  update(dt, t) {
    const k = 1 - Math.exp(-this.speed * dt);
    for (const n in this.joints) {
      const r = this.joints[n].rotation, tg = this.target[n];
      r.x += (tg.x - r.x) * k; r.y += (tg.y - r.y) * k; r.z += (tg.z - r.z) * k;
    }
    this.rootY += (this.rootYTarget - this.rootY) * k;
    this.hips.position.y = 0.53 * this.H + this.rootY;

    // walk cycle overlays the pose
    if (this.walk > 0.001) {
      this.walkPhase += dt * 5.2 * this.walk;
      const ph = this.walkPhase, a = this.walk;
      this.leg.L.hp.rotation.x += Math.sin(ph) * 0.42 * a; this.leg.R.hp.rotation.x -= Math.sin(ph) * 0.42 * a;
      this.leg.L.kn.rotation.x += Math.max(0, -Math.cos(ph)) * 0.75 * a; this.leg.R.kn.rotation.x += Math.max(0, Math.cos(ph)) * 0.75 * a;
      this.arm.L.sh.rotation.x -= Math.sin(ph) * 0.3 * a; this.arm.R.sh.rotation.x += Math.sin(ph) * 0.3 * a;
      this.hips.position.y += Math.abs(Math.cos(ph)) * 0.025 * a;
      this.spine.rotation.y += Math.sin(ph) * 0.06 * a;
    }

    // breathing + idle sway
    this.breath += dt;
    const b = Math.sin(this.breath * 1.5);
    this.chest.rotation.x += b * 0.006; this.torso.scale.x = 1 + b * 0.012;
    this.spine.rotation.z += Math.sin(this.breath * 0.37) * 0.004;

    // head look-at
    if (this.lookTarget) {
      const tp = this.lookTarget.isVector3 ? this.lookTarget : this.lookTarget.getWorldPosition(new THREE.Vector3());
      const hp = this.head.getWorldPosition(new THREE.Vector3());
      const inv = new THREE.Quaternion(); this.neck.parent.getWorldQuaternion(inv).invert();
      const d = tp.clone().sub(hp).applyQuaternion(inv);
      const yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -1.1, 1.1);
      const pitch = THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.6, 0.8);
      const kk = 1 - Math.exp(-4 * dt);
      this.neck.rotation.y += (yaw * this.lookAmt - this.neck.rotation.y) * kk;
      this.neck.rotation.x += (pitch * this.lookAmt + this.target.neck.x * (1 - this.lookAmt) - this.neck.rotation.x) * kk;
    }

    // expressions
    for (const e in this.expr) this.expr[e] += (this.exprT[e] - this.expr[e]) * (1 - Math.exp(-3 * dt));
    const { smile, sad, worry } = this.expr, hr = this.hr;
    this.mouth.rotation.z = Math.PI + Math.PI * 0.15 + 0; // arc centered
    const curve = smile - sad * 0.9;
    this.mouth.scale.set(1 + smile * 0.25, 0.25 + Math.abs(curve) * 0.9, 1);
    this.mouth.rotation.z = curve >= 0 ? Math.PI + Math.PI * 0.15 : Math.PI * 0.15;
    this.mouth.position.y = this.mouthBase + (curve >= 0 ? hr * 0.02 : -hr * 0.1);
    for (const br of this.brows) { br.rotation.z = br.userData.sx * (sad * 0.35 + worry * 0.25) * -1; br.position.y = hr * (1.2 + worry * 0.03 + sad * 0.02); }

    // blink
    this.blinkT -= dt;
    let lid = 1; if (this.blinkT < 0) { lid = 0.1; if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 4; }
    for (const e of this.eyes) e.scale.y = 0.8 * lid;

    if (this.anim) this.anim(t, this, dt);
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
