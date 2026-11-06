import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skelClone } from 'three/addons/utils/SkeletonUtils.js';

/*
  A scanned-looking body for a Person (Microsoft Rocketbox avatars, MIT licence: public/people/LICENSE).

  The Person stays exactly what it was: scenes pose it, walk it, attach props to its bones. Its own meshes are hidden and
  this body copies its joints every frame. So nothing in any scene has to change, and if a model fails to load
  the procedural person simply stays visible.
*/
const BASE = '/people/';
const JOINT_BONE = {
  hips: 'Bip01_Pelvis', spine: 'Bip01_Spine1', chest: 'Bip01_Spine2', neck: 'Bip01_Neck',
  shL: 'Bip01_L_UpperArm', elL: 'Bip01_L_Forearm', wrL: 'Bip01_L_Hand', shR: 'Bip01_R_UpperArm', elR: 'Bip01_R_Forearm', wrR: 'Bip01_R_Hand',
  hpL: 'Bip01_L_Thigh', knL: 'Bip01_L_Calf', anL: 'Bip01_L_Foot', hpR: 'Bip01_R_Thigh', knR: 'Bip01_R_Calf', anR: 'Bip01_R_Foot',
};
const V = () => new THREE.Vector3(), Q = () => new THREE.Quaternion();
const DOWN = new THREE.Vector3(0, -1, 0);
/* How a hand closes. Per digit (thumb, index, middle, ring, little), knuckle to tip, radians of flex: + bends toward the palm.
   The thumb has a fourth number, how far its base swings across the palm to face the fingers (opposition),
   and each grip a spread: + fans the fingers apart, - draws them together.
   In these rigs every finger joint flexes about its own +Z on both hands (the rest pose already curls a little that way);
   the thumb's swing is about its +Y, which is mirrored on the right hand. */
const GRIPS = {
  rest:  { d: [[0.05, 0.12, 0.1, 0.12], [0.1, 0.28, 0.16], [0.14, 0.32, 0.18], [0.2, 0.36, 0.2], [0.26, 0.4, 0.22]], spread: 0 },
  open:  { d: [[-0.05, 0, 0, -0.12], [-0.06, 0.02, 0], [-0.05, 0.02, 0], [-0.04, 0.03, 0], [-0.02, 0.04, 0]], spread: 0.08 },   // a flat palm: asking, or sweeping coins
  cup:   { d: [[0.08, 0.15, 0.12, 0.3], [0.32, 0.42, 0.22], [0.36, 0.46, 0.24], [0.42, 0.5, 0.26], [0.5, 0.54, 0.28]], spread: -0.04 },   // a hollow palm that keeps coins in
  hold:  { d: [[0.22, 0.32, 0.28, 0.62], [0.78, 0.88, 0.5], [0.84, 0.94, 0.52], [0.9, 0.98, 0.54], [0.96, 1.0, 0.54]], spread: -0.06 },   // round a cup, a bag's neck, an umbrella
  fist:  { d: [[0.3, 0.48, 0.45, 0.78], [1.2, 1.35, 0.78], [1.28, 1.4, 0.8], [1.34, 1.44, 0.8], [1.4, 1.46, 0.8]], spread: -0.08 },   // round a thin handle, or coins held tight
  pinch: { d: [[0.12, 0.3, 0.3, 0.72], [0.5, 0.62, 0.32], [0.62, 0.74, 0.4], [0.98, 1.18, 0.66], [1.08, 1.22, 0.68]], spread: -0.04 },   // paper between the thumb and the first two fingers
};
const SPREAD = [0, 1, 0.15, -0.6, -1.2];   // how far each finger fans, index to little
const ROLL = { elL: 'L', elR: 'R' }, HAND = { wrL: 'L', wrR: 'R' };
const FOOT_H = 0.062;   // ankle height of the procedural person
const models = new Map(), loaded = new Map();

function loadTex(url, srgb) {
  return new Promise(res => new THREE.TextureLoader().load(url, t => { t.flipY = true; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; res(t); }, undefined, () => res(null)));
}

/** skin keeps a little of the light it scatters: warm shadow edges instead of grey ones */
function skinShader(m) {
  m.onBeforeCompile = s => {
    s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      { float l = dot(reflectedLight.directDiffuse, vec3(0.3, 0.6, 0.1));
        float edge = smoothstep(0.0, 0.05, l) * (1.0 - smoothstep(0.05, 0.5, l));
        reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.42, 0.11, 0.05) * edge * 0.55; }`);
  };
  m.customProgramCacheKey = () => 'patak-skin';
}

function realMaterial(src, tx, part) {
  const m = new THREE.MeshStandardMaterial({
    name: src.name, map: tx.color || null, normalMap: tx.normal || null,
    roughness: part === 'head' ? 0.52 : 0.76, metalness: 0,
    alphaTest: part === 'opacity' ? 0.45 : 0, alphaToCoverage: part === 'opacity', side: part === 'opacity' ? THREE.DoubleSide : THREE.FrontSide,
  });
  return m;
}

/** spec: { fbx name, textures: { body: {color,normal,spec}, head: {...}, opacity: {color} } } */
export async function loadReal(name) {
  if (models.has(name)) return models.get(name);
  const p = (async () => {
    const dir = `${BASE}${name}/`;
    const manifest = await (await fetch(dir + 'manifest.json')).json();
    const group = (await new GLTFLoader().loadAsync(dir + (manifest.glb || name + '.glb'))).scene;
    const tx = {};
    await Promise.all(Object.entries(manifest.tex).flatMap(([part, set]) => { tx[part] = {}; return Object.entries(set).map(async ([k, f]) => { tx[part][k] = await loadTex(dir + f, k === 'color'); }); }));
    group.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = o.receiveShadow = true;
      const part = /opacity/i.test(o.material.name) ? 'opacity' : /head/i.test(o.material.name) ? 'head' : 'body';
      o.material = realMaterial(o.material, tx[part] || {}, part);
    });
    return { group, manifest };
  })().catch(e => { console.warn('real body failed, keeping the procedural one:', name, e); return null; });
  models.set(name, p);
  p.then(r => loaded.set(name, r));
  return p;
}
export const preloadReal = names => Promise.all(names.map(loadReal));
/**
 * A reach target that lands the middle of the palm, not the wrist, on a point: p.reach('R', palmOn(p, 'R', spot)).
 * point: a Vector3, an Object3D, or a function giving one. at = 'pinch' lands the point between thumb and finger instead
 * (a pen, a coin, a sheet). A person without a scanned body just reaches the point.
 */
export function palmOn(person, side, point, at = 'palm') {
  const t = V(), w = V(), p = V();
  return () => {
    const raw = typeof point === 'function' ? point() : point;
    if (raw.isVector3) t.copy(raw); else raw.getWorldPosition(t);
    const r = person.real; if (!r) return t;
    r.hand[side].getWorldPosition(w); r[at](side, p);
    return t.sub(p).add(w);
  };
}
export const realModel = name => loaded.get(name) || null;

/* mouth, blink and brows come from the Person: its talking flag (set by Cast), its blink and its expression */
export class RealBody {
  /** person: the procedural Person to copy. rec: a loaded model. */
  constructor(person, rec, o = {}) {
    this.person = person;
    const g = this.group = skelClone(rec.group);
    g.traverse(n => {
      if (!n.isMesh) return;
      n.frustumCulled = false;
      n.material = Array.isArray(n.material) ? n.material.map(x => x.clone()) : n.material.clone();
      for (const m of [n.material].flat()) if (!/opacity/i.test(m.name)) skinShader(m);
    });
    g.updateMatrixWorld(true);

    // size it to the person
    const pelvis = this.pelvis = g.getObjectByName('Bip01_Pelvis');
    const headB = this.headBone = g.getObjectByName('Bip01_Head');
    const feetY = Math.min(g.getObjectByName('Bip01_L_Foot').getWorldPosition(V()).y, g.getObjectByName('Bip01_R_Foot').getWorldPosition(V()).y);
    const headTop = headB.getWorldPosition(V()).y;
    const shoulderL = g.getObjectByName('Bip01_L_UpperArm').getWorldPosition(V()), shoulderR = g.getObjectByName('Bip01_R_UpperArm').getWorldPosition(V());
    const groupQ = g.getWorldQuaternion(Q());
    if (shoulderL.x < shoulderR.x) throw new Error('model faces the wrong way');

    const C = person.C, s = person.s;
    const ground = feetY - 0.03 * (headTop - feetY) * 0;
    const k = this.k = (o.scale ?? 1) * (C.neckY + 0.062) * s / (headTop - feetY);
    g.scale.setScalar(k);
    this.floor = -feetY * k + (FOOT_H * s);
    g.position.y = this.floor;
    g.updateMatrixWorld(true);

    // rest rotations of every bone, in the body's own frame
    const W = new Map();
    const rootInv = g.getWorldQuaternion(Q()).invert();
    const bones = []; g.traverse(n => { if (n.isBone) { bones.push(n); W.set(n, rootInv.clone().multiply(n.getWorldQuaternion(Q()))); } });

    // the game's zero pose has limbs straight down. Bring the rest pose to that, bone subtree by subtree
    const dir = (a, c) => g.getObjectByName(c).getWorldPosition(V()).sub(g.getObjectByName(a).getWorldPosition(V())).applyQuaternion(rootInv).normalize();
    const preRoot = (a, c) => Q().setFromUnitVectors(dir(a, c), DOWN);
    const applySub = (n, q) => { n.traverse(c => { if (c.isBone) W.set(c, q.clone().multiply(W.get(c))); }); };
    for (const sd of ['L', 'R']) {
      const up = g.getObjectByName(`Bip01_${sd}_UpperArm`), fo = g.getObjectByName(`Bip01_${sd}_Forearm`), th = g.getObjectByName(`Bip01_${sd}_Thigh`), ca = g.getObjectByName(`Bip01_${sd}_Calf`), fa = g.getObjectByName(`Bip01_${sd}_Foot`);
      const qu = preRoot(`Bip01_${sd}_UpperArm`, `Bip01_${sd}_Forearm`); applySub(up, qu);
      // the scan's rest elbow is already bent about 20°. Straighten it, so an elbow angle means the same on this arm as on
      // the puppet's: otherwise every hand lands a hand's width off and has to be dragged onto what it holds
      applySub(fo, Q().setFromUnitVectors(dir(`Bip01_${sd}_Forearm`, `Bip01_${sd}_Hand`).applyQuaternion(qu), DOWN));
      applySub(th, preRoot(`Bip01_${sd}_Thigh`, `Bip01_${sd}_Calf`));
    }

    this.headRest = W.get(headB).clone();
    this.capScale = ((C.neckY + 0.062) * s / 1.52) / headB.getWorldScale(V()).x;

    // l = W(parent)⁻¹ · r · W(bone): the joint's rotation carried over into this rig's bone frames
    this.links = [];
    const byBone = new Map(Object.entries(JOINT_BONE).map(([j, n]) => [n, j]));
    for (const n of bones) {
      const j = byBone.get(n.name), parentW = n.parent?.isBone ? W.get(n.parent) : Q();
      const parentRest = n.parent?.isBone ? parentW : rootInv.clone().multiply(n.parent.getWorldQuaternion(Q()));
      const A = parentRest.clone().invert(), Bq = W.get(n);
      if (!j) { n.quaternion.copy(A).multiply(Bq); continue; }  // unmapped bones just hold the corrected rest
      this.links.push({ n, j, A, B: Bq });
    }
    // these rigs hang the collarbones off the neck, so a nodding head swings both arms. steadyArms (see sync) keeps them on the chest
    this.neckLink = this.links.find(l => l.j === 'neck');
    this.clav = (this.neckLink?.n.children ?? []).filter(c => c.isBone && /Clavicle/.test(c.name)).map(n => ({ n, q0: n.quaternion.clone() }));

    // eyes turn up or down on their own (person.eyeUp, radians): a bent old body looks up at you with the eyes, not the head
    this.eyes = ['Bip01_LEye', 'Bip01_REye'].map(n => g.getObjectByName(n)).filter(Boolean)
      .map(e => ({ e, rest: e.quaternion.clone(), axis: new THREE.Vector3(1, 0, 0).applyQuaternion(W.get(e).clone().invert()) }));
    this.eyeV = 0;

    // fingers keep their rest, so a hand can close round whatever it holds (see grip)
    this.curl = o.curl ?? 1;
    this.fingers = { L: [], R: [] }; this.gripTo = { L: 'rest', R: 'rest' }; this.gripBusy = 2;
    g.traverse(n => {
      const f = n.isBone && /_([LR])_Finger([0-4])(\d?)$/.exec(n.name);
      if (f) this.fingers[f[1]].push({ n, d: +f[2], k: +(f[3] || 0), q0: n.quaternion.clone(), a: 0, o: 0, sp: 0 });
    });
    this.fingerPose(1);

    this.pelvisRest = pelvis.position.clone();
    this.pelvisParentInv = pelvis.parent.getWorldQuaternion(Q()).invert().multiply(g.getWorldQuaternion(Q()));
    this.hipsRest = C.hipsY * s;
    this.morph = []; g.traverse(n => { if (n.isMesh && n.morphTargetDictionary) this.morph.push(n); });
    this.upper = { L: g.getObjectByName('Bip01_L_UpperArm'), R: g.getObjectByName('Bip01_R_UpperArm') };
    this.hand = { L: g.getObjectByName('Bip01_L_Hand'), R: g.getObjectByName('Bip01_R_Hand') };
    this.foot = { L: g.getObjectByName('Bip01_L_Foot'), R: g.getObjectByName('Bip01_R_Foot') };
    this.thigh = { L: g.getObjectByName('Bip01_L_Thigh'), R: g.getObjectByName('Bip01_R_Thigh') };
    this.calf = { L: g.getObjectByName('Bip01_L_Calf'), R: g.getObjectByName('Bip01_R_Calf') };
    this._d = V(); this._w = V();
    this.blinkV = 0; this.talk = 0;
    this._v = V(); this._q = Q(); this._e = new THREE.Euler();
    this._roll = { L: Q(), R: Q() }; this._half = { L: Q(), R: Q() };
  }

  /**
   * A cap that actually sits on this head. It hangs off the real head bone, in metres, with Y up and Z toward the face,
   * so it turns with the head and never drifts onto the face.
   */
  wearCap(color, { logo, y = 0, z = 0, size = 1 } = {}) {
    const hold = new THREE.Group(); this.headBone.add(hold);
    hold.quaternion.copy(this.headRest.clone().invert()); hold.scale.setScalar(this.capScale);
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.82 }), R = 0.1 * size, cap = new THREE.Group(); hold.add(cap);
    cap.position.set(0, 0.158 + y, -0.012 + z);   // the head bone's pivot is at the top of the neck: the brim sits at the brow
    // crown: a soft six-panel dome that comes down to the brow
    const crown = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.57), m); crown.scale.set(1.14, 1.02, 1.19); crown.rotation.x = 0.04; crown.castShadow = true; cap.add(crown);
    // the sweatband edge, down over the hair all the way round
    const band = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.035, R * 1.05, 0.032, 32, 1, true), m); band.scale.set(1.1, 1, 1.17); band.position.y = -0.016; cap.add(band);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 6), m); btn.scale.y = 0.5; btn.position.set(0, R * 0.945, 0.004); cap.add(btn);
    // brim: a curved peak, stiffer and darker underneath
    const N = 26, M = 6, pos = [], idx = [];
    for (let j = 0; j <= M; j++) for (let i = 0; i <= N; i++) {
      const u = i / N * 2 - 1, v = j / M, a = u * 1.12, r = R * 0.98 + v * (0.082 * size) * (1 - 0.45 * u * u);
      pos.push(Math.sin(a) * r * 0.95, -0.0015 - u * u * 0.024 - v * 0.012 - v * v * 0.004, Math.cos(a) * r * 1.08);
    }
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    const brim = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.78, side: THREE.DoubleSide })); brim.rotation.x = 0.06; brim.position.y = -0.006; brim.scale.set(1.1, 1, 1.08); brim.castShadow = true; cap.add(brim);
    if (logo) { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.05), new THREE.MeshStandardMaterial({ map: logo, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 })); t.position.set(0, 0.038, R * 1.11); t.rotation.x = -0.3; cap.add(t); }
    this.cap = cap; return cap;
  }

  /** first person: this body has no head to get in front of the camera */
  hideHead() { this.headBone.scale.setScalar(1e-3); }

  /** a frame on the head in metres: Y up, Z out of the face, origin at the top of the neck. For the mouth, the eyes */
  headFrame() {
    if (this._hf) return this._hf;
    const f = this._hf = new THREE.Group(); this.headBone.add(f);
    f.quaternion.copy(this.headRest.clone().invert()); f.scale.setScalar(this.capScale);
    return f;
  }

  /** the middle of the palm, on the skin, in world space: the part of a hand that rests on what it holds */
  palm(side, out = V()) {
    const h = this.hand[side], k = (this._kn ??= {})[side] ??= this.group.getObjectByName(`Bip01_${side}_Finger2`);
    const a = this._pa ??= V(), n = this._pn ??= V();
    k.getWorldPosition(out); a.setFromMatrixPosition(h.matrixWorld);
    const len = a.distanceTo(out);
    out.lerp(a, 0.45);
    return out.addScaledVector(n.setFromMatrixColumn(h.matrixWorld, 1).normalize(), len * 0.24);   // the hand's +Y comes out of the palm
  }
  /** the point between the thumb and the first finger, where a pinch holds a coin or a sheet */
  pinch(side, out = V()) {
    const T = (this._tp ??= {})[side] ??= [this.group.getObjectByName(`Bip01_${side}_Finger02`), this.group.getObjectByName(`Bip01_${side}_Finger12`)];
    T[0].getWorldPosition(out); return out.lerp(T[1].getWorldPosition(this._pa ??= V()), 0.5);
  }

  /** close a hand: 'rest' | 'open' | 'cup' | 'hold' | 'fist' | 'pinch'. The fingers travel there, they don't jump. */
  grip(side, kind = 'rest') { if (GRIPS[kind] && this.gripTo[side] !== kind) { this.gripTo[side] = kind; this.gripBusy = 40; } }
  fingerPose(k) {
    for (const s of ['L', 'R']) {
      const kind = this.gripTo[s], G = GRIPS[kind], amt = kind === 'rest' ? this.curl : 1, m = s === 'L' ? 1 : -1;
      for (const f of this.fingers[s]) {
        f.a += (G.d[f.d][f.k] * amt - f.a) * k;
        f.n.quaternion.copy(f.q0);
        if (f.k === 0) {   // the knuckle also swings: the thumb across the palm, the fingers apart or together
          f.o += ((f.d === 0 ? G.d[0][3] : 0) - f.o) * k; f.sp += (G.spread * SPREAD[f.d] - f.sp) * k;
          if (f.d === 0) f.n.rotateY(m * f.o); else f.n.rotateY(m * f.sp);
        }
        f.n.rotateZ(f.a);
      }
    }
  }

  setMorph(key, v) { for (const m of this.morph) { const i = m.morphTargetDictionary[key]; if (i !== undefined) m.morphTargetInfluences[i] = v; } }

  sync() {
    const p = this.person, J = p.joints, q = this._q;
    for (const l of this.links) {
      const j = J[l.j], side = ROLL[l.j];
      q.setFromEuler(j.rotation);
      if (side) {
        // these rigs have no twist bones: a forearm that rolls as one piece wrings the elbow. Keep half the roll (about the
        // forearm's own axis) here and hand the other half to the wrist, so it spreads along the forearm the way a real one turns
        const t = this._roll[side].set(0, q.y, 0, q.w), n = Math.hypot(q.y, q.w);
        if (n > 1e-6) { t.y /= n; t.w /= n; } else t.identity();
        const half = this._half[side].identity().slerp(t, 0.5);
        q.multiply(t.invert()).multiply(half);
      } else if (HAND[l.j]) q.premultiply(this._half[HAND[l.j]]);
      l.n.quaternion.copy(l.A).multiply(q).multiply(l.B);
    }
    // the puppet hangs its arms off the spine; this rig hangs them off the neck, through the chest. Undo the chest's and the
    // neck's turn under the collarbones (B⁻¹ · (q_chest · q_neck)⁻¹ · B · rest), so a nod never swings the arms and every
    // hand lands where the puppet's arm put it. On for everyone unless a scene sets steadyArms = false
    if (this.steadyArms !== false && this.neckLink) {
      const nl = this.neckLink, c = this._qc ??= Q(), r = this._qr ??= Q();
      q.setFromEuler(J.chest.rotation).multiply(r.setFromEuler(J.neck.rotation)).invert(); c.copy(nl.B).invert().multiply(q).multiply(nl.B);
      for (const x of this.clav) { x.n.quaternion.copy(c).multiply(x.q0); x.n.position.copy(x.p0 ??= x.n.position.clone()).applyQuaternion(c); }   // where it sits too, not only which way it points
    } else if (this.clav.length && this.clav[0].n.quaternion.angleTo(this.clav[0].q0) > 1e-6) for (const x of this.clav) { x.n.quaternion.copy(x.q0); if (x.p0) x.n.position.copy(x.p0); }
    // the pelvis follows the hips' travel from their rest height
    const v = this._v.set(p.hips.position.x, p.hips.position.y - this.hipsRest, p.hips.position.z).divideScalar(this.k).applyQuaternion(this.pelvisParentInv);
    this.pelvis.position.copy(this.pelvisRest).add(v);
    // and each shoulder sits exactly on the puppet's (person.fitArms measured them at rest; a bent chest would still shift them)
    if (p.armsFit && this.steadyArms !== false) for (const x of this.clav) {
      const s = x.side ??= /_L_/.test(x.n.name) ? 'L' : 'R', nk = x.n.parent;
      const want = p.arm[s].sh.getWorldPosition(this._d), has = this.upper[s].getWorldPosition(this._w);
      nk.updateWorldMatrix(true, false); x.n.position.add(nk.worldToLocal(want).sub(nk.worldToLocal(has)));
    }
    for (const s of ['L', 'R']) { const on = p.arm[s].sh.visible ? 1 : 1e-3; if (this.upper[s].scale.x !== on) this.upper[s].scale.setScalar(on); }
    const up = p.eyeUp || 0;
    if (up || this.eyeV) {
      this.eyeV += (up - this.eyeV) * 0.12; if (Math.abs(up - this.eyeV) < 1e-4) this.eyeV = up;
      for (const x of this.eyes) x.e.quaternion.copy(x.rest).multiply(q.setFromAxisAngle(x.axis, -this.eyeV));
    }
    for (const s of ['L', 'R']) {
      const wr = p.arm[s].wr;
      if (wr.children.length < 2) continue;            // nothing held but the (hidden) hand mesh
      const rest = wr.userData.rest ??= wr.position.clone();
      wr.position.copy(rest);
      const real = this.hand[s]; real.updateWorldMatrix(true, false); wr.updateWorldMatrix(true, false);
      const d = this._d.setFromMatrixPosition(real.matrixWorld).sub(this._v.setFromMatrixPosition(wr.matrixWorld));
      wr.parent.worldToLocal(d.add(this._w.setFromMatrixPosition(wr.parent.matrixWorld)));
      wr.position.add(d);
    }
    if (this.gripBusy > 0) { this.fingerPose(0.22); this.gripBusy--; }
    if (this.morph.length) {
      const e = p.expr || {}, lid = (p.eyes?.[0]?.scale.y ?? 1) < 0.5 ? 1 : 0;
      this.blinkV += (lid - this.blinkV) * 0.55;
      this.setMorph('AK_09_EyeBlinkLeft', this.blinkV); this.setMorph('AK_10_EyeBlinkRight', this.blinkV);
      const sm = e.smile || 0, sa = e.sad || 0, wo = e.worry || 0;
      this.setMorph('AK_44_MouthSmileLeft', sm); this.setMorph('AK_45_MouthSmileRight', sm);
      this.setMorph('AK_30_MouthFrownLeft', sa * 0.8); this.setMorph('AK_31_MouthFrownRight', sa * 0.8);
      this.setMorph('AK_03_BrowInnerUp', Math.min(1, sa * 0.8 + wo));
      const now = performance.now() / 1000, on = !!p.talking;
      const jaw = on ? 0.1 + 0.3 * Math.abs(Math.sin(now * 8.3) * Math.sin(now * 3.1 + 1)) : (p.chew || 0);   // chew: set by a scene while someone eats
      this.talk += (jaw - this.talk) * 0.4;
      this.setMorph('AK_25_JawOpen', this.talk);
    }
  }
}

