import * as THREE from 'three';

/* Gaussian splats (Prince's experiments) through Spark, loaded only when a scene asks for one.
   Supports .spz .ply .splat .ksplat .sog. Put files in public/splats/. */
let Spark = null;
export async function splat(engine, scene, url, { position = [0, 0, 0], rotation = [Math.PI, 0, 0], scale = 1 } = {}) {
  Spark ??= await import('@sparkjsdev/spark');
  if (!scene.userData.spark) { const sr = new Spark.SparkRenderer({ renderer: engine.renderer }); scene.add(sr); scene.userData.spark = sr; }
  const m = new Spark.SplatMesh({ url });
  m.position.set(...position);
  m.rotation.set(...rotation);   // most phone captures come in upside-down; this flips them
  m.scale.setScalar(scale);
  scene.add(m);
  return m;
}
