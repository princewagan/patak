import * as THREE from 'three';
import { pbr, canvasTex } from './kit.js';

/*
  A small piece of cloth that hangs, drapes and drags: a grid of points tied together by springs (Verlet,
  position-based), solved a few times a frame. It lives in its parent's space, so add cloth.mesh to whatever
  the people stand in (the jeep), not to the scene. Some of its points can be held by something that moves
  (a hand), and the rest falls on to rounded boxes (shoes) and the floor.
*/
const _m = new THREE.Matrix4(), _v = new THREE.Vector3();

export class Cloth {
  /** w × h metres, nx × ny points */
  constructor({ w = 0.26, h = 0.24, nx = 13, ny = 12, mat = ragMaterial(), floor = 0.004, damp = 0.985, iters = 7 } = {}) {
    Object.assign(this, { nx, ny, floor, damp, iters });
    const g = this.geo = new THREE.PlaneGeometry(w, h, nx - 1, ny - 1), n = this.n = nx * ny;
    this.rest = Float32Array.from(g.attributes.position.array);
    this.p = new Float32Array(n * 3); this.o = new Float32Array(n * 3); this.w = new Float32Array(n).fill(1);
    // springs: along the weave, across it (shear) and every other point (so it bends but doesn't fold to nothing)
    const A = [], B = [], L = [], K = [], id = (i, j) => j * nx + i;
    const tie = (a, b, k) => { const r = this.rest; A.push(a); B.push(b); K.push(k); L.push(Math.hypot(r[a * 3] - r[b * 3], r[a * 3 + 1] - r[b * 3 + 1])); };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i + 1 < nx) tie(id(i, j), id(i + 1, j), 1);
      if (j + 1 < ny) tie(id(i, j), id(i, j + 1), 1);
      if (i + 1 < nx && j + 1 < ny) { tie(id(i, j), id(i + 1, j + 1), 0.7); tie(id(i + 1, j), id(i, j + 1), 0.7); }
      if (i + 2 < nx) tie(id(i, j), id(i + 2, j), 0.3);
      if (j + 2 < ny) tie(id(i, j), id(i, j + 2), 0.3);
    }
    this.cA = Int32Array.from(A); this.cB = Int32Array.from(B); this.cL = Float32Array.from(L); this.cK = Float32Array.from(K);
    this.pins = []; this.anchor = null; this.solids = [];
    const m = this.mesh = new THREE.Mesh(g, mat); m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true;
  }

  /**
   * Hold points in something that moves: hold(hand, [[i, j, x, y, z], ...]) where x, y, z is where that point sits in the
   * holder's own space. hold(null) lets go and the cloth just falls.
   */
  hold(anchor, pins = []) {
    this.anchor = anchor; this.w.fill(1);
    this.pins = pins.map(([i, j, x, y, z]) => ({ k: j * this.nx + i, at: new THREE.Vector3(x, y, z) }));
    for (const p of this.pins) this.w[p.k] = 0;
    return this;
  }

  /** a rounded box the cloth rests on: centre and half-sizes in the parent's space, yaw about y, e = how square (2 = egg, 4 = brick) */
  solid(c, r, yaw = 0, e = 3) { this.solids.push({ c: c.clone(), r: r.clone(), cy: Math.cos(yaw), sy: Math.sin(yaw), e }); return this; }

  /** lay it out flat under the holder and let it settle there for a moment, so it doesn't start in mid-air */
  reset(steps = 50) {
    const p = this.p, r = this.rest, M = this.toParent();
    for (let i = 0; i < this.n; i++) {
      _v.set(r[i * 3], -0.016, -r[i * 3 + 1]).applyMatrix4(M);
      p[i * 3] = _v.x; p[i * 3 + 1] = _v.y; p[i * 3 + 2] = _v.z;
    }
    this.o.set(p);
    for (let s = 0; s < steps; s++) this.step(1 / 60, true);
    this.write();
  }

  /** holder space → parent space */
  toParent() {
    const par = this.mesh.parent; par.updateWorldMatrix(true, false);
    if (!this.anchor) return _m.copy(par.matrixWorld).invert();
    this.anchor.updateWorldMatrix(true, false);
    return _m.copy(par.matrixWorld).invert().multiply(this.anchor.matrixWorld);
  }

  step(dt, quiet = false) {
    if (!this.mesh.parent) return;
    dt = Math.min(dt, 1 / 30);
    const sub = 2, h = dt / sub, g = -9.8 * h * h, p = this.p, o = this.o, w = this.w, n = this.n, d = this.damp;
    // where the held points have to be this frame; they get there over the substeps so a fast hand doesn't tear it
    const M = this.toParent(), goal = this.pins.map(q => q.at.clone().applyMatrix4(M)), from = this.pins.map(q => new THREE.Vector3(p[q.k * 3], p[q.k * 3 + 1], p[q.k * 3 + 2]));
    for (let s = 0; s < sub; s++) {
      for (let i = 0; i < n; i++) {
        if (!w[i]) continue;
        const x = i * 3;
        for (let a = 0; a < 3; a++) { const v = (p[x + a] - o[x + a]) * d; o[x + a] = p[x + a]; p[x + a] += v + (a === 1 ? g : 0); }
      }
      const f = (s + 1) / sub;
      this.pins.forEach((q, j) => { const x = q.k * 3; _v.lerpVectors(from[j], goal[j], f); o[x] = p[x]; o[x + 1] = p[x + 1]; o[x + 2] = p[x + 2]; p[x] = _v.x; p[x + 1] = _v.y; p[x + 2] = _v.z; });
      for (let it = 0; it < this.iters; it++) { this.springs(); this.collide(); }
    }
    if (!quiet) this.write();
  }

  springs() {
    const p = this.p, w = this.w, A = this.cA, B = this.cB, L = this.cL, K = this.cK;
    for (let c = 0; c < A.length; c++) {
      const a = A[c] * 3, b = B[c] * 3, wa = w[A[c]], wb = w[B[c]], ws = wa + wb; if (!ws) continue;
      const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2], l = Math.hypot(dx, dy, dz) || 1e-6;
      // stretches hardly at all, squashes freely (that's what lets it bunch and fold)
      let k = (l - L[c]) / l * K[c]; if (l < L[c]) k *= 0.5;
      const ka = k * wa / ws, kb = k * wb / ws;
      p[a] += dx * ka; p[a + 1] += dy * ka; p[a + 2] += dz * ka;
      p[b] -= dx * kb; p[b + 1] -= dy * kb; p[b + 2] -= dz * kb;
    }
  }

  collide() {
    const p = this.p, o = this.o, w = this.w, fl = this.floor;
    for (let i = 0; i < this.n; i++) {
      if (!w[i]) continue;
      const x = i * 3;
      for (const S of this.solids) {
        // into the box's own frame, scaled so its surface is at 1
        const rx = p[x] - S.c.x, ry = p[x + 1] - S.c.y, rz = p[x + 2] - S.c.z;
        const lx = (rx * S.cy - rz * S.sy) / S.r.x, ly = ry / S.r.y, lz = (rx * S.sy + rz * S.cy) / S.r.z;
        const e = S.e, L = Math.pow(Math.abs(lx) ** e + Math.abs(ly) ** e + Math.abs(lz) ** e, 1 / e);
        if (L >= 1 || L < 1e-5) continue;
        const k = 1 / L - 1;   // straight out from the middle to the surface
        p[x] += rx * k; p[x + 1] += ry * k; p[x + 2] += rz * k;
        // cloth on leather drags rather than slides
        o[x] += (p[x] - o[x]) * 0.35; o[x + 1] += (p[x + 1] - o[x + 1]) * 0.35; o[x + 2] += (p[x + 2] - o[x + 2]) * 0.35;
      }
      if (p[x + 1] < fl) { p[x + 1] = fl; o[x] += (p[x] - o[x]) * 0.6; o[x + 2] += (p[x + 2] - o[x + 2]) * 0.6; }
    }
  }

  write() {
    const a = this.geo.attributes.position; a.array.set(this.p); a.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

/** an old shirt, now a shoe rag (basahan): faded off-white cotton with polish smudges and a darker hem */
export function ragMaterial() {
  const map = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#a39c8c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { c.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.05})`; c.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 3) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`; c.fillRect(x, 0, 1, h); }
    c.fillStyle = 'rgba(70,64,56,.5)'; c.fillRect(0, h * 0.62, w, h * 0.07);   // a faded stripe from when it was a shirt
    for (let i = 0; i < 22; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 6 + Math.random() * 30, g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${20 + Math.random() * 20},${16 + Math.random() * 14},12,${0.25 + Math.random() * 0.4})`); g.addColorStop(1, 'rgba(20,16,12,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    c.strokeStyle = 'rgba(40,36,30,.55)'; c.lineWidth = 7; c.strokeRect(2, 2, w - 4, h - 4);
  });
  const normalMap = pbr('denim_fabric', { repeat: [3, 3] }).normalMap;
  return new THREE.MeshStandardMaterial({ map, normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 1, side: THREE.DoubleSide });
}
