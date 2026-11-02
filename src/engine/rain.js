import * as THREE from 'three';

/** GPU rain streaks in a box that follows the camera. */
export class Rain {
  constructor({ count = 9000, size = [24, 14, 24], speed = 11, len = 0.6, width = 0.018, color = 0xc6d6e2, opacity = 0.55, wind = [0.6, 0] } = {}) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-.5, 0, 0, .5, 0, 0, .5, 1, 0, -.5, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const off = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { off[i * 4] = Math.random(); off[i * 4 + 1] = Math.random(); off[i * 4 + 2] = Math.random(); off[i * 4 + 3] = 0.75 + Math.random() * 0.5; }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4));
    g.instanceCount = count;
    this.uniforms = {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSize: { value: new THREE.Vector3(...size) },
      uSpeed: { value: speed }, uLen: { value: len }, uWidth: { value: width }, uWind: { value: new THREE.Vector2(...wind) },
      uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uAmount: { value: 1 },
      uBoxMin: { value: new THREE.Vector3(1e5, 1e5, 1e5) }, uBoxMax: { value: new THREE.Vector3(1e5, 1e5, 1e5) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec4 aOff; uniform float uTime,uSpeed,uLen,uWidth,uAmount; uniform vec3 uCenter,uSize; uniform vec2 uWind;
        varying float vA; varying float vY; varying vec3 vW;
        void main(){
          vec3 p = aOff.xyz * uSize * 7.0;
          float fall = uTime * uSpeed * aOff.w;
          p.y -= fall;
          p.xz += uWind * fall * 0.08;
          // world-anchored, wrapped into a box around the camera
          vec3 w = uCenter + mod(p - uCenter, uSize) - uSize*0.5;
          // billboard streak around Y, stretched along fall direction
          vec3 dir = normalize(vec3(uWind.x*0.08, -1.0, uWind.y*0.08));
          vec3 toCam = normalize(cameraPosition - w);
          vec3 side = normalize(cross(dir, toCam));
          float L = uLen * aOff.w;
          vec3 pos = w + side * position.x * uWidth - dir * position.y * L;
          vA = step(fract(aOff.x*91.7 + aOff.z*13.1), uAmount);
          vY = position.y; vW = pos;
          gl_Position = projectionMatrix * viewMatrix * vec4(pos,1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor, uBoxMin, uBoxMax; uniform float uOpacity; varying float vA; varying float vY; varying vec3 vW;
        void main(){ if (all(greaterThan(vW, uBoxMin)) && all(lessThan(vW, uBoxMax))) discard; float a = uOpacity * vA * smoothstep(0.0,0.3,vY) * (1.0 - smoothstep(0.6,1.0,vY)); if(a<0.003) discard; gl_FragColor = vec4(uColor*a, a); }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
  }
  set amount(v) { this.uniforms.uAmount.value = v; }
  exclude(min, max) { this.uniforms.uBoxMin.value.set(...min); this.uniforms.uBoxMax.value.set(...max); return this; }
  update(t, cam) { this.uniforms.uTime.value = t; this.uniforms.uCenter.value.copy(cam.position); }
}

/** expanding splash rings on a horizontal plane at height y */
export class Splashes {
  constructor({ count = 500, area = [16, 16], y = 0.01, color = 0xcfdde6, opacity = 0.35, rate = 1.6, center = [0, 0] } = {}) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
    g.setIndex([0, 2, 1, 0, 3, 2]);
    const off = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { off[i * 3] = Math.random(); off[i * 3 + 1] = Math.random(); off[i * 3 + 2] = Math.random(); }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
    g.instanceCount = count;
    this.uniforms = { uTime: { value: 0 }, uArea: { value: new THREE.Vector2(...area) }, uY: { value: y }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uRate: { value: rate }, uCenter: { value: new THREE.Vector2(...center) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec3 aOff; uniform float uTime,uY,uRate; uniform vec2 uArea,uCenter; varying vec2 vUv; varying float vK;
        void main(){
          float cyc = uTime*uRate + aOff.z*10.0; float k = fract(cyc); float id = floor(cyc);
          vec2 rnd = fract(vec2(sin(id*12.9+aOff.x*78.2), sin(id*39.3+aOff.y*11.1))*43758.5);
          vec2 xz = uCenter + (rnd - 0.5) * uArea;
          float s = 0.02 + k*0.11;
          vUv = position.xz; vK = k;
          gl_Position = projectionMatrix * viewMatrix * vec4(xz.x + position.x*s, uY, xz.y + position.z*s, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity; varying vec2 vUv; varying float vK;
        void main(){ float r = length(vUv); float ring = smoothstep(0.75,0.92,r)*(1.0 - smoothstep(0.93,1.0,r)); float a = ring*(1.0-vK)*uOpacity; if(a<0.004) discard; gl_FragColor = vec4(uColor*a,a); }`,
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
  }
  update(t) { this.uniforms.uTime.value = t; }
}
