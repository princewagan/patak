// Generates a depth map for every photo in public/photos -> public/depth/<name>.png
// Uses Depth Anything V2 (runs locally through transformers.js / onnxruntime).
// Usage: npm run depth            (all photos)
//        npm run depth IMG_6448   (one photo)
import { pipeline, RawImage } from '@huggingface/transformers';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const inDir = path.join(root, 'public/photos');
const outDir = path.join(root, 'public/depth');
fs.mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
const files = fs.readdirSync(inDir).filter(f => /\.(jpe?g|png)$/i.test(f))
  .filter(f => !only.length || only.some(o => f.startsWith(o)));

const model = process.env.DEPTH_MODEL || 'onnx-community/depth-anything-v2-base';
console.log('loading', model);
const depth = await pipeline('depth-estimation', model, { dtype: 'fp32' });

for (const f of files) {
  const t0 = Date.now();
  const img = await RawImage.read(path.join(inDir, f));
  const { predicted_depth } = await depth(img);
  // predicted_depth: [H, W] relative inverse depth (bigger = closer)
  const [h, w] = predicted_depth.dims.slice(-2);
  const d = predicted_depth.data;
  let lo = Infinity, hi = -Infinity;
  for (const v of d) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const buf = Buffer.alloc(w * h);
  for (let i = 0; i < d.length; i++) buf[i] = Math.round(255 * (d[i] - lo) / (hi - lo));
  const out = path.join(outDir, f.replace(/\.(jpe?g|png)$/i, '.png'));
  await sharp(buf, { raw: { width: w, height: h, channels: 1 } })
    .resize(img.width > img.height ? 1024 : 768, img.width > img.height ? 768 : 1024, { fit: 'fill' })
    .png().toFile(out);
  console.log(f, `${w}x${h}`, ((Date.now() - t0) / 1000).toFixed(1) + 's');
}
