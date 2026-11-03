// Film a scene as a contact sheet, so every moment of an animation can be reviewed.
// node tools/film.mjs "<query>" <outDir> <seconds> <every> [views.json]
//   node tools/film.mjs "scene=jeep&auto&autopick=0" /tmp/jeep 120 2.5
// Writes outDir/f_###.jpg plus outDir/sheet_#.jpg (5×4 tiles). One browser only: the laptop has 8 GB.
//
// With views.json the scene is left to reach `at` seconds, then frozen and photographed from each camera:
//   { "at": 12, "views": { "name": { "pos":[x,y,z], "look":[x,y,z], "fov":50 } } }
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';

const [q = '', out = 'shots/film', dur = '30', every = '2', viewsFile] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (/^(f_|sheet_|v_)/.test(f)) rmSync(`${out}/${f}`);
const W = +(process.env.W || 960), H = +(process.env.H || 540);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', timeout: 120000, protocolTimeout: 300000,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
const logs = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  page.on('console', m => { const t = m.text(); if (m.type() !== 'log' && m.type() !== 'debug' && !t.includes('[vite]') && !t.includes('GPU stall')) logs.push(m.type() + ': ' + t); });
  page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
  await page.goto((process.env.BASE || 'http://localhost:5199') + '/?' + q, { waitUntil: 'domcontentloaded' });
  // the clock starts when the game does, not when the page loads
  await page.waitForFunction(() => window.__patak && document.querySelector('#title')?.classList.contains('gone'), { timeout: 240000 });
  await new Promise(r => setTimeout(r, +(process.env.SKIP || 0) * 1000));
  const t0 = Date.now(), name = i => `${out}/f_${String(i).padStart(3, '0')}.jpg`;

  if (viewsFile) {
    const { at = 5, views } = JSON.parse(readFileSync(viewsFile, 'utf8'));
    await new Promise(r => setTimeout(r, at * 1000));
    await page.evaluate(() => { const E = window.__patak.engine; E.paused = true; window.__rig = E.rig; });
    for (const [k, v] of Object.entries(views)) {
      await page.evaluate(v => {
        const E = window.__patak.engine, r = E.rig; r.set({ ...v, roll: 0 }); r.shake = 0; r.jolt = 0; r.pov = 0;
        const c = E.camera; c.position.set(...v.pos); c.fov = v.fov ?? 50; c.updateProjectionMatrix(); c.lookAt(...v.look); c.updateMatrixWorld();
        E.dof?.({ aperture: 0.00001 });
        (E.composer || E.renderer).render?.(E.current?.scene ?? E.scene, c);
      }, v);
      await new Promise(r => setTimeout(r, 120));
      await page.evaluate(() => { const E = window.__patak.engine; E.composer.render(); });
      await page.screenshot({ path: `${out}/v_${k}.jpg`, type: 'jpeg', quality: 86 });
    }
  } else {
    for (let i = 0; ; i++) {
      const due = t0 + i * every * 1000, w = due - Date.now();
      if (w > 0) await new Promise(r => setTimeout(r, w));
      if (Date.now() - t0 > dur * 1000) break;
      await page.screenshot({ path: name(i), type: 'jpeg', quality: 72 });
    }
    execSync(`ffmpeg -y -loglevel error -framerate 1 -i "${out}/f_%03d.jpg" -vf "scale=480:-1,tile=5x4:padding=3" -q:v 4 "${out}/sheet_%d.jpg"`);
  }
} finally {
  await browser.close();
  console.log(logs.slice(-20).join('\n') || 'no errors');
}
