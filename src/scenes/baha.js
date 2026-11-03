import * as THREE from 'three';
import { prewarm } from '../engine/prewarm.js';
import { photo3d } from '../engine/photo3d.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { splat } from '../engine/splat.js';
import { Person } from '../engine/person.js';
import { std, cyl, box, at } from '../engine/kit.js';
import { walkPath } from '../engine/tween.js';

/** the family's small brown dog with the orange harness (IMG_6475). Faces +Z, feet at y = 0. */
function dog() {
  const G = new THREE.Group(), fur = new THREE.MeshStandardMaterial({ color: 0x7d6248, roughness: 0.95 });
  const lumps = (r, sx, sy, sz, x, y, z, seed = 1) => {
    const g = new THREE.IcosahedronGeometry(r, 3), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 70 + seed) * Math.cos(p.getY(i) * 66 + seed) * Math.sin(p.getZ(i) * 62) * 0.1; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    g.computeVertexNormals(); const m = new THREE.Mesh(g, fur); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; return m;
  };
  G.add(lumps(0.13, 0.85, 0.8, 1.35, 0, 0.27, 0, 2));
  G.add(lumps(0.1, 0.9, 0.95, 1, 0, 0.3, 0.13, 4));
  const head = new THREE.Group(); head.position.set(0, 0.4, 0.2); G.add(head);
  head.add(lumps(0.085, 1, 0.95, 1, 0, 0.02, 0, 5), lumps(0.042, 0.9, 0.75, 1.3, 0, -0.012, 0.09, 6));
  head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), std(0x0c0a09, { rough: 0.3 })), 0, 0, 0.145));
  for (const s of [-1, 1]) {
    head.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), std(0x0a0807, { rough: 0.2 })), s * 0.036, 0.03, 0.073));
    const e = lumps(0.05, 0.6, 1.25, 0.8, s * 0.082, -0.015, -0.01, 7 + s); e.rotation.z = s * 0.2; head.add(e);
  }
  for (const [x, z] of [[-0.06, 0.14], [0.06, 0.14], [-0.06, -0.13], [0.06, -0.13]]) { G.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(0.036, 0.09, 4, 8), fur), x, 0.085, z)); }
  const tail = lumps(0.05, 0.75, 1.3, 0.75, 0, 0.0, 0, 9); const tp = new THREE.Group(); tp.position.set(0, 0.33, -0.15); tail.position.y = 0.05; tp.add(tail); tp.rotation.x = -0.7; G.add(tp);
  // orange harness
  const hm = std(0xc4641c, { rough: 0.6 });
  const h1 = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.009, 8, 28), hm); h1.position.set(0, 0.3, 0.13); G.add(h1);
  const h2 = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.009, 8, 28), hm); h2.position.set(0, 0.28, -0.01); h2.scale.set(0.84, 0.78, 1); G.add(h2);
  G.head = head; G.tail = tp;
  return G;
}

/* Aug 17, 2026, on foot. Every stop is one of our real photos (depth-mapped), in the order they were taken.
   Want to swap a stop for a Gaussian splat? See README → "Splats". */
const P = 0.75, L = 4 / 3;
const STOPS = {
  street: { name: 'IMG_6458', aspect: P, near: 2.2, far: 70, water: { y: -1.4, strength: 0.4 }, time: '3:00 PM', rain: 0.8, look: [0, -0.4, -10], move: [[0.0, -0.02, -1.6], [0.2, -1.0, -10]] },
  house: { name: 'IMG_6463', aspect: P, near: 1.6, far: 14, time: '3:02 PM', rain: 0, indoor: true, look: [0.3, -1.25, -10], fov: 33, move: [[0.1, -0.12, -0.9], [0.2, -1.75, -10]] },
  boat: { name: 'IMG_6485', aspect: L, near: 2.2, far: 60, water: { y: -1.2, strength: 0.9 }, time: '3:50 PM', rain: 0.7, move: [[-0.25, 0.02, -1.0], [-0.1, -0.25, -10]] },
  walk: { name: 'IMG_6488', aspect: P, near: 2.0, far: 70, water: { y: -1.05, strength: 1.1 }, time: '3:57 PM', rain: 0.6, look: [0, -0.5, -10], move: [[0.0, 0.0, -1.5], [0.1, -1.2, -10]] },
  karinderya: { name: 'IMG_6489', aspect: L, near: 0.55, far: 3.2, time: '4:06 PM', rain: 0, indoor: true, start: [0, 0.08, 0.15], move: [[0.04, -0.02, -0.25], [0.0, -0.5, -2]] },
  sarisari: { name: 'IMG_6493', aspect: P, near: 0.45, far: 40, time: '4:33 PM', rain: 0.25, look: [0, -1.4, -10], move: [[0.0, 0.0, -0.2], [0.0, -2.2, -10]] },
};

export default {
  grade: { lift: [0.0, 0.016, 0.024], gain: [0.8, 0.97, 1.08], sat: 1.2, grain: 0.06, bloom: 0.22, bloomThreshold: 0.9, exposure: 0.46, vignette: 1.15, black: 0.045, gamma: 1.2, curve: 0.5 },

  async build(engine) {
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0x111315);
    this.stops = {};
    for (const [k, o] of Object.entries(STOPS)) {
      // a stop can use a Gaussian splat instead of the photo: add  splat: '/splats/<file>.spz'  (+ start/look/move in the splat's coordinates)
      let g;
      if (o.splat) { try { g = new THREE.Group(); g.add(await splat(engine, S, o.splat, o.splatOpts)); g.update = () => {}; } catch (e) { console.warn('splat failed, using photo', e); g = null; } }
      if (!g) g = photo3d({ hfov: 67, extend: 1.6, ...o });
      g.visible = false; S.add(g); this.stops[k] = g;
    }
    this.rain = new Rain({ count: 9000, size: [14, 9, 18], speed: 9, opacity: 0.38, wind: [0.2, 0.6] });
    S.add(this.rain.mesh);
    this.cur = null;

    // the family, in the room they let us into. The photo's room is about 1.3× life size in its own units.
    const F = this.fam = new THREE.Group(); F.visible = false; S.add(F);
    F.add(new THREE.HemisphereLight(0xfff0e0, 0x3a3230, 1.7));
    const warm = new THREE.PointLight(0xffc79a, 7, 9, 1.2); warm.position.set(1.6, 1.0, -4.2); F.add(warm);
    const low = new THREE.PointLight(0xffd8b8, 3.5, 6, 1.2); low.position.set(-0.1, -0.8, -4.4); F.add(low);
    const PI = Math.PI;
    const fig = (o, x, z, ry) => { const p = new Person({ slippers: true, ...o }); p.root.scale.setScalar(1.3); p.root.position.set(x, -1.98, z); p.root.rotation.y = ry; F.add(p.root); return p; };
    // the mom: white tee, navy pants, white slides (IMG_6475, and under the umbrella in IMG_6462)
    this.nanay = fig({ real: 'nanay', h: 1.76, build: 0.9 }, 1.25, -7.6, -0.4);
    // striped top: bands by height on the body, so they stay on her when she moves
    const stripe = new THREE.MeshStandardMaterial({ color: 0xb8b6b0, roughness: 0.9 });
    stripe.onBeforeCompile = s => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying float vBand;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvBand = position.y;');
      s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vBand;').replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(0.12, 1.0, step(0.5, fract(vBand * 16.0)));');
    };
    // her daughter: black-and-white striped tee, long black hair, shorts, with the dog (IMG_6475)
    this.anak = fig({ real: 'anak', h: 1.6, build: 0.88 }, -0.48, -5.75, 0.35);
    this.anak.pose('kneelDown', true).set({ spine: [24, 0, 0], neck: [26, 0, 0], shL: [-20, 0, 8], elL: [-60, 0, 0] }, true);
    this.dog = dog(); this.dog.scale.setScalar(1.12); this.dog.position.set(0.02, -1.98, -5.55); this.dog.rotation.y = 0.5; F.add(this.dog);
    // her hand on the dog's back
    { const v = new THREE.Vector3(); this.anak.reach('R', () => this.dog.localToWorld(v.set(0.02, 0.4, -0.02)), { rate: 30, pole: [-1, -0.8, -0.3] }); }
    // what she brings: a glass of water and a pack of biscuits
    const glass = cyl(0.03, 0.026, 0.1, new THREE.MeshPhysicalMaterial({ color: 0xd8e6ee, roughness: 0.08, transparent: true, opacity: 0.5 }), 14);
    const water = cyl(0.026, 0.023, 0.07, new THREE.MeshPhysicalMaterial({ color: 0xbcd4e0, roughness: 0.05, transparent: true, opacity: 0.55 }), 14); water.position.y = -0.012; glass.add(water);
    const pack = box(0.15, 0.035, 0.09, std(0xd9c17a, { rough: 0.5 }), 0.006);
    this.nanay.arm.R.wr.add(at(glass, 0.0, -0.085, 0.035)); this.nanay.arm.L.wr.add(at(pack, 0.0, -0.075, 0.03, 0, 0, PI / 2));
    this.nanay.set({ shR: [-14, 0, -8], elR: [-66, 0, 0], shL: [-14, 0, 8], elL: [-66, 0, 0] }, true);

    // compile the family's materials during the loading screen, not when the room fades in
    F.visible = true;
    const r = engine.renderer; r.setRenderTarget(engine.composer.renderTarget1);
    const done = r.compileAsync(S, engine.camera); r.setRenderTarget(null); await done;
    F.visible = false;
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.9; engine.rig.jolt = 0;
    // compile the family's materials now, while the screen is black, not when the room fades in
    this.fam.visible = true; prewarm(engine); this.fam.visible = false;
  },
  exit() { audio.layer('murmur', 0); audio.layer('flood', 0); audio.scape(null); },
  update(dt, t) {
    if (this.cur) this.cur.update(t);
    this.rain.update(t, this.engine.camera);
    if (this.fam.visible) {
      this.nanay.update(dt, t); this.anak.update(dt, t);
      this.dog.tail.rotation.z = Math.sin(t * 13) * 0.5;
      this.dog.head.rotation.y = Math.sin(t * 0.8) * 0.35; this.dog.head.rotation.x = Math.sin(t * 1.3) * 0.08;
    }
  },

  /** cut to a stop and start its slow camera drift */
  async go(D, key, { fade = 0.9, stampIt = true } = {}) {
    const o = STOPS[key];
    if (this.cur) await D.black(true, fade * 0.7);
    for (const g of Object.values(this.stops)) g.visible = false;
    this.cur = this.stops[key]; this.cur.visible = true;
    this.fam.visible = key === 'house';
    const rig = this.engine.rig;
    rig.set({ pos: o.start || [0, 0, 0], look: o.look || [0, -0.9, -10], fov: o.fov || (o.aspect < 1 ? 31 : 41) });
    rig.move({ pos: o.move[0], look: o.move[1], dur: 16, e: 'sine' });
    this.rain.mesh.visible = o.rain > 0; this.rain.uniforms.uOpacity.value = 0.38 * (o.rain || 0);
    if (o.indoor) { audio.scape('baha', 0.25); audio.rain(0.42, 0.88); audio.murmur(0.05); } else { audio.scape('baha'); audio.rain(0.9 * (o.rain || 0.3) + 0.2, 0.05); audio.murmur(0.35); }
    await D.black(false, fade);
    if (stampIt) D.stamp(`<b>${o.time}</b>Brgy. Del Monte, Quezon City`, 4.5);
  },

  /* ================= Part Three, on foot ================= */
  async play(D, S) {
    await this.go(D, 'house', { fade: 1.6 });
    await D.say('', 'Kailangan nang mag-CR ni Keira. Pinapasok kami ng isang pamilyang hindi namin kilala.');
    const n = this.nanay;
    walkPath(n, [[0.95, -1.98, -6.9], [0.7, -1.98, -6.05]], 0.85).then(() => n.set({ shR: [-34, 0, -8], elR: [-62, 0, 0], shL: [-34, 0, 8], elL: [-62, 0, 0], neck: [10, 0, 0] }));
    await D.say('', 'Tubig. Biskwit. Silong habang bumubuhos. Kuwentuhan.');
    await D.say('', 'May aso sila. Mga apatnapung minuto kami roon.');
    await this.go(D, 'boat');
    audio.file('flood', '/audio/flood-real.mp3', 0.9);
    await D.say('', 'Dumating ang rescue boat ng barangay sa kanto.');
    await D.wait(0.8);
    audio.layer('flood', 0, null, 2);
    await this.go(D, 'karinderya');
    await D.say('', 'Kumain kami sa karinderya. Bumili sa sari-sari store. Ang babait nila.');
    await D.black(true, 1.4);
    audio.rain(0.4, 0.6);
    await D.say('', 'Nung humupa ang tubig, nakauwi na rin kami.');
    await D.say('', 'Hindi namin natanong ang mga pangalan nila.', { hold: 3.6 });
  },
};
