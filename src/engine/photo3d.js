import * as THREE from 'three';
import { tex } from './kit.js';

/**
 * A real photo turned into geometry using its depth map (public/depth/<name>.png).
 * The photo's own camera sits at the origin looking down -Z. Move the scene camera
 * a little away from the origin and you get true parallax.
 *
 * opts: name, aspect (w/h), hfov (deg, across the long side), near, far,
 *       water: { y, strength } makes ground pixels below y ripple like floodwater
 */
export function photo3d({ name, aspect, hfov = 68, near = 1.6, far = 70, seg = 256, water = null, cut = 0.09, extend = 1.04 }) {
  const portrait = aspect < 1;
  const long = Math.tan(THREE.MathUtils.degToRad(hfov) / 2);
  const tanX = portrait ? long * aspect : long;
  const tanY = portrait ? long : long / aspect;
  const geo = new THREE.PlaneGeometry(1, 1, portrait ? Math.round(seg * aspect) : seg, portrait ? seg : Math.round(seg / aspect));
  const uniforms = {
    map: { value: tex(`/photos/${name}.jpg`) },
    depth: { value: tex(`/depth/${name}.png`, { srgb: false }) },
    tan: { value: new THREE.Vector2(tanX, tanY) },
    invNear: { value: 1 / near }, invFar: { value: 1 / far },
    uTime: { value: 0 }, uWaterY: { value: water ? water.y : -999 }, uWater: { value: water ? (water.strength ?? 1) : 0 },
    uCut: { value: cut }, uBright: { value: 1 }, uOpacity: { value: 1 }, uDesat: { value: 0 },
  };
  uniforms.map.value.wrapS = uniforms.map.value.wrapT = THREE.ClampToEdgeWrapping;
  uniforms.depth.value.wrapS = uniforms.depth.value.wrapT = THREE.ClampToEdgeWrapping;
  uniforms.depth.value.minFilter = THREE.LinearFilter;
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true,
    vertexShader: /* glsl */`
      uniform sampler2D depth; uniform vec2 tan; uniform float invNear, invFar;
      varying vec2 vUv; varying float vZ; varying vec3 vW;
      float dz(vec2 uv){ float d = texture2D(depth, uv).r; return 1.0 / (d * (invNear - invFar) + invFar); }
      void main(){
        vUv = uv;
        float z = dz(uv);
        vec3 p = vec3((uv.x - 0.5) * 2.0 * tan.x, (uv.y - 0.5) * 2.0 * tan.y, -1.0) * z;
        vZ = z; vW = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map; uniform float uTime, uWaterY, uWater, uCut, uBright, uOpacity, uDesat;
      varying vec2 vUv; varying float vZ; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y); }
      void main(){
        // hide stretched triangles at depth discontinuities
        float st = fwidth(vZ) / vZ;
        if (st > uCut) discard;
        vec2 uv = vUv;
        float wet = 0.0;
        if (uWater > 0.0 && vW.y < uWaterY) {
          wet = (1.0 - smoothstep(uWaterY - 0.25, uWaterY, vW.y));
          vec2 q = vW.xz * vec2(1.6, 0.7);
          vec2 d = vec2(n(q + vec2(uTime*0.6, uTime*0.9)) - 0.5, n(q*1.7 - vec2(uTime*0.8, uTime*0.4)) - 0.5);
          uv += d * 0.010 * uWater * wet / max(1.0, vZ*0.15);
        }
        vec4 c = texture2D(map, uv);
        if (wet > 0.0) {
          float s = n(vW.xz*vec2(3.0,1.2) + vec2(0.0, uTime*1.4));
          c.rgb += pow(s, 6.0) * 0.18 * wet * uWater;
        }
        float l = dot(c.rgb, vec3(0.299,0.587,0.114));
        c.rgb = mix(c.rgb, vec3(l), uDesat) * uBright;
        gl_FragColor = vec4(c.rgb, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;

  // backdrop: same photo far away, behind every gap the cut opens
  const bz = far * 0.92;
  const bg = new THREE.PlaneGeometry(2 * tanX * bz * extend, 2 * tanY * bz * Math.min(extend, 1.3));
  { const uv = bg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * extend + 0.5, (uv.getY(i) - 0.5) * Math.min(extend, 1.3) + 0.5); }
  const bmap = uniforms.map.value.clone(); bmap.wrapS = bmap.wrapT = THREE.MirroredRepeatWrapping; bmap.needsUpdate = true;
  const back = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ map: bmap, transparent: true, depthWrite: false }));
  back.position.z = -bz;
  back.material.onBeforeCompile = s => { s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', `
    vec4 sampledDiffuseColor = vec4(0.0);
    for (int i=-3;i<=3;i++) for(int j=-3;j<=3;j++) sampledDiffuseColor += texture2D(map, vMapUv + vec2(float(i),float(j))*0.011);
    diffuseColor *= sampledDiffuseColor / 49.0;`); };
  back.renderOrder = -1;

  const group = new THREE.Group();
  group.add(back, mesh);
  group.userData.uniforms = uniforms;
  group.update = t => { uniforms.uTime.value = t; };
  group.set = o => { for (const k in o) if (uniforms[k]) uniforms[k].value = o[k]; back.material.opacity = uniforms.uOpacity.value; };
  return group;
}
