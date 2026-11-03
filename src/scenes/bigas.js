import * as THREE from 'three';
import { prewarm } from '../engine/prewarm.js';
import { pbr, std, glow, box, cyl, at, canvasTex, envFrom, blob, rand } from '../engine/kit.js';
import { Person } from '../engine/person.js';
import { Rain, Splashes } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { cast } from '../engine/cast.js';
import { billMesh, pesoCoin } from '../engine/money.js';
import { animate, moveTo, walkPath } from '../engine/tween.js';
import { povArm } from './labas.js';

const PI = Math.PI;

/* Sari-sari store at night. Coordinates: sidewalk y=0. Store front wall in the z=0 plane,
   store interior at z<0. You stand in line at z≈1.75 looking toward -Z. Lola stands at z≈0.72.
   The window (with the wire grille) spans x∈[-1,1], y∈[0.95,2.05]; the small paying opening is at
   the bottom center. Street runs along X behind you (z 1.5..5.5). */
const WIN = { x0: -1.0, x1: 1.0, y0: 0.95, y1: 2.05 };
const LEDGE = 0.965;

function meshTex() {
  // diamond wire mesh, white on black (used as alphaMap)
  const t = canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#fff'; c.lineWidth = 9; c.lineCap = 'square';
    c.beginPath(); c.moveTo(0, h / 2); c.lineTo(w / 2, 0); c.lineTo(w, h / 2); c.lineTo(w / 2, h); c.closePath(); c.stroke();
  }, { srgb: false });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function priceBoard(sixty = false) {
  return canvasTex(512, 384, (c, w, h) => {
    c.fillStyle = '#1d2420'; c.fillRect(0, 0, w, h);
    // chalk smudges
    for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(220,220,210,${Math.random() * 0.035})`; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, 8 + Math.random() * 40, 0, 7); c.fill(); }
    c.strokeStyle = '#6b4b2c'; c.lineWidth = 22; c.strokeRect(0, 0, w, h);
    c.fillStyle = 'rgba(238,236,226,.92)'; c.textAlign = 'center';
    c.font = 'bold 92px "Bradley Hand","Segoe Print","Comic Sans MS",cursive';
    c.fillText('BIGAS', w / 2, 128);
    c.font = 'bold 84px "Bradley Hand","Segoe Print","Comic Sans MS",cursive';
    if (!sixty) c.fillText('₱58 / kilo', w / 2, 262);
    else {
      c.globalAlpha = 0.55; c.fillText('₱58', w / 2 - 110, 262); c.globalAlpha = 1;
      c.strokeStyle = 'rgba(238,236,226,.9)'; c.lineWidth = 9; c.beginPath(); c.moveTo(w / 2 - 200, 280); c.lineTo(w / 2 - 20, 226); c.stroke();
      c.fillText('₱60', w / 2 + 110, 262);
      c.font = '50px "Bradley Hand","Segoe Print","Comic Sans MS",cursive'; c.fillText('/ kilo', w / 2 + 110, 330);
    }
    c.font = '34px "Bradley Hand","Segoe Print","Comic Sans MS",cursive'; c.globalAlpha = 0.7;
    if (!sixty) c.fillText('itlog ₱9 · canton ₱21', w / 2, 340);
  });
}

function sachetStrip(seed) {
  const r = rand(seed);
  const pal = [['#6a2c8f', '#e9d9f2'], ['#0f7a3b', '#e7f4e0'], ['#c9a227', '#2b1e09'], ['#7a2a12', '#f2d7b0'], ['#1b4fa0', '#ffffff'], ['#b8171d', '#f6e7c8'], ['#111111', '#e0b84a'], ['#e86b1c', '#ffffff']];
  const [a, b] = pal[Math.floor(r() * pal.length)];
  return canvasTex(64, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const n = 9, sh = h / n;
    for (let i = 0; i < n; i++) {
      const y = i * sh + 2;
      c.fillStyle = a; c.fillRect(4, y, w - 8, sh - 5);
      c.fillStyle = b; c.fillRect(8, y + sh * 0.18, w - 16, sh * 0.22);
      c.fillStyle = b; c.globalAlpha = 0.7; c.fillRect(10, y + sh * 0.55, (w - 20) * (0.4 + r() * 0.5), 5); c.globalAlpha = 1;
      // crimped seal lines
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(4, y, w - 8, 3); c.fillRect(4, y + sh - 8, w - 8, 3);
    }
  });
}

function tvScreen() {
  return canvasTex(256, 160, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#1b4f8f'); g.addColorStop(1, '#0b2448'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#c9b7a0'; c.beginPath(); c.ellipse(80, 66, 22, 28, 0, 0, 7); c.fill(); // anchor head
    c.fillStyle = '#1e2733'; c.fillRect(48, 90, 64, 70);
    c.fillStyle = '#e8ecf2'; c.fillRect(0, 112, w, 30); c.fillStyle = '#c21d24'; c.fillRect(0, 112, 54, 30);
    c.fillStyle = '#fff'; c.font = 'bold 13px Inter'; c.fillText('BALITA', 6, 132);
    c.fillStyle = '#111'; c.font = 'bold 12px Inter'; c.fillText('PRESYO NG BIGAS, TUMAAS MULI', 60, 132);
  });
}

function riceBag(scale = 1) {
  const g = new THREE.Group();
  const riceT = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#e4ddcb'; c.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const v = 200 + Math.random() * 50; c.fillStyle = `rgb(${v},${v - 6},${v - 22})`; c.save(); c.translate(Math.random() * w, Math.random() * h); c.rotate(Math.random() * 3); c.fillRect(-3, -1.2, 6, 2.4); c.restore(); } });
  riceT.wrapS = riceT.wrapT = THREE.RepeatWrapping; riceT.repeat.set(3, 2);
  const V = (x, y) => new THREE.Vector2(x, y);
  // the rice inside: a soft sack shape, flat on the bottom
  const fill = new THREE.Mesh(new THREE.LatheGeometry([V(0, 0), V(0.055, 0.002), V(0.068, 0.02), V(0.07, 0.06), V(0.064, 0.1), V(0.045, 0.13), V(0.016, 0.145), V(0, 0.147)], 28), new THREE.MeshStandardMaterial({ map: riceT, roughness: 0.85 }));
  fill.scale.z = 0.86; g.add(fill);
  // the plastic over it, a touch bigger, with the twisted neck and the knot
  const plastic = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.18, transparent: true, opacity: 0.32, side: THREE.DoubleSide, clearcoat: 1, clearcoatRoughness: 0.15 });
  const skin = new THREE.Mesh(new THREE.LatheGeometry([V(0, -0.001), V(0.058, 0.001), V(0.072, 0.02), V(0.074, 0.06), V(0.068, 0.1), V(0.048, 0.135), V(0.014, 0.16), V(0.009, 0.185), V(0.012, 0.2)], 28), plastic);
  skin.scale.z = 0.88; g.add(skin);
  const knot = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.005, 6, 12), plastic); knot.position.y = 0.19; knot.rotation.x = 1.2; g.add(knot);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.04, 6, 1, true), plastic); tail.position.set(0.006, 0.215, 0); tail.rotation.z = -0.4; g.add(tail);
  g.scale.setScalar(scale); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export default {
  ao: true,   // contact shadows (see Engine)
  dof: { focus: 1.05, aperture: 0.004, maxblur: 0.008 },
  grade: { lift: [0.006, 0.004, 0.002], gain: [1.04, 0.97, 0.86], sat: 0.48, grain: 0.08, bloom: 0.36, bloomThreshold: 0.82, exposure: 1.12, vignette: 1.0, black: 0.025, gamma: 1.24, curve: 0.5 },

  async build(engine) {
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0x070a0e);
    S.fog = new THREE.FogExp2(0x0a0f15, 0.075);
    S.environment = await envFrom(engine.renderer, '/tex/modern_evening_street_1k.hdr');
    S.environmentIntensity = 0.12;
    this.people = []; this.lolaBags = [];

    // ---------- light ----------
    S.add(new THREE.HemisphereLight(0x2b3d55, 0x0a0908, 0.28));
    // the one warm bulb inside, hanging just behind the grille: casts the mesh pattern outward
    const bulb = this.bulb = new THREE.PointLight(0xffaa5e, 7, 8, 1.6);
    bulb.position.set(0.12, 1.98, -0.32); bulb.castShadow = true; bulb.shadow.mapSize.set(1024, 1024); bulb.shadow.bias = -0.002; bulb.shadow.camera.near = 0.05; bulb.shadow.radius = 2;
    S.add(bulb);
    const bulbM = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 10), glow(0xffc27a, 7)); bulbM.position.copy(bulb.position); S.add(bulbM);
    const cord = cyl(0.003, 0.003, 0.6, std(0x111111)); cord.position.set(0.12, 2.3, -0.32); S.add(cord);
    // fill inside the store
    const fill = new THREE.PointLight(0xff9a50, 1.2, 3, 2); fill.position.set(-0.6, 1.6, -1.1); S.add(fill);
    // TV glow (flickers)
    this.tvL = new THREE.PointLight(0x5c8cff, 0.8, 3.2, 2); this.tvL.position.set(0.75, 1.75, -1.05); S.add(this.tvL);
    // sodium street lamp down the street (right) — Lola walks under it
    const lamp = new THREE.PointLight(0xff9440, 9, 16, 1.5); lamp.position.set(6.2, 4.6, 2.2); S.add(lamp);
    const lampM = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.22), glow(0xffa64d, 5)); lampM.position.set(6.2, 4.65, 2.2); S.add(lampM);
    // a second bulb outside under the awning (lights the board, the strips, Lola's sides, the wet ground)
    const outB = new THREE.PointLight(0xffb36b, 5.5, 6, 1.5); outB.position.set(-0.95, 2.28, 0.6); S.add(outB);
    const outBM = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), glow(0xffc27a, 6)); outBM.position.copy(outB.position); S.add(outBM);
    // cool fill from the street behind you, so Lola's back has form
    const backFill = new THREE.SpotLight(0x8496b8, 14, 14, 0.5, 0.85, 1.4); backFill.position.set(1.6, 3.6, 5.8); backFill.target.position.set(0, 1, 0.6); S.add(backFill, backFill.target);
    // cold moonless night bounce from the street behind you
    const back = new THREE.DirectionalLight(0x6f86a8, 0.22); back.position.set(-3, 6, 8); S.add(back);

    // ---------- materials ----------
    const wallM = pbr('peeling_painted_wall', { repeat: [2.4, 1.4], color: 0xb9c6b4, wet: 0.15 });
    const wallDark = pbr('peeling_painted_wall', { repeat: [3, 1.4], color: 0x7b7f86 });
    const plyM = pbr('plywood', { repeat: [1.2, 0.5], color: 0xa58d6b });
    const tinM = pbr('corrugated_iron_02', { repeat: [4, 1], metal: 0.7, rough: 0.5, color: 0x8f969c });
    const shutterM = pbr('painted_metal_shutter', { repeat: [2, 1.5], color: 0x6a7c74 });
    const groundM = pbr('concrete_floor_01', { repeat: [4, 2], wet: 1, env: 1.4 });
    const roadM = pbr('asphalt_02', { repeat: [8, 2], wet: 1, env: 1.5 });

    // ---------- ground ----------
    const side = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.2), groundM); side.rotation.x = -PI / 2; side.position.set(0, 0, 0.5); side.receiveShadow = true; S.add(side);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(40, 6), roadM); road.rotation.x = -PI / 2; road.position.set(0, -0.06, 4.6); road.receiveShadow = true; S.add(road);
    const curb = box(30, 0.08, 0.14, std(0x6a6862, { rough: 0.9 })); curb.position.set(0, -0.02, 1.6); S.add(curb);
    const inFloor = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3), pbr('concrete_floor_01', { repeat: [2, 1.5], color: 0x8a8070 })); inFloor.rotation.x = -PI / 2; inFloor.position.set(0, 0.002, -1.5); S.add(inFloor);

    // ---------- store front wall with the window opening ----------
    const T = 0.14;
    S.add(at(box(1.4, 2.9, T, wallM), -1.7, 1.45, -T / 2));            // left of window
    S.add(at(box(1.4, 2.9, T, wallM), 1.7, 1.45, -T / 2));             // right of window
    S.add(at(box(2.0, WIN.y0, T, wallM), 0, WIN.y0 / 2, -T / 2));      // below (counter base)
    S.add(at(box(2.0, 2.9 - WIN.y1, T, wallM), 0, (2.9 + WIN.y1) / 2, -T / 2)); // above
    // counter ledge (plywood) sticking out under the window
    S.add(at(box(2.1, 0.035, 0.42, plyM), 0, LEDGE - 0.02, 0.1));
    S.add(at(box(2.1, 0.035, 0.5, plyM), 0, LEDGE - 0.02, -0.33));       // inside counter
    // the grille
    const mt = meshTex(); mt.repeat.set(42, 23);
    const grilleM = new THREE.MeshStandardMaterial({ color: 0x31463a, metalness: 0.45, roughness: 0.55, alphaMap: mt, alphaTest: 0.45, side: THREE.DoubleSide });
    // grille with the small paying opening at the bottom center: build as 3 panels
    const gw = WIN.x1 - WIN.x0, gh = WIN.y1 - WIN.y0, hole = { w: 0.44, h: 0.26 };
    const gPanel = (x0, x1, y0, y1) => {
      const g = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, ((x0 + uv.getX(i) * (x1 - x0)) - WIN.x0) / gw, ((y0 + uv.getY(i) * (y1 - y0)) - WIN.y0) / gh);
      const m = new THREE.Mesh(g, grilleM); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.012); m.castShadow = true; return m;
    };
    S.add(gPanel(WIN.x0, -hole.w / 2, WIN.y0, WIN.y1), gPanel(hole.w / 2, WIN.x1, WIN.y0, WIN.y1), gPanel(-hole.w / 2, hole.w / 2, WIN.y0 + hole.h, WIN.y1));
    const frameM = std(0x24342b, { rough: 0.5, metal: 0.5 });
    for (const [w, h, x, y] of [[gw + 0.06, 0.04, 0, WIN.y1], [gw + 0.06, 0.04, 0, WIN.y0 + 0.01], [0.04, gh, WIN.x0, (WIN.y0 + WIN.y1) / 2], [0.04, gh, WIN.x1, (WIN.y0 + WIN.y1) / 2], [0.025, hole.h, -hole.w / 2, WIN.y0 + hole.h / 2], [0.025, hole.h, hole.w / 2, WIN.y0 + hole.h / 2], [hole.w, 0.025, 0, WIN.y0 + hole.h]])
      S.add(at(box(w, h, 0.03, frameM), x, y, 0.02));
    // small signs on the wall
    const load = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), new THREE.MeshStandardMaterial({ roughness: 0.7, map: canvasTex(420, 280, (c, w, h) => {
      c.fillStyle = '#f3efe4'; c.fillRect(0, 0, w, h); c.fillStyle = '#1556b5'; c.fillRect(0, 0, w, 86);
      c.fillStyle = '#fff'; c.font = 'bold 54px Inter'; c.textAlign = 'center'; c.fillText('LOAD', w / 2, 64);
      c.fillStyle = '#1a1a1a'; c.font = 'bold 40px Inter'; c.fillText('GCASH', w / 2, 150); c.font = '30px Inter'; c.fillText('CASH-IN · CASH-OUT', w / 2, 210);
    }) }));
    load.position.set(-1.45, 1.62, 0.006); S.add(load);
    this.boardTex = [priceBoard(false), priceBoard(true)];
    this.boardM = new THREE.MeshStandardMaterial({ map: this.boardTex[0], roughness: 0.9 });
    const board = this.board = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.39), this.boardM); board.position.set(1.42, 1.55, 0.012); board.rotation.z = -0.03; S.add(board);
    const nail = cyl(0.006, 0.006, 0.02, std(0x333)); nail.rotation.x = PI / 2; nail.position.set(1.42, 1.78, 0.02); S.add(nail);

    // ---------- the tin awning + drip line ----------
    const aw = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.025, 1.45), tinM); aw.position.set(0, 2.6, 0.68); aw.rotation.x = 0.2; aw.castShadow = true; aw.receiveShadow = true; S.add(aw);
    for (const x of [-2.4, 2.4]) { const p = cyl(0.03, 0.03, 2.5, std(0x3b3f43, { metal: 0.5, rough: 0.6 })); p.position.set(x, 1.25, 1.3); S.add(p); }
    const dn = 170, dg = new THREE.BufferGeometry(), dpos = new Float32Array(dn * 3); this.dripSeed = [];
    for (let i = 0; i < dn; i++) { dpos.set([-2.45 + (i / dn) * 4.9 + Math.random() * 0.04, 2.45, 1.38], i * 3); this.dripSeed.push(Math.random()); }
    dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
    this.drips = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xffe2c0, size: 0.02, transparent: true, opacity: 0.9, depthWrite: false, map: canvasTex(32, 32, (c) => { const g = c.createRadialGradient(16, 16, 0, 16, 16, 16); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 32, 32); }), alphaTest: 0.02 })); S.add(this.drips);

    // ---------- inside the store ----------
    const shelfBack = box(3.6, 2.7, 0.08, plyM); shelfBack.position.set(0, 1.35, -1.75); S.add(shelfBack);
    for (const x of [-1.95, 1.95]) S.add(at(box(0.1, 2.9, 1.8, wallDark), x, 1.45, -0.9));
    S.add(at(box(4, 0.06, 1.9, plyM), 0, 2.88, -0.9));
    const r = rand(5);
    const canG = new THREE.CylinderGeometry(0.034, 0.034, 0.11, 12), bottleG = new THREE.CylinderGeometry(0.03, 0.034, 0.24, 10), boxG = new THREE.BoxGeometry(0.09, 0.14, 0.06);
    const items = [];
    for (const y of [0.95, 1.35, 1.75, 2.15]) {
      S.add(at(box(3.4, 0.03, 0.34, plyM), 0, y, -1.56));
      let x = -1.6;
      while (x < 1.6) {
        const k = r(); const it = k < 0.5 ? 'can' : k < 0.75 ? 'bottle' : 'box';
        const w = it === 'box' ? 0.1 : 0.075;
        items.push({ it, x, y, z: -1.6 + (r() - 0.5) * 0.08 }); x += w + r() * 0.015;
      }
    }
    const palette = [0xb8211e, 0xe0b23a, 0x1f5fb0, 0x2a8a4a, 0xe9e4d8, 0x8a2f6b, 0xd86a1f, 0x222222];
    for (const [type, geo, h] of [['can', canG, 0.11], ['bottle', bottleG, 0.24], ['box', boxG, 0.14]]) {
      const list = items.filter(i => i.it === type);
      // printed labels: light where the print is, so each instance colour still tints it like a different brand
      const label = canvasTex(256, 256, (g, w, hh) => {
        const band = (y0, y1, col) => { g.fillStyle = col; g.fillRect(0, y0 * hh, w, (y1 - y0) * hh); };
        if (type === 'can') { band(0, 1, '#d8d8d8'); band(0, 0.08, '#f4f4f4'); band(0.92, 1, '#f4f4f4'); band(0.3, 0.42, '#ffffff'); band(0.5, 0.56, '#555'); }
        else if (type === 'bottle') { band(0, 1, '#7a7a7a'); band(0, 0.1, '#f0f0f0'); band(0.38, 0.68, '#f6f6f6'); band(0.47, 0.53, '#444'); }
        else { band(0, 1, '#d0d0d0'); band(0, 0.16, '#ffffff'); band(0.62, 0.86, '#f8f8f8'); }
        g.fillStyle = 'rgba(30,30,30,0.55)'; for (let i = 0; i < 9; i++) g.fillRect(28 + i * 22, (type === 'box' ? 0.7 : 0.33) * hh, 12, 0.04 * hh);
      });
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: label, roughness: type === 'can' ? 0.32 : type === 'bottle' ? 0.22 : 0.6, metalness: type === 'can' ? 0.55 : 0, envMapIntensity: type === 'box' ? 0.6 : 1.4 }), list.length);
      const m4 = new THREE.Matrix4(), c = new THREE.Color();
      list.forEach((i, k) => { m4.makeTranslation(i.x, i.y + 0.015 + h / 2, i.z); im.setMatrixAt(k, m4); im.setColorAt(k, c.setHex(palette[Math.floor(r() * palette.length)])); });
      im.castShadow = true; im.receiveShadow = true; S.add(im);
    }
    // candy jars on the inside counter
    const glassM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, envMapIntensity: 2 });
    [[-0.75, 0xd23a3a], [-0.48, 0xf2c94c], [0.55, 0x3aa86a], [0.8, 0xe88a2a]].forEach(([x, col]) => {
      const jar = cyl(0.075, 0.075, 0.22, glassM, 20); jar.position.set(x, LEDGE + 0.11, -0.22); S.add(jar);
      const fillJ = cyl(0.066, 0.066, 0.15, std(col, { rough: 0.4 }), 16); fillJ.position.set(x, LEDGE + 0.08, -0.22); S.add(fillJ);
      const lid = cyl(0.08, 0.08, 0.03, std(0xb21f24, { rough: 0.4 }), 20); lid.position.set(x, LEDGE + 0.235, -0.22); S.add(lid);
    });
    // hanging sachet strips on a rod just behind the grille
    const rod = cyl(0.008, 0.008, 2.0, std(0x777777, { metal: 0.8, rough: 0.4 })); rod.rotation.z = PI / 2; rod.position.set(0, 2.0, -0.14); S.add(rod);
    this.strips = [];
    for (let i = 0; i < 11; i++) {
      const x = -0.92 + i * 0.184 + (Math.random() - 0.5) * 0.03;
      if (Math.abs(x) < 0.25) continue; // keep the middle clear so you can see the tindera
      const len = 0.55 + Math.random() * 0.32;
      const st = new THREE.Mesh(new THREE.PlaneGeometry(0.075, len), new THREE.MeshStandardMaterial({ map: sachetStrip(i * 7 + 3), transparent: true, alphaTest: 0.1, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide }));
      st.geometry.translate(0, -len / 2, 0); st.position.set(x, 1.99, -0.16); st.castShadow = true; S.add(st); this.strips.push(st);
    }
    // rice sacks inside
    const sackM = new THREE.MeshStandardMaterial({ color: 0xe9e3d3, roughness: 0.95, normalMap: pbr('denim_fabric').normalMap });
    [[-1.4, -0.9], [-1.15, -1.25], [1.35, -1.0]].forEach(([x, z], i) => { const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.32, 6, 14), sackM); s.scale.set(1, 1, 0.8); s.position.set(x, 0.38, z); s.rotation.z = (i - 1) * 0.08; s.castShadow = true; S.add(s); });
    // TV on the top shelf corner
    const tv = new THREE.Group(); tv.position.set(0.95, 2.42, -1.45); tv.rotation.y = -0.45; S.add(tv);
    tv.add(at(box(0.42, 0.3, 0.12, std(0x16181b, { rough: 0.4 })), 0, 0, 0));
    this.tvM = new THREE.MeshBasicMaterial({ map: tvScreen() });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.23), this.tvM); scr.position.z = 0.062; tv.add(scr);

    // ---------- neighbours / street ----------
    S.add(at(box(6, 3.2, 0.2, wallDark), -5.4, 1.6, -0.1));
    const gate = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.1), shutterM); gate.position.set(-4.0, 1.05, 0.01); S.add(gate);
    S.add(at(box(8, 3.6, 0.2, wallM), 6.5, 1.8, -0.1));
    const gate2 = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 2.2), shutterM); gate2.position.set(4.2, 1.1, 0.01); S.add(gate2);
    // across the street (behind you, mostly dark, a few lit windows)
    for (let i = 0; i < 6; i++) {
      const x = -10 + i * 4;
      S.add(at(box(3.9, 3 + (i % 3) * 0.8, 0.3, wallDark), x, 1.6 + (i % 3) * 0.4, 7.6));
      if (i % 2) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), glow(0xffcf8a, 0.9)); w.position.set(x + 0.6, 2.0, 7.44); w.rotation.y = PI; S.add(w); }
    }
    // utility pole near the lamp
    const pole = cyl(0.1, 0.14, 7, std(0x77746e, { rough: 0.9 })); pole.position.set(6.6, 3.5, 2.0); S.add(pole);

    // ---------- people ----------
    const lola = this.lola = new Person({ real: 'lola', h: 1.45, skin: 'brown', top: 0x6e5a6b, bottom: 0x4a4440, skirt: true, hair: 'none', hairColor: 0x9c968d, build: 0.86, longSleeve: true, shoes: 0x2a2522 });
    {
      const clothN = pbr('denim_fabric', { repeat: [3, 3] }).normalMap;
      const kerM = new THREE.MeshStandardMaterial({ color: 0x5e5546, roughness: 0.95, normalMap: clothN, side: THREE.DoubleSide });
      const hr = lola.hr;
      const ker = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.13, 26, 16, 0, PI * 2, 0, PI * 0.74), kerM);
      ker.position.set(0, hr * 0.98, -hr * 0.05); ker.rotation.x = -0.42; ker.scale.set(0.93, 1.02, 1.08); ker.castShadow = true; if (!lola.real) lola.head.add(ker);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.22, 10, 8), kerM); knot.position.set(0, hr * 0.32, hr * 0.62); if (!lola.real) lola.head.add(knot);
      const flap = new THREE.Mesh(new THREE.ConeGeometry(hr * 0.75, hr * 1.3, 3, 1, true), kerM); flap.scale.z = 0.25; flap.rotation.set(0.15, 0, PI); flap.position.set(0, hr * 0.15, -hr * 0.82); if (!lola.real) lola.head.add(flap);
      const V = (x, y) => new THREE.Vector2(x, y), sc = lola.H / 1.7;
      const shawl = new THREE.Mesh(new THREE.LatheGeometry([V(0.046, 0.16), V(0.052, 0.12), V(0.062, 0.08), V(0.09, 0.045), V(0.15, -0.0), V(0.19, -0.06), V(0.205, -0.15), V(0.2, -0.27)].map(v => v.multiplyScalar(sc)), 28),
        new THREE.MeshStandardMaterial({ color: 0x6b5f4f, roughness: 0.97, normalMap: clothN, side: THREE.DoubleSide }));
      shawl.scale.z = 0.8; shawl.castShadow = true; shawl.position.y = 0.1 * sc; if (!lola.real) lola.chest.add(shawl);
    }
    lola.root.position.set(0.02, 0, 0.74); lola.root.rotation.y = PI; lola.pose('stoop', true); S.add(lola.root); this.people.push(lola);
    // Lola's coin purse, held in front of her in both hands
    const purse = this.purse = new THREE.Group();
    purse.add(at(box(0.1, 0.065, 0.032, std(0x7a2d3a, { rough: 0.6 }), 0.014), 0, 0, 0));
    purse.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 16, PI), std(0xb8a77a, { metal: 0.8, rough: 0.3 })), 0, 0.033, 0));
    lola.spine.add(purse); purse.position.set(0, 0.02, 0.21); purse.rotation.x = 0.3;
    this.purseL = new THREE.Object3D(); this.purseL.position.set(0.055, -0.02, -0.03); purse.add(this.purseL);
    this.purseR = new THREE.Object3D(); this.purseR.position.set(-0.055, -0.02, -0.03); purse.add(this.purseR);
    const tindera = this.tindera = new Person({ real: 'tindera', h: 1.56, skin: 'tan', top: 0xb47f78, bottom: 0xb47f78, skirt: true, hair: 'bun', build: 1.12, belly: true });
    tindera.root.position.set(0.02, 0, -0.48); tindera.pose('standRelaxed', true); S.add(tindera.root); this.people.push(tindera);
    // her lista, the notebook of who owes what, lying on her side of the counter
    const lista = this.lista = new THREE.Group(); lista.position.set(-0.32, LEDGE + 0.008, -0.3); lista.rotation.y = 0.25; S.add(lista);
    lista.add(at(box(0.15, 0.012, 0.2, std(0x2f4f8f, { rough: 0.6 })), 0, 0, 0));
    lista.add(at(box(0.142, 0.013, 0.19, std(0xe9e4d6, { rough: 0.9 })), 0.004, 0.0005, 0));
    // the tin she keeps the coins in
    const lata = this.lata = new THREE.Group(); lata.position.set(0.32, LEDGE, -0.3); S.add(lata);
    lata.add(at(cyl(0.05, 0.05, 0.1, std(0xa9aeb2, { metal: 0.8, rough: 0.35 }), 20), 0, 0.05, 0));
    lata.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.003, 6, 24), std(0x8a8f93, { metal: 0.8, rough: 0.3 })), 0, 0.1, 0, 0, PI / 2));
    S.add(at(blob(0.3, 0.55), 0.02, 0.004, 0.74));

    // coins Lola counts out on the ledge (₱40: three ₱10 + two ₱5); they start in her purse
    this.ledgeCoins = [];
    [[-0.12, 0.2, 10], [-0.08, 0.17, 10], [-0.04, 0.215, 10], [0.0, 0.18, 5], [0.04, 0.205, 5]].forEach(([x, z, v]) => {
      const c = pesoCoin(v); c.position.set(x, LEDGE + 0.0015, z); c.userData.home = c.position.clone(); c.visible = false; S.add(c); this.ledgeCoins.push(c);
    });
    this.myCoins = [pesoCoin(20), pesoCoin(10)]; this.myCoins.forEach((c, i) => { c.position.set(0.1 + i * 0.035, LEDGE + 0.0015, 0.2); c.userData.home = c.position.clone(); c.visible = false; S.add(c); });
    // rice bags + your pancit canton on the ledge
    this.bagFull = riceBag(1); this.bagHalf = riceBag(0.8);
    for (const b of [this.bagFull, this.bagHalf]) { b.visible = false; S.add(b); }
    const canton = this.canton = new THREE.Group();
    canton.add(at(box(0.11, 0.025, 0.14, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3, map: canvasTex(128, 160, (c, w, h) => { c.fillStyle = '#e8b21b'; c.fillRect(0, 0, w, h); c.fillStyle = '#b5121b'; c.fillRect(0, 40, w, 60); c.fillStyle = '#fff'; c.font = 'bold 22px Inter'; c.textAlign = 'center'; c.fillText('PANCIT', w / 2, 66); c.fillText('CANTON', w / 2, 90); }) })), 0, 0.013, 0));
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), std(0xe8d6b8, { rough: 0.5 })); egg.scale.y = 1.3; egg.position.set(0.09, 0.03, 0); canton.add(egg);
    canton.position.set(0.12, LEDGE, 0.14); canton.rotation.y = 0.3; canton.visible = false; S.add(canton);

    // ---------- your hand and your wallet (first person) ----------
    this.held = new THREE.Group(); S.add(this.held);
    this.arm = povArm(); this.held.add(this.arm);
    const wallet = this.wallet = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.55, normalMap: pbr('leather_red_03', { noDiff: true }).normalMap });
    // an open bifold: the back half, the bill pocket, the front half folded back a little
    wallet.add(at(box(0.11, 0.09, 0.006, leather, 0.003), 0, 0, 0));
    const flap = at(box(0.11, 0.09, 0.005, leather, 0.003), 0, -0.088, 0.012, 0, -0.35); wallet.add(flap);
    wallet.add(at(box(0.104, 0.05, 0.003, new THREE.MeshStandardMaterial({ color: 0x2c1f17, roughness: 0.6 })), 0, -0.022, 0.006));
    this.walletBills = new THREE.Group(); wallet.add(this.walletBills);
    wallet.visible = false; this.held.add(wallet);
    const coinL = new THREE.PointLight(0xffb070, 0.08, 0.8, 2); coinL.position.set(0, 0.05, -0.2); this.held.add(coinL);

    // ---------- weather ----------
    this.rain = new Rain({ count: 9000, size: [18, 10, 18], speed: 9, opacity: 0.5, wind: [0.3, 0.6] }).exclude([-2.45, -1, -3], [2.45, 2.75, 1.36]);
    S.add(this.rain.mesh);
    this.splash = new Splashes({ count: 380, area: [16, 4.2], center: [0, 3.6], y: 0.004, rate: 1.4, opacity: 0.4 }); S.add(this.splash.mesh);
    this.splashDrip = new Splashes({ count: 70, area: [4.8, 0.12], center: [0, 1.42], y: 0.006, rate: 1.8, opacity: 0.55, color: 0xffd9b0 }); S.add(this.splashDrip.mesh);
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.55; engine.rig.jolt = 0; engine.rig.pov = 1;
    engine.rig.set({ pos: [0.5, 1.58, 2.45], look: [0.0, 1.25, 0.0], fov: 44 });
    engine.dof({ target: this.lola.head, aperture: 0.004 });
    this.boardM.map = this.boardTex[0]; this.boardM.needsUpdate = true;
    if (!this.fill) { this.fill = new THREE.PointLight(0xffdcb8, 2.2, 5, 1.6); this.fill.position.set(0.3, 1.75, 1.75); this.scene.add(this.fill); }   // so Lola's back reads as a person, not a shape
    audio.rain(0.62, 0.12); audio.roof(0.42); audio.murmur(0.32, 'tv', 1150); audio.layer('engine', 0); audio.layer('traffic', 0); audio.scape('sari');
    prewarm(engine);
  },
  exit() { audio.layer('roof', 0); audio.layer('tv', 0); audio.layer('drone', 0, null, 3); audio.scape(null); },

  update(dt, t) {
    this.rain.update(t, this.engine.camera);
    this.splash.update(t); this.splashDrip.update(t);
    const dp = this.drips.geometry.attributes.position;
    for (let i = 0; i < dp.count; i++) { const k = (t * (0.7 + this.dripSeed[i] * 0.8) + this.dripSeed[i] * 9) % 1; dp.setY(i, 2.45 - k * k * 2.45); }
    dp.needsUpdate = true;
    // bulb sways a hair on its cord, TV flickers
    this.bulb.position.x = 0.12 + Math.sin(t * 0.9) * 0.008;
    this.tvL.intensity = 0.55 + Math.sin(t * 7.3) * 0.12 + (Math.random() < 0.06 ? 0.4 : 0);
    for (const s of this.strips) s.rotation.y = Math.sin(t * 0.8 + s.position.x * 5) * 0.12;
    for (const p of this.people) p.update(dt, t);
    this.held.position.copy(this.engine.camera.position); this.held.quaternion.copy(this.engine.camera.quaternion);
  },

  /* ================= the chapter ================= */
  /** what's in your wallet right now, as real notes and coins */
  fillWallet(amount) {
    const g = this.walletBills; g.clear();
    const notes = amount >= 160 ? [100, 50] : amount >= 150 ? [100, 50] : amount >= 100 ? [100] : amount >= 50 ? [50] : [];
    notes.forEach((v, i) => { const b = billMesh(v, 0.1); b.position.set((i - 0.5) * 0.008, 0.012 + i * 0.006, 0.004 + i * 0.002); b.rotation.z = (i - 0.5) * 0.06; g.add(b); });
    let rest = amount - notes.reduce((a, b) => a + b, 0), i = 0;
    for (const v of [20, 10, 5, 1]) while (rest >= v && i < 5) { const c = pesoCoin(v); c.rotation.x = PI / 2; c.position.set(-0.035 + i * 0.022, -0.03, 0.009); g.add(c); rest -= v; i++; }
  },
  /** your hand comes up into view holding the open wallet (camera space: x right, y up, -z ahead) */
  async showWallet(on) {
    const w = this.wallet, arm = this.arm, el = new THREE.Vector3(0.22, -0.46, -0.12);
    const place = k => { const y = -0.42 + 0.3 * k; w.position.set(0.035, y, -0.4); w.rotation.set(-0.55, 0.12, 0.06); arm.reach(new THREE.Vector3(0.07, y - 0.075, -0.37), el.clone().setY(el.y - (1 - k) * 0.2), 0.4); };
    w.visible = arm.visible = true;
    await animate(k => place(on ? k : 1 - k), on ? 0.9 : 0.7, 'inOut');
    if (!on) w.visible = arm.visible = false;
  },
  /** your hand reaches out and puts coins down on the ledge next to hers, one by one */
  async putCoins(coins) {
    const arm = this.arm, held = this.held, wr = new THREE.Vector3(), el = new THREE.Vector3(0.22, -0.46, -0.12), inv = new THREE.Matrix4();
    arm.visible = true;
    for (const c of coins) {
      held.updateMatrixWorld(true); inv.copy(held.matrixWorld).invert();
      const spot = c.userData.home.clone().add(new THREE.Vector3(0.025, 0.06, 0.05)).applyMatrix4(inv), start = new THREE.Vector3(0.08, -0.3, -0.34);
      c.visible = true;
      await animate(k => { wr.lerpVectors(start, spot, k); arm.reach(wr, el, 0.5); const p = wr.clone().add(new THREE.Vector3(-0.02, -0.04, -0.06)).applyMatrix4(held.matrixWorld); c.position.copy(p).lerp(c.userData.home, k * k); }, 0.75, 'inOut');
      c.position.copy(c.userData.home); audio.coin();
      await animate(k => { wr.lerpVectors(spot, start, k); arm.reach(wr, el, 0.5); }, 0.5, 'inOut');
    }
    arm.visible = false;
  },
  /** the tindera sweeps the coins off the ledge into her hand and drops them in her tin */
  async takeCoins(coins) {
    const tin = this.tindera, hand = new THREE.Vector3();
    tin.set({ spine: [18, 0, 0] });
    for (const c of coins) {
      tin.reach('R', hand.copy(c.position).add(new THREE.Vector3(0, 0.06, -0.06)), { rate: 10 });
      await new Promise(r => setTimeout(r, 0));
      await this.wait(0.32);
      const p0 = c.position.clone(); audio.tone(4800 + Math.random() * 600, 0.08, { vol: 0.02 });
      await animate(k => { c.position.lerpVectors(p0, hand, k); }, 0.18, 'in');
      tin.arm.R.wr.attach(c);
    }
    tin.reach('R', this.lata.position.clone().add(new THREE.Vector3(0, 0.2, 0)), { rate: 7 });
    await this.wait(0.55);
    const drop = this.lata.position.clone().add(new THREE.Vector3(0, 0.06, 0));
    for (const c of coins) { this.scene.attach(c); const p0 = c.position.clone(); await animate(k => c.position.lerpVectors(p0, drop, k), 0.12, 'in'); c.visible = false; c.position.copy(c.userData.home); c.rotation.set(0, 0, 0); }
    audio.coin();
    tin.reach('R', null); tin.set({ spine: [0, 0, 0] });
  },
  wait(s) { return new Promise(r => { let t = 0; const stop = this.engine.onUpdate((dt, _, raw) => { t += raw; if (t >= s) { stop(); r(); } }); }); },

  async play(D, S, beat) {
    if (beat === 'montage') return this.montage(D, S);
    const rig = this.engine.rig, E = this.engine, lola = this.lola, tin = this.tindera;
    const cam = (pos, look, dur = 2.5, fov, e) => rig.move({ pos, look, dur, fov, e });
    if (S.wallet == null) S.wallet = 160;
    const C = cast(D); C.people({ 'Lola Ising': lola, Tindera: tin });
    lola.reach('L', this.purseL, { rate: 30 }); lola.reach('R', this.purseR, { rate: 30 });

    cam([0.36, 1.58, 1.78], [0.0, 1.22, 0.0], 7, 42, 'out');
    await D.black(false, 1.6);
    await D.wait(1.6);
    C.intro('Lola Ising', 'Kapitbahay ninyo. Tatlong apo ang pinapakain niya.');
    await D.say('Lola Ising', "Isang kilo nga, 'neng.");

    // tindera, through the grille; then the price board
    E.dof({ target: tin.head, aperture: 0.005 });
    tin.look(lola.head, 0.8);
    cam([0.34, 1.6, 1.62], [0.12, 1.42, -0.55], 2.0, 34);
    await D.say('Tindera', "₱58 na po, 'La. Tumaas na naman po.");
    E.dof({ target: this.board, aperture: 0.004 });
    await cam([0.42, 1.58, 1.62], [1.42, 1.55, 0.0], 1.6, 30);
    await D.wait(1.2);

    // Lola takes her coins out of the purse and puts them down on the ledge, one at a time
    E.dof({ focus: 1.15, aperture: 0.006 });
    lola.set({ neck: [32, 0, 0], spine: [14, 0, 0] });
    cam([0.58, 1.46, 1.38], [-0.02, LEDGE, 0.2], 2.0, 28);
    await D.wait(1.0);
    { const hand = new THREE.Vector3(), pf = new THREE.Vector3();
      for (const c of this.ledgeCoins) {
        lola.reach('R', this.purseR, { rate: 12 });
        await this.wait(0.3);
        this.purse.getWorldPosition(pf); c.visible = true;
        lola.reach('R', hand.copy(c.userData.home).add(new THREE.Vector3(-0.01, 0.07, 0.07)), { rate: 9 });
        await animate(k => { c.position.lerpVectors(pf, c.userData.home, k); c.position.y += Math.sin(k * PI) * 0.03; }, 0.42, 'inOut');
        c.position.copy(c.userData.home);
        audio.tone(5200 + Math.random() * 800, 0.18, { vol: 0.035 }); audio.tone(3600, 0.12, { vol: 0.02 });
      }
      lola.reach('R', this.purseR, { rate: 8 }); }
    await D.say('', 'Binilang ni Lola ang barya niya. ₱40 lang. Kulang ng ₱18.');
    lola.expression({ sad: 0.6 }); lola.set({ neck: [40, 0, 0] });
    await D.say('Lola Ising', 'Kalahati na lang pala.');

    // the lista: she puts her hand flat on it
    E.dof({ target: tin.head, aperture: 0.005 });
    tin.reach('R', this.lista.position.clone().add(new THREE.Vector3(0, 0.05, 0.02)), { rate: 6 }); tin.set({ spine: [10, 0, 0] });
    cam([0.36, 1.6, 1.6], [0.1, 1.38, -0.55], 1.8, 36);
    await D.say('Tindera', "Pasensya na po, 'La. Puno na po 'yung lista n'yo.");
    tin.reach('R', null); tin.set({ spine: [0, 0, 0] });

    // Lola, half-turned, in silhouette against the bulb
    lola.set({ neck: [22, 35, 0], spine: [14, 0, 0] });
    E.dof({ target: lola.head, aperture: 0.005 });
    cam([0.62, 1.52, 1.58], [-0.05, 1.28, 0.6], 2.2, 38);
    await D.say('Lola Ising', 'May tatlo kasi akong apo sa bahay…');
    audio.drone(0.55, [43.65, 65.41, 98.0, 130.81]);

    // your wallet, in your own hand
    this.fillWallet(S.wallet);
    E.dof({ focus: 0.42, aperture: 0.006 });
    cam([0.36, 1.58, 1.78], [0.34, 1.32, 1.2], 1.2, 40);
    await this.showWallet(true);
    await D.say('', `₱${S.wallet} na lang ang pera mo. Tatlong araw pa bago sumahod.`);
    await this.showWallet(false);
    E.dof({ target: lola.head, aperture: 0.004 });
    lola.set({ neck: [26, 0, 0] });
    cam([0.36, 1.58, 1.78], [0.0, 1.15, 0.2], 1.8, 40);
    await D.wait(0.8);

    const devPick = new URLSearchParams(location.search).get('pick');
    if (devPick != null) setTimeout(() => document.querySelectorAll('#choice .opt')[+devPick]?.click(), 1800);
    const p = await D.choose(['Dagdagan|Ikaw na ang magbayad ng kulang', "Itabi|Pangkain mo pa 'yan bukas"], { timer: 12, id: 'bigas', def: 1 });
    S.bigas = p === 0;
    const fetchBag = async (bag, half) => {
      // she scoops it out of the sack below the counter and sets it down in the opening
      tin.look(null); tin.set({ spine: [34, 0, 0] }); tin.reach('R', new THREE.Vector3(0.15, 0.62, -0.35), { rate: 5 });
      await D.wait(1.0);
      bag.visible = true; tin.arm.R.wr.add(bag); bag.position.set(0, -0.2, 0.03); bag.rotation.set(0, 0, 0);
      tin.set({ spine: [10, 0, 0] }); tin.reach('R', new THREE.Vector3(-0.02, LEDGE + 0.26, -0.02), { rate: 4 });
      await D.wait(1.0);
      this.scene.attach(bag); audio.paper();
      await animate(k => { bag.position.y += (LEDGE + 0.002 - bag.position.y) * k; bag.rotation.set(0, 0.3 * k, 0); }, 0.3, 'out');
      bag.position.set(-0.02, LEDGE + 0.002, 0.06);
      tin.reach('R', null); tin.set({ spine: [0, 0, 0] });
    };
    // Lola takes the bag in both hands and holds it against her
    const takeBag = async bag => {
      lola.set({ spine: [20, 0, 0] });
      lola.reach('L', bag.position.clone().add(new THREE.Vector3(0.06, 0.08, 0.04)), { rate: 7 }); lola.reach('R', bag.position.clone().add(new THREE.Vector3(-0.06, 0.08, 0.04)), { rate: 7 });
      await D.wait(0.7);
      lola.spine.attach(bag); audio.paper();
      const p0 = bag.position.clone(), q0 = bag.quaternion.clone(), p1 = new THREE.Vector3(0, -0.05, 0.2), q1 = new THREE.Quaternion();
      this.purse.visible = false;   // it went into her pocket while her hands were on the bag
      const hl = new THREE.Object3D(), hr = new THREE.Object3D(); hl.position.set(0.07, 0.07, 0.03); hr.position.set(-0.07, 0.04, 0.05); bag.add(hl, hr);
      lola.reach('L', hl, { rate: 6 }); lola.reach('R', hr, { rate: 6 });
      lola.set({ spine: [8, 0, 0] });
      await animate(k => { bag.position.lerpVectors(p0, p1, k); bag.quaternion.slerpQuaternions(q0, q1, k); }, 0.8, 'inOut');
      this.lolaBags.push(bag); return { hl, hr };
    };
    if (S.bigas) {
      S.wallet -= 20;
      // your ₱20 goes onto the ledge next to her coins
      E.dof({ focus: 0.55, aperture: 0.005 });
      cam([0.32, 1.54, 1.5], [0.08, LEDGE, 0.2], 1.0, 36);
      await D.wait(0.6);
      await this.putCoins([this.myCoins[0]]);
      E.dof({ focus: 1.1, aperture: 0.006 });
      await D.say('', 'Inabot mo ang bente.');
      // the tindera takes it all, and fills a whole kilo
      await this.takeCoins([...this.ledgeCoins, this.myCoins[0]]);
      await fetchBag(this.bagFull);
      const { hl } = await takeBag(this.bagFull);
      // Lola turns to you and takes your hand
      await animate(k => { lola.root.rotation.y = PI - k * (PI - 0.3); lola.root.position.x = 0.02 + k * 0.1; lola.root.position.z = 0.74 + k * 0.2; }, 1.2);
      lola.expression({ smile: 0.6, sad: 0 }); lola.set({ spine: [10, 0, 0], neck: [16, 0, 0] });
      E.dof({ target: lola.head, aperture: 0.004 });
      await cam([0.46, 1.56, 1.92], [0.16, 1.2, 1.0], 1.4, 38);
      lola.look(E.camera, 1);
      rig.move({ pos: [0.45, 1.55, 1.9], dur: 0.3 });
      audio.chord([196, 246.94, 293.66], 0.12, 0.08);
      await D.say('Lola Ising', 'Pagpalain ka ng Diyos, iho.');
      D.patak('Lola Ising', 'isang kilo ang naiuwi');
      lola.look(null);
      // she walks off under the street lamp with it
      lola.expression({});
      E.dof({ target: lola.head, aperture: 0.003 });
      cam([0.4, 1.6, 1.9], [3.5, 1.1, 2.2], 4.5, 44);
      walkPath(lola, [[0.9, 0, 1.75], [3.2, 0, 2.3], [6.0, 0, 2.55], [11, 0, 2.8]], 0.6);
      await D.wait(3.5);
    } else {
      // you pay for your own dinner, coins on the ledge beside hers
      E.dof({ focus: 0.55, aperture: 0.005 });
      cam([0.32, 1.56, 1.55], [0.1, LEDGE + 0.05, 0.1], 1.0, 38);
      await D.wait(0.5);
      await this.putCoins(this.myCoins);
      await this.takeCoins(this.myCoins);
      // your canton comes out the same way
      tin.set({ spine: [30, 0, 0] }); tin.reach('R', new THREE.Vector3(0.3, 0.7, -0.4), { rate: 5 });
      await D.wait(0.8);
      this.canton.visible = true; tin.arm.R.wr.add(this.canton); this.canton.position.set(0, -0.08, 0.03);
      tin.set({ spine: [8, 0, 0] }); tin.reach('R', new THREE.Vector3(0.12, LEDGE + 0.15, 0.1), { rate: 4 });
      await D.wait(0.9);
      this.scene.attach(this.canton); this.canton.position.set(0.12, LEDGE, 0.14); this.canton.rotation.set(0, 0.3, 0); audio.paper();
      tin.reach('R', null); tin.set({ spine: [0, 0, 0] });
      E.dof({ focus: 1.2, aperture: 0.005 });
      await D.say('', 'Binayaran mo ang pancit canton mo.');
      // half a kilo for Lola
      await this.takeCoins(this.ledgeCoins);
      await fetchBag(this.bagHalf, true);
      await takeBag(this.bagHalf);
      lola.expression({ sad: 0.8 }); lola.set({ neck: [34, 0, 0], spine: [18, 0, 0] });
      E.dof({ target: lola.head, aperture: 0.004 });
      cam([0.5, 1.55, 1.7], [0.0, 1.05, 0.7], 1.6, 40);
      await D.wait(1.2);
      cam([0.4, 1.6, 1.9], [-4.0, 1.0, 2.4], 5, 44);
      walkPath(lola, [[-0.95, 0, 1.1], [-2.4, 0, 1.9], [-5.5, 0, 2.5], [-12, 0, 2.9]], 0.45);
      await D.say('', 'Kalahating kilo ang kinuha ni Lola. Yakap-yakap niya ito habang naglalakad sa dilim.');
      D.patak('Lola Ising', 'kalahating kilo lang');
    }
    S.wallet -= 30;
    await D.wait(2.5);
    await D.black(true, 1.2);
  },

  /* Part Two: the next day. ~5 s. Same store, the price went up again, Lola in line again. */
  async montage(D, S) {
    const E = this.engine, rig = this.engine.rig, lola = this.lola;
    this.boardM.map = this.boardTex[1]; this.boardM.needsUpdate = true;
    lola.root.position.set(0.02, 0, 0.74); lola.root.rotation.y = PI; lola.walk = 0;
    lola.pose('stoop', true); lola.set({ shR: [-34, 0, -10], elR: [-70, 0, 0] }, true); lola.expression({});
    for (const b of this.lolaBags) { b.removeFromParent(); b.visible = false; } this.lolaBags = []; this.purse.visible = true;
    lola.reach('L', this.purseL, { rate: 30 }); lola.reach('R', this.purseR, { rate: 30 });
    for (const c of [...this.ledgeCoins, ...this.myCoins]) c.visible = false;
    this.bagFull.visible = this.bagHalf.visible = this.canton.visible = false;
    E.dof({ target: this.board, aperture: 0.005 });
    rig.set({ pos: [0.95, 1.58, 1.1], look: [1.42, 1.55, 0.0], fov: 30 });
    rig.move({ pos: [0.5, 1.58, 1.9], look: [0.0, 1.15, 0.4], fov: 42, dur: 5.5, e: 'inOut' });
    await D.black(false, 0.9);
    setTimeout(() => E.dof({ target: lola.head, aperture: 0.004 }), 2200);
    await D.say('', 'Bigas: ₱60 na. Nakapila ulit si Lola Ising, hawak ang pitaka niya.', { hold: 3.8 });
    await D.black(true, 0.8);
  },
};
