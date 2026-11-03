import * as THREE from 'three';
import { prewarm } from '../engine/prewarm.js';
import { pbr, std, glow, box, cyl, at, canvasTex, envFrom } from '../engine/kit.js';
import { Person } from '../engine/person.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { cast } from '../engine/cast.js';
import { animate } from '../engine/tween.js';
import { photo3d } from '../engine/photo3d.js';
import { glassPass } from '../engine/glass.js';
import { povArm, dropsTexture } from './labas.js';

/* Aug 17, 2026: Prince's car. Camera = Keira in the passenger seat, at the origin, looking down -Z.
   The view through the windshield is the real photos (depth-mapped), so the photo cameras also sit at the origin. */
const PI = Math.PI;

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
    // passenger door, hinged at its front edge; everything on it swings out together
    const door = this.door = new THREE.Group(); door.position.set(0.74, 0, -0.78); C.add(door);
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
    // pillar behind the door, roof edge, the seat she is leaving
    C.add(at(box(0.09, 1.0, 0.1, trim), 0.76, -0.02, 0.5), at(box(0.1, 0.1, 1.5, fabric), 0.82, 0.46, -0.2));
    // what is out that side: the wet side of the street, only ever seen soft through glass and rain
    const sideM = new THREE.MeshBasicMaterial({ map: canvasTex(1024, 512, (c, w, h) => {
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#d7e1ea'); g.addColorStop(0.46, '#c3cfd9'); g.addColorStop(0.47, '#5f6a70'); g.addColorStop(0.62, '#4b5358'); g.addColorStop(0.63, '#646b6e'); g.addColorStop(1, '#3b4145'); c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.filter = 'blur(26px)';
      for (const [x, wd, top, col] of [[20, 300, 90, '#6f6c68'], [340, 240, 40, '#85827b'], [600, 420, 110, '#63666a'], [860, 200, 60, '#77746f']]) { c.fillStyle = col; c.fillRect(x, top, wd, h * 0.56 - top); }
      for (let i = 0; i < 14; i++) { c.fillStyle = 'rgba(46,54,48,.4)'; c.beginPath(); c.arc(Math.random() * w, h * 0.46 + Math.random() * 40, 30 + Math.random() * 50, 0, 7); c.fill(); }
    }), side: THREE.BackSide, fog: false, color: new THREE.Color(2.4, 2.4, 2.4) });
    const side = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 16, 48, 1, true, PI * 0.19, PI * 0.57), sideM); side.position.y = 0.6; side.visible = false; S.add(side); this.sideWorld = side;
    this.arm = povArm(); S.add(this.arm);
    this.dayLight = new THREE.PointLight(0xdfe8f2, 2.2, 7, 1.2); this.dayLight.position.set(1.5, 0.3, -0.1); S.add(this.dayLight);

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
    prewarm(engine);
    audio.rain(0.5, 0.8); audio.roof(0.3); audio.carEngine(0.8, 0.5); audio.scape('kotse');
  },
  exit() { audio.layer('roof', 0); audio.layer('carEngine', 0); audio.scape(null); },

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
    cast(D).remind('Keira at Prince', 'Kami na ito. Ikaw ngayon si Keira. Si Prince ang nagda-drive.', 7);
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
    g.uWipe.value = 0; audio.carEngine(0.7, 0.2);
    await D.say('', 'Nag-park kami. Naka-on ang makina.');
    await cam([-0.3, -0.12, -2], 3, 38);
    await D.wait(1.6);
    const pick = await D.choose(['Maghintay|Dito na lang sa kotse', 'Bumaba|Lumabas sa ulan'], { timer: 12, id: 'baba', def: 0 });
    // whatever he picks, the game shows what we really did, then we go down anyway
    await D.stats('Ang pinili namin', [
      { label: 'Maghintay', pct: 100, who: 'Keira · Prince', you: pick === 0 },
      { label: 'Bumaba', pct: 0, you: pick === 1 },
    ]);
    await D.black(true, 1.0);
    audio.rain(0.5, 0.2); audio.layer('roof', 0.2);
    await D.lines([
      { t: 'Naghintay kami sa kotse. Nanood ng isang episode ng <i>Brooklyn Nine-Nine</i>.', alone: true },
      { t: 'Pagkalipas ng 30 minuto, nagbigay ng suhestiyon si Keira.', alone: true },
    ]);
    await D.lines([{ t: '“Maybe we should go down.”', hold: 2.8 }, { t: '“Yeah, you’re right.”', hold: 2.8 }]);
    await D.black(false, 1.0);
    // the door: she turns to it, pulls the handle, it swings out, rain and daylight come in
    audio.layer('carEngine', 0, null, 1.2);
    const u = this.engine.final.uniforms, arm = this.arm;
    this.prince.look(null);
    this.sideWorld.visible = true;
    await rig.move({ pos: [0.07, -0.03, -0.02], look: [1.0, -0.3, -0.34], dur: 2.0, fov: 52, e: 'inOut' });
    await D.wait(0.2);
    const w = new THREE.Vector3(), el = new THREE.Vector3(), reach = rest => {
      w.set(-0.03, -0.27, 0.3); this.door.localToWorld(w);
      el.set(0.3, -0.7, 0.1).applyQuaternion(this.engine.camera.quaternion).add(this.engine.camera.position);
      if (rest) w.lerp(el.clone().add(new THREE.Vector3(0.05, -0.4, 0.05)), rest);
      arm.reach(w, el, 1.2);
    };
    reach(1); arm.visible = true;
    await animate(k => reach(1 - k), 0.75, 'inOut');
    audio.tone(1200, 0.03, { vol: 0.08 }); audio.noiseHit(0.05, { f: 2400, vol: 0.14 }); audio.tone(240, 0.08, { vol: 0.2, to: 150, delay: 0.05 });
    await animate(k => { this.door.rotation.y = 0.05 * k; reach(); }, 0.16, 'out');
    audio.rain(1.2, 0.0); audio.layer('roof', 0, null, 0.4);
    await D.wait(0.18);
    animate(k => { this.door.rotation.y = 0.05 + 0.72 * k; this.dayLight.intensity = 2.2 + 14 * k; reach(); }, 1.4, 'out');
    await animate(k => { const w = k * k * k; u.uLift.value.set(this.grade.lift[0] + (1 - this.grade.lift[0]) * w, this.grade.lift[1] + (1 - this.grade.lift[1]) * w, this.grade.lift[2] + (1 - this.grade.lift[2]) * w); }, 1.5, 'linear');
    arm.visible = false;
  },
};
