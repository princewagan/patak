import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { pbr, canvasTex, std, rand } from '../engine/kit.js';

const SHOPS = ['BAKERY', 'LOTTO OUTLET', 'WATER REFILLING STATION', 'VULCANIZING', 'CARINDERIA', 'BIGASAN', 'LAUNDRY SHOP', 'PRINTING · XEROX', 'MOTOR PARTS', 'PHARMACY', 'TAPSILOGAN', 'HARDWARE', 'PAWNSHOP', 'COMPUTER SHOP', 'SARI-SARI STORE', 'BARBERSHOP'];
const WALLS = ['#b9b1a2', '#9fa79c', '#c7b48f', '#8f9aa3', '#b8a38c', '#a49688', '#c3bfb4', '#87907f'];

/** procedural Manila facade texture: grilles, lit windows, shop sign, shutter */
function facade(seed, floors, { night = 0.5 } = {}) {
  const r = rand(seed), W = 512, H = 256 * floors;
  let lit = [];
  const map = canvasTex(W, H, (c) => {
    c.fillStyle = WALLS[Math.floor(r() * WALLS.length)]; c.fillRect(0, 0, W, H);
    // water stains
    for (let i = 0; i < 40; i++) { const x = r() * W; const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(40,40,30,0.0)'); g.addColorStop(1, `rgba(40,38,30,${0.15 + r() * 0.2})`); c.fillStyle = g; c.fillRect(x, r() * H * 0.5, 4 + r() * 18, H); }
    for (let f = 1; f < floors; f++) {
      const y0 = H - (f + 1) * 256;
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const ww = 120, wh = 120, x = 40 + k * (W - 80) / n + (W - 80) / n / 2 - ww / 2, y = y0 + 70;
        const on = r() < night;
        c.fillStyle = on ? `rgb(${230 + r() * 25},${180 + r() * 40},${110 + r() * 50})` : '#1b2026'; c.fillRect(x, y, ww, wh);
        if (on) lit.push([x, y, ww, wh]);
        c.strokeStyle = '#2a2a2a'; c.lineWidth = 4;
        for (let g = 1; g < 6; g++) { c.beginPath(); c.moveTo(x + g * ww / 6, y); c.lineTo(x + g * ww / 6, y + wh); c.stroke(); }
        for (let g = 1; g < 4; g++) { c.beginPath(); c.moveTo(x, y + g * wh / 4); c.lineTo(x + ww, y + g * wh / 4); c.stroke(); }
        c.strokeRect(x, y, ww, wh);
        // aircon unit sometimes
        if (r() < 0.3) { c.fillStyle = '#d9d6cf'; c.fillRect(x + ww + 8, y + 40, 50, 36); }
      }
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, y0 + 250, W, 6);
    }
    // ground floor: shop sign + rolling shutter / open store
    const y = H - 256;
    const shop = SHOPS[Math.floor(r() * SHOPS.length)];
    const sc = ['#c62f2a', '#1f5aa8', '#e9c43b', '#1d8a4d', '#f0ece2'][Math.floor(r() * 5)];
    c.fillStyle = sc; c.fillRect(0, y + 10, W, 62);
    c.fillStyle = sc === '#e9c43b' || sc === '#f0ece2' ? '#1a1a1a' : '#fff';
    c.font = 'bold 38px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(shop, W / 2, y + 42);
    const open = r() < 0.55;
    if (open) { c.fillStyle = '#b39a6c'; c.fillRect(30, y + 80, W - 60, 176); lit.push([30, y + 80, W - 60, 176]); c.fillStyle = 'rgba(60,40,20,.5)'; for (let i = 0; i < 9; i++) c.fillRect(40 + r() * (W - 100), y + 110 + r() * 120, 20 + r() * 40, 20 + r() * 40); }
    else { c.fillStyle = '#7d8187'; c.fillRect(30, y + 80, W - 60, 176); c.strokeStyle = '#5c6066'; c.lineWidth = 3; for (let i = 0; i < 30; i++) { c.beginPath(); c.moveTo(30, y + 84 + i * 6); c.lineTo(W - 30, y + 84 + i * 6); c.stroke(); } }
  });
  const em = canvasTex(W, H, (c) => { c.fillStyle = '#000'; c.fillRect(0, 0, W, H); for (const [x, y, w, h] of lit) { c.fillStyle = '#ffd59a'; c.fillRect(x, y, w, h); } });
  return new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: 0.32, roughness: 0.9 });
}

/**
 * A strip of street L meters long, built around the road center at x = roadX.
 * Repeats 3 times so it can scroll past forever. side = buildings on 'both' | 'left' | 'right'.
 */
export function makeStreet({ L = 90, ground = -0.8, roadX = -1.8, laneW = 3.6, seed = 7, night = 0.4, poles = true } = {}) {
  const root = new THREE.Group();
  const strip = new THREE.Group();
  const r = rand(seed);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(laneW * 2 + 2, L), pbr('asphalt_02', { repeat: [3, L / 4], wet: 1, env: 1.4 }));
  road.rotation.x = -Math.PI / 2; road.position.set(roadX, ground, -L / 2); road.receiveShadow = true; strip.add(road);
  // lane marking
  const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.12, L), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.4, transparent: true, opacity: 0.6 }));
  dash.rotation.x = -Math.PI / 2; dash.position.set(roadX, ground + 0.005, -L / 2); strip.add(dash);
  const walkM = pbr('concrete_floor_01', { repeat: [1, L / 3], wet: 0.8 });
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, L), walkM); w.position.set(roadX + sx * (laneW + 2.2), ground + 0.09, -L / 2); w.receiveShadow = true; strip.add(w);
  }
  // buildings
  for (const sx of [-1, 1]) {
    let z = 0;
    while (z > -L) {
      const w = 5 + r() * 5, floors = 2 + Math.floor(r() * 3), h = floors * 2.9;
      const m = facade(Math.floor(r() * 1e6), floors, { night });
      const mats = [std(0x8c8a84), std(0x8c8a84), std(0x55524c), std(0x55524c), std(0x8c8a84), std(0x8c8a84)];
      mats[sx > 0 ? 1 : 0] = m; // face toward the road
      const b = new THREE.Mesh(new THREE.BoxGeometry(6, h, w), mats);
      b.position.set(roadX + sx * (laneW + 3.4 + 3 + r() * 0.8), ground + h / 2, z - w / 2);
      strip.add(b);
      // tin awning over the shop
      if (r() < 0.6) {
        const aw = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.04, w * 0.9), pbr('corrugated_iron_02', { repeat: [1, 2], color: 0x9aa0a6, metal: 0.6, rough: 0.6 }));
        aw.position.set(b.position.x - sx * 3.7, ground + 2.7, z - w / 2); aw.rotation.z = sx * 0.18; strip.add(aw);
      }
      z -= w + 0.05;
    }
  }
  // utility poles + tangled wires
  if (poles) {
    const poleM = std(0x8d8a83, { rough: 0.9 });
    const wires = [];
    const poleZ = []; for (let z = -6; z > -L; z -= 22) poleZ.push(z);
    for (const z of poleZ) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 9, 10), poleM); p.position.set(roadX + laneW + 1.6, ground + 4.5, z); p.castShadow = true; strip.add(p);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), poleM); arm.position.set(roadX + laneW + 1.6, ground + 8.2, z); strip.add(arm);
      // transformer drum sometimes
      if (r() < 0.5) { const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.8, 12), std(0x6f7377, { metal: 0.4, rough: 0.5 })); tr.position.set(roadX + laneW + 1.95, ground + 7.2, z); strip.add(tr); }
      // sodium street lamp
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa040).multiplyScalar(3) }));
      lamp.position.set(roadX + laneW + 0.4, ground + 7.4, z); strip.add(lamp);
    }
    for (let i = 0; i < poleZ.length; i++) {
      const z0 = poleZ[i], z1 = poleZ[i + 1] ?? poleZ[0] - (L + poleZ[poleZ.length - 1] - poleZ[0]) + 0;
      const zz1 = poleZ[i + 1] ?? (poleZ[i] - 22);
      for (let k = 0; k < 9; k++) {
        const y0 = ground + 6.2 + r() * 2, x0 = roadX + laneW + 1.6 + (r() - 0.5) * 1.6, sag = 0.4 + r() * 1.3;
        const pts = []; for (let t = 0; t <= 16; t++) { const u = t / 16; pts.push(new THREE.Vector3(x0 + (r() - 0.5) * 0.02, y0 - Math.sin(u * Math.PI) * sag, z0 + (zz1 - z0) * u)); }
        wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.012 + r() * 0.01, 4));
      }
      // wires crossing the street
      if (r() < 0.6) for (let k = 0; k < 3; k++) {
        const pts = []; const y0 = ground + 6.5 + r() * 1.5; for (let t = 0; t <= 12; t++) { const u = t / 12; pts.push(new THREE.Vector3(roadX + laneW + 1.6 - u * (laneW * 2 + 3.2), y0 - Math.sin(u * Math.PI) * 0.8, z0 - u * 1.5)); }
        wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.012, 4));
      }
      void z1;
    }
    const wm = new THREE.Mesh(mergeGeometries(wires), std(0x111111, { rough: 0.6 }));
    strip.add(wm);
  }
  for (let i = -1; i <= 1; i++) { const c = i === 0 ? strip : strip.clone(); c.position.z = -i * L; root.add(c); }
  root.userData.L = L;
  return root;
}

/* ---------------- traffic: real cars driving through the rain with their lights on ----------------
   One sedan model (CC BY 4.0, TopoSphere via Sloyd; public/cars/CREDITS.md), loaded once, shared by every car.
   Its nose is at +z. Each car gets its own paint, headlamps with a beam cutting through the rain, a pool of light and
   wet-road streaks ahead of it, and taillights behind. Lamps ignore the fog, so far cars read as lights before shapes. */
const CAR_LEN = 4.4;
const sedan = new GLTFLoader().loadAsync('/cars/sedan.glb').then(g => {
  const m = g.scene, b = new THREE.Box3().setFromObject(m), sz = b.getSize(new THREE.Vector3());
  const k = CAR_LEN / sz.z;
  m.scale.setScalar(k); m.position.set(-(b.min.x + b.max.x) / 2 * k, -b.min.y * k, -(b.min.z + b.max.z) / 2 * k);
  const out = new THREE.Group(); out.add(m);
  out.userData.size = sz.multiplyScalar(k);
  m.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  return out;
}).catch(e => { console.warn('car model failed, keeping box cars', e); return null; });

const PAINTS = [0xe9e6df, 0xa3a8ad, 0x1b1e22, 0x22344d, 0x8a1f1a, 0xcfc8b6, 0x4a4f55];
const paintCache = new Map();
/** the model's own texture, with only the paint (its saturated red) recoloured; glass, chrome and tyres stay */
function paintOf(base, hex) {
  if (paintCache.has(hex)) return paintCache.get(hex);
  const m = base.clone();
  m.roughness = 0.32; m.metalness = 0.25; m.envMapIntensity = 1.2;
  const tint = new THREE.Color(hex);
  m.onBeforeCompile = sh => {
    sh.uniforms.uTint = { value: tint };
    sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec3 c = diffuseColor.rgb; float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
        float l = dot(c, vec3(.3, .59, .11));
        diffuseColor.rgb = mix(c, uTint * (.38 + l * 1.5), smoothstep(.1, .3, sat)); }`);
  };
  m.customProgramCacheKey = () => 'paint' + hex;
  paintCache.set(hex, m); return m;
}

const glowTex = canvasTex(64, 64, (c, w, h) => {
  const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,.55)'); g.addColorStop(0.5, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
}, { srgb: false });

/** light that fades along a shape (uv.y = 1 at the lamp) and toward its sides; additive, with its own fog falloff */
function lightMat(color, k, { side = 2.0, fres = 0 } = {}) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { c: { value: new THREE.Color(color) }, k: { value: k } },
    vertexShader: `varying vec2 vUv; varying float vF, vD;
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.); vD = -mv.z;
        vec3 n = normalize(normalMatrix * normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 c; uniform float k; varying vec2 vUv; varying float vF, vD;
      void main(){
        // every pow() gets a clamped base: on Metal pow(-1e-8, y) is NaN, and the bloom spreads one NaN over the whole screen
        float along = pow(clamp(vUv.y, 0., 1.), 2.2), across = 1. - pow(clamp(abs(vUv.x * 2. - 1.), 0., 1.), ${side.toFixed(1)});
        float f = max(vD, 0.) * .03;
        float a = along * ${fres ? 'pow(clamp(vF, 0., 1.), 1.6)' : 'across'} * k * exp(-f * f);
        gl_FragColor = vec4(c * a, 1.); }`,
  });
}

// shared lamp geometry and materials
const HEAD = 0xfff1d6, TAIL = 0xff2a1a;
const headCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(HEAD).multiplyScalar(6), fog: false });
const tailCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(TAIL).multiplyScalar(3.2), fog: false });
const headGlow = new THREE.SpriteMaterial({ map: glowTex, color: HEAD, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.85 });
const tailGlow = new THREE.SpriteMaterial({ map: glowTex, color: TAIL, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.6 });
const beamGeo = (() => { const g = new THREE.ConeGeometry(2.4, 13, 24, 1, true); g.rotateX(-Math.PI / 2); g.translate(0, 0, 6.5); g.rotateX(0.075); return g; })();
const beamM = lightMat(HEAD, 0.075, { fres: 1 });
const poolGeo = (() => { const g = new THREE.PlaneGeometry(3.6, 12); g.rotateX(-Math.PI / 2); g.translate(0, 0.02, 6); return g; })();
const poolM = lightMat(HEAD, 0.24, { side: 1.6 });
const streakGeo = (() => { const g = new THREE.PlaneGeometry(0.32, 7); g.rotateX(-Math.PI / 2); g.translate(0, 0.025, 3.5); return g; })();
const streakM = lightMat(HEAD, 0.5, { side: 2 });
const tailStreakM = lightMat(TAIL, 0.32, { side: 2 });

function lamps(len) {
  const g = new THREE.Group(), front = len / 2, back = -len / 2;
  for (const sx of [-0.62, 0.62]) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), headCore); h.scale.z = 0.35; h.position.set(sx, 0.66, front + 0.02); g.add(h);
    const hg = new THREE.Sprite(headGlow); hg.scale.setScalar(1.5); hg.position.set(sx, 0.66, front + 0.12); g.add(hg);
    const st = new THREE.Mesh(streakGeo, streakM); st.position.set(sx, 0, front); g.add(st);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.03), tailCore); t.position.set(sx * 1.05, 0.78, back - 0.01); g.add(t);
    const tg = new THREE.Sprite(tailGlow); tg.scale.setScalar(0.8); tg.position.set(sx * 1.05, 0.78, back - 0.1); g.add(tg);
    const ts = new THREE.Mesh(streakGeo, tailStreakM); ts.scale.set(1, 1, 0.55); ts.rotation.y = Math.PI; ts.position.set(sx * 1.05, 0, back); g.add(ts);
  }
  const beam = new THREE.Mesh(beamGeo, beamM); beam.position.set(0, 0.66, front); g.add(beam);
  const pool = new THREE.Mesh(poolGeo, poolM); pool.position.z = front; g.add(pool);
  g.traverse(o => { o.renderOrder = 2; });
  return g;
}

/** cars that stream past in a lane at x. dir 1: they drive toward +z (oncoming for a camera looking down -z). */
export class Traffic {
  constructor({ x = -3.6, y = -0.2, count = 6, L = 120, dir = 1 } = {}) {
    this.group = new THREE.Group(); this.L = L; this.dir = dir; this.cars = [];
    const boxM = std(0x24282d, { rough: 0.35, metal: 0.5 });
    for (let i = 0; i < count; i++) {
      const g = new THREE.Group();
      // until the model arrives (or if it fails), a dark box stands in, lit the same way
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, 4), boxM); body.position.y = 0.6; g.add(body); g.userData.body = body;
      g.add(lamps(CAR_LEN));
      g.rotation.y = dir > 0 ? 0 : Math.PI;   // the nose faces the way it drives
      g.position.set(x + (Math.random() - 0.5) * 0.3, y, -i * L / count - Math.random() * 6);
      g.userData.speed = 9 + Math.random() * 5;
      g.userData.paint = PAINTS[(i * 3 + Math.floor(Math.random() * 3)) % PAINTS.length];
      this.group.add(g); this.cars.push(g);
    }
    sedan.then(model => {
      if (!model) return;
      for (const g of this.cars) {
        const car = model.clone(true);
        car.traverse(o => { if (o.isMesh) o.material = paintOf(o.material, g.userData.paint); });
        g.remove(g.userData.body); g.add(car);
      }
    });
  }
  update(dt, worldSpeed) {
    for (const c of this.cars) {
      c.position.z += (c.userData.speed * this.dir + worldSpeed) * dt;
      if (c.position.z > 30) c.position.z -= this.L;
      if (c.position.z < -this.L + 30) c.position.z += this.L;
    }
  }
}
