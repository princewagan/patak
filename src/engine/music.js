import { audio } from './audio.js';

/*
  The score: a soft felt piano and a quiet pad, played live so it never needs a file.
  Same piano voice as the old ending chords, now with a room around it.
    music.play('tender', level, fadeSeconds)   start or switch piece
    music.level(v, fadeSeconds)                 lift or lower it
    music.stop(fadeSeconds)                     fade out
    music.resolve()                             last chord, then silence
*/
const hz = n => 440 * 2 ** ((n - 69) / 12);

// low to high, in MIDI notes
const CH = {
  Am: [45, 52, 57, 60], F: [41, 48, 57, 60], C: [48, 55, 60, 64], G: [43, 50, 55, 59],
  Dm: [38, 50, 57, 62], Em: [40, 52, 59, 64], Csus: [48, 55, 60, 65],
};

const PIECES = {
  // the day settling, "ganyan talaga": sparse, nothing resolves
  night: {
    bpm: 50, pad: 0.8, vel: 0.5,
    bars: ['Am', 'Em', 'F', 'Em'],
    arp: [0, null, 2, null, 3, null, 2, null],
    tune: [[[4, 76]], [], [[0, 72], [4, 71]], []],
  },
  // what kindness did: warm and moving, but still holding back
  tender: {
    bpm: 58, pad: 1, vel: 0.55,
    bars: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C'],
    arp: [0, 1, 2, 1, 3, 1, 2, 1],
    tune: [[[0, 76]], [[0, 74], [4, 71]], [[0, 72]], [[0, 69], [4, 72]], [[0, 76], [6, 79]], [[0, 74]], [[0, 72], [4, 69]], [[0, 72]]],
  },
  // the selfies: the main tune, with a single high note falling like a drop at the end of each phrase
  theme: {
    bpm: 60, pad: 1.1, vel: 0.62,
    bars: ['Am', 'F', 'C', 'G', 'Am', 'F', 'C', 'G', 'F', 'C', 'Dm', 'G', 'Am', 'F', 'Csus', 'C'],
    arp: [0, 1, 2, 1, 3, 1, 2, 1],
    tune: [
      [[0, 76], [4, 74], [6, 72]], [[0, 72], [2, 69], [6, 72]], [[0, 67], [4, 72], [6, 74]], [[0, 74], [2, 71], [7, 88]],
      [[0, 76], [4, 79], [6, 76]], [[0, 77], [2, 76], [4, 72]], [[0, 76], [2, 74], [4, 72]], [[0, 71], [4, 74], [7, 88]],
      [[0, 81], [4, 79], [6, 77]], [[0, 76], [4, 79]], [[0, 77], [2, 76], [4, 74]], [[0, 74], [2, 76], [4, 71]],
      [[0, 72], [4, 76]], [[0, 77], [4, 76]], [[0, 77], [4, 74]], [[0, 72], [5, 88]],
    ],
  },
};

class Music {
  constructor() { this.now = null; this.bus = null; }

  /** one output chain, built on first use: level → (dry + room) → the game's master, so mute and pause still apply */
  chain() {
    if (this.bus || !audio.ctx) return this.bus;
    const ctx = audio.ctx, room = ctx.createConvolver(), wet = ctx.createGain(), dry = ctx.createGain(), bus = ctx.createGain();
    const len = ctx.sampleRate * 3.4 | 0, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c); let lp = 0;
      for (let i = 0; i < len; i++) { const k = i / len; lp += (Math.random() * 2 - 1 - lp) * (0.34 - k * 0.26); d[i] = lp * (1 - k) ** 2.6; }
    }
    room.buffer = ir; wet.gain.value = 0.42; dry.gain.value = 0.72;
    bus.connect(dry).connect(audio.master);
    bus.connect(room).connect(wet).connect(audio.master);
    this.bus = bus;
    return bus;
  }

  /** the same four partials as audio.piano, a little softer on top */
  note(out, m, t, vel, len) {
    const ctx = audio.ctx, f = hz(m), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    const cut = 700 + 2300 * vel;
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cut, t);
    lp.frequency.exponentialRampToValueAtTime(cut * 0.5, t + 1.4);
    g.gain.setValueAtTime(vel * 0.27, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(lp).connect(out);
    [1, 2, 3, 4.01].forEach((h, i) => {
      const o = ctx.createOscillator(), a = ctx.createGain(), end = t + len / (1 + i * 0.8);
      o.frequency.value = f * h;
      a.gain.setValueAtTime(0, t);
      a.gain.linearRampToValueAtTime(1 / (1 + i * 2.2), t + 0.006);
      a.gain.exponentialRampToValueAtTime(0.001, end);
      o.connect(a).connect(g);
      o.start(t); o.stop(end + 0.05);
    });
  }

  padBar(out, chord, t, dur, amount) {
    const ctx = audio.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520;
    const level = 0.03 * amount;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + dur * 0.4);
    g.gain.setValueAtTime(level, t + dur * 0.75);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.2);
    g.connect(lp).connect(out);
    [chord[0] + 12, chord[1] + 12, chord[2]].forEach((m, i) => {
      [-3, 3].forEach(cents => {
        const o = ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = hz(m); o.detune.value = cents + i;
        o.connect(g); o.start(t); o.stop(t + dur + 1.3);
      });
    });
  }

  /** schedule ahead on the audio clock. It stands still while the game is paused, so nothing piles up. */
  tick(s) {
    const ctx = audio.ctx, p = PIECES[s.name], eighth = 30 / p.bpm;
    while (s.next < ctx.currentTime + 0.6) {
      const bar = s.bar % p.bars.length, ch = CH[p.bars[bar]], step = s.step, t = s.next;
      const human = () => (Math.random() - 0.5) * 0.016;
      if (step === 0) this.padBar(s.gain, ch, t, eighth * 8, p.pad);
      const i = p.arp[step];
      if (i != null) this.note(s.gain, ch[i], t + human(), p.vel * (0.66 + Math.random() * 0.1) * (step === 0 ? 1.15 : 1), 3.2);
      for (const [at, m] of p.tune[bar] || []) if (at === step) this.note(s.gain, m, t + human(), p.vel * (m > 84 ? 0.5 : 1.05), m > 84 ? 4.5 : 3.8);
      s.next += eighth;
      if (++s.step === 8) { s.step = 0; s.bar++; if (s.ending) { this.cadence(s); return; } }
    }
  }

  /** a slow rolled C chord, then the piece is over */
  cadence(s) {
    clearInterval(s.timer); s.timer = null;
    [36, 48, 55, 60, 64, 72].forEach((m, i) => this.note(s.gain, m, s.next + i * 0.16, 0.6, 7));
    this.note(s.gain, 88, s.next + 2.4, 0.3, 5);
    this.now = null;
  }

  play(name, level = 1, fade = 4) {
    if (!audio.ctx) return;
    if (this.now?.name === name) return this.level(level, fade);
    this.stop(fade);
    const ctx = audio.ctx, bus = this.chain(), gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(level, ctx.currentTime + fade);
    gain.connect(bus);
    const s = this.now = { name, gain, bar: 0, step: 0, next: ctx.currentTime + 0.12 };
    s.timer = setInterval(() => this.tick(s), 180);
    this.tick(s);
  }

  level(v, fade = 3) {
    if (!this.now) return;
    const g = this.now.gain.gain, t = audio.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(v, t + fade);
  }

  stop(fade = 4) {
    const s = this.now; if (!s) return;
    this.now = null;
    clearInterval(s.timer);
    const g = s.gain.gain, t = audio.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => s.gain.disconnect(), (fade + 8) * 1000);
  }

  resolve() { if (this.now) this.now.ending = true; }
}

export const music = new Music();
