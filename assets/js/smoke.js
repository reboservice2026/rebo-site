// Cursor smoke: a tiny 2D canvas of drifting orange puffs that CSS upscales, blurs and screen-blends
// over the page. Dots of the background grid light up wherever the smoke is.
// Technique observed on vault.hyperiux.com (low-res buffer + CSS blur); implementation is original.

const SCALE = 14; // 1 low-res pixel = 14 CSS pixels
const MAX_PUFFS = 720;
const GRID = 24; // must match the CSS dot grid (background-size: 24px)

export function createSmoke({ darkSelector = '.dark', heroSelector = '#hero' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'fx';
  wrap.setAttribute('aria-hidden', 'true');
  const smokeCanvas = document.createElement('canvas');
  smokeCanvas.className = 'fx-smoke';
  const dotsCanvas = document.createElement('canvas');
  dotsCanvas.className = 'fx-dots';
  wrap.append(smokeCanvas, dotsCanvas);
  document.body.appendChild(wrap);

  const sctx = smokeCanvas.getContext('2d', { willReadFrequently: true });
  const dctx = dotsCanvas.getContext('2d');
  const darkEls = Array.from(document.querySelectorAll(darkSelector));
  const heroEl = document.querySelector(heroSelector);

  // soft round sprite used for every puff
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 64;
  {
    const g = sprite.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,170,90,1)');
    grad.addColorStop(0.35, 'rgba(255,110,40,0.55)');
    grad.addColorStop(1, 'rgba(255,90,31,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }

  const puffs = [];
  let W = 1;
  let H = 1;
  let dpr = 1;
  let enabled = false;
  let last = null;
  let prevTime = 0;
  let shown = false;

  function resize() {
    W = Math.max(1, Math.ceil(window.innerWidth / SCALE));
    H = Math.max(1, Math.ceil(window.innerHeight / SCALE));
    smokeCanvas.width = W;
    smokeCanvas.height = H;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    dotsCanvas.width = Math.round(window.innerWidth * dpr);
    dotsCanvas.height = Math.round(window.innerHeight * dpr);
    puffs.length = 0;
  }
  resize();
  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  };
  window.addEventListener('resize', onResize);

  function spawn(x, y, vx, vy, speed) {
    if (puffs.length >= MAX_PUFFS) puffs.splice(0, 24);
    const s = Math.min(speed, 3);
    puffs.push({
      x: x / SCALE + (Math.random() - 0.5) * 1.4,
      y: y / SCALE + (Math.random() - 0.5) * 1.4,
      vx: vx * 0.3 + (Math.random() - 0.5) * 0.16, // css px/ms -> low-res px/frame, damped
      vy: vy * 0.3 + (Math.random() - 0.5) * 0.16,
      r: 3.4 + s * 0.9 + Math.random() * 1.3,
      a0: 0.3 + Math.min(speed, 2) * 0.09,
      life: 1,
      decay: 0.3 + Math.random() * 0.22, // per second -> roughly 2–3.3 s
    });
  }

  function onMove(e) {
    if (!enabled || e.pointerType === 'touch') return;
    // light sections: screen-blending would tint dark text, so no smoke there
    if (e.target instanceof Element && e.target.closest('.light')) {
      last = null;
      return;
    }
    const x = e.clientX;
    const y = e.clientY;
    const now = performance.now();
    if (last) {
      const dx = x - last.x;
      const dy = y - last.y;
      const dist = Math.hypot(dx, dy);
      const dt = Math.max(1, now - last.t);
      const speed = dist / dt;
      const steps = Math.min(40, Math.max(1, Math.ceil(dist / (SCALE * 0.7))));
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        spawn(last.x + dx * k, last.y + dy * k, dx / dt, dy / dt, speed);
      }
    } else {
      spawn(x, y, 0, 0, 0);
    }
    last = { x, y, t: now };
  }
  window.addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', () => (last = null));

  function show(v) {
    if (shown === v) return;
    shown = v;
    const vis = v ? 'visible' : 'hidden';
    smokeCanvas.style.visibility = vis;
    dotsCanvas.style.visibility = vis;
  }

  function drawDots() {
    const data = sctx.getImageData(0, 0, W, H).data;
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, dotsCanvas.width, dotsCanvas.height);
    dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dctx.fillStyle = 'rgb(255,214,160)';

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const el of darkEls) {
      const r = el.getBoundingClientRect();
      let bottom = Math.min(r.bottom, vh);
      // the hero stays pinned behind the next sections: only its still-visible part counts
      if (el === heroEl) bottom = Math.min(bottom, vh - window.scrollY);
      const top = Math.max(r.top, 0);
      if (bottom <= top) continue;
      const jStart = Math.ceil((top - r.top - GRID / 2) / GRID);
      for (let y = r.top + GRID / 2 + jStart * GRID; y < bottom; y += GRID) {
        const row = Math.min(H - 1, Math.max(0, (y / SCALE) | 0)) * W;
        const iStart = Math.ceil((0 - r.left - GRID / 2) / GRID);
        for (let x = r.left + GRID / 2 + iStart * GRID; x < vw; x += GRID) {
          const col = Math.min(W - 1, Math.max(0, (x / SCALE) | 0));
          const a = data[(row + col) * 4 + 3] / 255;
          if (a < 0.06) continue;
          dctx.globalAlpha = Math.min(1, (a - 0.06) * 1.9) * 0.9;
          dctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
        }
      }
    }
    dctx.globalAlpha = 1;
  }

  function render(timeSec) {
    const dt = Math.min(0.05, Math.max(0, timeSec - prevTime));
    prevTime = timeSec;
    if (!puffs.length) {
      if (shown) {
        sctx.clearRect(0, 0, W, H);
        dctx.setTransform(1, 0, 0, 1, 0, 0);
        dctx.clearRect(0, 0, dotsCanvas.width, dotsCanvas.height);
        show(false);
      }
      return;
    }
    show(true);
    const k = dt * 60;
    sctx.clearRect(0, 0, W, H);
    sctx.globalCompositeOperation = 'lighter';
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) {
        puffs[i] = puffs[puffs.length - 1];
        puffs.pop();
        continue;
      }
      // swirly, slowly changing flow field + a touch of buoyancy
      const ang = Math.sin(p.x * 0.23 + timeSec * 0.7) * Math.cos(p.y * 0.19 - timeSec * 0.5) * 6.2832;
      p.vx += Math.cos(ang) * 0.012 * k;
      p.vy += (Math.sin(ang) * 0.012 - 0.0012) * k;
      const damp = 1 - 0.05 * k;
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * k;
      p.y += p.vy * k;
      p.r += 0.012 * k;
      sctx.globalAlpha = p.a0 * p.life * p.life;
      const d = p.r * 2;
      sctx.drawImage(sprite, p.x - p.r, p.y - p.r, d, d);
    }
    sctx.globalAlpha = 1;
    sctx.globalCompositeOperation = 'source-over';
    drawDots();
  }

  return {
    render,
    setEnabled(v) {
      enabled = v;
      if (!v) last = null;
    },
    get count() {
      return puffs.length;
    },
    dispose() {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pointermove', onMove);
      wrap.remove();
    },
  };
}
