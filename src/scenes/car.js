import * as THREE from 'three';
import { prewarm } from '../engine/prewarm.js';
import { pbr, std, glow, box, cyl, at, canvasTex, envFrom } from '../engine/kit.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { cast } from '../engine/cast.js';
import { animate } from '../engine/tween.js';
import { photo3d } from '../engine/photo3d.js';
import { glassPass } from '../engine/glass.js';
import { povArm, dropsTexture } from './labas.js';

const _w = new THREE.Vector3(), _e = new THREE.Vector3(), _u = new THREE.Vector3();

/* Aug 17, 2026, played by whoever is holding the controls: until the story turns into ours, it's Sir at the wheel.
   Camera = the driver, at the origin, looking down -Z. The view through the windshield is the real photos
   (depth-mapped), so the photo cameras also sit at the origin. */
const PI = Math.PI;
const SEAT_X = 0.74;                                  // the cabin was modelled from the passenger seat: shift it so the wheel is in front of us
const PIVOT = [[-0.55, -0.06], [0.2, -0.06]], ARM = [0.4, 0.34], BLADE = [0.6, 0.5], MID = 0.45, AMP = 1.05, PARK = MID + AMP + 0.015;

/** a bar bent into a shallow arch along Y, the shape of a wiper's stamped yokes. Springs toward -z (away from the glass). */
function arch(len, w, h, rise, mat) {
  const g = new THREE.BoxGeometry(w, len, h, 1, 18, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getY(i) / len * 2; p.setZ(i, p.getZ(i) - rise * (1 - u * u)); p.setX(i, p.getX(i) * (1 - 0.32 * u * u)); }
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}
/** One complete wiper, built the way a real one is: spindle under a cap, spring head, stamped arm with its hook,
    a primary yoke on the hook, two secondary yokes, six claws gripping the steel backing of a rubber squeegee.
    Group origin is the spindle; the arm points along +Y; -Z is away from the glass. rotation.z sweeps it. */
function wiper(armLen, bladeLen) {
  const G = new THREE.Group();
  const black = new THREE.MeshStandardMaterial({ color: 0x0a0b0c, roughness: 0.38, metalness: 0.65 });
  const satin = new THREE.MeshStandardMaterial({ color: 0x141516, roughness: 0.55, metalness: 0.5 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.62 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.3, metalness: 0.9 });
  // spindle, nut and its plastic cap
  G.add(at(cyl(0.017, 0.022, 0.03, satin, 20), 0, 0, -0.03, 0, PI / 2));
  G.add(at(cyl(0.0125, 0.0125, 0.01, steel, 6), 0, 0, -0.05, 0, PI / 2));
  // spring head: wider, hinged, carries the tension that keeps the rubber on the glass
  const head = arch(0.1, 0.03, 0.016, 0.0, black); head.position.set(0, 0.05, -0.052); G.add(head);
  for (const sx of [-1, 1]) G.add(at(cyl(0.0035, 0.0035, 0.012, steel, 8), sx * 0.012, 0.09, -0.052, 0, 0, PI / 2));
  // the arm itself: a stamped U channel, tapering toward the hook and dropping toward the glass
  const L = armLen - 0.1, armG = new THREE.BoxGeometry(0.018, L, 0.009, 1, 12, 1), ap = armG.attributes.position;
  for (let i = 0; i < ap.count; i++) { const u = ap.getY(i) / L + 0.5; ap.setX(i, ap.getX(i) * (1.15 - 0.55 * u)); ap.setZ(i, ap.getZ(i) * (1.1 - 0.3 * u) + (-0.052 + 0.016 * u)); }
  armG.computeVertexNormals();
  const arm = new THREE.Mesh(armG, black); arm.position.y = 0.1 + L / 2; arm.castShadow = true; G.add(arm);
  // the washer line clipped along it
  const hose = cyl(0.0016, 0.0016, L * 0.78, new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.7 }), 6); hose.position.set(0.0075, 0.1 + L * 0.46, -0.043); G.add(hose);
  // hook at the end of the arm, the bit that latches into the blade
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.0068, 0.0022, 6, 14, PI), steel); hook.rotation.set(0, PI / 2, 0); hook.position.set(0, armLen + 0.002, -0.033); G.add(hook);

  // ---- the blade, centred on the end of the arm ----
  const B = new THREE.Group(); B.position.set(0, armLen, 0); G.add(B);
  // rubber: a tall thin lip standing on the glass, with a wider root
  B.add(at(box(0.0028, bladeLen, 0.0065, rubber), 0, 0, -0.0035));
  B.add(at(box(0.0075, bladeLen - 0.004, 0.0048, rubber), 0, 0, -0.0088));
  // steel vertebrae the claws grip
  B.add(at(box(0.0095, bladeLen - 0.014, 0.0012, steel), 0, 0, -0.0118));
  const pri = bladeLen * 0.62, sec = bladeLen * 0.34;
  // primary yoke: the long arch, with the saddle for the hook in the middle
  const py = arch(pri, 0.0145, 0.0045, 0.015, black); py.position.z = -0.0165; B.add(py);
  B.add(at(box(0.017, 0.038, 0.011, satin, 0.002), 0, 0, -0.033));
  B.add(at(cyl(0.0024, 0.0024, 0.019, steel, 8), 0, 0, -0.033, 0, 0, PI / 2));
  for (const s of [-1, 1]) {
    const y = s * pri / 2, sy = arch(sec, 0.0125, 0.004, 0.0085, black); sy.position.set(0, y, -0.0128); B.add(sy);
    B.add(at(cyl(0.0022, 0.0022, 0.016, steel, 8), 0, y, -0.0225, 0, 0, PI / 2));   // rivet where the yokes pivot
    for (const c of [-1, 1]) {
      // a claw at each end of each secondary yoke, folded round the steel
      const cy = y + c * sec * 0.47;
      if (Math.abs(cy) < bladeLen / 2) for (const sx of [-1, 1]) B.add(at(box(0.0022, 0.012, 0.007, black), sx * 0.0058, cy, -0.0118));
      if (Math.abs(cy) < bladeLen / 2) B.add(at(box(0.0135, 0.012, 0.0018, black), 0, cy, -0.0152));
    }
    B.add(at(box(0.0098, 0.009, 0.0072, rubber, 0.002), 0, s * (bladeLen / 2 - 0.0035), -0.0098));   // end cap
  }
  G.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return G;
}

/** a steering wheel with a hub and three spokes, not a bare ring */
function wheelModel(mat, hubM) {
  const G = new THREE.Group();
  G.add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.017, 12, 56), mat));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.07, 0.04, 28), hubM); hub.rotation.x = PI / 2; hub.position.z = -0.01; G.add(hub);
  for (const a of [0, PI, PI * 1.5]) { const s = box(0.13, 0.026, 0.01, mat, 0.004); s.position.set(Math.cos(a) * 0.115, Math.sin(a) * 0.115, -0.006); s.rotation.z = a; G.add(s); }
  return G;
}

export default {
  grade: { lift: [0.0, 0.016, 0.026], gain: [0.82, 0.98, 1.1], sat: 1.2, grain: 0.065, bloom: 0.3, bloomThreshold: 0.85, exposure: 0.42, vignette: 1.15, black: 0.045, gamma: 1.2, curve: 0.5 },

  async build(engine) {
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0x9aa3aa);
    S.environment = await envFrom(engine.renderer, '/tex/kloofendal_overcast_puresky_1k.hdr');
    S.environmentIntensity = 0.25;
    S.add(new THREE.HemisphereLight(0xc4ccd4, 0x2a2826, 0.6));
    const key = new THREE.DirectionalLight(0xc8d2dc, 0.7); key.position.set(0.5, 3, -4); S.add(key);

    // ---- the real street outside (swappable) ----
    this.views = {
      street: photo3d({ name: 'IMG_6458', aspect: 0.75, hfov: 67, near: 2.2, far: 70, extend: 1.9, water: { y: -1.6, strength: 0.4 } }),
      exitA: photo3d({ name: 'IMG_6448', aspect: 0.75, hfov: 67, near: 2.0, far: 70, extend: 1.9, water: { y: -1.2, strength: 1.2 } }),
      exitB: photo3d({ name: 'IMG_6457', aspect: 0.75, hfov: 67, near: 2.6, far: 80, extend: 1.9, cut: 0.06, water: { y: -1.2, strength: 1.2 } }),
    };
    for (const v of Object.values(this.views)) { v.visible = false; v.position.y = 0.25; S.add(v); }
    this.view = null;

    // ---- car interior ----
    const C = this.car = new THREE.Group(); C.position.x = SEAT_X; S.add(C);
    const dashM = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: 0.75, normalMap: (await import('../engine/kit.js')).tex('/tex/leather_red_03_nor.jpg', { repeat: [4, 2], srgb: false }) });
    dashM.normalScale.set(0.4, 0.4);
    const trim = std(0x1f2124, { rough: 0.5 });
    const fabric = std(0x2a2b2e, { rough: 0.95 });
    // dashboard: a long rounded slab under the windshield
    C.add(at(box(2.4, 0.22, 0.62, dashM, 0.08), -0.25, -0.43, -0.98));
    C.add(at(box(2.4, 0.5, 0.3, dashM, 0.06), -0.25, -0.72, -0.78));
    // windshield frame: A-pillars + header
    for (const x of [-1.2, 0.72]) { const p = box(0.09, 1.1, 0.12, trim, 0.03); p.position.set(x, 0.1, -0.85); p.rotation.x = -0.62; C.add(p); }
    C.add(at(box(2.3, 0.14, 0.5, fabric), -0.25, 0.47, -0.42));
    // the hood out past the glass, shining wet: you're sitting in a car, not behind a pane
    { const hg = new THREE.PlaneGeometry(2.0, 1.45, 24, 10), p = hg.attributes.position; for (let i = 0; i < p.count; i++) { const u = p.getX(i) / 1.0, v = p.getY(i) / 0.725; p.setZ(i, -u * u * 0.05 - (v + 1) * (v + 1) * 0.03); } hg.computeVertexNormals();
      const hood = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: 0x8c949c, metalness: 0.55, roughness: 0.26, envMapIntensity: 1.4 })); hood.rotation.x = -PI / 2 + 0.05; hood.position.set(-0.25, -0.41, -1.72); C.add(hood); }
    // glass (very faint, the pass does the rain)
    // rear-view mirror
    const mir = box(0.24, 0.07, 0.03, trim, 0.02); mir.position.set(-0.36, 0.31, -0.66); mir.rotation.y = 0.25; C.add(mir);
    const mstem = cyl(0.01, 0.01, 0.12, trim); mstem.position.set(-0.36, 0.38, -0.66); C.add(mstem);
    // center console with clock + fuel
    this.clockTex = canvasTex(256, 96, (c) => { c.fillStyle = '#06080a'; c.fillRect(0, 0, 256, 96); });
    const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshBasicMaterial({ map: this.clockTex }));
    clock.position.set(-0.28, -0.38, -0.665); clock.rotation.x = -0.35; C.add(clock); this.clock = clock;
    // fuel gauge (driver cluster, seen when we look left)
    const gauge = new THREE.Group(); gauge.position.set(-0.75, -0.3, -0.72); gauge.rotation.x = -0.2; C.add(gauge);
    gauge.add(new THREE.Mesh(new THREE.CircleGeometry(0.06, 32), new THREE.MeshBasicMaterial({ color: 0x0a0c0e })));
    const needle = this.needle = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 0.05), glow(0xff7a30, 2.5)); needle.geometry.translate(0, 0.025, 0); needle.position.z = 0.001; gauge.add(needle);
    for (let i = 0; i <= 4; i++) { const tk = new THREE.Mesh(new THREE.PlaneGeometry(0.003, 0.012), glow(0xffffff, 1.2)); const a = -1.1 + i * 0.55; tk.position.set(Math.sin(a) * 0.05, Math.cos(a) * 0.05, 0.001); tk.rotation.z = -a; gauge.add(tk); }
    needle.rotation.z = 0.35;
    // steering wheel
    const wheel = this.wheel = wheelModel(trim, std(0x141517, { rough: 0.45 })); wheel.position.set(-0.74, -0.24, -0.5); wheel.rotation.x = -0.45; C.add(wheel);
    // driver seat back + headrest
    C.add(at(box(0.5, 0.75, 0.12, fabric, 0.05), -0.74, -0.35, 0.22));
    C.add(at(box(0.26, 0.2, 0.1, fabric, 0.05), -0.74, 0.18, 0.24));
    // passenger door, hinged at its front edge; everything on it swings out together
    const door = this.door = new THREE.Group(); door.position.set(-1.24, 0, -0.78); door.scale.x = -1; C.add(door);
    const panelM = std(0x55585e, { rough: 0.62 }), softM = std(0x74777d, { rough: 0.85 });
    door.add(at(box(0.07, 0.72, 1.24, panelM, 0.02), 0.02, -0.6, 0.62));
    door.add(at(box(0.09, 0.05, 0.52, softM, 0.018), -0.02, -0.36, 0.72));                 // armrest
    door.add(at(box(0.05, 0.3, 0.72, softM, 0.02), -0.02, -0.56, 0.7));                    // cloth insert
    this.doorHandle = box(0.018, 0.05, 0.13, std(0xa3a9ae, { rough: 0.25, metal: 0.9 }), 0.006); this.doorHandle.position.set(-0.03, -0.28, 0.3); door.add(this.doorHandle);
    door.add(at(box(0.05, 0.03, 1.18, trim), 0.02, 0.43, 0.6), at(box(0.05, 0.68, 0.05, trim), 0.02, 0.09, 1.2), at(box(0.05, 0.68, 0.06, trim), 0.02, 0.09, 0.02));
    door.add(at(box(0.06, 0.05, 1.2, trim, 0.01), 0.02, -0.235, 0.6));
    // side glass with rain on it (a drawn texture, the windshield pass only covers the front)
    const dropsT = dropsTexture();
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.64), new THREE.MeshBasicMaterial({ map: dropsT, transparent: true, depthWrite: false, opacity: 0.85, side: THREE.DoubleSide }));
    pane.position.set(0.02, 0.1, 0.62); pane.rotation.y = -PI / 2; door.add(pane);
    // pillar behind the door, roof edge
    C.add(at(box(0.09, 1.0, 0.1, trim), -1.26, -0.02, 0.5), at(box(0.1, 0.1, 1.5, fabric), -1.32, 0.46, -0.2));
    // what is out that side: the wet side of the street, only ever seen soft through glass and rain
    const sideM = new THREE.MeshBasicMaterial({ map: canvasTex(1024, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d7e1ea'); g.addColorStop(0.46, '#c3cfd9'); g.addColorStop(0.47, '#5f6a70'); g.addColorStop(0.62, '#4b5358'); g.addColorStop(0.63, '#646b6e'); g.addColorStop(1, '#3b4145'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.filter = 'blur(26px)';
      for (const [x, wd, top, col] of [[20, 300, 90, '#6f6c68'], [340, 240, 40, '#85827b'], [600, 420, 110, '#63666a'], [860, 200, 60, '#77746f']]) { c.fillStyle = col; c.fillRect(x, top, wd, h * 0.56 - top); }
      for (let i = 0; i < 14; i++) { c.fillStyle = 'rgba(46,54,48,.4)'; c.beginPath(); c.arc(Math.random() * w, h * 0.46 + Math.random() * 40, 30 + Math.random() * 50, 0, 7); c.fill(); }
    }), side: THREE.BackSide, fog: false, color: new THREE.Color(2.4, 2.4, 2.4) });
    const side = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 16, 48, 1, true, PI * 0.19, PI * 0.57), sideM); side.position.y = 0.6; side.scale.x = -1; side.visible = false; S.add(side); this.sideWorld = side;
    // your own arms: the left goes to the door later; both are on the wheel while you drive
    this.armL = povArm({ left: true }); this.armR = povArm(); S.add(this.armL, this.armR);
    this.dayLight = new THREE.PointLight(0xdfe8f2, 2.2, 7, 1.2); this.dayLight.position.set(-1.2, 0.3, -0.1); S.add(this.dayLight);

    // rain outside the car
    this.rain = new Rain({ count: 9000, size: [18, 10, 26], speed: 9, opacity: 0.4, wind: [0.3, 0.8] }).exclude([-1.4, -1.3, -1.1], [1.0, 0.7, 1.3]);
    S.add(this.rain.mesh);

    this.glass = glassPass({ y0: 0.2, y1: 1.0 });
    this.passes = [this.glass];
    this.drive = 0;
    // ---- the wipers, in the plane of the windshield ----
    { const u = this.glass.uniforms, G0 = u.uG0.value; G0.x += SEAT_X;
      const X = new THREE.Vector3(1, 0, 0), Y = u.uGUp.value.clone(), Z = X.clone().cross(Y).normalize();
      const P = this.pane = new THREE.Group(); P.position.copy(G0); P.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); S.add(P);
      this.wipers = PIVOT.map(([x, y], i) => { const w = wiper(ARM[i], BLADE[i]); w.position.set(x, y, -0.006); w.rotation.z = -PARK; P.add(w); return w; });
      this.bladeAng = [PARK, PARK]; this.wipersOn = false;
      u.uR1.value.set(ARM[0] - BLADE[0] / 2, ARM[0] + BLADE[0] / 2); u.uR2.value.set(ARM[1] - BLADE[1] / 2, ARM[1] + BLADE[1] / 2);
      u.uMid.value = MID; u.uAmp.value = AMP; u.uP1.value.set(...PIVOT[0]); u.uP2.value.set(...PIVOT[1]); }
  },

  setClock(text) {
    const c = this.clockTex.image.getContext('2d');
    c.fillStyle = '#06080a'; c.fillRect(0, 0, 256, 96);
    c.fillStyle = '#7fd4ff'; c.font = '600 58px Inter'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 128, 50);
    this.clockTex.needsUpdate = true;
  },

  show(name) {
    for (const [k, v] of Object.entries(this.views)) v.visible = k === name;
    this.view = this.views[name]; this.view.position.z = 0;
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.35; engine.rig.jolt = 0.25;
    engine.rig.set({ pos: [0, 0, 0], look: [0.04, -0.07, -2], fov: 42 });
    this.show('street');
    prewarm(engine);
    audio.rain(0.5, 0.8); audio.roof(0.3); audio.carEngine(0.8, 0.5); audio.scape('kotse');
  },
  exit() { audio.layer('roof', 0); audio.layer('carEngine', 0); audio.scape(null); },

  update(dt, t, raw) {
    if (this.view) { this.view.update(t); this.view.position.z += this.drive * dt; }
    this.rain.update(t, this.engine.camera);
    this.glass.update(t, innerWidth, innerHeight, this.engine.camera);
    // the blades: the same sweep the water is cleared by, and when they're switched off they run home and park
    const u = this.glass.uniforms, W = 2 * PI / u.uWipeT.value;
    for (let i = 0; i < 2; i++) {
      const run = MID + AMP * Math.sin(W * (t + i * 0.05));
      this.bladeAng[i] = this.wipersOn ? run : this.bladeAng[i] + (PARK - this.bladeAng[i]) * (1 - Math.exp(-5 * dt));
      this.wipers[i].rotation.z = -this.bladeAng[i];
    }
    u.uA1.value = this.bladeAng[0]; u.uA2.value = this.bladeAng[1];
    // hands on the wheel while you're driving, the wheel moving a little under them
    if (this.onWheel) {
      this.wheel.rotation.z = Math.sin(t * 0.7) * 0.05 + Math.sin(t * 1.9) * 0.012;
      const c = this.car;
      for (const [arm, a, e] of [[this.armL, -1.2, [-0.34, -0.62, 0.1]], [this.armR, 1.2, [0.34, -0.62, 0.1]]]) {
        _w.set(Math.sin(a) * 0.19, Math.cos(a) * 0.19, 0.022).applyEuler(this.wheel.rotation).add(this.wheel.position); c.localToWorld(_w);
        _e.set(...e); arm.reach(_w.clone().add(_u.set(-e[0] * 0.05, -0.02, 0.06)), _e, a > 0 ? 0.6 : -0.6);
      }
    }
  },

  /* ================= Part Three, in the car: he plays it himself ================= */
  async play(D, S) {
    const rig = this.engine.rig, g = this.glass.uniforms;
    const cam = (look, dur = 2.5, fov) => rig.move({ look, dur, fov });
    this.drive = 0.5; g.uWipe.value = 1; g.uWipeT.value = 1.35; this.wipersOn = true;
    this.onWheel = true; this.armL.visible = this.armR.visible = true;
    await D.black(false, 2.4);
    await D.say('', 'Malakas ang ulan. Nag-shortcut ka sa loob ng isang village sa San Francisco del Monte.');
    await D.wait(1.2);
    // every exit flooded
    const exit = async (name, line) => {
      await D.black(true, 0.5);
      this.show(name); this.drive = 0.6; rig.set({ look: name === 'exitB' ? [0.25, -0.05, -2] : [0.05, -0.08, -2], fov: 38 });
      await D.black(false, 0.8);
      await animate(k => { this.drive = 0.6 * (1 - k); }, 2.2, 'out');
      audio.tone(70, .5, { vol: .25 });
      await D.say('', line);
    };
    await exit('exitA', 'Sinubukan mong lumabas. Baha.');
    await exit('exitB', 'Sa kabilang daan. Baha rin.');
    await D.black(true, 0.5); this.show('street'); this.drive = 0; rig.set({ look: [0.04, -0.07, -2], fov: 42 }); await D.black(false, 0.8);
    await D.say('', 'Mataas pala ang gitna ng village. Lahat ng labasan, pababa. Lahat, lubog.');
    // parked: the wipers run home and the rain takes the glass back, drop by drop
    this.wipersOn = false; audio.carEngine(0.7, 0.2);
    animate(k => { g.uWipe.value = 1 - k; }, 6, 'sine');
    await D.say('', 'Nag-park ka. Naka-on ang makina.');
    await cam([-0.2, -0.1, -2], 3, 38);
    await D.wait(1.6);
    const pick = await D.choose(['Maghintay|Dito na lang sa kotse', 'Bumaba|Lumabas sa ulan'], { timer: 12, id: 'baba', def: 0 });
    S.baba = pick;
    if (pick === 0) {
      audio.rain(0.5, 0.2); audio.layer('roof', 0.2);
      await D.say('', D.lastTimedOut ? 'Hindi ka kumilos. Lumipas ang kalahating oras.' : 'Naghintay ka. Lumipas ang kalahating oras.', { hold: 3.2 });
      await D.say('', 'Nandoon pa rin ang tubig. Bumaba ka na rin.', { hold: 3 });
    }
    // the door: you turn to it, pull the handle, it swings out, rain and daylight come in
    audio.layer('carEngine', 0, null, 1.2);
    const u = this.engine.final.uniforms, arm = this.armL;
    this.onWheel = false; this.armR.visible = false;
    this.sideWorld.visible = true;
    await rig.move({ pos: [-0.07, -0.03, -0.02], look: [-1.0, -0.3, -0.34], dur: 2.0, fov: 52, e: 'inOut' });
    await D.wait(0.2);
    const w = new THREE.Vector3(), el = new THREE.Vector3(), reach = rest => {
      w.set(-0.03, -0.27, 0.3); this.door.localToWorld(w);
      el.set(-0.1, -0.62, 0.06).applyQuaternion(this.engine.camera.quaternion).add(this.engine.camera.position);
      if (rest) w.lerp(el.clone().add(new THREE.Vector3(-0.05, -0.4, 0.05)), rest);
      arm.reach(w, el, -1.2);
    };
    reach(1); arm.visible = true;
    await animate(k => reach(1 - k), 0.75, 'inOut');
    audio.tone(1200, 0.03, { vol: 0.08 }); audio.noiseHit(0.05, { f: 2400, vol: 0.14 }); audio.tone(240, 0.08, { vol: 0.2, to: 150, delay: 0.05 });
    await animate(k => { this.door.rotation.y = -0.05 * k; reach(); }, 0.16, 'out');
    audio.rain(1.2, 0.0); audio.layer('roof', 0, null, 0.4);
    await D.wait(0.18);
    animate(k => { this.door.rotation.y = -0.05 - 0.72 * k; this.dayLight.intensity = 2.2 + 14 * k; reach(); }, 1.4, 'out');
    await animate(k => { const w = k * k * k; u.uLift.value.set(this.grade.lift[0] + (1 - this.grade.lift[0]) * w, this.grade.lift[1] + (1 - this.grade.lift[1]) * w, this.grade.lift[2] + (1 - this.grade.lift[2]) * w); }, 1.5, 'linear');
    arm.visible = false;
  },
};
