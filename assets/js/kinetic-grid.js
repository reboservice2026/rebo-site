// Kinetic grid background — a vanilla-JS port of the "KineticGrid" canvas component:
// a grid that warps toward the pointer, lights up the nodes near it and sends a ripple through on every click.
// Re-Bo tweaks: orange theme, transparent canvas (the page paints the colour), device-pixel-ratio aware,
// no fly-in from off-screen on the first mouse move, fade-out when the pointer leaves, and it sleeps when nothing moves.

const CELL_SIZE = 55; // grid cell, CSS px
const INFLUENCE_RADIUS = 260;
const MAX_WARP = 24;
const DOT_SPACING = 28;
const LERP_SPEED = 0.08;
const NODE_BASE_RADIUS = 1.8;
const NODE_ACTIVE_RADIUS = 3.2;
const TAU = Math.PI * 2;

const LINE_BASE = { r: 255, g: 255, b: 255, a: 0.09 };
const NODE_BASE = { r: 255, g: 255, b: 255, a: 0.16 };
const THEME = {
  lineActive: { r: 255, g: 112, b: 40, a: 0.9 },
  nodeActive: { r: 255, g: 156, b: 86, a: 1.0 },
  glow: '255,112,40',
  ripple: '255,150,90',
};

const lerpN = (a, b, t) => a + (b - a) * t;
const lerpColor = (base, active, t) =>
  `rgba(${Math.round(lerpN(base.r, active.r, t))},${Math.round(lerpN(base.g, active.g, t))},${Math.round(
    lerpN(base.b, active.b, t)
  )},${lerpN(base.a, active.a, t).toFixed(3)})`;

/**
 * @param {{ interactive?: boolean, ripples?: boolean }} options
 *   interactive: warp + glow follow the pointer (mouse / pen). ripples: clicks send a wave.
 */
export function createKineticGrid({ interactive = true, ripples: rippleOn = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'kgrid';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  document.documentElement.classList.add('has-grid');
  const ctx = canvas.getContext('2d');

  const dotLayer = document.createElement('canvas'); // static dot texture, drawn once per resize
  const dotCtx = dotLayer.getContext('2d');

  let W = 0;
  let H = 0;
  let dpr = 1;
  let cols = 0;
  let rows = 0;
  let xs = new Float32Array(0); // warped point positions
  let ys = new Float32Array(0);
  let prox = new Float32Array(0); // 0..1 pointer proximity per point

  const mouse = { x: 0, y: 0 }; // smoothed pointer
  const target = { x: 0, y: 0 };
  let influence = 0; // eased 0..1 so the effect fades in/out instead of snapping
  let influenceTarget = 0;
  let hasPointer = false;
  const ripples = [];
  let dirty = true;
  let raf = 0;
  let alive = true;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);

    cols = Math.max(2, Math.ceil(W / CELL_SIZE)) + 1;
    rows = Math.max(2, Math.ceil(H / CELL_SIZE)) + 1;
    xs = new Float32Array(cols * rows);
    ys = new Float32Array(cols * rows);
    prox = new Float32Array(cols * rows);

    dotLayer.width = canvas.width;
    dotLayer.height = canvas.height;
    dotCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dotCtx.clearRect(0, 0, W, H);
    dotCtx.fillStyle = 'rgba(255,255,255,0.06)';
    dotCtx.beginPath();
    for (let x = DOT_SPACING / 2; x < W; x += DOT_SPACING) {
      for (let y = DOT_SPACING / 2; y < H; y += DOT_SPACING) {
        dotCtx.moveTo(x + 0.7, y);
        dotCtx.arc(x, y, 0.7, 0, TAU);
      }
    }
    dotCtx.fill();
    dirty = true;
    wake();
  }

  // ── warp ────────────────────────────────────────────────────────────────────
  function computePoints(now) {
    const cellW = W / (cols - 1);
    const cellH = H / (rows - 1);
    const edgeMargin = 1.5;
    const mx = mouse.x;
    const my = mouse.y;
    const infl = influence;

    for (let row = 0; row < rows; row++) {
      const rowPin = Math.min(row / edgeMargin, (rows - 1 - row) / edgeMargin, 1);
      for (let col = 0; col < cols; col++) {
        const i = row * cols + col;
        const gx = col * cellW;
        const gy = row * cellH;
        // edge pin: the border rows/columns stay put
        const colPin = Math.min(col / edgeMargin, (cols - 1 - col) / edgeMargin, 1);
        const pinFactor = colPin * colPin * rowPin * rowPin;

        const dx = gx - mx;
        const dy = gy - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const proximity = Math.max(0, 1 - dist / INFLUENCE_RADIUS) * pinFactor * infl;

        // ripple displacement
        let rx = 0;
        let ry = 0;
        for (let k = 0; k < ripples.length; k++) {
          const r = ripples[k];
          const rdx = gx - r.x;
          const rdy = gy - r.y;
          const rdist = Math.sqrt(rdx * rdx + rdy * rdy);
          const diff = rdist - r.radius;
          if (Math.abs(diff) < 55) {
            const strength = (1 - Math.abs(diff) / 55) * r.opacity * 18 * pinFactor;
            const angle = Math.atan2(rdy, rdx);
            const sign = diff < 0 ? -1 : 1;
            rx += Math.cos(angle) * strength * sign * -1;
            ry += Math.sin(angle) * strength * sign * -1;
          }
        }

        let px = gx + rx;
        let py = gy + ry;
        // cursor warp with a bell falloff
        if (dist < INFLUENCE_RADIUS && dist > 0 && pinFactor > 0 && infl > 0) {
          const t = dist / INFLUENCE_RADIUS;
          const eased = t < 0.01 ? 0 : (1 - t) * (1 - t) * Math.min(1, dist / 60);
          const warp = eased * MAX_WARP * pinFactor * infl;
          const angle = Math.atan2(dy, dx);
          px = gx - Math.cos(angle) * warp + rx;
          py = gy - Math.sin(angle) * warp + ry;
        }
        xs[i] = px;
        ys[i] = py;
        prox[i] = proximity;
      }
    }
    return now;
  }

  // ── draw ────────────────────────────────────────────────────────────────────
  function draw(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(dotLayer, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      const age = (now - r.born) / 1000;
      r.radius = Math.max(0, age * 400);
      r.opacity = Math.max(0, 1 - age * 1.2);
      if (r.opacity <= 0) ripples.splice(i, 1);
    }

    computePoints(now);

    // grid lines: untouched segments are batched into one path, lit ones are styled individually
    ctx.lineCap = 'butt';
    const lit = [];
    ctx.beginPath();
    const seg = (a, b) => {
      const avg = (prox[a] + prox[b]) / 2;
      if (avg < 0.003) {
        ctx.moveTo(xs[a], ys[a]);
        ctx.lineTo(xs[b], ys[b]);
      } else {
        lit.push(a, b, avg);
      }
    };
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols - 1; col++) seg(row * cols + col, row * cols + col + 1);
    for (let col = 0; col < cols; col++) for (let row = 0; row < rows - 1; row++) seg(row * cols + col, (row + 1) * cols + col);
    ctx.strokeStyle = lerpColor(LINE_BASE, LINE_BASE, 0);
    ctx.lineWidth = 0.8;
    ctx.stroke();
    for (let k = 0; k < lit.length; k += 3) {
      const a = lit[k];
      const b = lit[k + 1];
      const avg = lit[k + 2];
      const t = avg * avg * (3 - 2 * avg);
      ctx.beginPath();
      ctx.moveTo(xs[a], ys[a]);
      ctx.lineTo(xs[b], ys[b]);
      ctx.strokeStyle = lerpColor(LINE_BASE, THEME.lineActive, t);
      ctx.lineWidth = lerpN(0.8, 1.5, t);
      ctx.stroke();
    }

    // intersection nodes
    ctx.fillStyle = `rgba(${NODE_BASE.r},${NODE_BASE.g},${NODE_BASE.b},${NODE_BASE.a})`;
    ctx.beginPath();
    for (let i = 0; i < cols * rows; i++) {
      if (prox[i] >= 0.003) continue;
      ctx.moveTo(xs[i] + NODE_BASE_RADIUS, ys[i]);
      ctx.arc(xs[i], ys[i], NODE_BASE_RADIUS, 0, TAU);
    }
    ctx.fill();
    for (let i = 0; i < cols * rows; i++) {
      const pr = prox[i];
      if (pr < 0.003) continue;
      const t = pr * pr * (3 - 2 * pr);
      const r = lerpN(NODE_BASE_RADIUS, NODE_ACTIVE_RADIUS, t);
      const x = xs[i];
      const y = ys[i];
      if (t > 0.3) {
        const glowR = r + lerpN(0, 6, (t - 0.3) / 0.7);
        const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, glowR);
        grd.addColorStop(0, `rgba(${THEME.glow},${(t * 0.3).toFixed(3)})`);
        grd.addColorStop(1, `rgba(${THEME.glow},0)`);
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, TAU);
        ctx.fillStyle = grd;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = lerpColor(NODE_BASE, THEME.nodeActive, t);
      ctx.fill();
    }

    // ripple rings
    for (const r of ripples) {
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(0, r.radius), 0, TAU);
      ctx.strokeStyle = `rgba(${THEME.ripple},${(r.opacity * 0.28).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ── loop (sleeps when nothing is moving) ────────────────────────────────────
  function frame(now) {
    raf = 0;
    if (!alive) return;
    mouse.x = lerpN(mouse.x, target.x, LERP_SPEED);
    mouse.y = lerpN(mouse.y, target.y, LERP_SPEED);
    influence = lerpN(influence, influenceTarget, 0.1);
    if (Math.abs(influence - influenceTarget) < 0.002) influence = influenceTarget;

    draw(now);

    const moving =
      dirty ||
      ripples.length > 0 ||
      influence !== influenceTarget ||
      (influence > 0 && (Math.abs(mouse.x - target.x) > 0.3 || Math.abs(mouse.y - target.y) > 0.3));
    dirty = false;
    if (moving) raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (!raf && alive) raf = requestAnimationFrame(frame);
  }

  // ── input ───────────────────────────────────────────────────────────────────
  const onMove = (e) => {
    if (!interactive || e.pointerType === 'touch') return;
    target.x = e.clientX;
    target.y = e.clientY;
    if (!hasPointer) {
      mouse.x = target.x; // snap on the first move so the warp doesn't fly in from off-screen
      mouse.y = target.y;
      hasPointer = true;
    }
    influenceTarget = 1;
    wake();
  };
  const onLeave = () => {
    influenceTarget = 0;
    wake();
  };
  const onClick = (e) => {
    if (!rippleOn) return;
    ripples.push({ x: e.clientX, y: e.clientY, radius: 0, opacity: 1, born: performance.now() });
    wake();
  };
  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 100);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  window.addEventListener('blur', onLeave);
  window.addEventListener('click', onClick);
  window.addEventListener('resize', onResize);
  resize();

  return {
    /** programmatic ripple (e.g. the logo easter egg) */
    ripple(x, y) {
      if (!rippleOn) return;
      ripples.push({ x, y, radius: 0, opacity: 1, born: performance.now() });
      wake();
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      window.removeEventListener('click', onClick);
      window.removeEventListener('resize', onResize);
      canvas.remove();
      document.documentElement.classList.remove('has-grid');
    },
  };
}
