import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

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
    this.time = 0;
    this.clock = new THREE.Clock();
    this.updaters = new Set();

    const comp = this.composer = new EffectComposer(r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    comp.addPass(this.renderPass);
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
    this._ft = (this._ft || 0) + raw; this._fn = (this._fn || 0) + 1;
    if (this._ft < 2) return;
    const avg = this._ft / this._fn; this._ft = 0; this._fn = 0;
    const pr = this.renderer.getPixelRatio();
    if (avg > 0.034 && pr > 0.7) { const n = Math.max(0.7, pr - 0.2); this.renderer.setPixelRatio(n); this.composer.setPixelRatio(n); this.resize(); }
    else if (avg > 0.05 && this.bokeh.enabled) this.lowDof = true;
  }

  frame() {
    const rawFull = this.clock.getDelta();
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
};
export { ease };

export class CameraRig {
  constructor(cam) {
    this.cam = cam;
    this.pos = new THREE.Vector3(0, 1.6, 4);
    this.look = new THREE.Vector3(0, 1.5, 0);
    this.fov = 42;
    this.roll = 0;
    this.shake = 0.5;       // handheld amount
    this.jolt = 0;          // vehicle bumps
    this.moves = [];
    this.t = 0;
    this.offset = new THREE.Vector3();
    this._lookOff = new THREE.Vector3();
  }
  reset() { this.moves.length = 0; }
  set({ pos, look, fov, roll }) {
    if (pos) this.pos.copy(v3(pos));
    if (look) this.look.copy(v3(look));
    if (fov) this.fov = fov;
    if (roll != null) this.roll = roll;
  }
  /** move to pos/look/fov over dur seconds; optional via points for curved path */
  move({ pos, look, fov, roll, dur = 3, e = 'inOut', via }) {
    return new Promise(res => {
      const m = {
        t: 0, dur, e: ease[e] || ease.inOut, res,
        p0: this.pos.clone(), p1: pos ? v3(pos) : this.pos.clone(),
        l0: this.look.clone(), l1: look ? v3(look) : this.look.clone(),
        f0: this.fov, f1: fov ?? this.fov, r0: this.roll, r1: roll ?? this.roll,
      };
      if (via) m.curve = new THREE.CatmullRomCurve3([m.p0, ...via.map(v3), m.p1]);
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
      this.look.lerpVectors(m.l0, m.l1, e);
      this.fov = m.f0 + (m.f1 - m.f0) * e;
      this.roll = m.r0 + (m.r1 - m.r0) * e;
      if (k >= 1) { m.done = true; m.res(); }
    }
    this.moves = this.moves.filter(m => !m.done);
    const t = this.t, s = this.shake * 0.006;
    this.offset.set(
      (Math.sin(t * 0.71) + Math.sin(t * 1.33 + 1.7) * 0.5) * s,
      (Math.sin(t * 0.93 + 0.4) + Math.sin(t * 1.71) * 0.4) * s + Math.sin(t * 13.0) * this.jolt * 0.004 + (Math.random() - .5) * this.jolt * 0.003,
      (Math.sin(t * 0.53 + 2.1)) * s);
    this._lookOff.set(Math.sin(t * 0.61 + 3) * s * 2.2, Math.sin(t * 0.83 + 1) * s * 1.6, 0);
    this.cam.position.copy(this.pos).add(this.offset);
    this.cam.lookAt(this.look.x + this._lookOff.x, this.look.y + this._lookOff.y, this.look.z);
    this.cam.rotateZ(this.roll + Math.sin(t * 0.47) * s * 0.4);
    if (Math.abs(this.cam.fov - this.fov) > 1e-3) { this.cam.fov = this.fov; this.cam.updateProjectionMatrix(); }
  }
}

export function v3(a) { return a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]); }
