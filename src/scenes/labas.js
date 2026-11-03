import * as THREE from 'three';
import { prewarm } from '../engine/prewarm.js';
import { pbr, std, box, cyl, at, blob, canvasTex, envFrom, tex, rand } from '../engine/kit.js';
import { Person } from '../engine/person.js';
import { handGeometry } from '../engine/body.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { animate, walkPath } from '../engine/tween.js';

/*
  Aug 17, 2026, 2:57 PM. Out of the car, down the lane, into the real photo (IMG_6457).

  The photo is laid over simple geometry (see jeepPhoto): the phone was pitched down 7.4°, and at this scale
  the jeep is about 2 m wide and the floodwater sits at y = -2.2 with the phone at the origin. Seen from the
  origin it is exactly the photograph. Everything nearer than the photo is real 3D: a lane that opens onto the
  flooded street, so the walk ends with the camera almost at the spot the photo was taken from.

  The people in the photo itself (umbrellas, motorbike) are the real people. The 3D ones are the three behind us in
  IMG_6462, dressed as they were: the mom from the house (white tee, navy pants, black umbrella) who did most of the
  talking, and two neighbours from two other houses (an older man in a grey-violet shirt; a man in a blue NY cap,
  black trefoil tee and black shorts, arms crossed). Faces stay generic on purpose: the real faces are blurred in the
  public files. Keira and Prince are not in this scene: until the story turns into ours, the one walking is Sir.
*/
const PI = Math.PI;
const PITCH = -7.4 * PI / 180, SCALE = 0.85;
export const roadY = z => (z < -2.3 ? -1.94 + (z + 2.3) * 0.34 : -1.94 + Math.min(z + 2.3, 22) * 0.1);
const walkY = z => roadY(z) + 0.14;   // sidewalk
/** white three-leaf print on a black tee, like the one in IMG_6462 */
const leafPrint = () => canvasTex(256, 200, (c, w, h) => {
  c.clearRect(0, 0, w, h); c.fillStyle = '#e8e8e4'; c.translate(w / 2, h * 0.72);
  for (const a of [-1.05, 0, 1.05]) { c.save(); c.rotate(a); c.beginPath(); c.ellipse(0, -62, 34, 62, 0, 0, 7); c.fill(); c.restore(); }
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#101114';
  for (let i = 0; i < 3; i++) c.fillRect(0, h * 0.5 + i * 22, w, 7);
  c.clearRect(0, h * 0.86, w, h);
});
const CURB = -1.25, WALL_L = -3.2, WALL_R = 3.6, STEP = 0.62;
const _v = new THREE.Vector3();

/* The photo as simple geometry, built here from hand-traced regions (image px, 825×1100), because the depth map
   is noisy around the wires and sky. From the phone's position it is pixel-for-pixel the photograph; from behind
   the floor is truly flat, the walls are planes running to the vanishing point, and the people are cards. */
const IW = 825, IH = 1100;
const REG = {
  jeep: [[226, 503], [322, 503], [326, 562], [228, 562]],
  lCard: [[0, 555], [150, 590], [152, 640], [60, 655], [146, 736], [128, 800], [118, 870], [110, 925], [60, 1012], [0, 1020]],
  rCard: [[628, 740], [640, 640], [660, 608], [700, 612], [825, 600], [825, 930], [770, 908], [758, 770], [740, 792], [640, 792]],
  curb: [[0, 1020], [60, 1012], [110, 925], [128, 935], [205, 968], [172, 1100], [0, 1100]],
  floor: [[258, 476], [205, 540], [150, 548], [108, 570], [152, 600], [152, 640], [60, 655], [146, 736], [128, 800], [118, 870], [110, 925], [128, 935], [205, 968], [172, 1100], [825, 1100], [825, 930], [770, 908], [758, 770], [740, 792], [640, 792], [628, 740], [640, 640], [660, 608], [640, 600], [600, 536], [490, 500], [466, 476], [396, 470]],
  lWall: [[0, 214], [78, 214], [130, 252], [206, 290], [214, 450], [258, 476], [205, 540], [150, 548], [108, 570], [0, 555]],
  rWall: [[470, 262], [640, 232], [825, 120], [825, 600], [700, 612], [660, 608], [640, 600], [600, 536], [490, 500], [466, 476]],
};
const inPoly = (x, y, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };

function jeepPhoto() {
  const tanY = Math.tan(THREE.MathUtils.degToRad(67) / 2), tanX = tanY * 0.75, cp = Math.cos(PITCH), sp = Math.sin(PITCH);
  const SK = 0.081, X0L = -4.9, X0R = 4.4, TMAX = 56 / SCALE;   // street direction, wall offsets, far plane
  // cards stand where their bottom edge meets the floor
  const yK = py => SCALE * ((0.5 - py / IH) * 2 * tanY * cp + sp);
  const JT = -2.2 / yK(564), RT = -2.2 / yK(925), LT = -1.86 / yK(1012);
  // depth along the photo's axis for a pixel
  const depth = (px, py, a, b) => {
    const rx = (px / IW - 0.5) * 2 * tanX, ry = (0.5 - py / IH) * 2 * tanY;
    const yk = SCALE * (ry * cp + sp), zk = SCALE * (ry * sp - cp);
    const plane = () => (yk < -1e-4 ? Math.min(TMAX, -2.2 / yk) : TMAX);        // water: y = yk t = -2.2
    if (inPoly(px, py, REG.jeep)) return JT;
    if (inPoly(px, py, REG.lCard)) return LT;
    if (inPoly(px, py, REG.rCard)) return RT;
    if (inPoly(px, py, REG.curb)) { const t = (-1.94 + 0.14 + 0.782) / (yk - 0.34 * zk); return t > 0 ? Math.min(t, 3.3 / SCALE) : plane(); }
    if (inPoly(px, py, REG.floor)) {
      const t = -1.158 / (yk - 0.34 * zk);                                   // road: y = -1.94 + 0.34 (z + 2.3)
      return t > 0 && t * -zk < 3.1 ? t : plane();
    }
    if (inPoly(px, py, REG.lWall)) { const t = X0L / (SCALE * (rx - SK * (ry * sp - cp))); if (t > 0) return Math.min(plane(), t); }
    if (inPoly(px, py, REG.rWall)) { const t = X0R / (SCALE * (rx - SK * (ry * sp - cp))); if (t > 0) return Math.min(plane(), t); }
    return TMAX;
  };
  const NX = 330, NY = 440, pos = new Float32Array((NX + 1) * (NY + 1) * 3), uv = new Float32Array((NX + 1) * (NY + 1) * 2), idx = [], T = new Float32Array((NX + 1) * (NY + 1));
  for (let j = 0, o = 0; j <= NY; j++) for (let i = 0; i <= NX; i++, o++) {
    const u = i / NX, v = j / NY, t = depth(u * IW, (1 - v) * IH);
    const rx = (u - 0.5) * 2 * tanX, ry = (v - 0.5) * 2 * tanY;
    pos[o * 3] = SCALE * rx * t; pos[o * 3 + 1] = SCALE * t * (ry * cp + sp); pos[o * 3 + 2] = SCALE * t * (ry * sp - cp);
    uv[o * 2] = u; uv[o * 2 + 1] = v; T[o] = t;
  }
  // Where a wall or the water meets the far surface there is a big depth jump, and moving the camera would open a
  // bright crack along it. So the far surface (sky, trees) is relaxed between them: inverse depth is held at every
  // wall and water edge and pinned to the far plane at the frame edge, and it settles smoothly in between.
  const W1 = NX + 1, N = T.length, F = new Float32Array(N), free = new Uint8Array(N);
  for (let j = 0, o = 0; j <= NY; j++) for (let i = 0; i <= NX; i++, o++) {
    F[o] = 1 / T[o];
    free[o] = i > 0 && i < NX && j > 0 && j < NY && T[o] >= TMAX - 0.01 && !inPoly(i / NX * IW, (1 - j / NY) * IH, REG.floor) ? 1 : 0;
  }
  const card = new Uint8Array(N);
  for (let j = 0, o = 0; j <= NY; j++) for (let i = 0; i <= NX; i++, o++) { const px = i / NX * IW, py = (1 - j / NY) * IH; card[o] = inPoly(px, py, REG.jeep) || inPoly(px, py, REG.lCard) || inPoly(px, py, REG.rCard) ? 1 : 0; }
  for (let it = 0; it < 320; it++) for (let o = 0; o < N; o++) if (free[o]) F[o] = 0.25 * (F[o - 1] + F[o + 1] + F[o - W1] + F[o + W1]);
  for (let o = 0; o < N; o++) if (free[o]) { const t = 1 / F[o], f = t / T[o]; T[o] = t; pos[o * 3] *= f; pos[o * 3 + 1] *= f; pos[o * 3 + 2] *= f; }
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1, lo = Math.min(T[a], T[b], T[c], T[d]), hi = Math.max(T[a], T[b], T[c], T[d]);
    // only the people and the jeep come away from what's behind them; walls stay joined to the water
    if (hi / lo < 1.4 || !(card[a] || card[b] || card[c] || card[d])) idx.push(a, b, d, a, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
  const map = tex('/photos/IMG_6457.jpg'); map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const mask = tex('/depth/IMG_6457_water.png', { srgb: false }); mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
  const uniforms = { map: { value: map }, uMask: { value: mask }, uTime: { value: 0 }, uWater: { value: 1.2 } };
  const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms, transparent: true,
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vP;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map, uMask; uniform float uTime, uWater;
      varying vec2 vUv; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      // expanding rain rings on a grid in world xz
      float rings(vec2 p, float t){
        vec2 g = p*2.2, id = floor(g), f = fract(g)-0.5; float s = 0.0;
        for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){
          vec2 o = vec2(float(i),float(j)), c = o + vec2(h(id+o), h(id+o+7.3)) - 0.5;
          float ph = fract(t*0.7 + h(id+o+3.1)*9.0), r = length(f-c);
          s += (1.0-smoothstep(0.0,0.05,abs(r-ph*0.6))) * (1.0-ph) * (1.0-ph);
        }
        return s;
      }
      void main(){
        vec2 uv = vUv;
        float wet = texture2D(uMask, vUv).r;
        float rr = 0.0, dist = length(vP.xz);
        if (wet > 0.01) {
          vec2 q = vP.xz * vec2(1.3, 0.6);
          float f = 1.0 / max(1.0, dist*0.18);
          vec2 d = vec2(n(q + vec2(uTime*0.45, uTime*0.7)) - 0.5, n(q*1.7 - vec2(uTime*0.6, uTime*0.3)) - 0.5);
          uv += d * 0.009 * uWater * wet * f;
          rr = rings(vP.xz, uTime) * wet * f;
        }
        vec4 c = texture2D(map, uv);
        c.rgb += rr * 0.10;
        // the photo dissolves at its edges so nothing shows a hard cut from behind
        float a = smoothstep(0.0, 0.03, vUv.x) * smoothstep(0.0, 0.03, 1.0 - vUv.x) * smoothstep(0.0, 0.025, vUv.y);
        gl_FragColor = vec4(c.rgb, a);
        #include <colorspace_fragment>
      }`,
  }));
  mesh.frustumCulled = false; mesh.renderOrder = 1;

  const G = new THREE.Group(); G.add(mesh);
  G.update = t => { uniforms.uTime.value = t; };
  return G;
}

/** ground that follows a height function: x0..x1 across, z0..z1 along; uv in meters */
function ribbon(x0, x1, z0, z1, fn, mat, scale = 0.25, stepZ = 0.5) {
  const nz = Math.ceil(Math.abs(z1 - z0) / stepZ), pos = [], uv = [], idx = [];
  for (let i = 0; i <= nz; i++) {
    const z = z0 + (z1 - z0) * i / nz, y = fn(z);
    pos.push(x0, y, z, x1, y, z); uv.push(x0 * scale, z * scale, x1 * scale, z * scale);
    if (i < nz) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  if (g.attributes.normal.getY(0) < 0) { g.setIndex(idx.slice().reverse()); g.computeVertexNormals(); }
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; return m;
}

/* ---------------- house fronts (local: x along the street, y up, facing +z) ---------------- */
const M = {};
function mats() {
  if (M.ready) return M;
  const wall = (name, color, rx = 1.2, ry = 1.0) => pbr(name, { repeat: [rx, ry], color, wet: 0.15, normalScale: 0.8 });
  Object.assign(M, {
    ready: true,
    cream: wall('painted_plaster_wall', 0xffffff), mint: wall('painted_plaster_wall', 0xc4e0cc),
    gray: wall('painted_plaster_wall', 0xd2d4d0, 1.6, 1.3), peach: wall('painted_plaster_wall', 0xf2cdb0, 1.4, 1.1),
    block: wall('painted_plaster_wall', 0xb9bcb8, 1.8, 1.4),
    shutter: pbr('painted_metal_shutter', { repeat: [1.2, 1.4], color: 0x8f9499, wet: 0.3 }),
    roof: pbr('corrugated_iron_02', { repeat: [3, 2], color: 0x87827a }),
    rust: pbr('rusty_metal_02', { repeat: [2, 2], color: 0x8a6a52 }),
    wood: pbr('plywood', { repeat: [1, 2], color: 0x6d4a31 }),
    steel: std(0x20262a, { rough: 0.45, metal: 0.6 }), steelG: std(0x2b4a3c, { rough: 0.5, metal: 0.4 }),
    frame: std(0x3b3a38, { rough: 0.7 }), dark: std(0x07080a, { rough: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x1b2229, roughness: 0.12, metalness: 0.2, envMapIntensity: 1.6 }),
    stain: new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (c) => { const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(10,12,12,.72)'); g.addColorStop(0.7, 'rgba(10,12,12,.28)'); g.addColorStop(1, 'rgba(10,12,12,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); }), transparent: true, depthWrite: false }),
  });
  return M;
}
function grill(w, h, m, n = 7) {
  const g = new THREE.Group();
  for (let i = 0; i <= n; i++) g.add(at(box(0.022, h, 0.022, m), -w / 2 + w * i / n, 0, 0));
  for (const y of [-h / 2, -h / 6, h / 6, h / 2]) g.add(at(box(w, 0.026, 0.026, m), 0, y, 0));
  return g;
}
function front(w, h, wallM, o = {}) {
  const m = mats(), G = new THREE.Group();
  G.add(at(box(w, h, 0.3, wallM), w / 2, h / 2, -0.15));
  // rain stain under the eave
  const st = new THREE.Mesh(new THREE.PlaneGeometry(w, Math.min(1.5, h * 0.3)), m.stain); st.position.set(w / 2, h - Math.min(0.75, h * 0.15), 0.006); G.add(st);
  // eave + roof line
  if (o.eave !== false) { G.add(at(box(w + 0.1, 0.1, 0.5, m.frame), w / 2, h + 0.02, 0.1)); }
  for (const d of o.doors || []) {
    const dh = d.h ?? 2.15, dw = d.w ?? 0.95, b = d.y ?? 0;
    G.add(at(box(dw + 0.14, dh + 0.08, 0.1, m.frame), d.x, b + dh / 2, 0.03));
    if (d.open) {
      const hole = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), std(0x14100c, { rough: 0.9, emissive: 0x3a2412, ei: d.glow ?? 0.5 })); hole.position.set(d.x, b + dh / 2, 0.085); G.add(hole);
    } else G.add(at(box(dw, dh, 0.05, d.mat || m.wood), d.x, b + dh / 2, 0.09));
  }
  for (const a of o.windows || []) {
    const ww = a.w ?? 1.1, wh = a.h ?? 1.1;
    G.add(at(box(ww + 0.12, wh + 0.12, 0.06, m.frame), a.x, a.y, 0.02));
    G.add(at(box(ww, wh, 0.03, m.glass), a.x, a.y, 0.05));
    const gr = grill(ww + 0.06, wh + 0.06, a.m || m.steel, 6); gr.position.set(a.x, a.y, 0.12); G.add(gr);
  }
  for (const s of o.shutters || []) {
    G.add(at(box(s.w, s.h, 0.06, m.shutter), s.x, (s.y ?? 0) + s.h / 2, 0.04));
    G.add(at(box(s.w + 0.2, 0.28, 0.2, m.frame), s.x, (s.y ?? 0) + s.h + 0.12, 0.1));
  }
  for (const a of o.gates || []) {
    const gt = grill(a.w, a.h, a.m || m.steelG, Math.round(a.w * 9)); gt.position.set(a.x, (a.y ?? 0) + a.h / 2, 0.1); G.add(gt);
    G.add(at(box(a.w, a.h, 0.02, a.back || m.rust), a.x, (a.y ?? 0) + a.h / 2, 0.02));
  }
  if (o.awning) {
    const a = o.awning, sheet = box(a.w, 0.02, a.d ?? 1.1, m.roof); sheet.position.set(a.x, a.y, (a.d ?? 1.1) * 0.5); sheet.rotation.x = 0.16; G.add(sheet);
    for (const sx of [-1, 1]) G.add(at(box(0.04, 0.04, (a.d ?? 1.1), m.steel), a.x + sx * (a.w / 2 - 0.05), a.y - 0.05, (a.d ?? 1.1) * 0.5, 0, 0.16));
  }
  if (o.meter) { G.add(at(box(0.2, 0.3, 0.12, std(0x9aa0a4, { rough: 0.4, metal: 0.4 })), o.meter, 1.9, 0.08)); G.add(at(cyl(0.012, 0.012, h - 2.1, m.steel, 6), o.meter, 2.05 + (h - 2.1) / 2, 0.08)); }
  return G;
}
function plant(x, z, y) {
  const g = new THREE.Group(), r = rand(Math.round(x * 91 + z * 17)), lm = std(0x27451f, { rough: 0.55 });
  const pot = cyl(0.17, 0.12, 0.26, std(0x7a4a2e, { rough: 0.8 }), 12); pot.position.y = 0.13; g.add(pot);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), lm); const a = r() * 6.28;
    leaf.scale.set(0.5, 1.7, 0.16); leaf.position.set(Math.cos(a) * 0.13, 0.46 + r() * 0.16, Math.sin(a) * 0.13); leaf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6); leaf.castShadow = true; g.add(leaf);
  }
  g.position.set(x, y, z); return g;
}

/** raised water beads as a normal map, for the clearcoat of the wet car */
function beadNormals() {
  const N = 1024, c = document.createElement('canvas'); c.width = c.height = N;
  const ctx = c.getContext('2d'), im = ctx.createImageData(N, N), d = im.data;
  for (let i = 0; i < d.length; i += 4) { d[i] = 128; d[i + 1] = 128; d[i + 2] = 255; d[i + 3] = 255; }
  const r0 = rand(7);
  for (let n = 0; n < 5200; n++) {
    const x0 = r0() * N, y0 = r0() * N, r = 1.3 + r0() * r0() * 6, ry = r * (1 + r0() * 0.5);
    for (let y = Math.floor(y0 - ry); y <= y0 + ry; y++) for (let x = Math.floor(x0 - r); x <= x0 + r; x++) {
      const u = (x - x0) / r, v = (y - y0) / ry, q = u * u + v * v; if (q >= 1) continue;
      const nz = Math.sqrt(1 - q), o = (((y + N) % N) * N + ((x + N) % N)) * 4;
      d[o] = 128 + u * 118; d[o + 1] = 128 - v * 118; d[o + 2] = 128 + nz * 127;
    }
  }
  ctx.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

/**
 * A parked sedan, nose toward +Z, one lofted skin rather than boxes. Glass, trim, door seams and lamps are painted
 * per pixel from the car-space position, so every edge is clean. Rain runs down it. Returns { group, door, time }.
 * door pivots at its front edge; door.press is a point on the skin (door space) to put a hand on.
 */
export function sedan() {
  const line = pts => { const c = new THREE.CatmullRomCurve3(pts.map(([z, y]) => new THREE.Vector3(z, y, 0)), false, 'catmullrom', 0.5), L = c.getPoints(500); return z => { let i = 1; while (i < L.length - 1 && L[i].x < z) i++; const a = L[i - 1], b = L[i]; return a.y + (b.y - a.y) * THREE.MathUtils.clamp((z - a.x) / ((b.x - a.x) || 1), 0, 1); }; };
  const top = line([[-2.34, 0.9], [-2.26, 0.98], [-2.0, 1.03], [-1.78, 1.06], [-1.45, 1.24], [-1.05, 1.4], [-0.4, 1.455], [0.2, 1.44], [0.62, 1.3], [1.12, 1.03], [1.5, 0.96], [2.0, 0.87], [2.26, 0.78], [2.34, 0.7]]);
  const belt = line([[-2.34, 0.88], [-1.9, 0.99], [-1.0, 0.98], [0, 0.965], [1.0, 0.93], [1.4, 0.9], [2.0, 0.82], [2.34, 0.7]]);
  const M = 40, Y0 = 0.29;
  const ring = z => {
    const az = Math.abs(z), w = 0.89 * (1 - 0.2 * Math.pow(az / 2.34, 3.2)), e = az > 2.2 ? Math.sqrt(Math.max(0, 1 - ((az - 2.2) / 0.14) ** 2)) : 1;
    const b = Math.min(belt(z), top(z) - 0.002), h = top(z) - b;
    const c = new THREE.CatmullRomCurve3([[0, Y0], [0.7 * w, Y0], [0.93 * w, Y0 + 0.03], [0.995 * w, 0.46], [w, 0.66], [0.985 * w, 0.8], [0.955 * w, b - 0.012], [0.905 * w, b + 0.014 * Math.min(1, h * 6)], [0.8 * w, b + h * 0.62], [0.69 * w, b + h * 0.93], [0.36 * w, b + h], [0, b + h * 1.01]].map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'catmullrom', 0.5);
    const out = []; for (let i = 0; i <= M; i++) { const p = c.getPoint(i / M); out.push([p.x * e, 0.62 + (p.y - 0.62) * (0.55 + 0.45 * e)]); }
    return out;
  };
  // skin
  const S_ = 150, pos = [], idx = [], rings = [], zs = [];
  for (let s = 0; s <= S_; s++) {
    const z = -2.34 + 4.68 * s / S_, r = ring(z); zs.push(z); rings.push(r);
    for (let i = 0; i <= 2 * M; i++) { const [x, y] = i <= M ? r[i] : r[2 * M - i]; pos.push(i <= M ? x : -x, y, z); }
  }
  const W = 2 * M + 1;
  for (let s = 0; s < S_; s++) for (let i = 0; i < 2 * M; i++) { const a = s * W + i, b = a + 1, c = a + W, d = c + 1; idx.push(a, d, c, a, b, d); }
  const mk = (p, ix, arc) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('aRest', new THREE.Float32BufferAttribute(p.slice(), 3)); const uv = []; for (let i = 0; i < p.length; i += 3) uv.push(p[i + 2] * 0.9, (arc ? arc[i / 3] : p[i + 1]) * 0.9); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ix); g.computeVertexNormals(); return g; };
  // distance along each ring, for the uv
  const arc = []; for (let s = 0; s <= S_; s++) { let L = 0; for (let i = 0; i <= 2 * M; i++) { if (i) { const o = (s * W + i) * 3, q = o - 3; L += Math.hypot(pos[o] - pos[q], pos[o + 1] - pos[q + 1]); } arc.push(L); } }
  const skin = mk(pos, idx, arc);

  const time = { value: 0 }, beads = beadNormals();
  const material = hole => {
    const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05, clearcoatNormalMap: beads, clearcoatNormalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 1.9, side: THREE.DoubleSide });
    m.customProgramCacheKey = () => 'car' + hole;
    m.onBeforeCompile = sh => {
      sh.uniforms.uT = time;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aRest; varying vec3 vL;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvL = aRest;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', /* glsl */`#include <common>
          varying vec3 vL; uniform float uT; float gG, gD, gB;
          float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
          // water running down: a head with a thin wet trail, in columns along the car
          float runs(vec2 p, float t){
            float gx = p.x*20.0, col = floor(gx), rc = hs(vec2(col, 1.7));
            if (rc > 0.5) return 0.0;
            float w = abs(fract(gx) - 0.5 + (rc - 0.25)*0.6 + sin(p.y*13.0 + rc*9.0)*0.1) / 20.0;
            float head = 1.55 - fract(t*(0.14 + rc*0.5) + rc*17.0)*1.4, dy = p.y - head;
            float a = 1.0 - smoothstep(0.003, 0.006, length(vec2(w, dy*0.34)));
            float b = (1.0 - smoothstep(0.0012, 0.003, w)) * smoothstep(0.0, 0.01, dy) * (1.0 - smoothstep(0.0, 0.34, dy)) * 0.55;
            return max(a, b);
          }`)
        .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
          {
            float z = vL.z, y = vL.y, ax = abs(vL.x);
            ${hole ? 'if (vL.x < -0.3 && z > -0.13 && z < 0.985 && y > 0.335 && y < 1.385) discard;' : ''}
            // side windows, drawn in side view; w > 0 inside
            float w = min(min(y - 1.015, 1.362 - y), min(1.0 + (1.0 - z)*0.43 - y, 1.02 + (z + 1.68)*0.44 - y));
            float side = smoothstep(0.42, 0.5, ax);
            float glass = smoothstep(0.0, 0.004, w) * side;
            float dark = (smoothstep(-0.03, -0.024, w) * (1.0 - smoothstep(0.0, 0.004, w))) * side;
            // door pillar between the two side windows
            dark = max(dark, (1.0 - smoothstep(0.044, 0.05, abs(z + 0.14))) * smoothstep(0.0, 0.004, w) * side); glass *= smoothstep(0.044, 0.05, abs(z + 0.14));
            // windshield and rear window
            float fw = (1.0 - smoothstep(0.55, 0.57, ax + (z - 0.3)*0.1)) * smoothstep(0.3, 0.33, z) * (1.0 - smoothstep(1.03, 1.06, z));
            float rw = (1.0 - smoothstep(0.55, 0.57, ax)) * smoothstep(-1.72, -1.69, z) * (1.0 - smoothstep(-1.03, -1.0, z));
            glass = max(glass, max(fw, rw));
            // door seams, wheel arches, the plastic along the sill, lamps
            float seam = 0.0;
            for (int i = 0; i < 3; i++) { float zs = i == 0 ? 0.98 : (i == 1 ? -0.135 : -1.2); seam = max(seam, (1.0 - smoothstep(0.0028, 0.0052, abs(z - zs))) * step(y, 1.015) * step(0.335, y)); }
            seam = max(seam, (1.0 - smoothstep(0.0028, 0.0052, abs(y - 0.34))) * step(-1.2, z) * step(z, 0.98));
            seam *= smoothstep(0.7, 0.78, ax);
            float arch = max(1.0 - smoothstep(0.365, 0.372, length(vec2(z - 1.42, y - 0.33))), 1.0 - smoothstep(0.365, 0.372, length(vec2(z + 1.42, y - 0.33))));
            float sill = (1.0 - smoothstep(0.36, 0.37, y));
            dark = max(dark, max(arch, max(seam, sill * 0.85)));
            float tail = smoothstep(-2.12, -2.14, z) * step(0.8, y) * step(y, 0.94), nose = smoothstep(2.0, 2.04, z) * step(0.7, y) * step(y, 0.8) * smoothstep(0.26, 0.32, ax);
            vec3 c = mix(vec3(0.4, 0.43, 0.47), vec3(0.012), dark);
            c = mix(c, vec3(0.28, 0.02, 0.025), tail); c = mix(c, vec3(0.62, 0.66, 0.7), nose);
            c = mix(c, vec3(0.1, 0.12, 0.14), glass);
            // beads of water: each one dark at the rim, bright where it catches the sky
            vec3 nb = texture2D(clearcoatNormalMap, vClearcoatNormalMapUv).xyz * 2.0 - 1.0;
            float rim = smoothstep(0.25, 0.95, length(nb.xy));
            c *= 1.0 - rim * 0.4;
            gB = smoothstep(0.35, 0.9, nb.y) * (1.0 - dark);
            if (!gl_FrontFacing) { c = vec3(0.05); dark = 1.0; glass = 0.0; gB = 0.0; }
            diffuseColor.rgb = c; gG = glass; gD = dark;
          }`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(0.34, 0.7, gD), 0.05, gG);')
        .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(mix(0.3, 0.0, gD), 0.8, gG);')
        .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
          { float r = runs(vec2(vL.z, vL.y), uT) * (1.0 - gD); totalEmissiveRadiance += vec3(0.62, 0.68, 0.76) * (r * mix(0.32, 0.6, gG) + gB * 0.22); }`);
    };
    return m;
  };

  const G = new THREE.Group();
  const body = new THREE.Mesh(skin, material(true)); body.castShadow = true; G.add(body);
  const black = std(0x08090a, { rough: 0.8 });
  G.add(at(box(1.3, 0.84, 2.6, black), 0, 0.78, -0.1));      // the dark inside, past the door
  for (const [x, z] of [[-0.75, 1.42], [0.75, 1.42], [-0.75, -1.42], [0.75, -1.42]]) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.095, 12, 36), std(0x0b0b0c, { rough: 0.85 })); t.rotation.y = PI / 2; t.position.set(x, 0.33, z); G.add(t);
    const rim = cyl(0.17, 0.17, 0.2, std(0x6f767c, { rough: 0.35, metal: 0.85 }), 24); rim.rotation.z = PI / 2; rim.position.set(x, 0.33, z); G.add(rim);
  }

  // the door: the same skin between its seams, moved to its hinge
  const HX = -0.875, HZ = 0.98, dp = [], di = [], ROWS = 40;
  const iLow = M + M - (() => { let i = 0; while (ring(0.4)[i][1] < 0.335) i++; return i; })(), iHigh = M + M - (() => { let i = 0; while (ring(0.4)[i][1] < 1.385) i++; return i; })();
  // (left-side ring indices run downward from the roof)
  const cols = iLow - iHigh;
  const yr = t => 0.335 + (1.385 - 0.335) * t;
  for (let r = 0; r <= ROWS; r++) {
    const z = -0.13 + (0.985 + 0.13) * r / ROWS, R = ring(z);
    const at_y = y => { for (let i = 1; i <= M; i++) if (R[i][1] >= y) { const a = R[i - 1], b = R[i], k = (y - a[1]) / ((b[1] - a[1]) || 1); return a[0] + (b[0] - a[0]) * k; } return R[M][0]; };
    for (let c = 0; c <= cols; c++) { const y = yr(c / cols); dp.push(-at_y(y), y, z); }
  }
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols; c++) { const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1; di.push(a, e, b, a, d, e); }
  const dg = mk(dp, di); dg.translate(-HX, 0, -HZ);
  const door = new THREE.Group(); door.position.set(HX, 0, HZ); G.add(door);
  const dm = new THREE.Mesh(dg, material(false)); dm.castShadow = true; door.add(dm);
  // its rear edge has thickness
  { const e = []; for (let c = 0; c <= cols; c++) { const x = dp[c * 3], y = dp[c * 3 + 1], z = dp[c * 3 + 2]; e.push(x, y, z, x + 0.06, y, z); } const ei = []; for (let c = 0; c < cols; c++) { const a = c * 2; ei.push(a, a + 1, a + 3, a, a + 3, a + 2); } const eg = mk(e, ei); eg.translate(-HX, 0, -HZ); door.add(new THREE.Mesh(eg, new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.6, side: THREE.DoubleSide }))); }
  // handle and mirror
  const chrome = new THREE.MeshPhysicalMaterial({ color: 0x8d9398, roughness: 0.2, metalness: 0.9, clearcoat: 1 });
  const hd = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.13, 6, 12), chrome); hd.rotation.x = PI / 2; hd.scale.x = 1.5; hd.position.set(-0.904 - HX, 0.9, 0.0 - HZ); door.add(hd);
  const glassy = new THREE.MeshPhysicalMaterial({ color: 0x343a40, roughness: 0.4, metalness: 0.5, clearcoat: 1 });
  const mir = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 16), glassy); mir.scale.set(1.25, 0.72, 0.5); mir.position.set(-1.0 - HX, 1.05, 0.86 - HZ); door.add(mir);
  door.press = new THREE.Vector3(-0.895 - HX, 0.8, 0.32 - HZ);
  return { group: G, door, time };
}

/** your own forearm, first person. reach() and press() take world positions. Used by car.js and jeep.js too. */
export function povArm({ left = false } = {}) {
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xa98a78, roughness: 0.55, sheen: 0.25, sheenColor: new THREE.Color(0xff9a7a) });
  const G = new THREE.Group(), fore = new THREE.Group(); G.add(fore);
  const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(0.024 + 0.024 * Math.sin(Math.min(1, t * 1.5) * PI / 2) + (t > 0.7 ? (t - 0.7) * 0.03 : 0), t * 0.62)); }
  const lm = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), skin); lm.scale.z = 0.8; lm.castShadow = true; fore.add(lm);
  const hand = new THREE.Mesh(left ? handGeometry().L : handGeometry().R, skin); hand.scale.setScalar(1.08); hand.castShadow = true; G.add(hand);
  G.visible = false;
  const _d = new THREE.Vector3(), _q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  G.reach = (wrist, elbow, roll = 0) => {
    G.position.copy(wrist); _d.copy(elbow).sub(wrist).normalize();
    fore.quaternion.setFromUnitVectors(UP, _d).multiply(_q.setFromAxisAngle(UP, roll)); hand.quaternion.copy(fore.quaternion);
  };
  G.press = (wrist, elbow, handQ) => { G.reach(wrist, elbow); hand.quaternion.copy(handQ); };
  return G;
}

/** rain beaded on glass, as a texture */
export function dropsTexture() {
  return canvasTex(1024, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = 1.4 + Math.random() * Math.random() * 7;
      const g = c.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, 'rgba(235,242,250,.75)'); g.addColorStop(0.65, 'rgba(160,175,190,.35)'); g.addColorStop(1, 'rgba(40,50,60,.5)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x, y, r * 0.85, r, 0, 0, 7); c.fill();
    }
    c.strokeStyle = 'rgba(210,225,240,.28)'; c.lineCap = 'round';
    for (let i = 0; i < 34; i++) { let x = Math.random() * w, y = Math.random() * h * 0.5; c.lineWidth = 1 + Math.random() * 2.2; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 9; k++) { x += (Math.random() - 0.5) * 12; y += 16 + Math.random() * 26; c.lineTo(x, y); } c.stroke(); }
  });
}

function umbrella(color, r = 0.62) {
  const G = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.42, side: THREE.DoubleSide });
  const g = new THREE.ConeGeometry(r, 0.26, 8, 1, true); g.translate(0, 0.13 + 0.82, 0);
  const c = new THREE.Mesh(g, m); c.castShadow = true; G.add(c);
  const st = std(0x17181a, { rough: 0.4, metal: 0.5 });
  G.add(at(cyl(0.008, 0.008, 1.2, st, 8), 0, 0.6, 0));
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2 + PI / 8, rib = cyl(0.004, 0.004, r, st, 5); rib.position.set(Math.cos(a) * r * 0.5, 1.07 - 0.12, Math.sin(a) * r * 0.5); rib.rotation.set(0, -a, PI / 2 - 0.4); G.add(rib); }
  return G;
}

export default {
  grade: { lift: [0.0, 0.016, 0.024], gain: [0.8, 0.97, 1.08], sat: 1.2, grain: 0.06, bloom: 0.2, bloomThreshold: 0.92, exposure: 0.46, vignette: 1.15, black: 0.045, gamma: 1.2, curve: 0.5 },

  async build(engine) {
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0xc4d4e6);
    S.environment = await envFrom(engine.renderer, '/tex/kloofendal_overcast_puresky_1k.hdr');
    S.environmentIntensity = 0.55;
    S.fog = new THREE.Fog(0xb9c6d4, 9, 70);
    S.add(new THREE.HemisphereLight(0xe6eef6, 0x6a6c70, 3.4));

    this.photo = jeepPhoto(); S.add(this.photo);
    const m = mats();

    // ---- ground ----
    const asphalt = pbr('asphalt_02', { repeat: [1, 1], wet: 1, color: 0xb9c3d2, normalScale: 0.7, env: 1.1 });
    const road = ribbon(CURB, WALL_R, -3.4, 24, z => roadY(z) - (z < -1.8 ? 0.02 : 0), asphalt); S.add(road);
    const walk = pbr('concrete_floor_01', { repeat: [1, 1], wet: 0.8, color: 0x9d9d98, normalScale: 0.7 });
    S.add(ribbon(WALL_L - 0.5, CURB, -6.9, 24, z => Math.max(walkY(z), -2.4), walk));
    // curb face
    { const c = ribbon(CURB - 0.001, CURB + 0.02, -3.2, 24, z => roadY(z) + 0.12, std(0x8d8d88, { rough: 0.9 })); S.add(c); }
    // rain landing on the wet road
    this.splash = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec3 vP; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform float uTime; varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec2 g = vP.xz*3.1, id = floor(g), f = fract(g)-0.5; float s = 0.0;
          for (int j=-1;j<=1;j++) for (int i=-1;i<=1;i++){
            vec2 o = vec2(float(i),float(j)), c = o + vec2(h(id+o), h(id+o+7.3)) - 0.5;
            float ph = fract(uTime*0.85 + h(id+o+3.1)*9.0), r = length(f-c);
            s += (1.0-smoothstep(0.0,0.045,abs(r-ph*0.42))) * (1.0-ph) * (1.0-ph) * step(0.45, h(id+o+1.7));
          }
          float a = s * 0.16 * (1.0 - smoothstep(4.0, 16.0, distance(vP, cameraPosition)));
          gl_FragColor = vec4(vec3(0.72,0.8,0.9)*a, a);
        }`,
    });
    { const a = ribbon(CURB, WALL_R, -2.4, 24, z => roadY(z) + 0.01, this.splash), b = ribbon(WALL_L, CURB, -6.0, 24, z => walkY(z) + 0.01, this.splash); a.renderOrder = b.renderOrder = 2; S.add(a, b); }
    // white edge line, from the photo (it runs on out of the bottom of the frame)
    S.add(ribbon(-0.72, -0.6, -2.5, 24, z => roadY(z) + 0.008, std(0xc8ccd0, { rough: 0.65 })));
    // what the photo never saw (behind the people in it): water just under its water, walls just behind its walls
    const fw = new THREE.Mesh(new THREE.PlaneGeometry(18, 40), new THREE.MeshBasicMaterial({ color: 0x2e363e, fog: false })); fw.rotation.x = -PI / 2; fw.position.set(-1, -2.235, -22); S.add(fw);
    const fm = new THREE.MeshBasicMaterial({ color: 0x14181c, side: THREE.DoubleSide, fog: false });
    for (const [x0, off] of [[-4.9, -1.8], [4.4, 1.8]]) {
      const g = new THREE.BufferGeometry(), x = z => x0 + 0.081 * z + off;
      g.setAttribute('position', new THREE.Float32BufferAttribute([x(-5), -2.3, -5, x(-30), -2.3, -30, x(-30), 0.5, -30, x(-5), 0.5, -5], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      const w = new THREE.Mesh(g, fm); w.frustumCulled = false; S.add(w);
    }

    // ---- the lane ----
    const L = (z0, len, h, mat, o) => { const f = front(len, h, mat, o); f.rotation.y = PI / 2; f.position.set(WALL_L, walkY(z0 - len) - 0.2, z0); S.add(f); return f; };
    const R = (z1, len, h, mat, o) => { const f = front(len, h, mat, o); f.rotation.y = -PI / 2; f.position.set(WALL_R, roadY(z1) - 0.2, z1); S.add(f); return f; };
    const b = 0.2;
    L(18.5, 7.5, 5.2, m.cream, { windows: [{ x: 2.0, y: 3.6, w: 1.5 }, { x: 5.2, y: 3.6, w: 1.3 }], gates: [{ x: 3.4, w: 4.2, h: 2.2, y: b }] });
    L(11, 5.6, 5.9, m.peach, { doors: [{ x: 1.3, y: b + 0.3 }], windows: [{ x: 3.6, y: 1.9 }, { x: 1.4, y: 4.2, w: 1.4 }, { x: 3.9, y: 4.2, w: 1.4 }], awning: { x: 2.4, y: 2.9, w: 4.4 }, meter: 4.9 });
    L(5.4, 6.1, 4.4, m.gray, { doors: [{ x: 2.0, y: b + 0.45, open: true, glow: 0.8, mat: m.steelG }], windows: [{ x: 4.4, y: 2.25, w: 1.5 }], meter: 0.7, eave: false });
    L(-0.7, 5.9, 6.6, m.mint, { shutters: [{ x: 2.2, w: 3.3, h: 2.5, y: b + 0.55 }], windows: [{ x: 1.6, y: 5.0, w: 1.4 }, { x: 4.2, y: 5.0, w: 1.4 }], awning: { x: 2.2, y: 3.5, w: 3.8, d: 0.9 } });
    R(-7.4, 6.0, 5.8, m.block, { eave: false, windows: [{ x: 1.6, y: 3.6, w: 1.2, h: 1.0 }, { x: 4.4, y: 3.6, w: 1.2, h: 1.0 }], meter: 5.2, gates: [{ x: 3.1, w: 2.8, h: 2.2, y: 0.5, m: m.steel }] });
    R(-1.4, 5.4, 6.3, m.cream, { doors: [{ x: 1.3, y: b + 0.1, open: true, glow: 0.8 }], windows: [{ x: 3.6, y: 1.8 }, { x: 1.5, y: 4.5, w: 1.3 }, { x: 3.9, y: 4.5, w: 1.3 }], awning: { x: 1.5, y: 2.75, w: 2.6 } });
    R(4, 6.2, 5.0, m.peach, { shutters: [{ x: 3.1, w: 4.6, h: 2.7, y: b }], meter: 5.7 });
    R(10.2, 8.5, 5.6, m.gray, { windows: [{ x: 2.2, y: 3.9, w: 1.5 }, { x: 5.6, y: 3.9, w: 1.5 }], doors: [{ x: 6.8, y: b }], gates: [{ x: 3.0, w: 3.6, h: 2.3, y: b, m: m.steel }] });
    { const f = front(13, 7, m.cream, { windows: [{ x: 3, y: 5, w: 1.6 }, { x: 8, y: 5, w: 1.6 }], shutters: [{ x: 6.5, w: 5, h: 3, y: 0.3 }] }); f.position.set(-6.5, roadY(24.4) - 0.3, 24.4); f.rotation.y = PI; f.position.x = 6.5; S.add(f); }
    // the corner of the last house on the left, where the lane opens: a pier, a downspout, the wet stain at its foot
    { const z = -6.6, y = walkY(-0.7 - 5.9) - 0.2; S.add(at(box(0.34, 7.2, 0.34, pbr('painted_plaster_wall', { repeat: [0.4, 2.4], color: 0x7f9186, wet: 0.2 })), WALL_L + 0.02, y + 3.6, z + 0.12));
      S.add(at(cyl(0.05, 0.05, 6.7, std(0x3a403c, { rough: 0.55 }), 10), WALL_L + 0.26, y + 3.3, z + 0.34)); }
    S.add(plant(-2.95, 7.0, walkY(7)), plant(-2.95, 6.55, walkY(6.55)), plant(-2.95, -0.4, walkY(-0.4)), plant(3.3, 2.9, roadY(2.9) + 0.02));

    // wires over the lane, on the way to the tangle in the photo
    const wireM = new THREE.LineBasicMaterial({ color: 0x15181b });
    const addWire = (a, b, sag = 0.35) => { const pts = []; for (let i = 0; i <= 24; i++) { const k = i / 24; pts.push(new THREE.Vector3().lerpVectors(a, b, k).add(new THREE.Vector3(0, -sag * 4 * k * (1 - k), 0))); } S.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wireM)); };
    const pole = (x, z) => { const y0 = roadY(z); S.add(at(cyl(0.11, 0.15, 9, std(0x55524b, { rough: 0.9 }), 12), x, y0 + 4.5, z)); S.add(at(box(1.6, 0.09, 0.09, m.steel), x, y0 + 8.1, z)); return new THREE.Vector3(x, y0 + 8.1, z); };
    const p1 = pole(WALL_R - 0.35, 12.5), p2 = pole(WALL_R - 0.35, -3.2);
    for (let i = 0; i < 5; i++) { const o = new THREE.Vector3(-0.6 + i * 0.3, -i * 0.12, 0); addWire(p1.clone().add(o), p2.clone().add(o), 0.5 + i * 0.05); addWire(p2.clone().add(o), new THREE.Vector3(-8 + i, 6.5 - i * 0.2, -22), 0.6); }
    for (let i = 0; i < 3; i++) addWire(new THREE.Vector3(WALL_L, 3.3 + i * 0.2, 2 + i), p1.clone().add(new THREE.Vector3(0, -i * 0.1, 0)), 0.3);

    // ---- the car ----
    const car = this.car = sedan();
    car.group.position.set(-0.3, roadY(9.5) + 0.0, 9.5); car.group.rotation.x = Math.atan(0.1); car.group.scale.z = -1; S.add(car.group);
    this.carDoor = car.door; this.carTime = car.time;

    // ---- people ----
    this.people = [];
    const person = (o, x, z, ry, walkway = false) => {
      const p = new Person(o); p.root.position.set(x, (walkway ? walkY(z) : roadY(z)), z); p.root.rotation.y = ry; S.add(p.root); this.people.push(p);
      const sh = blob(0.42, 0.55); sh.position.set(x, p.root.position.y + 0.012, z); S.add(sh); p.shadow = sh; return p;
    };
    const P = this.P = {};
    const nyLogo = canvasTex(128, 112, (c, w, h) => { c.clearRect(0, 0, w, h); c.fillStyle = '#eef1f5'; c.font = 'bold 84px Georgia, serif'; c.textAlign = 'center'; c.fillText('N', w / 2 - 14, 86); c.fillText('Y', w / 2 + 18, 96); });
    // the older man, closest to the water
    P.tatay = person({ real: 'tatay', h: 1.8, build: 0.9 }, -1.42, -1.1, PI - 0.2, true);
    P.tatay.set({ shL: [2, 0, 7], shR: [2, 0, -7], neck: [4, 0, 0] }, true);
    // the man in the cap, on the right by his house, arms folded
    P.kuya = person({ real: 'kuya', h: 1.93, build: 1.18, cap: 0x2b4f8f, capOpts: { logo: nyLogo, size: 1.05 } }, 2.75, 3.15, -0.75);
    { const k = P.kuya, v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
      k.reach('L', () => k.chest.localToWorld(v1.set(-0.11, -0.13, 0.17)), { rate: 30, pole: [1, -0.6, -0.2] });
      k.reach('R', () => k.chest.localToWorld(v2.set(0.12, -0.1, 0.21)), { rate: 30, pole: [-1, -0.6, -0.2] }); }
    // the mom, under her black umbrella, one arm folded across under the other
    P.ate = person({ real: 'nanay', h: 1.75, build: 0.92 }, 1.55, -1.7, PI + 0.32);
    { const a = P.ate, v1 = new THREE.Vector3(); this.ateHand = new THREE.Vector3();
      a.reach('R', () => a.chest.localToWorld(this.ateHand.set(-0.02, -0.05, 0.25)), { rate: 30, pole: [-1, -1, -0.4], wrist: [0, -40, 0] });
      a.reach('L', () => a.chest.localToWorld(v1.set(-0.09, -0.17, 0.19)), { rate: 30, pole: [1, -0.6, -0.2] }); }
    this.ateU = umbrella(0x101114); S.add(this.ateU);
    for (const p of this.people) p.shade(0.74);

    this.rain = new Rain({ count: 12000, size: [14, 9, 18], speed: 9, opacity: 0.55, wind: [0.2, 0.6] }); S.add(this.rain.mesh);
    this.arm = povArm(); S.add(this.arm);
    this.jeep = new THREE.Vector3(-2.8, -1.9, -17);
    const e = z => walkY(z) + 1.46;
    // where she stands to shut the door: beside it, close, leaning in a little
    this.A = [-2.12, walkY(9.55) + 1.3, 9.55]; this.A_YAW = 1.76; this.A_PITCH = -0.5; this.AJAR = 0.42;
    this.PATH = [this.A, [-2.0, e(8.2), 8.2], [-1.86, e(7.0), 7.0], [-1.82, e(5.6), 5.6], [-1.62, e(3.9), 3.9], [-0.92, roadY(2.4) + 1.46, 2.4], [-0.24, roadY(1.25) + 1.46, 1.25]];
    this.camPath = null; this.camK = 0; this.travel = 0; this.steps = 0; this.stride = 0; this.view = null;

    // compile every material during the loading screen, so nothing hitches when this scene first appears
    const r = engine.renderer; r.setRenderTarget(engine.composer.renderTarget1);
    const done = r.compileAsync(S, engine.camera); r.setRenderTarget(null); await done;
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.45; engine.rig.jolt = 0;
    engine.rig.set({ pos: this.A, fov: 44, roll: 0 });
    engine.final.uniforms.uLift.value.set(1, 1, 1);   // we come out of the whiteout of the car door
    this.carDoor.rotation.y = this.AJAR;
    prewarm(engine);
    audio.rain(1.15, 0); audio.murmur(0.3); audio.layer('roof', 0); audio.layer('carEngine', 0); audio.scape('baha');
    engine.composer.render();   // compile everything now, inside the whiteout
  },
  exit() { audio.layer('murmur', 0); audio.scape(null); },

  update(dt, t, raw) {
    const E = this.engine, rig = E.rig, cam = E.camera, P = this.P;
    this.photo.update(t);
    this.rain.update(t, cam);
    this.splash.uniforms.uTime.value = t; this.carTime.value = t;
    for (const p of this.people) {
      p.update(dt, t);
      if (p.shadow) { p.shadow.position.x = p.root.position.x; p.shadow.position.z = p.root.position.z; p.shadow.position.y = p.root.position.y + 0.012; }
    }
    // the road slopes, walkers follow it
    // the umbrella stays upright in Ate's hand
    _v.copy(this.ateHand);
    this.ateU.position.set(_v.x, _v.y - 0.3, _v.z); this.ateU.rotation.set(Math.sin(t * 0.8) * 0.025, 0, -0.04 + Math.sin(t * 0.63) * 0.025);
    // first-person walk: the camera rides a path with a real step in it
    if (this.camPath) {
      this.camPath.getPoint(this.camK, _v);
      this.travel += this._cp ? _v.distanceTo(this._cp) : 0; (this._cp ||= new THREE.Vector3()).copy(_v);
      const ph = this.travel * PI / STEP, a = this.stride;
      rig.pos.set(_v.x + Math.sin(ph * 0.5) * 0.014 * a, _v.y + (0.5 - Math.cos(ph * 2) * 0.5) * 0.03 * a - 0.015 * a, _v.z);
      rig.roll = Math.sin(ph * 0.5) * 0.0045 * a;
      const st = Math.floor(this.travel / STEP);
      if (st !== this.steps) { this.steps = st; audio.noiseHit(0.1, { f: 620 + Math.random() * 280, q: 0.7, vol: 0.09 }); audio.noiseHit(0.05, { f: 2600, q: 1.1, vol: 0.03, delay: 0.03 }); }
    }
    if (this.view) {
      const v = this.view, cp = Math.cos(v.pitch);
      rig.look.set(rig.pos.x + Math.sin(v.yaw) * cp * 8, rig.pos.y + Math.sin(v.pitch) * 8, rig.pos.z - Math.cos(v.yaw) * cp * 8);
    }
  },

  /* ================= from the car door to the first question ================= */
  async play(D, S, beat) {
    const E = this.engine, rig = E.rig, P = this.P, u = E.final.uniforms, lift = new THREE.Vector3(...this.grade.lift);
    if (beat === 'hold') { u.uLift.value.copy(lift); await D.black(false, 0.3); return new Promise(() => {}); }
    await D.black(false, 0.01);

    // ---- out of the white: tight on the door, ajar, her right hand comes up flat against it and shuts it ----
    this.camPath = new THREE.CatmullRomCurve3(this.PATH.map(p => new THREE.Vector3(...p)));
    this.view = { yaw: this.A_YAW, pitch: this.A_PITCH };
    animate(k => u.uLift.value.set(1, 1, 1).lerp(lift, k), 1.0, 'out');
    await D.wait(0.5);
    const arm = this.arm, door = this.carDoor, out = new THREE.Vector3(-1, 0, 0), wrist = new THREE.Vector3(), el = new THREE.Vector3(), dq = new THREE.Quaternion(), hq = new THREE.Quaternion();
    // in door space: palm toward the door, fingers up and a little toward the hinge
    const X = new THREE.Vector3(1, 0, 0), F = new THREE.Vector3(0, 0.93, -0.37).normalize(), Y = F.clone().negate(), Z = X.clone().cross(Y);
    const hand0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    const hold = (rest = 0) => {
      wrist.copy(door.press).addScaledVector(out, 0.055); door.localToWorld(wrist);
      el.set(0.42, -0.72, 0.02).applyQuaternion(E.camera.quaternion).add(E.camera.position);
      if (rest) wrist.lerp(_v.copy(el).add(new THREE.Vector3(-0.02, -0.34, -0.04)), rest);
      hq.copy(hand0);
      arm.press(wrist, el, hq);
    };
    hold(1); arm.visible = true;
    await animate(k => hold(1 - k), 0.4, 'inOut');
    await animate(k => { door.rotation.y = this.AJAR * (1 - k); hold(); }, 0.42, 'in');
    audio.doorThud(); rig.jolt = 0.8;
    setTimeout(() => (rig.jolt = 0), 170);
    await D.wait(0.18);
    await animate(k => hold(k), 0.34, 'inOut');
    arm.visible = false;

    // ---- turn around: the lane, the people, and at the bottom of it the water ----
    P.kuya.look(E.camera, 0.7);
    animate(k => { this.view.yaw = this.A_YAW * (1 - k) - 0.03 * k; this.view.pitch = this.A_PITCH * (1 - k) - 0.1 * k; rig.fov = 44 - 4 * k; }, 2.5, 'inOut');
    await D.wait(0.9);
    this.stride = 1;
    D.stamp('<b>2:57 PM</b>Brgy. Del Monte, Quezon City', 5);
    const walk1 = animate(k => { this.camK = k; }, 10.5, 'sine').then(() => { this.stride = 0; });
    await D.say('', 'Bumaba ka. May mga tao sa labas. Taga-roon sila.', { hold: 4.6 });
    audio.murmur(0.45);
    P.ate.look(this.jeep, 0.8);
    await D.wait(3.8);
    P.kuya.look(this.jeep, 0.8);
    await Promise.all([walk1, D.wait(1.0)]);
    this.view = null; this.camPath = null;
    rig.roll = 0;

    // ---- everyone is looking at the same thing ----
    rig.move({ look: [-1.3, -1.25, -14], fov: 34, dur: 7, e: 'sine' });
    P.tatay.set({ shR: [-68, 0, -10], elR: [-10, 0, 0] });              // he points at the jeep
    P.tatay.look(this.jeep, 0.9);
    await D.wait(0.7);
    P.tatay.talking = true;
    await D.say('Kapitbahay', "Kawawa naman 'yung driver.");
    P.tatay.set({ shR: [2, 0, -7], elR: [-8, 0, 0] });
    await D.say('Kapitbahay', "Hindi niya nailabas 'yung jeep. Hindi niya kasi alam.");
    P.tatay.talking = false;
    await D.wait(0.7);

    // ---- do you say something? ----
    await rig.move({ look: [1.5, -0.55, -1.7], dur: 1.6, fov: 38 });
    await D.say('', 'Kakausapin mo ba sila?', { hold: 2.6 });

    // ---- you go up to her ----
    const from = rig.pos.clone(), to = new THREE.Vector3(0.82, roadY(-0.95) + 1.46, -0.95);
    this.camPath = new THREE.CatmullRomCurve3([from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0.1, 0, 0.1)), to]);
    this.view = { yaw: Math.atan2(1.55 - from.x, -(-1.7 - from.z)), pitch: -0.08 }; this._cp = null; this.stride = 1;
    const walk2 = animate(k => { this.camK = k; this.view.yaw = Math.atan2(1.55 - rig.pos.x, rig.pos.z + 1.7); }, 3.2, 'sine').then(() => { this.stride = 0; });
    await D.wait(1.4);
    P.ate.look(E.camera, 0.9);
    await animate(k => { P.ate.root.rotation.y = PI + 0.32 - 0.62 * k; }, 1.4, 'inOut');
    await walk2;
    this.view = null; this.camPath = null;
    rig.move({ look: [1.5, -0.42, -1.62], dur: 1.2, fov: 38 });
    await D.wait(0.6);
    await D.ask(['Lagi po bang bumabaha rito?', 'Bakit po walang madaanan palabas?'], async i => {
      P.ate.talking = true;
      if (i === 0) {
        P.ate.anim = (t, p) => { p.neck.rotation.y += Math.sin(t * 4.2) * 0.08; };
        await D.say('', 'Madalas daw. Pero ito na raw ang pinakamalala.');
        P.ate.anim = null;
      } else {
        P.ate.look(this.jeep, 0.6);
        await D.say('', 'Mataas daw ang gitna ng village. Lahat ng labasan, pababa.');
        P.ate.look(E.camera, 0.9);
      }
      P.ate.talking = false;
    });
    await D.wait(0.5);
    await D.black(true, 1.2);
  },
};
