import * as THREE from 'three';
import { tex } from '../engine/kit.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { animate } from '../engine/tween.js';

/* "Us at the end": the real photos of Keira and Prince from Aug 17, with their real times.
   Locals' faces are softly blurred in the public files (we never asked their names, and they never asked to be online). */
const PHOTOS = [
  { name: 'IMG_6462', time: '3:01 PM', aspect: 4 / 3 },
  { name: 'IMG_6475', time: '3:38 PM', aspect: 4 / 3 },
  { name: 'IMG_6476', time: '3:46 PM', aspect: 4 / 3 },
  { name: 'IMG_3622', time: '4:30 PM', aspect: 4 / 3 },
];

export default {
  grade: { lift: [0, 0, 0], gain: [1, 1, 1], sat: 0.95, grain: 0.05, bloom: 0.12, bloomThreshold: 0.95, exposure: 1.0, vignette: 1.4 },
  async build() {
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0x050607);
    this.planes = PHOTOS.map((p, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6 * p.aspect, 1.6), new THREE.MeshBasicMaterial({ map: tex(`/photos/${p.name}.jpg`), transparent: true, opacity: 0, toneMapped: false }));
      m.position.set((i % 2 ? 0.08 : -0.08), 0, -i * 0.001); m.rotation.z = (i % 2 ? 1 : -1) * 0.012;
      S.add(m); return m;
    });
    this.rain = new Rain({ count: 2500, size: [6, 5, 6], speed: 4, opacity: 0.12, wind: [0.1, 0.2] }); S.add(this.rain.mesh);
  },
  enter(engine) { this.engine = engine; engine.rig.shake = 0.25; engine.rig.set({ pos: [0, 0, 3.2], look: [0, 0, 0], fov: 38 }); },
  update(dt, t) { this.rain.update(t, this.engine.camera); },

  async play(D) {
    audio.stopAll(3); audio.rain(0.25, 0.7); audio.drone(0.5, [55, 82.41, 110, 164.8]);
    await D.black(false, 1.5);
    const notes = [[220, 277.18, 329.63], [196, 246.94, 329.63], [174.61, 220, 261.63], [196, 246.94, 293.66]];
    this.engine.rig.move({ pos: [0, 0, 2.55], look: [0, 0, 0], dur: 24, e: 'linear' });
    for (let i = 0; i < this.planes.length; i++) {
      const m = this.planes[i], prev = this.planes[i - 1];
      audio.chord(notes[i], 0.12, 0.07);
      await animate(k => { m.material.opacity = k; if (prev) prev.material.opacity = 1 - k; }, 1.4, 'inOut');
      D.stamp(`<b>${PHOTOS[i].time}</b>Agosto 17, 2026 · Brgy. Del Monte`, 4.2);
      await D.wait(3.8);
    }
    await D.wait(1.0);
    await D.black(true, 2.0);
  },
};
