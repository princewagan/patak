// Screenshot helper: node tools/shot.mjs "<query>" out.png [waitSeconds] [clicks...]
// e.g. node tools/shot.mjs "from=sobre&auto&fast" shots/a.png 8
import puppeteer from 'puppeteer-core';
const [q = '', out = 'shots/shot.png', wait = '5', ...steps] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 810 });
const logs = [];
page.on('console', m => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
await page.goto('http://localhost:5199/?' + q, { waitUntil: 'domcontentloaded' });
const shots = [Number(wait), ...steps.map(Number)];
let i = 0, elapsed = 0;
for (const t of shots) {
  await new Promise(r => setTimeout(r, (t - elapsed) * 1000)); elapsed = t;
  const name = shots.length > 1 ? out.replace('.png', `_${i}.png`) : out;
  await page.screenshot({ path: name }); i++;
}
console.log(logs.filter(l => !l.includes('[vite]')).slice(-15).join('\n'));
await browser.close();
