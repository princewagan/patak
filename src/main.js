import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/500-italic.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './style.css';
import './title.css';
import { Engine } from './engine/engine.js';
import { Director } from './engine/director.js';
import { audio } from './engine/audio.js';
import { progress } from './engine/kit.js';
import { Menu, titleRain } from './engine/menu.js';
import { story, preload } from './story.js';
import { music } from './engine/music.js';
import './engine/folk.js';   // people without a realistic model stay as background shadows

const $ = s => document.querySelector(s);
const engine = new Engine($('#gl'));
const D = new Director(engine);
window.__patak = { engine, D, audio, music };

const params = new URLSearchParams(location.search);
const startBtn = $('#start');
const scenesBtn = $('#scenesBtn');
const menu = new Menu(engine, D, begin);
const resuming = params.has('from');

titleRain($('#titleRain'));
progress.onChange = v => { if (startBtn.disabled) startBtn.textContent = `Naglo-load ${(v * 100).toFixed(0)}%`; };

(async () => {
  await preload(engine, params);
  startBtn.disabled = false; startBtn.textContent = resuming ? 'Ituloy' : 'Simulan';
  scenesBtn.disabled = false;
  startBtn.focus({ preventScroll: true });
  if (params.has('auto')) begin();
})();

startBtn.addEventListener('click', () => begin());
scenesBtn.addEventListener('click', () => menu.titleScenes());

let started = false;
async function begin(from) {
  if (started) return; started = true;
  menu.started = true;
  audio.unlock();
  if (!params.has('auto') && !document.fullscreenElement) menu.fullscreen(true);
  $('#title').classList.add('gone');
  await D.wait(1.2);
  await story(engine, D, from || params.get('from'));
}
