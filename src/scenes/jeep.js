import * as THREE from 'three';
import { pbr, std, glow, box, cyl, at, sign, canvasTex, envFrom, blob, beam, halo } from '../engine/kit.js';
import { Person } from '../engine/person.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { cast } from '../engine/cast.js';
import { pesoCoin } from '../engine/money.js';
import { animate, moveTo, walkPath } from '../engine/tween.js';
import { makeStreet, Traffic } from './street.js';
import { makePhone } from './phone.js';
import { prewarm } from '../engine/prewarm.js';
import { povArm } from './labas.js';
import { JeepStop } from './jeepstop.js';
import { preloadReal } from '../engine/realbody.js';

const D2R = THREE.MathUtils.degToRad;
const PI = Math.PI;
const _w = new THREE.Vector3();

/* Jeep interior coordinates: floor y=0, aisle along Z (front = -Z), benches at x = ±0.66.
   The jeep stays still and the street scrolls past. */
const W = 0.88, CEIL = 1.45, SEAT = 0.42, RX_UMB = 0.44;

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

/** a crumpled cloth, not a brick */
function rag(mat) {
  const g = new THREE.IcosahedronGeometry(0.05, 3), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.22 * Math.sin(x * 60 + y * 41) * Math.cos(z * 53 + x * 23); p.setXYZ(i, x * k * 1.25, y * k * 0.5, z * k); }
  g.computeVertexNormals(); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}

/** the same rag tucked into the back of his shorts: a corner pushed under the waistband, the rest hanging in soft folds over his seat */
function tuckedRag(mat) {
  const w = 0.1, h = 0.17, g = new THREE.PlaneGeometry(w, h, 10, 14), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), d = (h / 2 - y) / h;   // 0 at the waistband, 1 at the hem
    p.setXYZ(i, x * (1 - 0.35 * (1 - d)), y - h / 2, Math.sin(x * 70 + d * 3) * 0.007 * d + Math.sin(x * 160) * 0.002 + d * d * 0.012);
  }
  g.translate(0, h / 2 - 0.02, 0); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat.clone()); m.material.side = THREE.DoubleSide; m.castShadow = true;
  return m;
}

/** a woven bayong: tapered, soft-cornered, with two handles */
function bayong() {
  const G = new THREE.Group();
  const weave = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#9a7a46'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#b08f58' : '#7f6236'; c.fillRect(x * 16 + 1, y * 16 + 1, 14, 14); }
  });
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping; weave.repeat.set(3, 1.6);
  const m = new THREE.MeshStandardMaterial({ map: weave, roughness: 0.95 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.24, 28, 1, true), m); body.scale.z = 0.5; body.castShadow = true; G.add(body);
  const lid = new THREE.Mesh(new THREE.CircleGeometry(0.165, 28), std(0x3a2d1b, { rough: 1 })); lid.rotation.x = -PI / 2; lid.scale.y = 0.5; lid.position.y = 0.105; G.add(lid);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.14, 28), m); bottom.rotation.x = PI / 2; bottom.scale.y = 0.5; bottom.position.y = -0.12; G.add(bottom);
  for (const z of [-0.075, 0.075]) { const h = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.006, 6, 18, PI), std(0x5a4526, { rough: 0.9 })); h.position.set(0, 0.115, z); G.add(h); }
  return G;
}

export default {
  dof: { focus: 1.2, aperture: 0.0035, maxblur: 0.007 },
  grade: { lift: [0.0, 0.016, 0.026], gain: [0.8, 0.98, 1.1], sat: 1.1, grain: 0.07, bloom: 0.34, bloomThreshold: 0.86, exposure: 0.68, vignette: 1.05, black: 0.02, gamma: 1.3, curve: 0.5 },

  async build(engine) {
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0x3c4650);
    S.fog = new THREE.FogExp2(0x3f4953, 0.05);
    S.environment = await envFrom(engine.renderer, '/tex/kloofendal_overcast_puresky_1k.hdr');
    S.environmentIntensity = 0.18;

    // ---------- light ----------
    this.hemi = new THREE.HemisphereLight(0x8ea2b8, 0x1a1816, 0.35); S.add(this.hemi);
    const sky = this.sky = new THREE.DirectionalLight(0x9db0c8, 0.55); sky.position.set(-6, 10, 2); S.add(sky);
    const tubeL = []; for (const z of [-0.9, 0.9]) { const l = new THREE.PointLight(0xdcebff, 1.1, 3.4, 2); l.position.set(0, 1.36, z); S.add(l); tubeL.push(l); }
    tubeL[1].castShadow = true; tubeL[1].shadow.mapSize.set(1024, 1024); tubeL[1].shadow.bias = -0.002; tubeL[1].shadow.radius = 4;
    this.tubeL = tubeL;
    // low along the aisle, so the boy at everyone's feet can actually be seen; it dims with the tubes for his silhouette
    this.aisle = [[0, 1.34, 1.5], [0, 1.34, -0.4]].map(([x, y, z]) => { const l = new THREE.PointLight(0xd6e4f5, 2.2, 5, 1.4); l.position.set(x, y, z); S.add(l); return l; });
    // down at floor level with the boy, or nobody could see what his hands are doing
    this.low = new THREE.PointLight(0xdfeaff, 0, 2.6, 1.4); this.low.position.set(0, 0.5, 1.3); S.add(this.low);
    // passing street lamps (sweep through the windows)
    this.sweep = [new THREE.PointLight(0xffa04a, 0, 7, 1.6), new THREE.PointLight(0xfff0d0, 0, 7, 1.6)];
    this.sweep[0].position.set(2.6, 2.4, -8); this.sweep[1].position.set(-3.2, 0.6, -8); S.add(...this.sweep);

    // ---------- jeep body ----------
    const J = this.jeep = new THREE.Group(); S.add(J);
    const floorM = pbr('metal_plate', { repeat: [1.5, 4], metal: 0.15, rough: 0.85, color: 0xa4a7aa });
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
    this.beams = [];
    const tb = beam(0xbfd4ff, { radius: 0.75, length: 1.4, intensity: 0.05, top: 0.12 }); tb.position.set(0, CEIL - 0.04, 0); tb.scale.z = 2.2; J.add(tb); this.beams.push(tb);
    const th = halo(0xdcebff, 0.5, 0.6); th.position.set(0, CEIL - 0.05, 0.3); J.add(th);
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
    const driver = new Person({ real: 'driver', h: 1.66, skin: 'brown', top: 0x2f3b45, bottom: 0x2a2d33, hair: 'buzz', build: 1.1 });
    driver.pose('sit', true).set({ shL: [-50, 0, 10], shR: [-50, 0, -10], elL: [-40, 0, 0], elR: [-40, 0, 0] }, true);
    driver.root.position.set(-0.42, 0.08, -0.55); driver.root.rotation.y = PI; cab.add(driver.root);
    this.people = [driver];

    // ---------- passengers ----------
    // Everyone sits the way people sit on a jeepney: back on the rail, feet flat, hands on their own thighs or their own things.
    const P = (o, x, z, extra) => {
      const p = new Person(o); p.pose('sit', true); if (extra) p.set(extra, true);
      p.root.position.set(x, 0, z); p.root.rotation.y = x < 0 ? PI / 2 : -PI / 2; J.add(p.root); this.people.push(p); return p;
    };
    const LX = -0.73, RX = 0.73;
    this.l1 = P({ real: 'driver', h: 1.7, build: 1.05 }, LX, 1.45, { neck: [14, 0, 6] });
    this.l2 = P({ real: 'commuter', h: 1.58, build: 0.9 }, LX, 0.78, { neck: [26, 0, 0] });
    this.l3 = P({ real: 'mark', h: 1.7, build: 1.15 }, LX, 0.1, { neck: [4, 0, 0] });
    this.ale = P({ real: 'tindera', h: 1.55, build: 1.15, belly: true }, RX, 0.6, { neck: [6, 0, 0] });
    this.r3 = P({ real: 'prince', h: 1.72, build: 0.95 }, RX, -0.1, { neck: [10, 0, 0] });
    this.r4 = P({ real: 'keira', h: 1.58, build: 1 }, RX, -0.78, { neck: [16, 0, 10] });
    // a morning jeep, not a packed one: six riders, so the boy's round takes as long as a stop does
    this.seated = [this.l1, this.l2, this.l3, this.ale, this.r3, this.r4];
    this.lapYaw = [0.12, -0.2, 0.3, 0, -0.24, 0.1];

    // l2's phone: it is held up in front of her, both hands on it
    const hp = this.hp = new THREE.Group();
    const hb = box(0.072, 0.15, 0.009, std(0x15171b, { rough: 0.3, metal: 0.4 }), 0.004); hp.add(hb);
    const hs = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.138), glow(0xbfd6ff, 1.3)); hs.position.z = 0.0052; hp.add(hs);
    this.l2.root.add(hp);
    this.hpL = new THREE.Object3D(); this.hpL.position.set(-0.05, -0.09, -0.025); hp.add(this.hpL);
    this.hpR = new THREE.Object3D(); this.hpR.position.set(0.05, -0.09, -0.025); hp.add(this.hpR);
    const phl = new THREE.PointLight(0xa8c4ff, 0.1, 0.8, 2); phl.position.set(0, 0, 0.1); hp.add(phl);
    // ale's bayong on her lap, her umbrella leaning on her shin
    this.bay = bayong(); this.bay.scale.setScalar(0.74); this.ale.root.add(this.bay);
    const umb = this.umb = new THREE.Group(), um = std(0x1c2a3c, { rough: 0.45 });
    umb.add(at(cyl(0.024, 0.012, 0.56, um, 10), 0, 0.31, 0));
    umb.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 12, PI), std(0x3b2a1e, { rough: 0.5 })), 0.02, 0.6, 0, 0, 0, 0));
    J.add(umb);

    // ---------- you ----------
    const you = this.you = new Person({ real: 'driver', h: 1.7, build: 1 });
    you.pose('sit', true).set({ hpL: [-80, 0, 13], hpR: [-80, 0, -13], knL: [62, 0, 0], knR: [62, 0, 0], shL: [-20, 0, 8], shR: [-20, 0, -8], elL: [-60, 0, 0], elR: [-60, 0, 0] }, true);
    you.root.position.set(RX, 0, 1.3); you.root.rotation.y = -PI / 2; J.add(you.root);
    you.head.visible = false; you.arm.L.sh.visible = false; you.arm.R.sh.visible = false; you.real?.hideHead();
    this.people.push(you);
    // your phone, in your right hand
    this.held = new THREE.Group(); S.add(this.held);
    const phone = this.phone = makePhone(S);
    phone.position.copy(this.PH_LAP); phone.quaternion.copy(this.phoneQ(this.PH_LAP)); phone.visible = false; S.add(phone);
    // your own arm, for the one thing you do in this scene
    this.arm = povArm(); S.add(this.arm);
    // envelopes: they live in the jeep, not on anybody, so they stay exactly where they were put
    this.laps = this.seated.map(() => { const e = envelope(false); e.visible = false; J.add(e); return e; });
    this.myEnv = envelope(true); this.myEnv.material.color.setScalar(0.4); /* keeps the writing readable under the aisle light */ this.myEnv.visible = false; J.add(this.myEnv);
    this.coin = pesoCoin(20);
    this.coin.visible = false; J.add(this.coin);

    // ---------- the boy ----------
    const boy = this.boy = new Person({ real: 'boy', h: 1.24, skin: 'brown', top: 0x7d786c, bottom: 0x2e3238, hair: 'messy', build: 0.82, shorts: true, barefoot: true, sleeve: 0.12 });
    boy.root.position.set(0.1, -0.8, 4.2); J.add(boy.root); this.people.push(boy);
    const ragM = std(0x6d6a63, { rough: 1 });
    const rg = rag(ragM); rg.position.set(0, -0.07 * boy.s / 0.73, 0.012); boy.arm.R.wr.add(rg); this.rag = rg;
    // once the wiping is done it goes into the back of his waistband (it hangs from his hips, so it moves with them)
    const tk = this.ragTuck = tuckedRag(ragM); tk.position.set(-0.03 * boy.s, 0.045 * boy.s, -0.104 * boy.s); tk.rotation.set(0.2, PI, 0.06); tk.visible = false; boy.hips.add(tk);
    // the envelopes he's carrying: a real little pile, gripped upright in the left hand, thinner as he deals them out
    const stack = this.stack = new THREE.Group(); stack.position.set(-0.012, -0.08, 0.03);
    const pileM = std(0xa8a294, { rough: 0.95 });
    this.pile = Array.from({ length: 12 }, (_, i) => { const e = box(0.0016, 0.16, 0.1, pileM); e.position.x = -i * 0.0019; e.rotation.x = (i - 6) * 0.012; e.castShadow = true; stack.add(e); return e; });
    boy.arm.L.wr.add(stack); boy.grip('L', 'hold');
    const wetHair = boy.hair.children[0]; if (wetHair) wetHair.material = wetHair.material.clone(), wetHair.material.roughness = 0.25;
    // across the road: the jeep stop for Part Two, where other kids climb into other jeeps (jeepstop.js)
    if (!new URLSearchParams(location.search).has('noreal')) await preloadReal(['batang1', 'batang2', 'batang3']);
    this.stop = new JeepStop(); S.add(this.stop.group);

    // ---------- outside ----------
    this.street = makeStreet({ L: 88, ground: -0.8, roadX: -4.6, laneW: 6.2, seed: 11, night: 0.45 }); S.add(this.street);
    this.oncoming = new Traffic({ x: -7.0, y: -0.8, count: 6, L: 140, dir: 1 }); S.add(this.oncoming.group);
    this.oncoming2 = new Traffic({ x: -9.6, y: -0.8, count: 4, L: 140, dir: 1 }); S.add(this.oncoming2.group);
    const follow = new THREE.Group(); // tricycle behind us, headlight glaring in
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), glow(0xfff2d8, 6)); hl.position.y = 0.2; follow.add(hl);
    const hlL = new THREE.PointLight(0xfff0d8, 0.5, 9, 2); hlL.position.set(0, 0.2, -0.3); follow.add(hlL);
    for (const x of [-0.45, 0.45]) { const hb = beam(0xfff1dc, { radius: 1.1, length: 9, intensity: 0.09, top: 0.08 }); hb.rotation.x = -PI / 2; hb.position.set(x, 0.2, -0.1); follow.add(hb); this.beams.push(hb); const hh = halo(0xfff0d8, 1.1, 1.0); hh.position.set(x, 0.2, -0.15); follow.add(hh); }
    follow.position.set(0.4, -0.3, 12.5); S.add(follow); this.tail = follow;
    this.rim = new THREE.PointLight(0xcfe0ff, 0, 2.2, 2); this.rim.position.set(0.0, 0.95, 2.25); S.add(this.rim);
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
    engine.rig.shake = 0.7; engine.rig.jolt = 1; engine.rig.pov = 1;
    engine.rig.set({ pos: [0.66, 1.13, 1.3], look: [-1, 0.98, 1.2], fov: 50 });
    audio.rain(0.8, 0.35); audio.roof(0.7); audio.engine(1, 1); audio.traffic(0.6); audio.scape('jeep');
    this.settle();
    this.stop.group.visible = true; prewarm(engine); this.stop.group.visible = !!this.atStop;   // the stop's shaders are built now too, not at the cut
  },
  exit() { audio.layer('roof', 0); audio.layer('engine', 0); audio.layer('traffic', 0); audio.scape(null); },

  update(dt, t) {
    this.speed += (this.targetSpeed - this.speed) * (1 - Math.exp(-0.8 * dt));
    this.offset += this.speed * dt;
    const L = this.street.userData.L; this.street.position.z = this.offset % L;
    // at the stop the traffic crawls past
    const tr = this.atStop ? 0.35 : 1; this.oncoming.update(dt * tr, this.speed / tr); this.oncoming2.update(dt, this.speed);
    this.tail.position.y = -0.3 + Math.sin(t * 9) * 0.01;
    this.engine.rig.jolt = 0.25 + this.speed / 7 * 0.9;
    // street-lamp light sweeps through the windows (pole spacing 22 m)
    if (!this.atStop) {   // at the stop these lights are lent to the stop across the road
    const ph = (this.offset % 22) / 22;
    this.sweep[0].position.z = -9 + ph * 18; this.sweep[0].intensity = this.speed > 0.5 ? 9 * Math.sin(ph * PI) : 3;
    const ph2 = ((this.offset * 1.7 + 7) % 30) / 30;
    this.sweep[1].position.z = -9 + ph2 * 18; this.sweep[1].intensity = this.speed > 0.5 ? 4 * Math.sin(ph2 * PI) : 0;
    }
    // fluorescent flicker
    const fl = Math.random() < 0.012 ? 0.4 : 1; this.tubeL.forEach(l => { const d = l.userData.dim ?? 1; l.userData.k = (l.userData.k ?? 1) + (d - (l.userData.k ?? 1)) * 0.05; l.intensity = 1.1 * fl * l.userData.k; });
    this.aisle.forEach(l => { l.intensity = 2.2 * (this.tubeL[0].userData.k ?? 1); });
    this.rain.update(t, this.engine.camera);
    this.beams.forEach(b => b.userData.tick(t));
    const dp = this.drips.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) { const k = (t * (0.9 + this.dripSeed[i]) + this.dripSeed[i] * 7) % 1; dp.setY(i, 1.3 - k * k * 1.6); dp.setZ(i, dp.getZ(i) + this.speed * dt * 0.02 * (dp.getZ(i) > 2.1 ? -200 : 1)); }
    dp.needsUpdate = true;
    for (const p of this.people) p.update(dt, t);
    if (this.atStop) { this.stop.group.position.z = this.offset - this.stopZ0; this.stop.update(dt, t); }
    // the head keeps following the boy down the aisle
    if (this.watch) { const w = this.watch, r = this.engine.rig; r.look.lerp(_w.copy(w.who.root.position).setY(w.y).add(this.jeep.position), 1 - Math.exp(-w.k * dt)); }
    // a little light goes with him at floor level
    if (!this.atStop) { this.low.position.set(this.boy.root.position.x + (this.lowX ?? 0.25), this.lowY ?? 1.2, this.boy.root.position.z - 0.15); this.low.intensity += ((this.lowTo ?? 0) * 0.85 - this.low.intensity) * (1 - Math.exp(-3 * dt)); }
    this.held.position.copy(this.engine.camera.position); this.held.quaternion.copy(this.engine.camera.quaternion);
    this.phone.update(dt, t, this.engine.rig.road);
    // light sway of everyone with the jeep
    this.jeep.rotation.z = Math.sin(t * 0.7) * 0.004 * this.speed / 7;
  },

  /* ================= the phone ================= */
  EYE: new THREE.Vector3(0.66, 1.13, 1.3),
  PH_LAP: new THREE.Vector3(0.42, 0.66, 1.24),
  PH_READ: new THREE.Vector3(0.415, 0.955, 1.285),
  /** how the phone sits in the hand at a given spot: screen toward the eyes, a little off square */
  phoneQ(at, tilt = 1) {
    const m = new THREE.Matrix4().lookAt(this.EYE, at, new THREE.Vector3(0, 1, 0));
    return new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05 * tilt, 0.07 * tilt, -0.05 * tilt)));
  },
  /** the screen has to stay readable from the back of a classroom, so the film look eases off while he reads */
  readingLook(k) {
    const E = this.engine, u = E.final.uniforms;
    E.bloom.strength = this.grade.bloom + (0.02 - this.grade.bloom) * k;
    u.uGrain.value = this.grade.grain + (0.022 - this.grade.grain) * k;
    u.uCA.value = 0.0018 + (0.0002 - 0.0018) * k;
  },
  async textMessage(D) {
    const P = this.phone, E = this.engine, rig = E.rig;
    const lap = this.PH_LAP, read = this.PH_READ, q0 = this.phoneQ(lap, 0), q1 = this.phoneQ(read);
    P.visible = true; P.setScreen('messages'); P.wake(1, 0.25); P.pos.copy(lap); P.quaternion.copy(q0);
    // it buzzes on his lap
    const buzz = () => { audio.tone(170, .22, { type: 'square', vol: .035 }); P.buzz = 0.26; };
    buzz(); D.wait(0.34).then(buzz);
    await D.wait(0.9);
    // eyes drop first, the hand comes up to meet them
    rig.move({ look: read.clone().add(new THREE.Vector3(0.012, -0.017, 0)).toArray(), dur: 1.9, fov: 50 });
    await D.wait(0.25);
    E.dof({ target: P.pos, aperture: 0.0012, maxblur: 0.005 });
    animate(k => this.readingLook(k), 1.6);
    await animate(k => { P.pos.lerpVectors(lap, read, k); P.quaternion.slerpQuaternions(q0, q1, k); }, 1.8, 'head');
    // he leans in and reads
    await D.wait(0.9);
    rig.move({ pos: [0.63, 1.1, 1.298], look: read.clone().add(new THREE.Vector3(0.006, 0.02, 0)).toArray(), dur: 3.4, fov: 31 });
    await D.wait(3.3);
    await D.say('', 'Text na naman.', { hold: 2.4 });
    // back gesture: the thumb drags the conversation off the screen
    await P.swipe();
    await D.wait(0.25);
    rig.move({ pos: [0.66, 1.13, 1.3], look: [-1, 0.98, 1.1], dur: 2.4, fov: 50 });
    await D.wait(0.2);
    E.dof({ focus: 1.2, aperture: 0.0035, maxblur: 0.007 });
    animate(k => this.readingLook(1 - k), 1.6);
    P.wake(0, 0.5);
    await animate(k => { P.pos.lerpVectors(read, lap, k); P.quaternion.slerpQuaternions(q1, q0, k); }, 1.5, 'head');
    P.visible = false;
    await D.wait(0.7);
  },

  /* ================= the chapter ================= */
  cam(pos, look, dur = 2.5, fov, e) { this.watch = null; return this.engine.rig.move({ pos, look, dur, fov, e }); },

  /** the head keeps turning to follow someone until told otherwise */
  follow(who, y = 0.75, k = 2.6) { this.watch = { who, y, k }; },

  /** everything about a seated person that depends on the body they actually have: lap, hands, feet */
  seat(p, i) {
    const R = p.real, w = (o, v = new THREE.Vector3()) => { o.updateWorldMatrix(true, false); return v.setFromMatrixPosition(o.matrixWorld); };
    p.update(1, 0); p.update(1, 0);
    const J = this.jeep, s = p.H / 1.7, f = new THREE.Vector3(Math.sign(-p.root.position.x), 0, 0);
    const hipL = w(R.thigh.L), hipR = w(R.thigh.R), kneL = w(R.calf.L), kneR = w(R.calf.R), footL = w(R.foot.L), footR = w(R.foot.R);
    const onThigh = (h, n, k, up) => h.clone().lerp(n, k).add(new THREE.Vector3(0, up * s, 0));
    p.spot = {
      lap: onThigh(hipL, kneL, 0.6, 0.095).lerp(onThigh(hipR, kneR, 0.6, 0.095), 0.5),
      handL: onThigh(hipL, kneL, 0.72, 0.13), handR: onThigh(hipR, kneR, 0.72, 0.13),
      shoeL: footL.clone().addScaledVector(f, 0.1 * s).setY(0.075), shoeR: footR.clone().addScaledVector(f, 0.1 * s).setY(0.075),
      f,
    };
    p.spot.lapJ = J.worldToLocal(p.spot.lap.clone());
    return p.spot;
  },
  /** envelopes lie flat on the thighs, top edge away from whoever is sitting there */
  layFlat(e, p, yaw = 0) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (p.root.position.x < 0 ? -PI / 2 : PI / 2) + yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -PI / 2));
    e.quaternion.copy(q); e.position.copy(p.spot.lapJ);
    return q;
  },

  /** set up everybody's hands once the bodies exist */
  settle() {
    if (this.settled) return; this.settled = true;
    this.seated.forEach((p, i) => {
      const s = this.seat(p, i);
      if (p === this.l2) return;
      if (p === this.ale) return;
      p.reach('L', s.handL, { rate: 30, wrist: [-14, 0, 0] }); p.reach('R', s.handR, { rate: 30, wrist: [-14, 0, 0] });
    });
    this.seat(this.you);
    const l2 = this.l2, hp = this.hp; hp.position.set(0, 0.8, 0.26); hp.rotation.set(0.7, PI, 0);
    l2.reach('L', this.hpL, { rate: 30, pole: [1, -1, -0.4], wrist: [0, 0, 0] }); l2.reach('R', this.hpR, { rate: 30, pole: [-1, -1, -0.4], wrist: [0, 0, 0] });
    const ale = this.ale, sa = ale.spot, bagPos = ale.root.worldToLocal(sa.lap.clone()); bagPos.y += 0.085; bagPos.z += 0.02; this.bay.position.copy(bagPos);
    this.laps.forEach((e, i) => this.layFlat(e, this.seated[i], this.lapYaw[i]));
    // ale's envelope lies on top of her bag, her hands either side of it
    { const y = bagPos.clone(); y.y += 0.086; y.z += 0.0; ale.root.localToWorld(y); this.jeep.worldToLocal(y); this.laps[this.seated.indexOf(ale)].position.copy(y); sa.lapJ = y; }
    const bw = ale.root.localToWorld(bagPos.clone());
    ale.reach('L', new THREE.Vector3(bw.x + 0.0, bw.y + 0.1, bw.z - 0.13), { rate: 30, wrist: [-10, 0, 0] }); ale.reach('R', new THREE.Vector3(bw.x + 0.0, bw.y + 0.1, bw.z + 0.13), { rate: 30, wrist: [-10, 0, 0] });
    this.umb.position.set(RX_UMB, 0, 0.77); this.umb.rotation.set(0.08, 0, 0.16);
    for (let i = 0; i < 8; i++) this.seated.forEach(p => p.update(0.05, 0));
    // your own envelope, readable from where you sit
    this.layFlat(this.myEnv, this.you); this.myEnvQ = this.myEnv.quaternion.clone();
    this.myEnv.rotateX(0.2); this.myEnv.position.y += 0.018;
    this.myEnvQ.copy(this.myEnv.quaternion); this.myEnvP = this.myEnv.position.clone();
  },

  /** the rag in his fist, or tucked away in his waistband with his hand free */
  tuck(on) { this.rag.visible = !on; this.ragTuck.visible = on; this.boy.grip('R', on ? 'rest' : 'hold'); },

  /** the pile in his hand gets thinner and thicker with what's in it */
  pileCount(n) { this.pile.forEach((e, i) => (e.visible = i < n)); this.pileN = n; },

  /** one envelope travels between the pile and a lap, in his hand the whole way */
  async pass(e, toLap, dur = 0.55) {
    const J = this.jeep, boy = this.boy, stack = this.stack, end = e.position.clone(), endQ = e.quaternion.clone(), q0 = new THREE.Quaternion(), w = new THREE.Vector3(), lift = new THREE.Vector3();
    const from = () => { stack.getWorldPosition(w); return J.worldToLocal(w); };
    const q = new THREE.Quaternion();
    if (toLap) this.pileCount(Math.max(1, this.pileN - 1));
    e.visible = true;
    q0.copy(J.quaternion).invert(); stack.getWorldQuaternion(q); q0.multiply(q);
    await animate(k => {
      const a = toLap ? k : 1 - k;
      e.position.copy(from()).lerp(end, a); e.position.y += Math.sin(a * PI) * 0.05;
      e.quaternion.slerpQuaternions(q0, endQ, a);
    }, dur, 'inOut');
    if (!toLap) { e.visible = false; e.position.copy(end); e.quaternion.copy(endQ); this.pileCount(Math.min(12, this.pileN + 1)); }
    audio.paper();
  },

  /** he works the rag over the toe of each shoe in turn: the hand is on the shoe the whole time */
  async wipe(p, dur = 2, farFirst = false) {
    const boy = this.boy, s = p.spot, t = new THREE.Vector3(), back = s.f.clone(), side = new THREE.Vector3(-s.f.z, 0, s.f.x);
    const a = farFirst ? s.shoeR : s.shoeL, b = farFirst ? s.shoeL : s.shoeR;
    boy.reach('R', t, { rate: 11, pole: [-1, -0.6, -0.5] });
    const dt0 = this.engine.time;
    await animate((_, raw) => {
      const m = THREE.MathUtils.smoothstep(raw, 0.44, 0.56), now = this.engine.time - dt0;
      t.copy(a).lerp(b, m).addScaledVector(back, 0.075 + Math.sin(now * 5.5) * 0.02).addScaledVector(side, Math.sin(now * 13) * 0.042);
      t.y = 0.135 + Math.abs(Math.sin(now * 13)) * 0.012;
    }, dur, 'linear');
    boy.reach('R', null, { rate: 8 });
  },

  /** the same two things at every seat: he leaves the envelope, then he wipes the shoes */
  async serve(p, e, { walk = 1.15, wipe = 1.8, stayDown = false } = {}) {
    const boy = this.boy, left = p.root.position.x < 0, s = p.spot;
    await walkPath(boy, [[left ? 0.03 : -0.03, 0, p.root.position.z + 0.02]], walk);
    boy.turnTo = left ? -PI / 2 : PI / 2; boy.look(s.lap, 0.8);
    boy.set({ spine: [30, 0, 0], neck: [6, 0, 0] });
    await this.dwell(0.18);
    const hand = s.lap.clone().add(new THREE.Vector3(left ? 0.06 : -0.06, 0.085, 0));
    boy.reach('L', hand, { rate: 9, pole: [1, -0.4, -0.6] });
    await this.dwell(0.2);
    await this.pass(e, true, 0.5);
    boy.reach('L', null, { rate: 7 });
    boy.pose('kneelDown'); boy.look(s.shoeL, 0.7);
    await this.dwell(0.32);
    await this.wipe(p, wipe);
    if (!stayDown) { boy.pose('stand'); boy.look(null); await this.dwell(0.28); boy.turnTo = null; }
  },
  dwell(s) { return new Promise(r => { let t = 0; const stop = this.engine.onUpdate((dt, _, raw) => { t += raw; if (t >= s) { stop(); r(); } }); }); },

  resetBoy() {
    const boy = this.boy; this.silhouette(1); boy.anim = null; boy.look(null); boy.expression({}); boy.pose('stand', true); this.watch = null; this.lowTo = 0;
    boy.reach('L', null); boy.reach('R', null); if (boy.ik) { boy.ik.L && (boy.ik.L.w = 0); boy.ik.R && (boy.ik.R.w = 0); }
    boy.root.position.set(0.1, -0.8, 4.2); boy.root.rotation.y = PI; boy.turnTo = null;
    this.laps.forEach(e => (e.visible = false)); this.myEnv.visible = false; this.pileCount(11); this.tuck(false);
    this.myEnv.position.copy(this.myEnvP); this.myEnv.quaternion.copy(this.myEnvQ);
    this.laps.forEach((e, i) => this.layFlat(e, this.seated[i], this.lapYaw[i]));
    { const a = this.ale.spot; this.laps[this.seated.indexOf(this.ale)].position.copy(a.lapJ); }
  },

  /** boy climbs in at the back */
  async board(D) {
    const boy = this.boy;
    audio.coinTap(); cast(D).bark(this.l3, 'Para po!');
    await D.wait(1.1);
    this.targetSpeed = 0; audio.engine(1, 0.3);
    await D.wait(1.6);
    this.cam([0.62, 1.13, 1.32], [-0.1, 0.55, 2.6], 2.6, 48);
    await walkPath(boy, [[0.1, -0.8, 2.9], [0.05, -0.3, 2.35]], 1.2);
    await walkPath(boy, [[0.0, 0.0, 1.85]], 1.0);
    this.targetSpeed = 6; audio.engine(1, 1);
  },

  /** he leaves the envelope on your lap, then wipes your shoes */
  async atYourFeet(D, line = true) {
    const boy = this.boy, you = this.you, s = you.spot, E = this.engine;
    await walkPath(boy, [[-0.02, 0, 1.32]], 1.1);
    boy.turnTo = PI / 2; boy.look(s.lap, 0.8); boy.set({ spine: [30, 0, 0], neck: [6, 0, 0] });
    E.dof({ focus: 0.72, aperture: 0.004 });
    this.cam([0.64, 1.12, 1.3], this.lapLook(), 1.3, 40);
    await this.dwell(0.5);
    boy.reach('L', s.lap.clone().add(new THREE.Vector3(-0.08, 0.09, 0)), { rate: 8, pole: [1, -0.4, -0.6] });
    await this.dwell(0.35);
    await this.pass(this.myEnv, true, 0.7);
    boy.reach('L', null, { rate: 7 });
    await this.dwell(0.6);
    await this.yourShoes(D, line);
  },
  /** where your eyes go to read what's in your lap */
  lapLook() { return this.you.spot.lapJ.clone().add(new THREE.Vector3(-0.02, 0, 0)).toArray(); },
  /** from your seat your own knees hide your feet, so we drop to the floor beside the shoe: rag, hand, shoe, his face behind them */
  async yourShoes(D, line = true) {
    const boy = this.boy, you = this.you, s = you.spot, E = this.engine, rig = E.rig;
    this.cam([0.56, 1.06, 1.3], [0.2, 0.1, 1.3], 1.0, 44);
    const shoe = s.shoeR.clone(), far = s.shoeL.clone();
    await walkPath(boy, [[shoe.x - 0.36, 0, (shoe.z + far.z) / 2 + 0.04]], 0.8);
    boy.turnTo = PI / 2;
    boy.pose('kneelDown'); boy.look(shoe, 0.7);
    this.lowTo = 1.6; this.lowX = 0.2; this.lowY = 0.5;
    await this.dwell(0.7);
    const pov = rig.pov, sh = rig.shake, side = Math.sign(shoe.z - far.z) || 1;
    rig.pov = 0; rig.shake = 0.25;
    rig.set({ pos: [shoe.x - 0.2, 0.3, shoe.z + side * 0.5], look: [shoe.x - 0.14, 0.2, (shoe.z + far.z) / 2], fov: 44 });
    rig.move({ pos: [shoe.x - 0.16, 0.27, shoe.z + side * 0.44], look: [shoe.x - 0.14, 0.19, (shoe.z + far.z) / 2], fov: 42, dur: 4, e: 'sine' });
    E.dof({ focus: 0.5, aperture: 0.0014, maxblur: 0.005 });
    const w = this.wipe(you, 3.6, true);
    if (line) await D.say('', 'Pinunasan niya ang sapatos mo.', { hold: 2.8 });
    await w;
    boy.pose('stand'); boy.look(null); boy.turnTo = null;
    this.tuck(true);   // into the back of his shorts
    rig.pov = pov; rig.shake = sh; E.dof({ focus: 0.72, aperture: 0.004 });
    rig.set({ pos: [0.64, 1.12, 1.3], look: this.lapLook(), fov: 40 });
    await this.dwell(0.2);
    this.lowTo = 0; this.lowX = 0.25; this.lowY = 1.2;
  },

  /** he comes back down the aisle collecting, every envelope back into his hand, and stops at your knees */
  async collect(D) {
    const boy = this.boy, E = this.engine;
    E.dof({ target: boy.head, aperture: 0.003 });
    this.follow(boy, 0.85);
    for (const i of [5, 4, 2, 3, 1, 0]) {   // front to back, whichever side is next
      const p = this.seated[i], left = p.root.position.x < 0, e = this.laps[i], s = p.spot;
      await walkPath(boy, [[left ? 0.03 : -0.03, 0, p.root.position.z + 0.04]], 1.25);
      boy.turnTo = left ? -PI / 2 : PI / 2; boy.set({ spine: [30, 0, 0] });
      const lap = e.position.clone(); this.jeep.localToWorld(lap);
      boy.reach('L', lap.clone().add(new THREE.Vector3(left ? 0.06 : -0.06, 0.085, 0)), { rate: 11, pole: [1, -0.4, -0.6] });
      await this.dwell(0.28);
      await this.pass(e, false, 0.3);
      boy.reach('L', null, { rate: 9 }); boy.set({ spine: [0, 0, 0] });
      await this.dwell(0.1);
      boy.turnTo = null;
    }
    await walkPath(boy, [[-0.12, 0, 1.34]], 1.1);
    await this.stageChoice(D);
  },

  /** k = 1 normal; he stays readable, the room just sinks around him */
  silhouette(k) {
    this.boy.root.traverse(o => {
      if (!o.isMesh || !o.material.color) return;
      const m = o.material; m.userData.c0 ??= m.color.clone(); m.userData.cc ??= m.clearcoat ?? 0;
      m.color.copy(m.userData.c0).multiplyScalar(k);
      if (m.clearcoat != null) { m.clearcoat = m.userData.cc * k; m.sheen = 0.25 * k; }
    });
  },
  /** he stands at your knees with his hand out, palm up, and looks at you: he is asking */
  async stageChoice(D) {
    const boy = this.boy, E = this.engine;
    this.watch = null;
    boy.turnTo = PI / 2;
    boy.pose('stand'); boy.set({ spine: [10, 0, 0], neck: [-12, 0, 0], shL: [-24, 0, 10], elL: [-60, 0, 0] });
    const eye = new THREE.Vector3(0.66, 1.12, 1.3);
    boy.look(eye, 1); boy.expression({ worry: 0.75, sad: 0.25 });
    boy.reach('R', new THREE.Vector3(0.12, 0.86, 1.44), { rate: 4.5, pole: [-1, -1.2, -0.3], wrist: [12, -48, 0], twist: -48 });
    boy.grip('R', 'open');   // an open palm, asking
    this.lowTo = 1; this.lowX = 0.35; this.lowY = 1.25;
    this.tubeL.forEach(l => (l.userData.dim = 0.55));
    const e0 = this.grade.exposure;
    animate(k => { this.rim.intensity = 1.8 * k; this.hemi.intensity = 0.35 * (1 - k * 0.45); this.sky.intensity = 0.55 * (1 - k * 0.5); this.scene.environmentIntensity = 0.18 * (1 - k * 0.4); E.renderer.toneMappingExposure = e0 * (1 - 0.08 * k); }, 1.6);
    E.dof({ target: boy.head, aperture: 0.002 });
    this.cam([0.66, 1.12, 1.3], [0.02, 0.98, 1.36], 1.5, 50);
    await D.wait(1.0);
  },
  async hopOff(D) {
    const boy = this.boy;
    this.tubeL.forEach(l => (l.userData.dim = 1)); this.lowTo = 0; this.lowX = 0.25; this.lowY = 1.2;
    audio.roofBang();
    const e0 = this.grade.exposure; animate(k => { this.rim.intensity = 1.8 * (1 - k); this.hemi.intensity = 0.1925 + 0.1575 * k; this.sky.intensity = 0.275 + 0.275 * k; this.scene.environmentIntensity = 0.108 + 0.072 * k; this.engine.renderer.toneMappingExposure = e0 * (0.92 + 0.08 * k); }, 2);
    this.targetSpeed = 0; audio.engine(1, 0.3);
    boy.pose('stand'); boy.look(null); boy.expression({}); boy.reach('R', null, { rate: 6 }); boy.grip('R', 'rest');
    this.cam([0.62, 1.13, 1.32], [-0.1, 0.6, 2.8], 2.2, 48);
    await walkPath(boy, [[0, 0, 1.95], [0.05, -0.3, 2.35], [0.3, -0.8, 3.2], [1.6, -0.8, 5.5]], 1.3);
    this.targetSpeed = 7; audio.engine(1, 1);
  },

  /** give: your hand brings the ₱20 down into the envelope on your lap */
  async putCoin() {
    const arm = this.arm, E = this.engine, wr = new THREE.Vector3(), elb = new THREE.Vector3(), rest = new THREE.Vector3(0.42, 0.42, 1.52), end = this.myEnv.position.clone();
    this.jeep.localToWorld(end);
    E.dof({ focus: 0.65, aperture: 0.004 });
    await this.cam([0.64, 1.12, 1.3], this.lapLook(), 0.9, 40);
    const c = this.coin; c.visible = true; arm.visible = true;
    const place = (k, up) => { wr.copy(rest).lerp(end.clone().add(new THREE.Vector3(0.1, 0.1, 0.05)), k); elb.set(0.72, 0.62, 1.62); arm.reach(wr, elb, 1.2); c.position.copy(wr).add(new THREE.Vector3(-0.1, -0.03 - up * 0.05, -0.04)); c.rotation.set(0.6, 0, 0.3); this.jeep.worldToLocal(c.position); };
    await animate(k => place(k, 0), 0.8, 'inOut');
    await animate(k => place(1, k), 0.3, 'in');
    audio.coin(); c.visible = false;
    await this.dwell(0.25);
    await animate(k => place(1 - k, 1), 0.6, 'inOut');
    arm.visible = false;
  },
  /** he takes the envelope off your lap himself, into the same hand as the rest */
  async takeBack() {
    const boy = this.boy, E = this.engine, p = this.myEnv.position.clone(); this.jeep.localToWorld(p);
    boy.reach('R', p.clone().add(new THREE.Vector3(-0.06, 0.08, 0)), { rate: 8, pole: [-1, -1, -0.5], wrist: [0, 0, 0] });
    await this.dwell(0.55);
    audio.paper();
    const J = this.jeep, w = new THREE.Vector3(), m = this.myEnv, end = m.position.clone(), eq = m.quaternion.clone(), hq = new THREE.Quaternion();
    boy.reach('R', () => w.set(0.14, 0.86, 1.3), { rate: 5, pole: [-1, -1, -0.5] });
    await animate(k => { boy.arm.R.wr.getWorldPosition(w); const t = J.worldToLocal(w.clone()); m.position.lerpVectors(end, t, Math.min(1, k * 1.8)); }, 0.7, 'inOut');
    boy.reach('R', null, { rate: 5 });
    const st = new THREE.Vector3(); this.stack.getWorldPosition(st); J.worldToLocal(st); const p1 = m.position.clone();
    await animate(k => m.position.lerpVectors(p1, st, k), 0.4, 'inOut');
    m.visible = false; m.position.copy(end); m.quaternion.copy(eq); this.pileCount(Math.min(12, this.pileN + 1));
  },

  async play(D, S, beat) {
    this.settle();
    if (beat === 'montage') return this.montage(D, S);
    if (beat === 'again') return this.again(D, S);
    if (beat === 'shoes') { this.resetBoy(); this.myEnv.visible = true; this.boy.root.position.set(-0.02, 0, 1.32); this.boy.root.rotation.y = PI / 2; this.engine.rig.set({ pos: [0.64, 1.12, 1.3], look: this.lapLook(), fov: 40 }); await D.black(false, 0.4); await D.wait(1.5); await this.yourShoes(D); await this.dwell(2); return this.stageChoice(D); }
    if (beat === 'phone') { this.resetBoy(); await D.black(false, 0.5); await D.wait(0.4); return this.textMessage(D); }
    if (beat === 'choice') { this.resetBoy(); this.myEnv.visible = true; this.boy.root.position.set(0, 0, 1.3); this.boy.root.rotation.y = PI / 2; this.engine.rig.set({ pos: [0.66, 1.13, 1.3], look: [-1, 0.98, 1.1], fov: 50 }); await D.black(false, 0.5); await this.stageChoice(D); return D.choose(['Magbigay|Lagyan ng bente', "Ibalik|Sindikato naman 'yan"], { timer: 10 }); }
    const boy = this.boy;
    this.resetBoy();
    await D.black(false, 2.0);
    await D.wait(0.8);
    const C = cast(D); C.people({ Ale: this.ale, Totoy: boy });
    await this.textMessage(D);

    C.bark(this.l1, 'Bayad po.'); audio.barya();
    await D.wait(1.5);
    C.bark(this.l2, 'Makikiabot po.'); audio.barya();
    await D.wait(1.7);
    C.bark(this.l1, 'Isa pong Cubao.');
    await D.wait(1.5);
    await this.board(D);
    C.intro('Totoy', 'Araw-araw siyang nandito sa rutang ito.');
    this.engine.dof({ target: boy.head, aperture: 0.003 });
    this.lowTo = 1;
    D.say('', 'May batang sumakay. Walang tsinelas, basang-basa.');
    await this.cam([0.6, 1.1, 1.36], [-0.25, 0.42, 1.5], 2.2, 46);
    // the first one, close, so we see exactly what he does
    await this.serve(this.l1, this.laps[0], { wipe: 2.4 });
    D.say('', 'Isa-isa, nag-iiwan siya ng sobre sa kandungan, tapos pinupunasan ang sapatos.', { hold: 4.6 });
    this.follow(boy, 0.55, 2.2);
    await this.serve(this.l2, this.laps[1], { wipe: 1.6 });
    await this.serve(this.l3, this.laps[2], { wipe: 1.2 });
    this.follow(boy, 0.8, 2.2);
    await this.serve(this.r4, this.laps[5], { walk: 1.5, wipe: 0.8 });
    await this.serve(this.r3, this.laps[4], { walk: 1.5, wipe: 0.8 });
    await this.serve(this.ale, this.laps[3], { walk: 1.4, wipe: 1.0 });
    await this.atYourFeet(D);
    await D.wait(0.2);
    // he moves on up the aisle while you read what's in your lap
    this.engine.dof({ focus: 0.72, aperture: 0.004 });
    this.cam([0.64, 1.12, 1.3], this.lapLook(), 1.8, 34);
    const up = walkPath(boy, [[0, 0, -1.9]], 1.2).then(() => { boy.turnTo = PI; });
    await D.say('', '<em>"Pang-kain lang po. Salamat po."</em>', { hold: 3.2 });
    // the ale
    this.ale.look(new THREE.Vector3(0.7, 1.1, 1.3), 1); this.ale.set({ spine: [0, -12, 0] });
    this.engine.dof({ target: this.ale.head, aperture: 0.003 });
    await this.cam([0.66, 1.13, 1.3], [0.62, 1.02, 0.5], 1.8, 44);
    this.ale.expression({ worry: 0.7, sad: 0.3 });
    await D.say('Ale', "'Wag mong bigyan. Sindikato 'yan.");
    this.ale.set({ spine: [0, 0, 0] }); this.ale.look(null);
    this.engine.dof({ focus: 0.72, aperture: 0.004 });
    await this.cam([0.66, 1.13, 1.3], this.lapLook(), 1.6, 40);
    await D.say('', "₱160 ang laman ng wallet mo. Pamasahe at pagkain mo na 'yan hanggang Biyernes.");
    await up;

    await this.collect(D);
    const pick = await D.choose(['Magbigay|Lagyan ng bente', "Ibalik|Sindikato naman 'yan"], { timer: 10, id: 'sobre', def: 1 });
    const gave = pick === 0;
    S.sobre = gave;
    if (gave) {
      S.wallet -= 20;
      await this.putCoin();
      this.engine.dof({ target: boy.head, aperture: 0.002 });
      this.cam([0.66, 1.12, 1.3], [0.02, 0.98, 1.36], 1.0, 50);
      await this.takeBack();
      boy.look(new THREE.Vector3(0.7, 1.12, 1.3), 1); boy.expression({ smile: 1 });
      boy.anim = (t, q) => { q.hips.position.y += Math.max(0, Math.sin(t * 7)) * 0.012; };
      await D.say('Totoy', 'Salamat po, kuya.');
      boy.anim = null;
      D.patak('Totoy', 'napangiti');
    } else {
      await this.takeBack();
      boy.look(null); boy.set({ neck: [34, 0, 0], spine: [8, 0, 0] }); boy.expression({ sad: 0.8 });
      await D.wait(0.9);
      await D.say('', D.lastTimedOut ? 'Hindi ka nakapagdesisyon. Kinuha niya ang sobre.' : 'Kinuha niya ang sobre nang hindi ka tinitingnan.');
      D.patak('Totoy', 'hindi ka na tiningnan');
    }
    await this.hopOff(D);
    await D.wait(1.5);
    await D.black(true, 1.6);
  },

  /** Part Two: the next morning, nothing changed */
  async montage(D, S) {
    this.settle();
    this.resetBoy(); this.offset += 40;
    this.engine.rig.set({ pos: [0.66, 1.13, 1.3], look: [-1, 0.98, 1.1], fov: 50 });
    await D.black(false, 1.2);
    cast(D).bark(this.l1, 'Bayad po.'); audio.barya();
    await D.wait(1.6);
    await this.board(D);
    await this.atYourFeet(D, false);
    await D.say('', S.sobre ? 'Parehong bata. Parehong sobre. Hindi ka niya naaalala.' : 'Parehong bata. Parehong sobre.');
    await this.atTheStop(D);
  },

  /** out of the open back, across the road: the jeep stop, where the same thing is happening in every jeep */
  async atTheStop(D) {
    const st = this.stop, E = this.engine, rig = E.rig, S = this.scene, X = 3, eye = [0.05, 1.12, 2.08];
    await D.black(true, 0.3);
    // we have stopped at the corner too, out in the inner lane: the street sits 3 m further right than usual
    this.targetSpeed = 0; this.speed = 0; audio.engine(1, 0.3);
    this.stopZ0 = this.offset; this.atStop = true;
    this.street.position.x = X; this.oncoming.group.position.x = X; this.oncoming2.group.visible = false;
    // one car just gone past, the rest still up the road behind the cut
    this.oncoming.cars.forEach((c, i) => (c.position.z = i ? -80 - i * 6 : 16));
    st.reset(X); st.group.visible = true;
    st.borrow({ lamp: this.sweep[0], shop: this.sweep[1], a: this.low, b: this.rim });
    const fog0 = S.fog.density, shake = rig.shake;
    S.fog.density = 0.03; rig.shake = 0.3;
    audio.murmur(0.5);
    E.dof({ focus: 11, aperture: 0.0008, maxblur: 0.004 });
    rig.set({ pos: eye, look: [-6.4, 0.6, 10.6], fov: 32 });
    D.black(false, 0.5);
    st.play(D, cast(D));
    await D.wait(1.8);
    // the first kid, up the step and in
    this.cam(eye, [-6.9, 0.45, 9.3], 3.6, 19);
    await D.wait(5.2);
    // the next one has walked up along that jeep to the one behind it
    E.dof({ focus: 18, aperture: 0.0007, maxblur: 0.004 });
    this.cam(eye, [-6.95, 0.5, 19.2], 2.4, 16);
    await D.wait(2.6);
    await D.say('', 'Sa ibang jeep, may mga bata ring sumasakay. May dala rin silang sobre.', { hold: 4.2 });
    // we pull away; they stay
    this.targetSpeed = 3; audio.engine(1, 0.8);
    await D.wait(1.4);
    await D.black(true, 0.9);
    audio.murmur(0); st.giveBack(); st.group.visible = false; this.atStop = false;
    this.street.position.x = 0; this.oncoming.group.position.x = 0; this.oncoming2.group.visible = true;
    S.fog.density = fog0; rig.shake = shake;
  },

  /** Part Four: Thursday. Same choice, no outcome shown. Returns the pick. */
  async again(D, S) {
    this.settle();
    this.resetBoy(); this.offset += 80;
    this.laps.forEach(e => (e.visible = true)); this.myEnv.visible = true; this.pileCount(2);
    this.tuck(true);
    this.boy.root.position.set(0, 0, -1.9); this.boy.root.rotation.y = 0;
    this.engine.dof({ focus: 0.75, aperture: 0.004 });
    this.engine.rig.set({ pos: [0.66, 1.13, 1.3], look: [0.38, 0.5, 1.29], fov: 34 });
    await D.black(false, 1.4);
    await D.wait(0.8);
    await D.say('', '₱20 na lang ang laman ng wallet mo. Bukas pa ang sahod.');
    await this.collect(D);
    const pick = await D.choose(['Magbigay|Ibigay ang huling bente mo', 'Ibalik|Wala ka na ring pera'], { timer: 10, id: 'ulit', def: 1 });
    if (pick === 0) await this.putCoin();
    await this.takeBack();
    await D.black(true, 1.4);
    return pick;
  },
};
