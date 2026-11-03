import * as THREE from 'three';
import { prewarm } from '../engine/prewarm.js';
import { pbr, std, glow, box, cyl, at, sign, canvasTex, envFrom, blob } from '../engine/kit.js';
import { Person } from '../engine/person.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { cast } from '../engine/cast.js';
import { animate, moveTo, walkPath } from '../engine/tween.js';

/*
  PART FOUR: ULIT. What his Part One choices actually did, one short shot per person.
  Small, temporary, real. Three sets in one scene, switched per vignette:
    totoy(D,S)  Martes 6:51 AM  bakery at dawn      (S.sobre)
    weng(D,S)   Sabado 9:10 AM  narrow street        (S.kaha)
    lola(D,S)   Martes 8:20 PM  Lola Ising's table   (S.bigas)
*/
const PI = Math.PI;
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

// roughen a geometry along its normals (rice, so it doesn't read as a plastic dome)
function lumpy(geo, amt, f = 140) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const k = (Math.sin(p.getX(i) * f + p.getY(i) * f * 0.7) * Math.cos(p.getZ(i) * f * 0.9 + p.getX(i) * f * 0.4)) * amt;
    p.setXYZ(i, p.getX(i) + n.getX(i) * k, p.getY(i) + n.getY(i) * k, p.getZ(i) + n.getZ(i) * k);
  }
  geo.computeVertexNormals(); return geo;
}

const GRADES = {
  // tender, warm against cool, but with the same crushed blacks as the rest of the game
  totoy: { lift: [0.0, 0.006, 0.016], gain: [1.06, 0.97, 0.86], sat: 1.12, grain: 0.075, bloom: 0.4, bloomThreshold: 0.8, exposure: 0.7, vignette: 1.15, black: 0.035, gamma: 1.2, curve: 0.5 },
  weng: { lift: [0.0, 0.01, 0.018], gain: [0.94, 1.0, 1.04], sat: 1.05, grain: 0.06, bloom: 0.2, bloomThreshold: 0.9, exposure: 0.76, vignette: 1.1, black: 0.03, gamma: 1.15, curve: 0.45 },
  lola: { lift: [0.004, 0.002, 0.0], gain: [1.04, 0.97, 0.86], sat: 0.98, grain: 0.075, bloom: 0.38, bloomThreshold: 0.8, exposure: 0.68, vignette: 1.15, black: 0.035, gamma: 1.2, curve: 0.5 },
};

export default {
  grade: GRADES.totoy,
  dof: { focus: 2.5, aperture: 0.004, maxblur: 0.008 },

  async build(engine) {
    const S = this.scene = new THREE.Scene();
    this.env = {
      dusk: await envFrom(engine.renderer, '/tex/modern_evening_street_1k.hdr'),
      day: await envFrom(engine.renderer, '/tex/kloofendal_overcast_puresky_1k.hdr'),
    };
    this.sets = {};
    this.people = [];
    this.upright = [];       // props that must stay level in world space (cup, bag)
    this.buildBakery(S);
    this.buildStreet(S);
    this.buildHome(S);
    this.rain = new Rain({ count: 7000, size: [14, 9, 14], speed: 8, opacity: 0.22, wind: [0.2, 0.4] });
    S.add(this.rain.mesh);
    this.activate('totoy');
  },

  /* ---------------- set 1: corner bakery at dawn ---------------- */
  buildBakery(S) {
    const G = this.sets.totoy = new THREE.Group(); S.add(G);
    const walk = pbr('concrete_floor_01', { repeat: [3, 1.5], wet: 1, env: 1.4 });
    const road = pbr('asphalt_02', { repeat: [4, 3], wet: 1, env: 1.6 });
    G.add(at(box(9, 0.15, 3.0, walk), 0, -0.075, -0.9));
    const r = new THREE.Mesh(new THREE.PlaneGeometry(14, 12), road); r.rotation.x = -PI / 2; r.position.set(0, -0.14, 6.5); r.receiveShadow = true; G.add(r);
    const wall = pbr('peeling_painted_wall', { repeat: [1, 1], color: 0xd8cdb6 });
    // facade with a storefront opening (x -1.6..1.6, y 0.95..2.35)
    G.add(at(box(2.0, 3.4, 0.3, wall), -2.6, 1.7, -2.4));
    G.add(at(box(2.0, 3.4, 0.3, wall), 2.6, 1.7, -2.4));
    G.add(at(box(3.2, 1.05, 0.3, wall), 0, 2.88, -2.4));
    // the counter + glass display case full of pandesal
    const alum = std(0xb8bcc0, { metal: 0.8, rough: 0.35 });
    G.add(at(box(3.2, 0.95, 0.5, std(0x6f5a43, { rough: 0.7 })), 0, 0.475, -2.25));
    const caseG = new THREE.Group(); caseG.position.set(0, 0.95, -2.25); G.add(caseG);
    caseG.add(at(box(3.0, 0.03, 0.5, alum), 0, 0.0, 0));
    caseG.add(at(box(3.0, 0.03, 0.5, alum), 0, 0.5, 0));
    for (const x of [-1.5, 0, 1.5]) caseG.add(at(box(0.03, 0.5, 0.5, alum), x, 0.25, 0));
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.48), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.12, envMapIntensity: 2 }));
    glass.position.set(0, 0.25, 0.25); caseG.add(glass);
    const crust = new THREE.MeshStandardMaterial({ color: 0xb4733a, roughness: 0.62 });
    const tray = std(0x8a8e92, { metal: 0.6, rough: 0.4 });
    const bun = new THREE.SphereGeometry(1, 12, 9);
    for (let row = 0; row < 2; row++) {
      for (let tx = -1; tx <= 1; tx += 2) {
        const t = box(1.2, 0.02, 0.36, tray); t.position.set(tx * 0.72, 0.03 + row * 0.24, 0); caseG.add(t);
        const buns = new THREE.InstancedMesh(bun, crust, 40);
        const m = new THREE.Matrix4(); let i = 0;
        for (let a = 0; a < 10; a++) for (let b = 0; b < 4; b++) {
          m.compose(new THREE.Vector3(tx * 0.72 - 0.52 + a * 0.115 + (Math.random() - .5) * 0.02, 0.07 + row * 0.24, -0.13 + b * 0.088), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.random() * 3, 0)), new THREE.Vector3(0.038, 0.025, 0.03));
          buns.setMatrixAt(i++, m);
        }
        buns.castShadow = true; caseG.add(buns);
      }
    }
    // the warm interior behind the counter
    const inside = new THREE.Group(); inside.position.z = -2.55; G.add(inside);
    inside.add(at(box(3.4, 2.6, 0.05, new THREE.MeshStandardMaterial({ color: 0xe6c99a, emissive: 0xffb466, emissiveIntensity: 0.35, roughness: 0.9 })), 0, 1.4, -1.6));
    for (const y of [1.25, 1.75]) inside.add(at(box(2.8, 0.04, 0.4, std(0x7a5c3e)), 0, y, -1.4));
    for (let i = 0; i < 9; i++) inside.add(at(box(0.22, 0.14, 0.2, std([0xd9a35a, 0xc98a44, 0xe8c48a][i % 3], { rough: 0.8 })), -1.1 + i * 0.27, 1.34 + (i % 2) * 0.5, -1.4));
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), glow(0xfff1d8, 4)); tube.rotation.z = PI / 2; tube.position.set(0, 2.25, -0.6); inside.add(tube);
    const warm = new THREE.PointLight(0xffb067, 7, 7, 1.8); warm.position.set(0, 1.9, -0.4); warm.castShadow = true; warm.shadow.mapSize.set(1024, 1024); warm.shadow.bias = -0.002; inside.add(warm);
    const spill = new THREE.SpotLight(0xffa955, 18, 9, 0.85, 0.7, 1.6); spill.position.set(0, 2.1, -2.4); spill.target.position.set(0, 0, 1.5); G.add(spill, spill.target);
    // the baker, inside, soft and out of focus
    const baker = new Person({ h: 1.6, skin: 'tan', top: 0xece6da, bottom: 0x2a2a2c, hair: 'bun', build: 1.1 });
    baker.pose('standRelaxed', true); baker.root.position.set(-0.6, 0, -3.1); G.add(baker.root); this.people.push(baker);
    const apron = box(0.32, 0.5, 0.02, std(0xd9d2c4)); apron.position.set(0, 0.62, 0.11); baker.root.add(apron);
    // tin awning over the sidewalk, dripping
    const tin = pbr('corrugated_iron_02', { repeat: [3, 1], color: 0x9ea4a8, metal: 0.6, rough: 0.5 });
    const aw = box(7.4, 0.03, 2.9, tin); aw.position.set(0, 2.5, -1.05); aw.rotation.x = 0.1; G.add(aw);
    for (const x of [-3.3, 3.3]) G.add(at(cyl(0.035, 0.035, 2.4, std(0x4a4d50, { metal: 0.6, rough: 0.5 })), x, 1.2, 0.3));
    // drips off the awning edge
    const dn = 60, dp = new Float32Array(dn * 3); this.dripSeed = [];
    for (let i = 0; i < dn; i++) { dp.set([-3.6 + Math.random() * 7.2, 2.36, 0.36], i * 3); this.dripSeed.push(Math.random()); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.drips = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xd8e2ea, size: 0.014, transparent: true, opacity: 0.75 })); G.add(this.drips);
    // painted board
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.4), sign('', { w: 1024, h: 372, bg: '#f2e6c4', fg: '#a8231d', font: 'bold 120px Inter, sans-serif', lines: ['MAINIT NA', 'PANDESAL'] }));
    board.position.set(-2.55, 1.85, -2.24); G.add(board);
    // across the street: dark shapes, a few lit windows, a sodium lamp
    for (let i = 0; i < 6; i++) {
      const b = box(3.5, 4 + Math.random() * 3, 3, std(0x2b2f35, { rough: 0.95 })); b.position.set(-9 + i * 3.6, 2.5, 13); G.add(b);
      if (Math.random() < 0.7) G.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), glow(0xffcf8a, 1.2)), -9 + i * 3.6 + (Math.random() - .5), 2.2 + Math.random() * 2, 11.48, PI));
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glow(0xffa040, 5)); lamp.position.set(5, 5.5, 4); G.add(lamp);
    const lampL = new THREE.PointLight(0xff9a3c, 4, 14, 1.6); lampL.position.copy(lamp.position); G.add(lampL);
    G.add(new THREE.HemisphereLight(0x7186a0, 0x15130f, 0.4));
    const fill = new THREE.PointLight(0xffb878, 1.6, 3.2, 1.8); fill.position.set(0.55, 1.05, -1.25); G.add(fill);

    // ---- Totoy ----
    const boy = this.boy = new Person({ h: 1.24, skin: 'brown', top: 0xb9b19c, bottom: 0x2e3238, hair: 'messy', build: 0.82, shorts: true, barefoot: true, sleeve: 0.12 });
    const wh = boy.hair.children[0]; if (wh) { wh.material = wh.material.clone(); wh.material.roughness = 0.28; }
    G.add(boy.root); this.people.push(boy);
    G.add(this.boyShadow = blob(0.28, 0.55));
    // paper bag of pandesal + coffee cup
    const bag = this.bag = new THREE.Group();
    const paper = new THREE.MeshStandardMaterial({ color: 0xbf9466, roughness: 1 });
    bag.add(at(box(0.11, 0.15, 0.07, paper, 0.008), 0, 0, 0));
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(bun, crust); b.position.set(-0.025 + i * 0.025, 0.085, (i % 2) * 0.01); b.scale.set(0.028, 0.019, 0.024); bag.add(b); }
    boy.arm.L.wr.add(bag); bag.position.set(0.0, -0.11, 0.035); this.upright.push(bag);
    const cup = this.cup = new THREE.Group();
    cup.add(cyl(0.026, 0.021, 0.07, new THREE.MeshStandardMaterial({ color: 0xece4d4, roughness: 0.55 }), 18));
    const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.024, 18), new THREE.MeshStandardMaterial({ color: 0x2a160b, roughness: 0.15 })); coffee.rotation.x = -PI / 2; coffee.position.y = 0.03; cup.add(coffee);
    boy.arm.R.wr.add(cup); cup.position.set(0, -0.085, 0.03); this.upright.push(cup);
    // steam: a handful of soft sprites rising off the cup
    const puff = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
    this.steam = [];
    for (let i = 0; i < 16; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: 0xfff1e0, transparent: true, depthWrite: false, opacity: 0 }));
      sp.userData.ph = i / 16; sp.userData.dx = (Math.random() - 0.5); G.add(sp); this.steam.push(sp);
    }
  },

  /* ---------------- set 2: a narrow street on a Saturday morning ---------------- */
  buildStreet(S) {
    const G = this.sets.weng = new THREE.Group(); S.add(G);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 40), pbr('asphalt_02', { repeat: [2, 14], wet: 0.35 })); road.rotation.x = -PI / 2; road.position.set(0, 0, -10); road.receiveShadow = true; G.add(road);
    const curb = pbr('concrete_floor_01', { repeat: [1, 12], wet: 0.2 });
    for (const sx of [-1, 1]) G.add(at(box(0.6, 0.12, 40, curb), sx * 2.5, 0.06, -10));
    const tints = [0xd8d2c2, 0xc9d3c4, 0xe0cfb8, 0xbfc8cf, 0xd6c1b0, 0xcfd6c0];
    const gateM = std(0x2f6a4c, { metal: 0.5, rough: 0.5 });
    let k = 0;
    for (const sx of [-1, 1]) {
      for (let z = 4; z > -26; z -= 5.2) {
        const tint = tints[k++ % tints.length];
        const wallM = pbr('painted_plaster_wall', { repeat: [2, 1], color: tint });
        const h = 4.5 + ((k * 37) % 3);
        const gz = z - 1.2;                                                     // a gate in the wall
        const segA = (z + 2.5) - (gz + 0.8), segB = (gz - 0.8) - (z - 2.5);
        G.add(at(box(0.3, 2.2, segA, wallM), sx * 2.95, 1.1, gz + 0.8 + segA / 2));
        G.add(at(box(0.3, 2.2, segB, wallM), sx * 2.95, 1.1, z - 2.5 + segB / 2));
        G.add(at(box(0.3, 0.3, 1.6, wallM), sx * 2.95, 2.05, gz));
        G.add(at(box(4.0, h, 4.6, wallM), sx * 5.7, h / 2, z));                  // the house behind
        G.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.0), std(0x2a2118, { rough: 0.9 })), sx * 3.69, 1.0, gz, sx > 0 ? -PI / 2 : PI / 2)); // its door
        const yard = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 5.0), pbr('concrete_floor_01', { repeat: [1, 3] })); yard.rotation.x = -PI / 2; yard.position.set(sx * 3.3, 0.01, z); G.add(yard);
        for (const wy of [3.1]) {                                               // upstairs window with grille
          const w = box(0.06, 0.9, 1.3, std(0x1a1d20, { rough: 0.3 })); w.position.set(sx * 3.68, wy, z + 0.6); G.add(w);
          for (let g = 0; g < 6; g++) G.add(at(box(0.02, 0.9, 0.015, std(0x222)), sx * 3.64, wy, z + 0.6 - 0.55 + g * 0.22));
        }
        G.add(at(box(0.04, 0.8, 1.6, gateM), sx * 2.93, 0.5, gz));              // solid lower half
        for (let b = 0; b < 12; b++) G.add(at(cyl(0.012, 0.012, 1.0, gateM, 6), sx * 2.93, 1.4, gz - 0.75 + b * 0.136));
        G.add(at(box(0.05, 0.06, 1.6, gateM), sx * 2.93, 1.9, gz));
        // potted plants
        if (k % 2) { G.add(at(cyl(0.16, 0.12, 0.28, std(0x8a4e2e)), sx * 2.55, 0.26, z + 1.6)); G.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), std(0x3d6b35, { rough: 1 })), sx * 2.55, 0.62, z + 1.6)); }
      }
    }
    // wires overhead
    for (let i = 0; i < 6; i++) {
      const pts = []; for (let t = 0; t <= 12; t++) { const u = t / 12; pts.push(new THREE.Vector3(-3 + u * 6, 5.4 + i * 0.12 - Math.sin(u * PI) * 0.5, -3 - i * 2.5)); }
      G.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.012, 4), std(0x111111)));
    }
    // the school gate at the far end
    const sch = std(0xe7e2d6, { rough: 0.8 });
    G.add(at(box(0.5, 3.2, 0.5, sch), -2.0, 1.6, -27)); G.add(at(box(0.5, 3.2, 0.5, sch), 2.0, 1.6, -27));
    const arch = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.6), sign('', { w: 1536, h: 200, bg: '#1d4f86', fg: '#f4f0e6', font: 'bold 92px Inter, sans-serif', lines: ['MATAAS NA PAARALANG PAMBANSA'] }));
    arch.position.set(0, 3.0, -26.7); G.add(arch);
    G.add(new THREE.HemisphereLight(0xdfe6ec, 0x5a5650, 1.1));
    const sun = new THREE.DirectionalLight(0xf2f0ea, 0.9); sun.position.set(-4, 10, 3); G.add(sun);
    // other kids walking to school, far ahead
    this.farKids = [];
    for (const [x, z, c] of [[-0.6, -13, 0xf0f0ea], [0.8, -17, 0xf0f0ea], [-1.2, -20, 0x2d3b55]]) {
      const p = new Person({ h: 1.35 + Math.random() * 0.15, skin: 'tan', top: c, bottom: 0x1f2a44, hair: Math.random() < 0.5 ? 'long' : 'short', build: 0.85 });
      p.root.position.set(x, 0, z); p.root.rotation.y = PI; p.walk = 1; G.add(p.root); this.people.push(p); this.farKids.push(p);
    }
    // Ate Weng's eldest, with the new illustration board
    const kid = this.kid = new Person({ h: 1.46, skin: 'tan', top: 0xf2f1ec, bottom: 0x1d2740, hair: 'short', build: 0.86, shoes: 0x111111 });
    G.add(kid.root); this.people.push(kid);
    const pack = box(0.27, 0.34, 0.13, std(0x23365a, { rough: 0.85 }), 0.04); pack.position.set(0, 0.15, -0.15); kid.spine.add(pack);
    const ill = this.board = box(0.006, 0.38, 0.51, new THREE.MeshStandardMaterial({ color: 0xf6f5f0, roughness: 0.6 }));
    ill.position.set(-0.17, 0.02, 0.06); kid.spine.add(ill);
    G.add(this.kidShadow = blob(0.3, 0.35));
    // Ate Weng + the neighbor at her gate (left side, gate at z = -1.2 + ... see loop: first left gate is at z = 2.8)
    const weng = this.ateWeng = new Person({ h: 1.56, skin: 'tan', top: 0xb98a92, bottom: 0x2b2d33, hair: 'bun', build: 1.1 });
    G.add(weng.root); this.people.push(weng);
    const nb = this.neighbor = new Person({ h: 1.53, skin: 'light', top: 0x6d8fa6, bottom: 0x6d8fa6, skirt: true, hair: 'short', hairColor: 0x7d7770, build: 1.15 });
    G.add(nb.root); this.people.push(nb);
    const bill = this.bill = box(0.075, 0.003, 0.038, new THREE.MeshStandardMaterial({ color: 0x8fae7e, roughness: 0.8 }));
    nb.arm.R.wr.add(bill); bill.position.set(0, -0.09, 0.02);
  },

  /* ---------------- set 3: Lola Ising's table ---------------- */
  buildHome(S) {
    const G = this.sets.lola = new THREE.Group(); S.add(G);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), pbr('concrete_floor_01', { repeat: [2, 2], color: 0x9a8f80, rough: 0.9 })); floor.rotation.x = -PI / 2; floor.receiveShadow = true; G.add(floor);
    const wallM = pbr('peeling_painted_wall', { repeat: [2, 1], color: 0xa9b89c });
    G.add(at(box(4.2, 2.6, 0.1, wallM), 0, 1.3, -1.6));
    G.add(at(box(0.1, 2.6, 4.2, wallM), -1.9, 1.3, 0.3));
    G.add(at(box(0.1, 2.6, 4.2, wallM), 2.0, 1.3, 0.3));
    G.add(at(box(4.2, 0.05, 4.2, pbr('plywood', { repeat: [2, 2], color: 0x8d7a62 })), 0, 2.6, 0.3));
    // jalousie window, night outside
    G.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.8), new THREE.MeshBasicMaterial({ color: 0x0e1824 })), 0.9, 1.5, -1.54));
    const slat = new THREE.MeshPhysicalMaterial({ color: 0x9fb3c2, roughness: 0.15, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 7; i++) { const s = box(0.86, 0.1, 0.012, slat); s.position.set(0.9, 1.17 + i * 0.11, -1.52); s.rotation.x = -0.6; G.add(s); }
    G.add(at(box(1.0, 0.05, 0.08, std(0x5b4a38)), 0.9, 1.92, -1.52));
    // a calendar + a small framed picture on the wall
    G.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.5), sign('', { w: 340, h: 500, bg: '#f2efe6', fg: '#b3191b', font: 'bold 54px Inter, sans-serif', lines: ['', 'AGOSTO', '', ''] })), -0.7, 1.6, -1.54));
    G.add(at(box(0.32, 0.42, 0.03, std(0x4a3524)), -1.84, 1.7, -0.3, PI / 2));
    // electric fan in the corner
    const fan = new THREE.Group(); fan.position.set(1.6, 0, -1.2); G.add(fan);
    fan.add(at(cyl(0.16, 0.18, 0.04, std(0x2d5d8a, { rough: 0.5 })), 0, 0.02, 0));
    fan.add(at(cyl(0.02, 0.02, 0.9, std(0xd8d8d8, { metal: 0.4 })), 0, 0.47, 0));
    const fh = this.fanHead = new THREE.Group(); fh.position.y = 0.95; fan.add(fh);
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.008, 6, 30), std(0xdddddd, { metal: 0.6 })); fh.add(cage);
    this.blades = new THREE.Mesh(new THREE.CircleGeometry(0.18, 5), new THREE.MeshStandardMaterial({ color: 0x5d8fb8, transparent: true, opacity: 0.55 })); this.blades.position.z = 0.01; fh.add(this.blades);
    // the bulb
    G.add(at(cyl(0.004, 0.004, 0.9, std(0x111)), 0, 2.15, 0));
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 14, 10), glow(0xffd9a0, 6)); bulb.position.set(0, 1.68, 0); G.add(bulb);
    const bl = this.bulb = new THREE.PointLight(0xffd6ae, 7.5, 7, 1.6); bl.position.set(0, 1.6, 0); bl.castShadow = true; bl.shadow.mapSize.set(1024, 1024); bl.shadow.bias = -0.003; bl.shadow.radius = 3; G.add(bl);
    G.add(new THREE.HemisphereLight(0x3a4a60, 0x1a140e, 0.45));
    // low table
    const ply = pbr('plywood', { repeat: [1, 1], color: 0xa58a68, rough: 0.7 });
    G.add(at(box(1.1, 0.04, 0.72, ply, 0.01), 0, 0.36, 0));
    for (const [x, z] of [[-0.5, -0.31], [0.5, -0.31], [-0.5, 0.31], [0.5, 0.31]]) G.add(at(box(0.05, 0.34, 0.05, std(0x5b4632)), x, 0.17, z));
    // pot, pitcher, a shared bowl of ulam
    const pot = cyl(0.13, 0.11, 0.14, std(0xb9bcbe, { metal: 0.3, rough: 0.45 }), 24); pot.position.set(0.41, 0.45, -0.24); G.add(pot);
    G.add(at(cyl(0.135, 0.135, 0.015, std(0xc4c7c9, { metal: 0.3, rough: 0.4 }), 24), 0.41, 0.527, -0.24));
    const pm = new THREE.MeshPhysicalMaterial({ color: 0x6fa9cf, roughness: 0.2, transparent: true, opacity: 0.6 }); const pitcher = cyl(0.06, 0.07, 0.2, pm); pitcher.position.set(-0.35, 0.48, -0.2); G.add(pitcher); const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.01, 6, 12, PI), pm); hdl.position.set(-0.42, 0.49, -0.2); hdl.rotation.z = PI / 2; G.add(hdl);
    const bowl = cyl(0.08, 0.05, 0.05, std(0xeeeeea, { rough: 0.3 }), 20); bowl.position.set(0.16, 0.405, 0.05); G.add(bowl);
    G.add(at(cyl(0.07, 0.07, 0.005, std(0x6b3a1e, { rough: 0.4 }), 20), 0.16, 0.43, 0.05));
    // plates: three kids + Lola's place (z+ side, toward camera)
    const plateM = new THREE.MeshStandardMaterial({ color: 0xd9d6cf, roughness: 0.25 });
    const riceM = new THREE.MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.8 });
    const mkPlate = (x, z, full) => {
      const g = new THREE.Group(); g.position.set(x, 0.385, z);
      g.add(cyl(0.105, 0.085, 0.014, plateM, 30));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 6, 30), plateM); rim.rotation.x = PI / 2; rim.position.y = 0.007; g.add(rim);
      const rice = new THREE.Mesh(lumpy(new THREE.SphereGeometry(0.068, 28, 16, 0, PI * 2, 0, PI / 2), 0.004), riceM);
      rice.scale.set(1, 0.62, 1); rice.position.y = 0.006; rice.castShadow = true; rice.visible = full; g.add(rice);
      const spoon = box(0.012, 0.004, 0.13, std(0xc7cbcf, { metal: 0.9, rough: 0.25 })); spoon.position.set(0.075, 0.012, 0.0); spoon.rotation.y = 0.3; g.add(spoon);
      g.userData.rice = rice; G.add(g); return g;
    };
    this.plates = [mkPlate(-0.36, 0.0, true), mkPlate(0.0, -0.22, true), mkPlate(0.36, 0.0, true)];
    this.lolaPlate = mkPlate(0.0, 0.24, true);
    // three grandkids, sitting on the floor
    const floorSit = (p, h) => ({ y: -(0.53 * h - 0.13), hpL: [-80, 0, 24], hpR: [-80, 0, -24], knL: [150, 0, 0], knR: [150, 0, 0], anL: [-30, 0, 0], anR: [-30, 0, 0], spine: [10, 0, 0], neck: [24, 0, 0], shL: [-34, 0, 10], elL: [-60, 0, 0], shR: [-44, 0, -8], elR: [-70, 0, 0] });
    const mkKid = (o, x, z, ry) => { const p = new Person(o); p.set(floorSit(p, o.h), true); p.root.position.set(x, 0, z); p.root.rotation.y = ry; G.add(p.root); this.people.push(p); return p; };
    this.kids = [
      mkKid({ h: 1.1, skin: 'brown', top: 0xc9443c, bottom: 0x2b2d33, hair: 'messy', build: 0.82, shorts: true, barefoot: true }, -0.74, 0.0, PI / 2),
      mkKid({ h: 1.0, skin: 'tan', top: 0xe8c35a, bottom: 0x3a3f4a, hair: 'long', build: 0.8, shorts: true, barefoot: true }, 0.0, -0.62, 0),
      mkKid({ h: 1.18, skin: 'brown', top: 0x4f7aa8, bottom: 0x2b2d33, hair: 'short', build: 0.84, shorts: true, barefoot: true }, 0.74, 0.0, -PI / 2),
    ];
    // spoon-to-mouth, each at its own rhythm
    this.kids.forEach((k, i) => {
      k.anim = (t, p) => {
        const ph = (t * 0.32 + i * 0.37) % 1, raise = Math.max(0, Math.sin(Math.min(1, Math.max(0, (ph - 0.55) / 0.35)) * PI));
        p.arm.R.sh.rotation.x = p.target.shR.x - 0.55 * raise; p.arm.R.el.rotation.x = p.target.elR.x - 0.75 * raise;
        p.neck.rotation.x = p.target.neck.x - 0.35 * raise;
      };
    });
    // Lola Ising
    const lola = this.lolaP = new Person({ h: 1.48, skin: 'brown', top: 0x6f7f94, bottom: 0x6f7f94, skirt: true, hair: 'bun', hairColor: 0x9a948c, build: 0.95 });
    G.add(lola.root); this.people.push(lola);
    this.stool = cyl(0.17, 0.15, 0.3, std(0x6a4e34, { rough: 0.7 }), 16); G.add(this.stool);
  },

  activate(name) {
    for (const [k, g] of Object.entries(this.sets)) g.visible = k === name;
    const S = this.scene;
    this.active = name;
    if (name === 'totoy') {
      S.background = new THREE.Color(0x1b2531); S.fog = new THREE.FogExp2(0x222d3a, 0.065);
      S.environment = this.env.dusk; S.environmentIntensity = 0.28;
      this.rain.mesh.visible = true; this.rain.uniforms.uOpacity.value = 0.4; this.rain.exclude([-3.8, -1, -4.5], [3.8, 2.55, 0.35]);
    } else if (name === 'weng') {
      S.background = new THREE.Color(0xb5bec5); S.fog = new THREE.FogExp2(0xb5bec5, 0.032);
      S.environment = this.env.day; S.environmentIntensity = 0.7;
      this.rain.mesh.visible = false;
    } else {
      S.background = new THREE.Color(0x07080a); S.fog = null;
      S.environment = this.env.dusk; S.environmentIntensity = 0.1;
      this.rain.mesh.visible = false;
    }
    if (this.engine) this.engine.grade(GRADES[name]);
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.45; engine.rig.jolt = 0;
    prewarm(engine);
  },
  exit() { audio.layer('fan', 0); audio.layer('murmur', 0); audio.layer('traffic', 0); audio.scape(null); },

  update(dt, t) {
    for (const p of this.people) if (p.root.parent && p.root.parent.visible) p.update(dt, t);
    for (const o of this.upright) { o.parent.getWorldQuaternion(_q); o.quaternion.copy(_q.invert()); }
    if (this.active === 'totoy') {
      this.rain.update(t, this.engine.camera);
      this.cup.getWorldPosition(_v);
      const on = this.cup.visible && this.boy.root.visible ? 1 : 0;
      for (const sp of this.steam) {
        const k = (t * 0.28 + sp.userData.ph) % 1;
        sp.position.set(_v.x + Math.sin(t * 1.3 + sp.userData.ph * 9) * 0.02 * k + sp.userData.dx * 0.02 * k, _v.y + 0.04 + k * 0.32, _v.z + Math.cos(t * 1.1 + sp.userData.ph * 7) * 0.015 * k);
        const s = 0.03 + k * 0.12; sp.scale.set(s, s, s);
        sp.material.opacity = on * 0.22 * Math.sin(k * PI) * (1 - k * 0.5);
      }
      this.boyShadow.position.set(this.boy.root.position.x, 0.01, this.boy.root.position.z);
      const dp = this.drips.geometry.attributes.position;
      for (let i = 0; i < dp.count; i++) { const k = (t * (0.7 + this.dripSeed[i] * 0.6) + this.dripSeed[i] * 9) % 1; dp.setY(i, 2.36 - k * k * 2.4); }
      dp.needsUpdate = true;
    }
    if (this.active === 'weng') {
      for (const p of this.farKids) { p.root.position.z -= dt * 0.9; if (p.root.position.z < -25) p.root.position.z += 14; }
      this.kidShadow.position.set(this.kid.root.position.x, 0.01, this.kid.root.position.z);
    }
    if (this.active === 'lola') {
      this.blades.rotation.z += dt * 30;
      this.fanHead.rotation.y = Math.sin(t * 0.35) * 0.7 - 0.6;
      this.bulb.intensity = 7.5 + Math.sin(t * 13) * 0.07;
    }
  },

  /* ---------------- the three moments ---------------- */
  async totoy(D, S) {
    this.activate('totoy');
    const rig = this.engine.rig, boy = this.boy, gave = !!S.sobre;
    audio.rain(0.32, 0.25); audio.traffic(0.12); audio.layer('murmur', 0); audio.layer('fan', 0); audio.scape('umaga', 0.7);
    cast(D).remind('Totoy', "'Yung batang may sobre sa jeep.", 6);
    if (gave) {
      // under the awning, breakfast in both hands
      boy.root.position.set(0.35, 0, -0.95); boy.root.rotation.y = PI / 2 - 0.25;
      boy.pose('stand', true).set({ shL: [-30, 0, -4], elL: [-88, 0, 0], shR: [-30, 0, 5], elR: [-96, 0, 0], neck: [24, 0, 0] }, true);
      boy.expression({ smile: 0.35 }); this.bag.visible = true; this.cup.visible = true;
      boy.anim = (t, p) => {
        const ph = (t * 0.22) % 1, raise = Math.max(0, Math.sin(Math.min(1, Math.max(0, (ph - 0.45) / 0.4)) * PI));
        p.arm.R.sh.rotation.x = p.target.shR.x - 0.42 * raise; p.arm.R.el.rotation.x = p.target.elR.x - 0.62 * raise;
        p.neck.rotation.x = p.target.neck.x - 0.25 * raise;
      };
      rig.set({ pos: [-0.25, 0.98, 1.85], look: [0.4, 0.86, -1.0], fov: 34 });
      rig.move({ pos: [-0.05, 0.92, 1.05], look: [0.42, 0.84, -0.95], fov: 30, dur: 11, e: 'sine' });
      this.engine.dof({ target: this.cup, aperture: 0.006, maxblur: 0.009 });
    } else {
      // outside the light, in the drizzle, watching the bread
      boy.root.position.set(-0.35, 0, 0.75); boy.root.rotation.y = PI + 0.12;
      boy.pose('stand', true).set({ shL: [2, 0, 5], shR: [2, 0, -5], elL: [-6, 0, 0], elR: [-6, 0, 0], spine: [4, 0, 0], neck: [-6, 0, 0] }, true);
      boy.expression({ worry: 0.3 }); this.bag.visible = false; this.cup.visible = false; boy.anim = null;
      boy.look(new THREE.Vector3(-0.3, 1.2, -2.3), 0.8);
      rig.set({ pos: [0.55, 1.05, 3.6], look: [-0.25, 0.95, -1.4], fov: 36 });
      rig.move({ pos: [0.35, 1.0, 2.75], look: [-0.3, 0.98, -1.6], fov: 33, dur: 11, e: 'sine' });
      this.engine.dof({ target: boy.head, aperture: 0.005, maxblur: 0.009 });
    }
    await D.black(false, 1.2);
    D.stamp('<b>Martes, 6:51 AM</b>Sa kanto ng Aurora Blvd', 4);
    audio.chord(gave ? [261.63, 329.63, 392.0] : [220.0, 261.63, 329.63], 0.12, 0.05);
    await D.wait(0.9);
    await D.say('', gave ? "Bumili si Totoy ng pandesal at kape gamit ang bente mo. 'Yun ang almusal niya." : 'Nakatayo si Totoy sa labas ng panaderya. Nakatingin.');
    await D.wait(gave ? 0.8 : 1.4);
    await D.black(true, 1.0);
    boy.anim = null;
  },

  async weng(D, S) {
    this.activate('weng');
    const rig = this.engine.rig, helped = !!S.kaha;
    audio.layer('rain', 0, null, 1); audio.layer('traffic', 0); audio.layer('murmur', 0); audio.layer('fan', 0); audio.scape('kanto', 0.6);
    cast(D).remind('Panganay ni Ate Weng', "Anak ng kaherang kinulang ng ₱500.", 6);
    this.kid.root.visible = helped; this.kidShadow.visible = helped;
    this.ateWeng.root.visible = !helped; this.neighbor.root.visible = !helped;
    if (helped) {
      const kid = this.kid;
      kid.root.position.set(0.15, 0, 1.6); kid.root.rotation.y = PI;
      kid.pose('stand', true).set({ shR: [-6, 0, -16], elR: [-34, 0, 0], shL: [0, 0, 6] }, true);
      walkPath(kid, [[0.05, 0, -7.5]], 0.95).then(() => kid.set({ shR: [-6, 0, -16], elR: [-34, 0, 0] }));
      // keep the arm clamped on the board while walking
      kid.anim = (t, p) => { p.arm.R.sh.rotation.set(-0.1, 0, -0.28); p.arm.R.el.rotation.x = -0.6; };
      rig.set({ pos: [0.8, 1.3, 4.3], look: [0.1, 0.78, -3], fov: 36 });
      rig.move({ pos: [0.55, 1.22, -0.9], look: [0.0, 0.72, -9], fov: 33, dur: 10.5, e: 'sine' });
      this.engine.dof({ target: this.board, aperture: 0.004, maxblur: 0.008 });
    } else {
      const w = this.ateWeng, nb = this.neighbor;
      // first left gate sits at x≈-2.9, z = 4 - 1.2 = 2.8
      w.root.position.set(-2.32, 0, 2.8); w.root.rotation.y = -PI / 2;
      w.pose('stand', true).set({ spine: [4, 0, 0], neck: [6, 0, 0], shR: [-18, 0, -6], elR: [-40, 0, 0] }, true);
      nb.root.position.set(-3.32, 0, 2.8); nb.root.rotation.y = PI / 2;
      nb.pose('stand', true).set({ shR: [-20, 0, -4], elR: [-40, 0, 0] }, true);
      this.bill.visible = true;
      if (this.bill.parent !== nb.arm.R.wr) { nb.arm.R.wr.add(this.bill); this.bill.position.set(0, -0.09, 0.02); this.bill.rotation.set(0, 0, 0); }
      rig.set({ pos: [-1.2, 1.28, -0.4], look: [-2.62, 1.12, 2.8], fov: 28 });
      rig.move({ pos: [-1.45, 1.22, 0.35], look: [-2.66, 1.1, 2.8], fov: 24, dur: 10.5, e: 'sine' });
      this.engine.dof({ target: this.bill, aperture: 0.007, maxblur: 0.011 });
      (async () => {
        await D.wait(1.6);
        nb.set({ shR: [-70, 0, -4], elR: [-14, 0, 0] });                  // reaches through the bars
        await D.wait(1.0);
        w.set({ shR: [-66, 0, -8], elR: [-16, 0, 0] });
        await D.wait(1.1);
        w.arm.R.wr.attach(this.bill);                                    // the bills change hands
        nb.set({ shR: [-18, 0, -4], elR: [-40, 0, 0] });
        await D.wait(0.5);
        w.set({ shR: [-26, 0, -6], elR: [-80, 0, 0], spine: [18, 0, 0], neck: [22, 0, 0] }); // a small bow of thanks
        await D.wait(1.4);
        w.set({ spine: [4, 0, 0], neck: [8, 0, 0] });
      })();
    }
    await D.black(false, 1.2);
    D.stamp('<b>Sabado, 9:10 AM</b>', 4);
    audio.chord(helped ? [293.66, 369.99, 440.0] : [246.94, 293.66, 369.99], 0.12, 0.05);
    await D.wait(1.1);
    await D.say('', helped ? 'Dala ng panganay ni Ate Weng ang bagong illustration board. Naipasa niya ang project sa oras.' : 'Nangutang si Ate Weng ng ₱200 sa kapitbahay para sa project.');
    await D.wait(helped ? 0.6 : 1.2);
    await D.black(true, 1.0);
    this.kid.anim = null;
  },

  async lola(D, S) {
    this.activate('lola');
    const rig = this.engine.rig, helped = !!S.bigas, lola = this.lolaP;
    audio.layer('traffic', 0); audio.layer('murmur', 0); audio.rain(0.28, 0.85); audio.fan(0.5); audio.scape('tahanan', 0.7);
    cast(D).remind('Lola Ising', "'Yung kinulang sa bigas. Tatlo ang apo niya.", 6);
    this.lolaPlate.userData.rice.visible = helped;
    if (helped) {
      // at the table with them, eating
      lola.shade(1);
      this.stool.position.set(0.0, 0.15, 0.68);
      lola.root.position.set(0.0, 0, 0.66); lola.root.rotation.y = PI;
      lola.pose('sit', true).set({ y: -0.46, spine: [16, 0, 0], neck: [16, 0, 0], shL: [-40, 0, 8], elL: [-50, 0, 0], shR: [-48, 0, -8], elR: [-62, 0, 0] }, true);
      lola.anim = (t, p) => {
        const ph = (t * 0.25 + 0.6) % 1, raise = Math.max(0, Math.sin(Math.min(1, Math.max(0, (ph - 0.5) / 0.4)) * PI));
        p.arm.R.sh.rotation.x = p.target.shR.x - 0.5 * raise; p.arm.R.el.rotation.x = p.target.elR.x - 0.7 * raise;
      };
      rig.set({ pos: [1.2, 1.62, 1.28], look: [-0.02, 0.4, 0.02], fov: 36 });
      rig.move({ pos: [1.02, 1.46, 1.08], look: [-0.02, 0.42, 0.02], fov: 34, dur: 11, e: 'sine' });
      this.engine.dof({ target: this.plates[1], aperture: 0.0025, maxblur: 0.006 });
    } else {
      // a little apart, in the shadow past the bulb, watching them eat. The empty plate is the shot, same framing as the full one.
      this.stool.position.set(-0.95, 0.15, 1.0);
      lola.root.position.set(-0.95, 0, 0.98); lola.root.rotation.y = Math.atan2(0.95, -0.98); lola.shade(0.32);
      lola.pose('sit', true).set({ y: -0.46, spine: [8, 0, 0], neck: [10, 0, 0], shL: [-22, 0, 12], elL: [-62, -25, 0], shR: [-22, 0, -12], elR: [-62, 25, 0] }, true);
      lola.anim = null; lola.look(this.kids[1].head, 0.6);
      rig.set({ pos: [1.2, 1.62, 1.28], look: [-0.12, 0.4, 0.14], fov: 36 });
      rig.move({ pos: [1.02, 1.46, 1.08], look: [-0.14, 0.42, 0.16], fov: 34, dur: 11, e: 'sine' });
      this.engine.dof({ target: this.lolaPlate, aperture: 0.0035, maxblur: 0.008 });
    }
    await D.black(false, 1.2);
    D.stamp('<b>Martes, 8:20 PM</b>', 4);
    audio.chord(helped ? [196.0, 246.94, 293.66, 392.0] : [174.61, 220.0, 261.63], 0.14, 0.05);
    await D.wait(1.0);
    await D.say('', helped ? 'Tatlong apo, tatlong platong may kanin. May pinggan din si Lola.' : 'Tatlong platong may kanin. Walang laman ang kay Lola. Busog pa raw siya.');
    await D.wait(helped ? 0.8 : 1.5);
    await D.black(true, 1.0);
    lola.look(null);
  },

  async play(D, S, beat) {
    const order = beat && this[beat] && ['totoy', 'weng', 'lola'].includes(beat) ? [beat] : ['totoy', 'weng', 'lola'];
    await D.black(true, 0.01);
    for (const b of order) await this[b](D, S);
  },
};
