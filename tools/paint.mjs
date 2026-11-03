// Repaint a Rocketbox body atlas into someone's real clothes: node tools/paint.mjs <spec.json>
// spec: { "<role>": { "src": "<atlas.jpg>", "out": "public/people/<role>/body_color.jpg", "ops": [...] } }
// Rects are fractions of the atlas: [x0, y0, x1, y1]. Ops (in order):
//   { do: 'tint', rects, color, ref = 0.5, skipSkin }   recolour, keeping the folds and shading of the original
//   { do: 'skin', rects, color, ref }                    bare skin (shorts, bare feet), shaded by the original
//   { do: 'clone', rect, dy }                            cover a print with the cloth just above/below it
//   { do: 'stripes', rects, a, b, n, ref, axis }          striped knit
//   { do: 'trefoil', at: [cx, cy, size], color }         a three-leaf chest print
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--mute-audio'] });
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas>');
for (const [role, s] of Object.entries(spec)) {
  const b64 = readFileSync(s.src).toString('base64');
  const png = s.src.endsWith('.png');
  const out = await page.evaluate(async (b64, ops, png) => {
    const img = new Image(); img.src = 'data:image/' + (png ? 'png' : 'jpeg') + ';base64,' + b64; await img.decode();
    const c = document.getElementById('c'), W = c.width = img.width, H = c.height = img.height, x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, W, H), p = d.data, src = new Uint8ClampedArray(p);
    const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const lum = i => (0.3 * src[i] + 0.59 * src[i + 1] + 0.11 * src[i + 2]) / 255;
    const isSkin = i => { const r = src[i], g = src[i + 1], b = src[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b); return r > g && g >= b * 0.9 && (mx - mn) / (mx || 1) > 0.18 && mx > 90 && r - b > 30; };
    const each = (rects, fn) => { for (const [a, b2, c2, e] of rects) for (let y = Math.floor(b2 * H); y < Math.ceil(e * H); y++) for (let X = Math.floor(a * W); X < Math.ceil(c2 * W); X++) fn((y * W + X) * 4, X / W, y / H); };
    const put = (i, rgb, k) => { p[i] = Math.min(255, rgb[0] * k); p[i + 1] = Math.min(255, rgb[1] * k); p[i + 2] = Math.min(255, rgb[2] * k); };
    for (const o of ops) {
      if (o.do === 'tint' || o.do === 'skin') {
        const col = hex(o.color), ref = o.ref ?? 0.5;
        each(o.rects, i => { if (o.skipSkin && isSkin(i)) return; if (src[i] + src[i + 1] + src[i + 2] < 12) return; if (png && src[i + 3] < 8) return; put(i, col, Math.max(0.3, Math.min(1.3, lum(i) / ref))); });
      } else if (o.do === 'darkenSkin') {
        each([[0, 0, 1, 1]], i => { if (isSkin(i)) { p[i] *= o.k; p[i + 1] *= o.k * 0.97; p[i + 2] *= o.k * 0.93; } });
      } else if (o.do === 'fill') {
        const col = hex(o.color);
        each(o.rects, i => { const n = 1 + (Math.random() - 0.5) * (o.noise ?? 0.12); put(i, col, n); });
      } else if (o.do === 'clone') {
        const [a, b2, c2, e] = o.rect, dy = Math.round(o.dy * H);
        for (let y = Math.floor(b2 * H); y < Math.ceil(e * H); y++) for (let X = Math.floor(a * W); X < Math.ceil(c2 * W); X++) { const i = (y * W + X) * 4, j = ((y + dy) * W + X) * 4; for (let k = 0; k < 3; k++) { src[i + k] = src[j + k]; p[i + k] = p[j + k]; } }
      } else if (o.do === 'stripes') {
        const A = hex(o.a), B = hex(o.b), ref = o.ref ?? 0.5;
        each(o.rects, (i, u, v) => { if (o.skipSkin && isSkin(i)) return; const t = o.axis === 'u' ? u : v, on = Math.floor(t * o.n) % 2 === 0; put(i, on ? A : B, Math.max(0.35, Math.min(1.25, lum(i) / ref))); });
      } else if (o.do === 'trefoil') {
        x.putImageData(d, 0, 0);
        const [cx, cy, sz] = o.at; x.save(); x.translate(cx * W, cy * H); x.fillStyle = o.color;
        for (const a of [-1.05, 0, 1.05]) { x.save(); x.rotate(a); x.beginPath(); x.ellipse(0, -sz * W * 0.32, sz * W * 0.16, sz * W * 0.32, 0, 0, 7); x.fill(); x.restore(); }
        x.restore();
        x.fillStyle = o.ground || '#111215';
        for (let k = 0; k < 3; k++) x.fillRect((cx - sz * 0.5) * W, (cy - sz * 0.18 + k * sz * 0.11) * H, sz * W, sz * 0.035 * H);
        const nd = x.getImageData(0, 0, W, H); p.set(nd.data); src.set(nd.data);
        continue;
      }
      src.set(p);
    }
    x.putImageData(d, 0, 0);
    return c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.88).split(',')[1];
  }, b64, s.ops, png);
  writeFileSync(s.out, Buffer.from(out, 'base64'));
  if (!png) execSync(`sips -s format jpeg -s formatOptions 84 -Z ${s.size || 768} "${s.out}" --out "${s.out}"`, { stdio: 'ignore' });
  console.log(role, '→', s.out);
}
await browser.close();
