import { audio } from './audio.js';

/* Main menu: the real Aug 17 photo of the submerged jeep (IMG_6457), running live in its own small WebGL view:
   depth parallax, rain rings on the water, rain streaks, lightning. Everything here stops once the game starts. */

const $ = s => document.querySelector(s);

const VS = 'attribute vec2 p; varying vec2 v; void main(){ v = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }';

const FS = `precision highp float;
uniform sampler2D P, D, W;
uniform vec2 R, M;
uniform float T, IN, FL;
uniform vec3 DROP;
varying vec2 v;

float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }

/* the photo is portrait, so show a wide window onto it, set so the jeep sits left of centre */
vec2 window(vec2 s){
  float ra = R.x / R.y, ht = .365, wd = ht * ra / .75;
  if (wd > 1.) { ht /= wd; wd = 1.; }
  return vec2(.47 + (s.x - .5) * wd, .515 + (s.y - .5) * ht);
}

/* expanding rings where rain hits the water; uv is on the ground plane */
float rings(vec2 uv, float t){
  vec2 g = floor(uv), f = fract(uv); float s = 0.;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j)), c = g + o; float r = h(c);
    float ph = fract(t * (.5 + .4 * r) + r * 7.);
    float d = length(o + vec2(h(c + 3.), h(c + 7.)) - f), a = ph * .95;
    s += sin((d - a) * 30.) * smoothstep(a + .1, a, d) * smoothstep(a - .28, a, d) * (1. - ph) * (1. - ph);
  }
  return s;
}

float streak(vec2 s, float sc, float sp, float seed){
  vec2 p = vec2((s.x + s.y * .055) * R.x / R.y * sc * 15., s.y * sc * 1.1 + T * sp);
  vec2 i = floor(p), f = fract(p); float r = h(i + seed);
  if (r < .84) return 0.;
  return smoothstep(0., .25, f.y) * smoothstep(1., .55, f.y) * smoothstep(.09, 0., abs(f.x - .2 - r * .6));
}

void main(){
  vec2 s = v;
  vec2 drift = M * .016 + vec2(sin(T * .07), cos(T * .05)) * .0035;
  vec2 u = window(s);
  float dep = texture2D(D, u).r;
  u += drift * (dep - .45);
  float w = smoothstep(.12, .7, texture2D(W, u).r);

  /* ground plane: everything below the vanishing point, squashed with distance */
  float hz = .563, gy = max(.012, hz - u.y), z = 1. / gy;
  /* the far end of the street: the water calms and fades out here, so nothing gets painted on the walls behind it */
  w *= smoothstep(.006, .06, hz - u.y);
  vec2 g = vec2((u.x - .4) * z, z * 1.15);
  vec2 g2 = vec2(g.x * .85, g.y * 1.9);
  float e = .055;
  float r0 = rings(g * .62, T), rx = rings((g + vec2(e, 0.)) * .62, T), ry = rings((g + vec2(0., e)) * .62, T);
  vec2 nrm = vec2(rx - r0, ry - r0) * 1.6;
  float roll = n(vec2(g2.x * .8 + T * .08, g2.y * .55 - T * .5)) - .5;
  vec2 uv = u + w * (nrm * vec2(.006, .009) + vec2(roll * .002, roll * .012)) * clamp(gy * 7., .25, 1.);

  /* a single big drop falling onto the water */
  float dropWave = 0.;
  if (DROP.z >= 0.) {
    vec2 q = (s - DROP.xy) * vec2(R.x / R.y, 3.4);
    float d = length(q), a = DROP.z * .24;
    dropWave = sin((d - a) * 72.) * smoothstep(a + .03, a, d) * smoothstep(a - .16, a, d) * exp(-DROP.z * 1.1);
    uv.y += dropWave * .007;
  }

  vec3 c = texture2D(P, uv).rgb;
  float l = dot(c, vec3(.3, .59, .11));

  /* day photo graded to a storm at dusk */
  c = mix(vec3(l), c, .52);
  c = pow(c, vec3(1.5));
  c *= vec3(.5, .69, .86) * .78;
  c += vec3(.012, .022, .032);
  /* water picks up sky and ring highlights */
  float spec = clamp(nrm.y * 1.5 + nrm.x * .35, 0., 1.) * w;
  c += spec * vec3(.34, .46, .58) * .55;
  c += w * vec3(.016, .03, .042) * smoothstep(.0, .6, roll + .4);
  c += abs(dropWave) * vec3(.18, .26, .32);

  /* far-end haze so the jeep sits in the rain */
  float fog = smoothstep(.16, 0., abs(u.y - .57)) * .07;
  c = mix(c, vec3(.3, .4, .5), fog);

  /* lightning lifts the whole picture */
  c += FL * (vec3(.32, .4, .52) * (.22 + l * 1.5));

  /* rain */
  float rain = streak(s, 1., 3.2, 0.) * .3 + streak(s + .37, 1.9, 4.4, 5.) * .19 + streak(s + .71, 3.6, 5.8, 9.) * .1;
  c += rain * vec3(.62, .74, .86) * (.55 + FL * 1.5);

  /* room for the logo and the menu */
  float vig = smoothstep(1.2, .3, length((s - vec2(.42, .55)) * vec2(1.05, 1.2)));
  c *= mix(.16, 1., vig);
  c *= mix(1., .28, smoothstep(.58, 1., s.x));
  c *= mix(.32, 1., smoothstep(.0, .42, s.y));
  c *= mix(.42, 1., smoothstep(1., .76, s.y));

  c += (h(s * R + fract(T) * 91.) - .5) * .026;
  gl_FragColor = vec4(c * IN, 1.);
}`;

function program(gl, fs) {
  const compile = (type, src) => {
    const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  gl.useProgram(p);
  return p;
}

function texture(gl, unit, url) {
  return new Promise((ok, no) => {
    const img = new Image(); img.src = url; img.onerror = no;
    img.onload = () => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      for (const [k, val] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, val);
      ok();
    };
  });
}

const CREDITS = [
  '<b>Mga totoong recording mula sa Pilipinas:</b> kevp888 sa Freesound (CC BY): jeep, trapiko sa Maynila, mall, night market, tandang, tuko, gabi sa subdivision.',
  '<b>Videoke sa Biñan, Laguna:</b> Björn Eriksson, Aporee at Internet Archive (Public Domain Mark).',
  '<b>Ulan, fast food, baha, at iba pa:</b> martialway47, Sassaby, MrFossy, richwise, logancircle2, lauramellis, unfa, jankisjes, pinchos, Nakhas, AardsReal, zoombackcamera, Cinetony, kalisemorrison, lolamadeus, ViaTorci, kyles, IsakIzzy, MTJohnson, MootMcnoodles, nooly, haulaway, SpaceJoe, aunrea, Weak_Hero, jaziel_.arroyo, ryansitz, rosenberg3, TariqMK (Freesound, CC0).',
  'Buong listahan: audio/CREDITS.md. Ang tunog ng baha sa Part Three ay sariling recording namin noong Agosto 17, 2026.',
];

const BLURBS = {
  start: '',
  scenesBtn: 'Pumili kung saan magsisimula.',
  soundBtn: 'Mas buo ang kuwento kapag malakas ang tunog.',
  fullBtn: 'Buong screen.',
  creditsBtn: 'Sina Keira at Prince, at ang mga tunog.',
};

/** Boots the whole title screen. Called once from main.js. */
export function titleScreen(canvas) {
  const title = $('#title'), start = $('#start'), scenes = $('#scenesBtn'), sound = $('#soundBtn'), full = $('#fullBtn'), creditsBtn = $('#creditsBtn');
  const q = new URLSearchParams(location.search);
  const skipGate = q.has('from') || q.has('auto');
  const items = [start, scenes, sound, full, creditsBtn];
  audio.prefetch();
  $('#creditList').innerHTML = CREDITS.map(c => `<p>${c}</p>`).join('');

  /* ---------- WebGL ---------- */
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  let U = null, texturesIn = false;
  if (gl) {
    try {
      const p = program(gl, FS);
      const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      U = Object.fromEntries(['P', 'D', 'W', 'R', 'M', 'T', 'IN', 'FL', 'DROP'].map(n => [n, gl.getUniformLocation(p, n)]));
      gl.uniform1i(U.P, 0); gl.uniform1i(U.D, 1); gl.uniform1i(U.W, 2);
      Promise.all([texture(gl, 0, '/photos/IMG_6457.jpg'), texture(gl, 1, '/depth/IMG_6457.png'), texture(gl, 2, '/depth/IMG_6457_water.png')])
        .then(() => { texturesIn = true; }).catch(e => { console.error('title textures', e); });
    } catch (e) { console.error('title shader', e); U = null; }
  }
  const size = () => {
    const k = Math.min(1, 1280 / innerWidth);   // the photo is only 1200 wide, so more pixels would add nothing
    canvas.width = Math.round(innerWidth * k); canvas.height = Math.round(innerHeight * k);
    if (U) { gl.viewport(0, 0, canvas.width, canvas.height); gl.uniform2f(U.R, canvas.width, canvas.height); }
  };
  size(); addEventListener('resize', size);

  /* ---------- state ---------- */
  let shown = false, gate = false, reveal = 0, flash = 0, nextFlash = 9, drop = [-1, -1, -1], nextDrop = 3.2;
  const mouse = [0, 0], eased = [0, 0];
  addEventListener('mousemove', e => { mouse[0] = e.clientX / innerWidth * 2 - 1; mouse[1] = 1 - e.clientY / innerHeight * 2; });

  const blurb = $('#title .blurb');
  const describe = b => {
    items.forEach(i => i.classList.toggle('sel', i === b));
    blurb.textContent = BLURBS[b.id] || '';
  };
  let quiet = false;   // moving focus by code should not tick
  items.forEach(b => {
    b.addEventListener('mouseenter', () => { if (!b.disabled && document.activeElement !== b) b.focus({ preventScroll: true }); });
    b.addEventListener('focus', () => { describe(b); if (!quiet) audio.tick(); });
  });

  const openMenu = () => {
    gate = false; title.classList.remove('gate'); title.classList.add('menuon');
    quiet = true; if (!start.disabled) start.focus({ preventScroll: true }); quiet = false;
    describe(start);
  };

  /* any key or click on the gate: this first gesture is also what browsers need before they allow sound */
  const leaveGate = () => {
    if (!gate) return;
    audio.unlock(); audio.titleBed(1); audio.gateOpen();
    drop = [.3, .2, 0]; nextDrop = 7; nextFlash = 5;
    openMenu();
  };
  addEventListener('pointerdown', () => { if (gate) leaveGate(); }, true);
  addEventListener('keydown', e => {
    if (title.classList.contains('gone')) return;
    if (gate) {
      if (['f', 'm', 'F', 'M', 'Meta', 'Alt', 'Control', 'Shift'].includes(e.key)) return;
      e.preventDefault(); e.stopPropagation(); leaveGate(); return;
    }
    if (window.__patak?.D?.menu?.open) return;
    if (creditsOpen) {
      if (['Escape', 'Enter', ' ', 'Backspace'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); closeCredits(); }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const live = items.filter(b => !b.disabled);
      const i = live.indexOf(document.activeElement);
      live[(i + (e.key === 'ArrowDown' ? 1 : -1) + live.length) % live.length].focus({ preventScroll: true });
    }
  }, true);

  /* the three options the main menu handles by itself (main.js wires Simulan and Mga Eksena) */
  const showSound = () => { const t = `Tunog: ${audio.muted ? 'Sarado' : 'Bukas'}`; if (sound.textContent !== t) sound.textContent = t; };
  sound.addEventListener('click', () => { audio.unlock(); audio.toggleMute(); audio.uiToggle(); window.__patak?.D?.menu?.refresh(); showSound(); });
  full.addEventListener('click', () => { audio.uiToggle(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
  let creditsOpen = false;
  const closeCredits = () => {
    creditsOpen = false; audio.uiClose();
    const c = $('#credits'); c.classList.add('leaving');
    setTimeout(() => c.classList.remove('on', 'leaving'), 260);
    quiet = true; creditsBtn.focus({ preventScroll: true }); quiet = false;
  };
  creditsBtn.addEventListener('click', () => { creditsOpen = true; audio.uiOpen(); $('#credits').classList.add('on'); });
  $('#creditsBack').addEventListener('click', closeCredits);
  start.addEventListener('click', () => audio.confirm());

  /* ---------- frame ---------- */
  let last = performance.now(), T = 0;
  const frame = now => {
    if (title.classList.contains('gone')) { audio.titleBed(0); setTimeout(() => { canvas.width = canvas.height = 1; }, 2000); return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now; T += dt;
    showSound();
    title.classList.toggle('under', creditsOpen || !!window.__patak?.D?.menu?.open);   // something is open on top of the menu

    if (!shown) {
      // load first, so the heavy scene building never stutters the menu
      $('#title .boot').textContent = start.textContent;
      if (!start.disabled && (texturesIn || !U)) {
        shown = true;
        title.classList.remove('boot');
        if (skipGate) openMenu(); else { gate = true; title.classList.add('gate'); }
      }
    } else {
      reveal = Math.min(1, reveal + dt / 2.4);
      nextFlash -= dt; nextDrop -= dt;
      if (nextFlash <= 0) { flash = 1; nextFlash = 11 + Math.random() * 13; audio.titleThunder(); }
      if (nextDrop <= 0) { drop = [.16 + Math.random() * .5, .1 + Math.random() * .3, 0]; nextDrop = 6.5 + Math.random() * 3; audio.titleDrop(); }
    }
    flash = Math.max(0, flash * Math.exp(-dt * 6.5) - dt * .05);
    if (drop[2] >= 0) { drop[2] += dt; if (drop[2] > 5) drop[2] = -1; }
    eased[0] += (mouse[0] - eased[0]) * Math.min(1, dt * 2.2); eased[1] += (mouse[1] - eased[1]) * Math.min(1, dt * 2.2);

    if (U && texturesIn) {
      gl.uniform1f(U.T, T); gl.uniform1f(U.IN, reveal * reveal * (3 - 2 * reveal));
      gl.uniform1f(U.FL, flash + (flash > .4 ? Math.random() * .3 : 0));
      gl.uniform2f(U.M, eased[0], eased[1]); gl.uniform3f(U.DROP, drop[0], drop[1], drop[2]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
