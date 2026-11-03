import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ell, rell, cone, blend, smin, smax, sstep, clamp, lerp, noise3, surfaceNets } from './sdfmesh.js';

/*
  The human body, as one continuous surface per material (skin / top / bottom), skinned to the Person's bones.
  Everything here is modelled at s = 1 (h = 1.7) in an A-pose: arms 30° out, legs 4.5° out, so limbs don't fuse.
  Results are cached by shape, because many people in the game share one.
*/
export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'wrL', 'shR', 'elR', 'wrR', 'hpL', 'knL', 'anL', 'toeL', 'hpR', 'knR', 'anR', 'toeR'];
const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
export const BIND = { arm: 30 * Math.PI / 180, leg: 4.5 * Math.PI / 180 };

const add = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function config(o) {
  const h = o.h || 1.68, kid = h < 1.4, build = o.build ?? 1;
  const female = o.female ?? !!(o.skirt || o.tank || o.hair === 'long' || o.hair === 'bun');
  const adultF = female && h >= 1.45;
  const wide = 0.76 + 0.24 * build, deep = 0.7 + 0.3 * build, limb = 0.72 + 0.28 * build;
  const s = h / 1.7;
  const C = {
    kid, female, adultF, wide, deep, limb, belly: !!o.belly, build,
    ankleY: 0.062, kneeY: 0.44, hipJ: 0.79, hipsY: 0.81, spineY: 0.85, chestY: 1.15, shY: 1.228, neckY: 1.275,
    shX: (adultF ? 0.135 : 0.152) * wide, hipX: 0.08 * (adultF ? 1.02 : 0.96) * wide, ua: 0.285, fa: 0.235,
    long: !!o.longSleeve, tank: !!o.tank, collar: !!o.collar, shorts: !!o.shorts, skirt: !!o.skirt,
    sleeve: Math.min(0.25, (o.sleeve ?? 0.13 * s) / s + 0.03),
    barefoot: !!o.barefoot, slippers: !!o.slippers, s,
  };
  C.key = [kid, adultF, female, build.toFixed(2), C.belly, C.long, C.sleeve.toFixed(2), C.shorts, C.skirt, C.tank, C.collar].join();
  return C;
}
function armPts(C, sx) { const d = [sx * Math.sin(BIND.arm), -Math.cos(BIND.arm), 0], sh = [sx * C.shX, C.shY, 0], el = add(sh, d, C.ua), wr = add(el, d, C.fa); return { d, sh, el, wr }; }
function legPts(C, sx) { const d = [sx * Math.sin(BIND.leg), -Math.cos(BIND.leg), 0], hp = [sx * C.hipX, C.hipJ, 0], kn = add(hp, d, C.hipJ - C.kneeY), an = add(kn, d, C.kneeY - C.ankleY); return { d, hp, kn, an }; }

/* ---------- body volumes ---------- */
function torso(C) {
  const { wide: w, deep: e, belly } = C, hw = C.adultF ? 1.03 : 0.95, nar = C.adultF ? 0.9 : 1;
  const P = [
    [ell(0, 0.835, -0.004, 0.158 * hw * w, 0.105, 0.106 * e * (belly ? 1.1 : 1))],
    [ell(0, 0.965, belly ? 0.016 : 0, 0.13 * nar * w * (belly ? 1.14 : 1), 0.125, 0.088 * e * (belly ? 1.32 : 1)), 0.05],
    [ell(0, 1.11, 0, 0.15 * nar * w, 0.155, 0.102 * e), 0.05],
    [ell(0, 1.205, -0.008, C.shX * 1.04, 0.05, 0.078 * e), 0.05],
  ];
  for (const sx of [-1, 1]) {
    P.push([ell(sx * 0.07 * hw * w, 0.795, -0.05, 0.08 * hw * w, 0.085, 0.076 * e), 0.04]);
    P.push([cone([0, 1.292, -0.018], [sx * C.shX * 0.8, 1.234, -0.012], 0.044, 0.036), 0.05]);
    if (C.adultF) P.push([ell(sx * 0.064, 1.118, 0.07 * e, 0.058, 0.052, 0.036), 0.055]);
    else if (!C.kid) P.push([ell(sx * 0.07, 1.165, 0.072 * e, 0.078, 0.05, 0.036), 0.04]);
  }
  return blend(P);
}
function upperArm(C, sx, t0 = 0, t1 = 1) {
  const A = armPts(C, sx), l = C.limb, a = mix(A.sh, A.el, t0), b = mix(A.sh, A.el, t1);
  return blend([[cone(a, b, lerp(0.045, 0.036, t0) * l, lerp(0.045, 0.036, t1) * l, 0.94)], [cone(A.sh, add(A.sh, A.d, 0.07), 0.049 * l, 0.045 * l), 0.03]].slice(0, t0 > 0.05 ? 1 : 2));
}
function foreArm(C, sx) {
  const A = armPts(C, sx), l = C.limb;
  return blend([[cone(A.el, A.wr, 0.039 * l, 0.0235 * (0.6 + 0.4 * l), 1.12)], [cone(add(A.el, A.d, 0.03), add(A.el, A.d, 0.12), 0.042 * l, 0.034 * l, 0.92), 0.03]]);
}
function legVol(C, sx, extra = 0, knee = true) {
  const G = legPts(C, sx), l = C.limb, F = C.female ? 0.97 : 1, z = [0, 0, 1];
  return blend([
    [cone(G.hp, G.kn, (0.09 * F * l) + extra, (0.054 * l) + extra, 0.96)],
    [cone(add(G.kn, G.d, -0.02), G.an, (0.05 * l) + extra, (0.034 * l) + extra), 0.03],
    [cone(add(add(G.kn, G.d, 0.05), z, -0.016), add(add(G.kn, G.d, 0.24), z, -0.012), (0.05 * l) + extra, (0.036 * l) + extra), 0.03],
    ...(knee ? [[ell(G.kn[0], G.kn[1] + 0.005, 0.018, 0.047 * l + extra, 0.05, 0.042 + extra), 0.03]] : []),
  ]);
}

/* ---------- skin weights: distance to each bone's capsule, so joints blend across their own width ---------- */
function segments(C) {
  const S = [{ b: B.hips, a: [0, 0.78, 0], e: [0, 0.86, 0], r: 0.1 }, { b: B.spine, a: [0, 0.94, 0], e: [0, 1.125, 0], r: 0.125 }, { b: B.neck, a: [0, 1.285, 0], e: [0, 1.34, 0], r: 0.05 }];
  for (const [n, sx] of [['L', 1], ['R', -1]]) {
    const A = armPts(C, sx), G = legPts(C, sx);
    S.push({ b: B['sh' + n], a: add(A.sh, A.d, 0.02), e: A.el, r: 0.045, side: sx }, { b: B['el' + n], a: A.el, e: A.wr, r: 0.03, side: sx }, { b: B['wr' + n], a: A.wr, e: add(A.wr, A.d, 0.06), r: 0.012, side: sx });
    S.push({ b: B['hp' + n], a: G.hp, e: G.kn, r: 0.07, side: sx }, { b: B['kn' + n], a: G.kn, e: G.an, r: 0.042, side: sx }, { b: B['an' + n], a: G.an, e: add(G.an, G.d, 0.05), r: 0.01, side: sx });
  }
  return S;
}
function segDist(s, x, y, z) {
  const bx = s.e[0] - s.a[0], by = s.e[1] - s.a[1], bz = s.e[2] - s.a[2], px = x - s.a[0], py = y - s.a[1], pz = z - s.a[2];
  const t = clamp((px * bx + py * by + pz * bz) / (bx * bx + by * by + bz * bz), 0, 1);
  return Math.hypot(px - bx * t, py - by * t, pz - bz * t);
}
function weights(P, segs, { pow = 5, custom } = {}) {
  const n = P.length / 3, SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
  const w = new Float32Array(BONES.length);
  for (let i = 0; i < n; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    w.fill(0);
    if (!custom || !custom(x, y, z, w)) for (const s of segs) {
      if (s.side && x * s.side < -0.012) continue;
      const d = Math.max(segDist(s, x, y, z) - s.r, 0.004);
      w[s.b] += 1 / Math.pow(d, pow);
    }
    const top = [...w.keys()].sort((a, b) => w[b] - w[a]).slice(0, 4);
    let sum = 0; for (const b of top) sum += w[b];
    top.forEach((b, k) => { SI[i * 4 + k] = b; SW[i * 4 + k] = w[b] / (sum || 1); });
  }
  return { SI, SW };
}
function finish(mesh, segs, opts = {}) {
  const { positions: P, indices: I } = mesh;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  g.computeVertexNormals();
  const n = P.length / 3, uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { uv[i * 2] = (P[i * 3] + P[i * 3 + 2] * 0.7) * 1.8; uv[i * 2 + 1] = P[i * 3 + 1] * 1.8; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (segs) {
    const { SI, SW } = weights(P, segs, opts);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  }
  return g;
}
function mirrorX({ positions: P, indices: I }) {
  const Q = P.slice(), J = new Uint32Array(I.length);
  for (let i = 0; i < Q.length; i += 3) Q[i] = -Q[i];
  for (let i = 0; i < I.length; i += 3) { J[i] = I[i]; J[i + 1] = I[i + 2]; J[i + 2] = I[i + 1]; }
  return { positions: Q, indices: J };
}
function join(list) {
  let np = 0, ni = 0; for (const m of list) { np += m.positions.length; ni += m.indices.length; }
  const P = new Float32Array(np), I = new Uint32Array(ni); let op = 0, oi = 0;
  for (const m of list) { P.set(m.positions, op); for (let i = 0; i < m.indices.length; i++) I[oi + i] = m.indices[i] + op / 3; op += m.positions.length; oi += m.indices.length; }
  return { positions: P, indices: I };
}

/* ---------- garments ---------- */
function shirtField(C) {
  const T = torso(C), armL = armPts(C, 1), armR = armPts(C, -1);
  const ring = (x, y, z) => { // ribbed neckline
    const py = y - 1.27, pz = z + 0.004, c = Math.cos(0.22), sn = Math.sin(0.22), yy = py * c + pz * sn, zz = -py * sn + pz * c;
    const q = Math.hypot(x, zz) - 0.063 * C.wide; return Math.hypot(q, yy) - 0.0072;
  };
  const clipTop = (y, z) => { const py = y - 1.27, pz = z + 0.004; return py * Math.cos(0.22) + pz * Math.sin(0.22); };
  const hole = (x, y, z) => { // the neck opening
    const pz = z + 0.004, c = Math.cos(0.22), sn = Math.sin(0.22), py = y - 1.27; // a shallow recess just inside the ring
    return Math.max(Math.hypot(x, pz * c) - 0.06 * C.wide, -(py * c + pz * sn + 0.014));
  };
  const cuff = (A, p) => (p[0] - A.sh[0]) * A.d[0] + (p[1] - A.sh[1]) * A.d[1] + (p[2] - A.sh[2]) * A.d[2];
  const armU = [1, -1].map(sx => upperArm(C, sx)), armF = [1, -1].map(sx => foreArm(C, sx));
  const col = C.collar ? blend([1, -1].flatMap(sx => [
    [rell([sx * 0.05, 1.272, 0.046], [0.05, 0.034, 0.012], [-0.5, sx * 0.62, sx * 0.3])],
    [rell([sx * 0.056, 1.275, -0.02], [0.03, 0.022, 0.012], [0.9, sx * -0.9, 0])],
  ])) : null;
  const len = C.long ? C.ua + C.fa - 0.012 : C.sleeve;
  const f = (x, y, z) => {
    const flare = 0.009 + 0.008 * sstep(1.02, 0.84, y);
    let d = T(x, y, z) - flare;
    if (C.tank) {
      const neck = y - (1.15 + 0.06 * sstep(0.03, 0.11, Math.abs(x)));
      const strap = Math.max(Math.abs(Math.abs(x) - 0.098 * C.wide) - 0.016, 1.08 - y);
      d = smax(d + flare - 0.0095, Math.min(neck, strap), 0.005);
    } else {
      const A = x > 0 ? armL : armR, i = x > 0 ? 0 : 1;
      let a = armU[i](x, y, z);
      if (C.long) a = smin(a, armF[i](x, y, z), 0.02);
      a -= C.long ? 0.008 : 0.0075;
      const t = cuff(A, [x, y, z]);
      a = smax(a, t - len, 0.006);
      d = smin(d, a, 0.03);
      d = smax(d, clipTop(y, z), 0.008); d = smax(d, -hole(x, y, z), 0.008);
      if (col) d = smin(d, col(x, y, z), 0.004); else d = smin(d, ring(x, y, z), 0.01);
    }
    d = smax(d, (C.tank ? 0.86 : 0.8) - y, 0.007);
    const n = noise3(x * 15, y * 8, z * 15) * 0.0036 + noise3(x * 31, y * 20, z * 31) * 0.0009 + Math.sin(x * 34 + y * 16 + z * 27 + noise3(x * 6, y * 6, z * 6) * 4) * 0.0012 * sstep(1.03, 0.84, y);
    return d - n * sstep(1.27, 1.22, y);
  };
  return f;
}
function bottomField(C) {
  const T = torso(C), Ls = [legVol(C, 1, 0.009, false), legVol(C, -1, 0.009, false)], Ln = [legVol(C, 1, 0.013, false), legVol(C, -1, 0.013, false)];
  if (C.skirt) {
    const sk = cone([0, 0.86, -0.004], [0, 0.42, -0.012], 0.145 * C.wide, 0.205 * C.wide, 0.74);
    return (x, y, z) => {
      const t = T(x, y, z) - 0.007;
      let d = lerp(smin(t, sk(x, y, z), 0.05), t, sstep(0.71, 0.79, y));
      d = smax(d, y - 0.92, 0.006); d = smax(d, 0.4 - y, 0.005);
      return d - Math.sin(Math.atan2(x, z) * 9 + noise3(x * 5, y * 3, z * 5) * 2) * 0.0035 * sstep(0.8, 0.5, y) - noise3(x * 13, y * 7, z * 13) * 0.002;
    };
  }
  const hem = C.shorts ? 0.57 : C.ankleY + 0.022;
  return (x, y, z) => {
    const L = Ls[x > 0 ? 0 : 1], N = Ln[x > 0 ? 0 : 1];
    let d = lerp(N(x, y, z), L(x, y, z), sstep(0.42, 0.62, y)) - (C.shorts ? 0.006 : 0);
    const t = T(x, y, z) - 0.007;
    d = lerp(smin(t, d, 0.05), t, sstep(0.71, 0.79, y));
    d = smax(d, y - 0.925, 0.006); d = smax(d, hem - y, 0.007);
    const kf = Math.exp(-(((y - C.kneeY) / 0.06) ** 2)) * Math.sin(y * 80 + x * 30) * 0.0024;
    const st = sstep(0.24, 0.1, y) * Math.sin(y * 74 + z * 22 + x * 14) * 0.0036;
    return d - noise3(x * 17, y * 8, z * 17) * 0.0026 - kf - st;
  };
}

const cache = new Map();
export function bodyParts(C) {
  if (cache.has(C.key)) return cache.get(C.key);
  const segs = segments(C), parts = {};
  // top
  const topF = shirtField(C), xm = C.shX + (C.long ? 0.3 : 0.2);
  parts.top = finish(surfaceNets(topF, [-xm, 0.77, -0.17], [xm, C.long ? 1.36 : 1.34, 0.17], 0.0125), segs, { pow: 5 });
  parts.topField = topF;
  // bottom
  const botF = bottomField(C);
  const y0 = C.skirt ? 0.37 : C.shorts ? 0.54 : 0.05;
  const cust = C.skirt ? (x, y, z, w) => {
    const t = sstep(0.86, 0.6, y), r = sstep(-0.05, 0.05, x);
    w[B.hips] = 1 - t; w[B.hpL] = t * r; w[B.hpR] = t * (1 - r); return true;
  } : null;
  parts.bottom = finish(surfaceNets(botF, [-0.34, y0, -0.2], [0.34, 0.95, 0.2], 0.0145), segs, { pow: 5, custom: cust });
  // skin that shows: neck, arms past the sleeve, legs past the hem
  const skin = [];
  const nk = C.female || C.kid ? 1 : 1.1, neck = cone([0, 1.25, -0.014], [0, 1.352, 0.004], 0.058 * C.wide * nk, 0.05 * (C.kid ? 0.92 : nk));
  if (C.tank) {
    const T = torso(C), aL = upperArm(C, 1), fL = foreArm(C, 1), aR = upperArm(C, -1), fR = foreArm(C, -1);
    const f = (x, y, z) => {
      const arm = x > 0 ? smin(aL(x, y, z), fL(x, y, z), 0.02) : smin(aR(x, y, z), fR(x, y, z), 0.02);
      return smin(smax(smin(T(x, y, z), neck(x, y, z), 0.03), 1.1 - y, 0.01), arm, 0.03);
    };
    skin.push(surfaceNets(f, [-0.72, 0.68, -0.15], [0.72, 1.37, 0.15], 0.012));
  } else {
    skin.push(surfaceNets(neck, [-0.09, 1.2, -0.09], [0.09, 1.37, 0.09], 0.0085));
    if (!C.long) {
      const t0 = clamp((C.sleeve - 0.035) / C.ua, 0, 0.9), up = upperArm(C, 1, t0), fo = foreArm(C, 1), A = armPts(C, 1);
      const arm = surfaceNets((x, y, z) => smin(up(x, y, z), fo(x, y, z), 0.025), [Math.min(A.sh[0], A.wr[0]) - 0.07, A.wr[1] - 0.06, -0.08], [A.wr[0] + 0.07, A.sh[1] + 0.03, 0.08], 0.0105);
      skin.push(arm, mirrorX(arm));
    }
  }
  if (C.shorts || C.skirt) {
    const top = C.skirt ? 0.5 : 0.6, v = legVol(C, 1), G = legPts(C, 1);
    const leg = surfaceNets((x, y, z) => smax(v(x, y, z), y - top, 0.006), [0, 0.03, -0.1], [G.hp[0] + 0.2, top + 0.02, 0.1], 0.0125);
    skin.push(leg, mirrorX(leg));
  }
  parts.skin = finish(join(skin), segs, { pow: 5 });
  cache.set(C.key, parts);
  return parts;
}

/** a copy of a cached part, scaled to this person */
export function scaled(geo, s) {
  const g = new THREE.BufferGeometry();
  for (const n of ['normal', 'uv', 'skinIndex', 'skinWeight', 'color']) if (geo.attributes[n]) g.setAttribute(n, geo.attributes[n]);
  const P = geo.attributes.position.array.slice(); for (let i = 0; i < P.length; i++) P[i] *= s;
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setIndex(geo.index);
  return g;
}

/* ---------- hands: wrist at the origin, fingers down, thumb toward +Z, palm toward -X (left hand) ---------- */
let handCache = null;
export function handGeometry() {
  if (handCache) return handCache;
  const P = [[ell(0, -0.05, 0.002, 0.0165, 0.05, 0.041)], [cone([0, 0.016, 0], [0, -0.02, 0], 0.0225, 0.026, 1.14), 0.016]];
  const fingers = [[0.028, 0.073], [0.0095, 0.082], [-0.0095, 0.077], [-0.027, 0.06]];
  for (const [z, l] of fingers) {
    let p = [-0.002, -0.094, z], a = 0.3; const seg = [0.42, 0.33, 0.25];
    for (let i = 0; i < 3; i++) {
      const q = add(p, [-Math.sin(a), -Math.cos(a), z * 0.09], l * seg[i]);
      P.push([cone(p, q, 0.0092 - i * 0.0008, 0.0084 - i * 0.0008), i === 0 ? 0.008 : 0.002]);
      p = q; a += 0.36;
    }
  }
  P.push([cone([-0.004, -0.024, 0.03], [-0.012, -0.058, 0.055], 0.0135, 0.0105), 0.012], [cone([-0.012, -0.058, 0.055], [-0.02, -0.088, 0.063], 0.0105, 0.0085), 0.002]);
  const m = surfaceNets(blend(P), [-0.06, -0.2, -0.05], [0.03, 0.02, 0.085], 0.0052, { smooth: 1 });
  handCache = { L: finish(m), R: finish(mirrorX(m)) };
  return handCache;
}

/* ---------- the same hand closed round a bar. The bar crosses the palm on a slant, the way a hammer handle does:
   it passes through (GRIP.x, GRIP.y, 0) of the left hand (mirror x for the right) along (0, -sin tilt, cos tilt),
   nearer the fingertips on the index side, nearer the wrist on the little-finger side ---------- */
export const GRIP = { x: -0.031, y: -0.099, tilt: 0.42, bar: 0.016 };
let gripCache = null;
/** the point on a ring (centre c, radius R) a bone of length L reaches from p, going round the way fingers close */
function onRing(p, L, cx, cy, R) {
  const dx = p[0] - cx, dy = p[1] - cy, d = Math.hypot(dx, dy);
  const a = Math.acos(clamp((d * d + R * R - L * L) / (2 * d * R), -1, 1)), th = Math.atan2(dy, dx) - a;
  return [cx + R * Math.cos(th), cy + R * Math.sin(th)];
}
export function gripGeometry() {
  if (gripCache) return gripCache;
  const P = [[ell(0, -0.05, 0.002, 0.0165, 0.05, 0.041)], [cone([0, 0.016, 0], [0, -0.02, 0], 0.0225, 0.026, 1.14), 0.016]];
  const { x: cx, y: cy, tilt, bar } = GRIP, tn = Math.tan(tilt), R = bar / Math.cos(tilt) + 0.0086;
  for (const [z, l] of [[0.028, 0.073], [0.0095, 0.082], [-0.0095, 0.077], [-0.027, 0.06]]) {
    const oy = cy - z * tn; let p = [-0.002, -0.094, z];
    [0.42, 0.33, 0.25].forEach((f, i) => {
      const q = onRing(p, l * f, cx, oy, R), Q = [q[0], q[1], z];
      P.push([cone(p, Q, 0.0092 - i * 0.0008, 0.0084 - i * 0.0008), i === 0 ? 0.008 : 0.002]);
      p = Q;
    });
  }
  // the thumb comes round the other way and lies along the bar
  P.push([cone([-0.004, -0.024, 0.03], [-0.028, -0.06, 0.05], 0.0135, 0.0105), 0.012], [cone([-0.028, -0.06, 0.05], [-0.052, -0.088, 0.044], 0.0105, 0.0085), 0.002]);
  const m = surfaceNets(blend(P), [-0.075, -0.15, -0.05], [0.03, 0.02, 0.085], 0.0048, { smooth: 1 });
  gripCache = { L: finish(m), R: finish(mirrorX(m)) };
  return gripCache;
}

/* ---------- feet: ankle at the origin, toes toward +Z ---------- */
const footCache = new Map();
export const FOOT = { ankleH: 0.062, ballZ: 0.118, ballY: -0.05, heelZ: -0.05 };
function footGeo(mesh, sideBones) {
  const P = mesh.positions, n = P.length / 3, SI = new Uint16Array(n * 4), SW = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const t = sstep(FOOT.ballZ - 0.02, FOOT.ballZ + 0.02, P[i * 3 + 2]);
    SI[i * 4] = sideBones[0]; SI[i * 4 + 1] = sideBones[1]; SW[i * 4] = 1 - t; SW[i * 4 + 1] = t;
  }
  const g = finish(mesh);
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
  return g;
}
const floorCut = (f, y0) => (x, y, z) => smax(f(x, y, z), y0 - y, 0.003);
function shoeField() {
  const up = blend([
    [ell(0, -0.03, -0.028, 0.041, 0.04, 0.05)],
    [cone([0, -0.028, 0.0], [0, -0.041, 0.1], 0.041, 0.031), 0.02],
    [ell(0, -0.041, 0.13, 0.046, 0.026, 0.066), 0.02],
    [cone([0, -0.02, -0.018], [0, 0.03, -0.012], 0.04, 0.036), 0.012],
  ]);
  return (x, y, z) => {
    const c = smax(floorCut(up, -FOOT.ankleH)(x, y, z), y - 0.048, 0.006); // open collar
    return c;
  };
}
function bareField() {
  const P = [
    [cone([0, 0.04, -0.012], [0, -0.022, -0.01], 0.034, 0.036)],
    [ell(0, -0.036, -0.03, 0.033, 0.03, 0.038), 0.02],
    [cone([0, -0.03, 0.0], [0, -0.046, 0.1], 0.034, 0.02), 0.02],
    [ell(0.002, -0.05, 0.11, 0.042, 0.015, 0.03), 0.015],
  ];
  // toes: big toe toward the inside (-x for the left foot)
  [[-0.03, 0.172, 0.0105], [-0.0115, 0.17, 0.0078], [0.004, 0.164, 0.0074], [0.019, 0.155, 0.007], [0.032, 0.143, 0.0066]].forEach(([x, z, r]) => P.push([cone([x * 0.9, -0.052, 0.125], [x, -0.054, z], r, r * 0.92), 0.006]));
  return floorCut(blend(P), -FOOT.ankleH);
}
/** one foot's meshes for side L|R: { main, solePart } */
export function footGeometry(kind, side) {
  const key = kind + side; if (footCache.has(key)) return footCache.get(key);
  const bones = side === 'L' ? [B.anL, B.toeL] : [B.anR, B.toeR];
  const mir = m => side === 'L' ? m : mirrorX(m);
  let out;
  if (kind === 'shoe') {
    const f = shoeField();
    const upper = surfaceNets((x, y, z) => smax(f(x, y, z), -0.05 - y, 0.002), [-0.07, -0.07, -0.1], [0.07, 0.06, 0.22], 0.0085);
    const base = (x, y, z) => smax(smax(blend([[ell(0, -0.052, -0.024, 0.045, 0.03, 0.054)], [cone([0, -0.052, 0], [0, -0.052, 0.1], 0.04, 0.04), 0.03], [ell(0, -0.052, 0.13, 0.05, 0.03, 0.073), 0.03]])(x, y, z), -FOOT.ankleH - y, 0.002), y + 0.044, 0.002);
    const sole = surfaceNets(base, [-0.07, -0.07, -0.1], [0.07, -0.03, 0.22], 0.0075);
    out = { main: footGeo(mir(upper), bones), sole: footGeo(mir(sole), bones) };
  } else {
    const main = footGeo(mir(surfaceNets(bareField(), [-0.06, -0.07, -0.09], [0.06, 0.07, 0.2], 0.0058)), bones);
    out = { main };
    if (kind === 'slipper') {
      const base = (x, y, z) => {
        const o = blend([[ell(0, 0, -0.024, 0.046, 0.3, 0.056)], [ell(0, 0, 0.09, 0.05, 0.3, 0.1), 0.03]])(x, y, z);
        return smax(smax(o, -FOOT.ankleH - 0.006 - y, 0.002), y + FOOT.ankleH - 0.004, 0.002);
      };
      const strap = blend([1, -1].map(sx => [cone([-0.016, -0.046, 0.14], [sx * 0.043, -0.05, 0.03], 0.0048, 0.0048)]));
      const sole = surfaceNets(base, [-0.07, -0.085, -0.1], [0.07, -0.045, 0.22], 0.0075);
      const st = surfaceNets(strap, [-0.07, -0.07, 0], [0.07, -0.02, 0.17], 0.0036);
      out.sole = footGeo(mir(join([sole, st])), bones);
    }
  }
  footCache.set(key, out);
  return out;
}

/* ---------- face + skull, in units of the head radius, chin-side origin at the neck ---------- */
const headCache = new Map();
export function headGeometry(female) {
  const key = female ? 'f' : 'm'; if (headCache.has(key)) return headCache.get(key);
  const j = female ? 0.9 : 1;
  const P = [
    [ell(0, 1.05, -0.07, 0.9, 0.99, 1.02)],
    [ell(0, 0.74, 0.22, 0.73, 0.78, 0.7), 0.25],
    [ell(0, 0.42, 0.2, 0.62 * j, 0.42, 0.62), 0.25],
    [ell(0, 0.22, 0.6, 0.24 * j, 0.19, 0.22), 0.2],
    [ell(0, 1.13, 0.77, 0.64, 0.12, 0.15), 0.22],
  ];
  for (const sx of [-1, 1]) {
    P.push([ell(sx * 0.46, 0.72, 0.56, 0.25, 0.19, 0.2), 0.22]);
    P.push([rell([sx * 0.91, 0.92, -0.04], [0.06, 0.2, 0.13], [0, sx * 0.3, sx * -0.06]), 0.05]);
    P.push([ell(sx * 0.105, 0.7, 1.0, 0.085, 0.066, 0.09), 0.05]);
  }
  P.push([cone([0, 1.03, 0.9], [0, 0.73, 1.1], 0.085, 0.112), 0.1]);
  const base = blend(P);
  const sockets = [1, -1].map(sx => ell(sx * 0.36, 0.965, 1.02, 0.19, 0.082, 0.2));
  const lipU = ell(0, 0.495, 0.87, 0.23 * j, 0.05, 0.085), lipL = ell(0, 0.415, 0.86, 0.19 * j, 0.06, 0.085);
  const f = (x, y, z) => {
    let d = base(x, y, z);
    d = smax(d, -sockets[x > 0 ? 0 : 1](x, y, z), 0.14);
    d = smin(d, lipU(x, y, z), 0.05); d = smin(d, lipL(x, y, z), 0.05);
    return d;
  };
  const m = surfaceNets(f, [-1.15, -0.1, -1.2], [1.15, 2.2, 1.35], 0.072, { smooth: 1 });
  const g = finish(m); headCache.set(key, g);
  return g;
}

/* ---------- long wet hair: clumps from the scalp down past the shoulders, head at the root, spine at the tip ---------- */
const hairCache = new Map();
export function longHair(C, hr) {
  const key = C.key + hr.toFixed(3); if (hairCache.has(key)) return hairCache.get(key);
  const hy = C.neckY + 0.062, cy = hy + hr * 1.03, cz = -hr * 0.05; // head centre
  const Rx = hr * 0.98, Ry = hr * 1.06, Rz = hr * 1.1;
  const rnd = (i, k) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  const list = [];
  const N = 96;
  for (let i = 0; i < N; i++) {
    const a = -2.45 + 4.9 * (i + 0.5) / N + (rnd(i, 1) - 0.5) * 0.08; // around the head, 0 = straight behind
    const front = Math.abs(a) > 1.5;
    const pol = 0.35 + rnd(i, 2) * 0.5 + (front ? 0.2 : 0);
    const sx = Math.sin(a), bz = -Math.cos(a);
    const tipLen = 0.92 + rnd(i, 3) * 0.2;
    const root = [sx * Rx * Math.sin(pol), cy + Ry * Math.cos(pol), cz + bz * Rz * Math.sin(pol)];
    const side = [sx * Rx * 1.1, cy - hr * 0.2, cz + bz * Rz * 1.05];
    const low = [sx * Rx * (front ? 1.25 : 1.12), cy - hr * 1.15, cz + bz * Rz * (front ? 0.98 : 1.04)];
    const tipy = lerp(1.3, 1.0, tipLen / 1.1) - (front ? 0.0 : 0.04);
    const shoulderZ = front ? 0.095 : -0.1 - 0.012 * rnd(i, 5);
    const tip = [sx * (front ? 0.135 : 0.17) * (0.95 + rnd(i, 4) * 0.1), tipy, shoulderZ];
    const mid = [lerp(low[0], tip[0], 0.45), lerp(low[1], tip[1], 0.5), front ? lerp(low[2], tip[2], 0.65) : Math.min(lerp(low[2], tip[2], 0.65), -0.095)];
    list.push([root, side, low, mid, tip, 0.0115 + rnd(i, 6) * 0.005, rnd(i, 7) * 6.28]);
  }
  const RINGS = 10, SIDES = 4, pos = [], idx = [], SI = [], SW = [];
  const cr = (p0, p1, p2, p3, t) => { const t2 = t * t, t3 = t2 * t; return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3); };
  list.forEach(([a, b, c, d, e, r0, ph], si) => {
    const P = [a, a, b, c, d, e, e], base = pos.length / 3;
    let prev = null;
    for (let i = 0; i < RINGS; i++) {
      const u = i / (RINGS - 1), seg = Math.min(3.999, u * 4), q = Math.floor(seg), t = seg - q;
      const p = [0, 1, 2].map(k => cr(P[q][k], P[q + 1][k], P[q + 2][k], P[q + 3][k], t));
      const wave = 0.004 * sstep(0.3, 0.7, u);
      p[0] += Math.sin(u * 13 + ph) * wave; p[2] += Math.cos(u * 11 + ph) * wave * 0.5;
      const dir = prev ? new THREE.Vector3(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]).normalize() : new THREE.Vector3(0, -1, 0);
      prev = p;
      const out = new THREE.Vector3(p[0], 0, p[2] - cz).normalize(), tan = new THREE.Vector3().crossVectors(dir, out).normalize(), nor = new THREE.Vector3().crossVectors(tan, dir).normalize();
      const r = r0 * (1 - Math.pow(u, 3) * 0.86) * (0.8 + 0.2 * sstep(0, 0.1, u));
      const wh = 1 - sstep(0.3, 0.62, u);
      for (let k = 0; k < SIDES; k++) {
        const th = k / SIDES * Math.PI * 2, cs = Math.cos(th) * r * 1.5, sn = Math.sin(th) * r * 0.55;
        pos.push(p[0] + tan.x * cs + nor.x * sn, p[1] + tan.y * cs + nor.y * sn, p[2] + tan.z * cs + nor.z * sn);
        SI.push(B.head, B.spine, 0, 0); SW.push(wh, 1 - wh, 0, 0);
      }
      if (i) for (let k = 0; k < SIDES; k++) {
        const n = (k + 1) % SIDES, o = base + (i - 1) * SIDES, w = base + i * SIDES;
        idx.push(o + k, w + k, w + n, o + k, w + n, o + n);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(SI, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(SW, 4));
  hairCache.set(key, g);
  return g;
}

/** a small mesh that follows the front of the shirt, for a chest print. size [w,h], centred at height y */
export function chestDecal(C, parts, size, y) {
  const NX = 18, NY = 14, pos = [], uv = [], idx = [], f = parts.topField;
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
    const u = i / NX, v = j / NY, px = (u - 0.5) * size[0], py = y + (v - 0.5) * size[1];
    let z = 0.2; for (let k = 0; k < 60; k++) { const d = f(px, py, z); if (d < 0.0006) break; z -= Math.max(d, 0.0006); }
    pos.push(px, py, z + 0.0035); uv.push(u, v);
  }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}


/* ---------- short hair: a scalp cap that follows a real hairline, with tufts over it. Units of head radius. ---------- */
const SCALP = { c: [0, 1.05, -0.07], r: [0.935, 1.02, 1.055] };
const HAIRLINE = [[0, 1.0], [0.7, 1.03], [1.1, 1.16], [1.5, 1.3], [2.2, 1.72], [Math.PI, 1.98]];
function hairLimit(a) {
  const x = Math.abs(a);
  for (let i = 1; i < HAIRLINE.length; i++) if (x <= HAIRLINE[i][0]) { const [x0, y0] = HAIRLINE[i - 1], [x1, y1] = HAIRLINE[i]; return lerp(y0, y1, (x - x0) / (x1 - x0)); }
  return HAIRLINE[HAIRLINE.length - 1][1];
}
const scalpPt = (a, p, k = 1) => [SCALP.c[0] + SCALP.r[0] * k * Math.sin(p) * Math.sin(a), SCALP.c[1] + SCALP.r[1] * k * Math.cos(p), SCALP.c[2] + SCALP.r[2] * k * Math.sin(p) * Math.cos(a)];
const capCache = new Map();
export function scalpCap(limitK = 1) {
  const key = limitK.toFixed(2); if (capCache.has(key)) return capCache.get(key);
  const g = new THREE.SphereGeometry(1, 40, 26), P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), p = Math.acos(clamp(y, -1, 1)), a = Math.atan2(x, z);
    const inside = sstep(0, 0.1, p - hairLimit(a) * limitK), k = lerp(1, 0.82, inside);
    P.setXYZ(i, SCALP.c[0] + SCALP.r[0] * k * x, SCALP.c[1] + SCALP.r[1] * k * y, SCALP.c[2] + SCALP.r[2] * k * z);
  }
  g.computeVertexNormals(); capCache.set(key, g);
  return g;
}
const tuftCache = new Map();
/** style: short | messy | bun | long. under: only below the cap line (for people wearing a cap) */
export function hairTufts(style, under = false) {
  const key = style + under; if (tuftCache.has(key)) return tuftCache.get(key);
  const rnd = (i, k) => { const s = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };
  const n = style === 'messy' ? 300 : 260;
  const lenB = style === 'messy' ? 0.62 : style === 'short' ? 0.4 : 0.48, jitter = style === 'messy' ? 0.55 : 0.18;
  const part = style === 'long', bun = [0, 1.25, -1.0];
  const pos = [], idx = [];
  for (let i = 0; i < n; i++) {
    const a = (rnd(i, 1) * 2 - 1) * Math.PI, u = rnd(i, 2), lim = hairLimit(a);
    const p = Math.acos(lerp(1, Math.cos(lim), u));
    if (under && p < 1.25) continue;
    const P0 = scalpPt(a, p, 0.985), out = new THREE.Vector3(P0[0] - SCALP.c[0], P0[1] - SCALP.c[1], P0[2] - SCALP.c[2]).normalize();
    // flow over the head
    const fl = new THREE.Vector3();
    if (style === 'bun') fl.set(bun[0] - P0[0], bun[1] - P0[1], bun[2] - P0[2]);
    else if (part) fl.set(Math.sign(P0[0] || 1), -0.5, -0.1);
    else { fl.set(Math.sin(a) * 0.9, -0.55, Math.cos(a) * 0.9); if (style === 'messy') fl.x += 0.35; }
    fl.addScaledVector(out, -fl.dot(out)).normalize();
    fl.x += (rnd(i, 3) - 0.5) * jitter * 2; fl.z += (rnd(i, 4) - 0.5) * jitter * 2; fl.y += (rnd(i, 5) - 0.5) * jitter;
    fl.addScaledVector(out, -fl.dot(out)).normalize();
    const L = lenB * (0.7 + rnd(i, 6) * 0.6), lift = (style === 'messy' ? 0.1 : 0.05) * (0.6 + rnd(i, 7));
    const side = new THREE.Vector3().crossVectors(out, fl).normalize();
    const r0 = (style === 'messy' ? 0.1 : 0.09) * (0.75 + rnd(i, 8) * 0.5);
    const base = pos.length / 3, RINGS = 4;
    for (let j = 0; j < RINGS; j++) {
      const t = j / (RINGS - 1), r = r0 * (1 - t * t * 0.92) * (j === 0 ? 0.75 : 1);
      const c = new THREE.Vector3(...P0).addScaledVector(fl, L * t).addScaledVector(out, lift * Math.sin(t * Math.PI * 0.7) - 0.14 * t * t * L);
      c.y -= 0.12 * t * t * L;
      for (const [sa, sb] of [[1, 0], [0, 0.42], [-1, 0], [0, -0.42]]) {
        const q = c.clone().addScaledVector(side, sa * r).addScaledVector(out, sb * r);
        pos.push(q.x, q.y, q.z);
      }
      if (j) for (let k = 0; k < 4; k++) { const e = (k + 1) % 4, o = base + (j - 1) * 4, w = base + j * 4; idx.push(o + k, w + k, w + e, o + k, w + e, o + e); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  tuftCache.set(key, g);
  return g;
}
