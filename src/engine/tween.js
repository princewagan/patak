import * as THREE from 'three';
import { ease } from './engine.js';

const active = new Set();
export function tickTweens(dt) { for (const tw of [...active]) tw(dt); }

/** animate(k => ..., seconds, 'inOut') → promise. Uses scaled (slow-mo aware) time. */
export function animate(fn, dur, e = 'inOut') {
  const f = ease[e] || ease.inOut;
  return new Promise(res => {
    let t = 0;
    const tw = dt => { t += dt; const k = Math.min(1, t / dur); fn(f(k), k); if (k >= 1) { active.delete(tw); res(); } };
    active.add(tw);
  });
}

/** move an Object3D to a position (array), optionally turning to a heading (radians) */
export function moveTo(obj, to, dur, { e = 'inOut', ry } = {}) {
  const p0 = obj.position.clone(), p1 = new THREE.Vector3(...to), r0 = obj.rotation.y;
  return animate(k => { obj.position.lerpVectors(p0, p1, k); if (ry != null) obj.rotation.y = r0 + (ry - r0) * k; }, dur, e);
}

/** walk a person along points at speed m/s */
export async function walkPath(person, pts, speed = 0.9, { face = true } = {}) {
  person.walk = 1;
  for (const p of pts) {
    const to = new THREE.Vector3(...p), from = person.root.position.clone();
    const d = to.distanceTo(from); if (d < 0.01) continue;
    if (face) { const ry = Math.atan2(to.x - from.x, to.z - from.z); person.root.rotation.y = ry; }
    await moveTo(person.root, p, d / speed, { e: 'linear' });
  }
  person.walk = 0;
}

/** repeat fn every sec while cond() is true (or until stop() is called) */
export function loop(fn, sec) { let on = true, t = 0; const tw = dt => { if (!on) { active.delete(tw); return; } t += dt; if (t >= sec) { t -= sec; fn(); } }; active.add(tw); return () => (on = false); }
