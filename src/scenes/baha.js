import * as THREE from 'three';
import { photo3d } from '../engine/photo3d.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { splat } from '../engine/splat.js';

/* Aug 17, 2026, on foot. Every stop is one of our real photos (depth-mapped), in the order they were taken.
   Want to swap a stop for a Gaussian splat? See README → "Splats". */
const P = 0.75, L = 4 / 3;
const STOPS = {
  exits: { name: 'IMG_6448', aspect: P, near: 2.0, far: 70, water: { y: -1.05, strength: 1.2 }, time: '2:51 PM', rain: 1, look: [0.2, -0.6, -10], move: [[0.12, -0.02, -1.2], [-0.4, -0.9, -10]] },
  street57: { name: 'IMG_6457', aspect: P, near: 2.6, far: 80, cut: 0.06, water: { y: -1.05, strength: 1.2 }, time: '2:57 PM', rain: 1, look: [-0.3, -0.5, -10], move: [[0.1, 0.0, -1.4], [0.6, -0.9, -10]] },
  street: { name: 'IMG_6458', aspect: P, near: 2.2, far: 70, water: { y: -1.4, strength: 0.4 }, time: '3:00 PM', rain: 0.8, look: [0, -0.4, -10], move: [[0.0, -0.02, -1.6], [0.2, -1.0, -10]] },
  house: { name: 'IMG_6463', aspect: P, near: 1.6, far: 14, time: '3:02 PM', rain: 0, indoor: true, look: [0.2, -0.6, -10], move: [[0.05, 0.0, -1.1], [0.1, -1.4, -10]] },
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
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.9; engine.rig.jolt = 0;
  },
  exit() { audio.layer('murmur', 0); audio.layer('flood', 0); },
  update(dt, t) {
    if (this.cur) this.cur.update(t);
    this.rain.update(t, this.engine.camera);
  },

  /** cut to a stop and start its slow camera drift */
  async go(D, key, { fade = 0.9, stampIt = true } = {}) {
    const o = STOPS[key];
    if (this.cur) await D.black(true, fade * 0.7);
    for (const g of Object.values(this.stops)) g.visible = false;
    this.cur = this.stops[key]; this.cur.visible = true;
    const rig = this.engine.rig;
    rig.set({ pos: o.start || [0, 0, 0], look: o.look || [0, -0.9, -10], fov: o.fov || (o.aspect < 1 ? 31 : 41) });
    rig.move({ pos: o.move[0], look: o.move[1], dur: 16, e: 'sine' });
    this.rain.mesh.visible = o.rain > 0; this.rain.uniforms.uOpacity.value = 0.38 * (o.rain || 0);
    if (o.indoor) { audio.rain(0.5, 0.85); audio.layer('murmur', 0.05); } else { audio.rain(0.9 * (o.rain || 0.3) + 0.2, 0.05); audio.murmur(0.35); }
    await D.black(false, fade);
    if (stampIt) D.stamp(`<b>${o.time}</b>Brgy. Del Monte, Quezon City`, 4.5);
  },

  /* ================= Part Three, on foot ================= */
  async play(D, S) {
    await this.go(D, 'exits', { fade: 1.6 });
    await D.say('', 'Bumaba kami. Ang daming tao sa labas. Taga-roon sila.');
    await this.go(D, 'street57');
    await D.say('', 'Sila ang unang lumapit at kumausap sa amin.');
    await D.wait(0.4);
    await D.ask(['Lagi po bang bumabaha rito?', 'Bakit po walang madaanan palabas?'], async i => {
      if (i === 0) await D.say('', 'Madalas daw. Pero ito na raw ang pinakamalala.');
      else await D.say('', 'Mataas daw ang gitna ng village. Lahat ng labasan, pababa.');
    });
    await D.say('', 'Kailangan nang mag-CR ni Keira. Pinapasok kami ng isang pamilyang hindi namin kilala.');
    await this.go(D, 'house');
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
