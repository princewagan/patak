import * as THREE from 'three';
import { pbr, std, glow, box, cyl, at, sign, canvasTex, envFrom, blob } from '../engine/kit.js';
import { Person } from '../engine/person.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { animate, moveTo, walkPath } from '../engine/tween.js';
import { makeStreet, Traffic } from './street.js';

const D2R = THREE.MathUtils.degToRad;
const PI = Math.PI;

/* Jeep interior coordinates: floor y=0, aisle along Z (front = -Z), benches at x = ±0.66.
   The jeep stays still and the street scrolls past. */
const W = 0.88, CEIL = 1.45, SEAT = 0.42;

function envelope(text, big = false) {
  const t = canvasTex(big ? 512 : 128, big ? 320 : 80, (c, w, h) => {
    c.fillStyle = '#ece6d6'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = big ? 3 : 1; c.beginPath(); c.moveTo(0, 0); c.lineTo(w / 2, h * 0.45); c.lineTo(w, 0); c.stroke();
    if (text) { c.fillStyle = 'rgba(40,40,48,.85)'; c.font = `${big ? 44 : 12}px "Segoe Print","Bradley Hand","Comic Sans MS",cursive`; c.textAlign = 'center'; c.fillText('Pang-kain lang po.', w / 2, h * 0.62); c.fillText('Salamat po.', w / 2, h * 0.82); }
    for (let i = 0; i < 60; i++) { c.fillStyle = `rgba(90,80,60,${Math.random() * .08})`; c.fillRect(Math.random() * w, Math.random() * h, 6, 6); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide }));
  m.castShadow = true; return m;
}

export default {
  dof: { focus: 1.2, aperture: 0.0035, maxblur: 0.007 },
  grade: { lift: [0.015, 0.022, 0.035], gain: [0.94, 1.0, 1.08], sat: 0.8, grain: 0.08, bloom: 0.32, bloomThreshold: 0.88, exposure: 0.72, vignette: 1.2 },

  async build(engine) {
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0x3c4650);
    S.fog = new THREE.FogExp2(0x3f4953, 0.05);
    S.environment = await envFrom(engine.renderer, '/tex/kloofendal_overcast_puresky_1k.hdr');
    S.environmentIntensity = 0.18;

    // ---------- light ----------
    S.add(new THREE.HemisphereLight(0x8ea2b8, 0x1a1816, 0.35));
    const sky = new THREE.DirectionalLight(0x9db0c8, 0.55); sky.position.set(-6, 10, 2); S.add(sky);
    const tubeL = []; for (const z of [-0.9, 0.9]) { const l = new THREE.PointLight(0xdcebff, 1.1, 3.4, 2); l.position.set(0, 1.36, z); S.add(l); tubeL.push(l); }
    tubeL[1].castShadow = true; tubeL[1].shadow.mapSize.set(1024, 1024); tubeL[1].shadow.bias = -0.002; tubeL[1].shadow.radius = 4;
    this.tubeL = tubeL;
    // passing street lamps (sweep through the windows)
    this.sweep = [new THREE.PointLight(0xffa04a, 0, 7, 1.6), new THREE.PointLight(0xfff0d0, 0, 7, 1.6)];
    this.sweep[0].position.set(2.6, 2.4, -8); this.sweep[1].position.set(-3.2, 0.6, -8); S.add(...this.sweep);

    // ---------- jeep body ----------
    const J = this.jeep = new THREE.Group(); S.add(J);
    const floorM = pbr('metal_plate', { repeat: [1.5, 4], metal: 0.6, rough: 0.8, color: 0x8a8d90 });
    const paint = pbr('metal_plate', { repeat: [2, 1], color: 0xb4b9be, rough: 0.55, metal: 0.85, noDiff: true, normalScale: 0.5 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.22 });
    const vinyl = pbr('leather_red_03', { repeat: [3, 1], color: 0x7a1d1c, rough: 0.55, noDiff: true, env: 1.5 });
    const dark = std(0x1d1f22, { rough: 0.6 });
    J.add(at(box(2 * W, 0.06, 4.3, floorM), 0, -0.03, 0));
    // benches
    for (const sx of [-1, 1]) {
      J.add(at(box(0.38, 0.09, 3.9, vinyl, 0.03), sx * 0.67, SEAT - 0.04, 0.05));
      J.add(at(box(0.36, SEAT - 0.08, 3.9, dark), sx * 0.68, (SEAT - 0.08) / 2, 0.05));
      J.add(at(box(0.07, 0.4, 3.9, vinyl, 0.025), sx * 0.85, 0.66, 0.05));
      J.add(at(box(0.03, 0.9, 4.3, paint), sx * (W + 0.02), 0.45, 0));           // lower shell
      J.add(at(box(0.03, 0.18, 4.3, paint), sx * (W + 0.02), CEIL - 0.08, 0));   // header strip
      J.add(at(box(0.05, 0.03, 4.3, chrome), sx * (W - 0.01), 0.885, 0));        // window sill
      for (const z of [-2.12, -1.4, -0.68, 0.04, 0.76, 1.48, 2.12]) J.add(at(box(0.05, 0.42, 0.06, paint), sx * (W + 0.01), 1.1, z)); // pillars
      // ceiling grab bar
      const bar = cyl(0.016, 0.016, 4.0, chrome, 10); bar.rotation.x = PI / 2; bar.position.set(sx * 0.4, CEIL - 0.1, 0.05); J.add(bar);
      // purple LED strip (very jeepney)
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 4), glow(0x9a46ff, 2.2)); led.position.set(sx * 0.7, CEIL - 0.03, 0.05); J.add(led);
      // roll-up trapal over the windows
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 10), std(0x1f3a5a, { rough: 0.8 })); tr.rotation.x = PI / 2; tr.position.set(sx * (W + 0.07), 1.33, 0); J.add(tr);
    }
    // roof + ceiling panel
    const ceil = pbr('painted_plaster_wall', { repeat: [1, 3], color: 0xd9d5cc, rough: 0.8 });
    J.add(at(box(2 * W + 0.1, 0.05, 4.4, ceil), 0, CEIL + 0.02, 0));
    // fluorescent tube
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.4, 10), glow(0xe8f2ff, 4)); tube.rotation.x = PI / 2; tube.position.set(0, CEIL - 0.03, 0); J.add(tube); this.tube = tube;
    // rear opening: side panels + header + step + grab pole
    for (const sx of [-1, 1]) J.add(at(box(0.44, CEIL, 0.04, paint), sx * 0.67, CEIL / 2, 2.17));
    J.add(at(box(2 * W, 0.22, 0.04, paint), 0, CEIL - 0.1, 2.17));
    J.add(at(box(0.9, 0.04, 0.3, floorM), 0, -0.32, 2.32));
    const pole = cyl(0.017, 0.017, 1.4, chrome, 10); pole.position.set(0.43, 0.72, 2.12); J.add(pole);
    // front divider with a window to the driver
    J.add(at(box(2 * W, 0.95, 0.05, paint), 0, 0.475, -2.17));
    for (const sx of [-1, 1]) J.add(at(box(0.3, 0.5, 0.05, paint), sx * 0.73, 1.2, -2.17));
    J.add(at(box(2 * W, 0.08, 0.05, chrome), 0, 0.97, -2.15));
    const barya = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.15), sign('', { w: 1024, h: 220, bg: '#f3e9c9', fg: '#b3191b', font: 'bold 92px Inter, sans-serif', lines: ['BARYA LANG PO SA UMAGA'] }));
    barya.position.set(0, 0.78, -2.14); J.add(barya);
    const god = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.08), sign('', { w: 1024, h: 160, bg: '#101010', fg: '#f5d24a', font: 'italic bold 84px Georgia, serif', lines: ['God Bless Our Trip'] }));
    god.position.set(0, 1.36, -2.14); J.add(god);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.07), sign('', { w: 512, h: 160, bg: '#f4f4f0', fg: '#1a1a1a', font: 'bold 70px Inter, sans-serif', lines: ['8  /  8'] }));
    cap.position.set(-W + 0.005, 1.38, 1.0); cap.rotation.y = PI / 2; J.add(cap);
    // driver cab
    const cab = new THREE.Group(); cab.position.z = -2.2; J.add(cab);
    cab.add(at(box(2 * W, 0.5, 0.5, dark), 0, 0.25, -1.1));      // dashboard
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.6), new THREE.MeshPhysicalMaterial({ color: 0x9fb4c4, roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.18 }));
    ws.position.set(0, 0.95, -1.3); ws.rotation.x = -0.25; cab.add(ws);
    cab.add(at(box(2 * W, 0.06, 1.4, ceil), 0, CEIL + 0.02, -0.7));
    for (const sx of [-1, 1]) cab.add(at(box(0.04, CEIL, 1.4, paint), sx * (W + 0.02), CEIL / 2, -0.7));
    const ros = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.004, 4, 24), std(0x6b4a2b)); ros.position.set(0, 1.15, -1.15); ros.scale.y = 1.8; cab.add(ros);
    const driver = new Person({ h: 1.66, skin: 'brown', top: 0x2f3b45, bottom: 0x2a2d33, hair: 'buzz', build: 1.1 });
    driver.pose('sit', true).set({ shL: [-50, 0, 10], shR: [-50, 0, -10], elL: [-40, 0, 0], elR: [-40, 0, 0] }, true);
    driver.root.position.set(-0.42, 0.08, -0.55); driver.root.rotation.y = PI; cab.add(driver.root);
    this.people = [driver];

    // ---------- passengers ----------
    const P = (o, x, z, pose, extra) => {
      const p = new Person(o); p.pose(pose, true); if (extra) p.set(extra, true);
      p.root.position.set(x, 0, z); p.root.rotation.y = x < 0 ? PI / 2 : -PI / 2; J.add(p.root); this.people.push(p); return p;
    };
    const LX = -0.73, RX = 0.73;
    this.l1 = P({ h: 1.7, skin: 'brown', top: 0x3b4a3a, bottom: 0x22262b, hair: 'short', build: 1.05, longSleeve: true }, LX, 1.45, 'sitSlump', { neck: [32, 0, 14] });
    this.l2 = P({ h: 1.58, skin: 'light', top: 0xdedad2, bottom: 0x2b3448, hair: 'long', build: 0.9 }, LX, 0.78, 'sit', { neck: [30, 0, 0], shL: [-26, 0, 10], elL: [-100, 10, 0], shR: [-22, 0, -10], elR: [-96, -10, 0] });
    this.l3 = P({ h: 1.7, skin: 'dark', top: 0x7b6a52, bottom: 0x3a3a36, hair: 'short', cap: 0x2a3550, build: 1.15 }, LX, 0.1, 'sit', { shL: [-28, 0, 22], shR: [-28, 0, -22], elL: [-105, 0, -40], elR: [-105, 0, 40], neck: [10, 0, 0] });
    this.l4 = P({ h: 1.62, skin: 'tan', top: 0x5a4d6b, bottom: 0x2c2c30, hair: 'short', hairColor: 0x5c5853, build: 1.0 }, LX, -0.57, 'sitSlump', { neck: [24, 0, -10] });
    this.l5 = P({ h: 1.55, skin: 'tan', top: 0x9c3b4a, bottom: 0x1f2329, hair: 'bun', build: 1.05 }, LX, -1.24, 'sit', { neck: [-4, -30, 0] });
    this.ale = P({ h: 1.55, skin: 'tan', top: 0x6b3550, bottom: 0x2a2627, hair: 'bun', hairColor: 0x2a2421, build: 1.15, belly: true }, RX, 0.6, 'sit', { neck: [6, 0, 0], shL: [-34, 0, 8], elL: [-60, 0, 0], shR: [-34, 0, -8], elR: [-60, 0, 0] });
    this.r3 = P({ h: 1.72, skin: 'tan', top: 0x202326, bottom: 0x2b3448, hair: 'messy', build: 0.95 }, RX, -0.1, 'sit', { neck: [18, 0, 0] });
    this.r4 = P({ h: 1.58, skin: 'light', top: 0x4f6f7f, bottom: 0x2a2a2a, hair: 'long', build: 1 }, RX, -0.78, 'sitSlump', { neck: [30, 0, 18] });
    this.r5 = P({ h: 1.68, skin: 'brown', top: 0x8a8070, bottom: 0x2d2a25, hair: 'short', build: 1.1 }, RX, -1.45, 'sit', {});
    // phone glow on l2's face
    const ph = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.01), glow(0xbfd6ff, 1.4)); ph.position.set(0, -0.06, 0.03); ph.rotation.x = -0.6; this.l2.arm.L.wr.add(ph);
    const phl = new THREE.PointLight(0xa8c4ff, 0.25, 0.8, 2); phl.position.set(0, 0.05, 0.08); this.l2.arm.L.wr.add(phl);
    // ale's bayong bag + umbrella
    const bay = box(0.32, 0.26, 0.16, std(0x9a7a46, { rough: 1 })); bay.position.set(0, 0.6, 0.27); this.ale.root.add(bay);
    const umb = cyl(0.03, 0.012, 0.8, std(0x1c2a3c, { rough: 0.3 })); umb.position.set(0.22, 0.4, 0.33); umb.rotation.z = 0.2; this.ale.root.add(umb);

    // ---------- you ----------
    const you = this.you = new Person({ h: 1.7, skin: 'tan', top: 0x5d6670, bottomMat: pbr('denim_fabric', { repeat: [2, 2], color: 0x5a6c8a }), hair: 'short', build: 1 });
    you.pose('sit', true).set({ shL: [-30, 0, 12], elL: [-70, 0, 0], shR: [-26, 0, -12], elR: [-74, 0, 0] }, true);
    you.root.position.set(RX, 0, 1.3); you.root.rotation.y = -PI / 2; J.add(you.root);
    you.head.visible = false; you.arm.L.sh.visible = false; you.arm.R.sh.visible = false;
    this.people.push(you);
    // your phone with the scam text
    const scam = canvasTex(256, 512, (c, w, h) => {
      c.fillStyle = '#0d0f12'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e9edf2'; c.font = '600 20px Inter'; c.fillText('6:42', 18, 34);
      c.fillStyle = '#1f2630'; c.beginPath(); c.roundRect(14, 70, w - 28, 170, 14); c.fill();
      c.fillStyle = '#9fb3c8'; c.font = '600 15px Inter'; c.fillText('Mensahe · +63 917 ••• 4821', 28, 98);
      c.fillStyle = '#e9edf2'; c.font = '17px Inter';
      ['CONGRATS! Nanalo ang', 'number mo ng P25,000.', 'I-claim dito bago', 'mag-expire: bit.ly/...'].forEach((l, i) => c.fillText(l, 28, 130 + i * 25));
    });
    const phone = this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.15, 0.009), [std(0x111), std(0x111), std(0x111), std(0x111), new THREE.MeshBasicMaterial({ map: scam }), std(0x111)]);
    phone.position.set(0.05, -0.1, -0.34); phone.rotation.set(-0.18, -0.12, 0.02); this.held = new THREE.Group(); this.held.add(phone); S.add(this.held);
    const thumbL = new THREE.PointLight(0xbfd6ff, 0.35, 0.9, 2); thumbL.position.set(0.05, -0.05, -0.25); phone.parent.add(thumbL); this.phoneLight = thumbL; thumbL.visible = false;
    phone.visible = false;
    // envelopes on laps
    this.laps = [];
    for (const p of [this.l1, this.l2, this.l3, this.l4, this.l5, this.ale, this.r3, this.r4, this.r5]) {
      const e = envelope(false); e.rotation.x = -PI / 2; e.position.set(0, 0.5, 0.25); e.visible = false; p.root.add(e); this.laps.push(e);
    }
    this.myEnv = envelope(true); this.myEnv.rotation.set(-PI / 2 + 0.35, 0, 0); this.myEnv.position.set(0, 0.52, 0.27); this.myEnv.visible = false; you.root.add(this.myEnv);
    this.coin = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.003, 20), new THREE.MeshStandardMaterial({ color: 0xd8c27a, metalness: 1, roughness: 0.3 }));
    this.coin.visible = false; this.held.add(this.coin); this.coin.position.set(0.02, -0.16, -0.3); this.coin.rotation.set(1.2, 0, 0.3);

    // ---------- the boy ----------
    const boy = this.boy = new Person({ h: 1.24, skin: 'brown', top: 0xb9b19c, bottom: 0x2e3238, hair: 'messy', build: 0.82, shorts: true, barefoot: true, sleeve: 0.12 });
    boy.root.position.set(0.1, -0.8, 4.2); J.add(boy.root); this.people.push(boy);
    const rag = box(0.12, 0.02, 0.09, std(0x6d6a63, { rough: 1 })); rag.position.set(0, -0.09, 0.02); boy.arm.R.wr.add(rag);
    const stack = box(0.1, 0.03, 0.16, std(0xe8e2d2, { rough: 0.9 })); stack.position.set(0, -0.08, 0.03); stack.rotation.x = -0.3; boy.arm.L.wr.add(stack); this.stack = stack;
    const wetHair = boy.hair.children[0]; if (wetHair) wetHair.material = wetHair.material.clone(), wetHair.material.roughness = 0.25;
    this.extraKids = [0x6d5a4a, 0x2e4a6b].map((c, i) => { const k = new Person({ h: 1.18 + i * 0.06, skin: 'brown', top: c, bottom: 0x24272b, hair: 'messy', shorts: true, barefoot: true, build: 0.8 }); k.root.position.set(1.6 + i * 0.4, -0.8, 3.5 + i); k.root.visible = false; S.add(k.root); this.people.push(k); return k; });

    // ---------- outside ----------
    this.street = makeStreet({ L: 88, ground: -0.8, roadX: -4.6, laneW: 6.2, seed: 11, night: 0.45 }); S.add(this.street);
    this.oncoming = new Traffic({ x: -7.0, y: -0.8, count: 6, L: 140, dir: 1 }); S.add(this.oncoming.group);
    this.oncoming2 = new Traffic({ x: -9.6, y: -0.8, count: 4, L: 140, dir: 1 }); S.add(this.oncoming2.group);
    const follow = new THREE.Group(); // tricycle behind us, headlight glaring in
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glow(0xfff2d8, 6)); hl.position.y = 0.2; follow.add(hl);
    const hlL = new THREE.PointLight(0xfff0d8, 1.4, 9, 2); hlL.position.set(0, 0.2, -0.3); follow.add(hlL);
    follow.add(at(box(1.1, 1.2, 1.8, std(0x15161a, { rough: 0.4, metal: 0.4 }), 0.12), 0, 0.15, 1.0));
    follow.position.set(0.4, -0.3, 12.5); S.add(follow); this.follow = follow;
    this.rain = new Rain({ count: 12000, size: [26, 14, 30], speed: 10, opacity: 0.28, wind: [0.4, 1.2] }).exclude([-W - 0.05, -0.1, -3.6], [W + 0.05, CEIL + 0.1, 2.2]);
    S.add(this.rain.mesh);
    const dripG = new THREE.BufferGeometry(); const dn = 70, dp = new Float32Array(dn * 3); this.dripSeed = [];
    for (let i = 0; i < dn; i++) { const sx = i % 2 ? 1 : -1; dp.set([sx * (W + 0.06), 1.3, -2 + Math.random() * 4], i * 3); this.dripSeed.push(Math.random()); }
    dripG.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.drips = new THREE.Points(dripG, new THREE.PointsMaterial({ color: 0xc8d8e4, size: 0.012, transparent: true, opacity: 0.8 }));
    S.add(this.drips);
    this.speed = 7; this.targetSpeed = 7; this.offset = 0;
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.7; engine.rig.jolt = 1;
    engine.rig.set({ pos: [0.66, 1.13, 1.3], look: [-1, 0.98, 1.2], fov: 50 });
    audio.rain(0.8, 0.35); audio.roof(0.7); audio.engine(1, 1); audio.traffic(0.6);
  },
  exit() { audio.layer('roof', 0); audio.layer('engine', 0); audio.layer('traffic', 0); },

  update(dt, t) {
    this.speed += (this.targetSpeed - this.speed) * (1 - Math.exp(-0.8 * dt));
    this.offset += this.speed * dt;
    const L = this.street.userData.L; this.street.position.z = this.offset % L;
    this.oncoming.update(dt, this.speed); this.oncoming2.update(dt, this.speed);
    this.follow.position.y = -0.3 + Math.sin(t * 9) * 0.01;
    this.engine.rig.jolt = 0.25 + this.speed / 7 * 0.9;
    // street-lamp light sweeps through the windows (pole spacing 22 m)
    const ph = (this.offset % 22) / 22;
    this.sweep[0].position.z = -9 + ph * 18; this.sweep[0].intensity = this.speed > 0.5 ? 9 * Math.sin(ph * PI) : 3;
    const ph2 = ((this.offset * 1.7 + 7) % 30) / 30;
    this.sweep[1].position.z = -9 + ph2 * 18; this.sweep[1].intensity = this.speed > 0.5 ? 4 * Math.sin(ph2 * PI) : 0;
    // fluorescent flicker
    const fl = Math.random() < 0.012 ? 0.4 : 1; this.tubeL.forEach(l => { const d = l.userData.dim ?? 1; l.userData.k = (l.userData.k ?? 1) + (d - (l.userData.k ?? 1)) * 0.05; l.intensity = 1.1 * fl * l.userData.k; });
    this.rain.update(t, this.engine.camera);
    const dp = this.drips.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) { const k = (t * (0.9 + this.dripSeed[i]) + this.dripSeed[i] * 7) % 1; dp.setY(i, 1.3 - k * k * 1.6); dp.setZ(i, dp.getZ(i) + this.speed * dt * 0.02 * (dp.getZ(i) > 2.1 ? -200 : 1)); }
    dp.needsUpdate = true;
    for (const p of this.people) p.update(dt, t);
    this.held.position.copy(this.engine.camera.position); this.held.quaternion.copy(this.engine.camera.quaternion);
    // light sway of everyone with the jeep
    this.jeep.rotation.z = Math.sin(t * 0.7) * 0.004 * this.speed / 7;
  },

  /* ================= the chapter ================= */
  cam(pos, look, dur = 2.5, fov, e) { return this.engine.rig.move({ pos, look, dur, fov, e }); },
  resetBoy() {
    const boy = this.boy; boy.anim = null; boy.look(null); boy.expression({}); boy.pose('stand', true);
    boy.root.position.set(0.1, -0.8, 4.2); boy.root.rotation.y = PI;
    this.laps.forEach(e => (e.visible = false)); this.myEnv.visible = false;
  },
  wipeAnim(p, rate = 9) { p.anim = (t, q) => { q.arm.R.sh.rotation.x = -1.15 + Math.sin(t * rate) * 0.25; q.arm.R.el.rotation.x = -0.55 + Math.sin(t * rate + 1) * 0.3; }; },

  /** boy climbs in at the back */
  async board(D) {
    const boy = this.boy;
    this.targetSpeed = 0; audio.engine(1, 0.3);
    await D.wait(1.6);
    this.cam([0.62, 1.13, 1.32], [-0.1, 0.55, 2.6], 2.6, 48);
    await walkPath(boy, [[0.1, -0.8, 2.9], [0.05, -0.3, 2.35]], 1.2);
    await walkPath(boy, [[0.0, 0.0, 1.85]], 1.0);
    this.targetSpeed = 6; audio.engine(1, 1);
  },
  /** he wipes your shoes and leaves the envelope on your lap */
  async atYourFeet(D, line = true) {
    const boy = this.boy;
    boy.root.position.set(0.02, 0, 1.3); boy.root.rotation.y = PI / 2; boy.pose('crouch', true); boy.look(null);
    boy.set({ neck: [30, 0, 0] }); this.wipeAnim(boy, 8);
    this.engine.dof({ focus: 1.0, aperture: 0.004 });
    await this.cam([0.64, 1.12, 1.3], [0.12, 0.05, 1.32], 2.4, 46);
    if (line) await D.say('', 'Pinunasan niya ang sapatos mo.'); else await D.wait(2.2);
    boy.anim = null; boy.set({ shL: [-80, 0, 0], elL: [-10, 0, 0], neck: [10, 0, 0] });
    await D.wait(0.7);
    this.myEnv.visible = true; audio.paper();
    boy.set({ shL: [-50, 0, 10], elL: [-30, 0, 0] });
    this.engine.dof({ focus: 0.75, aperture: 0.004 });
    this.cam([0.64, 1.12, 1.3], [0.38, 0.5, 1.29], 2.0, 34);
    await moveTo(boy.root, [0, 0, -0.6], 2.2);
    boy.pose('stand'); boy.root.position.set(0, 0, -1.9);
  },
  /** he comes back down the aisle collecting, then stands at your knees, backlit by the rear opening */
  async collect(D) {
    const boy = this.boy;
    boy.root.rotation.y = 0; boy.pose('stand');
    this.engine.dof({ target: boy.head, aperture: 0.003 });
    this.cam([0.66, 1.13, 1.3], [-0.2, 0.9, -0.2], 2, 46);
    for (const [i, z] of [[4, -1.25], [8, -1.45], [3, -0.57], [7, -0.78], [2, 0.1], [5, 0.6], [1, 0.78]]) {
      await walkPath(boy, [[0, 0, z]], 1.5);
      boy.set({ shL: [-60, 0, 0], spine: [20, 0, 0] }); await D.wait(0.22); this.laps[i].visible = false; audio.paper(); boy.set({ shL: [-10, 0, 0], spine: [0, 0, 0] }); await D.wait(0.08);
    }
    await walkPath(boy, [[0.0, 0, 1.25], [0.05, 0, 1.78]], 1.3);
    this.laps[0].visible = false;
    boy.root.rotation.y = 2.05; boy.pose('stoop'); boy.set({ shL: [-55, 0, 6], elL: [-30, 0, 0] });
    boy.look(new THREE.Vector3(0.7, 1.1, 1.3), 1); boy.expression({ worry: 0.6 });
    this.tubeL[1].userData.dim = 0.35;
    this.cam([0.66, 1.1, 1.28], [0.02, 0.98, 1.95], 1.6, 40);
    await D.wait(1.0);
  },
  async hopOff(D) {
    const boy = this.boy;
    this.tubeL[1].userData.dim = 1;
    this.targetSpeed = 0; audio.engine(1, 0.3);
    boy.pose('stand'); boy.look(null); boy.expression({});
    this.cam([0.62, 1.13, 1.32], [-0.1, 0.6, 2.8], 2.2, 48);
    await walkPath(boy, [[0, 0, 1.95], [0.05, -0.3, 2.35], [0.3, -0.8, 3.2], [1.6, -0.8, 5.5]], 1.3);
    this.targetSpeed = 7; audio.engine(1, 1);
  },

  async play(D, S, beat) {
    if (beat === 'montage') return this.montage(D, S);
    if (beat === 'again') return this.again(D, S);
    const boy = this.boy;
    this.resetBoy();
    await D.black(false, 2.2);
    await D.wait(1.5);
    // phone buzzes: a scam text
    this.phone.visible = true; this.phoneLight.visible = true;
    this.engine.dof({ focus: 0.34, aperture: 0.006 });
    audio.tone(180, .25, { type: 'square', vol: .03 }); audio.tone(180, .25, { type: 'square', vol: .03, delay: .35 });
    await this.cam([0.66, 1.13, 1.3], [0.2, 0.85, 1.32], 1.6, 46);
    await D.wait(1.6);
    await D.say('', 'Text na naman.');
    this.phone.visible = false; this.phoneLight.visible = false; this.engine.dof({ focus: 1.2, aperture: 0.0035 });
    await this.cam([0.66, 1.13, 1.3], [-1, 0.98, 1.1], 2.2, 50);
    await D.wait(0.6);

    await this.board(D);
    boy.pose('crouch'); boy.root.rotation.y = -PI / 2; boy.look(this.l1.head, 0.6);
    await D.say('', 'May batang sumakay. Walang tsinelas, basang-basa.');
    this.wipeAnim(boy);
    this.engine.dof({ target: boy.head, aperture: 0.004 });
    await this.cam([0.6, 1.1, 1.36], [-0.25, 0.22, 1.6], 2.4, 44);
    await D.say('', 'Isa-isa niyang pinupunasan ang sapatos ng mga pasahero.');
    this.laps[0].visible = true; audio.paper();
    boy.anim = null;
    this.cam([0.66, 1.13, 1.3], [-1, 1.0, 0.6], 2.5, 50);
    await moveTo(boy.root, [0, 0, 0.9], 1.6);
    [1, 5, 2, 3, 4, 7, 8].forEach(i => (this.laps[i].visible = true));
    await D.wait(1.0);
    await this.atYourFeet(D);
    await D.wait(0.4);
    await D.say('', '<em>"Pang-kain lang po. Salamat po."</em>', { hold: 3.2 });
    // the ale
    this.ale.look(new THREE.Vector3(0.7, 1.1, 1.3), 1); this.ale.set({ spine: [0, -12, 0] });
    this.engine.dof({ target: this.ale.head, aperture: 0.003 });
    await this.cam([0.66, 1.13, 1.3], [0.62, 1.02, 0.5], 1.8, 44);
    await D.say('Ale', "'Wag mong bigyan. Sindikato 'yan.");
    this.ale.set({ spine: [0, 0, 0] }); this.ale.look(null);
    this.engine.dof({ focus: 0.75, aperture: 0.004 });
    await this.cam([0.66, 1.13, 1.3], [0.4, 0.52, 1.3], 1.6, 40);
    await D.say('', "₱160 ang laman ng wallet mo. Pamasahe at pagkain mo na 'yan hanggang Biyernes.");

    await this.collect(D);
    const pick = await D.choose(['Lagyan ng bente', 'Ibalik nang walang laman'], { timer: 10, id: 'sobre', def: 1 });
    const gave = pick === 0;
    S.sobre = gave;
    if (gave) {
      S.wallet -= 20;
      this.coin.visible = true; this.engine.dof({ focus: 0.4, aperture: 0.005 });
      await animate(k => { this.coin.position.y = -0.16 - k * 0.12; this.coin.rotation.x = 1.2 + k * 3; }, 0.9, 'in');
      audio.coin(); this.coin.visible = false; this.coin.position.y = -0.16;
      this.engine.dof({ target: boy.head, aperture: 0.003 });
      await D.wait(0.5); this.myEnv.visible = false; audio.paper();
      boy.set({ shL: [-30, 0, 6], elL: [-80, 0, 0], neck: [26, 0, 0] }); boy.look(null);
      await D.wait(1.2);
      boy.set({ neck: [-14, 0, 0] }); boy.look(new THREE.Vector3(0.7, 1.12, 1.3), 1); boy.expression({ smile: 1 });
      boy.anim = (t, q) => { q.hips.position.y += Math.max(0, Math.sin(t * 7)) * 0.012; };
      await D.say('Bata', 'Salamat po, kuya.');
      boy.anim = null;
      D.patak('Totoy', 'napangiti');
    } else {
      await D.wait(0.7); this.myEnv.visible = false; audio.paper();
      boy.look(null); boy.set({ neck: [34, 0, 0], spine: [8, 0, 0] }); boy.expression({ sad: 0.8 });
      await D.wait(1.4);
      await D.say('', D.lastTimedOut ? 'Hindi ka nakapagdesisyon. Kinuha niya ang sobre.' : 'Kinuha niya ang sobre nang hindi ka tinitingnan.');
      D.patak('Totoy', 'hindi ka na tiningnan');
    }
    await this.hopOff(D);
    await D.wait(1.5);
    await D.black(true, 1.6);
  },

  /** Part Two: the next morning, nothing changed */
  async montage(D, S) {
    this.resetBoy(); this.offset += 40;
    this.engine.rig.set({ pos: [0.66, 1.13, 1.3], look: [-1, 0.98, 1.1], fov: 50 });
    await D.black(false, 1.2);
    await this.board(D);
    this.myEnv.visible = false;
    await this.atYourFeet(D, false);
    await D.say('', S.sobre ? 'Parehong bata. Parehong sobre. Hindi ka niya naaalala.' : 'Parehong bata. Parehong sobre.');
    // two more kids running for the jeep behind us
    for (const k of this.extraKids) { k.root.visible = true; }
    this.engine.dof({ focus: 6, aperture: 0.002 });
    await this.cam([0.62, 1.13, 1.32], [0.2, 0.4, 6], 1.8, 44);
    await Promise.all(this.extraKids.map((k, i) => walkPath(k, [[0.9 + i * 0.5, -0.8, 6.5], [0.5 + i * 0.3, -0.8, 11.2]], 2.2)));
    await D.say('', 'Sa kasunod na jeep, dalawa pang bata ang sumakay.');
    await D.black(true, 0.8);
    for (const k of this.extraKids) k.root.visible = false;
  },

  /** Part Four: Thursday. Same choice, no outcome shown. Returns the pick. */
  async again(D, S) {
    this.resetBoy(); this.offset += 80;
    this.engine.rig.set({ pos: [0.66, 1.13, 1.3], look: [-1, 0.98, 1.1], fov: 50 });
    await D.black(false, 1.4);
    await this.board(D);
    await this.atYourFeet(D, false);
    await this.collect(D);
    const pick = await D.choose(['Lagyan ng bente', 'Ibalik nang walang laman'], { timer: 10, id: 'ulit', def: 1 });
    if (pick === 0) { this.coin.visible = true; await animate(k => { this.coin.position.y = -0.16 - k * 0.12; this.coin.rotation.x = 1.2 + k * 3; }, 0.9, 'in'); audio.coin(); this.coin.visible = false; this.coin.position.y = -0.16; }
    await D.black(true, 1.4);
    return pick;
  },
};
