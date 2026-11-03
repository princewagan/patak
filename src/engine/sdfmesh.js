/* Signed-distance modelling for the people: small primitives, smooth blends, and a Surface Nets mesher.
   Bodies are one continuous surface this way, so there are no seams at shoulders, hips, elbows or knees. */

export const sq = x => x * x;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
export const smax = (a, b, k) => -smin(-a, -b, k);

/** axis-aligned ellipsoid */
export function ell(cx, cy, cz, rx, ry, rz) {
  const a = rx * rx, b = ry * ry, c = rz * rz, a2 = a * a, b2 = b * b, c2 = c * c, m = Math.min(rx, ry, rz);
  return (x, y, z) => {
    const px = x - cx, py = y - cy, pz = z - cz, xx = px * px, yy = py * py, zz = pz * pz;
    const k0 = Math.sqrt(xx / a + yy / b + zz / c), k1 = Math.sqrt(xx / a2 + yy / b2 + zz / c2);
    return k1 < 1e-9 ? -m : k0 * (k0 - 1) / k1;
  };
}
/** ellipsoid turned by euler angles (x then y then z, radians) */
export function rell(c, r, e) {
  const [sx, cx, sy, cy, sz, cz] = [Math.sin(e[0]), Math.cos(e[0]), Math.sin(e[1]), Math.cos(e[1]), Math.sin(e[2]), Math.cos(e[2])];
  const f = ell(0, 0, 0, r[0], r[1], r[2]);
  return (x, y, z) => {
    let px = x - c[0], py = y - c[1], pz = z - c[2], t;
    t = cz * px + sz * py; py = -sz * px + cz * py; px = t;
    t = cy * px - sy * pz; pz = sy * px + cy * pz; px = t;
    t = cx * py + sx * pz; pz = -sx * py + cx * pz; py = t;
    return f(px, py, pz);
  };
}
/** round cone from a (radius r1) to b (radius r2); zs < 1 flattens the section front to back */
export function cone(a, b, r1, r2, zs = 1) {
  const ax = a[0], ay = a[1], az = a[2] / zs, bx = b[0] - ax, by = b[1] - ay, bz = b[2] / zs - az;
  const l2 = bx * bx + by * by + bz * bz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2, sg = Math.sign(rr), f = Math.min(1, zs);
  return (x, y, z) => {
    const px = x - ax, py = y - ay, pz = z / zs - az;
    const yy = px * bx + py * by + pz * bz, zz = yy - l2;
    const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy;
    const x2 = qx * qx + qy * qy + qz * qz, y2 = yy * yy * l2, z2 = zz * zz * l2, k = sg * rr * rr * x2;
    let d;
    if (Math.sign(zz) * a2 * z2 > k) d = Math.sqrt(x2 + z2) * il2 - r2;
    else if (Math.sign(yy) * a2 * y2 < k) d = Math.sqrt(x2 + y2) * il2 - r1;
    else d = (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    return d * f;
  };
}
/** smooth union of [fn, k] pairs (k = blend size) */
export function blend(list) {
  const fs = list.map(p => Array.isArray(p) ? p[0] : p), ks = list.map(p => Array.isArray(p) ? (p[1] ?? 0) : 0), n = fs.length;
  return (x, y, z) => {
    let d = fs[0](x, y, z);
    for (let i = 1; i < n; i++) { const e = fs[i](x, y, z); d = ks[i] > 0 ? smin(d, e, ks[i]) : Math.min(d, e); }
    return d;
  };
}
/** cheap smooth 3D value noise, -1..1 */
export function noise3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  let u = x - i, v = y - j, w = z - k;
  u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
  const H = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
  const l = (a, b, t) => a + (b - a) * t;
  return 2 * l(l(l(H(i, j, k), H(i + 1, j, k), u), l(H(i, j + 1, k), H(i + 1, j + 1, k), u), v),
    l(l(H(i, j, k + 1), H(i + 1, j, k + 1), u), l(H(i, j + 1, k + 1), H(i + 1, j + 1, k + 1), u), v), w) - 1;
}

const CORNERS = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];

/** Surface Nets over a box. Far blocks are skipped using the distance bound, so only the narrow band is evaluated. */
export function surfaceNets(f, min, max, h, { smooth = 1 } = {}) {
  const [x0, y0, z0] = min;
  const nx = Math.ceil((max[0] - x0) / h) + 2, ny = Math.ceil((max[1] - y0) / h) + 2, nz = Math.ceil((max[2] - z0) / h) + 2;
  const nxy = nx * ny, nn = nxy * nz, B = 4;
  const v = new Float32Array(nn).fill(1), id = (i, j, k) => i + nx * j + nxy * k;
  const bx = Math.ceil((nx - 1) / B), by = Math.ceil((ny - 1) / B), bz = Math.ceil((nz - 1) / B);
  const R = h * B * 0.5 * Math.sqrt(3) * 1.45 + h * 1.5, near = [];
  for (let kb = 0; kb < bz; kb++) for (let jb = 0; jb < by; jb++) for (let ib = 0; ib < bx; ib++) {
    const d = f(x0 + (ib + 0.5) * B * h, y0 + (jb + 0.5) * B * h, z0 + (kb + 0.5) * B * h);
    if (Math.abs(d) < R) { near.push(ib, jb, kb); continue; }
    if (d > 0) continue; // the field starts out as "outside"
    for (let k = kb * B; k <= Math.min(nz - 1, (kb + 1) * B); k++) for (let j = jb * B; j <= Math.min(ny - 1, (jb + 1) * B); j++) for (let i = ib * B; i <= Math.min(nx - 1, (ib + 1) * B); i++) v[id(i, j, k)] = -1;
  }
  const seen = new Uint8Array(nn);
  for (let n = 0; n < near.length; n += 3) {
    const ib = near[n], jb = near[n + 1], kb = near[n + 2];
    for (let k = kb * B; k <= Math.min(nz - 1, (kb + 1) * B); k++) for (let j = jb * B; j <= Math.min(ny - 1, (jb + 1) * B); j++) for (let i = ib * B; i <= Math.min(nx - 1, (ib + 1) * B); i++) {
      const q = id(i, j, k); if (seen[q]) continue; seen[q] = 1; v[q] = f(x0 + i * h, y0 + j * h, z0 + k * h);
    }
  }
  // one vertex per sign-changing cell
  const cell = new Int32Array(nn).fill(-1), pos = [], c = new Float32Array(8);
  const eachCell = fn => {
    for (let n = 0; n < near.length; n += 3) {
      const ib = near[n], jb = near[n + 1], kb = near[n + 2];
      for (let k = kb * B; k < Math.min(nz - 1, (kb + 1) * B); k++) for (let j = jb * B; j < Math.min(ny - 1, (jb + 1) * B); j++) for (let i = ib * B; i < Math.min(nx - 1, (ib + 1) * B); i++) fn(i, j, k);
    }
  };
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
    pos.push(x0 + (i + sx / m) * h, y0 + (j + sy / m) * h, z0 + (k + sz / m) * h);
  });
  // a quad around every edge that crosses the surface
  const idx = [];
  const quad = (a, b, c2, d, flip) => {
    if (a < 0 || b < 0 || c2 < 0 || d < 0) return;
    if (flip) idx.push(a, c2, b, a, d, c2); else idx.push(a, b, c2, a, c2, d);
  };
  eachCell((i, j, k) => {
    const d0 = v[id(i, j, k)], o = d0 < 0;
    if (j > 0 && k > 0 && (v[id(i + 1, j, k)] < 0) !== o) quad(cell[id(i, j - 1, k - 1)], cell[id(i, j, k - 1)], cell[id(i, j, k)], cell[id(i, j - 1, k)], !o);
    if (i > 0 && k > 0 && (v[id(i, j + 1, k)] < 0) !== o) quad(cell[id(i - 1, j, k - 1)], cell[id(i - 1, j, k)], cell[id(i, j, k)], cell[id(i, j, k - 1)], !o);
    if (i > 0 && j > 0 && (v[id(i, j, k + 1)] < 0) !== o) quad(cell[id(i - 1, j - 1, k)], cell[id(i, j - 1, k)], cell[id(i, j, k)], cell[id(i - 1, j, k)], !o);
  });
  const P = new Float32Array(pos), I = new Uint32Array(idx);
  for (let s = 0; s < smooth; s++) {
    const n = P.length / 3, sum = new Float32Array(n * 3), cnt = new Uint16Array(n);
    for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = I[t + e], b = I[t + (e + 1) % 3];
      sum[a * 3] += P[b * 3]; sum[a * 3 + 1] += P[b * 3 + 1]; sum[a * 3 + 2] += P[b * 3 + 2]; cnt[a]++;
      sum[b * 3] += P[a * 3]; sum[b * 3 + 1] += P[a * 3 + 1]; sum[b * 3 + 2] += P[a * 3 + 2]; cnt[b]++;
    }
    for (let i = 0; i < n; i++) if (cnt[i]) for (let e = 0; e < 3; e++) P[i * 3 + e] += (sum[i * 3 + e] / cnt[i] - P[i * 3 + e]) * 0.5;
  }
  return { positions: P, indices: I };
}
