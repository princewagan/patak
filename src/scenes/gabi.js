import * as THREE from 'three';
import { pbr, std, glow, box, cyl, at, canvasTex, envFrom } from '../engine/kit.js';
import { Rain } from '../engine/rain.js';
import { audio } from '../engine/audio.js';
import { animate } from '../engine/tween.js';

const PI = Math.PI;

/* His rented room, 10:05 PM. Floor y=0, room x∈[-1.4,1.4], z∈[-1.6,1.6], ceiling 2.45.
   Jalousie window on the back wall (z=-1.6). You sit on the foam mattress on the floor. */
const RX = 1.4, RZ = 1.6, H = 2.45;

function coinsFor(amount) {
  // ₱100 / ₱50 bills, ₱20 / ₱10 / ₱5 / ₱1 coins
  const out = []; let a = Math.max(0, amount | 0);
  for (const v of [100, 50, 20, 10, 5, 1]) while (a >= v) { out.push(v); a -= v; }
  return out;
}

function billTex(v) {
  const col = v === 100 ? ['#7a6aa6', '#eee8ff'] : ['#b5413a', '#ffe9e6'];
  return canvasTex(220, 96, (c, w, h) => {
    c.fillStyle = col[0]; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.arc(160, 48, 30, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = col[1]; c.font = 'bold 30px Inter'; c.fillText(String(v), 16, 40); c.font = 'bold 16px Inter'; c.fillText('PISO', 18, 78);
    for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; c.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  });
}

function sheetTex() {
  return canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#6f7f95'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) {
      const ox = (y / 64) % 2 ? 32 : 0;
      c.fillStyle = 'rgba(230,220,200,.35)'; c.beginPath(); c.arc(x + ox + 32, y + 32, 13, 0, 7); c.fill();
      c.fillStyle = 'rgba(160,70,80,.35)'; for (let k = 0; k < 5; k++) { c.beginPath(); c.ellipse(x + ox + 32 + Math.cos(k * 1.256) * 17, y + 32 + Math.sin(k * 1.256) * 17, 8, 5, k * 1.256, 0, 7); c.fill(); }
    }
    for (let i = 0; i < 2000; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  });
}

function phoneScreen() {
  return canvasTex(256, 520, (c, w, h) => {
    c.fillStyle = '#05070a'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#9aa7b6'; c.font = '600 18px Inter'; c.textAlign = 'center'; c.fillText('Martes', w / 2, 70);
    c.fillStyle = '#eef2f6'; c.font = '200 76px Inter'; c.fillText('10:05', w / 2, 150);
    c.fillStyle = '#1b2230'; c.beginPath(); c.roundRect(18, 200, w - 36, 92, 16); c.fill();
    c.fillStyle = '#f2a33a'; c.beginPath(); c.arc(50, 246, 13, 0, 7); c.fill();
    c.fillStyle = '#eef2f6'; c.textAlign = 'left'; c.font = '600 17px Inter'; c.fillText('Alarm', 74, 236);
    c.font = '15px Inter'; c.fillStyle = '#b8c3d0'; c.fillText('5:30 AM · bukas', 74, 262);
    c.fillStyle = '#3a4250'; c.fillRect(w / 2 - 50, h - 30, 100, 5);
  });
}

/** rain on a pane: falling drops + streaks, drawn procedurally (no background refraction needed at night) */
function glassMat() {
  const u = { uTime: { value: 0 }, uAmt: { value: 0.6 } };
  const m = new THREE.ShaderMaterial({
    uniforms: u, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uAmt; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        vec2 uv = vUv * vec2(6.0, 4.0);
        float a = 0.0;
        // static beads
        vec2 g = floor(uv*3.0), f = fract(uv*3.0) - 0.5;
        float r = h(g);
        vec2 o = vec2(h(g+3.1), h(g+7.7)) - 0.5;
        float d = length((f - o*0.6) * vec2(1.0, 1.3));
        a += step(r, uAmt) * (1.0 - smoothstep(0.08, 0.14, d)) * 0.8;
        // running drops with trails
        float col = floor(uv.x*2.0); float sp = 0.3 + h(vec2(col, 1.0))*0.6;
        float y = fract(uv.y*0.25 + uTime*sp*0.18 + h(vec2(col, 4.0)));
        vec2 q = vec2(fract(uv.x*2.0) - 0.5 - (h(vec2(col,9.0))-0.5)*0.5, y);
        float head = 1.0 - smoothstep(0.03, 0.06, length(vec2(q.x*1.0, (q.y-0.5)*4.0)));
        float trail = (1.0 - smoothstep(0.008, 0.02, abs(q.x))) * smoothstep(0.5, 1.0, q.y) * 0.45;
        a += (head + trail) * step(0.35, h(vec2(col, 2.0))) * uAmt;
        a = clamp(a, 0.0, 1.0);
        gl_FragColor = vec4(vec3(0.75, 0.82, 0.92) * (0.35 + a*0.9), 0.08 + a*0.55);
      }`,
  });
  m.userData.u = u; return m;
}

export default {
  dof: { focus: 0.62, aperture: 0.006, maxblur: 0.009 },
  grade: { lift: [0.012, 0.014, 0.03], gain: [0.98, 0.98, 1.04], sat: 0.82, grain: 0.09, bloom: 0.3, bloomThreshold: 0.85, exposure: 0.78, vignette: 1.3 },

  async build(engine) {
    const S = this.scene = new THREE.Scene();
    S.background = new THREE.Color(0x05070a);
    S.environment = await envFrom(engine.renderer, '/tex/modern_evening_street_1k.hdr');
    S.environmentIntensity = 0.06;

    // ---------- room ----------
    const wallM = pbr('painted_plaster_wall', { repeat: [2, 1.5], color: 0x9fb3b0 });
    const floorM = pbr('concrete_floor_01', { repeat: [2, 2], color: 0x7d7468 });
    const ceilM = pbr('plywood', { repeat: [2, 2], color: 0x8b7a62 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2 * RX, 2 * RZ), floorM); floor.rotation.x = -PI / 2; floor.receiveShadow = true; S.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(2 * RX, 2 * RZ), ceilM); ceil.rotation.x = PI / 2; ceil.position.y = H; S.add(ceil);
    S.add(at(box(0.1, H, 2 * RZ, wallM), -RX - 0.05, H / 2, 0));
    S.add(at(box(0.1, H, 2 * RZ, wallM), RX + 0.05, H / 2, 0));
    S.add(at(box(2 * RX, H, 0.1, wallM), 0, H / 2, RZ + 0.05));
    // back wall with the jalousie window opening x∈[0.15,1.05], y∈[1.0,1.9]
    const wx0 = 0.15, wx1 = 1.05, wy0 = 1.0, wy1 = 1.9, bz = -RZ - 0.05;
    S.add(at(box(RX + wx0, H, 0.1, wallM), (-RX + wx0) / 2, H / 2, bz));
    S.add(at(box(RX - wx1, H, 0.1, wallM), (RX + wx1) / 2, H / 2, bz));
    S.add(at(box(wx1 - wx0, wy0, 0.1, wallM), (wx0 + wx1) / 2, wy0 / 2, bz));
    S.add(at(box(wx1 - wx0, H - wy1, 0.1, wallM), (wx0 + wx1) / 2, (H + wy1) / 2, bz));
    // jalousie: aluminium frame + tilted glass louvers
    const alu = std(0xa7adb3, { metal: 0.8, rough: 0.35 });
    const wc = (wx0 + wx1) / 2;
    for (const [w, h, x, y] of [[wx1 - wx0, 0.03, wc, wy1], [wx1 - wx0, 0.03, wc, wy0], [0.03, wy1 - wy0, wx0, (wy0 + wy1) / 2], [0.03, wy1 - wy0, wx1, (wy0 + wy1) / 2]]) S.add(at(box(w, h, 0.06, alu), x, y, bz + 0.02));
    const louverM = new THREE.MeshStandardMaterial({ color: 0x9fb6c8, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 1.5 });
    this.glass = [];
    for (let i = 0; i < 8; i++) {
      const y = wy0 + 0.07 + i * 0.105;
      const l = new THREE.Mesh(new THREE.BoxGeometry(wx1 - wx0 - 0.04, 0.1, 0.004), louverM); l.position.set(wc, y, bz + 0.03); l.rotation.x = -0.55; S.add(l);
      const gm = glassMat(); const gl = new THREE.Mesh(new THREE.PlaneGeometry(wx1 - wx0 - 0.04, 0.1), gm); gl.position.set(wc, y, bz + 0.035); gl.rotation.x = -0.55; S.add(gl); this.glass.push(gm);
    }
    // outside: neighbour's wall lit by a sodium lamp, rain
    const outWall = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), pbr('peeling_painted_wall', { repeat: [4, 2.4], color: 0x6d6a64, wet: 0.6 })); outWall.position.set(0.6, 2, -3.6); S.add(outWall);
    const sodium = new THREE.PointLight(0xff9440, 7, 9, 1.5); sodium.position.set(1.9, 3.0, -2.6); S.add(sodium);
    this.flash = new THREE.PointLight(0xcfe0ff, 0, 12, 1.2); this.flash.position.set(-1.0, 3.2, -3.0); S.add(this.flash);
    // light spilling in through the louvers onto the floor/mattress
    const spill = new THREE.SpotLight(0xff9a50, 2.2, 6, 0.55, 0.7, 1.4); spill.position.set(wc + 0.2, 2.05, -RZ - 0.6); spill.target.position.set(-0.2, 0.1, 0.2); spill.castShadow = true; spill.shadow.mapSize.set(1024, 1024); S.add(spill, spill.target);
    S.add(new THREE.HemisphereLight(0x23314a, 0x080706, 0.22));

    // ---------- things in the room ----------
    // foam mattress on the floor with a sheet, pillow, thin blanket
    const sheet = new THREE.MeshStandardMaterial({ map: sheetTex(), roughness: 0.95, normalMap: pbr('denim_fabric', { repeat: [3, 3] }).normalMap });
    sheet.normalScale.set(0.5, 0.5);
    S.add(at(box(1.0, 0.11, 1.95, sheet, 0.04), -0.55, 0.055, 0.35));
    S.add(at(box(0.48, 0.1, 0.3, std(0xd8d2c6, { rough: 0.95 }), 0.05), -0.55, 0.15, -0.42));
    const blanket = box(0.9, 0.035, 0.7, std(0x5e3d3d, { rough: 1 }), 0.015); blanket.position.set(-0.6, 0.125, 1.0); blanket.rotation.y = 0.08; S.add(blanket);
    // stand fan (oscillating head, spinning blades)
    const fan = new THREE.Group(); fan.position.set(0.95, 0, 0.55); S.add(fan);
    const fanM = std(0xe6e3dc, { rough: 0.45 });
    fan.add(at(cyl(0.17, 0.19, 0.04, fanM, 24), 0, 0.02, 0));
    fan.add(at(cyl(0.018, 0.018, 1.0, std(0xc9ccd0, { metal: 0.8, rough: 0.3 })), 0, 0.52, 0));
    const head = this.fanHead = new THREE.Group(); head.position.y = 1.04; fan.add(head);
    head.add(at(cyl(0.07, 0.06, 0.16, fanM, 16), 0, 0, -0.05, 0, PI / 2));
    const cage = new THREE.Group(); cage.position.z = 0.07; head.add(cage);
    const wireM = std(0xd8d8d8, { metal: 0.6, rough: 0.4 });
    for (const r of [0.06, 0.12, 0.18, 0.21]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r, 0.002, 4, 40), wireM); cage.add(t); }
    for (let i = 0; i < 16; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.21, 0.002), wireM); s.geometry.translate(0, 0.105, 0); s.rotation.z = i / 16 * PI * 2; s.position.z = 0.012; cage.add(s); }
    const blades = this.blades = new THREE.Group(); blades.position.z = 0.0; cage.add(blades);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12, -0.32, 0.64), new THREE.MeshStandardMaterial({ color: 0x9fc0d8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.3 })); b.rotation.z = i * PI * 2 / 3; blades.add(b); }
    // shelf with a small Santo Niño and a red votive light
    S.add(at(box(0.5, 0.025, 0.2, pbr('plywood', { color: 0x7a5f40 })), -1.12, 1.55, -1.2, PI / 2));
    const nino = new THREE.Group(); nino.position.set(-1.15, 1.565, -1.2); S.add(nino);
    nino.add(at(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 14), std(0x9c1a22, { rough: 0.6 })), 0, 0.08, 0));
    nino.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), std(0xc79a74, { rough: 0.5 })), 0, 0.18, 0));
    nino.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.03, 10), std(0xd4b04a, { metal: 1, rough: 0.3 })), 0, 0.212, 0));
    const votive = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.045, 12), glow(0xff3020, 3)); votive.position.set(-1.15, 1.59, -1.05); S.add(votive);
    this.votiveL = new THREE.PointLight(0xff3a24, 0.5, 1.6, 2); this.votiveL.position.set(-1.1, 1.65, -1.05); S.add(this.votiveL);
    // crew polo on a hanger + cap on a nail (his job)
    const polo = new THREE.Group(); polo.position.set(-RX + 0.08, 1.55, 0.6); polo.rotation.y = PI / 2; S.add(polo);
    polo.add(at(box(0.44, 0.58, 0.04, std(0x6b1c22, { rough: 0.9 }), 0.03), 0, -0.3, 0));
    polo.add(at(box(0.16, 0.06, 0.042, std(0xe6c64a, { rough: 0.8 })), 0, -0.05, 0.002));
    polo.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.006, 4, 24, PI), std(0x333333)), 0, -0.02, 0));
    // the phone and the money on the sheet
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.009, 0.15), [std(0x111), std(0x111), new THREE.MeshBasicMaterial({ map: phoneScreen() }), std(0x111), std(0x111), std(0x111)]);
    phone.position.set(-0.3, 0.115, 0.42); phone.rotation.y = 0.35; S.add(phone);
    const pl = new THREE.PointLight(0xb6c8ff, 0.35, 1.1, 2); pl.position.set(-0.3, 0.3, 0.42); S.add(pl);
    this.money = new THREE.Group(); S.add(this.money);

    // ---------- weather outside ----------
    this.rain = new Rain({ count: 6000, size: [10, 8, 10], speed: 10, opacity: 0.55, wind: [0.4, 0.2] }).exclude([-RX - 0.2, -1, -RZ - 0.1], [RX + 0.2, H + 1, RZ + 0.2]);
    S.add(this.rain.mesh);
  },

  layMoney(amount) {
    this.money.clear();
    const vals = coinsFor(amount);
    let x = -0.42, z = 0.62;
    for (const v of vals) {
      if (v >= 50) {
        const b = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.062), new THREE.MeshStandardMaterial({ map: billTex(v), roughness: 0.85, side: THREE.DoubleSide }));
        b.rotation.set(-PI / 2, 0, 0.2 + Math.random() * 0.2); b.position.set(x - 0.02, 0.114, z - 0.06); b.receiveShadow = true; b.castShadow = true;
        this.money.add(b); x += 0.16;
      } else {
        const r = v === 20 ? 0.0135 : v === 10 ? 0.0135 : v === 5 ? 0.0125 : 0.0115;
        const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.0025, 20), new THREE.MeshStandardMaterial({ color: v >= 10 ? 0xd2bd84 : 0xbfc3c6, metalness: 1, roughness: 0.3 }));
        c.position.set(x, 0.114, z + (Math.random() - 0.5) * 0.02); c.castShadow = true; this.money.add(c); x += 0.04;
      }
    }
    this.money.children.forEach(m => (m.visible = false));
  },

  enter(engine) {
    this.engine = engine;
    engine.rig.shake = 0.45; engine.rig.jolt = 0;
    engine.rig.set({ pos: [-0.5, 1.02, 1.12], look: [-0.36, 0.1, 0.55], fov: 40 });
    engine.dof({ focus: 0.62, aperture: 0.006 });
    audio.layer('engine', 0); audio.layer('traffic', 0); audio.layer('tv', 0);
    audio.rain(0.4, 0.55); audio.roof(0.35); audio.fan(0.7);
  },
  exit() { audio.layer('fan', 0); audio.layer('roof', 0); },

  update(dt, t) {
    this.rain.update(t, this.engine.camera);
    this.fanHead.rotation.y = Math.sin(t * 0.35) * 0.7 - 0.5;
    this.blades.rotation.z -= dt * 22;
    for (const g of this.glass) g.userData.u.uTime.value = t;
    this.votiveL.intensity = 0.45 + Math.sin(t * 11) * 0.05 + Math.sin(t * 17.3) * 0.04;
    if (this.flash.intensity > 0) this.flash.intensity = Math.max(0, this.flash.intensity - dt * 40);
  },

  async play(D, S) {
    const E = this.engine, rig = E.rig;
    const amount = S.wallet ?? 110;
    this.layMoney(amount);
    rig.move({ pos: [-0.48, 1.0, 1.08], look: [-0.3, 0.1, 0.6], dur: 7, e: 'out' });
    await D.black(false, 1.4);
    await D.wait(0.6);
    for (const m of this.money.children) { m.visible = true; if (m.geometry.type === 'PlaneGeometry') audio.paper(); else audio.tone(5000 + Math.random() * 900, 0.16, { vol: 0.03 }); await D.wait(0.38); }
    await D.say('', `Binilang mo ang natira. ₱${amount}.`);
    // the rain gets heavy; look up at the window
    E.dof({ focus: 2.6, aperture: 0.004 });
    rig.move({ pos: [-0.42, 1.08, 1.1], look: [0.6, 1.4, -1.6], dur: 3.2, fov: 42 });
    audio.rain(1, 0.4); audio.roof(1.0);
    await animate(k => { for (const g of this.glass) g.userData.u.uAmt.value = 0.6 + k * 0.35; this.rain.uniforms.uSpeed.value = 10 + k * 4; }, 2.0);
    this.flash.intensity = 14; setTimeout(() => audio.thunder(), 900);
    await D.say('', 'Umulan nang malakas.');
    await D.wait(1.4);
    await D.black(true, 1.4);
  },
};
