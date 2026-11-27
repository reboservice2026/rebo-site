// Resource preview: two textures cross-fade through a noise displacement field with an RGB split.
// Original shader written for this project.
import * as THREE from 'three';

const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uTex0;
  uniform sampler2D uTex1;
  uniform float uProgress;
  uniform float uTime;
  uniform float uRgb;
  uniform float uStrength;
  uniform float uTexAspect;
  uniform vec2 uRes;
  uniform vec2 uMouse;
  uniform float uHover;
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * vnoise(p);
      p = p * 2.03 + 17.1;
      a *= 0.5;
    }
    return v;
  }
  // cover-fit the texture inside the panel so it never stretches
  vec2 cover(vec2 uv) {
    float pa = uRes.x / max(uRes.y, 1.0);
    vec2 s = vec2(1.0);
    if (pa > uTexAspect) s.y = uTexAspect / pa; else s.x = pa / uTexAspect;
    return (uv - 0.5) * s + 0.5;
  }
  vec3 sampleSplit(sampler2D tex, vec2 uv, vec2 dir, float amt) {
    float r = texture(tex, uv + dir * amt).r;
    float g = texture(tex, uv).g;
    float b = texture(tex, uv - dir * amt).b;
    return vec3(r, g, b);
  }

  void main() {
    vec2 uv = cover(vUv);
    float p = clamp(uProgress, 0.0, 1.0);
    float mid = sin(p * 3.14159265);               // peaks halfway through a transition

    vec2 q = uv * 3.2 + vec2(0.0, uTime * 0.04);
    vec2 flow = vec2(fbm(q) - 0.5, fbm(q + 7.3) - 0.5);

    // pointer ripple
    vec2 toM = vUv - uMouse;
    float md = length(toM * vec2(uRes.x / max(uRes.y, 1.0), 1.0));
    vec2 ripple = normalize(toM + 1e-4) * exp(-md * 5.0) * 0.035 * uHover;

    vec2 disp = flow * uStrength * (0.15 + mid) + ripple;
    vec2 dir = normalize(vec2(0.8, 0.45));
    float split = uRgb * (0.2 + mid) * 0.02 + length(ripple) * 0.35;

    vec3 a = sampleSplit(uTex0, uv + disp * p, dir, split);
    vec3 b = sampleSplit(uTex1, uv - disp * (1.0 - p), dir, split);

    float k = smoothstep(0.0, 1.0, p);
    vec3 col = mix(a, b, k);
    float vign = smoothstep(1.15, 0.35, length(vUv - 0.5) * 1.25);
    col *= mix(0.82, 1.0, vign);

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createDistort(canvas, sources) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  const dpr = () => Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr());

  const textures = sources.map((src) => {
    const t = new THREE.CanvasTexture(src);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  });
  const count = textures.length;

  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uTex0: { value: textures[0] },
      uTex1: { value: textures[1] ?? textures[0] },
      uProgress: { value: 0 },
      uTime: { value: 0 },
      uRgb: { value: 1 },
      uStrength: { value: 0.22 },
      uTexAspect: { value: sources[0].width / sources[0].height },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uHover: { value: 0 },
    },
  });

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  let pairA = -1;
  let hoverTarget = 0;
  let vel = 0;
  let float = 0;
  let current = 0;

  function layout() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setPixelRatio(dpr());
    renderer.setSize(w, h, false);
    material.uniforms.uRes.value.set(w, h);
  }
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(canvas);

  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    material.uniforms.uMouse.value.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
    hoverTarget = 1;
  });
  canvas.addEventListener('pointerleave', () => (hoverTarget = 0));

  /** f in [0, count-1]: integer = fully showing that texture, fraction = transition toward the next */
  function setIndex(f) {
    float = Math.max(0, Math.min(count - 1, f));
    const a = Math.min(count - 2, Math.floor(float));
    const p = count === 1 ? 0 : float - a;
    if (a !== pairA) {
      pairA = a;
      material.uniforms.uTex0.value = textures[a];
      material.uniforms.uTex1.value = textures[Math.min(count - 1, a + 1)];
    }
    material.uniforms.uProgress.value = p;
    current = Math.round(float);
  }
  setIndex(0);

  return {
    setIndex,
    get index() {
      return current;
    },
    count,
    render(timeSec, velocity = 0) {
      vel += (Math.min(Math.abs(velocity), 3) - vel) * 0.1;
      const u = material.uniforms;
      u.uTime.value = timeSec;
      u.uRgb.value = 1 + vel * 1.4;
      u.uHover.value += (hoverTarget - u.uHover.value) * 0.08;
      renderer.render(scene, camera);
    },
    dispose() {
      ro.disconnect();
      textures.forEach((t) => t.dispose());
      material.dispose();
      mesh.geometry.dispose();
      renderer.dispose();
    },
  };
}
