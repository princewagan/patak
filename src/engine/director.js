import { audio } from './audio.js';

const $ = s => document.querySelector(s);
export const sleep = s => new Promise(r => setTimeout(r, s * 1000));

/** Story-facing helpers. Every helper returns a promise the script awaits. */
export class Director {
  constructor(engine) {
    this.engine = engine;
    this.state = { choices: {}, wallet: 160 };
    this.skipLine = null;
    this.choiceKeys = null;
    this.fast = new URLSearchParams(location.search).has('fast');
    addEventListener('keydown', e => this.key(e));
    addEventListener('pointerdown', e => { if (e.target.closest('button')) return; this.advance(); });
  }

  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); return; }
    if (k === 'm') { audio.toggleMute(); return; }
    if (this.choiceKeys) {
      if (k === 'arrowleft' || k === 'a') return this.choiceKeys(0);
      if (k === 'arrowright' || k === 'd') return this.choiceKeys(1);
      if ((k === 'enter' || k === ' ') && this.choiceKeys.single) return this.choiceKeys(0);
    }
    if (k === ' ' || k === 'enter' || k === 'arrowright') { e.preventDefault(); this.advance(); }
  }
  advance() { if (this.skipLine) { const f = this.skipLine; this.skipLine = null; f(); } }

  // ---------- timing ----------
  wait(s) { return sleep(this.fast ? s * 0.15 : s); }
  readTime(text) { return Math.min(6.2, Math.max(2.0, 1.0 + text.length * 0.05)); }

  // ---------- fades / bars ----------
  async black(on, s = 1.2) {
    const f = $('#fader'); f.style.transitionDuration = s + 's'; f.style.opacity = on ? 1 : 0;
    await this.wait(s);
  }
  bars(on) { document.body.classList.toggle('nobars', !on); }

  // ---------- subtitles ----------
  /** say('Ale', "line") — speaker line. say('', "...") — narration (italic serif) */
  async say(who, text, { hold, wait = true } = {}) {
    const sub = $('#sub');
    sub.querySelector('.who').textContent = who || '';
    sub.querySelector('.line').innerHTML = text;
    sub.classList.toggle('narr', !who);
    sub.classList.add('on');
    if (!wait) return;
    const t = hold ?? this.readTime(text.replace(/<[^>]+>/g, ''));
    await this.holdOrSkip(t);
    sub.classList.remove('on');
    await this.wait(0.25);
  }
  clearSub() { $('#sub').classList.remove('on'); }
  holdOrSkip(t) {
    return new Promise(res => {
      const min = Math.min(0.6, t);
      let done = false; const fin = () => { if (done) return; done = true; clearTimeout(to); $('#hint').classList.remove('on'); this.skipLine = null; res(); };
      const to = setTimeout(fin, (this.fast ? t * .15 : t) * 1000);
      setTimeout(() => { if (!done) { this.skipLine = fin; $('#hint').classList.add('on'); } }, min * 1000);
    });
  }

  // ---------- chapter card ----------
  async card(part, title, meta, { hold = 3.4, sting = true } = {}) {
    const c = $('#card');
    c.querySelector('.part').textContent = part || '';
    c.querySelector('.title').innerHTML = [...title].map((ch, i) => `<span style="transition-delay:${i * 0.07}s">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    c.querySelector('.meta').textContent = meta || '';
    if (sting) audio.sting();
    await this.wait(0.05);
    c.classList.add('on');
    await this.wait(hold);
    c.classList.remove('on');
    await this.wait(1.2);
  }

  async charCard(name, lines, hold = 6.5) {
    const c = $('#charcard');
    c.querySelector('.name').textContent = name;
    const box = c.querySelector('.lines');
    box.innerHTML = lines.map(l => `<div class="${l.startsWith('₱') ? 'money' : ''}">${l}</div>`).join('');
    c.classList.add('on');
    await this.wait(0.9);
    for (const d of box.children) { d.classList.add('in'); await this.wait(0.55); }
    await this.holdOrSkip(hold);
    c.classList.remove('on');
    await this.wait(1.1);
  }

  /** lines shown one after another in the center. items: string | {t, cls, hold} */
  async lines(items, { clearAfter = true, gap = 0.4 } = {}) {
    const box = $('#bigline'); box.innerHTML = '';
    for (const it of items) {
      const o = typeof it === 'string' ? { t: it } : it;
      const d = document.createElement('div'); d.innerHTML = o.t; if (o.cls) d.className = o.cls;
      box.appendChild(d); await this.wait(0.05); d.classList.add('in');
      if (o.sfx) o.sfx();
      await this.holdOrSkip(o.hold ?? this.readTime(o.t) * 0.9);
      if (o.alone) { d.classList.remove('in'); await this.wait(1.0); d.remove(); }
      await this.wait(gap);
    }
    if (clearAfter) { for (const d of box.children) d.classList.remove('in'); await this.wait(1.4); box.innerHTML = ''; }
  }
  clearLines() { const box = $('#bigline'); for (const d of box.children) d.classList.remove('in'); setTimeout(() => (box.innerHTML = ''), 1400); }

  // ---------- choices ----------
  /**
   * choose(['A','B'], { timer: 10, prompt, slowmo: true, def: 1 }) → index.
   * On timeout returns def (default 1) and sets this.lastTimedOut.
   */
  choose(opts, { timer = 0, slowmo = true, def = 1, id, defLabel = 'Walang gagawin' } = {}) {
    return new Promise(res => {
      const el = $('#choice'), [l, r] = el.querySelectorAll('.opt'), ring = el.querySelector('.ring'), needle = el.querySelector('.needle');
      const parse = o => { const [a, b] = String(o).split('|'); return b != null ? [a, b] : ['', a]; };
      const single = opts.length === 1;
      [[l, opts[0]], [r, opts[1] ?? '']].forEach(([b, o]) => { const [lab, ln] = parse(o); b.querySelector('.lab').textContent = lab; b.querySelector('.ln').textContent = ln; });
      el.querySelector('.def').textContent = defLabel;
      el.classList.toggle('single', single);
      [l, r].forEach(b => b.classList.remove('picked', 'dim', 'hl'));
      el.classList.toggle('timed', !!timer);
      ring.style.transition = 'none'; ring.style.strokeDashoffset = '0';
      needle.style.transform = 'rotate(0deg)';
      const aim = i => { needle.style.transform = `rotate(${i === 0 ? -118 : i === 1 ? 118 : 0}deg)`; l.classList.toggle('hl', i === 0); r.classList.toggle('hl', i === 1); };
      l.onmouseenter = () => aim(0); r.onmouseenter = () => aim(1);
      l.onmouseleave = r.onmouseleave = () => aim(-1);
      el.classList.add('on');
      const prevScale = this.engine.timeScale;
      if (timer && slowmo) this.engine.timeScale = 0.35;
      audio.whoosh();
      let hb, to, done = false;
      if (timer) {
        requestAnimationFrame(() => requestAnimationFrame(() => { ring.style.transition = `stroke-dashoffset ${timer}s linear`; ring.style.strokeDashoffset = '326.7'; }));
        let beat = 0.95; const loop = () => { audio.heartbeat(); beat = Math.max(0.45, beat - 0.05); hb = setTimeout(loop, beat * 1000); }; loop();
        to = setTimeout(() => finish(def, true), timer * 1000);
      }
      const finish = (i, timedOut = false) => {
        if (done) return; done = true;
        clearTimeout(hb); clearTimeout(to); this.choiceKeys = null;
        l.onclick = r.onclick = l.onmouseenter = r.onmouseenter = null;
        this.engine.timeScale = prevScale;
        const picked = i === 0 ? l : r, other = i === 0 ? r : l;
        if (!timedOut) { aim(i); picked.classList.add('picked'); other.classList.add('dim'); audio.tone(660, .4, { vol: .06 }); }
        else { aim(-1); l.classList.add('dim'); r.classList.add('dim'); }
        this.lastTimedOut = timedOut;
        if (id) this.state.choices[id] = timedOut ? 'timeout' : i;
        setTimeout(() => { el.classList.remove('on'); }, timedOut ? 500 : 700);
        setTimeout(() => res(i), timedOut ? 700 : 1050);
      };
      l.onclick = () => finish(0); r.onclick = () => finish(1);
      this.choiceKeys = i => { if (single) return finish(0); aim(i); finish(i); };
      // test-only: ?autopick=0|1 answers every choice after 1.5 s
      const ap = new URLSearchParams(location.search).get('autopick');
      if (ap != null) setTimeout(() => finish(single ? 0 : Number(ap)), 1500);
      this.choiceKeys.single = single;
    });
  }

  /** a list of questions; returns when `need` have been asked. onAsk(i) plays the answer. */
  async ask(questions, onAsk, need = questions.length) {
    const box = $('#ask');
    const done = new Set();
    while (done.size < need) {
      const i = await new Promise(res => {
        box.innerHTML = '';
        questions.forEach((q, k) => {
          const b = document.createElement('button'); b.textContent = q;
          if (done.has(k)) b.classList.add('done');
          b.onclick = () => res(k); box.appendChild(b);
        });
        box.classList.add('on'); audio.whoosh();
        if (new URLSearchParams(location.search).has('autopick')) setTimeout(() => res(questions.findIndex((q, k) => !done.has(k))), 1500);
      });
      if (done.has(i)) continue;
      done.add(i);
      box.classList.remove('on');
      await this.wait(0.4);
      await onAsk(i);
    }
  }

  // ---------- time / place stamp (bottom left) ----------
  stamp(text, hold = 4) {
    const el = $('#stamp'); el.innerHTML = text; el.classList.add('on');
    clearTimeout(this._st); this._st = setTimeout(() => el.classList.remove('on'), hold * 1000);
  }

  // ---------- patak marker ----------
  async patak(who, state) {
    const p = $('#patak');
    p.classList.remove('on'); void p.offsetWidth;
    p.querySelector('.who').textContent = who;
    p.querySelector('.state').textContent = state;
    p.classList.add('on');
    setTimeout(() => audio.drop(), 560);
    setTimeout(() => p.classList.remove('on'), 5200);
  }
}
