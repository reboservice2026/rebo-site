// Hero scene: concentric twisting ribbons rendered with plain three.js + custom GLSL.
// All geometry and shaders here are original to this project.
import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float aT;
  attribute float aS;
  uniform float uTime;
  uniform float uVel;
  uniform float uCharge;
  varying float vT;
  varying float vS;
  varying vec3 vN;
  varying vec3 vV;

  void main() {
    vT = aT;
    vS = aS;
    vec3 p = position;
    // gentle ripple that gets stronger with scroll velocity and charge
    float amp = 0.035 + uVel * 0.05 + uCharge * 0.06;
    p += normal * sin(aT * 18.0 + uTime * 1.3) * amp;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normal);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform float uHead;
  uniform float uCharge;
  uniform float uSeed;
  uniform float uAlpha;
  uniform vec3 uBody;
  uniform vec3 uMid;
  uniform vec3 uHot;
  uniform vec3 uWhite;
  varying float vT;
  varying float vS;
  varying vec3 vN;
  varying vec3 vV;

  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(vV);
    float fres = pow(1.0 - abs(dot(N, V)), 2.0);

    float edgeHi = smoothstep(0.76, 1.0, vS);        // bright rim on the +side
    float edgeLo = smoothstep(0.80, 1.0, -vS) * 0.6; // warm rim on the -side

    vec3 col = mix(uBody, uMid, smoothstep(-1.0, 1.0, vS) * 0.6 + fres * 0.4);
    col = mix(col, uHot, edgeLo + fres * 0.22);
    col = mix(col, uWhite, edgeHi);

    // fine lengthwise stripes
    float stripe = smoothstep(0.44, 0.5, abs(fract(vS * 3.0 + uSeed) - 0.5)) * 0.07;
    col += stripe;

    // travelling highlight along the ribbon
    float d = abs(fract(vT - uHead + 0.5) - 0.5);
    float head = exp(-d * d * (950.0 - uCharge * 520.0));
    col += (uHot * 0.8 + uWhite * 0.25) * head * (0.55 + uCharge * 1.5);

    float alpha = smoothstep(0.0, 0.07, vT) * smoothstep(1.0, 0.93, vT) * uAlpha;
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function buildRibbon(cfg) {
  const n = cfg.segments ?? 280;
  const pos = new Float32Array((n + 1) * 2 * 3);
  const nor = new Float32Array((n + 1) * 2 * 3);
  const aT = new Float32Array((n + 1) * 2);
  const aS = new Float32Array((n + 1) * 2);
  const index = [];

  const z = new THREE.Vector3(0, 0, 1);
  const radial = new THREE.Vector3();
  const width = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();

  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = cfg.a0 + t * cfg.span;
    const R = cfg.R + Math.sin(t * Math.PI * 2 * cfg.rk + cfg.seed) * cfg.rv;
    const zc = Math.sin(t * Math.PI * 2 * cfg.zk + cfg.seed * 1.7) * cfg.zw;
    const twist = Math.sin(t * Math.PI * cfg.tk + cfg.seed) * cfg.tw;
    const w = cfg.w * (0.78 + 0.22 * Math.sin(t * Math.PI * 2 * cfg.wk + cfg.seed * 2.3) + 0.12);

    radial.set(Math.cos(a), Math.sin(a), 0);
    width.copy(radial).multiplyScalar(Math.cos(twist)).addScaledVector(z, Math.sin(twist)).normalize();
    tangent.set(-Math.sin(a), Math.cos(a), 0);
    normal.crossVectors(tangent, width).normalize();

    const cx = radial.x * R;
    const cy = radial.y * R;
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1;
      const j = i * 2 + k;
      pos[j * 3] = cx + width.x * w * s * 0.5;
      pos[j * 3 + 1] = cy + width.y * w * s * 0.5;
      pos[j * 3 + 2] = zc + width.z * w * s * 0.5;
      nor[j * 3] = normal.x;
      nor[j * 3 + 1] = normal.y;
      nor[j * 3 + 2] = normal.z;
      aT[j] = t;
      aS[j] = s;
    }
    if (i < n) {
      const a0 = i * 2;
      index.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  return geo;
}

export function createRibbons(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const group = new THREE.Group();
  scene.add(group);

  const palette = {
    body: new THREE.Color('#1a0905'),
    mid: new THREE.Color('#4d1a0a'),
    hot: new THREE.Color('#ff5a1f'),
    white: new THREE.Color('#fff1e6'),
  };

  const widths = [0.26, 0.52, 0.22, 0.64, 0.3, 0.46, 0.2];
  const materials = [];
  widths.forEach((w, i) => {
    const geo = buildRibbon({
      R: 2.1 + i * 0.42,
      w,
      a0: -0.55 + i * 0.035,
      span: 3.7 + (i % 3) * 0.28,
      rk: 1.4,
      rv: 0.09,
      zk: 1.2,
      zw: 0.32,
      tk: 3.2 + (i % 2),
      tw: 0.95 + (i % 2) * 0.45,
      wk: 1.6,
      seed: i * 1.31,
    });
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uVel: { value: 0 },
        uCharge: { value: 0 },
        uHead: { value: 0 },
        uSeed: { value: i * 0.37 },
        uAlpha: { value: 0.96 },
        uBody: { value: palette.body },
        uMid: { value: palette.mid },
        uHot: { value: palette.hot },
        uWhite: { value: palette.white },
      },
    });
    materials.push(mat);
    group.add(new THREE.Mesh(geo, mat));
  });

  // state
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let charge = 0;
  let chargeTarget = 0;
  let vel = 0;
  let narrow = false;
  let spinKick = 0;
  let isStatic = false;

  function layout() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    narrow = w < 900;
    if (isStatic) render(2.0, { scrollP: 0, velocity: 0, visible: true }); // resizing clears the canvas
  }
  layout();
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
    chargeTarget *= 0.985; // pulse() decays on its own
    vel += (Math.min(Math.abs(velocity), 3) - vel) * 0.08;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    spinKick *= 0.94;

    const base = narrow ? 0.5 : 0.88;
    const scale = base * (1 + scrollP * 0.4);
    group.scale.setScalar(scale);
    group.position.set((narrow ? 0.6 : 3.2) - scrollP * 1.2, (narrow ? 0.9 : -1.5) + scrollP * 0.8, 0);
    group.rotation.set(pointer.y * 0.16 - scrollP * 0.15, pointer.x * 0.28, -scrollP * 0.55 + spinKick * 0.6);

    materials.forEach((m, i) => {
      const u = m.uniforms;
      u.uTime.value = timeSec;
      u.uVel.value = vel;
      u.uCharge.value = charge;
      u.uHead.value = (timeSec * (0.035 + i * 0.006) + i * 0.17) % 1;
    });
    renderer.render(scene, camera);
  }

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
      materials.forEach((m) => m.dispose());
      group.children.forEach((c) => c.geometry.dispose());
      renderer.dispose();
    },
  };
}
