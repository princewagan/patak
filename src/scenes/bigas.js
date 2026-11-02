import * as THREE from 'three';
import { pbr, std, glow, box, cyl, at, canvasTex, envFrom, blob, rand } from '../engine/kit.js';
import { Person } from '../engine/person.js';
import { Rain, Splashes } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { animate, moveTo, walkPath } from '../engine/tween.js';

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
  const bag = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 10), new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.35, transparent: true, opacity: 0.88 }));
  bag.scale.set(1, 1.35, 0.85); g.add(bag);
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 8), bag.material); knot.position.y = 0.11; g.add(knot);
  g.scale.setScalar(scale); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function coinMesh(r = 0.012, color = 0xc9b27a) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.0025, 18), new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.32 }));
  m.castShadow = true; return m;
}

export default {
  dof: { focus: 1.05, aperture: 0.004, maxblur: 0.008 },
  grade: { lift: [0.006, 0.004, 0.002], gain: [1.04, 0.97, 0.86], sat: 0.48, grain: 0.08, bloom: 0.36, bloomThreshold: 0.82, exposure: 0.9, vignette: 1.15, black: 0.035, gamma: 1.18, curve: 0.5 },

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
      const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: type === 'can' ? 0.35 : 0.5, metalness: type === 'can' ? 0.6 : 0 }), list.length);
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
    const lola = this.lola = new Person({ h: 1.45, skin: 'brown', top: 0x6e5a6b, bottom: 0x4a4440, skirt: true, hair: 'none', hairColor: 0x9c968d, build: 0.86, longSleeve: true, shoes: 0x2a2522 });
    {
      const clothN = pbr('denim_fabric', { repeat: [3, 3] }).normalMap;
      const kerM = new THREE.MeshStandardMaterial({ color: 0x5e5546, roughness: 0.95, normalMap: clothN, side: THREE.DoubleSide });
      const hr = lola.hr;
      const ker = new THREE.Mesh(new THREE.SphereGeometry(hr * 1.13, 26, 16, 0, PI * 2, 0, PI * 0.74), kerM);
      ker.position.set(0, hr * 0.98, -hr * 0.05); ker.rotation.x = -0.42; ker.scale.set(0.93, 1.02, 1.08); ker.castShadow = true; lola.head.add(ker);
      const knot = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.22, 10, 8), kerM); knot.position.set(0, hr * 0.32, hr * 0.62); lola.head.add(knot);
      const flap = new THREE.Mesh(new THREE.ConeGeometry(hr * 0.75, hr * 1.3, 3, 1, true), kerM); flap.scale.z = 0.25; flap.rotation.set(0.15, 0, PI); flap.position.set(0, hr * 0.15, -hr * 0.82); lola.head.add(flap);
      const V = (x, y) => new THREE.Vector2(x, y), sc = lola.H / 1.7;
      const shawl = new THREE.Mesh(new THREE.LatheGeometry([V(0.046, 0.16), V(0.052, 0.12), V(0.062, 0.08), V(0.09, 0.045), V(0.15, -0.0), V(0.19, -0.06), V(0.205, -0.15), V(0.2, -0.27)].map(v => v.multiplyScalar(sc)), 28),
        new THREE.MeshStandardMaterial({ color: 0x6b5f4f, roughness: 0.97, normalMap: clothN, side: THREE.DoubleSide }));
      shawl.scale.z = 0.72; shawl.castShadow = true; shawl.position.y = 0.005; lola.chest.add(shawl);
    }
    lola.root.position.set(0.02, 0, 0.74); lola.root.rotation.y = PI; lola.pose('stoop', true); S.add(lola.root); this.people.push(lola);
    const purse = box(0.09, 0.06, 0.03, std(0x7a2d3a, { rough: 0.6 }), 0.012); purse.position.set(0, -0.08, 0.025); lola.arm.R.wr.add(purse); this.purse = purse;
    const tindera = this.tindera = new Person({ h: 1.56, skin: 'tan', top: 0xb47f78, bottom: 0xb47f78, skirt: true, hair: 'bun', build: 1.12, belly: true });
    tindera.root.position.set(0.02, 0, -0.48); tindera.pose('standRelaxed', true); S.add(tindera.root); this.people.push(tindera);
    const lista = box(0.12, 0.17, 0.012, std(0x2f4f8f, { rough: 0.6 })); lista.position.set(0, -0.09, 0.03); lista.visible = false; tindera.arm.R.wr.add(lista); this.lista = lista;
    S.add(at(blob(0.3, 0.55), 0.02, 0.004, 0.74));

    // coins Lola counts out on the ledge (₱40: three ₱10 + two ₱5)
    this.ledgeCoins = [];
    [[-0.12, 0.2, 0.0135], [-0.08, 0.17, 0.0135], [-0.04, 0.215, 0.0135], [0.0, 0.18, 0.012], [0.04, 0.205, 0.012]].forEach(([x, z, rr]) => {
      const c = coinMesh(rr, rr > 0.013 ? 0xd2bd84 : 0xbfc3c6); c.position.set(x, LEDGE + 0.002, z); c.visible = false; S.add(c); this.ledgeCoins.push(c);
    });
    this.myCoin = coinMesh(0.0135, 0xd6c27e); this.myCoin.position.set(0.1, LEDGE + 0.002, 0.2); this.myCoin.visible = false; S.add(this.myCoin);
    // rice bags + your pancit canton on the ledge
    this.bagFull = riceBag(1); this.bagHalf = riceBag(0.72);
    for (const b of [this.bagFull, this.bagHalf]) { b.visible = false; S.add(b); }
    const canton = this.canton = new THREE.Group();
    canton.add(at(box(0.11, 0.025, 0.14, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.3, map: canvasTex(128, 160, (c, w, h) => { c.fillStyle = '#e8b21b'; c.fillRect(0, 0, w, h); c.fillStyle = '#b5121b'; c.fillRect(0, 40, w, 60); c.fillStyle = '#fff'; c.font = 'bold 22px Inter'; c.textAlign = 'center'; c.fillText('PANCIT', w / 2, 66); c.fillText('CANTON', w / 2, 90); }) })), 0, 0.013, 0));
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), std(0xe8d6b8, { rough: 0.5 })); egg.scale.y = 1.3; egg.position.set(0.09, 0.03, 0); canton.add(egg);
    canton.position.set(0.12, LEDGE, 0.14); canton.rotation.y = 0.3; canton.visible = false; S.add(canton);

    // ---------- your held things (camera-held props, no arms) ----------
    this.held = new THREE.Group(); S.add(this.held);
    const wallet = this.wallet = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.55, normalMap: pbr('leather_red_03', { noDiff: true }).normalMap });
    wallet.add(at(box(0.11, 0.004, 0.09, leather, 0.002), 0, 0, 0));
    const bill = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.045), new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, map: canvasTex(200, 90, (c, w, h) => { c.fillStyle = '#7b6aa8'; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(150, 45, 28, 0, 7); c.fill(); c.fillStyle = '#efe9ff'; c.font = 'bold 26px Inter'; c.fillText('100', 14, 34); }) }));
    bill.rotation.x = -PI / 2 + 0.25; bill.position.set(0, 0.015, -0.01); wallet.add(bill);
    for (let i = 0; i < 4; i++) { const c = coinMesh(0.011, i % 2 ? 0xc9b27a : 0xbfc3c6); c.position.set(-0.03 + i * 0.02, 0.005, 0.025); wallet.add(c); }
    wallet.position.set(0.04, -0.12, -0.48); wallet.rotation.set(0.85, 0.15, 0); wallet.visible = false; this.held.add(wallet);
    this.heldCoin = coinMesh(0.0135, 0xd6c27e); this.heldCoin.rotation.set(1.3, 0, 0.2); this.heldCoin.position.set(0.04, -0.09, -0.3); this.heldCoin.visible = false; this.held.add(this.heldCoin);
    const coinL = new THREE.PointLight(0xffb070, 0.06, 0.8, 2); coinL.position.set(0, 0.05, -0.2); this.held.add(coinL);

    // ---------- weather ----------
    this.rain = new Rain({ count: 9000, size: [18, 10, 18], speed: 9, opacity: 0.5, wind: [0.3, 0.6] }).exclude([-2.45, -1, -3], [2.45, 2.75, 1.36]);
    S.add(this.rain.mesh);
    this.splash = new Splashes({ count: 380, area: [16, 4.2], center: [0, 3.6], y: 0.004, rate: 1.4, opacity: 0.4 }); S.add(this.splash.mesh);
    this.splashDrip = new Splashes({ count: 70, area: [4.8, 0.12], center: [0, 1.42], y: 0.006, rate: 1.8, opacity: 0.55, color: 0xffd9b0 }); S.add(this.splashDrip.mesh);
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.55; engine.rig.jolt = 0;
    engine.rig.set({ pos: [0.5, 1.58, 2.45], look: [0.0, 1.25, 0.0], fov: 44 });
    engine.dof({ target: this.lola.head, aperture: 0.004 });
    this.boardM.map = this.boardTex[0]; this.boardM.needsUpdate = true;
    audio.rain(0.62, 0.12); audio.roof(0.42); audio.murmur(0.32, 'tv', 1150); audio.layer('engine', 0); audio.layer('traffic', 0);
  },
  exit() { audio.layer('roof', 0); audio.layer('tv', 0); audio.layer('drone', 0, null, 3); },

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
  async play(D, S, beat) {
    if (beat === 'montage') return this.montage(D, S);
    const rig = this.engine.rig, E = this.engine, lola = this.lola, tin = this.tindera;
    const cam = (pos, look, dur = 2.5, fov, e) => rig.move({ pos, look, dur, fov, e });
    if (S.wallet == null) S.wallet = 160;

    cam([0.36, 1.58, 1.78], [0.0, 1.22, 0.0], 7, 42, 'out');
    await D.black(false, 1.6);
    await D.wait(1.6);
    lola.set({ shR: [-38, 0, -10], elR: [-60, 0, 0] });
    await D.say('Lola Ising', "Isang kilo nga, 'neng.");
    lola.set({ shR: [-8, 0, -6], elR: [-30, 0, 0] });

    // tindera, through the grille; then the price board
    E.dof({ target: tin.head, aperture: 0.005 });
    tin.look(lola.head, 0.8);
    cam([0.34, 1.6, 1.62], [0.12, 1.42, -0.55], 2.0, 34);
    await D.say('Tindera', "₱58 na po, 'La. Tumaas na naman po.");
    E.dof({ target: this.board, aperture: 0.004 });
    await cam([0.42, 1.58, 1.62], [1.42, 1.55, 0.0], 1.6, 30);
    await D.wait(1.2);

    // Lola counts out her coins on the ledge
    E.dof({ focus: 1.15, aperture: 0.006 });
    lola.pose('counting'); lola.set({ neck: [32, 0, 0], spine: [14, 0, 0] });
    cam([0.58, 1.46, 1.38], [-0.02, LEDGE, 0.2], 2.0, 28);
    await D.wait(1.0);
    for (const c of this.ledgeCoins) { c.visible = true; audio.tone(5200 + Math.random() * 800, 0.18, { vol: 0.035 }); audio.tone(3600, 0.12, { vol: 0.02 }); await D.wait(0.42); }
    await D.say('', 'Binilang ni Lola ang barya niya. ₱40.');
    lola.expression({ sad: 0.6 }); lola.set({ neck: [40, 0, 0] });
    await D.say('Lola Ising', 'Kalahati na lang pala.');

    // the lista
    E.dof({ target: tin.head, aperture: 0.005 });
    this.lista.visible = true; tin.set({ shR: [-40, 0, -8], elR: [-70, 0, 0] });
    cam([0.36, 1.6, 1.6], [0.1, 1.38, -0.55], 1.8, 36);
    await D.say('Tindera', "Pasensya na po, 'La. Puno na po 'yung lista n'yo.");
    tin.set({ shR: [-6, 0, -6], elR: [-12, 0, 0] }); setTimeout(() => (this.lista.visible = false), 600);

    // Lola, half-turned, in silhouette against the bulb
    lola.pose('stoop'); lola.set({ neck: [22, 35, 0], shR: [-20, 0, -6], elR: [-70, 0, 0] });
    E.dof({ target: lola.head, aperture: 0.005 });
    cam([0.62, 1.52, 1.58], [-0.05, 1.28, 0.6], 2.2, 38);
    await D.say('Lola Ising', 'May tatlo kasi akong apo sa bahay…');
    audio.drone(0.55, [43.65, 65.41, 98.0, 130.81]);

    // your wallet
    this.wallet.visible = true;
    E.dof({ focus: 0.38, aperture: 0.007 });
    await cam([0.36, 1.58, 1.78], [0.3, 1.25, 1.1], 1.4, 40);
    await D.say('', `₱${S.wallet} na lang ang pera mo. Tatlong araw pa bago sumahod.`);
    this.wallet.visible = false;
    E.dof({ target: lola.head, aperture: 0.004 });
    lola.set({ neck: [26, 0, 0] });
    cam([0.36, 1.58, 1.78], [0.0, 1.15, 0.2], 1.8, 40);
    await D.wait(0.8);

    const devPick = new URLSearchParams(location.search).get('pick');
    if (devPick != null) setTimeout(() => document.querySelectorAll('#choice .opt')[+devPick]?.click(), 1800);
    const p = await D.choose(['Dagdagan|Ikaw na ang magbayad ng kulang', "Umiwas|Bayaran lang ang sa'yo"], { id: 'bigas' });
    S.bigas = p === 0;
    if (S.bigas) {
      S.wallet -= 20;
      // your ₱20 goes onto the ledge next to her coins
      this.heldCoin.visible = true; E.dof({ focus: 0.5, aperture: 0.005 });
      cam([0.32, 1.54, 1.5], [0.08, LEDGE, 0.2], 1.4, 36);
      await animate(k => { this.heldCoin.position.set(0.04, -0.09 - k * 0.05, -0.3 - k * 0.14); }, 1.0);
      this.heldCoin.visible = false; this.myCoin.visible = true; audio.coin();
      E.dof({ focus: 1.1, aperture: 0.006 });
      await D.say('', 'Inabot mo ang bente.');
      // tindera fills a whole kilo
      tin.look(null); tin.set({ spine: [30, 0, 0], shR: [-60, 0, -10], elR: [-30, 0, 0] });
      await D.wait(1.0);
      tin.set({ spine: [6, 0, 0], shR: [-70, 0, -4], elR: [-20, 0, 0] });
      this.bagFull.position.set(0.0, LEDGE + 0.1, 0.06); this.bagFull.visible = true; audio.paper();
      for (const c of [...this.ledgeCoins, this.myCoin]) c.visible = false;
      await D.wait(0.6); tin.pose('standRelaxed');
      // Lola turns to you and holds your wrist with both hands
      lola.root.rotation.y = PI; lola.pose('stoop');
      await animate(k => { lola.root.rotation.y = PI - k * (PI - 0.3); lola.root.position.x = 0.02 + k * 0.1; lola.root.position.z = 0.74 + k * 0.2; }, 1.2);
      lola.set({ shL: [-64, 0, 4], shR: [-64, 0, -4], elL: [-26, 0, -24], elR: [-26, 0, 24], spine: [10, 0, 0], neck: [16, 0, 0] });
      lola.expression({ smile: 0.6, sad: 0 });
      E.dof({ target: lola.arm.L.hand, aperture: 0.006 });
      await cam([0.46, 1.56, 1.92], [0.16, 1.06, 0.98], 1.6, 38);
      rig.move({ pos: [0.45, 1.55, 1.9], dur: 0.3 });
      audio.chord([196, 246.94, 293.66], 0.12, 0.08);
      await D.say('Lola Ising', 'Pagpalain ka ng Diyos, iho.');
      D.patak('Lola Ising', 'isang kilo ang naiuwi');
      // she takes the full kilo and walks off under the street lamp
      this.bagFull.visible = false;
      const bag = riceBag(1); bag.position.set(0, -0.12, 0.03); lola.arm.R.wr.add(bag); this.lolaBags.push(bag);
      lola.pose('stoop'); lola.expression({});
      E.dof({ target: lola.head, aperture: 0.003 });
      cam([0.4, 1.6, 1.9], [3.5, 1.1, 2.2], 4.5, 44);
      walkPath(lola, [[0.9, 0, 1.75], [3.2, 0, 2.3], [6.0, 0, 2.55], [11, 0, 2.8]], 0.6);
      await D.wait(3.5);
      this.canton.visible = true;
    } else {
      // you pay for your own dinner through the little opening
      this.heldCoin.visible = true; E.dof({ focus: 0.5, aperture: 0.005 });
      cam([0.32, 1.56, 1.55], [0.1, LEDGE + 0.05, -0.05], 1.4, 38);
      await animate(k => { this.heldCoin.position.set(0.04 + k * 0.02, -0.09 - k * 0.03, -0.3 - k * 0.16); }, 1.0);
      this.heldCoin.visible = false; audio.coin();
      tin.set({ shR: [-64, 0, -4], elR: [-22, 0, 0] });
      await D.wait(0.5); this.canton.visible = true; audio.paper(); tin.pose('standRelaxed');
      E.dof({ focus: 1.2, aperture: 0.005 });
      await D.say('', 'Binayaran mo ang pancit canton mo.');
      // half a kilo for Lola, tucked under her shawl
      tin.set({ spine: [24, 0, 0], shR: [-56, 0, -10], elR: [-30, 0, 0] }); await D.wait(0.8);
      tin.set({ spine: [4, 0, 0], shR: [-70, 0, -4], elR: [-20, 0, 0] });
      this.bagHalf.position.set(-0.04, LEDGE + 0.075, 0.08); this.bagHalf.visible = true; audio.paper();
      for (const c of this.ledgeCoins) c.visible = false;
      await D.wait(0.5); tin.pose('standRelaxed');
      this.bagHalf.visible = false;
      const half = riceBag(0.72); half.position.set(0, -0.1, 0.03); lola.arm.R.wr.add(half); this.lolaBags.push(half);
      lola.set({ shR: [-30, 0, 18], elR: [-118, -30, 0], shL: [-22, 0, -14], elL: [-100, 20, 0], neck: [34, 0, 0], spine: [18, 0, 0] });
      lola.expression({ sad: 0.8 });
      E.dof({ target: lola.head, aperture: 0.004 });
      cam([0.5, 1.55, 1.7], [0.0, 1.05, 0.7], 1.6, 40);
      await D.wait(1.2);
      half.visible = false; // under the shawl now
      cam([0.4, 1.6, 1.9], [-4.0, 1.0, 2.4], 5, 44);
      walkPath(lola, [[-0.95, 0, 1.1], [-2.4, 0, 1.9], [-5.5, 0, 2.5], [-12, 0, 2.9]], 0.45);
      await D.say('', 'Kalahating kilo ang kinuha ni Lola. Isiniksik niya sa ilalim ng balabal, tapos naglakad sa dilim.');
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
    for (const b of this.lolaBags) b.removeFromParent(); this.lolaBags = [];
    for (const c of [...this.ledgeCoins, this.myCoin]) c.visible = false;
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
