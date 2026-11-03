/* The world is real recordings from public/audio (see CREDITS.md). Small timed details and the UI are synthesized.
   Everything that belongs to the world runs through `world`, so it can be ducked under music or a tense moment;
   `master` carries the world plus UI, and music.js connects straight to it. */
const AMB = n => `/audio/amb/${n}.mp3`;
const SFX = n => `/audio/sfx/${n}.mp3`;
const FILES = [
  ...['jeep_ride', 'jeep_idle', 'jeep_talk', 'street_mnl', 'street_ph', 'rain_out', 'roof_tin', 'roof_night', 'roof_in', 'car_rain', 'fastfood', 'fastfood2', 'mall_ph', 'videoke', 'fan_real', 'night_sub', 'morning', 'rooster_rain', 'crowd_ph', 'water_rush'].map(AMB),
  ...['thunder1', 'thunder2', 'tuko', 'rooster1', 'rooster2', 'rooster3', 'coins1', 'coins2', 'coins3', 'car_close', 'car_close2', 'car_open_rain', 'drawer', 'till', 'soda', 'fryer', 'paper1', 'paper2', 'envelope', 'bag', 'scanner', 'dog1', 'dog2', 'dog3', 'dog4', 'broom', 'wade1', 'wade2', 'wade3', 'wade4', 'wade5', 'umbrella'].map(SFX),
];
const pick = a => a[Math.floor(Math.random() * a.length)];
const between = (a, b) => a + Math.random() * (b - a);
const side = (k = 1) => (Math.random() * 2 - 1) * k;

/* each place: the extra recordings under it, and the small things that happen in it at random */
const PLACES = {
  jeep: { beds: [['jeep_talk', 0.55, { hp: 170 }]], gap: [2.6, 6.4], events: ['coinTap', 'barya', 'roofBang', 'sitsit', 'trike', 'wetPass', 'barya', 'busina', 'rattle', 'wetPass', 'coinTap', 'trike', 'rattle'] },
  kaha: { beds: [['fastfood', 0.8], ['fastfood2', 0.42], ['mall_ph', 0.34, { lp: 2400 }]], gap: [1.6, 4.2], events: ['posBeep', 'tray', 'receipt', 'orderBell', 'fryerBasket', 'posBeep', 'drawerPop', 'fryAlarm', 'tray', 'soda', 'scanner'] },
  sari: { beds: [['roof_night', 0.62], ['videoke', 0.3, { lp: 1900, hp: 180 }], ['night_sub', 0.5]], gap: [4, 9], events: ['trike', 'dogFar', 'sando', 'wetPass', 'barya', 'dogFar', 'trike'] },
  gabi: { beds: [['night_sub', 0.8], ['roof_in', 0.42], ['videoke', 0.1, { lp: 650, hp: 120 }]], gap: [6, 13], events: ['tuko', 'dogFar', 'trikeFar', 'tuko', 'dogFar'] },
  umaga: { beds: [['rooster_rain', 0.6], ['morning', 0.55]], gap: [3.5, 7.5], events: ['potpot', 'trikeFar', 'broom', 'rooster', 'wetPass', 'dogFar', 'rooster'] },
  kanto: { beds: [['street_ph', 0.75], ['street_mnl', 0.35]], gap: [3, 6.5], events: ['trike', 'busina', 'potpot', 'trike', 'dogFar', 'broom'] },
  tahanan: { beds: [['night_sub', 0.65], ['roof_in', 0.34]], gap: [7, 14], events: ['tuko', 'dogFar', 'trikeFar'] },
  kotse: { beds: [['car_rain', 0.95]], gap: [9, 15], events: ['wiperless'] },
  baha: { beds: [['water_rush', 0.34, { lp: 2400 }]], gap: [30, 40], events: [] },
};

export class Audio {
  constructor() {
    this.ctx = null;
    this.layers = new Map();
    this.muted = false;
    this.fetched = new Map(); this.decoded = new Map(); this.ready = new Map();
    this.place = null; this.placeBeds = [];
  }

  /* start downloading as soon as the page opens, so sound is there when the game starts */
  prefetch() { for (const f of FILES) if (!this.fetched.has(f)) this.fetched.set(f, fetch(f).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null)); }
  buf(f) {
    if (!this.decoded.has(f)) {
      this.prefetch();
      this.decoded.set(f, (this.fetched.get(f) || fetch(f).then(r => r.arrayBuffer())).then(ab => (ab ? this.ctx.decodeAudioData(ab) : null)).then(b => { if (b) this.ready.set(f, b); return b; }).catch(e => { console.warn('audio', f, e); return null; }));
    }
    return this.decoded.get(f);
  }

  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 3;
    this.master = ctx.createGain(); this.master.gain.value = 0.95;
    this.master.connect(comp).connect(ctx.destination);
    this.world = ctx.createGain(); this.world.connect(this.master);
    this.white = this.makeNoise('white');
    this.pink = this.makeNoise('pink');
    this.brown = this.makeNoise('brown');
    this.verb = this.makeRoom();
    this._patter();
    this.prefetch(); FILES.forEach(f => this.buf(f));
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.95, this.ctx.currentTime, 0.1); }
  /** pull the whole world down (or back up to 1) under music or a tense moment */
  duck(level = 1, fade = 1) { if (this.world) this.world.gain.setTargetAtTime(level, this.ctx.currentTime, fade / 3); }

  makeNoise(type) {
    const ctx = this.ctx, len = ctx.sampleRate * 4, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch); let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') d[i] = w;
        else if (type === 'pink') { b0 = .99765 * b0 + w * .099; b1 = .963 * b1 + w * .2965; b2 = .57 * b2 + w * 1.0526; d[i] = (b0 + b1 + b2 + w * .1848) * .2; }
        else { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      }
    }
    return buf;
  }
  makeRoom() {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * 1.5), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.4; }
    const c = ctx.createConvolver(); c.buffer = ir;
    c.connect(this.filt('lowpass', 3400)).connect(this.gain(0.7)).connect(this.world);
    return c;
  }
  src(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 3); return s; }
  filt(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  /** named ambient layer with a fade; build(out) wires nodes into out */
  layer(name, level, build, fade = 1.5) {
    if (!this.ctx) return;
    let L = this.layers.get(name);
    if (!L && level > 0) {
      const out = this.gain(0); out.connect(this.world);
      L = { out, nodes: build(out) || {} };
      this.layers.set(name, L);
    }
    if (!L) return;
    L.out.gain.cancelScheduledValues(this.ctx.currentTime);
    L.out.gain.setTargetAtTime(level, this.ctx.currentTime, fade / 3);
    return L;
  }
  stopAll(fade = 1.5) { this.scape(null); for (const [n] of this.layers) this.layer(n, 0, null, fade); this.patterRate = 0; }

  /** a looping recording as a named layer. Opts: lp, hp. The filters exist at once; the loop joins when decoded. */
  bed(name, file, level, { lp = 20000, hp = 20, fade = 1.5 } = {}) {
    const f = AMB(file);
    return this.layer(name, level, out => {
      const lpf = this.filt('lowpass', lp), hpf = this.filt('highpass', hp); lpf.connect(hpf).connect(out);
      this.buf(f).then(b => {
        if (!b) return;
        const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true; s.loopStart = 0; s.loopEnd = b.duration - 0.25;
        s.connect(lpf); s.start(0, Math.random() * (b.duration - 1));
      });
      return { lp: lpf, hp: hpf };
    }, fade);
  }

  /** set the place: its recordings fade in and its small random events begin. scape(null) ends it. */
  scape(name, level = 1) {
    if (!this.ctx) return;
    if (name !== this.place) {
      for (const n of this.placeBeds) if (!PLACES[name]?.beds.some(b => b[0] === n)) this.layer(n, 0, null, 2);
      this.place = name; clearTimeout(this._ev);
      const P = PLACES[name];
      this.placeBeds = P ? P.beds.map(b => b[0]) : [];
      if (P) this._ev = setTimeout(() => this._event(), between(0.8, 2.4) * 1000);
    }
    PLACES[name]?.beds.forEach(([file, lv, o]) => this.bed(file, file, lv * level, { fade: 2, ...o }));
    this.placeLevel = level;
  }
  _event() {
    const P = PLACES[this.place]; if (!P) return;
    if (this.ctx.state === 'running' && !this.muted && P.events.length) {
      let e; do e = pick(P.events); while (e === this._lastEv && P.events.length > 1);
      this._lastEv = e; this[e]?.(this.placeLevel ?? 1);
    }
    this._ev = setTimeout(() => this._event(), between(...P.gap) * 1000);
  }

  // ---------- ambiences ----------
  rain(level = 1, muffle = 0) {
    const L = this.bed('rain', 'rain_out', level * 0.95, { lp: 14000 });
    if (L) L.nodes.lp.frequency.setTargetAtTime(320 + 14000 * (1 - muffle) ** 2.2, this.ctx.currentTime, 0.4);
    this.patterRate = level > 0 ? 12 * level : 0;
    this.patterMuffle = muffle;
  }
  roof(level = 1) { this.bed('roof', 'roof_tin', level * 0.6, { hp: 260 }); } // tin roof / jeep roof drumming
  _patter() { // individual droplet ticks
    const tick = () => {
      if (this.patterRate > 0 && !this.muted) {
        const n = Math.random() < 0.5 ? 1 : 2;
        for (let i = 0; i < n; i++) this.blip(1800 + Math.random() * 4000 * (1 - this.patterMuffle * .8), 0.012 + Math.random() * .02, 0.05 * Math.random());
      }
      setTimeout(tick, this.patterRate > 0 ? 1000 / this.patterRate * (0.3 + Math.random()) : 400);
    };
    tick();
  }
  blip(f, a, delay = 0) {
    const ctx = this.ctx, t = ctx.currentTime + delay, s = ctx.createBufferSource(); s.buffer = this.white;
    const bp = this.filt('bandpass', f, 6), g = this.gain(0);
    g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(bp).connect(g).connect(this.master); s.start(t, Math.random() * 3, 0.06);
  }
  engine(level = 1, rpm = 1) { // the jeepney: a real ride, and real idling at the stops
    const L = this.layer('engine', level * 1.1, out => {
      const ride = this.gain(1), idle = this.gain(0), srcs = [];
      ride.connect(out); idle.connect(out);
      [['jeep_ride', ride], ['jeep_idle', idle]].forEach(([n, g]) => this.buf(AMB(n)).then(b => {
        if (!b) return;
        const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true; s.loopEnd = b.duration - 0.25; s.connect(g); s.start(0, Math.random() * (b.duration - 1));
        if (n === 'jeep_ride') srcs.push(s);
      }));
      return { ride, idle, srcs };
    });
    if (L) {
      const t = this.ctx.currentTime, k = Math.min(1, Math.max(0, (rpm - 0.35) / 0.4));
      L.nodes.ride.gain.setTargetAtTime(k, t, 0.7); L.nodes.idle.gain.setTargetAtTime(1 - k * 0.9, t, 0.5);
      L.nodes.srcs.forEach(s => s.playbackRate.setTargetAtTime(0.92 + 0.08 * Math.min(1, rpm), t, 0.8));
    }
  }
  carEngine(level = 1, rpm = 1) { // the car in Part Three: a quiet petrol idle, nothing like the jeep
    const L = this.layer('carEngine', level * 0.3, out => {
      const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'triangle'; o1.frequency.value = 38; o2.frequency.value = 76;
      const lp = this.filt('lowpass', 190, 1.2);
      o1.connect(lp); o2.connect(this.gain(0.4)).connect(lp); lp.connect(out);
      this.src(this.brown).connect(this.filt('lowpass', 180)).connect(this.gain(0.7)).connect(out);
      o1.start(); o2.start();
      return { o1, o2 };
    });
    if (L) { const t = this.ctx.currentTime; L.nodes.o1.frequency.setTargetAtTime(32 + rpm * 12, t, .5); L.nodes.o2.frequency.setTargetAtTime(64 + rpm * 24, t, .5); }
  }
  traffic(level = 1) { this.bed('traffic', 'street_mnl', level * 0.62, { lp: 5200 }); } // real Manila traffic
  hum(level = 1) { // fluorescent tube hum
    this.layer('hum', level * 0.05, out => {
      for (const [f, a] of [[120, 1], [240, .5], [360, .2]]) { const o = this.ctx.createOscillator(); o.frequency.value = f; o.connect(this.gain(a)).connect(out); o.start(); }
    });
  }
  murmur(level = 1, name = 'murmur', center = 700) { // real Filipino crowd; the TV stays a boxy synth voice
    if (name === 'murmur') return this.bed('murmur', 'crowd_ph', level * 0.8, { lp: Math.max(1400, center * 3.4), hp: 140 });
    this.layer(name, level * 0.2, out => {
      for (let i = 0; i < 4; i++) {
        const bp = this.filt('bandpass', center * (0.7 + Math.random() * 0.8), 3), g = this.gain(0);
        const lfo = this.ctx.createOscillator(), lg = this.gain(0.5);
        lfo.frequency.value = 2.5 + Math.random() * 3; lfo.type = 'triangle'; lfo.connect(lg).connect(g.gain); lfo.start();
        this.src(this.pink).connect(bp).connect(g).connect(out);
      }
    });
  }
  fryer(level = 1) {
    this.layer('fryer', level * 0.08, out => { const hp = this.filt('highpass', 4000); this.src(this.white).connect(hp).connect(out); });
  }
  fan(level = 1) { this.bed('fan', 'fan_real', level * 0.34, { lp: 2600 }); } // a real electric fan
  drone(level = 1, notes = [36.71, 55, 87.31, 110]) { // low music bed
    const L = this.layer('drone', level * 0.11, out => {
      const lp = this.filt('lowpass', 520, 0.5), lfo = this.ctx.createOscillator(), lg = this.gain(180);
      lfo.frequency.value = 0.05; lfo.connect(lg).connect(lp.frequency); lfo.start();
      const oscs = notes.map((f, i) => { const o = this.ctx.createOscillator(); o.type = i % 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = (Math.random() - .5) * 14; o.connect(this.gain(i ? 0.5 : 0.8)).connect(lp); o.start(); return o; });
      lp.connect(out);
      return { oscs };
    }, 3);
    if (L) L.nodes.oscs.forEach((o, i) => notes[i] && o.frequency.setTargetAtTime(notes[i], this.ctx.currentTime, 2));
  }
  async file(name, url, level = 1, loop = true) {
    if (!this.ctx) return;
    if (!this.layers.has(name)) {
      const buf = await fetch(url).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b));
      this.layer(name, level, out => { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; s.start(); s.connect(out); });
    } else this.layer(name, level);
  }

  // ---------- interface: water sounds, on their own context ----------
  /* The game's context is suspended while paused, and the menu still has to answer, so UI sound lives apart from it. */
  _ui() {
    if (this.uiC) return this.uiC;
    const c = this.uiC = new (window.AudioContext || window.webkitAudioContext)();
    this.uiOut = c.createGain(); this.uiOut.connect(c.destination);
    this.uiNoise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.uiNoise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return c;
  }
  /* a bubble: a sine sweeping in pitch is what makes a sound read as water */
  _bub(f0, f1, d, vol, delay = 0) {
    if (!this.ctx || this.muted) return;
    const c = this._ui(), t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .005); g.gain.exponentialRampToValueAtTime(.0001, t + d);
    o.connect(g).connect(this.uiOut); o.start(t); o.stop(t + d + .03);
  }
  /* air moving: a band of noise sliding from one pitch to another */
  _air(f0, f1, d, vol, delay = 0) {
    if (!this.ctx || this.muted) return;
    const c = this._ui(), t = c.currentTime + delay, s = c.createBufferSource(), b = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.uiNoise; s.loop = true; b.type = 'bandpass'; b.Q.value = .9;
    b.frequency.setValueAtTime(f0, t); b.frequency.exponentialRampToValueAtTime(f1, t + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + d * .45); g.gain.linearRampToValueAtTime(0, t + d);
    s.connect(b).connect(g).connect(this.uiOut); s.start(t); s.stop(t + d + .03);
  }
  tick() { this._bub(1250, 2100, .05, .075); }                                   // moving between options
  uiSelect() { this._bub(520, 1150, .1, .17); this._bub(1100, 1900, .07, .08, .06); } // pressing one
  uiBack() { this._bub(1000, 420, .13, .15); }                                    // going back
  uiToggle() { this._bub(1500, 1420, .025, .09); this._bub(1000, 960, .03, .09, .055); } // a switch
  uiOpen() { this._air(500, 2600, .34, .11); this._bub(380, 900, .17, .11, .1); }  // a panel rising in
  uiClose() { this._air(2600, 500, .27, .1); this._bub(800, 340, .15, .1, .05); }  // a panel sinking away
  gateOpen() { this._bub(420, 1400, .15, .22); this._bub(92, 42, .75, .5); this._air(300, 1900, .6, .1); } // leaving the press-any-key screen
  confirm() { this._bub(1500, 420, .11, .22); this._bub(72, 34, 1.1, .6); this._air(3200, 280, .78, .17); } // Simulan, with the slash across the screen
  choiceIn() { this._air(620, 2100, .3, .09); }                                    // a choice appearing

  // ---------- the morning intro ----------
  alarm() { // the phone going off on the mattress: buzz on foam, and a soft marimba alarm
    if (!this.ctx) return;
    for (let i = 0; i < 6; i++) { this.tone(158, .2, { type: 'square', vol: .03, delay: i * .52, lp: 900 }); this.tone(162, .2, { type: 'square', vol: .022, delay: i * .52 + .24, lp: 900 }); }
    [[0, 659.25], [.26, 880], [.52, 659.25], [.78, 987.77], [1.3, 659.25], [1.56, 880], [1.82, 659.25], [2.08, 987.77]].forEach(([dl, f]) => { this.tone(f, .34, { vol: .05, delay: dl + .1 }); this.tone(f * 3.9, .1, { vol: .009, delay: dl + .1 }); });
  }
  slam() { this.tone(82, .38, { vol: .52, to: 44 }); this.noiseHit(.16, { f: 1500, q: .6, vol: .2 }); this.noiseHit(.5, { f: 620, q: .5, vol: .1, a: .01 }); } // big word hits the screen
  plateIn() { this.tone(96, .3, { vol: .42, to: 52 }); this.noiseHit(.13, { f: 1700, q: .6, vol: .16 }); this.noiseHit(.38, { f: 700, q: .5, vol: .08, a: .01 }); } // the second plate sliding in
  stampHit() { this.tone(118, .16, { vol: .56, to: 66 }); this.noiseHit(.07, { f: 820, q: .8, vol: .34 }); this.noiseHit(.05, { f: 2600, q: 1.2, vol: .12, delay: .012 }); } // rubber stamp on paper
  countUp() { this.tone(1320, .05, { vol: .035 }); this.tone(1980, .07, { vol: .02, delay: .03 }); }        // a number going up
  dayTick() { this.tone(640, .07, { vol: .06, to: 520 }); this.noiseHit(.03, { f: 1800, q: 1.5, vol: .05 }); }  // one day on the calendar
  dawn() { this.scape('umaga', .75); this.rooster(); }

  // ---------- main menu ----------
  titleDrop() { if (!this.ctx) return; this.drop(); this.piano(this._dropNote(), 5, .07, .04); }
  _dropNote() { const n = [220, 261.63, 196, 164.81, 220, 293.66, 246.94, 196]; this._dn = ((this._dn ?? -1) + 1) % n.length; return n[this._dn]; }
  titleThunder() { // real thunder right behind the flash: a crack, then the low roll under it
    if (!this.ctx) return;
    const near = Math.random() < .62, delay = near ? between(.08, .32) : between(.45, 1);
    const played = this.shot(near ? 'thunder1' : 'thunder2', { vol: near ? .78 : .62, lp: 7000, room: .32, pan: side(.35), delay });
    if (!played) this.noiseHit(3.4, { f: 160, type: 'lowpass', vol: .7, a: .05, delay, buf: this.brown });
    this.noiseHit(3, { f: 95, type: 'lowpass', vol: near ? .62 : .42, a: .06, delay: delay + .03, buf: this.brown });
    this.layer('rain', .46, null, .5); setTimeout(() => { if (this.place == null) this.layer('rain', .76, null, 3); }, 2200); // rain drops back as the crash takes over
  }
  titleBed(on) {
    if (!this.ctx) return;
    if (on) { this.rain(.8, .08); this.drone(.55, [55, 82.41, 110, 164.81]); }
    else { this.layer('rain', 0, null, 1.4); this.layer('drone', 0, null, 1.4); this.patterRate = 0; }
  }

  // ---------- one-shots ----------
  /** play a real one-shot. Opts: vol, rate, pan, room (reverb send), lp, hp, delay. False if it isn't loaded yet. */
  shot(name, { vol = .5, rate = 1, pan = 0, room = 0, lp, hp, delay = 0 } = {}) {
    const b = this.ready.get(SFX(name));
    if (!this.ctx || !b) return false;
    const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
    let n = s.connect(this.gain(vol));
    if (lp) n = n.connect(this.filt('lowpass', lp));
    if (hp) n = n.connect(this.filt('highpass', hp));
    const p = this.ctx.createStereoPanner(); p.pan.value = pan; n.connect(p).connect(this.world);
    if (room) n.connect(this.gain(room)).connect(this.verb);
    s.start(this.ctx.currentTime + delay);
    return true;
  }
  /** a sound that crosses the stereo field: builds its source into `into`, then sweeps pan and level */
  _pass(d, peak, into, from = side() < 0 ? -1 : 1) {
    const ctx = this.ctx, t = ctx.currentTime, g = this.gain(0), p = ctx.createStereoPanner();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + d * .5); g.gain.linearRampToValueAtTime(0, t + d);
    p.pan.setValueAtTime(from * .9, t); p.pan.linearRampToValueAtTime(-from * .9, t + d);
    into(g, t, d); g.connect(p).connect(this.world);
  }

  // jeep
  coinTap() { // a passenger raps a coin on the metal rail to stop the jeep
    const pan = side(.8), n = Math.random() < .5 ? 3 : 4;
    const hit = (dl, a) => { [2760, 4130, 6620].forEach((f, i) => { const t = this.ctx.currentTime + dl, o = this.ctx.createOscillator(), g = this.gain(0), pn = this.ctx.createStereoPanner(); pn.pan.value = pan; o.frequency.value = f; this.env(g, t, .002, .09 - i * .02, a / (1 + i)); o.connect(g).connect(pn).connect(this.world); o.start(t); o.stop(t + .14); }); };
    for (let i = 0; i < n; i++) hit(i * .13, .09);
  }
  roofBang() { [0, .2].forEach(dl => { this.tone(112, .13, { vol: .34, to: 72, delay: dl }); this.noiseHit(.09, { f: 520, q: .9, vol: .26, delay: dl }); this.tone(690, .16, { vol: .014, delay: dl }); }); } // "para!" on the jeep roof
  sitsit() { const pan = side(.7); [0, .3].forEach(dl => this.noiseHit(.2, { f: 6300, q: 3, vol: .1, a: .05, delay: dl, pan })); } // the Filipino "psst"
  barya() { this.shot(pick(['coins2', 'coins3']), { vol: .24, rate: between(.9, 1.15), pan: side(.6), room: .1 }); } // fare passed hand to hand
  rattle() { const n = 3 + Math.floor(Math.random() * 4), pan = side(.5); for (let i = 0; i < n; i++) this.noiseHit(.03, { f: between(1100, 2600), q: 7, vol: .1, delay: i * between(.05, .1), pan }); } // loose sheet metal
  busina() { const n = Math.random() < .5 ? 1 : 2, pan = side(.9); for (let i = 0; i < n; i++) { this.tone(392, .26, { type: 'square', vol: .022, delay: i * .36, pan, lp: 1700 }); this.tone(494, .26, { type: 'square', vol: .018, delay: i * .36, pan, lp: 1700 }); } } // horn out in the traffic
  trike(k = 1, peak = .1, lp = 2200) { // tricycle: a 2-stroke buzz going past
    const f0 = between(88, 112);
    this._pass(between(3, 4.6), peak * k, (g, t, d) => {
      const o = this.ctx.createOscillator(), am = this.ctx.createOscillator(), amg = this.gain(.5), b = this.gain(.55);
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * 1.08, t); o.frequency.linearRampToValueAtTime(f0 * .9, t + d);
      am.type = 'square'; am.frequency.value = f0 / 3.1; am.connect(amg).connect(b.gain);
      const bp = this.filt('bandpass', 900, .7), f = this.filt('lowpass', lp);
      o.connect(bp).connect(b).connect(f).connect(g); o.start(t); am.start(t); o.stop(t + d + .1); am.stop(t + d + .1);
    });
  }
  trikeFar(k = 1) { this.trike(k, .05, 620); }
  wetPass(k = 1) { // a car going past on wet road
    this._pass(between(2.2, 3.4), .16 * k, (g, t, d) => {
      const s = this.ctx.createBufferSource(); s.buffer = this.pink; const bp = this.filt('bandpass', 1500, .5);
      bp.frequency.setValueAtTime(900, t); bp.frequency.linearRampToValueAtTime(2300, t + d * .5); bp.frequency.linearRampToValueAtTime(800, t + d);
      s.connect(bp).connect(g); s.start(t, Math.random() * 3, d + .1);
    });
  }

  // fast food
  posBeep() { this.tone(1760, .07, { type: 'square', vol: .012 }); this.tone(1760, .07, { type: 'square', vol: .012, delay: .13 }); }
  scanner() { this.shot('scanner', { vol: .1, pan: side(.5), room: .1 }); }
  drawerPop() { this.shot(pick(['drawer', 'till']), { vol: .26, pan: side(.5), room: .12 }); }
  orderBell() { const pan = side(.6);[2093, 3140, 4710].forEach((f, i) => this.tone(f, 1.1 / (1 + i), { vol: .016 / (1 + i), pan })); }
  fryAlarm() { const pan = side(.8); for (let i = 0; i < 6; i++) this.tone(2900, .1, { type: 'square', vol: .0075, delay: i * .24, pan, lp: 3400 }); }
  fryerBasket() { this.shot('fryer', { vol: .2, pan: side(.7), lp: 7000 }); }
  soda() { this.shot('soda', { vol: .14, pan: side(.6), room: .1 }); }
  tray() { const pan = side(.8);[0, .09].forEach((dl, i) => { this.noiseHit(.05, { f: 1250 - i * 300, q: 2, vol: .15, delay: dl, pan }); this.tone(300 + i * 60, .05, { vol: .05, delay: dl, pan }); }); }
  receipt() { const pan = side(.5), n = 13; for (let i = 0; i < n; i++) this.noiseHit(.022, { f: 2500, q: 2.2, vol: .048, delay: i * .042, pan }); }

  // neighbourhood
  sando() { this.shot('bag', { vol: .2, pan: side(.5) }); } // plastic bag at the counter
  dogFar(k = 1) { this.shot(pick(['dog1', 'dog2', 'dog3', 'dog4']), { vol: .1 * k, lp: 1300, room: .6, pan: side(.9), rate: between(.92, 1.06) }); }
  tuko() { this.shot('tuko', { vol: .34, room: .5, lp: 3000, pan: side(.7) }); } // tokay gecko at night
  rooster() { this.shot(pick(['rooster1', 'rooster2', 'rooster3']), { vol: .13, lp: 3600, room: .55, pan: side(.9), rate: between(.96, 1.04) }); }
  broom() { this.shot('broom', { vol: .12, pan: side(.8), lp: 5200, room: .2 }); } // walis tingting on the street
  potpot() { const pan = side(.9);[0, .34].forEach(dl => { this.tone(430, .13, { type: 'sawtooth', vol: .016, delay: dl, to: 372, pan, lp: 1500 }); }); } // bicycle vendor's bulb horn
  wiperless() { }
  wade(i) { this.shot(`wade${i ?? 1 + Math.floor(Math.random() * 5)}`, { vol: .34, rate: between(.92, 1.08), pan: side(.3) }); } // a step through flood water

  env(node, t, a, d, peak = 1) { node.gain.setValueAtTime(0, t); node.gain.linearRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  _out(g, pan, lp) { let n = g; if (lp) n = n.connect(this.filt('lowpass', lp)); if (pan) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; n = n.connect(p); } n.connect(this.master); }
  tone(f, d, { type = 'sine', a = 0.005, vol = 0.3, to, delay = 0, pan = 0, lp } = {}) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.gain(0);
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    this.env(g, t, a, d, vol); o.connect(g); this._out(g, pan, lp); o.start(t); o.stop(t + a + d + .05);
  }
  noiseHit(d, { f = 1000, q = 1, type = 'bandpass', vol = .3, a = .002, delay = 0, buf, pan = 0 } = {}) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay, s = this.ctx.createBufferSource(); s.buffer = buf || this.white;
    const fl = this.filt(type, f, q), g = this.gain(0); this.env(g, t, a, d, vol); s.connect(fl).connect(g); this._out(g, pan); s.start(t, Math.random() * 2, a + d + .1);
  }
  knock() { [0, .19, .36].forEach(dl => { this.tone(180, .09, { vol: .5, to: 120, delay: dl }); this.noiseHit(.05, { f: 1400, q: 2, vol: .25, delay: dl }); }); }
  coin() { if (!this.shot(pick(['coins1', 'coins3']), { vol: .5, rate: between(.94, 1.08) })) [0, .07].forEach((dl, i) => [3200, 4700, 6900].forEach(f => this.tone(f * (1 + i * .03), .35, { vol: .05, delay: dl }))); }
  drop() { this.tone(1500, .09, { vol: .18, to: 420 }); this.tone(900, .25, { vol: .05, delay: .06, to: 600 }); }
  heartbeat() { this.tone(55, .12, { vol: .7, to: 38 }); this.tone(52, .14, { vol: .5, to: 36, delay: .22 }); }
  sting() { this.tone(41, 3.2, { vol: .5, a: .02, to: 30 }); this.noiseHit(2.6, { f: 300, type: 'lowpass', vol: .25, a: .4, buf: this.brown }); }
  whoosh() { this.noiseHit(.9, { f: 900, q: .6, vol: .15, a: .35 }); }
  paper() { if (!this.shot(pick(['paper1', 'paper2', 'envelope']), { vol: .42, rate: between(.92, 1.1) })) for (let i = 0; i < 5; i++) this.noiseHit(.04 + Math.random() * .05, { f: 3000 + Math.random() * 3000, q: .8, vol: .06, delay: i * .06 }); }
  beep() { this.tone(2200, .09, { type: 'square', vol: .04 }); }
  thunder() { if (this.shot(pick(['thunder1', 'thunder2']), { vol: .95 })) return; this.noiseHit(4.5, { f: 160, type: 'lowpass', vol: .9, a: .08, buf: this.brown }); this.noiseHit(1.2, { f: 400, type: 'lowpass', vol: .3, a: .02, delay: .1, buf: this.brown }); }
  horn(n = 1) { for (let i = 0; i < n; i++) { this.tone(392, .5, { type: 'square', vol: .03, delay: i * .7 }); this.tone(494, .5, { type: 'square', vol: .025, delay: i * .7 }); } }
  piano(f, d = 3, vol = .14, delay = 0) { // soft felt piano
    [1, 2, 3, 4.01].forEach((h, i) => this.tone(f * h, d / (1 + i * .8), { vol: vol / (1 + i * 2.2), a: .004, delay }));
  }
  chord(fs, spread = .09, vol = .12) { fs.forEach((f, i) => this.piano(f, 4, vol, i * spread)); }
  engineStart() { this.noiseHit(.8, { f: 200, type: 'lowpass', vol: .4, buf: this.brown }); }
  doorThud() { if (this.shot('car_close', { vol: .75 })) return; this.tone(70, .2, { vol: .5, to: 45 }); this.noiseHit(.12, { f: 600, vol: .2 }); }
}
export const audio = new Audio();
