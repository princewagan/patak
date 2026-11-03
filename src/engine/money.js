import * as THREE from 'three';

/* Real Philippine money: one place to get a note or a coin at its true size, so the whole game matches.
   Images are in public/tex/money (sources in public/tex/money/CREDITS.md). */

const loader = new THREE.TextureLoader();
const cache = new Map();
const tex = name => {
  if (!cache.has(name)) {
    const t = loader.load(`/tex/money/${name}.jpg`);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    cache.set(name, t);
  }
  return cache.get(name);
};

/* a real note is 160 × 66 mm; it never lies dead flat, so it keeps a slight curl */
export function billMesh(value, width = 0.16) {
  const h = width * 66 / 160, g = new THREE.PlaneGeometry(width, h, 12, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin((p.getX(i) / width + 0.5) * Math.PI) * width * 0.03);
  g.computeVertexNormals();
  const side = n => new THREE.MeshStandardMaterial({ map: tex(n), color: 0x8c8c8c, roughness: 0.82, metalness: 0 });   // printed paper is far from white; left bright it glows under the game's lights
  const note = new THREE.Mesh(g, side(`b${value}f`));
  const back = new THREE.Mesh(g, side(`b${value}b`));
  back.rotation.y = Math.PI; back.position.z = -0.0002; note.add(back);
  note.castShadow = true; note.receiveShadow = true;
  return note;
}

/* true sizes in metres: ₱1 23 mm, ₱5 25 mm, ₱10 27 mm, ₱20 30 mm */
const COINS = { 1: 0.0115, 5: 0.0125, 10: 0.0135, 20: 0.015 };
export function pesoCoin(value) {
  const r = COINS[value] ?? COINS[10], rim = value >= 10 ? 0xd2bd84 : 0xc4c7ca;
  const face = n => new THREE.MeshStandardMaterial({ map: tex(n), metalness: 0.3, roughness: 0.42 });
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.0024, 36), [new THREE.MeshStandardMaterial({ color: rim, metalness: 0.9, roughness: 0.35 }), face(`c${value}f`), face(`c${value}b`)]);
  c.castShadow = true;
  return c;
}
