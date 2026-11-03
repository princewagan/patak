// Builds the hand that holds the phone in the jeep, and writes it to public/hand/phonehand.bin.
//   node tools/bake-hand.mjs
// It is modelled once here, not in the game: the surface is fine enough for a close-up and takes seconds to build.
import fs from 'fs';
import * as THREE from 'three';
import { smin, smax, noise3, clamp } from '../src/engine/sdfmesh.js';

/*
  His right hand round the phone, built close-up quality: it fills half the frame while he reads.
  Same space as the phone (origin at its middle, +Y up, +Z out of the screen, +X to his right).

  The grip is the ordinary one-handed one: the back of the phone lies on the palm, the four fingers curl round
  from behind so only their pads hold the left edge and their tips just show past the glass, the little finger
  lowest. The thumb comes over the lower right with its pad flat on the glass.

  Bones are real lengths for a grown man's hand. The skin carries what reads as skin up close: knuckle wrinkles,
  creases, pores, nails sunk into their folds, darker gaps where fingers touch, and a warm edge where light dies.
*/

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const unit = a => mul(a, 1 / len(a));
const mix3 = (a, b, t) => add(a, mul(sub(b, a), t));
const D2R = Math.PI / 180;

/** a bone: round cone from A (r1) to B (r2), its section flattened back to front by `flat` */
function bone(A, B, r1, r2, dorsalHint, flat = 1) {
  const d = sub(B, A), h = len(d), ax = mul(d, 1 / h);
  const dor = unit(sub(dorsalHint, mul(ax, dot(dorsalHint, ax)))), side = cross(ax, dor);
  const b = (r1 - r2) / h, a = Math.sqrt(1 - b * b), fl = 1 / flat;
  const f = (x, y, z) => {
    const px = x - A[0], py = y - A[1], pz = z - A[2];
    const t = px * ax[0] + py * ax[1] + pz * ax[2];
    const v = (px * dor[0] + py * dor[1] + pz * dor[2]) * fl, w = px * side[0] + py * side[1] + pz * side[2];
    const q = Math.sqrt(v * v + w * w), k = -q * b + t * a;
    const dd = k < 0 ? Math.sqrt(q * q + t * t) - r1 : k > a * h ? Math.sqrt(q * q + (t - h) * (t - h)) - r2 : q * a + t * b - r1;
    return dd * flat;
  };
  /** local coordinates of a point: along the bone, toward the back of the hand, across */
  const local = p => { const q = sub(p, A); return [dot(q, ax), dot(q, dor), dot(q, side)]; };
  const radius = t => r1 + (r2 - r1) * clamp(t / h, 0, 1);
  return { f, A, B, h, ax, dor, side, r1, r2, flat, local, radius, c: mix3(A, B, 0.5), R: h / 2 + Math.max(r1, r2) };
}

/** an ellipsoid on three axes (unit vectors) */
function blob(c, X, Y, r) {
  const Z = cross(X, Y), [rx, ry, rz] = r, a = rx * rx, b = ry * ry, cc = rz * rz, m = Math.min(rx, ry, rz);
  return Object.assign((x, y, z) => {
    const px = x - c[0], py = y - c[1], pz = z - c[2];
    const u = px * X[0] + py * X[1] + pz * X[2], v = px * Y[0] + py * Y[1] + pz * Y[2], w = px * Z[0] + py * Z[1] + pz * Z[2];
    const k0 = Math.sqrt(u * u / a + v * v / b + w * w / cc), k1 = Math.sqrt(u * u / (a * a) + v * v / (b * b) + w * w / (cc * cc));
    return k1 < 1e-9 ? -m : k0 * (k0 - 1) / k1;
  }, { c, R: Math.max(rx, ry, rz) });
}

/** smooth union that skips the parts that cannot reach this point: same answer, a fraction of the work */
function compose(parts, post) {
  const n = parts.length, F = parts.map(p => p[0].f || p[0]), K = parts.map(p => p[1]), Cx = parts.map(p => p[0].c), Rs = parts.map(p => p[0].R);
  return (x, y, z) => {
    let d = 1e9;
    for (let i = 0; i < n; i++) {
      const c = Cx[i], dx = x - c[0], dy = y - c[1], dz = z - c[2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) - Rs[i] > d + K[i] + 0.002) continue;
      const e = F[i](x, y, z);
      d = K[i] > 0 && d < 1 ? smin(d, e, K[i]) : Math.min(d, e);
    }
    return post(d, x, y, z);
  };
}

/** the phone itself, for contact shading and for keeping skin off the glass */
const PW = 0.038, PH = 0.08, PT = 0.00425, PR = 0.0105;
function phoneSdf(x, y, z) {
  const qx = Math.abs(x) - (PW - PR), qy = Math.abs(y) - (PH - PR);
  const d2 = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - PR;
  const qz = Math.abs(z) - PT;
  return Math.hypot(Math.max(d2, 0), Math.max(qz, 0)) + Math.min(Math.max(d2, qz), 0);
}

/* ---------------- the pose ---------------- */
const Z = [0, 0, 1];
/** a finger by forward kinematics: it leaves the knuckle along `slant` (degrees up from -X) and bends toward the phone */
function finger({ mcp, slant, flex, L, r, tilt = 0 }) {
  const s = slant * D2R, u = [-Math.cos(s), Math.sin(s), 0];
  const n = unit(add(Z, mul([Math.sin(s), Math.cos(s), 0], tilt)));   // the side the finger closes toward
  const dir = p => add(mul(u, Math.cos(p)), mul(n, Math.sin(p))), dor = p => sub(mul(u, Math.sin(p)), mul(n, Math.cos(p)));
  const J = [mcp]; let phi = 0;
  for (let i = 0; i < 3; i++) { phi += flex[i] * D2R; J.push(add(J[i], mul(dir(phi), L[i]))); }
  const phis = [flex[0], flex[0] + flex[1], flex[0] + flex[1] + flex[2]].map(x => x * D2R);
  return { J, r, segs: [0, 1, 2].map(i => bone(J[i], J[i + 1], r[i], r[i + 1], dor(phis[i]), 0.86)), dors: phis.map(dor) };
}

const FINGERS = [
  //          knuckle (MCP)                   slant  bend at MCP, PIP, DIP      phalanges            radii: MCP, PIP, DIP, tip
  // angles solved so each pad rests on the phone's left side and nothing goes into the phone
  finger({ mcp: [0.0135, -0.0405, -0.0215], slant: 21, flex: [-16, 55, 35], L: [0.0405, 0.0236, 0.0172], r: [0.0094, 0.0087, 0.0077, 0.0068] }),  // index: its tip stays at the side
  finger({ mcp: [0.0045, -0.0575, -0.0225], slant: 28, flex: [-18, 73, 45], L: [0.0445, 0.0268, 0.0182], r: [0.0097, 0.0090, 0.0080, 0.0070] }),  // middle
  finger({ mcp: [-0.0035, -0.0735, -0.0215], slant: 29, flex: [-19, 79, 51], L: [0.0415, 0.0255, 0.0177], r: [0.0091, 0.0084, 0.0075, 0.0066] }), // ring
  finger({ mcp: [-0.0105, -0.0875, -0.0195], slant: 31, flex: [-15, 73, 47], L: [0.0330, 0.0188, 0.0163], r: [0.0080, 0.0073, 0.0066, 0.0058] }), // little
];
// the thumb: CMC (hidden in the palm), MCP (just off the right edge), IP, tip — the pad on the glass
const TH = [[0.051, -0.106, -0.027], [0.0565, -0.0725, 0.0004], [0.0418, -0.0527, 0.0117], [0.0218, -0.0405, 0.0109]];
const TH_R = [0.0104, 0.0098, 0.0101, 0.0084];
const TH_DOR = [0.16, -0.1, 1];
const THUMB = [0, 1, 2].map(i => bone(TH[i], TH[i + 1], TH_R[i], TH_R[i + 1], TH_DOR, i === 0 ? 0.86 : i === 1 ? 0.8 : 0.76));

const MID = FINGERS[1].J[0];
const M_DIR = unit([-0.53, 0.8, 0.25]);                       // wrist toward the knuckles
const PALM_N = unit(sub([0.12, 0.08, 1], mul(M_DIR, dot([0.12, 0.08, 1], M_DIR))));   // out of the palm, toward the phone
const RADIAL = unit(cross(M_DIR, PALM_N));                    // toward the thumb side
const WRIST = add(MID, mul(M_DIR, -0.094));
const FORE = unit([0.24, -0.82, -0.52]);
const THENAR = add(add(mix3(TH[0], TH[1], 0.36), mul(PALM_N, 0.002)), mul(RADIAL, -0.008));

/** a nail sits in a shallow pocket on the back of the last bone: the pocket is cut out of the skin, the plate laid in it */
function nailSpec(seg, rTip, len, wid) {
  const y1 = seg.h + rTip * 0.62, y0 = y1 - len;
  const yc = (y0 + y1) / 2;
  return { seg, y0, y1, wid, yc, hl: len / 2, c: add(seg.A, mul(seg.ax, yc)) };
}
const NAILS = [
  ...FINGERS.map(F => nailSpec(F.segs[2], F.r[3], F.r[3] * 1.62, F.r[3] * 0.66)),
  nailSpec(THUMB[2], TH_R[3], 0.0142, 0.0066),
];
/** 2D distance to the nail's outline in its own (along, across) plane: a rounded rectangle, rounder at the cuticle */
function nailOutline(n, y, w) {
  const rc = n.wid * (y < n.yc ? 0.85 : 0.55);
  const qx = Math.abs(y - n.yc) - (n.hl - rc), qy = Math.abs(w) - (n.wid - rc);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rc;
}
const POCKET = 0.00034;
function carveNail(d, n, x, y, z) {
  if (Math.hypot(x - n.c[0], y - n.c[1], z - n.c[2]) > 0.016 || d > 0.004) return d;
  const s = n.seg, [t, v, w] = s.local([x, y, z]);
  if (v < 0 || t < n.y0 - 0.004) return d;
  const rad = Math.hypot(v / s.flat, w, Math.max(0, t - s.h)), rr = s.radius(t);
  const cut = Math.max(nailOutline(n, t, w), (rr - POCKET) - rad);
  return smax(d, -cut, 0.0007);
}

/* ---------------- one surface: arm, palm, fingers and thumb blend into each other, so there is no seam ---------------- */
function handSdf() {
  const parts = [];
  // forearm and wrist
  parts.push([bone(WRIST, add(WRIST, mul(FORE, 0.17)), 0.0245, 0.03, mul(PALM_N, -1), 0.72), 0]);
  parts.push([blob(WRIST, RADIAL, PALM_N, [0.029, 0.0185, 0.022]), 0.012]);
  // the palm: a body, the metacarpals fanning to the knuckles, the pads
  const palmC = add(mix3(WRIST, MID, 0.58), mul(PALM_N, 0.001));
  parts.push([blob(palmC, RADIAL, PALM_N, [0.036, 0.0128, 0.041]), 0.012]);
  FINGERS.forEach((F, i) => {
    const base = add(add(WRIST, mul(M_DIR, 0.03)), mul(RADIAL, (1.5 - i) * 0.0085));
    parts.push([bone(base, F.J[0], 0.0105, F.r[0] * 1.02, mul(PALM_N, -1), 0.78), 0.011]);
    // the knuckle on the back of the hand, and the pad under it on the palm
    parts.push([blob(add(F.J[0], mul(PALM_N, -F.r[0] * 0.42)), RADIAL, PALM_N, [F.r[0] * 0.8, F.r[0] * 0.62, F.r[0] * 0.9]), 0.006]);
    parts.push([blob(add(add(F.J[0], mul(PALM_N, F.r[0] * 0.55)), mul(M_DIR, -0.006)), RADIAL, PALM_N, [F.r[0] * 1.05, F.r[0] * 0.55, F.r[0] * 1.1]), 0.008]);
  });
  // the thenar: the thick muscle under the thumb, and the hypothenar on the little-finger side
  const tm = unit(sub(TH[1], TH[0]));
  parts.push([blob(THENAR, tm, PALM_N, [0.023, 0.011, 0.0138]), 0.012]);
  parts.push([blob(add(add(mix3(WRIST, FINGERS[3].J[0], 0.42), mul(PALM_N, 0.004)), mul(RADIAL, -0.006)), M_DIR, PALM_N, [0.031, 0.0118, 0.0125]), 0.012]);
  // the thumb, all the way out: metacarpal, the big knuckle, the two phalanges, the IP knuckle and the pad on the glass
  const [p0, p1, p2] = THUMB, ipAx = unit(add(p1.ax, p2.ax));
  parts.push([p0, 0.01]);
  parts.push([blob(TH[1], p0.ax, p0.dor, [0.0092, 0.009, 0.0097]), 0.007]);
  parts.push([p1, 0.009], [p2, 0.0042]);
  parts.push([blob(TH[2], ipAx, p2.dor, [0.0076, 0.0082, 0.0108]), 0.0045]);
  parts.push([blob(add(TH[2], mul(p2.dor, 0.0036)), ipAx, p2.dor, [0.0048, 0.0042, 0.0066]), 0.0035]);
  parts.push([blob(add(add(TH[3], mul(p2.ax, -0.0062)), mul(p2.dor, -0.0019)), p2.ax, p2.dor, [0.0112, 0.0062, 0.0092]), 0.0036]);
  // fingers: even shafts, joints only a touch wider, a soft knuckle on the back, full pads at the tips
  for (const F of FINGERS) {
    F.segs.forEach((s, i) => parts.push([s, i === 0 ? 0.006 : 0.0045]));
    for (const j of [1, 2]) {
      const dv = unit(add(F.dors[j - 1], F.dors[j])), ax = unit(add(F.segs[j - 1].ax, F.segs[j].ax));
      parts.push([blob(F.J[j], ax, dv, [F.r[j] * 0.72, F.r[j] * 0.8, F.r[j] * 0.98]), 0.004]);
      parts.push([blob(add(F.J[j], mul(dv, F.r[j] * 0.34)), ax, dv, [F.r[j] * 0.5, F.r[j] * 0.45, F.r[j] * 0.66]), 0.0035]);
    }
    const d = F.segs[2];
    parts.push([blob(add(add(F.J[3], mul(d.ax, -F.r[3] * 0.55)), mul(d.dor, -F.r[3] * 0.24)), d.ax, d.dor, [F.r[3] * 1.12, F.r[3] * 0.72, F.r[3] * 0.94]), 0.0035]);
  }
  return compose(parts, (d, x, y, z) => {
    for (const nl of NAILS) d = carveNail(d, nl, x, y, z);
    return d > 0.006 ? d : smax(d, -phoneSdf(x, y, z) - 0.0001, 0.0014);   // flesh gives where it presses the phone
  });
}

/** how much of the thumb's swing a point takes: all of it on the thumb, none on the fingers, some across the thenar */
const TH_LEN = len(sub(TH[1], TH[0]));
function thumbWeight(p) {
  const s = dot(sub(p, TH[0]), THUMB[0].ax) / TH_LEN;
  const d = Math.min(...THUMB.map(b => b.f(p[0], p[1], p[2])));
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  return sm(-0.15, 0.55, s) * (1 - sm(0.003, 0.016, d));
}

/* ---------------- Surface Nets on a grid that is finer where the camera gets close (the thumb, the fingertips) ---------------- */
function axisGrid(lo, hi, h) { const a = [lo]; while (a[a.length - 1] < hi) a.push(a[a.length - 1] + h(a[a.length - 1])); return a; }
const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
function nets(f, X, Y, Zg, smooth = 2) {
  const nx = X.length, ny = Y.length, nz = Zg.length, nxy = nx * ny, nn = nxy * nz, B = 4;
  const v = new Float32Array(nn).fill(1), id = (i, j, k) => i + nx * j + nxy * k;
  const bx = Math.ceil((nx - 1) / B), by = Math.ceil((ny - 1) / B), bz = Math.ceil((nz - 1) / B), near = [];
  const lim = (b, n) => [b * B, Math.min(n - 1, (b + 1) * B)];
  for (let kb = 0; kb < bz; kb++) for (let jb = 0; jb < by; jb++) for (let ib = 0; ib < bx; ib++) {
    const [i0, i1] = lim(ib, nx), [j0, j1] = lim(jb, ny), [k0, k1] = lim(kb, nz);
    const d = f((X[i0] + X[i1]) / 2, (Y[j0] + Y[j1]) / 2, (Zg[k0] + Zg[k1]) / 2);
    const R = 0.5 * Math.hypot(X[i1] - X[i0], Y[j1] - Y[j0], Zg[k1] - Zg[k0]) * 1.45 + 0.002;
    if (Math.abs(d) < R) { near.push(ib, jb, kb); continue; }
    if (d > 0) continue;
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) v[id(i, j, k)] = -1;
  }
  const seen = new Uint8Array(nn);
  const eachBlock = fn => { for (let n = 0; n < near.length; n += 3) { const [i0, i1] = lim(near[n], nx), [j0, j1] = lim(near[n + 1], ny), [k0, k1] = lim(near[n + 2], nz); fn(i0, i1, j0, j1, k0, k1); } };
  eachBlock((i0, i1, j0, j1, k0, k1) => {
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const q = id(i, j, k); if (!seen[q]) { seen[q] = 1; v[q] = f(X[i], Y[j], Zg[k]); } }
  });
  const cell = new Int32Array(nn).fill(-1), pos = [], c = new Float32Array(8);
  const eachCell = fn => eachBlock((i0, i1, j0, j1, k0, k1) => { for (let k = k0; k < k1; k++) for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) fn(i, j, k); });
  eachCell((i, j, k) => {
    let mask = 0;
    for (let q = 0; q < 8; q++) { const o = CORNERS[q], d = v[id(i + o[0], j + o[1], k + o[2])]; c[q] = d; if (d < 0) mask |= 1 << q; }
    if (mask === 0 || mask === 255) return;
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (const [a, b] of EDGES) {
      const da = c[a], db = c[b]; if ((da < 0) === (db < 0)) continue;
      const t = da / (da - db), A = CORNERS[a], E = CORNERS[b];
      sx += A[0] + (E[0] - A[0]) * t; sy += A[1] + (E[1] - A[1]) * t; sz += A[2] + (E[2] - A[2]) * t; m++;
    }
    cell[id(i, j, k)] = pos.length / 3;
    pos.push(X[i] + (X[i + 1] - X[i]) * sx / m, Y[j] + (Y[j + 1] - Y[j]) * sy / m, Zg[k] + (Zg[k + 1] - Zg[k]) * sz / m);
  });
  const quads = [];
  const quad = (a, b, c2, d, flip) => { if (a < 0 || b < 0 || c2 < 0 || d < 0) return; if (flip) quads.push(a, d, c2, b); else quads.push(a, b, c2, d); };
  eachCell((i, j, k) => {
    const o = v[id(i, j, k)] < 0;
    if (j > 0 && k > 0 && (v[id(i + 1, j, k)] < 0) !== o) quad(cell[id(i, j - 1, k - 1)], cell[id(i, j, k - 1)], cell[id(i, j, k)], cell[id(i, j - 1, k)], !o);
    if (i > 0 && k > 0 && (v[id(i, j + 1, k)] < 0) !== o) quad(cell[id(i - 1, j, k - 1)], cell[id(i - 1, j, k)], cell[id(i, j, k)], cell[id(i, j, k - 1)], !o);
    if (i > 0 && j > 0 && (v[id(i, j, k + 1)] < 0) !== o) quad(cell[id(i - 1, j - 1, k)], cell[id(i, j - 1, k)], cell[id(i, j, k)], cell[id(i - 1, j, k)], !o);
  });
  const P = new Float32Array(pos), Q = new Uint32Array(quads);
  for (let s = 0; s < smooth; s++) {
    const n = P.length / 3, sum = new Float32Array(n * 3), cnt = new Uint16Array(n);
    for (let t = 0; t < Q.length; t += 4) for (let e = 0; e < 4; e++) {
      const a = Q[t + e], b = Q[t + (e + 1) % 4];
      for (let x = 0; x < 3; x++) { sum[a * 3 + x] += P[b * 3 + x]; sum[b * 3 + x] += P[a * 3 + x]; }
      cnt[a]++; cnt[b]++;
    }
    for (let i = 0; i < n; i++) if (cnt[i]) for (let e = 0; e < 3; e++) P[i * 3 + e] += (sum[i * 3 + e] / cnt[i] - P[i * 3 + e]) * 0.5;
  }
  return { positions: P, quads: Q };
}
const tris = Q => { const t = new Uint32Array(Q.length / 4 * 6); for (let i = 0, o = 0; i < Q.length; i += 4) { t[o++] = Q[i]; t[o++] = Q[i + 1]; t[o++] = Q[i + 2]; t[o++] = Q[i]; t[o++] = Q[i + 2]; t[o++] = Q[i + 3]; } return t; };

/* ---------------- skin attributes: colour, wrinkle coordinates, baked contact shade ---------------- */
const C = s => new THREE.Color(s);
const SKIN = { back: C('#93664f'), palm: C('#bb907e'), knuckle: C('#77503f'), tip: C('#ad7867'), fold: C('#7d5242') };

/** for every vertex: which joint it is near and how far along/across it is, and which way it faces */
function skinData(pos, nrm, digits, nails, field) {
  const n = pos.length / 3;
  const col = new Float32Array(n * 3), sk = new Float32Array(n * 4), tw = new Float32Array(n);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], N = [nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]];
    // nearest finger bone
    let best = null, bd = 1e9;
    for (const dg of digits) dg.segs.forEach((s, k) => { const e = s.f(p[0], p[1], p[2]); if (e < bd) { bd = e; best = { dg, s, k }; } });
    // the palm's own line across the wrist
    let dorsal = -dot(N, PALM_N), cr = dot(sub(p, WRIST), M_DIR) - 0.012, str = 0.8, lat = 0, tipK = 0;
    if (best && bd < 0.008) {
      const { dg, s, k } = best, [t, , w] = s.local(p), wF = 1 - sstep(0.002, 0.007, bd);
      const nearB = t > s.h * 0.5;
      dorsal += (dot(N, s.dor) - dorsal) * wF;
      if (wF > 0.5) { cr = nearB ? t - s.h : t; lat = w; }
      str = dg.jw[nearB ? k + 1 : k] * wF + str * (1 - wF) * (wF > 0.5 ? 0 : 1);
      if (k === 2) tipK = clamp((t / s.h - 0.35) / 0.65, 0, 1) * wF;
    }
    // colour
    c.copy(SKIN.back).lerp(SKIN.palm, clamp((-dorsal - 0.15) / 0.5, 0, 1));
    const kn = str * Math.exp(-((cr / 0.0045) ** 2)) * clamp(dorsal * 1.6, 0, 1);
    c.lerp(SKIN.knuckle, kn * 0.55);
    c.lerp(SKIN.tip, tipK * 0.45);
    for (const nl of nails) {
      const s = nl.seg, [t, v, w] = s.local(p);
      if (v <= 0) continue;
      const o = nailOutline(nl, t, w);
      if (o > -0.0004 && o < 0.0016) c.lerp(SKIN.fold, (1 - clamp(Math.abs(o - 0.0003) / 0.0013, 0, 1)) * 0.55);
    }
    const mot = noise3(p[0] * 260, p[1] * 260, p[2] * 260) * 0.05 + noise3(p[0] * 900, p[1] * 900, p[2] * 900) * 0.025;
    c.multiplyScalar(1 + mot);
    // contact shade: how buried this point is, in this surface, the other one and the phone
    const all = (x, y, z) => Math.min(field(x, y, z), phoneSdf(x, y, z));
    let occ = 0;
    for (let s = 1; s <= 5; s++) { const dd = 0.0016 * s * s; occ += (dd - all(p[0] + N[0] * dd, p[1] + N[1] * dd, p[2] + N[2] * dd)) / dd * (0.5 ** s); }
    const ao = clamp(1 - occ * 1.15, 0.28, 1);
    c.multiplyScalar(ao);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    sk[i * 4] = cr; sk[i * 4 + 1] = str; sk[i * 4 + 2] = lat; sk[i * 4 + 3] = dorsal;
    tw[i] = thumbWeight(p);
  }
  return { col, sk, tw };
}

function skinMesh(f, X, Y, Zg, digits, nails) {
  const m = nets(f, X, Y, Zg, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  g.setIndex(new THREE.BufferAttribute(tris(m.quads), 1));
  g.computeVertexNormals();
  const { col, sk, tw } = skinData(m.positions, g.attributes.normal.array, digits, nails, f);
  return { kind: 'skin', pos: m.positions, quads: m.quads, col, sk, tw };
}


/** the plate: a grid over the outline, laid on the skin it sits in, its edge tucked under the folds */
function nailGeo(n, field) {
  const n0 = n.seg, s = n.seg, NU = 14, NV = 22, pos = [], col = [], idx = [];
  const lun = C('#b48a7b'), bed = C('#a97668'), band = C('#8f5d4e'), free = C('#c2ab95');
  const surf = (t, w) => {   // march out from inside the bone to where the skin is, along the section's normal
    const rr = s.radius(Math.min(t, s.h)), ang = Math.asin(clamp(w / rr, -0.98, 0.98));
    const dir = add(mul(s.dor, Math.cos(ang) * s.flat), mul(s.side, Math.sin(ang)));
    const o = add(s.A, mul(s.ax, Math.min(t, s.h + 0.004)));
    let lo = 0, hi = rr * 1.4;
    for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2, q = add(o, mul(dir, m)); if (field(q[0], q[1], q[2]) < 0) lo = m; else hi = m; }
    return { p: add(o, mul(dir, lo)), dir };
  };
  for (let j = 0; j <= NV; j++) for (let i = 0; i <= NU; i++) {
    const v = j / NV, t = n.y0 + 0.00035 + v * (n.y1 - n.y0 - 0.0004), u = i / NU * 2 - 1;
    // the same outline as its pocket, a hair inside it
    let lo = 0, hi = n.wid;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (nailOutline(n, t, m) < -0.0003) lo = m; else hi = m; }
    const w = u * lo;
    const { p, dir } = surf(t, w);
    // proud in the middle, tucked under the folds at the cuticle and the sides
    const lift = (0.00004 + 0.00036 * (1 - u * u)) * sstep(0.04, 0.2, v) - 0.00022 * (1 - sstep(0.0, 0.14, v)) - 0.00012 * u * u * u * u;
    pos.push(...add(p, mul(dir, lift)));
    const c = v < 0.2 ? lun.clone().lerp(bed, sstep(0.08, 0.22, v)) : v < 0.9 ? bed.clone().lerp(band, sstep(0.8, 0.9, v)) : band.clone().lerp(free, sstep(0.9, 0.95, v));
    c.multiplyScalar(0.96 + 0.06 * Math.abs(u) + noise3(t * 4000, w * 2500, 1.3) * 0.03);
    col.push(c.r, c.g, c.b);
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + 1, c2 = a + NU + 1, d = c2 + 1;
    idx.push(a, b, d, c2);
  }
  const tw = new Float32Array(pos.length / 3).fill(n0 === THUMB[2] ? 1 : 0);
  return { kind: 'nail', pos: new Float32Array(pos), quads: new Uint32Array(idx), col: new Float32Array(col), tw };
}
function sstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }


/* ---------------- build and write ---------------- */
/*
  File: [u32 header length][header JSON][aligned arrays]. Per mesh: positions as u16 inside its box, colour as sRGB u8,
  thumb weight u8, for skin the wrinkle data as i16 (crease and across in units of 40 mm / 32767, strength 0..1,
  facing -1..1), and quads as u32 (four corners, wound outward).
*/
function pack(meshes, O) {
  const chunks = [], head = { O, meshes: [] };
  let off = 0;
  const put = a => { const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength); const at = off; chunks.push(b); off += b.length; const pad = (4 - (off % 4)) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } return at; };
  const c = new THREE.Color();
  for (const m of meshes) {
    const n = m.pos.length / 3, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n * 3; i++) { lo[i % 3] = Math.min(lo[i % 3], m.pos[i]); hi[i % 3] = Math.max(hi[i % 3], m.pos[i]); }
    const q = new Uint16Array(n * 3);
    for (let i = 0; i < n * 3; i++) q[i] = Math.round((m.pos[i] - lo[i % 3]) / Math.max(1e-9, hi[i % 3] - lo[i % 3]) * 65535);
    const col = new Uint8Array(n * 3);
    for (let i = 0; i < n; i++) { c.setRGB(m.col[i * 3], m.col[i * 3 + 1], m.col[i * 3 + 2]).convertLinearToSRGB(); col[i * 3] = clamp(Math.round(c.r * 255), 0, 255); col[i * 3 + 1] = clamp(Math.round(c.g * 255), 0, 255); col[i * 3 + 2] = clamp(Math.round(c.b * 255), 0, 255); }
    const tw = new Uint8Array(n); for (let i = 0; i < n; i++) tw[i] = Math.round(clamp(m.tw[i], 0, 1) * 255);
    const e = { kind: m.kind, n, nq: m.quads.length / 4, lo, hi, pos: put(q), col: put(col), tw: put(tw) };
    if (m.sk) {
      const s = new Int16Array(n * 4);
      for (let i = 0; i < n; i++) {
        s[i * 4] = clamp(Math.round(m.sk[i * 4] / 0.04 * 32767), -32767, 32767); s[i * 4 + 1] = Math.round(clamp(m.sk[i * 4 + 1], 0, 1) * 32767);
        s[i * 4 + 2] = clamp(Math.round(m.sk[i * 4 + 2] / 0.04 * 32767), -32767, 32767); s[i * 4 + 3] = Math.round(clamp(m.sk[i * 4 + 3], -1, 1) * 32767);
      }
      e.sk = put(s);
    }
    e.quads = put(m.quads);
    head.meshes.push(e);
  }
  const hj = Buffer.from(JSON.stringify(head)), hp = Buffer.alloc((4 - ((4 + hj.length) % 4)) % 4, 32), len = Buffer.alloc(4);
  len.writeUInt32LE(hj.length + hp.length);
  return Buffer.concat([len, hj, hp, ...chunks]);
}

const t0 = performance.now();
FINGERS.forEach(F => { F.jw = [0.35, 1, 0.75, 0]; });   // how strongly each joint wrinkles on the back: knuckle, middle, last, tip
const thumbDigit = { segs: THUMB, jw: [0, 0.2, 1, 0] };
const hf = handSdf();
// spacing eases from fine to coarse over ~1.5 cm, so the surface never shows where the grid changes
const ramp = (x, a, b, w = 0.015) => sstep(a - w, a, x) * (1 - sstep(b, b + w, x));
const X = axisGrid(-0.075, 0.12, x => 0.0013 - 0.0007 * ramp(x, 0.004, 0.07) - 0.0005 * ramp(x, -0.064, -0.026) * (1 - ramp(x, 0.004, 0.07)));
const Y = axisGrid(-0.26, -0.004, y => 0.0014 - 0.0008 * Math.max(ramp(y, -0.095, -0.026), 0.75 * ramp(y, -0.026, 0.01)));
const Zg = axisGrid(-0.15, 0.03, z => 0.0013 - 0.0007 * ramp(z, -0.022, 0.026));
const meshes = [skinMesh(hf, X, Y, Zg, [...FINGERS, thumbDigit], NAILS)];
for (const n of NAILS) meshes.push(nailGeo(n, hf));
const out = new URL('../public/hand/phonehand.bin', import.meta.url);
const buf = pack(meshes, TH[0]);
fs.writeFileSync(out, buf);
console.log(`hand ${meshes[0].pos.length / 3} verts, ${(buf.length / 1e6).toFixed(2)} MB, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
