import '../cues.css';

/* The opening morning's on-screen type. It hits, it doesn't sit there to be read:
   one big word or number at a time, over the real room, each landing with a sound. */
export class IntroHud {
  constructor() {
    const el = this.el = document.createElement('div'); el.id = 'ihud';
    el.innerHTML = `
      <div class="name"><b></b><span></span></div>
      <div class="seal"><b></b><span></span></div>
      <div class="cash"><small>Sa wallet</small><b>₱0</b></div>
      <div class="week"><div class="days"></div><span></span></div>`;
    document.querySelector('#ui').appendChild(el);
    this.$ = s => el.querySelector(s);
  }

  /** a big slanted name plate slams in from the side */
  name(big, sub) { this.$('.name b').textContent = big; this.$('.name span').textContent = sub; this.$('.name').classList.add('on'); }
  nameOff() { this.$('.name').classList.replace('on', 'off'); }

  /** a rubber stamp comes down on the screen */
  seal(big, sub) { this.$('.seal b').textContent = big; this.$('.seal span').textContent = sub; this.$('.seal').classList.add('on'); }
  sealOff() { this.$('.seal').classList.replace('on', 'off'); }

  /** the money count; each new amount bumps */
  cash(v) {
    const c = this.$('.cash'); c.classList.add('on');
    const b = this.$('.cash b'); b.textContent = `₱${v}`;
    b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  }

  /** the days until payday, built one at a time */
  week(days, note) {
    this.$('.days').innerHTML = days.map(([d, tag, cls]) => `<div class="day ${cls || ''}"><b>${d}</b><i>${tag || ''}</i></div>`).join('');
    this.$('.week span').textContent = note;
    this.$('.week').classList.add('on');
  }
  day(i) { this.el.querySelectorAll('.day')[i]?.classList.add('in'); }
  note() { this.$('.week').classList.add('noted'); }

  out() { this.el.classList.add('out'); }
  remove() { this.el.remove(); }
}
