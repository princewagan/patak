// Procedural sound: everything is synthesized except the real Aug 17 recording.
export class Audio {
  constructor() {
    this.ctx = null;
    this.layers = new Map();
    this.muted = false;
  }
  unlock() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3;
    this.master = ctx.createGain(); this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.white = this.makeNoise('white');
    this.pink = this.makeNoise('pink');
    this.brown = this.makeNoise('brown');
    this._patter();
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.1); }

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
  src(buf) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = Math.random(); s.start(0, Math.random() * 3); return s; }
  filt(type, f, q = 0.7) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }

  /** named ambient layer with a fade; build(out) wires nodes into out */
  layer(name, level, build, fade = 1.5) {
    if (!this.ctx) return;
    let L = this.layers.get(name);
    if (!L && level > 0) {
      const out = this.gain(0); out.connect(this.master);
      L = { out, nodes: build(out) || {} };
      this.layers.set(name, L);
    }
    if (!L) return;
    L.out.gain.cancelScheduledValues(this.ctx.currentTime);
    L.out.gain.setTargetAtTime(level, this.ctx.currentTime, fade / 3);
    return L;
  }
  stopAll(fade = 1.5) { for (const [n] of this.layers) this.layer(n, 0, null, fade); this.patterRate = 0; }

  // ---------- ambiences ----------
  rain(level = 1, muffle = 0) {
    const L = this.layer('rain', level * 0.5, out => {
      const hp = this.filt('highpass', 300), lp = this.filt('lowpass', 7000);
      this.src(this.pink).connect(hp).connect(lp).connect(out);
      const body = this.filt('bandpass', 900, 0.4), bg = this.gain(0.6);
      this.src(this.white).connect(body).connect(bg).connect(out);
      return { lp };
    });
    if (L) L.nodes.lp.frequency.setTargetAtTime(7000 - muffle * 6000, this.ctx.currentTime, 0.4);
    this.patterRate = level > 0 ? 18 * level : 0;
    this.patterMuffle = muffle;
  }
  roof(level = 1) { // tin roof / jeep roof drumming
    this.layer('roof', level * 0.22, out => {
      const bp = this.filt('bandpass', 2600, 1.2), lfo = this.ctx.createOscillator(), lg = this.gain(0.4);
      lfo.frequency.value = 9; lfo.connect(lg);
      const g = this.gain(0.6); lg.connect(g.gain); lfo.start();
      this.src(this.white).connect(bp).connect(g).connect(out);
    });
  }
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
  engine(level = 1, rpm = 1) { // jeepney diesel
    const L = this.layer('engine', level * 0.32, out => {
      const o1 = this.ctx.createOscillator(), o2 = this.ctx.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'square'; o1.frequency.value = 34; o2.frequency.value = 51;
      const lp = this.filt('lowpass', 160, 2), am = this.gain(0.5), lfo = this.ctx.createOscillator(), lg = this.gain(0.5);
      lfo.frequency.value = 11; lfo.connect(lg).connect(am.gain);
      o1.connect(lp); o2.connect(this.gain(0.4)).connect(lp); lp.connect(am).connect(out);
      const rum = this.filt('lowpass', 220); this.src(this.brown).connect(rum).connect(this.gain(0.8)).connect(out);
      o1.start(); o2.start(); lfo.start();
      return { o1, o2, lfo };
    });
    if (L) { const t = this.ctx.currentTime; L.nodes.o1.frequency.setTargetAtTime(30 + rpm * 10, t, .5); L.nodes.o2.frequency.setTargetAtTime(45 + rpm * 15, t, .5); L.nodes.lfo.frequency.setTargetAtTime(9 + rpm * 5, t, .5); }
  }
  traffic(level = 1) {
    this.layer('traffic', level * 0.3, out => {
      const lp = this.filt('lowpass', 500); this.src(this.brown).connect(lp).connect(out);
      const sw = this.filt('bandpass', 1200, 0.8), g = this.gain(0.0), lfo = this.ctx.createOscillator(), lg = this.gain(0.25);
      lfo.frequency.value = 0.13; lfo.connect(lg).connect(g.gain); lfo.start();
      this.src(this.pink).connect(sw).connect(g).connect(out);
    });
  }
  hum(level = 1) { // fluorescent tube hum
    this.layer('hum', level * 0.05, out => {
      for (const [f, a] of [[120, 1], [240, .5], [360, .2]]) { const o = this.ctx.createOscillator(); o.frequency.value = f; o.connect(this.gain(a)).connect(out); o.start(); }
    });
  }
  murmur(level = 1, name = 'murmur', center = 700) { // crowd / voices
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
  fan(level = 1) {
    this.layer('fan', level * 0.12, out => {
      const lp = this.filt('lowpass', 700), g = this.gain(0.6), lfo = this.ctx.createOscillator(), lg = this.gain(0.35);
      lfo.frequency.value = 0.12; lfo.connect(lg).connect(g.gain); lfo.start();
      this.src(this.pink).connect(lp).connect(g).connect(out);
    });
  }
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

  // ---------- one-shots ----------
  env(node, t, a, d, peak = 1) { node.gain.setValueAtTime(0, t); node.gain.linearRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  tone(f, d, { type = 'sine', a = 0.005, vol = 0.3, to, delay = 0 } = {}) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.gain(0);
    o.type = type; o.frequency.setValueAtTime(f, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    this.env(g, t, a, d, vol); o.connect(g).connect(this.master); o.start(t); o.stop(t + a + d + .05);
  }
  noiseHit(d, { f = 1000, q = 1, type = 'bandpass', vol = .3, a = .002, delay = 0, buf } = {}) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay, s = this.ctx.createBufferSource(); s.buffer = buf || this.white;
    const fl = this.filt(type, f, q), g = this.gain(0); this.env(g, t, a, d, vol); s.connect(fl).connect(g).connect(this.master); s.start(t, Math.random() * 2, a + d + .1);
  }
  knock() { [0, .19, .36].forEach(dl => { this.tone(180, .09, { vol: .5, to: 120, delay: dl }); this.noiseHit(.05, { f: 1400, q: 2, vol: .25, delay: dl }); }); }
  coin() { [0, .07].forEach((dl, i) => [3200, 4700, 6900].forEach(f => this.tone(f * (1 + i * .03), .35, { vol: .05, delay: dl }))); }
  drop() { this.tone(1500, .09, { vol: .18, to: 420 }); this.tone(900, .25, { vol: .05, delay: .06, to: 600 }); }
  heartbeat() { this.tone(55, .12, { vol: .7, to: 38 }); this.tone(52, .14, { vol: .5, to: 36, delay: .22 }); }
  sting() { this.tone(41, 3.2, { vol: .5, a: .02, to: 30 }); this.noiseHit(2.6, { f: 300, type: 'lowpass', vol: .25, a: .4, buf: this.brown }); }
  whoosh() { this.noiseHit(.9, { f: 900, q: .6, vol: .15, a: .35 }); }
  paper() { for (let i = 0; i < 5; i++) this.noiseHit(.04 + Math.random() * .05, { f: 3000 + Math.random() * 3000, q: .8, vol: .06, delay: i * .06 }); }
  beep() { this.tone(2200, .09, { type: 'square', vol: .04 }); }
  thunder() { this.noiseHit(4.5, { f: 160, type: 'lowpass', vol: .9, a: .08, buf: this.brown }); this.noiseHit(1.2, { f: 400, type: 'lowpass', vol: .3, a: .02, delay: .1, buf: this.brown }); }
  horn(n = 1) { for (let i = 0; i < n; i++) { this.tone(392, .5, { type: 'square', vol: .03, delay: i * .7 }); this.tone(494, .5, { type: 'square', vol: .025, delay: i * .7 }); } }
  piano(f, d = 3, vol = .14, delay = 0) { // soft felt piano
    [1, 2, 3, 4.01].forEach((h, i) => this.tone(f * h, d / (1 + i * .8), { vol: vol / (1 + i * 2.2), a: .004, delay }));
  }
  chord(fs, spread = .09, vol = .12) { fs.forEach((f, i) => this.piano(f, 4, vol, i * spread)); }
  engineStart() { this.noiseHit(.8, { f: 200, type: 'lowpass', vol: .4, buf: this.brown }); }
  doorThud() { this.tone(70, .2, { vol: .5, to: 45 }); this.noiseHit(.12, { f: 600, vol: .2 }); }
}
export const audio = new Audio();
