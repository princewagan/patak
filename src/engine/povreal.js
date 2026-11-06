import * as THREE from 'three';
import { Person } from './person.js';
import { realModel } from './realbody.js';
import { GRIP } from './body.js';

/*
  Your own forearm and hand, first person, cut from a scanned body: real skin, knuckles, nails, and fingers that close.
  Same calls as the old modelled arm (labas.js povArm): reach(wrist, elbow, roll), press(wrist, elbow, handQ),
  grip(centre, axis, elbow), all in the parent's space, and the group itself sits at the wrist.
  The hand frame is the old one: fingers along -Y, the elbow toward +Y, thumb toward +Z, palm toward -X (left) / +X (right).
  Returns null when the scan isn't loaded, and the caller keeps the modelled arm.
*/
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _r = new THREE.Quaternion(), _i = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3(), _m = new THREE.Matrix4();
// where the bar runs through this hand's closed fingers, in the hand frame (measured on the scan's 'fist': the middle finger's
// ring, between the knuckles and the last joint). The old modelled fist held its bar 3.5 cm further out, past the knuckles
const RING = { x: 0.021, y: -0.072 };
const ELBOW = 1.75;
const TINT = new THREE.Color(0.9, 0.82, 0.78);
const BEND = 0.95;   // how far a wrist bends back, flat against a door (radians)   // how far the elbow is bent behind the forearm you see (radians): only the start of the upper arm shows

/** keep only one arm of a scanned body: forearm, hand, fingers, and a little of the upper arm above the elbow */
function keepArm(group, side) {
  const S = new RegExp(`_${side}_(Forearm|Hand|Finger)`), U = `Bip01_${side}_UpperArm`, F = `Bip01_${side}_Forearm`;
  group.traverse(n => {
    if (!n.isSkinnedMesh) return;
    const g = n.geometry = n.geometry.clone(), sk = n.skeleton, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, P = g.attributes.position;
    const arm = sk.bones.map(b => S.test(b.name)), up = sk.bones.findIndex(b => b.name === U), fo = sk.bones.findIndex(b => b.name === F);
    const elbow = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[fo]).invert());
    const v = new THREE.Vector3(), reach = elbow.distanceTo(new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(sk.boneInverses[up]).invert())) * 0.32;
    const keep = new Uint8Array(P.count);
    for (let i = 0; i < P.count; i++) {
      let w = 0, wu = 0;
      for (let k = 0; k < 4; k++) { const b = SI.getComponent(i, k), x = SW.getComponent(i, k); if (arm[b]) w += x; else if (b === up) wu += x; }
      v.fromBufferAttribute(P, i).applyMatrix4(n.bindMatrix);
      keep[i] = w + (v.distanceTo(elbow) < reach ? wu : 0) > 0.5 ? 1 : 0;
    }
    const I = g.index.array, out = [];
    for (let t = 0; t < I.length; t += 3) if (keep[I[t]] && keep[I[t + 1]] && keep[I[t + 2]]) out.push(I[t], I[t + 1], I[t + 2]);
    g.setIndex(out);
    n.visible = out.length > 0;
  });
}

export function realPovArm({ left = false, name = 'driver', h = 1.7 } = {}) {
  if (!realModel(name)) return null;
  const side = left ? 'L' : 'R';
  const p = new Person({ real: name, h, build: 1 });
  if (!p.real) return null;
  const R = p.real, arm = p.arm[side];
  keepArm(R.group, side); R.hideHead();
  for (const k in p.joints) p.joints[k].rotation.set(0, 0, 0);
  p.hips.position.set(0, p.C.hipsY * p.s, 0);
  // your own arm is right under the camera and lit by whatever is nearest: a touch less red than the scan, so it reads as skin, not orange
  R.group.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; for (const m of [n.material].flat()) m.color.multiply(TINT); } });

  const G = new THREE.Group(); G.add(p.root); G.visible = false;
  G.person = p;
  const elW = new THREE.Quaternion(), wrW = new THREE.Quaternion(), shW = new THREE.Quaternion();
  let kind = null;
  const hand = k => { if (k !== kind) { kind = k; R.grip(side, k); R.fingerPose(1); } };
  /** lay the arm along the forearm frame elW with the hand frame wrW, and move it so the wrist is at G's origin */
  const pose = () => {
    shW.copy(elW).multiply(_q.setFromAxisAngle(_x.set(1, 0, 0), ELBOW));   // the elbow bends in its own plane, nowhere else
    arm.sh.rotation.setFromQuaternion(shW);
    arm.el.rotation.setFromQuaternion(_r.copy(shW).invert().multiply(elW));
    arm.wr.rotation.setFromQuaternion(_r.copy(elW).invert().multiply(wrW));
    p.root.position.set(0, 0, 0); p.root.updateMatrixWorld(true);
    R.sync();
    R.hand[side].updateWorldMatrix(true, false);
    G.worldToLocal(_a.setFromMatrixPosition(R.hand[side].matrixWorld));
    p.root.position.sub(_a); p.root.updateMatrixWorld(true);
  };
  const forearm = (wrist, elbow, roll) => {
    G.position.copy(wrist); G.updateMatrixWorld(true);
    _d.copy(elbow).sub(wrist).normalize();
    elW.setFromUnitVectors(UP, _d).multiply(_q.setFromAxisAngle(UP, roll));
  };
  G.holds = 'rest';   // the hand's shape while it reaches: 'pinch' to carry a coin, 'hold' for a wallet or an envelope
  G.reach = (wrist, elbow, roll = 0) => { forearm(wrist, elbow, roll); wrW.copy(elW); hand(G.holds); pose(); };
  /** where a pinched thing sits, between the thumb and the first finger, in world space */
  G.pinchPoint = out => R.pinch(side, out);
  /** a flat hand against something: the hand faces exactly handQ, and a wrist only bends so far (BEND), so past that the
      forearm turns with the hand instead. The forearm takes the hand's own roll: a wrist can't twist */
  G.press = (wrist, elbow, handQ) => {
    G.position.copy(wrist); G.updateMatrixWorld(true);
    _d.copy(elbow).sub(wrist).normalize(); _y.copy(UP).applyQuaternion(handQ);
    const ang = _d.angleTo(_y);
    if (ang > BEND) { _z.crossVectors(_y, _d).normalize(); if (_z.lengthSq() > 1e-8) _d.copy(_y).applyAxisAngle(_z, BEND); }
    elW.setFromUnitVectors(_y, _d).multiply(handQ);
    wrW.copy(handQ); hand('open'); pose();
  };
  /** close the hand round a bar: `centre` on the bar, `axis` along it toward the thumb, the forearm back to `elbow` (see povArm) */
  G.grip = (centre, axis, elbow) => {
    const gx = left ? -RING.x : RING.x, gy = RING.y, sn = Math.sin(GRIP.tilt), cs = Math.cos(GRIP.tilt);
    _b.copy(axis).normalize(); G.position.copy(centre);
    for (let k = 0; k < 3; k++) {
      _d.copy(elbow).sub(G.position).normalize();
      _y.copy(_d).addScaledVector(_b, -_d.dot(_b)).normalize().multiplyScalar(cs).addScaledVector(_b, -sn);
      _z.copy(_b).addScaledVector(_y, sn).divideScalar(cs);
      _x.crossVectors(_y, _z);
      G.position.copy(centre).addScaledVector(_x, -gx).addScaledVector(_y, -gy);
    }
    wrW.setFromRotationMatrix(_m.makeBasis(_x, _y, _z));
    _d.copy(elbow).sub(G.position).normalize(); _z.addScaledVector(_d, -_z.dot(_d)).normalize(); _x.crossVectors(_d, _z);
    elW.setFromRotationMatrix(_m.makeBasis(_x, _d, _z));
    G.updateMatrixWorld(true);
    hand('fist'); pose();
  };
  G.real = true;
  return G;
}
