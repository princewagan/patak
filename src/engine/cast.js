import * as THREE from 'three';
import '../cues.css';

/* Who is who on screen, so the story can be followed from the back of a classroom.
   - a name tag floats over whoever is speaking
   - the first time we meet someone, a short card says who they are to you
   Use it from a scene: const C = cast(D); C.people({ "Ma'am Joy": joy }); C.intro("Ma'am Joy", 'Manager ninyo.'); */

const v = new THREE.Vector3();

class Cast {
  constructor(engine, D) {
    this.engine = engine; this.who = new Map(); this.speaking = null; this.seen = new Set();
    const ui = document.querySelector('#ui');
    this.tag = document.createElement('div'); this.tag.id = 'speaker'; ui.appendChild(this.tag);
    this.card = document.createElement('div'); this.card.id = 'who'; this.card.innerHTML = '<b></b><span></span>'; ui.appendChild(this.card);

    // every spoken line passes through here, so scenes keep calling D.say as usual
    const say = D.say.bind(D);
    D.say = async (name, text, o) => {
      this.speak(name);
      try { return await say(name, text, o); } finally { if (!o || o.wait !== false) this.speak(null); }
    };
    engine.onUpdate(() => this.place());
  }

  /** map the names used in D.say to the Person standing in the scene; replaces the previous scene's list */
  people(map) { this.who = new Map(Object.entries(map)); this.speak(null); }

  speak(name) {
    if (this.speaking) this.speaking.talking = false;
    this.speaking = (name && this.who.get(name)) || null;
    if (this.speaking) this.speaking.talking = true;
    this.tag.textContent = this.speaking ? name : '';
    this.tag.classList.toggle('on', !!this.speaking);
  }

  place() {
    const p = this.speaking; if (!p) return;
    (p.head || p).getWorldPosition(v);
    v.y += (p.h || 1.6) * 0.14;
    v.project(this.engine.camera);
    const on = v.z < 1 && Math.abs(v.x) < 0.92 && v.y < 0.98 && v.y > -0.72;
    this.tag.style.visibility = on ? 'visible' : 'hidden';
    if (on) this.tag.style.transform = `translate(calc(${(v.x * 0.5 + 0.5) * innerWidth}px - 50%), calc(${Math.max(innerHeight * 0.135, (0.5 - v.y * 0.5) * innerHeight)}px - 100%))`;
  }

  /** a stranger's passing line in a small bubble over their head, like Persona's street chatter. No subtitle, no pause. */
  bark(person, text, hold = 2.4) {
    const el = document.createElement('div'); el.className = 'bark'; el.textContent = text;
    document.querySelector('#ui').appendChild(el);
    const follow = () => {
      (person.head || person).getWorldPosition(v);
      v.y += (person.h || 1.6) * 0.13;
      v.project(this.engine.camera);
      const on = v.z < 1 && Math.abs(v.x) < 0.9 && v.y < 0.98 && v.y > -0.72;
      el.style.visibility = on ? 'visible' : 'hidden';
      if (on) el.style.transform = `translate(calc(${(v.x * 0.5 + 0.5) * innerWidth}px - 50%), calc(${Math.max(innerHeight * 0.135, (0.5 - v.y * 0.5) * innerHeight)}px - 100%)) skewX(-8deg)`;
    };
    follow();
    const stop = this.engine.onUpdate(follow);
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => { stop(); el.remove(); }, 250); }, hold * 1000);
  }

  /** the first time we meet someone: name and who they are to you. Runs beside the scene, it does not hold it up. */
  intro(name, role, hold = 5) {
    if (this.seen.has(name)) return;
    this.seen.add(name);
    this.remind(name, role, hold);
  }

  /** the same card, shown every time: for bringing someone back later in the story */
  remind(name, role, hold = 5) {
    const c = this.card;
    c.querySelector('b').textContent = name; c.querySelector('span').textContent = role;
    c.classList.remove('on'); void c.offsetWidth; c.classList.add('on');
    clearTimeout(this._c); this._c = setTimeout(() => c.classList.remove('on'), hold * 1000);
  }
}

let the = null;
/** the one Cast for this game */
export const cast = D => (the ??= new Cast(D.engine, D));
