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

/** walk a person along points at speed m/s. Eases in from rest and out at the end; turns through corners. */
export async function walkPath(person, pts, speed = 0.9, { face = true } = {}) {
  const P = [person.root.position.clone(), ...pts.map(p => new THREE.Vector3(...p))];
  const seg = []; let total = 0;
  for (let i = 1; i < P.length; i++) { const d = P[i].distanceTo(P[i - 1]); seg.push(d); total += d; }
  if (total < 0.01) return;
  person.walk = 1;
  const rampIn = (person.W ?? 1) < 0.4 ? Math.min(0.45, total / speed * 0.3) : 0, rampOut = Math.min(0.3, total / speed * 0.25);
  const dur = total / speed + (rampIn + rampOut) * 0.5;
  const dist = t => {
    if (t < rampIn) return speed * t * t / (2 * rampIn);
    const end = dur - rampOut;
    if (t < end) return speed * (t - rampIn * 0.5);
    const r = dur - t; return total - speed * r * r / (2 * rampOut);
  };
  await animate((_, k) => {
    let d = Math.min(total, dist(k * dur)), i = 0;
    while (i < seg.length - 1 && d > seg[i]) { d -= seg[i]; i++; }
    const a = P[i], b = P[i + 1];
    person.root.position.lerpVectors(a, b, seg[i] ? d / seg[i] : 1);
    if (face && seg[i] > 0.001) person.turnTo = Math.atan2(b.x - a.x, b.z - a.z);
  }, dur, 'linear');
  person.walk = 0; person.turnTo = null;
}

/** repeat fn every sec while cond() is true (or until stop() is called) */
export function loop(fn, sec) { let on = true, t = 0; const tw = dt => { if (!on) { active.delete(tw); return; } t += dt; if (t >= sec) { t -= sec; fn(); } }; active.add(tw); return () => (on = false); }
