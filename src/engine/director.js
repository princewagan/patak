import { audio } from './audio.js';
import { IntroHud } from './introhud.js';
import { voiceFor } from '../voice-lines.js';

const $ = s => document.querySelector(s);

/* Every story timer runs on this clock. It only ticks while the engine runs, so pausing freezes the whole script. */
class Clock {
  now = 0;
  jobs = new Set();
  after(s, fn) { const j = { at: this.now + s, fn }; this.jobs.add(j); return j; }
  cancel(j) { if (j) this.jobs.delete(j); }
  tick(dt) { this.now += dt; for (const j of [...this.jobs]) if (j.at <= this.now) { this.jobs.delete(j); j.fn(); } }
}

/* CSS 'ease', cubic-bezier(.25,.1,.25,1): the curve the fades have always used */
function easeCss(x) {
  let t = x;
  for (let i = 0; i < 6; i++) { const u = 1 - t, f = 0.75 * u * u * t + 0.75 * u * t * t + t * t * t - x; t = Math.min(1, Math.max(0, t - f / (0.75 * u * u + 2.25 * t * t))); }
  const u = 1 - t; return 0.3 * u * u * t + 3 * u * t * t + t * t * t;
}

/* What helping costs him, shown under the helping option (index 0) while the clock runs.
   Only the everyday choices; Part Three is what really happened, so it gets none. A scene can also pass 'Label|line|cost'. */
const COST = {
  sobre: S => `−₱20 · ₱${S.wallet - 20} na lang hanggang Biyernes`,
  kaha: () => 'Baka hindi ka na ma-renew',
  bigas: S => `−₱20 · ₱${S.wallet - 20} na lang, tatlong araw pa`,
  ulit: () => '−₱20 · Wala ka nang matitira',
};

/** Story-facing helpers. Every helper returns a promise the script awaits. */
export class Director {
  constructor(engine) {
    this.engine = engine;
    this.state = { choices: {}, wallet: 160 };
    this.clock = new Clock();
    this.fade = { v: 1, from: 1, to: 1, t: 0, dur: 0, done: null };
    engine.onUpdate((dt, t, raw) => { this.stepFade(raw); this.clock.tick(raw); });
    this.skipLine = null;
    this.choiceKeys = null;
    this.askKeys = null;
    this.paused = false;
    this.menu = null;
    const q = new URLSearchParams(location.search);
    this.fast = q.has('fast');
    this.autopick = q.get('autopick');
    addEventListener('keydown', e => this.key(e));
    addEventListener('pointerdown', e => { if (this.paused || e.target.closest('button')) return; this.advance(); });
  }

  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'f') return this.menu?.fullscreen();
    if (k === 'm') { audio.toggleMute(); this.menu?.refresh(); return; }
    // on the title screen and in any open menu, Enter and Space must reach the focused button
    if (this.menu?.open && k === 'escape' && !this.menu.started) return this.menu.close();
    if (this.menu?.open && !this.menu.started) return this.menu.key(e);
    if (!this.menu?.started) return;
    if (k === 'p' || k === 'escape') return this.menu.toggle();
    if (this.paused) return this.menu.key(e);
    if (this.choiceKeys) {
      if (k === 'arrowleft' || k === 'a') return this.choiceKeys(0);
      if (k === 'arrowright' || k === 'd') return this.choiceKeys(1);
      if ((k === 'enter' || k === ' ') && this.choiceKeys.single) return this.choiceKeys(0);
    }
    if (this.askKeys && /^[1-9]$/.test(k)) return this.askKeys(Number(k) - 1);
    if (k === ' ' || k === 'enter' || k === 'arrowright') { e.preventDefault(); this.advance(); }
  }
  advance() { if (this.skipLine) { const f = this.skipLine; this.skipLine = null; f(); } }

  /** freeze or resume everything: scene, tweens, script, timers, sound */
  pause(on) {
    if (on === this.paused) return;
    this.paused = on; this.engine.paused = on;
    document.body.classList.toggle('paused', on);
    if (audio.ctx) audio.ctx[on ? 'suspend' : 'resume']();
  }

  // ---------- timing ----------
  wait(s) { return new Promise(r => this.clock.after(this.fast ? s * 0.15 : s, r)); }
  readTime(text) { return Math.min(6.2, Math.max(2.0, 1.0 + text.length * 0.05)); }

  // ---------- fades / bars ----------
  /*
    The fade is drawn by the frame loop, not by a CSS transition, so it can never run ahead of the picture.
    A CSS fade kept going while a new scene compiled, and showed the last frame of the old shot until the new one arrived.
    Now a stalled frame holds the fade with it, and the first frame of a fade sits where it starts,
    so a cut made under black is on the canvas before any of it shows.
  */
  black(on, s = 1.2) {
    const F = this.fade;
    F.done?.(); // a newer fade takes over from one still running
    return new Promise(res => Object.assign(F, { from: F.v, to: on ? 1 : 0, t: 0, dur: this.fast ? s * 0.15 : s, fresh: true, done: res }));
  }
  stepFade(raw) {
    const F = this.fade;
    if (!F.done) return;
    if (F.fresh) F.fresh = false; else F.t += raw;
    const k = F.dur > 0 ? Math.min(1, F.t / F.dur) : 1;
    F.v = F.from + (F.to - F.from) * easeCss(k);
    $('#fader').style.opacity = F.v;
    if (k >= 1) { const d = F.done; F.done = null; d(); }
  }
  bars(on) { document.body.classList.toggle('nobars', !on); }

  // ---------- subtitles ----------
  /** say('Ale', "line") — speaker line. say('', "...") — narration. A line in voice-lines.js plays its recording with the subtitle. */
  async say(who, text, { hold, wait = true } = {}) {
    // the recording starts with its subtitle, and the subtitle stays up until it ends (no voices in &fast)
    const url = this.fast ? null : voiceFor(who, text);
    audio.stopVoice();
    const v = url ? await audio.voice(url) : null;
    const sub = $('#sub');
    sub.querySelector('.who').textContent = who || '';
    sub.querySelector('.line').innerHTML = text;
    sub.classList.toggle('narr', !who);
    sub.classList.add('on');
    if (!wait) return;
    let t = hold ?? this.readTime(text.replace(/<[^>]+>/g, ''));
    if (v) t = Math.max(t, v.duration + 0.35);
    await this.holdOrSkip(t);
    v?.stop(0.08); // skipped: cut the voice with a short fade; if it already ended this does nothing
    sub.classList.remove('on');
    await this.wait(0.25);
  }
  clearSub() { $('#sub').classList.remove('on'); }
  holdOrSkip(t) {
    return new Promise(res => {
      const min = Math.min(0.6, t);
      let done = false;
      const fin = () => { if (done) return; done = true; this.clock.cancel(to); this.clock.cancel(arm); $('#hint').classList.remove('on'); this.skipLine = null; res(); };
      const to = this.clock.after(this.fast ? t * .15 : t, fin);
      const arm = this.clock.after(min, () => { if (!done) { this.skipLine = fin; $('#hint').classList.add('on'); } });
    });
  }

  async charCard(name, lines, hold = 6.5) {
    const c = $('#charcard');
    c.querySelector('.name').textContent = name;
    const box = c.querySelector('.lines');
    box.innerHTML = lines.map(l => `<div class="${l.startsWith('₱') ? 'money' : ''}">${l}</div>`).join('');
    c.classList.add('on');
    await this.wait(0.7);
    for (const d of box.children) { d.classList.add('in'); await this.wait(0.4); }
    await this.holdOrSkip(hold);
    c.classList.remove('on');
    await this.wait(0.9);
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
  clearLines() { const box = $('#bigline'); for (const d of box.children) d.classList.remove('in'); this.clock.after(1.4, () => (box.innerHTML = '')); }

  // ---------- choices ----------
  /**
   * choose(['A|line','B|line'], { timer: 10, slowmo: true, def: 1 }) → index.
   * Every choice is timed. If the timer runs out nothing was done, which counts as def (the option where he doesn't help).
   */
  choose(opts, { timer = 10, slowmo = true, def = 1, id, defLabel = 'Walang gagawin' } = {}) {
    return new Promise(res => {
      const el = $('#choice'), [l, r] = el.querySelectorAll('.opt'), ring = el.querySelector('.ring'), needle = el.querySelector('.needle');
      const parse = o => { const [a, b, c] = String(o).split('|'); return b != null ? [a, b, c] : ['', a]; };
      const single = opts.length === 1;
      [[l, opts[0]], [r, opts[1] ?? '']].forEach(([b, o], k) => {
        const [lab, ln, cost0] = parse(o);
        const cost = cost0 ?? (k === 0 && !single && timer ? COST[id]?.(this.state) : null);
        b.querySelector('.lab').textContent = lab; b.querySelector('.ln').textContent = ln;
        let c = b.querySelector('.cost');
        if (!c) { c = document.createElement('span'); c.className = 'cost'; b.querySelector('.txt').appendChild(c); }
        c.innerHTML = cost ? `<b>Kapalit</b>${cost}` : ''; c.hidden = !cost;
      });
      el.querySelector('.def span').textContent = defLabel;
      el.classList.toggle('single', single);
      el.classList.remove('urgent', 'out');
      [l, r].forEach(b => b.classList.remove('picked', 'dim', 'hl'));
      el.classList.toggle('timed', !!timer);
      ring.style.strokeDashoffset = '0';
      needle.style.transform = 'rotate(0deg)';
      const aim = i => { needle.style.transform = `rotate(${i === 0 ? -118 : i === 1 ? 118 : 0}deg)`; l.classList.toggle('hl', i === 0); r.classList.toggle('hl', i === 1); };
      l.onmouseenter = () => { aim(0); audio.tick(); }; r.onmouseenter = () => { aim(1); audio.tick(); };
      l.onmouseleave = r.onmouseleave = () => aim(-1);
      el.classList.add('on');
      const prevScale = this.engine.timeScale;
      if (timer && slowmo) this.engine.timeScale = 0.35;
      audio.choiceIn();
      // the pressure: the world goes quiet and the edges of the screen close in, pulsing with the heart
      const vig = this.vignette();
      if (timer) { document.body.classList.add('pressing'); audio.pressure(true); }
      let hb, stopTimer, done = false;
      const finish = (i, timedOut = false) => {
        if (done) return; done = true;
        this.clock.cancel(hb); stopTimer?.(); this.choiceKeys = null;
        document.body.classList.remove('pressing', 'pressing-hard'); audio.pressure(false);
        l.onclick = r.onclick = l.onmouseenter = r.onmouseenter = l.onmouseleave = r.onmouseleave = null;
        this.engine.timeScale = prevScale;
        el.classList.remove('urgent');
        const picked = i === 0 ? l : r, other = i === 0 ? r : l;
        if (!timedOut) { aim(i); picked.classList.add('picked'); other.classList.add('dim'); audio.uiSelect(); }
        else { aim(-1); el.classList.add('out'); l.classList.add('dim'); r.classList.add('dim'); audio.tone(110, .5, { vol: .1 }); }
        this.lastTimedOut = timedOut;
        this.lastHelped = !timedOut && i === 0 && id !== 'baba';
        if (id) this.state.choices[id] = timedOut ? 'timeout' : i;
        this.clock.after(timedOut ? 1.0 : 0.7, () => el.classList.remove('on'));
        this.clock.after(timedOut ? 1.25 : 1.05, () => res(i));
      };
      if (timer) {
        // the ring runs on game time, so it always moves and it stops while paused
        let left = timer;
        stopTimer = this.engine.onUpdate((dt, t, raw) => {
          left = Math.max(0, left - raw);
          ring.style.strokeDashoffset = String(326.7 * (1 - left / timer));
          if (left < 3) { el.classList.add('urgent'); document.body.classList.add('pressing-hard'); }
          if (left <= 0) finish(def, true);
        });
        let beat = 0.9;
        const pulse = () => {
          audio.heartbeat(1 + (1 - left / timer) * 0.7);
          vig.classList.remove('beat'); void vig.offsetWidth; vig.classList.add('beat');
          beat = Math.max(0.4, beat - 0.055); hb = this.clock.after(beat, pulse);
        };
        pulse();
      }
      l.onclick = () => finish(0); r.onclick = () => finish(1);
      this.choiceKeys = i => { if (single) return finish(0); aim(i); finish(i); };
      this.choiceKeys.single = single;
      // test-only: ?autopick=0|1 answers every choice after 1.5 s; ?autopick=none lets the timer run out
      if (this.autopick != null && this.autopick !== 'none') this.clock.after(1.5, () => finish(single ? 0 : Number(this.autopick)));
    });
  }

  /** a list of questions; returns when `need` have been asked. onAsk(i) plays the answer. */
  async ask(questions, onAsk, need = questions.length) {
    const box = $('#ask');
    const done = new Set();
    while (done.size < need) {
      const i = await new Promise(res => {
        box.innerHTML = '<div class="ttl">Magtanong</div>';
        questions.forEach((q, k) => {
          const b = document.createElement('button');
          b.className = 'chip';
          b.innerHTML = `<span class="key">${k + 1}</span><span class="q">${q}</span>`;
          if (done.has(k)) b.classList.add('done');
          b.onclick = () => { audio.uiSelect(); res(k); }; b.onmouseenter = () => audio.tick(); box.appendChild(b);
        });
        box.classList.add('on'); audio.whoosh();
        this.askKeys = k => { if (k < questions.length && !done.has(k)) { audio.uiSelect(); res(k); } };
        if (this.autopick != null) this.clock.after(1.5, () => res(questions.findIndex((q, k) => !done.has(k))));
      });
      this.askKeys = null;
      if (done.has(i)) continue;
      done.add(i);
      box.classList.remove('on');
      await this.wait(0.4);
      await onAsk(i);
    }
  }

  /** the edge-of-screen darkness used while a choice is on the clock */
  vignette() {
    if (!this._vig) { this._vig = document.createElement('div'); this._vig.id = 'press'; $('#ui').insertBefore(this._vig, $('#choice')); }
    return this._vig;
  }

  // ---------- a new day ----------
  /**
   * A day that nobody can miss: a big slanted plate over the scene as it fades in (doesn't block the script).
   * day('Kinabukasan', 'Miyerkules · 6:41 AM') · day('Huwebes', '6:40 AM', { cash: 20, week: [...], note: '...' })
   */
  day(big, sub, { cash, week, note, delay = 1.2, hold = 4.2 } = {}) {
    const run = async () => {
      await this.wait(delay);
      const H = new IntroHud(); H.el.classList.add('dayhud');
      H.name(big, sub); audio.slam();
      if (cash != null) { await this.wait(0.8); H.cash(cash); audio.countUp(); }
      if (week) {
        await this.wait(0.5);
        H.week(week, note || '');
        for (let i = 0; i < week.length; i++) { H.day(i); audio.dayTick(); await this.wait(0.22); }
        if (note) H.note();
      }
      await this.wait(hold);
      H.nameOff(); H.out();
      await this.wait(1);
      H.remove();
    };
    run();
  }

  // ---------- time / place stamp ----------
  stamp(text, hold = 4, delay = 0) {
    const el = $('#stamp');
    this.clock.cancel(this._st);
    this._st = this.clock.after(delay, () => {
      el.innerHTML = text; el.classList.add('on');
      this._st = this.clock.after(hold, () => el.classList.remove('on'));
    });
  }

  // ---------- "what others chose", shown right after a choice ----------
  /** stats('Ang pinili namin', [{ label, pct, who, you }]) */
  async stats(title, rows, { hold = 5 } = {}) {
    const el = $('#stats');
    el.innerHTML = `<div class="ttl">${title}</div><div class="rows">` + rows.map(r => `
      <div class="row chip${r.pct ? ' top' : ''}${r.you ? ' mine' : ''}">
        <div class="lab">${r.label}${r.you ? '<span class="you">Ikaw</span>' : ''}</div>
        <div class="pct">${r.pct}%</div>
        <div class="track"><i data-pct="${r.pct}"></i></div>
        <div class="who">${r.who || '&nbsp;'}</div>
      </div>`).join('') + '</div>';
    await this.wait(0.05);
    el.classList.add('on');
    audio.whoosh();
    await this.wait(0.5);
    el.querySelectorAll('.track i').forEach(i => { i.style.width = i.dataset.pct + '%'; });
    await this.holdOrSkip(hold);
    el.classList.remove('on');
    await this.wait(0.9);
  }

  // ---------- what he did, person by person ----------
  /** summary({ cards: [{ name, helped, tag, did, then }], foot }) */
  async summary({ cards, foot }) {
    const el = $('#summary');
    el.innerHTML = `<div class="ttl">Ang ginawa mo</div><div class="cards">` + cards.map(c => `
      <div class="card chip${c.helped ? ' yes' : ''}">
        <div class="name">${c.name}</div>
        <div class="tag">${c.tag}</div>
        <div class="did">${c.did}</div>
        <div class="then">${c.then}</div>
      </div>`).join('') + `</div><div class="foot">${foot}</div>`;
    await this.wait(0.05);
    el.classList.add('on');
    await this.wait(0.9);
    const fair = [...el.querySelectorAll('.card')];
    for (let i = 0; i < fair.length; i++) {
      fair[i].classList.add('in');
      if (cards[i].helped) audio.drop(); else audio.tone(98, 0.5, { vol: 0.08 });
      await this.wait(1.0);
    }
    el.querySelector('.foot').classList.add('in');
    await this.holdOrSkip(6.5);
    el.classList.remove('on');
    await this.wait(0.9);
    el.innerHTML = '';
  }

  // ---------- patak marker: what his choice did to someone ----------
  /** patak('Totoy', 'napangiti'). Whether he helped comes from the choice just made, or pass it as the third argument. */
  async patak(who, state, helped = this.lastHelped) {
    let t = $('#toast');
    if (!t) {
      t = document.createElement('div'); t.id = 'toast';
      t.innerHTML = `<div class="icon"><i class="ring"></i><i class="ring"></i><svg viewBox="0 0 40 60"><path d="M20 4C20 4 8 22 8 32a12 12 0 0 0 24 0C32 22 20 4 20 4z"/></svg></div>
        <div class="body"><div class="kick"></div><div class="who"></div><div class="state"></div></div><i class="shine"></i>`;
      $('#ui').appendChild(t);
    }
    this.clock.cancel(this._toastOff); this.clock.cancel(this._toastGone);
    t.classList.remove('on', 'off', 'yes', 'no'); void t.offsetWidth;
    t.classList.add(helped ? 'yes' : 'no');
    t.querySelector('.kick').textContent = helped ? 'Tinulungan mo' : 'Hindi mo tinulungan';
    t.querySelector('.who').textContent = who;
    t.querySelector('.state').textContent = state;
    t.classList.add('on');
    this.clock.after(0.18, () => (helped ? audio.helped() : audio.unhelped()));
    this._toastOff = this.clock.after(5.4, () => t.classList.add('off'));
    this._toastGone = this.clock.after(6, () => t.classList.remove('on', 'off'));
  }
}
