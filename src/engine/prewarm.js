/** Build every shader and upload every texture for a scene while the screen is still black, so nothing stalls mid-shot. */
export function prewarm(engine) {
  const r = engine.renderer, S = engine.scene;
  r.compile(S, engine.camera);
  const seen = new Set();
  S.traverse(o => {
    for (const m of [].concat(o.material || [])) {
      if (seen.has(m)) continue; seen.add(m);
      for (const k in m) { const t = m[k]; if (t && t.isTexture && !t.userData.warm) { t.userData.warm = true; r.initTexture(t); } }
      if (m.uniforms) for (const k in m.uniforms) { const t = m.uniforms[k].value; if (t && t.isTexture && !t.userData.warm) { t.userData.warm = true; r.initTexture(t); } }
    }
  });
  engine.composer.render(); // one real frame under the black: geometry uploads, shadow maps, post passes
}
