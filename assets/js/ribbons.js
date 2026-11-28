// Hero scene: eight huge concentric arcs seen straight on (orthographic, authored in CSS pixels).
// Each band has a bright outer rim that turns from silver to orange along its length, a dark maroon body,
// a wide soft halo behind them and one thin "comet" arc that travels across.
// Proportions follow measurements of the reference hero at 1920×945; geometry and shaders are original.
import * as THREE from 'three';

const REF_H = 943; // the geometry below is authored for a 943px-tall viewport and scaled from there
const CENTER = { x: 0.662, y: 1.427 }; // arc centre as a fraction of viewport width / height (below the fold)

const VERT = /* glsl */ `
  attribute float aT;
  attribute float aS;
  varying float vT;
  varying float vS;
  void main() {
    vT = aT;
    vS = aS;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BAND_FRAG = /* glsl */ `
  uniform vec3 uSilver;
  uniform vec3 uWhite;
  uniform vec3 uOrange;
  uniform vec3 uHot;
  uniform vec3 uMaroon;
  uniform vec3 uBrown;
  uniform float uOr0;
  uniform float uOr1;
  uniform float uRim;
  uniform float uBody;
  uniform float uHead;
  uniform float uCharge;
  uniform float uAlpha;
  varying float vT;
  varying float vS;

  float bump(float x, float c, float w) {
    float d = (x - c) / w;
    return exp(-d * d);
  }

  void main() {
    // 1 on the right/low end of the band, fading to 0 towards the left/top end
    float orange = 1.0 - smoothstep(uOr0, uOr1, vT);

    // outer rim: silver -> orange along the length, white peak mid-way
    float rim = 1.0 - smoothstep(0.0, uRim, vS);
    float core = 1.0 - smoothstep(0.0, uRim * 0.45, vS);
    vec3 rimCol = mix(uSilver, uOrange, orange);
    rimCol = mix(rimCol, uWhite, core * (1.0 - orange) * (0.1 + 0.36 * bump(vT, 0.58, 0.24)));
    rimCol += uHot * orange * core * 0.35;

    // body: dark maroon, warming up where the band turns orange
    vec3 body = mix(uMaroon, uBrown, orange * 0.85);
    body = mix(body, uOrange * 0.6, orange * uBody * smoothstep(0.05, 0.85, 1.0 - vS));
    float bodyA = 0.94 * (1.0 - 0.55 * smoothstep(0.55, 1.0, vS));

    // soft travelling highlight on the rim
    float d = abs(fract(vT - uHead + 0.5) - 0.5);
    float head = exp(-d * d * 900.0);

    vec3 col = mix(body, rimCol, rim);
    // thin pale hairline along the inner edge of the orange stretches
    col = mix(col, uWhite, smoothstep(0.9, 0.99, vS) * orange * 0.7);
    col += (uHot * 0.7 + uWhite * 0.3) * head * rim * (0.35 + uCharge);
    col *= 1.0 + uCharge * 0.35;
    float a = mix(bodyA, 1.0, rim);
    a *= smoothstep(1.0, 0.6, vT) * smoothstep(0.0, 0.02, vT) * uAlpha; // fade out towards the left, away from the text

    gl_FragColor = vec4(col, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const HALO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uAlpha;
  varying float vT;
  varying float vS;
  void main() {
    float edge = smoothstep(0.0, 0.45, vS) * smoothstep(1.0, 0.55, vS); // soft on both sides
    float ends = smoothstep(0.0, 0.25, vT) * smoothstep(1.0, 0.7, vT);
    gl_FragColor = vec4(uColor, edge * ends * uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const COMET_FRAG = /* glsl */ `
  uniform vec3 uOrange;
  uniform vec3 uWhite;
  uniform float uHeadPos;
  uniform float uAlpha;
  varying float vT;
  varying float vS;
  void main() {
    float behind = uHeadPos - vT;                       // >0 behind the head
    float tail = smoothstep(0.38, 0.0, behind) * step(0.0, behind);
    float headGlow = exp(-pow(behind * 60.0, 2.0)) * 0.9;
    vec3 col = mix(uOrange, uWhite, smoothstep(0.25, 0.0, behind));
    float side = 1.0 - smoothstep(0.55, 1.0, abs(vS * 2.0 - 1.0));
    gl_FragColor = vec4(col, (tail + headGlow) * side * uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Annular strip: t runs from the right/low end (0) to the left/top end (1); s from the outer edge (0) to the inner edge (1). */
function buildBand({ R, w, a0, a1, taper = true, segments = 380, cx = 0 }) {
  const n = segments;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const aT = new Float32Array((n + 1) * 2);
  const aS = new Float32Array((n + 1) * 2);
  const index = [];
  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = a0 + (a1 - a0) * t;
    const width = taper ? w * (0.72 + 0.28 * smooth(0, 0.22, t)) * (1 - 0.5 * smooth(0.72, 1, t)) : w;
    for (let k = 0; k < 2; k++) {
      const r = k === 0 ? R : R - width; // k=0 outer edge, k=1 inner edge
      const j = i * 2 + k;
      pos[j * 3] = cx + Math.cos(a) * r;
      pos[j * 3 + 1] = Math.sin(a) * r;
      pos[j * 3 + 2] = 0;
      aT[j] = t;
      aS[j] = k;
    }
    if (i < n) {
      const b = i * 2;
      index.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  geo.setIndex(index);
  return geo;
}

export function createRibbons(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr());

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  const group = new THREE.Group();
  scene.add(group);

  const col = {
    silver: new THREE.Color('#b8aca4'),
    white: new THREE.Color('#f4eee9'),
    orange: new THREE.Color('#e4551b'),
    hot: new THREE.Color('#ff8a3d'),
    maroon: new THREE.Color('#1e0c0a'),
    brown: new THREE.Color('#38130a'),
  };

  const disposables = [];
  const bandMats = [];

  // wide soft halo behind the arcs
  {
    const geo = buildBand({ R: 1500, w: 430, a0: 1.05, a1: 3.45, taper: false, segments: 200 });
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: HALO_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color('#3a120b') }, uAlpha: { value: 0.55 } },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 0;
    group.add(mesh);
    disposables.push(geo, mat);
  }

  // eight concentric bands: innermost is the most orange
  const COUNT = 8;
  for (let i = 0; i < COUNT; i++) {
    // not concentric: each ring's centre drifts right, so the arcs are tight on the left, fan out towards the right
    const R = 1100 + i * 70;
    const w = 56 - i * 1.4;
    const geo = buildBand({ R, w, a0: 0.52 - i * 0.012, a1: 2.65 + i * 0.04, cx: i * 28 });
    // where the orange fades out along the band: far along for inner bands, only near the right end for outer ones
    const or1 = 0.58 - i * 0.047;
    const or0 = Math.max(0, or1 - 0.36);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BAND_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uSilver: { value: col.silver },
        uWhite: { value: col.white },
        uOrange: { value: col.orange },
        uHot: { value: col.hot },
        uMaroon: { value: col.maroon },
        uBrown: { value: col.brown },
        uOr0: { value: or0 },
        uOr1: { value: or1 },
        uRim: { value: 0.2 },
        uBody: { value: i === 0 ? 1.0 : i === 1 ? 0.55 : 0.0 },
        uHead: { value: 0 },
        uCharge: { value: 0 },
        uAlpha: { value: 1 },
      },
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1 + i;
    group.add(mesh);
    bandMats.push(mat);
    disposables.push(geo, mat);
  }

  // thin comet arc
  const cometMat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: COMET_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOrange: { value: col.orange },
      uWhite: { value: col.white },
      uHeadPos: { value: 0 },
      uAlpha: { value: 0.95 },
    },
  });
  {
    const geo = buildBand({ R: 1860, w: 3.2, a0: 1.78, a1: 2.62, taper: false, segments: 160 });
    const mesh = new THREE.Mesh(geo, cometMat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 20;
    group.add(mesh);
    disposables.push(geo, cometMat);
  }

  // state
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let charge = 0;
  let chargeTarget = 0;
  let vel = 0;
  let spinKick = 0;
  let isStatic = false;
  let W = 1;
  let H = 1;

  function layout() {
    W = canvas.clientWidth || 1;
    H = canvas.clientHeight || 1;
    renderer.setPixelRatio(dpr());
    renderer.setSize(W, H, false);
    camera.left = -W / 2;
    camera.right = W / 2;
    camera.top = H / 2;
    camera.bottom = -H / 2;
    camera.updateProjectionMatrix();
    if (isStatic) render(2.0, { scrollP: 0, velocity: 0, visible: true }); // resizing clears the canvas
  }
  const ro = new ResizeObserver(layout);
  ro.observe(canvas);

  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true }
  );

  function render(timeSec, { scrollP = 0, velocity = 0, visible = true } = {}) {
    if (!visible) return;
    charge += (chargeTarget - charge) * 0.06;
    chargeTarget *= 0.985;
    vel += (Math.min(Math.abs(velocity), 3) - vel) * 0.08;
    pointer.x += (pointer.tx - pointer.x) * 0.045;
    pointer.y += (pointer.ty - pointer.y) * 0.045;
    spinKick *= 0.94;

    const narrow = W < 900;
    const s = (H / REF_H) * (narrow ? 0.62 : 1) * (1 + scrollP * 0.3 + charge * 0.02);
    const cx = (narrow ? 0.8 : CENTER.x) * W - pointer.x * 22 - scrollP * 0.07 * W;
    const cy = (narrow ? 1.12 : CENTER.y) * H - pointer.y * 12 - scrollP * 0.3 * H;
    group.scale.setScalar(s);
    group.position.set(cx - W / 2, H / 2 - cy, 0);
    group.rotation.z = Math.sin(timeSec * 0.11) * 0.006 + pointer.x * 0.012 + spinKick * 0.05 + vel * 0.004;

    for (let i = 0; i < bandMats.length; i++) {
      const u = bandMats[i].uniforms;
      u.uCharge.value = charge;
      u.uHead.value = (timeSec * (0.03 + i * 0.004) + i * 0.21) % 1;
    }
    // the comet sweeps from the right end to the left end, then rests for a moment
    const cycle = (timeSec % 9) / 9;
    cometMat.uniforms.uHeadPos.value = cycle * 1.5 - 0.2;
    renderer.render(scene, camera);
  }

  layout();

  return {
    render,
    /** brief burst of energy; used by the logo easter egg and CTA hover */
    pulse(amount = 1) {
      chargeTarget = Math.max(chargeTarget, amount);
      spinKick = 1;
    },
    setCharge(v) {
      chargeTarget = Math.max(chargeTarget, v);
    },
    /** reduced-motion mode: draw a single still frame and keep it on resize */
    setStatic(value = true) {
      isStatic = value;
      if (value) render(2.0, { scrollP: 0, velocity: 0, visible: true });
    },
    renderOnce(timeSec = 0) {
      render(timeSec, { scrollP: 0, velocity: 0, visible: true });
    },
    dispose() {
      ro.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    },
  };
}
