import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const loader = new THREE.TextureLoader();
const cache = new Map();
let pending = 0, total = 0;
export const progress = { onChange: null, get value() { return total ? 1 - pending / total : 1; } };
function track(p) { pending++; total++; progress.onChange?.(progress.value); return p.finally(() => { pending--; progress.onChange?.(progress.value); }); }

export function tex(url, { repeat = [1, 1], srgb = true } = {}) {
  const key = url + repeat.join(',') + srgb;
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(url);
  track(new Promise(r => { const img = new Image(); img.onload = img.onerror = r; img.src = url; }));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

/** PBR material from a Poly Haven set in /tex. opts: repeat, color, rough (mult), metal, wet (0..1), normalScale */
export function pbr(name, o = {}) {
  const rep = o.repeat || [1, 1];
  const m = new THREE.MeshStandardMaterial({
    map: o.noDiff ? null : tex(`/tex/${name}_diff.jpg`, { repeat: rep }),
    normalMap: tex(`/tex/${name}_nor.jpg`, { repeat: rep, srgb: false }),
    roughnessMap: tex(`/tex/${name}_rough.jpg`, { repeat: rep, srgb: false }),
    color: o.color ?? 0xffffff,
    roughness: o.rough ?? 1,
    metalness: o.metal ?? 0,
    envMapIntensity: o.env ?? 1,
  });
  m.normalScale.set(o.normalScale ?? 1, o.normalScale ?? 1);
  if (o.wet) wetify(m, o.wet);
  return m;
}

/** darken + lower roughness to read as wet (puddles via noise) */
export function wetify(m, amount = 1) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uWet = { value: amount };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uWet;\nfloat wn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); float a=fract(sin(dot(i,vec2(12.9,78.2)))*43758.5), b=fract(sin(dot(i+vec2(1,0),vec2(12.9,78.2)))*43758.5), c=fract(sin(dot(i+vec2(0,1),vec2(12.9,78.2)))*43758.5), d=fract(sin(dot(i+vec2(1,1),vec2(12.9,78.2)))*43758.5); return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #ifdef USE_ROUGHNESSMAP
          float pud = smoothstep(0.52, 0.62, wn(vRoughnessMapUv*3.0) * 0.7 + wn(vRoughnessMapUv*11.0)*0.3);
          roughnessFactor = mix(roughnessFactor, mix(0.32, 0.04, pud), uWet);
        #endif`)
      .replace('#include <map_fragment>', `#include <map_fragment>\n diffuseColor.rgb *= mix(1.0, 0.55, uWet);`);
  };
  m.customProgramCacheKey = () => 'wet' + amount;
  return m;
}

export function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: o.rough ?? 0.8, metalness: o.metal ?? 0, emissive: o.emissive ?? 0, emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide, transparent: !!o.opacity, opacity: o.opacity ?? 1, envMapIntensity: o.env ?? 1 }); }
export function glow(color, i = 2) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(i), toneMapped: true }); }

export async function hdr(url) {
  return track(new RGBELoader().loadAsync(url).then(t => { t.mapping = THREE.EquirectangularReflectionMapping; return t; }));
}
let pmremCache = new Map();
export async function envFrom(renderer, url) {
  if (pmremCache.has(url)) return pmremCache.get(url);
  const t = await hdr(url);
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(t).texture;
  t.dispose(); pm.dispose();
  pmremCache.set(url, env);
  return env;
}

export function box(w, h, d, mat, r = 0) {
  const g = r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; return m;
}
export function cyl(rt, rb, h, mat, seg = 16) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.castShadow = m.receiveShadow = true; return m; }
export function plane(w, h, mat) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.receiveShadow = true; return m; }
export function at(obj, x, y, z, ry = 0, rx = 0, rz = 0) { obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); return obj; }

/** text/sign texture drawn on a canvas. draw(ctx, w, h) */
export function canvasTex(w, h, draw, { srgb = true } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export function sign(text, { w = 1024, h = 256, bg = '#f4efe2', fg = '#111', font = 'bold 120px "Inter", sans-serif', pad = 0, rough = 0.6, emissive = 0, align = 'center', lines } = {}) {
  const t = canvasTex(w, h, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = fg; c.font = font; c.textAlign = align; c.textBaseline = 'middle';
    const ls = lines || [text];
    ls.forEach((l, i) => c.fillText(l, align === 'center' ? w / 2 : pad, h / (ls.length + 1) * (i + 1)));
    // grime
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(60,50,30,${Math.random() * 0.05})`; c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 8, 2 + Math.random() * 8); }
  });
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: rough, emissive: emissive ? 0xffffff : 0, emissiveMap: emissive ? t : null, emissiveIntensity: emissive });
  return m;
}

/** soft blob shadow / contact darkening */
export function blob(r = 0.4, op = 0.5) {
  const t = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, `rgba(0,0,0,${op})`); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; return m;
}

export function rand(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** visible light beam in hazy/rainy air: an additive cone pointing down -Y from its origin (rotate it to aim) */
export function beam(color = 0xffffff, { radius = 1, length = 3, intensity = 0.25, top = 0.05 } = {}) {
  const g = new THREE.CylinderGeometry(top, radius, length, 32, 8, true);
  g.translate(0, -length / 2, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uLen: { value: length }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vY = -position.y; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI, uLen, uTime; varying vec3 vN; varying vec3 vV; varying float vY; varying vec3 vW;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9,78.2,37.7)))*43758.5); }
      void main(){
        float along = clamp(vY / uLen, 0.0, 1.0);
        float edge = pow(abs(dot(normalize(vN), vV)), 1.6);
        float fall = pow(1.0 - along, 1.7);
        float dust = 0.85 + 0.15 * sin(vW.y * 9.0 + uTime * 0.7 + vW.x * 4.0);
        float a = uI * edge * fall * dust;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = 8; mesh.frustumCulled = false;
  mesh.userData.tick = t => (m.uniforms.uTime.value = t);
  return mesh;
}

/** soft additive halo for practical lights (bulbs, headlights, lamps) */
export function halo(color = 0xffffff, size = 0.6, intensity = 1) {
  const t = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.15, 'rgba(255,255,255,.45)'); g.addColorStop(0.45, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); }, { srgb: false });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, color: new THREE.Color(color).multiplyScalar(intensity), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size); s.renderOrder = 9; return s;
}
