import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.07 },
    uVignette: { value: 1.0 },
    uCA: { value: 0.0018 },
    uLift: { value: new THREE.Vector3(0.0, 0.0, 0.0) },
    uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1.05 },
    uBlack: { value: 0.03 }, uGamma: { value: 1.18 }, uCurve: { value: 0.45 },
    uFade: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVignette, uCA, uSat, uFade, uBlack, uGamma, uCurve;
    uniform vec3 uLift, uGain; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c,c);
      vec2 off = c * uCA * (1.0 + r2*4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      // grade (display space): black crush, gamma, filmic S-curve, saturation, tint
      col = max(col - uBlack, 0.0) / (1.0 - uBlack);
      col = pow(col, vec3(uGamma));
      col = mix(col, col*col*(3.0 - 2.0*col), uCurve);
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = max(mix(vec3(l), col, uSat), 0.0);
      col = col * uGain + uLift * (1.0 - col);
      // vignette
      float vig = (1.0 - smoothstep(0.2, 0.95, r2 * 1.8 * uVignette));
      col *= mix(1.0, vig, 0.72);
      // grain
      float g = hash(vUv*uRes + fract(uTime*7.31)*100.0) - 0.5;
      col += g * uGrain * (0.6 + 0.4*(1.0-l));
      col = mix(col, vec3(0.0), uFade);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.03, 400);
    this.rig = new CameraRig(this.camera);
    this.scene = new THREE.Scene();
    this.current = null; // current scene module
    this.timeScale = 1;
    this.paused = false;
    this.time = 0;
    this.clock = new THREE.Clock();
    this.updaters = new Set();

    // the post chain renders off-screen, where the canvas's antialias flag does nothing: give it its own 4× MSAA
    const comp = this.composer = new EffectComposer(r, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
    this.renderPass = new RenderPass(this.scene, this.camera);
    comp.addPass(this.renderPass);
    // contact shadows (ambient occlusion) at half resolution. Only built 3D sets ask for it (mod.ao):
    // it would darken the depth-mapped photos. ?noao turns it off; a slow machine drops it first (adapt).
    const ao = this.ao = new GTAOPass(this.scene, this.camera, 640, 360);
    ao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.3, thickness: 1, scale: 1.2, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 3, radiusExponent: 1, rings: 2, samples: 8 });
    ao.blendIntensity = 0.9; ao.enabled = false;
    const aoSize = ao.setSize.bind(ao); ao.setSize = (w, h) => aoSize(Math.ceil(w / 2), Math.ceil(h / 2));
    this.aoAllowed = !new URLSearchParams(location.search).has('noao');
    comp.addPass(ao);
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 1.5, aperture: 0.004, maxblur: 0.008 });
    this.bokeh.enabled = false;
    comp.addPass(this.bokeh);
    this.focus = null; this.focusT = 1.5;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.35, 0.6, 0.82);
    comp.addPass(this.bloom);
    comp.addPass(new OutputPass());
    this.final = new ShaderPass(FinalShader);
    comp.addPass(this.final);

    this.resize();
    addEventListener('resize', () => this.resize());
    r.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.final.uniforms.uRes.value.set(w, h);
  }

  /** grade: { lift:[r,g,b], gain:[r,g,b], sat, grain, vignette, bloom, exposure } */
  grade(g = {}) {
    const u = this.final.uniforms;
    if (g.lift) u.uLift.value.set(...g.lift);
    if (g.gain) u.uGain.value.set(...g.gain);
    if (g.sat != null) u.uSat.value = g.sat;
    if (g.grain != null) u.uGrain.value = g.grain;
    if (g.vignette != null) u.uVignette.value = g.vignette;
    if (g.ca != null) u.uCA.value = g.ca;
    u.uBlack.value = g.black ?? 0.03; u.uGamma.value = g.gamma ?? 1.18; u.uCurve.value = g.curve ?? 0.45;
    if (g.bloom != null) this.bloom.strength = g.bloom;
    if (g.bloomThreshold != null) this.bloom.threshold = g.bloomThreshold;
    if (g.exposure != null) this.renderer.toneMappingExposure = g.exposure;
  }

  /** switch to a scene module {scene, enter(engine), exit(), update(dt,t)} */
  async show(mod, opts = {}) {
    if (this.current && this.current !== mod && this.current.exit) this.current.exit();
    if (!mod.built) { await mod.build(this); mod.built = true; }
    this.current = mod;
    this.scene = mod.scene;
    this.renderPass.scene = mod.scene;
    this.bokeh.scene = mod.scene;
    this.ao.scene = mod.scene; this.ao.enabled = !!mod.ao && this.aoAllowed;
    // per-scene post passes (e.g. rain on a windshield), inserted right after the render pass
    for (const p of this.extra || []) this.composer.removePass(p);
    this.extra = mod.passes || [];
    this.extra.forEach((p, i) => this.composer.insertPass(p, 1 + i));
    this.dof(mod.dof ?? null);
    this.rig.reset();
    if (mod.grade) this.grade(mod.grade);
    if (mod.enter) await mod.enter(this, opts);
  }

  /** depth of field: {focus (m from camera) | target Object3D/Vector3, aperture, maxblur} or null to switch off */
  dof(o) {
    if (!o) { this.bokeh.enabled = false; return; }
    this.bokeh.enabled = true;
    const u = this.bokeh.uniforms;
    if (o.aperture != null) u.aperture.value = o.aperture;
    if (o.maxblur != null) u.maxblur.value = o.maxblur;
    if (o.target) this.focus = o.target; else if (o.focus != null) { this.focus = null; this.focusT = o.focus; }
  }

  onUpdate(fn) { this.updaters.add(fn); return () => this.updaters.delete(fn); }

  /** drop render resolution if the machine can't keep up (checked every 2 s) */
  adapt(raw) {
    if (raw > 0.2) return;
    this._ft = (this._ft || 0) + raw; this._fn = (this._fn || 0) + 1;
    if (this._ft < 2) return;
    const avg = this._ft / this._fn; this._ft = 0; this._fn = 0;
    const pr = this.renderer.getPixelRatio();
    if (avg > 0.024 && this.ao.enabled) { this.ao.enabled = false; this.aoAllowed = false; }   // the first thing to go, for the rest of the game
    else if (avg > 0.034 && pr > 0.7) { const n = Math.max(0.7, pr - 0.2); this.renderer.setPixelRatio(n); this.composer.setPixelRatio(n); this.resize(); }
    else if (avg > 0.05 && this.bokeh.enabled) this.lowDof = true;
  }

  frame() {
    const rawFull = this.clock.getDelta();
    // paused: the picture holds and nothing in the story advances (see Director.pause)
    if (this.paused) { this.composer.render(); return; }
    this.adapt(Math.min(rawFull, 0.25));
    const raw = Math.min(rawFull, 0.1);
    const dt = raw * this.timeScale;
    this.time += dt;
    this.final.uniforms.uTime.value += raw;
    if (this.current && this.current.update) this.current.update(dt, this.time, raw);
    for (const fn of this.updaters) fn(dt, this.time, raw);
    this.rig.update(raw, dt);
    if (this.lowDof) this.bokeh.enabled = false;
    if (this.bokeh.enabled) {
      if (this.focus) { const p = this.focus.isVector3 ? this.focus : this.focus.getWorldPosition(new THREE.Vector3()); this.focusT = p.distanceTo(this.camera.position); }
      const u = this.bokeh.uniforms.focus; u.value += (this.focusT - u.value) * (1 - Math.exp(-6 * raw));
    }
    this.composer.render();
  }
}

/* ---------------- camera rig: eased moves + handheld drift ---------------- */
const ease = {
  linear: t => t,
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  in: t => t * t * t,
  sine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  head: t => t * t * t * (t * (6 * t - 15) + 10), // minimum jerk: how people actually turn their heads
};
export { ease };

/** damped spring toward a target; ζ < 1 overshoots a little. Substepped so it behaves the same at any frame rate. */
function spring(x, v, target, w, z, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.005)), h = dt / n;
  for (let i = 0; i < n; i++) { v += (w * w * (target - x) - 2 * z * w * v) * h; x += v * h; }
  return [x, v];
}
function spring3(x, v, target, w, z, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.005)), h = dt / n;
  for (let i = 0; i < n; i++) {
    v.x += (w * w * (target.x - x.x) - 2 * z * w * v.x) * h; x.x += v.x * h;
    v.y += (w * w * (target.y - x.y) - 2 * z * w * v.y) * h; x.y += v.y * h;
    v.z += (w * w * (target.z - x.z) - 2 * z * w * v.z) * h; x.z += v.z * h;
  }
}
const _d = new THREE.Vector3(), _h = new THREE.Vector3(), _e = new THREE.Vector3();

/*
  pos/look/fov/roll are where the shot wants to be; move() and set() drive them.
  rig.pov = 0 is a film camera: it goes exactly there.
  rig.pov = 1 is someone's head: what's shown follows the same targets through a spring, so turns start and stop softly
  and flow into each other, and it breathes, leans into turns and pivots on a neck. Timing never changes: move() still
  resolves at its duration, the head just finishes settling a moment later. rig.set is a cut and snaps straight there.
  jolt drives road motion in any mode: a smooth surface plus the odd real bump that settles on the suspension.
*/
export class CameraRig {
  constructor(cam) {
    this.cam = cam;
    this.pos = new THREE.Vector3(0, 1.6, 4);
    this.look = new THREE.Vector3(0, 1.5, 0);
    this.fov = 42;
    this.roll = 0;
    this.shake = 0.5;       // handheld amount
    this.jolt = 0;          // vehicle bumps
    this.pov = 0;           // 0 film camera .. 1 somebody's head
    this.road = 0;          // current suspension travel (m), for things carried along with the head
    this.moves = [];
    this.t = 0;
    this.offset = new THREE.Vector3();
    this._lookOff = new THREE.Vector3();
    // what the head is actually doing
    this.snap = true;
    this.fPos = new THREE.Vector3(); this.vPos = new THREE.Vector3();
    this.fDir = new THREE.Vector3(0, 0, -1); this.vDir = new THREE.Vector3();
    this.fFov = 42; this.vFov = 0;
    this.lean = 0; this.ref = new THREE.Vector3(0, 0, -1);
    // suspension
    this.susY = 0; this.susV = 0; this.susR = 0; this.susRV = 0; this.bumpIn = 1.5; this._jPrev = 0;
  }
  reset() { this.moves.length = 0; this.pov = 0; this.snap = true; }
  set({ pos, look, fov, roll }) {
    if (pos) this.pos.copy(v3(pos));
    if (look) this.look.copy(v3(look));
    if (fov) this.fov = fov;
    if (roll != null) this.roll = roll;
    this.snap = true;
  }
  /** a sudden knock (door slam, pothole) */
  kick(v = 0.2, r = 0) { this.susV -= v; this.susRV += r; }
  /** move to pos/look/fov over dur seconds; optional via points for curved path */
  move({ pos, look, fov, roll, dur = 3, e, via }) {
    return new Promise(res => {
      const head = this.pov > 0 && (!e || e === 'inOut');
      const m = {
        t: 0, dur, e: head ? ease.head : ease[e] || ease.inOut, res,
        p0: this.pos.clone(), p1: pos ? v3(pos) : this.pos.clone(),
        l0: this.look.clone(), l1: look ? v3(look) : this.look.clone(),
        f0: this.fov, f1: fov ?? this.fov, r0: this.roll, r1: roll ?? this.roll,
      };
      if (via) m.curve = new THREE.CatmullRomCurve3([m.p0, ...via.map(v3), m.p1]);
      // a head turning on the spot sweeps through angles at an even pace, not along a straight line between two look points
      if (this.pov > 0 && m.p0.distanceTo(m.p1) < 0.2) {
        const a = m.l0.clone().sub(m.p0), b = m.l1.clone().sub(m.p1);
        const la = a.length(), lb = b.length();
        if (la > 1e-4 && lb > 1e-4) m.arc = { a: a.divideScalar(la), b: b.divideScalar(lb), la, lb };
      }
      // a new move cancels moves that are still running
      for (const o of this.moves) o.res();
      this.moves = [m];
    });
  }
  update(raw, dt) {
    this.t += raw;
    for (const m of this.moves) {
      m.t += dt;
      const k = Math.min(1, m.t / m.dur), e = m.e(k);
      if (m.curve) this.pos.copy(m.curve.getPoint(e)); else this.pos.lerpVectors(m.p0, m.p1, e);
      if (m.arc) {
        const { a, b, la, lb } = m.arc, th = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
        if (th < 1e-3) _d.lerpVectors(a, b, e);
        else { const s = Math.sin(th); _d.copy(a).multiplyScalar(Math.sin((1 - e) * th) / s).addScaledVector(b, Math.sin(e * th) / s); }
        this.look.copy(this.pos).addScaledVector(_d, la + (lb - la) * e);
      } else this.look.lerpVectors(m.l0, m.l1, e);
      this.fov = m.f0 + (m.f1 - m.f0) * e;
      this.roll = m.r0 + (m.r1 - m.r0) * e;
      if (k >= 1) { m.done = true; m.res(); }
    }
    this.moves = this.moves.filter(m => !m.done);
    const t = this.t, s = this.shake * 0.006, pv = this.pov;

    // the road: a smooth surface, the odd real bump, and whatever knocked us
    const j = this.jolt;
    if (j - this._jPrev > 0.2) this.kick(0.1 + j * 0.16, (Math.sin(t * 37) > 0 ? 1 : -1) * 0.02);
    this._jPrev = j;
    if (j > 0.05) {
      this.bumpIn -= raw;
      if (this.bumpIn <= 0) { this.kick((0.07 + Math.random() * 0.15) * Math.min(1.2, j), (Math.random() - .5) * 0.05 * j); this.bumpIn = 0.8 + Math.random() * 2.8; }
    }
    [this.susY, this.susV] = spring(this.susY, this.susV, 0, 15, 0.32, raw);
    [this.susR, this.susRV] = spring(this.susR, this.susRV, 0, 10, 0.38, raw);
    const surface = (Math.sin(t * 8.3) + Math.sin(t * 13.1 + 1.1) * 0.6 + Math.sin(t * 19.7 + 2.3) * 0.3) * j * 0.0012;
    this.road = this.susY + surface;

    // the head follows the shot
    _d.copy(this.look).sub(this.pos); if (_d.lengthSq() < 1e-8) _d.copy(this.fDir); _d.normalize();
    if (this.snap || pv <= 0) {
      this.fPos.copy(this.pos); this.fDir.copy(_d); this.fFov = this.fov;
      this.vPos.set(0, 0, 0); this.vDir.set(0, 0, 0); this.vFov = 0; this.lean = 0;
      this.ref.copy(_d); this.snap = false;
    } else {
      spring3(this.fPos, this.vPos, this.pos, 7.5, 1, raw);
      spring3(this.fDir, this.vDir, _d, 8.5, 0.86, raw);
      this.fDir.normalize();
      [this.fFov, this.vFov] = spring(this.fFov, this.vFov, this.fov, 6, 1, raw);
    }

    this.offset.set(
      (Math.sin(t * 0.71) + Math.sin(t * 1.33 + 1.7) * 0.5) * s,
      (Math.sin(t * 0.93 + 0.4) + Math.sin(t * 1.71) * 0.4) * s + this.road,
      (Math.sin(t * 0.53 + 2.1)) * s);
    this._lookOff.set(Math.sin(t * 0.61 + 3) * s * 2.2, Math.sin(t * 0.83 + 1) * s * 1.6, 0);
    let roll = this.roll + Math.sin(t * 0.47) * s * 0.4 + this.susR;
    let lookY = this._lookOff.y + this.susY * 0.3;

    if (pv > 0) {
      const zoom = this.fFov / 45; // a narrow lens magnifies everything; keep the head the same size on screen
      // breathing, a slow rise and fall a little behind the chest
      const b = t * 1.32;
      this.offset.y += Math.sin(b) * 0.0032 * pv;
      lookY += Math.sin(b - 0.7) * 0.0016 * 2.2 * pv * zoom;
      // the eyes pivot on the neck: looking down brings them forward and down, turning swings them round a little
      this.ref.lerp(this.fDir, 1 - Math.exp(-0.16 * raw)).normalize();
      const pitch = Math.asin(Math.min(1, Math.max(-1, this.fDir.y)));
      _h.set(this.fDir.x, 0, this.fDir.z).normalize();
      _e.set(this.ref.x, 0, this.ref.z).normalize();
      const fwd = 0.09 * Math.cos(pitch) + 0.1 * Math.sin(-pitch), up = 0.1 * (Math.cos(pitch) - 1) - 0.09 * Math.sin(-pitch);
      this.offset.addScaledVector(_h, fwd * 0.45 * pv).addScaledVector(_e, -0.09 * 0.45 * pv);
      this.offset.y += up * 0.45 * pv;
      // lean a touch into a turn
      const yawRate = this.fDir.z * this.vDir.x - this.fDir.x * this.vDir.z;
      const leanT = Math.max(-0.03, Math.min(0.03, yawRate * 0.016));
      this.lean += (leanT - this.lean) * (1 - Math.exp(-5 * raw));
      roll += this.lean * pv;
    }

    // the eyes stay locked on what they're looking at while the head moves; anything close (a phone in the hand) rides the same road
    const L = Math.max(0.05, this.look.distanceTo(this.pos)), near = 1 - Math.min(1, Math.max(0, (L - 0.6) / 0.9)), w = Math.min(1, L);
    this.cam.position.copy(this.fPos).add(this.offset);
    _d.copy(this.fPos).addScaledVector(this.fDir, L);
    this.cam.lookAt(_d.x + this._lookOff.x * w, _d.y + lookY * w + this.road * near, _d.z);
    this.cam.rotateZ(roll);
    if (Math.abs(this.cam.fov - this.fFov) > 1e-3) { this.cam.fov = this.fFov; this.cam.updateProjectionMatrix(); }
  }
}

export function v3(a) { return a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]); }
