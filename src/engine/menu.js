import { audio } from './audio.js';

const $ = s => document.querySelector(s);

/* every place you can jump to, in story order (keys are the chapters in story.js) */
export const SCENES = [
  ['sobre', 'Sobre', 'Jeep sa Aurora Blvd'],
  ['kaha', 'Kaha', 'Fast food sa Cubao'],
  ['bigas', 'Bigas', 'Sari-sari store'],
  ['gabi', 'Gabi', 'Kuwarto mo'],
  ['totoo', 'Sa Totoo Lang', 'Miyerkules'],
  ['kami', 'Kami', 'Sa kotse'],
  ['labas', 'Sa Labas', 'Ang jeep sa baha'],
  ['bahay', 'Sa Bahay', 'Ang pamilya'],
  ['ulit', 'Ulit', 'Ang nangyari sa kanila'],
  ['end', 'Wakas', 'Mga litrato'],
];

/** Pause menu and scene list: lets Keira and Prince control the game during the presentation. */
export class Menu {
  constructor(engine, D, begin) {
    this.engine = engine; this.D = D; this.begin = begin;
    this.started = false; this.open = false; this.wasFull = false; this.fsMine = false;
    D.menu = this;
    this.el = $('#menu');
    this.items = [
      ['resume', 'Ituloy', () => this.close()],
      ['skip', 'Laktawan ang eksena', () => this.skip()],
      ['scenes', 'Mga Eksena', () => this.showScenes(true)],
      ['sound', '', () => { audio.toggleMute(); this.refresh(); }],
      ['full', 'Fullscreen', () => this.fullscreen()],
      ['restart', 'Simulan muli', () => { location.href = location.pathname; }],
    ];
    const box = $('#menuItems');
    for (const [id, label, fn] of this.items) {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.id = id; b.textContent = label; b.onclick = fn;
      box.appendChild(b);
    }
    const list = $('#sceneItems');
    SCENES.forEach(([key, name, where], i) => {
      const b = document.createElement('button');
      b.className = 'chip scene'; b.dataset.key = key;
      b.innerHTML = `<span class="no">${String(i + 1).padStart(2, '0')}</span><span class="nm">${name}</span><span class="wh">${where}</span>`;
      b.onclick = () => this.go(key);
      list.appendChild(b);
    });
    $('#menuBack').onclick = () => { if (this.started) this.showScenes(false); else this.close(); };
    $('#pausebtn').onclick = () => this.toggle();
    addEventListener('mousemove', () => this.wake());
    document.addEventListener('fullscreenchange', () => {
      // Esc leaves fullscreen before the page ever sees the key, so treat that exit as "open the menu"
      const leaving = !document.fullscreenElement;
      if (leaving && !this.fsMine && this.started && !this.open) { this.wasFull = true; this.toggle(); }
      this.fsMine = false;
    });
    this.refresh();
  }

  wake() {
    if (!this.started) return;
    const b = $('#pausebtn'); b.classList.add('on');
    clearTimeout(this._w); this._w = setTimeout(() => b.classList.remove('on'), 2200);
  }

  refresh() { const b = $('#menuItems [data-id=sound]'); if (b) b.textContent = `Tunog: ${audio.muted ? 'Sarado' : 'Bukas'}`; }

  toggle() { if (!this.started) return; this.open ? this.close() : this.show(); }

  show() {
    this.open = true; this.D.pause(true); this.showScenes(false);
    this.el.classList.add('on');
    this.refresh();
    $('#menuItems button').focus({ preventScroll: true });
  }

  close() {
    this.open = false; this.el.classList.remove('on', 'scenes', 'scenesonly');
    if (!this.started) { document.querySelector('#scenesBtn')?.focus({ preventScroll: true }); return; }
    this.D.pause(false);
    if (this.wasFull) { this.wasFull = false; this.fullscreen(true); }
  }

  showScenes(on) {
    this.el.classList.toggle('scenes', on);
    document.querySelectorAll('#sceneItems .scene').forEach(b => b.classList.toggle('now', b.dataset.key === this.D.chapter));
    if (on) $('#sceneItems button').focus({ preventScroll: true });
  }

  /** title screen: the scene list on its own */
  titleScenes() { this.open = true; this.el.classList.add('on', 'scenes', 'scenesonly'); $('#sceneItems button').focus({ preventScroll: true }); }

  fullscreen(force) {
    this.fsMine = true;
    if (document.fullscreenElement && !force) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => { this.fsMine = false; });
  }

  /** arrow keys in the menu */
  key(e) {
    const k = e.key;
    if (k !== 'ArrowDown' && k !== 'ArrowUp') return;
    e.preventDefault();
    const list = [...document.querySelectorAll(this.el.classList.contains('scenes') ? '#sceneItems button, #menuBack' : '#menuItems button')];
    const i = list.indexOf(document.activeElement);
    list[(i + (k === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus();
  }

  skip() {
    const order = this.D.order || [], i = order.indexOf(this.D.chapter);
    if (i >= 0 && i < order.length - 1) this.go(order[i + 1]);
  }

  /** scenes are stateful, so a jump is a clean reload that keeps his choices so far */
  go(key) {
    if (!this.started) { this.close(); this.begin(key); return; }
    const S = this.D.state, st = {};
    for (const k of ['sobre', 'kaha', 'bigas']) if (S[k] != null) st[k] = S[k];
    location.href = `${location.pathname}?from=${key}&state=${encodeURIComponent(JSON.stringify(st))}`;
  }
}

/* the main menu has its own file; main.js keeps calling it by this name */
export { titleScreen as titleRain } from './titlescreen.js';
