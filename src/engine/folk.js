import { Person } from './person.js';

/*
  The people who have no realistic model (Rocketbox) stay in the scene, but only as shadows: dark, matte figures
  in the background, so the eye goes to the real people and the procedural faces never read.
  Done from outside person.js: the first time a procedural person updates it is darkened, and any later
  shade(k) a scene asks for is applied on top of that. ?noreal (the old people everywhere) turns this off;
  new Person({ lit: true }) keeps one procedural person fully lit.
*/
const K = 0.11;

function matte(p) {
  p.root.traverse(o => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      if (!m || m.userData.folk) continue;
      m.userData.folk = true;
      if ('roughness' in m) m.roughness = 1;
      if ('metalness' in m) m.metalness = 0;
      if ('envMapIntensity' in m) m.envMapIntensity = 0.12;
      if (m.emissive) m.emissive.setScalar(0);
      if ('clearcoat' in m) m.clearcoat = 0;
      if ('sheen' in m) m.sheen = 0;
      m.needsUpdate = true;
    }
  });
}

if (!new URLSearchParams(location.search).has('noreal')) {
  const shade = Person.prototype.shade, update = Person.prototype.update;
  Person.prototype.shade = function (k) { this._k = k; return shade.call(this, this.real || this.o?.lit ? k : k * K); };
  Person.prototype.update = function (...a) {
    if (!this._folk) {
      this._folk = true;
      if (!this.real && !this.o?.lit) { matte(this); shade.call(this, (this._k ?? 1) * K); }
    }
    return update.apply(this, a);
  };
}
