import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { pbr, std, glow, box, cyl, at, canvasTex, envFrom, blob } from '../engine/kit.js';
import { Person } from '../engine/person.js';
import { audio } from '../engine/audio.js';
import { animate, moveTo, walkPath, loop } from '../engine/tween.js';

const PI = Math.PI;

/* KAHA: fast food in Cubao, 2:15 PM.
   Counter front at z = 0 (customers at +z). Crew area z ∈ [-2.6, 0].
   You (POV) stand behind the counter at x ≈ 0.45. Register 1 (Ate Weng) at x = -0.9. */

const COUNTER_Y = 1.0;

/* ---------- canvas textures ---------- */
function paperTex(w, h, draw) {
  return canvasTex(w, h, (c) => {
    c.fillStyle = '#f3f0e6'; c.fillRect(0, 0, w, h);
    draw(c, w, h);
    for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(80,70,50,${Math.random() * 0.035})`; c.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 6, 3 + Math.random() * 6); }
  });
}
function paper(w, h, t, rough = 0.9) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, color: 0xc9c5bb, roughness: rough, side: THREE.DoubleSide, envMapIntensity: 0.4 }));
  m.castShadow = false; m.receiveShadow = true; return m;
}
function menuTex(title, items, accent) {
  return canvasTex(1024, 512, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a0f0d'); g.addColorStop(1, '#120606'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = accent; c.fillRect(0, 0, w, 78);
    c.fillStyle = '#1a0a08'; c.font = 'bold 50px Inter, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(title, 34, 41);
    items.forEach(([name, price, col], i) => {
      const x = 34 + (i % 2) * 500, y = 120 + Math.floor(i / 2) * 128;
      const rg = c.createRadialGradient(x + 58, y + 50, 6, x + 58, y + 50, 58); rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = '#efe7d6'; c.beginPath(); c.arc(x + 58, y + 50, 52, 0, PI * 2); c.fill();
      c.fillStyle = rg; c.beginPath(); c.arc(x + 58, y + 50, 46, 0, PI * 2); c.fill();
      c.fillStyle = '#fff6e2'; c.font = '600 34px Inter, sans-serif'; c.fillText(name, x + 128, y + 34);
      c.fillStyle = '#ffd25a'; c.font = 'bold 40px Inter, sans-serif'; c.fillText(price, x + 128, y + 78);
    });
  });
}

// small drink-machine display: dark panel, dim glowing labels (no flat cyan slabs)
function menuScreen(items, k = 0.5) {
  const t = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#060a0e'; c.fillRect(0, 0, w, h);
    c.font = '600 40px Inter, sans-serif'; c.textBaseline = 'middle';
    items.forEach((it, i) => { const y = h / (items.length + 1) * (i + 1); c.fillStyle = '#2f7fb8'; c.fillRect(24, y - 18, 10, 36); c.fillStyle = '#cfe6f5'; c.fillText(it, 52, y); c.fillStyle = '#7fb3d6'; c.textAlign = 'right'; c.fillText('₱' + (35 + i * 10), w - 24, y); c.textAlign = 'left'; });
  });
  return new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1, 1, 1).multiplyScalar(k) });
}

export default {
  dof: { focus: 1.4, aperture: 0.0028, maxblur: 0.007 },
  grade: { lift: [0.0, 0.008, 0.004], gain: [0.84, 1.02, 0.88], sat: 1.0, grain: 0.075, bloom: 0.38, bloomThreshold: 0.84, exposure: 0.62, vignette: 1.15, ca: 0.0016, black: 0.035, gamma: 1.2, curve: 0.5 },

  async build(engine) {
    RectAreaLightUniformsLib.init();
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0x121513);
    S.fog = new THREE.Fog(0x161a18, 5, 14);
    S.environment = await envFrom(engine.renderer, '/tex/kloofendal_overcast_puresky_1k.hdr');
    S.environmentIntensity = 0.04;

    /* ---------- light: fluorescent panels, slightly green ---------- */
    S.add(new THREE.HemisphereLight(0xd6e6dc, 0x2a2622, 0.04));
    const FL = 0xe9fff1;
    const panels = [[-1.2, -1.2], [1.0, -1.2], [-1.2, 2.2], [1.6, 2.2], [-1.2, 5], [1.6, 5]];
    this.rects = [];
    for (const [x, z] of panels) {
      const dead = x === 1.0 && z < 0;   // one dead tube over the crew area: the register is the only lit island
      const r = new THREE.RectAreaLight(FL, dead ? 0 : z < 0 ? 8 : 2.5, 1.2, 0.3); r.position.set(x, 2.98, z); r.lookAt(x, 0, z); S.add(r); this.rects.push(r);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), dead ? std(0x2a2d2b, { rough: 0.5 }) : glow(FL, 2.2)); p.rotation.x = PI / 2; p.position.set(x, 2.985, z); S.add(p);
    }
    const key = new THREE.SpotLight(0xf2fff4, 9, 7, 0.8, 0.85, 1.6); key.position.set(-0.6, 2.9, -1.4); key.target.position.set(-1.1, 0.9, -1.1);
    key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0015; key.shadow.radius = 5; S.add(key, key.target);
    // warm heat lamps over the holding cabinet
    const heat = new THREE.PointLight(0xff9a4a, 2.2, 2.4, 2); heat.position.set(-0.4, 1.75, -2.15); S.add(heat);

    /* ---------- room ---------- */
    const floor = pbr('floor_tiles_06', { repeat: [7, 6], rough: 0.6, env: 0.8 });
    S.add(at(new THREE.Mesh(new THREE.PlaneGeometry(14, 12), floor), 0.5, 0, 2.5, 0, -PI / 2));
    S.children[S.children.length - 1].receiveShadow = true;
    const ceil = std(0xd8dcd6, { rough: 0.9 });
    S.add(at(new THREE.Mesh(new THREE.PlaneGeometry(14, 12), ceil), 0.5, 3, 2.5, 0, PI / 2));
    const tileT = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#8f8d85'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#5e5b54'; for (let i = 0; i <= 8; i++) { c.fillRect(0, i * 64 - 2, w, 4); c.fillRect(i * 64 - 2, 0, 4, h); }
      for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(90,80,60,${Math.random() * 0.04})`; c.fillRect(Math.random() * w, Math.random() * h, 8, 8); }
    });
    tileT.wrapS = tileT.wrapT = THREE.RepeatWrapping; tileT.repeat.set(6, 2.4);
    const tileM = new THREE.MeshStandardMaterial({ map: tileT, roughness: 0.35, envMapIntensity: 0.6 });
    S.add(at(new THREE.Mesh(new THREE.PlaneGeometry(9, 3), tileM), 0.3, 1.5, -2.62));
    // brand-color stripe band (red/yellow) on the back wall
    S.add(at(box(9, 0.14, 0.02, std(0xb3221d, { rough: 0.5 })), 0.3, 2.05, -2.6));
    S.add(at(box(9, 0.05, 0.02, std(0xe7b52c, { rough: 0.5 })), 0.3, 1.96, -2.6));
    // side walls
    const wallM = pbr('painted_plaster_wall', { repeat: [3, 1], color: 0xd9d2c3, rough: 0.9 });
    S.add(at(new THREE.Mesh(new THREE.PlaneGeometry(12, 3), wallM), -3.6, 1.5, 2.5, PI / 2));
    S.add(at(new THREE.Mesh(new THREE.PlaneGeometry(12, 3), wallM), 4.4, 1.5, 2.5, -PI / 2));

    /* ---------- menu boards (glowing) ---------- */
    const menus = [
      ['MEALS', [['1-pc Chicken w/ Rice', '₱99', '#b5652a'], ['2-pc Chicken w/ Rice', '₱179', '#a85520'], ['Burger Steak', '₱89', '#6a3b22'], ['Chicken Sandwich', '₱75', '#c98b40'], ['Palabok', '₱85', '#d07a2a'], ['Tapa w/ Egg', '₱109', '#7a3a1e']], '#f2b632'],
      ['SPAGHETTI & BURGER', [['Spaghetti', '₱65', '#b8341f'], ['Spag + Chicken', '₱155', '#a23a20'], ['Cheeseburger', '₱59', '#c48a3c'], ['Yum Burger', '₱45', '#b97a38'], ['Fries (Reg)', '₱45', '#e2b44a'], ['Fries (Lrg)', '₱69', '#e8bd52']], '#e04a32'],
      ['DRINKS & DESSERT', [['Iced Tea', '₱39', '#7a3f12'], ['Coke Float', '₱49', '#3b1d10'], ['Sundae', '₱39', '#e9dfcf'], ['Peach Pie', '₱45', '#d69b4c'], ['Hot Coffee', '₱35', '#4a2a16'], ['Bottled Water', '₱25', '#b9d4e0']], '#f2b632'],
    ];
    menus.forEach(([t, items, acc], i) => {
      const tx = menuTex(t, items, acc);
      const mb = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.85), new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.95, roughness: 0.4 }));
      mb.position.set(-1.6 + i * 1.78, 2.5, -2.57); S.add(mb);
      S.add(at(box(1.76, 0.9, 0.05, std(0x1b1b1b, { rough: 0.4, metal: 0.4 })), mb.position.x, 2.5, -2.6));
    });

    /* ---------- crew area fixtures ---------- */
    const steel = new THREE.MeshStandardMaterial({ color: 0xb4b9be, metalness: 0.85, roughness: 0.4 });
    const steelDark = new THREE.MeshStandardMaterial({ color: 0x8e9499, metalness: 0.85, roughness: 0.4 });
    // holding cabinet with heat lamps
    S.add(at(box(2.0, 0.75, 0.5, steel, 0.02), -0.4, 1.3, -2.25));
    S.add(at(box(1.9, 0.5, 0.02, new THREE.MeshPhysicalMaterial({ color: 0xffb070, roughness: 0.1, transmission: 0.2, transparent: true, opacity: 0.3 })), -0.4, 1.32, -1.99));
    for (let i = 0; i < 4; i++) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.02, 0.12), glow(0xff8a3a, 3)); lamp.position.set(-1.1 + i * 0.47, 1.64, -2.2); S.add(lamp); }
    // trays of food inside the cabinet
    for (let i = 0; i < 6; i++) { const f = box(0.22, 0.05, 0.16, std([0xa0561e, 0xb8341f, 0xc48a3c][i % 3], { rough: 0.7 }), 0.01); f.position.set(-1.15 + i * 0.3, 1.1, -2.2); S.add(f); }
    S.add(at(box(2.3, 0.9, 0.6, steelDark), -0.4, 0.45, -2.25));
    // fryer station
    S.add(at(box(0.9, 0.95, 0.65, steel, 0.02), 1.45, 0.475, -2.2));
    const oil = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.45), new THREE.MeshStandardMaterial({ color: 0x6a4a12, roughness: 0.08, metalness: 0.2 }));
    oil.rotation.x = -PI / 2; oil.position.set(1.25, 0.94, -2.2); S.add(oil);
    const oil2 = oil.clone(); oil2.position.x = 1.65; S.add(oil2);
    for (const x of [1.25, 1.65]) { const bk = box(0.3, 0.12, 0.38, std(0x9aa0a5, { metal: 0.8, rough: 0.35 })); bk.position.set(x, 1.05, -2.15); S.add(bk); }
    S.add(at(box(1.0, 0.5, 0.7, steelDark), 1.45, 2.6, -2.25)); // hood
    // drink dispenser
    S.add(at(box(0.55, 0.75, 0.45, std(0x1d1f22, { rough: 0.35, metal: 0.3 }), 0.02), 2.35, 1.375, -2.2));
    S.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), menuScreen(['ICED TEA', 'COLA', 'PINEAPPLE'], 0.55)), 2.35, 1.55, -1.955));
    S.add(at(box(2.8, 1.0, 0.6, steelDark), 2.6, 0.5, -2.25));
    // left end of the crew area: tiled wall, soft-serve, cup shelves, clock, door
    S.add(at(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3), tileM), -2.55, 1.5, -1.3, PI / 2));
    S.add(at(box(0.02, 0.14, 2.6, std(0xb3221d, { rough: 0.5 })), -2.54, 2.05, -1.3));
    S.add(at(box(0.55, 0.85, 0.6, steel, 0.03), -2.18, 1.33, -1.75));
    S.add(at(box(0.6, 0.9, 0.62, steelDark), -2.18, 0.45, -1.75));
    for (const dz of [-0.12, 0.12]) { const nz = cyl(0.02, 0.012, 0.08, steel, 10); nz.position.set(-1.92, 1.05, -1.75 + dz); S.add(nz); }
    S.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.18), menuScreen(['SUNDAE', 'FLOAT'], 0.45)), -1.89, 1.55, -1.75, PI / 2));
    for (let k = 0; k < 3; k++) {
      S.add(at(box(0.32, 0.02, 0.9, steel), -2.38, 1.35 + k * 0.32, -0.75));
      for (let i = 0; i < 6; i++) { const st = cyl(0.04, 0.032, 0.2, std([0xf0ece2, 0xc8231e, 0xe7b52c][(i + k) % 3], { rough: 0.6 }), 12); st.position.set(-2.38, 1.46 + k * 0.32, -1.1 + i * 0.14); S.add(st); }
    }
    const clockT = canvasTex(256, 256, (c, w) => { c.fillStyle = '#f6f4ee'; c.beginPath(); c.arc(128, 128, 120, 0, PI * 2); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 8; c.stroke(); c.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; c.fillRect(128 + Math.sin(a) * 98 - 3, 128 - Math.cos(a) * 98 - 8, 6, 16); } c.lineCap = 'round'; c.lineWidth = 9; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.sin(2.25 / 12 * PI * 2) * 55, 128 - Math.cos(2.25 / 12 * PI * 2) * 55); c.stroke(); c.lineWidth = 5; c.beginPath(); c.moveTo(128, 128); c.lineTo(128 + Math.sin(0.25 * PI * 2) * 85, 128 - Math.cos(0.25 * PI * 2) * 85); c.stroke(); });
    S.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.16, 32), new THREE.MeshStandardMaterial({ map: clockT, roughness: 0.4 })), -2.53, 2.35, -1.2, PI / 2));
    const washT = canvasTex(512, 256, (c, w, h) => { c.fillStyle = '#1f6fb0'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 46px Inter'; c.textAlign = 'center'; c.fillText('MAGHUGAS NG KAMAY', w / 2, 100); c.font = '30px Inter'; c.fillText('bago bumalik sa trabaho', w / 2, 170); });
    S.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: washT, roughness: 0.6 })), -2.53, 1.95, -2.2, PI / 2));
    S.add(at(box(0.04, 2.1, 0.85, std(0x8a8f86, { rough: 0.6, metal: 0.3 })), -2.53, 1.05, -0.05 - 0.6 + 0.0));
    // pillar (the memo is taped to it)
    // acrylic divider between the two registers (the memo is taped to it)
    const acr = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.62), new THREE.MeshPhysicalMaterial({ color: 0xdfeef2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, envMapIntensity: 1.5 }));
    acr.position.set(-0.3, COUNTER_Y + 0.33, -0.5); acr.rotation.y = PI / 2; S.add(acr);
    S.add(at(box(0.012, 0.64, 0.012, steel), -0.3, COUNTER_Y + 0.33, -0.27));
    S.add(at(box(0.012, 0.64, 0.012, steel), -0.3, COUNTER_Y + 0.33, -0.73));

    /* ---------- counter ---------- */
    const counterTop = new THREE.MeshStandardMaterial({ color: 0x8f9498, metalness: 0.8, roughness: 0.45 });
    S.add(at(box(4.4, 0.04, 0.75, counterTop), -0.2, COUNTER_Y, -0.32));
    S.add(at(box(4.3, 0.97, 0.6, std(0x9b1e1a, { rough: 0.55 })), -0.2, 0.485, -0.25)); // customer face (red)
    S.add(at(box(4.3, 0.1, 0.02, std(0xe7b52c, { rough: 0.5 })), -0.2, 0.8, 0.06));
    S.add(at(box(4.3, 0.97, 0.05, steelDark), -0.2, 0.485, -0.58)); // crew side
    // sneeze-guard order screen faces
    // registers
    const mkPOS = (x, label) => {
      const g = new THREE.Group(); g.position.set(x, COUNTER_Y + 0.02, -0.35);
      g.add(at(box(0.36, 0.08, 0.34, std(0x1a1c1f, { rough: 0.4 }), 0.01), 0, 0.04, 0));
      const stand = box(0.05, 0.22, 0.05, std(0x1a1c1f)); stand.position.set(0, 0.17, -0.05); g.add(stand);
      const scrT = canvasTex(512, 384, (c, w, h) => {
        c.fillStyle = '#0d1a22'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#163a4f'; c.fillRect(0, 0, w, 50); c.fillStyle = '#cfe8f5'; c.font = '600 26px Inter'; c.fillText(label + '   2:15 PM', 18, 34);
        const btn = ['MEALS', 'BURGER', 'SPAG', 'DRINKS', 'DESSERT', 'VOID', 'REFUND', 'TOTAL'];
        btn.forEach((b, i) => { c.fillStyle = b === 'REFUND' ? '#7a2a22' : b === 'TOTAL' ? '#1f6a3a' : '#22495f'; c.fillRect(18 + (i % 4) * 122, 80 + Math.floor(i / 4) * 92, 110, 80); c.fillStyle = '#e8f3f8'; c.font = '600 20px Inter'; c.fillText(b, 28 + (i % 4) * 122, 126 + Math.floor(i / 4) * 92); });
        c.fillStyle = '#e8f3f8'; c.font = 'bold 34px Inter'; c.fillText('TOTAL  ₱0.00', 18, 340);
      });
      // screen faces the cashier (crew side, -z)
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), new THREE.MeshBasicMaterial({ map: scrT }));
      scr.position.set(0, 0.36, -0.07); scr.rotation.set(0.35, PI, 0); g.add(scr);
      g.add(at(box(0.32, 0.24, 0.03, std(0x111214)), 0, 0.36, -0.05, 0, 0.35));
      const scrL = new THREE.PointLight(0x8fc4e6, 0.25, 0.7, 2); scrL.position.set(0, 0.36, -0.2); g.add(scrL);
      S.add(g); return g;
    };
    this.pos1 = mkPOS(-0.9, 'REG 01');
    this.pos2 = mkPOS(0.75, 'REG 02');
    // cash drawer of register 1 (slides toward the crew, -z)
    const dr = this.drawer = new THREE.Group();
    dr.add(at(box(0.42, 0.09, 0.38, std(0x202226, { rough: 0.4, metal: 0.5 })), 0, 0, 0));
    const billCols = [0x2b5aa8, 0xd8b33a, 0x3f8a52, 0x7a5ca8, 0xb8302a, 0xd98a3a];
    for (let i = 0; i < 5; i++) {
      for (let k = 0; k < 6; k++) { const b = box(0.07, 0.003, 0.15, std(billCols[i], { rough: 0.85 })); b.position.set(-0.16 + i * 0.08, 0.045 + k * 0.0035, -0.05); b.rotation.y = (Math.random() - 0.5) * 0.08; dr.add(b); }
    }
    for (let i = 0; i < 5; i++) { const c = cyl(0.03, 0.03, 0.02, std(0xb9b39a, { metal: 0.9, rough: 0.3 }), 14); c.position.set(-0.16 + i * 0.08, 0.04, 0.12); dr.add(c); }
    dr.position.set(-0.9, 0.93, -0.55); S.add(dr);
    this.drawerZ = -0.55;

    // trays, cups, a tray in front of you
    const trayM = std(0xc2471f, { rough: 0.55 });
    for (let i = 0; i < 7; i++) { const t = box(0.42, 0.015, 0.32, trayM, 0.01); t.position.set(1.65, COUNTER_Y + 0.03 + i * 0.016, -0.35); S.add(t); }
    const myTray = this.myTray = new THREE.Group(); myTray.position.set(0.3, COUNTER_Y + 0.03, -0.38);
    myTray.add(box(0.42, 0.015, 0.32, trayM, 0.01));
    const wrap = box(0.11, 0.05, 0.11, std(0xe9d9a8, { rough: 0.8 }), 0.01); wrap.position.set(-0.09, 0.035, 0.03); myTray.add(wrap);
    const fries = box(0.07, 0.11, 0.045, std(0xc8231e, { rough: 0.6 })); fries.position.set(0.06, 0.06, 0.06); myTray.add(fries);
    for (let i = 0; i < 6; i++) { const f = box(0.008, 0.05, 0.008, std(0xe8c35a, { rough: 0.7 })); f.position.set(0.04 + i * 0.008, 0.13, 0.06 + (i % 2) * 0.01); f.rotation.z = (i - 3) * 0.08; myTray.add(f); }
    const cup = cyl(0.038, 0.03, 0.14, std(0xf0ece2, { rough: 0.6 }), 14); cup.position.set(0.12, 0.075, -0.07); myTray.add(cup);
    const lid = cyl(0.04, 0.04, 0.01, std(0xf6f2ea, { rough: 0.5 }), 14); lid.position.set(0.12, 0.15, -0.07); myTray.add(lid);
    S.add(myTray);
    for (let i = 0; i < 4; i++) { const c = cyl(0.04, 0.032, 0.14, std(0xe8e2d4, { rough: 0.6 }), 14); c.position.set(2.0 + (i % 2) * 0.1, COUNTER_Y + 0.09, -0.5 + Math.floor(i / 2) * 0.1); S.add(c); }

    /* ---------- props with readable text ---------- */
    this.receiptT = paperTex(256, 640, (c, w) => {
      c.fillStyle = '#111'; c.textAlign = 'center'; c.font = 'bold 22px "Courier New", monospace';
      c.fillText('STORE #0142 · CUBAO', w / 2, 40);
      c.font = '18px "Courier New", monospace'; c.fillText('REG 01   08/18   12:47 PM', w / 2, 72);
      c.fillText('--------------------------', w / 2, 100);
      c.font = 'bold 34px "Courier New", monospace'; c.fillText('REFUND', w / 2, 150);
      c.font = '18px "Courier New", monospace'; c.textAlign = 'left';
      c.fillText('2pc Chicken Meal x2', 20, 200); c.fillText('Fries Lrg', 20, 228); c.fillText('Iced Tea x2', 20, 256);
      c.textAlign = 'right'; c.fillText('358.00', w - 20, 200); c.fillText('69.00', w - 20, 228); c.fillText('73.00', w - 20, 256);
      c.textAlign = 'center'; c.fillText('--------------------------', w / 2, 290);
      c.font = 'bold 34px "Courier New", monospace'; c.fillText('-500.00', w / 2, 336);
      c.font = '18px "Courier New", monospace'; c.fillText('Reason: wrong order', w / 2, 380);
      c.font = 'bold 25px "Courier New", monospace'; c.fillText('APPROVED: JOY M.', w / 2, 430);
      c.font = '16px "Courier New", monospace'; c.fillText('*** NOT POSTED ***', w / 2, 476);
    });
    S.add(at(box(0.62, 0.006, 0.3, std(0x141516, { rough: 0.9 })), -0.62, COUNTER_Y + 0.023, -0.5));
    const receipt = this.receipt = paper(0.09, 0.225, this.receiptT, 0.8);
    receipt.rotation.set(-PI / 2, 0, PI + 0.35); receipt.position.set(-0.6, COUNTER_Y + 0.03, -0.5); receipt.material.color.set(0xa6a299); S.add(receipt);

    // deduction slip with a signature we draw live
    this.slipCanvas = document.createElement('canvas'); this.slipCanvas.width = 640; this.slipCanvas.height = 420;
    this.slipT = new THREE.CanvasTexture(this.slipCanvas); this.slipT.colorSpace = THREE.SRGBColorSpace; this.slipT.anisotropy = 8;
    this.drawSlip(0);
    const slip = this.slip = paper(0.21, 0.14, this.slipT, 0.85);
    slip.rotation.set(-PI / 2, 0, 0.12); slip.position.set(-0.75, COUNTER_Y + 0.024, -0.5); slip.visible = false; S.add(slip);
    const pen = this.pen = cyl(0.004, 0.003, 0.13, std(0x1c3f8a, { rough: 0.4 }), 8); pen.visible = false; S.add(pen);

    // the memo, taped to the pillar (faces +x)
    const memoT = paperTex(600, 800, (c, w) => {
      c.fillStyle = '#1d1d1d'; c.textAlign = 'center';
      c.font = 'bold 54px Inter, sans-serif'; c.fillText('MEMO', w / 2, 90);
      c.font = '600 26px Inter, sans-serif'; c.fillText('PARA SA LAHAT NG CASHIER', w / 2, 140);
      c.fillRect(60, 165, w - 120, 3);
      c.font = 'bold 46px Inter, sans-serif';
      ['ANG KULANG', 'SA KAHA AY', 'IKAKALTAS', 'SA SAHOD.'].forEach((l, i) => c.fillText(l, w / 2, 260 + i * 66));
      c.font = '26px Inter, sans-serif'; c.fillText('Walang exception.', w / 2, 560);
      c.textAlign = 'right'; c.font = 'italic 28px Inter, sans-serif'; c.fillText('— Management', w - 60, 680);
      c.fillStyle = 'rgba(160,30,30,.75)'; c.font = 'bold 22px Inter'; c.textAlign = 'left'; c.fillText('Eff. Aug 1', 60, 740);
    });
    const memo = this.memo = paper(0.21, 0.28, memoT, 0.85);
    // on the pillar's back face (facing the kitchen), where the crew sees it
    memo.position.set(-0.294, 1.33, -0.55); memo.rotation.set(0, PI / 2, 0.02); S.add(memo);
    const tapeM = new THREE.MeshStandardMaterial({ color: 0xf2ecd2, roughness: 0.4, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    for (const [dy, dz, r] of [[0.14, -0.08, 0.5], [0.14, 0.08, -0.5], [-0.14, 0.08, 0.4]]) { const tp = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.018), tapeM); tp.position.set(-0.291, 1.33 + dy, -0.55 + dz); tp.rotation.set(r, PI / 2, 0); S.add(tp); }

    // clipboard (Ma'am Joy)
    const clipT = paperTex(400, 560, (c, w) => {
      c.fillStyle = '#222'; c.font = 'bold 28px Inter'; c.textAlign = 'left'; c.fillText('CREW EVALUATION', 24, 50);
      c.font = '20px Inter'; c.fillText('Renewal · Aug 25', 24, 82);
      ['Reyes, W.', 'Santos, M.', 'Dela Cruz, J.', 'Bautista, R.', 'Garcia, A.', 'Mendoza, K.'].forEach((n, i) => { c.fillText(n, 24, 140 + i * 56); c.strokeStyle = '#999'; c.strokeRect(300, 120 + i * 56, 28, 28); });
    });
    this.clipCanvasT = clipT;
    this.clip = new THREE.Group();
    this.clip.add(at(box(0.23, 0.32, 0.008, std(0x6b4a2c, { rough: 0.6 })), 0, 0, 0));
    const cp = paper(0.21, 0.29, clipT); cp.position.z = 0.006; this.clip.add(cp);
    this.clip.add(at(box(0.08, 0.03, 0.015, std(0xb8bcc0, { metal: 0.9, rough: 0.3 })), 0, 0.15, 0.01));

    // phone for the break (silent branch)
    const phT = canvasTex(320, 640, (c, w, h) => {
      c.fillStyle = '#0e1013'; c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8edf2'; c.font = '600 22px Inter'; c.fillText('Anak ko', 24, 56);
      c.fillStyle = '#2a2f36'; c.fillRect(0, 76, w, 2);
      c.fillStyle = '#2d3640'; c.beginPath(); c.roundRect(20, 110, 230, 90, 18); c.fill();
      c.fillStyle = '#dfe6ee'; c.font = '19px Inter'; c.fillText('Ma, yung project ko po', 36, 146); c.fillText('bukas na po deadline', 36, 176);
      c.fillStyle = '#2f7d5a'; c.beginPath(); c.roundRect(50, 240, 252, 128, 18); c.fill();
      c.fillStyle = '#f2fff8'; c.font = '19px Inter';
      ['Anak, sa Sabado na lang', "'yung pambili ng project", 'mo ha.'].forEach((l, i) => c.fillText(l, 66, 278 + i * 28));
      c.fillStyle = '#7f8a94'; c.font = '15px Inter'; c.fillText('2:41 PM', 240, 392);
    });
    this.phone = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.145, 0.008), [std(0x111), std(0x111), std(0x111), std(0x111), new THREE.MeshBasicMaterial({ map: phT }), std(0x111)]);
    this.phone.visible = false; S.add(this.phone);
    this.phoneLight = new THREE.PointLight(0xc8dcff, 0.0, 0.45, 2); S.add(this.phoneLight);

    // break corner: boxes, a monobloc stool, back door
    const card = std(0x9a7b52, { rough: 0.95 });
    for (const [x, y, z, s] of [[3.3, 0.22, -1.9, 0.45], [3.3, 0.62, -1.95, 0.4], [3.75, 0.22, -1.6, 0.45], [3.8, 0.2, -1.1, 0.4]]) S.add(at(box(s, s * 0.95, s, card, 0.01), x, y, z));
    const stool = new THREE.Group(); stool.add(at(cyl(0.17, 0.17, 0.03, std(0xe9e6df, { rough: 0.5 }), 20), 0, 0.44, 0));
    for (const [x, z] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]]) { const l = cyl(0.015, 0.02, 0.44, std(0xe9e6df, { rough: 0.5 }), 8); l.position.set(x, 0.22, z); l.rotation.set(z * 0.6, 0, -x * 0.6); stool.add(l); }
    stool.position.set(3.25, 0, -0.95); S.add(stool);
    S.add(at(box(0.9, 2.1, 0.05, std(0x8a8f86, { rough: 0.6, metal: 0.3 })), 3.4, 1.05, -2.6));
    const doorL = new THREE.PointLight(0xcfe0ff, 0.22, 3, 2); doorL.position.set(3.7, 2.4, -2.3); S.add(doorL);
    // low wall separating the crew corner
    S.add(at(box(0.08, 1.2, 1.8, tileM), 2.9, 0.6, -1.7));

    /* ---------- dining area (blurred background) ---------- */
    const tableM = std(0xd9cfbd, { rough: 0.45 }), chairM = std(0xd8402b, { rough: 0.5 }), chairM2 = std(0xe6b12e, { rough: 0.5 });
    this.people = [];
    const diners = [
      [-1.6, 2.4, { h: 1.68, skin: 'tan', top: 0x2f4f6f, hair: 'short' }],
      [-1.0, 2.4, { h: 1.55, skin: 'light', top: 0xc9b9a6, hair: 'long' }],
      [1.3, 3.2, { h: 1.7, skin: 'brown', top: 0x6b6b6b, hair: 'messy' }],
      [2.1, 3.2, { h: 1.6, skin: 'tan', top: 0x9b4a5a, hair: 'bun' }],
      [-1.3, 5.2, { h: 1.62, skin: 'tan', top: 0xe3e0d6, hair: 'short' }],
      [0.6, 5.6, { h: 1.25, skin: 'tan', top: 0x3d7ab8, hair: 'messy', shorts: true }],
    ];
    for (const [tx, tz] of [[-1.3, 2.4], [1.7, 3.2], [-1.3, 5.0], [0.9, 5.6]]) {
      S.add(at(box(1.0, 0.04, 0.7, tableM), tx, 0.74, tz));
      S.add(at(cyl(0.04, 0.04, 0.72, std(0x444)), tx, 0.37, tz));
      for (const sx of [-0.35, 0.35]) for (const sz of [-0.5, 0.5]) { const ch = box(0.38, 0.04, 0.38, Math.random() < 0.5 ? chairM : chairM2, 0.02); ch.position.set(tx + sx, 0.45, tz + sz); S.add(ch); }
    }
    for (const [x, z, o] of diners) {
      const p = new Person({ ...o, bottom: 0x2b2f36, build: 1 }); p.pose('sit', true); p.set({ shL: [-40, 0, 6], shR: [-40, 0, -6], elL: [-60, 0, 0], elR: [-60, 0, 0] }, true);
      const side = z > 3 && x > 0 ? -1 : 1; p.root.position.set(x, 0.03, z + (side > 0 ? -0.62 : 0.62)); p.root.rotation.y = side > 0 ? 0 : PI;
      S.add(p.root); this.people.push(p);
    }
    // a customer queued at register 2 (out of focus)
    const q = new Person({ h: 1.7, skin: 'tan', top: 0x3a3d42, bottom: 0x24262b, hair: 'short', build: 1.1 }); q.pose('standRelaxed', true); q.root.position.set(0.9, 0, 0.75); q.root.rotation.y = PI; S.add(q.root); this.people.push(q);
    // storefront glass: grey afternoon, light rain
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xb7c2c8).multiplyScalar(0.5) }));
    glass.position.set(0.4, 1.4, 7.6); glass.rotation.y = PI; S.add(glass);
    for (let i = 0; i < 6; i++) S.add(at(box(0.08, 2.8, 0.08, std(0x2a2c2e, { metal: 0.6, rough: 0.4 })), -3.2 + i * 1.45, 1.4, 7.55));
    S.add(at(box(8, 0.25, 0.1, std(0x2a2c2e, { metal: 0.6, rough: 0.4 })), 0.4, 2.75, 7.55));
    const day = new THREE.DirectionalLight(0xc0ccd6, 0.32); day.position.set(0, 3, 12); day.target.position.set(0, 0, 0); S.add(day, day.target);

    /* ---------- crew ---------- */
    const crewTop = 0x8f1d1b, crewCap = 0x7d1714;
    const apron = (p, col = 0x1f1f22) => { const a = box(0.27, 0.42, 0.012, std(col, { rough: 0.9 })); a.position.set(0, 0.05, 0.095); p.spine.add(a); const t = box(0.05, 0.016, 0.003, std(0xf2f2f2, { rough: 0.5 })); t.position.set(0.07, 0.21, 0.105); p.spine.add(t); };
    const weng = this.weng = new Person({ h: 1.55, skin: 'tan', top: crewTop, bottom: 0x1b1c1f, hair: 'bun', hairColor: 0x1d1714, cap: crewCap, build: 1.08, belly: true, sleeve: 0.14 });
    apron(weng); weng.hair.scale.set(0.95, 0.9, 0.97); weng.hair.children[weng.hair.children.length - 1].visible = false; weng.root.position.set(-1.55, 0, -1.4); weng.root.rotation.y = 0.75; S.add(weng.root); this.people.push(weng);
    const joy = this.joy = new Person({ h: 1.6, skin: 'light', top: 0x9fb2c2, bottom: 0x24262c, hair: 'long', hairColor: 0x2a1d16, build: 1.0, sleeve: 0.12 });
    { const t = box(0.05, 0.016, 0.003, std(0xf7d24a, { rough: 0.5 })); t.position.set(0.07, 0.22, 0.1); joy.spine.add(t); }
    joy.root.position.set(-0.95, 0, -1.0); joy.root.rotation.y = 0.15; S.add(joy.root); this.people.push(joy);
    const mark = this.mark = new Person({ h: 1.72, skin: 'brown', top: crewTop, bottom: 0x1b1c1f, hair: 'short', cap: crewCap, build: 0.95, sleeve: 0.14 });
    apron(mark); mark.hair.scale.set(0.95, 0.9, 0.97); mark.root.position.set(1.35, 0, -1.6); mark.root.rotation.y = PI; S.add(mark.root); this.people.push(mark);
    for (const p of [weng, joy, mark]) { const b = blob(0.32, 0.45); b.position.y = 0.002; p.root.add(b); }
    // bills fanned in Joy's right hand while counting
    this.bills = new THREE.Group();
    for (let i = 0; i < 5; i++) { const b = box(0.07, 0.15, 0.002, std([0xd8b33a, 0x2b5aa8, 0x7a5ca8][i % 3], { rough: 0.85 })); b.position.set(0, -0.08, 0.02 + i * 0.002); b.rotation.z = (i - 2) * 0.08; this.bills.add(b); }
    joy.arm.L.wr.add(this.bills);

    this.beepStop = null;
  },

  drawSlip(k) {
    const c = this.slipCanvas.getContext('2d'), w = 640, h = 420;
    c.fillStyle = '#f4f1e8'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#1f1f1f'; c.font = 'bold 30px Inter'; c.textAlign = 'center'; c.fillText('SALARY DEDUCTION SLIP', w / 2, 52);
    c.fillRect(40, 70, w - 80, 2);
    c.textAlign = 'left'; c.font = '24px Inter';
    c.fillText('Pangalan:  Reyes, Wilma (Crew · Cashier)', 40, 120);
    c.fillText('Dahilan:   Kulang sa kaha · REG 01', 40, 162);
    c.font = 'bold 34px Inter'; c.fillText('Halaga:   ₱500.00', 40, 214);
    c.font = '22px Inter'; c.fillText('Ikakaltas sa sahod: Aug 30', 40, 256);
    c.fillStyle = '#555'; c.fillRect(300, 352, 290, 2); c.font = '18px Inter'; c.fillText('Pirma ng empleyado', 360, 380);
    if (k > 0) {
      c.strokeStyle = '#1c3f8a'; c.lineWidth = 3.2; c.lineCap = 'round'; c.beginPath();
      const N = Math.floor(80 * k);
      for (let i = 0; i <= N; i++) { const u = i / 80; const x = 315 + u * 240, y = 335 + Math.sin(u * 22) * 13 * (1 - u * 0.5) - Math.sin(u * 5) * 6; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    this.slipT.needsUpdate = true;
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.45; engine.rig.jolt = 0;
    engine.rig.set({ pos: [0.5, 1.6, -1.3], look: [-0.9, 1.15, -0.7], fov: 46 });
    audio.rain(0.12, 0.9); audio.hum(1.2); audio.murmur(0.9, 'murmur', 650); audio.fryer(0.8);
    audio.layer('roof', 0); audio.layer('engine', 0); audio.layer('traffic', 0);
    this.beepStop = loop(() => { if (Math.random() < 0.6) audio.beep(); }, 2.7);
  },
  exit() { ['hum', 'murmur', 'fryer'].forEach(n => audio.layer(n, 0)); this.beepStop?.(); },

  update(dt, t) {
    for (const p of this.people) p.update(dt, t);
    // flicker one tube now and then
    const f = Math.random() < 0.008 ? 0.35 : 1; this.rects[1].intensity = 8 * f;
    if (this.phone.visible) { this.phoneLight.position.copy(this.phone.position).add(new THREE.Vector3(0, 0.05, 0.08).applyQuaternion(this.phone.quaternion)); }
  },

  /* ================= the chapter ================= */
  async play(D, S, beat) {
    if (beat === 'montage') return this.montage(D, S);
    const rig = this.engine.rig, E = this.engine, weng = this.weng, joy = this.joy, mark = this.mark;
    const cam = (pos, look, dur = 2.4, fov, e) => rig.move({ pos, look, dur, fov, e });
    const you = new THREE.Vector3(0.5, 1.6, -1.3);
    const forceSilent = beat === 'silent', forceSpeak = beat === 'speak';

    // Joy counts the open drawer, Weng watching
    joy.pose('counting', true); joy.look(this.drawer, 0.8);
    weng.pose('standRelaxed', true); weng.look(this.drawer, 0.7); weng.expression({ worry: 0.4 });
    mark.pose('bothHands', true); mark.set({ neck: [30, 0, 0] }, true);
    mark.anim = (t, p) => { p.arm.R.sh.rotation.x += Math.sin(t * 3) * 0.004; };
    this.drawer.position.z = this.drawerZ;
    joy.anim = (t, p) => { p.arm.L.wr.rotation.z = Math.sin(t * 7) * 0.25; p.arm.R.wr.rotation.x = 0.2 + Math.sin(t * 7 + 1) * 0.3; };
    E.dof({ target: joy.head, aperture: 0.0022 });
    rig.set({ pos: [0.75, 1.66, -1.55], look: [-1.1, 1.3, -0.85], fov: 50 });
    await D.black(false, 1.6);
    cam([0.5, 1.6, -1.35], [-0.95, 1.05, -0.65], 5.5, 40, 'sine');
    setTimeout(() => E.dof({ target: this.drawer, aperture: 0.004 }), 2600);
    await D.say('', "Pagkatapos ng lunch rush, binilang ni Ma'am Joy ang kaha ni Ate Weng.");
    joy.anim = null; joy.set({ shL: [-40, 0, 14], elL: [-80, -20, 0], neck: [20, 0, 0] });
    // Joy at the drawer, then she straightens up
    E.dof({ target: joy.head, aperture: 0.003 });
    await cam([0.5, 1.6, -1.3], [-1.0, 1.4, -1.0], 1.6, 40);
    joy.look(weng.head, 0.9); joy.pose('standRelaxed');
    await D.say("Ma'am Joy", 'Kulang ng ₱500.');
    // Weng: hands together, cap brim shading her eyes
    weng.set({ shL: [-30, 0, 4], shR: [-30, 0, -4], elL: [-70, 0, -30], elR: [-70, 0, 30], neck: [16, 0, 0] }); weng.look(null); weng.expression({ worry: 1 });
    E.dof({ target: weng.arm.L.wr, aperture: 0.0035 });
    cam([0.45, 1.58, -1.35], [-1.45, 1.1, -1.3], 1.8, 32);
    await D.say('Ate Weng', "Ma'am, hindi ko po alam kung saan napunta…");
    joy.look(weng.head, 1); joy.set({ shL: [-12, 0, 14], elL: [-92, -20, 0], shR: [-30, 0, -10], elR: [-70, 30, 0] });
    joy.arm.L.wr.add(this.clip); this.clip.position.set(0.02, -0.06, 0.06); this.clip.rotation.set(-1.0, 0, 0); this.bills.visible = false;
    E.dof({ target: joy.head, aperture: 0.003 });
    cam([0.5, 1.6, -1.3], [-1.0, 1.4, -1.0], 1.8, 40);
    await D.say("Ma'am Joy", 'Alam mo naman ang rule. Kulang sa kaha, kaltas sa sahod.');
    // glance at the memo taped to the divider
    E.dof({ target: this.memo, aperture: 0.004 });
    await cam([0.5, 1.6, -1.3], [-0.29, 1.33, -0.55], 1.0, 30);
    await D.wait(0.4);
    // the refund receipt lying by the register
    E.dof({ target: this.receipt, aperture: 0.006 });
    await cam([-0.5, 1.25, -0.76], [-0.6, 1.03, -0.5], 1.6, 30);
    await D.say('', "Alam mo kung saan napunta. Kanina, si Ma'am Joy mismo ang nag-approve ng ₱500 na refund sa kahang 'yon. Hindi niya ni-log.");
    // Mark leans in from your right
    mark.anim = null; mark.pose('stand'); mark.look(null);
    walkPath(mark, [[0.9, 0, -1.9], [0.28, 0, -1.74]], 1.4).then(() => { mark.root.rotation.y = 0.55; mark.set({ neck: [10, 0, 0], spine: [8, 0, 0] }); mark.look(new THREE.Vector3(0.5, 1.55, -1.3), 0.9); });
    E.dof({ target: weng.head, aperture: 0.005 });
    await cam([0.5, 1.6, -1.3], [-1.1, 1.4, -1.8], 1.6, 56);
    await D.say('Mark', "Pre, 'wag ka nang makialam. Renewal mo next week.");
    mark.look(weng.head, 0.6);
    // Joy turns to you
    joy.look(you, 1); joy.root.rotation.y = 1.3; weng.look(you, 0.6);
    // the question lands on the money, not on a face
    const dw = this.drawer.getWorldPosition(new THREE.Vector3());
    E.dof({ target: this.drawer, aperture: 0.007 });
    animate(k => { joy.shade(1 - 0.8 * k); weng.shade(1 - 0.8 * k); }, 1.2);
    await cam([dw.x + 0.55, dw.y + 0.5, dw.z - 0.35], dw.toArray(), 1.4, 22);
    await D.say("Ma'am Joy", 'May alam ka ba dito?', { hold: 2.2 });

    let pick = await D.choose(['Magsalita|Sabihin ang refund', 'Manahimik|Yumuko sa tray'], { timer: 8, id: 'kaha', def: 1 });
    if (forceSilent) pick = 1; if (forceSpeak) pick = 0;
    animate(k => { joy.shade(0.2 + 0.8 * k); weng.shade(0.2 + 0.8 * k); }, 1.0);
    S.kaha = pick === 0;

    if (S.kaha) {
      await D.say('Ikaw', "Ma'am, 'yung refund po kanina… kayo po 'yung nag-approve.");
      // she picks up the receipt and reads it
      joy.look(this.receipt, 0.9); joy.set({ spine: [14, 0, 0], shR: [-55, 0, -10], elR: [-40, 0, 0] });
      await D.wait(0.4);
      joy.arm.R.wr.add(this.receipt); this.receipt.position.set(0, -0.08, 0.05); this.receipt.rotation.set(-0.6, 0, 0);
      joy.set({ spine: [0, 0, 0], shR: [-38, 0, -18], elR: [-96, 25, 0] });
      E.dof({ target: this.receipt, aperture: 0.004 });
      await cam([0.15, 1.55, -1.15], [-0.85, 1.32, -0.85], 1.2, 30);
      await D.say('', 'Tiningnan niya ang resibo. Nandoon nga.');
      weng.expression({ worry: 0.2 }); weng.set({ shL: [-48, 0, 4], elL: [-110, 0, -40], shR: [-8, 0, -6], elR: [-12, 0, 0], neck: [4, 0, 0] }); // hand to chest
      E.dof({ target: joy.head, aperture: 0.003 });
      await cam([0.5, 1.6, -1.3], [-1.1, 1.4, -1.1], 1.2, 40);
      await D.say("Ma'am Joy", 'Okay. Balik sa trabaho.', { hold: 2 });
      // she walks past you, writing on the clipboard
      joy.arm.R.wr.remove(this.receipt); this.receipt.visible = false;
      joy.look(this.clip, 0.9); joy.set({ shL: [-20, 0, 14], elL: [-100, -20, 0], shR: [-40, 0, -10], elR: [-90, 40, 0], neck: [26, 0, 0] });
      joy.anim = (t, p) => { p.arm.R.wr.rotation.z = Math.sin(t * 14) * 0.15; };
      joy.walk = 0.8;
      const jp = moveTo(joy.root, [1.4, 0, -0.95], 3.2, { e: 'linear', ry: PI / 2 });
      E.dof({ target: this.clip, aperture: 0.004 });
      cam([0.5, 1.6, -1.3], [0.4, 1.2, -0.9], 2.8, 44);
      await D.say('', "Pagdaan niya sa'yo, may isinulat siya sa clipboard.");
      await jp; joy.walk = 0; joy.anim = null;
      // break: Weng comes to you
      await D.black(true, 0.6);
      joy.root.position.set(2.6, 0, 3);
      weng.pose('standRelaxed', true); weng.root.position.set(-0.3, 0, -1.15); weng.root.rotation.y = 1.45; weng.expression({ smile: 0.7 });
      weng.look(you, 1); weng.set({ shL: [-62, 0, 10], elL: [-25, 0, 0] });
      rig.set({ pos: [0.5, 1.6, -1.3], look: [-0.2, 1.3, -1.25], fov: 42 });
      E.dof({ target: weng.arm.L.wr, aperture: 0.003 });
      await D.black(false, 0.6);
      await moveTo(weng.root, [0.08, 0, -1.22], 1.0);
      rig.jolt = 0.3; setTimeout(() => (rig.jolt = 0), 300);
      await D.say('Ate Weng', "Salamat, ha. Pambaon 'yon ng mga anak ko.");
      D.patak('Ate Weng', 'nakahinga nang maluwag');
      weng.set({ shL: [-8, 0, 6], elL: [-10, 0, 0] });
    } else {
      // you look down at your tray
      E.dof({ target: this.myTray, aperture: 0.005 });
      await cam([0.42, 1.58, -1.0], [0.3, 1.02, -0.4], 1.2, 38);
      await D.say('', "Yumuko ka sa tray mo.");
      // the deduction slip: Weng bends over and signs
      this.drawSlip(0); audio.paper();
      weng.root.position.set(-1.38, 0, -0.98); weng.root.rotation.y = 0.05; weng.look(null); weng.pose('signing'); weng.expression({ sad: 0.8 });
      weng.set({ spine: [28, 0, 0], neck: [30, 0, 0], shR: [-64, 0, -4], elR: [-36, 0, 8], shL: [-50, 0, 14], elL: [-46, 0, -14] });
      joy.look(weng.head, 0.8); joy.root.position.set(-1.9, 0, -1.05); joy.root.rotation.y = 0.75; joy.pose('clipboard');
      weng.arm.R.wr.add(this.pen); this.pen.position.set(0, -0.07, 0.02); this.pen.rotation.set(0.5, 0, 0); this.pen.visible = true;
      await D.wait(0.7);
      // put the slip right under her hand
      { const hp = weng.arm.R.wr.getWorldPosition(new THREE.Vector3()); this.slip.position.set(hp.x - 0.035, COUNTER_Y + 0.024, Math.min(hp.z + 0.02, -0.4)); this.slip.visible = true; }
      E.dof({ target: this.slip, aperture: 0.005 });
      { const sp = this.slip.position; rig.set({ pos: [sp.x + 0.12, 1.5, sp.z + 0.75], look: sp.toArray(), fov: 34 });
        cam([sp.x + 0.08, 1.38, sp.z + 0.5], sp.toArray(), 3.2, 30, 'sine'); await D.wait(0.8); }
      weng.anim = (t, p) => { p.arm.R.wr.rotation.z = Math.sin(t * 18) * 0.25; p.arm.R.el.rotation.y = Math.sin(t * 2.4) * 0.12; };
      this.pen.removeFromParent(); this.scene.add(this.pen); this.pen.visible = true;
      const penDir = new THREE.Vector3(0.18, 0.9, -0.4).normalize(), tip = new THREE.Vector3();
      this.pen.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), penDir);
      this.slip.updateMatrixWorld(true);
      await animate(k => {
        this.drawSlip(k);
        const px = 315 + k * 240, py = 335 + Math.sin(k * 22) * 13 * (1 - k * 0.5) - Math.sin(k * 5) * 6;
        tip.set((px / 640 - 0.5) * 0.21, (0.5 - py / 420) * 0.14, 0.004); this.slip.localToWorld(tip);
        this.pen.position.copy(tip).addScaledVector(penDir, 0.066);
      }, 2.2, 'linear');
      weng.anim = null;
      await D.say('', 'Pinirmahan ni Ate Weng ang kaltas.');
      this.pen.visible = false;
      // break corner: she sits alone, texting
      await D.black(true, 0.7);
      joy.root.position.set(2.6, 0, 3);
      // she sits facing the wall, away from everyone
      weng.root.position.set(3.25, 0.03, -1.05); weng.root.rotation.y = PI + 0.45; weng.pose('sitSlump', true);
      weng.set({ shL: [-30, 0, 6], elL: [-108, 12, 0], shR: [-30, 0, -6], elR: [-108, -12, 0], neck: [36, 0, 0] }, true);
      weng.expression({ sad: 1 });
      for (let i = 0; i < 3; i++) weng.update(0.5, 0);
      weng.root.updateMatrixWorld(true);
      { const hp = weng.head.getWorldPosition(new THREE.Vector3());
        const a = weng.arm.L.wr.getWorldPosition(new THREE.Vector3()), b = weng.arm.R.wr.getWorldPosition(new THREE.Vector3());
        this.phone.position.copy(a).add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.03, 0));
        this.phone.lookAt(hp); this.phone.visible = true; }
      this.phoneLight.intensity = 0.07;
      audio.layer('murmur', 0.25); audio.layer('fryer', 0.3);
      { const pp = this.phone.position, hp = weng.head.getWorldPosition(new THREE.Vector3());
        // over her left shoulder: behind and a little to the side of her head
        const back = new THREE.Vector3(hp.x - pp.x, 0, hp.z - pp.z).normalize();
        const side = new THREE.Vector3(back.z, 0, -back.x);
        const c0 = hp.clone().addScaledVector(back, 0.95).addScaledVector(side, 0.42).add(new THREE.Vector3(0, 0.38, 0));
        const c1 = hp.clone().addScaledVector(back, 0.75).addScaledVector(side, 0.34).add(new THREE.Vector3(0, 0.3, 0));
        rig.set({ pos: c0.toArray(), look: pp.toArray(), fov: 34 });
        E.dof({ target: this.phone, aperture: 0.005 });
        await D.black(false, 0.8);
        cam(c1.toArray(), pp.toArray(), 5, 28, 'sine');
        // insert: the screen, from just behind her eyes
        const ins = hp.clone().lerp(pp, 0.35).add(new THREE.Vector3(0, 0.04, 0)).addScaledVector(back, 0.02);
        setTimeout(() => { rig.set({ pos: ins.toArray(), look: pp.toArray(), fov: 24 }); rig.move({ pos: ins.clone().lerp(pp, 0.15).toArray(), look: pp.toArray(), fov: 22, dur: 4, e: 'sine' }); E.dof({ target: this.phone, aperture: 0.004 }); }, 2600); }
      await D.say('', "Sa break, nakita mo siyang nagte-text: \"Anak, sa Sabado na lang 'yung pambili ng project mo ha.\"", { hold: 6.4 });
      D.patak('Ate Weng', '₱500 ang ikinaltas');
    }
    await D.wait(3.0);
    await D.black(true, 1.2);
  },

  /* Part Two: the memo is still on the wall */
  async montage(D) {
    const rig = this.engine.rig, E = this.engine, weng = this.weng;
    this.joy.root.position.set(2.6, 0, 3);
    this.mark.root.position.set(1.4, 0, -1.7); this.mark.root.rotation.y = PI; this.mark.pose('bothHands', true);
    this.phone.visible = false; this.slip.visible = false; this.pen.visible = false; this.receipt.visible = false;
    weng.root.position.set(-0.95, 0, -0.9); weng.root.rotation.y = 0.1; weng.pose('standRelaxed', true);
    weng.set({ shL: [-30, 0, 6], elL: [-60, 0, 0], shR: [-30, 0, -6], elR: [-60, 0, 0], neck: [14, 0, 0] }, true); weng.expression({});
    weng.look(this.pos1, 0.6);
    rig.set({ pos: [0.42, 1.42, -0.9], look: [-0.62, 1.36, -0.66], fov: 40 });
    E.dof({ target: this.memo, aperture: 0.008 });
    await D.black(false, 0.8);
    rig.move({ pos: [0.2, 1.4, -0.82], look: [-0.6, 1.36, -0.64], fov: 36, dur: 5.5, e: 'sine' });
    await D.say('', 'Nasa pader pa rin ang memo. Contractual pa rin si Ate Weng.');
    await D.black(true, 0.8);
  },
};
