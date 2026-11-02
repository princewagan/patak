import * as THREE from 'three';
import { splat } from '../engine/splat.js';

/* Splat viewer for finding camera shots.
   /?scene=splat&file=/splats/street.spz
   Drag to look, WASD to move, Q/E down/up, shift = faster. Press P to print the camera as [pos], [look] for a scene file. */
export default {
  grade: { exposure: 1.0, bloom: 0.1, grain: 0.04, sat: 1 },
  async build() { this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x0b0c0e); },
  async enter(engine) {
    this.engine = engine; engine.rig.shake = 0; engine.rig.set({ pos: [0, 0, 0], look: [0, 0, -1], fov: 55 });
    document.body.classList.add('nobars');
    const file = new URLSearchParams(location.search).get('file') || '/splats/test.spz';
    this.mesh = await splat(engine, this.scene, file);
    this.yaw = 0; this.pitch = 0; this.keys = {};
    addEventListener('keydown', e => { this.keys[e.key.toLowerCase()] = true; if (e.key.toLowerCase() === 'p') { const r = engine.rig; console.log('pos:', r.pos.toArray().map(v => +v.toFixed(2)), 'look:', r.look.toArray().map(v => +v.toFixed(2))); } });
    addEventListener('keyup', e => (this.keys[e.key.toLowerCase()] = false));
    addEventListener('pointermove', e => { if (e.buttons) { this.yaw -= e.movementX * 0.004; this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.004, -1.4, 1.4); } });
  },
  update(dt) {
    if (!this.keys) return;
    const r = this.engine.rig, sp = (this.keys.shift ? 4 : 1.2) * dt;
    const fwd = new THREE.Vector3(Math.sin(this.yaw) * -1, 0, -Math.cos(this.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    if (this.keys.w) r.pos.addScaledVector(fwd, sp); if (this.keys.s) r.pos.addScaledVector(fwd, -sp);
    if (this.keys.d) r.pos.addScaledVector(right, sp); if (this.keys.a) r.pos.addScaledVector(right, -sp);
    if (this.keys.e) r.pos.y += sp; if (this.keys.q) r.pos.y -= sp;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * -Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    r.look.copy(r.pos).add(dir);
  },
  async play() { await new Promise(() => {}); },
};
