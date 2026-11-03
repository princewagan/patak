import * as THREE from 'three';

/*
  His right hand round the phone, for the jeep close-up. The shape is modelled once by tools/bake-hand.mjs
  (real bone lengths, knuckles, nails in their folds, contact shade) and loaded from public/hand/phonehand.bin.
  Here it gets its skin: pores, the criss-cross of the skin, wrinkles over each joint, creases, and a warm edge
  where the light dies. Same space as the phone: origin at its middle, +Y up, +Z out of the screen.
*/

const NOISE = /* glsl */`
  float hHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float hNoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hHash(i), hHash(i + vec3(1, 0, 0)), f.x), mix(hHash(i + vec3(0, 1, 0)), hHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hHash(i + vec3(0, 0, 1)), hHash(i + vec3(1, 0, 1)), f.x), mix(hHash(i + vec3(0, 1, 1)), hHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }`;

/** the thumb swings about its base (pivot.xyz, angle in pivot.w, lift along the screen normal); each vertex takes its weight of it */
const SWING = {
  head: `attribute float aThumb; uniform vec4 uSwing; uniform float uLift;
    vec3 swing(vec3 p, float w) { float a = uSwing.w * w, c = cos(a), s = sin(a); vec2 r = p.xy - uSwing.xy; return vec3(uSwing.xy + vec2(c * r.x - s * r.y, s * r.x + c * r.y), p.z + uLift * w); }`,
  normal: `{ float a = uSwing.w * aThumb, c = cos(a), s = sin(a); objectNormal.xy = vec2(c * objectNormal.x - s * objectNormal.y, s * objectNormal.x + c * objectNormal.y); }`,
  pos: `transformed = swing(transformed, aThumb);`,
};
function withSwing(m, U, extra = s => s) {
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        ${SWING.head}`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${SWING.normal}`);
    extra(s);
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        ${SWING.pos}`);
  };
  return m;
}

function skinMaterial(U) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.5, metalness: 0,
    specularIntensity: 0.55, sheen: 0.35, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x8a5a48),
  });
  withSwing(m, U, s => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aSkin; varying vec4 vSkin; varying vec3 vObj;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vSkin = aSkin * vec4(0.04, 1.0, 0.04, 1.0); vObj = position;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vSkin; varying vec3 vObj;
        ${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // relief in metres: pores, the fine criss-cross of skin, and the wrinkles over each joint
        float cr = vSkin.x, str = vSkin.y, lat = vSkin.z, dors = vSkin.w;
        vec3 P = vObj * 2600.0;
        float px = length(fwidth(P));
        float fine = 1.0 - smoothstep(0.35, 1.0, px);
        float pore = smoothstep(0.66, 0.86, hNoise(P)) * fine;
        float grain = (hNoise(vec3(dot(vObj, vec3(0.8, 0.5, 0.2)) * 5200.0, dot(vObj, vec3(-0.3, 0.6, 0.7)) * 900.0, vObj.z * 900.0))
                     + hNoise(vec3(dot(vObj, vec3(-0.6, 0.7, 0.3)) * 5200.0, dot(vObj, vec3(0.5, 0.2, 0.8)) * 900.0, vObj.x * 900.0)) - 1.0);
        float ring = length(vec2(cr, lat * 0.22));
        float wr = ring / 0.0012 + (hNoise(vObj * 700.0) - 0.5) * 0.55;
        float wFade = 1.0 - smoothstep(0.35, 0.75, fwidth(wr));
        float valley = exp(-pow((fract(wr) - 0.5) * 2.0, 2.0) * 9.0);
        float knuck = str * (1.0 - smoothstep(0.0012, 0.0048, ring)) * smoothstep(0.05, 0.45, dors) * (1.0 - smoothstep(0.004, 0.0075, abs(lat))) * wFade;
        float crease = str * exp(-pow(cr / 0.0006, 2.0)) * smoothstep(0.1, 0.5, -dors) + str * 0.6 * exp(-pow((cr - 0.0017) / 0.0005, 2.0)) * smoothstep(0.1, 0.5, -dors);
        float hgt = -pore * 0.000008 + grain * 0.000008 * fine - valley * knuck * 0.00011 - crease * 0.0003;
        diffuseColor.rgb *= 1.0 - valley * knuck * 0.14 - crease * 0.25 - pore * 0.012;
        diffuseColor.rgb *= 0.97 + 0.06 * hNoise(vObj * 520.0);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + pore * 0.18 + valley * knuck * 0.12 - smoothstep(0.3, 0.9, hNoise(vObj * 300.0)) * 0.1, 0.25, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          float hx = dFdx(hgt), hy = dFdy(hgt);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx);
          float det = dot(sx, r1);
          normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2));
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        { float l = dot(reflectedLight.directDiffuse, vec3(0.3, 0.6, 0.1));
          float edge = smoothstep(0.0, 0.04, l) * (1.0 - smoothstep(0.04, 0.45, l));
          reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.5, 0.13, 0.05) * edge * 0.6;
          reflectedLight.indirectDiffuse *= vec3(1.04, 0.97, 0.94); }`);
  });
  m.customProgramCacheKey = () => 'patak-phonehand-skin';
  return m;
}

function nailMaterial(U) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.35, specularIntensity: 0.6, side: THREE.DoubleSide });
  m.customProgramCacheKey = () => 'patak-phonehand-nail';
  return withSwing(m, U);
}

let file = null;
const load = () => file ??= fetch('/hand/phonehand.bin').then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(decode);

function decode(buf) {
  const hl = new DataView(buf).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hl))), base = 4 + hl;
  const meshes = head.meshes.map(m => {
    const q = new Uint16Array(buf, base + m.pos, m.n * 3), pos = new Float32Array(m.n * 3);
    for (let i = 0; i < pos.length; i++) { const a = i % 3; pos[i] = m.lo[a] + q[i] / 65535 * (m.hi[a] - m.lo[a]); }
    const c8 = new Uint8Array(buf, base + m.col, m.n * 3), col = new Float32Array(m.n * 3), c = new THREE.Color();
    for (let i = 0; i < m.n; i++) { c.setRGB(c8[i * 3] / 255, c8[i * 3 + 1] / 255, c8[i * 3 + 2] / 255, THREE.SRGBColorSpace); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aThumb', new THREE.BufferAttribute(new Uint8Array(buf, base + m.tw, m.n), 1, true));
    if (m.sk != null) g.setAttribute('aSkin', new THREE.BufferAttribute(new Int16Array(buf, base + m.sk, m.n * 4), 4, true));
    const Q = new Uint32Array(buf, base + m.quads, m.nq * 4), I = new Uint32Array(m.nq * 6);
    for (let i = 0, o = 0; i < Q.length; i += 4) { I[o++] = Q[i]; I[o++] = Q[i + 1]; I[o++] = Q[i + 2]; I[o++] = Q[i]; I[o++] = Q[i + 2]; I[o++] = Q[i + 3]; }
    g.setIndex(new THREE.BufferAttribute(I, 1));
    g.computeVertexNormals();
    return { kind: m.kind, g };
  });
  return { O: head.O, meshes };
}

/**
 * The hand, in the phone's space. thumb(angle, lift) swings the thumb across the glass for the swipe:
 * angle in radians about the screen's normal, lift in metres off the glass.
 * The meshes arrive a moment after this returns; `ready` settles when they are in.
 */
export function phoneHand() {
  const hand = new THREE.Group(), U = { uSwing: { value: new THREE.Vector4() }, uLift: { value: 0 } };
  const skin = skinMaterial(U), nail = nailMaterial(U);
  const ready = load().then(({ O, meshes }) => {
    U.uSwing.value.set(O[0], O[1], O[2], 0);
    for (const m of meshes) {
      const mesh = new THREE.Mesh(m.g, m.kind === 'nail' ? nail : skin);
      mesh.receiveShadow = true; hand.add(mesh);
    }
  }).catch(e => console.warn('phone hand did not load:', e));
  const thumb = (angle, lift = 0) => { U.uSwing.value.w = angle; U.uLift.value = lift; };
  return { hand, thumb, ready };
}
