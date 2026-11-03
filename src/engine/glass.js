import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Rain on a windshield, as a screen-space pass.
 * mask: windshield region in screen uv {x0,x1,y0,y1} (soft edges). Wipers pivot at the bottom.
 */
export function glassPass({ x0 = 0.0, x1 = 1.0, y0 = 0.32, y1 = 1.0, wipers = true } = {}) {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1600, 900) },
      uMask: { value: new THREE.Vector4(x0, x1, y0, y1) }, uRain: { value: 1 }, uWipe: { value: wipers ? 1 : 0 },
      uWipeT: { value: 2.6 }, uBlur: { value: 1 },
      uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
      // windshield: bottom edge center, up-slope unit vector, half width, slope length, x center
      uG0: { value: new THREE.Vector3(-0.22, -0.33, -1.02) }, uGUp: { value: new THREE.Vector3(0, 0.75, 0.47).normalize() },
      uGW: { value: 0.98 }, uGL: { value: 0.88 },
      // where the two blades are right now (radians from straight up, toward +x), so the glass can stay clear around them
      uA1: { value: 0 }, uA2: { value: 0 },
      uP1: { value: new THREE.Vector2(-0.55, -0.06) }, uP2: { value: new THREE.Vector2(0.2, -0.06) },
      uR1: { value: new THREE.Vector2(0.1, 0.7) }, uR2: { value: new THREE.Vector2(0.09, 0.59) },
      uMid: { value: 0.45 }, uAmp: { value: 1.05 },
      // white wherever the cabin (wheel, dash, arms) is in front of the glass: no rain is drawn there
      tInside: { value: null }, uInside: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime, uRain, uWipe, uWipeT, uBlur, uGW, uGL; uniform vec2 uRes; uniform vec4 uMask;
      uniform mat4 uInvProj, uCamWorld; uniform vec3 uG0, uGUp; uniform float uA1, uA2, uMid, uAmp; uniform vec2 uP1, uP2, uR1, uR2;
      uniform sampler2D tInside; uniform float uInside;
      varying vec2 vUv;
      #define PI 3.14159265
      float h21(vec2 p){ p = fract(p*vec2(233.34, 851.73)); p += dot(p, p+23.45); return fract(p.x*p.y); }
      vec2 h22(vec2 p){ float n = h21(p); return vec2(n, h21(p+n+3.1)); }

      // beaded drops on a grid; returns refraction offset (xy) and coverage (z)
      vec3 beads(vec2 uv, float scale, float t, float dens){
        vec2 g = uv*scale; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
        vec2 r = h22(id);
        vec2 c = (r - 0.5) * 0.6;
        float life = fract(t*0.07 + r.x*5.0);
        float on = step(r.y, dens) * (1.0 - smoothstep(0.86, 1.0, life)) * smoothstep(0.0, 0.05, life);
        float size = 0.12 + 0.24*h21(id+7.7);
        vec2 d = (f - c) * vec2(1.0, 1.25);
        float dist = length(d);
        float m = (1.0 - smoothstep(size*0.7, size, dist)) * on;
        return vec3(d/size * m, m);
      }
      // drops sliding down with a thin trail
      vec3 runners(vec2 uv, float t, float dens){
        vec2 g = uv*vec2(14.0, 1.0);
        float col = floor(g.x); float rc = h21(vec2(col, 1.7));
        if (rc > dens * 0.6) return vec3(0.0);
        float x = fract(g.x) - 0.5 + (rc - 0.5)*0.5 + sin(uv.y*18.0 + rc*9.0)*0.06;
        float speed = 0.06 + rc*0.12;
        float y = 1.15 - fract(t*speed + rc*17.0) * 1.3;
        float dy = (uv.y - y);
        vec2 d = vec2(x*0.11, dy*0.55);
        float head = 1.0 - smoothstep(0.012, 0.02, length(d));
        float trail = (1.0 - smoothstep(0.004, 0.012, abs(x*0.11))) * smoothstep(0.0, 0.02, dy) * (1.0 - smoothstep(0.0, 0.25, dy)) * 0.6;
        float m = max(head, trail);
        return vec3(vec2(x, dy*0.3) * m * 3.0, m);
      }
      // seconds since a wiper (pivot p, sweep mid±amp) last passed over this pixel
      float sinceWipe(vec2 uv, vec2 p, vec2 rr, float mid, float amp, float T, float t){
        vec2 d = (uv - p);
        if (length(d) > rr.y || length(d) < rr.x) return 99.0;
        float phi = atan(d.x, d.y);
        float s = (phi - mid) / amp;
        if (abs(s) > 1.0) return 99.0;
        float w = 2.0*PI/T, u = mod(w*t, 2.0*PI);
        float a1 = asin(s), a2 = PI - a1;
        float t1 = mod(u - a1, 2.0*PI)/w, t2 = mod(u - a2, 2.0*PI)/w;
        return min(t1, t2);
      }
      // 1 close to a blade: the water there is being pushed aside, and the blade itself must stay crisp
      float nearBlade(vec2 uv, vec2 p, vec2 rr, float ang){
        vec2 d = uv - p; float L = length(d);
        if (L < rr.x - 0.03 || L > rr.y + 0.04) return 0.0;
        vec2 dir = vec2(sin(ang), cos(ang));
        return 1.0 - smoothstep(0.02, 0.075, abs(dot(d, vec2(dir.y, -dir.x))));
      }
      vec3 blur(vec2 uv, float r){
        // 16-tap Vogel disk, rotated per pixel so it reads as fog instead of a grid
        vec3 c = vec3(0.0);
        float rot = h21(uv * uRes) * 6.2831;
        for (int i = 0; i < 16; i++) {
          float fi = float(i);
          float rr = sqrt((fi + 0.5) / 16.0) * r * 3.2;
          float a = fi * 2.39996 + rot;
          c += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * rr / uRes).rgb;
        }
        return c / 16.0;
      }
      void main(){
        vec2 uv = vUv;
        vec4 vd = uInvProj * vec4(uv*2.0 - 1.0, 1.0, 1.0); vd /= vd.w;
        vec3 dir = normalize(mat3(uCamWorld) * vd.xyz), org = uCamWorld[3].xyz;
        vec3 nrm = normalize(cross(vec3(1.0, 0.0, 0.0), uGUp));
        float den = dot(dir, nrm);
        float th = abs(den) > 1e-4 ? dot(uG0 - org, nrm) / den : -1.0;
        vec3 hit = org + dir * th;
        vec2 gc = vec2(hit.x - uG0.x, dot(hit - uG0, uGUp));   // glass coords in meters
        float mask = th > 0.0 ? smoothstep(-uGW, -uGW + 0.05, gc.x) * (1.0 - smoothstep(uGW - 0.05, uGW, gc.x)) * smoothstep(0.0, 0.04, gc.y) * (1.0 - smoothstep(uGL - 0.02, uGL, gc.y)) : 0.0;
        if (uInside > 0.5) mask *= 1.0 - texture2D(tInside, uv).r;
        if (mask < 0.001 || uRain < 0.001) { gl_FragColor = texture2D(tDiffuse, uv); return; }
        float t = uTime;
        // wipers
        float clear = 1.0, near = 0.0, film = 0.0;
        if (uWipe > 0.001) {
          float s1 = sinceWipe(gc, uP1, uR1, uMid, uAmp, uWipeT, t), s2 = sinceWipe(gc, uP2, uR2, uMid, uAmp, uWipeT, t + 0.05);
          float s = min(s1, s2);
          clear = mix(1.0, smoothstep(0.0, 2.2, s), uWipe);
          near = max(nearBlade(gc, uP1, uR1, uA1), nearBlade(gc, uP2, uR2, uA2)) * uWipe;
          // the thin wet film a blade leaves behind: fine arcs that thin out in a moment
          float rad = s1 < s2 ? length(gc - uP1) : length(gc - uP2);
          film = exp(-s * 3.2) * (0.5 + 0.5 * sin(rad * 420.0 + sin(rad * 37.0) * 3.0)) * uWipe;
        }
        float dens = uRain * clear;
        vec3 b1 = beads(gc, 34.0, t, 0.75 * dens);
        vec3 b2 = beads(gc + 0.37, 70.0, t * 1.3, 0.85 * dens);
        vec3 rn = runners(gc * vec2(1.0, 1.1), t, dens);
        vec2 off = (b1.xy * 0.018 + b2.xy * 0.009 + rn.xy * 0.01) * mask;
        float cov = clamp(b1.z + b2.z + rn.z, 0.0, 1.0) * mask;
        // mist between drops: blurred; inside drops: sharp refracted image
        vec3 mist = blur(uv, 3.5 * uBlur * (0.35 + 0.65*dens));
        vec3 sharp = texture2D(tDiffuse, uv + off * 1.0 - off*0.0).rgb;
        vec3 inDrop = texture2D(tDiffuse, uv - off * 2.2).rgb * 1.08;
        vec3 col = mix(sharp, mist, mask * (0.25 + 0.75 * dens) * (1.0 - near));
        col = mix(col, inDrop, cov * (1.0 - near));
        col = mix(col, texture2D(tDiffuse, uv + vec2(film * 0.0012, -film * 0.0008)).rgb * 1.04, film * 0.5 * mask * (1.0 - near));
        // tiny highlight on drop tops
        col += vec3(0.06) * smoothstep(0.4, 1.0, -off.y * 40.0) * cov;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  // pass.inside = { scene, camera, layer }: objects on that layer are inside the car, in front of the glass
  pass.inside = null;
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff }), clear = new THREE.Color();
  let rt = null;
  const render = pass.render.bind(pass);
  pass.render = (renderer, writeBuffer, readBuffer, dt, mask) => {
    const I = pass.inside;
    if (I) {
      const w = Math.ceil(readBuffer.width / 2), h = Math.ceil(readBuffer.height / 2);
      if (!rt) rt = new THREE.WebGLRenderTarget(w, h); else if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
      const S = I.scene, cam = I.camera, layers = cam.layers.mask, bg = S.background, ov = S.overrideMaterial, ca = renderer.getClearAlpha();
      renderer.getClearColor(clear);
      cam.layers.set(I.layer); S.background = null; S.overrideMaterial = white;
      renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); renderer.render(S, cam);
      cam.layers.mask = layers; S.background = bg; S.overrideMaterial = ov; renderer.setClearColor(clear, ca);
      pass.uniforms.tInside.value = rt.texture; pass.uniforms.uInside.value = 1;
    }
    render(renderer, writeBuffer, readBuffer, dt, mask);
  };
  pass.update = (t, w, h, cam) => {
    const u = pass.uniforms; u.uTime.value = t; u.uRes.value.set(w, h);
    if (cam) { cam.updateMatrixWorld(); u.uInvProj.value.copy(cam.projectionMatrixInverse); u.uCamWorld.value.copy(cam.matrixWorld); }
  };
  return pass;
}
