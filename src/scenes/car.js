import * as THREE from 'three';
import { pbr, std, glow, box, cyl, at, canvasTex, envFrom } from '../engine/kit.js';
import { Person } from '../engine/person.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { animate } from '../engine/tween.js';
import { photo3d } from '../engine/photo3d.js';
import { glassPass } from '../engine/glass.js';

/* Aug 17, 2026: Prince's car. Camera = Keira in the passenger seat, at the origin, looking down -Z.
   The view through the windshield is the real photos (depth-mapped), so the photo cameras also sit at the origin. */
const PI = Math.PI;

export default {
  grade: { lift: [0.01, 0.015, 0.02], gain: [0.97, 1.0, 1.04], sat: 0.85, grain: 0.07, bloom: 0.22, bloomThreshold: 0.92, exposure: 0.88, vignette: 1.3 },

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
    const C = this.car = new THREE.Group(); S.add(C);
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
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.018, 10, 40), trim); wheel.position.set(-0.74, -0.24, -0.5); wheel.rotation.x = -0.45; C.add(wheel);
    // driver seat back + headrest
    C.add(at(box(0.5, 0.75, 0.12, fabric, 0.05), -0.74, -0.35, 0.22));
    C.add(at(box(0.26, 0.2, 0.1, fabric, 0.05), -0.74, 0.18, 0.24));
    // door + side window frame (right)
    C.add(at(box(0.06, 0.6, 1.2, trim), 0.78, -0.55, -0.1));

    // ---- Prince, driving (light blue shirt + lanyard, from the photos) ----
    const prince = this.prince = new Person({ h: 1.72, skin: 'tan', top: 0x8ab6dc, bottom: 0x23262b, hair: 'messy', build: 0.95, sleeve: 0.14 });
    prince.pose('sit', true).set({ shL: [-58, 0, 14], shR: [-56, 0, -12], elL: [-28, 0, 0], elR: [-30, 0, 0], neck: [4, 0, 0] }, true);
    prince.root.position.set(-0.74, -1.12, 0.12); prince.root.rotation.y = PI; C.add(prince.root);
    const lan = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 4, 24, PI * 1.2), std(0x1b2440)); lan.position.set(0, 0.25, 0.06); lan.rotation.set(0.25, 0, PI * 1.1 + 0.3); prince.chest.parent.add(lan);

    // rain outside the car
    this.rain = new Rain({ count: 9000, size: [18, 10, 26], speed: 9, opacity: 0.4, wind: [0.3, 0.8] }).exclude([-1.4, -1.3, -1.1], [1.0, 0.7, 1.3]);
    S.add(this.rain.mesh);

    this.glass = glassPass({ y0: 0.2, y1: 1.0 });
    this.passes = [this.glass];
    this.drive = 0;
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
    engine.rig.set({ pos: [0, 0, 0], look: [-0.12, -0.06, -2], fov: 42 });
    this.show('street');
    audio.rain(0.9, 0.75); audio.roof(0.45); audio.engine(0.35, 0.5);
  },
  exit() { audio.layer('roof', 0); audio.layer('engine', 0); },

  update(dt, t, raw) {
    if (this.view) { this.view.update(t); this.view.position.z += this.drive * dt; }
    this.rain.update(t, this.engine.camera);
    this.prince.update(dt, t);
    this.glass.update(t, innerWidth, innerHeight, this.engine.camera);
  },

  /* ================= Part Three, in the car ================= */
  async play(D, S) {
    const rig = this.engine.rig, g = this.glass.uniforms;
    const cam = (look, dur = 2.5, fov) => rig.move({ look, dur, fov });
    this.drive = 0.5; g.uWipe.value = 1; g.uWipeT.value = 1.6;
    await D.black(false, 2.4);
    await D.say('', 'Malakas ang ulan. Nag-shortcut si Prince sa loob ng isang village sa San Francisco del Monte.');
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
    await exit('exitA', 'Sinubukan naming lumabas. Baha.');
    await exit('exitB', 'Sa kabilang daan. Baha rin.');
    await D.black(true, 0.5); this.show('street'); this.drive = 0; await D.black(false, 0.8);
    await D.say('', 'Mataas pala ang gitna ng village. Lahat ng labasan, pababa. Lahat, lubog.');
    // parked
    g.uWipe.value = 0; audio.engine(0.3, 0.2);
    await D.say('', 'Nag-park kami. Naka-on ang makina.');
    await cam([-0.3, -0.12, -2], 3, 38);
    await D.wait(1.6);
    const pick = await D.choose(['Maghintay na lang sa kotse', 'Bumaba'], { id: 'baba' });
    if (pick === 0) {
      await cam([-0.12, -0.04, -2], 2.2, 42);
      await D.say('', 'Naghintay kami. Hindi tumitigil ang ulan.');
      await animate(k => { this.needle.rotation.z = 0.35 + k * 0.5; }, 3, 'inOut');
      this.prince.look(new THREE.Vector3(0.1, 0.0, 0.2), 0.8);
      await cam([-0.7, 0.0, -0.5], 2.0, 40);
      await D.say('Prince', "Sayang 'yung gas.");
      this.prince.look(null);
      await cam([-0.1, -0.05, -2], 2.0, 42);
      await D.say('Keira', 'Baba muna tayo?');
    }
    // the door
    audio.doorThud(); audio.rain(1.2, 0.0); audio.layer('roof', 0, null, 0.3);
    await rig.move({ look: [1.5, -0.1, -0.6], dur: 1.6, fov: 46 });
    await D.black(true, 1.0);
  },
};
