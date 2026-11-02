import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './style.css';
import { Engine } from './engine/engine.js';
import { Director } from './engine/director.js';
import { audio } from './engine/audio.js';
import { progress } from './engine/kit.js';
import { story, preload } from './story.js';

const $ = s => document.querySelector(s);
const engine = new Engine($('#gl'));
const D = new Director(engine);
window.__patak = { engine, D, audio };

const params = new URLSearchParams(location.search);
const startBtn = $('#start');

progress.onChange = v => { $('#title .load i').style.width = (v * 100).toFixed(0) + '%'; };

(async () => {
  await preload(engine, params);
  $('#title .load i').style.width = '100%';
  startBtn.disabled = false; startBtn.textContent = 'Simulan';
  if (params.has('auto')) begin();
})();

startBtn.addEventListener('click', begin);

let started = false;
async function begin() {
  if (started) return; started = true;
  audio.unlock();
  if (!params.has('auto') && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  $('#title').classList.add('gone');
  await D.wait(1.2);
  await story(engine, D, params.get('from'));
}
