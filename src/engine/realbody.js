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
const CURL = { 0: -0.28, 1: -0.5, 2: -0.32 };   // resting fingers, knuckle to tip
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
    alphaTest: part === 'opacity' ? 0.45 : 0, side: part === 'opacity' ? THREE.DoubleSide : THREE.FrontSide,
  });
  return m;
}

/** spec: { fbx name, textures: { body: {color,normal,spec}, head: {...}, opacity: {color} } } */
export async function loadReal(name) {
  if (models.has(name)) return models.get(name);
  const p = (async () => {
    const dir = `${BASE}${name}/`;
    const manifest = await (await fetch(dir + 'manifest.json')).json();
    const group = (await new GLTFLoader().loadAsync(dir + name + '.glb')).scene;
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
      applySub(up, preRoot(`Bip01_${sd}_UpperArm`, `Bip01_${sd}_Forearm`));
      applySub(th, preRoot(`Bip01_${sd}_Thigh`, `Bip01_${sd}_Calf`));
    }

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

    // relaxed fingers
    g.traverse(n => {
      if (!n.isBone) return;
      const f = /Finger([1-4])(\d?)$/.exec(n.name);
      if (f) n.rotateZ(CURL[f[2] || '0'] * (o.curl ?? 1));
    });

    this.pelvisRest = pelvis.position.clone();
    this.pelvisParentInv = pelvis.parent.getWorldQuaternion(Q()).invert().multiply(g.getWorldQuaternion(Q()));
    this.hipsRest = C.hipsY * s;
    this.morph = []; g.traverse(n => { if (n.isMesh && n.morphTargetDictionary) this.morph.push(n); });
    this.upper = { L: g.getObjectByName('Bip01_L_UpperArm'), R: g.getObjectByName('Bip01_R_UpperArm') };
    this.hand = { L: g.getObjectByName('Bip01_L_Hand'), R: g.getObjectByName('Bip01_R_Hand') };
    this._d = V(); this._w = V();
    this.blinkV = 0; this.talk = 0;
    this._v = V(); this._q = Q(); this._e = new THREE.Euler();
  }

  setMorph(key, v) { for (const m of this.morph) { const i = m.morphTargetDictionary[key]; if (i !== undefined) m.morphTargetInfluences[i] = v; } }

  sync() {
    const p = this.person, J = p.joints, q = this._q;
    for (const l of this.links) {
      const j = J[l.j];
      q.setFromEuler(j.rotation);
      l.n.quaternion.copy(l.A).multiply(q).multiply(l.B);
    }
    // the pelvis follows the hips' travel from their rest height
    const v = this._v.set(p.hips.position.x, p.hips.position.y - this.hipsRest, p.hips.position.z).divideScalar(this.k).applyQuaternion(this.pelvisParentInv);
    this.pelvis.position.copy(this.pelvisRest).add(v);
    for (const s of ['L', 'R']) { const on = p.arm[s].sh.visible ? 1 : 1e-3; if (this.upper[s].scale.x !== on) this.upper[s].scale.setScalar(on); }
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
    if (this.morph.length) {
      const e = p.expr || {}, lid = (p.eyes?.[0]?.scale.y ?? 1) < 0.5 ? 1 : 0;
      this.blinkV += (lid - this.blinkV) * 0.55;
      this.setMorph('AK_09_EyeBlinkLeft', this.blinkV); this.setMorph('AK_10_EyeBlinkRight', this.blinkV);
      const sm = e.smile || 0, sa = e.sad || 0, wo = e.worry || 0;
      this.setMorph('AK_44_MouthSmileLeft', sm); this.setMorph('AK_45_MouthSmileRight', sm);
      this.setMorph('AK_30_MouthFrownLeft', sa * 0.8); this.setMorph('AK_31_MouthFrownRight', sa * 0.8);
      this.setMorph('AK_03_BrowInnerUp', Math.min(1, sa * 0.8 + wo));
      const now = performance.now() / 1000, on = !!p.talking;
      const jaw = on ? 0.1 + 0.3 * Math.abs(Math.sin(now * 8.3) * Math.sin(now * 3.1 + 1)) : 0;
      this.talk += (jaw - this.talk) * 0.4;
      this.setMorph('AK_25_JawOpen', this.talk);
    }
  }
}

