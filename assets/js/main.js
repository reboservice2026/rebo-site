// Re-Bo showcase — orchestration. three.js scenes are loaded lazily so a blocked CDN
// degrades to a plain (still readable) page instead of a blank screen.
import { initAudio, startAmbient, setMuted, isMuted, blip } from './audio.js';
import { splitWords, prepareScramble, scramble } from './text-fx.js';
import { drawResourceTextures } from './art.js';
import { createSmoke } from './smoke.js';

const $ =(sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const html = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;

if (!(window.gsap && window.ScrollTrigger && window.Lenis) || html.classList.contains('failsafe')) {
  // either a library is missing, or the libraries arrived after the fail-safe timer fired:
  // stay in plain mode so the page is never half-initialised (locked scroll, hidden title)
  console.warn('[rebo] animation libraries unavailable or late — showing plain content');
  html.classList.remove('js');
  html.classList.add('failsafe', 'no-webgl');
  window.__REBO_READY__ = true;
  plainPreview();
} else {
  boot();
}

// Plain mode: still show the drawn resource cards (as images) and let the tabs switch them.
async function plainPreview() {
  try {
    const cards = await drawResourceTextures();
    const urls = cards.map((c) => c.toDataURL('image/jpeg', 0.84));
    const img = document.createElement('img');
    img.className = 'distort-fallback';
    img.alt = '資源預覽';
    img.src = urls[0];
    $('#distort-canvas')?.replaceWith(img);
    const tabs = $$('.tabs button');
    tabs.forEach((b, k) =>
      b.addEventListener('click', () => {
        img.src = urls[k];
        tabs.forEach((x) => x.classList.toggle('on', x === b));
        $('#distort-label').textContent = `Resource Preview · ${String(k + 1).padStart(2, '0')} / 04`;
      })
    );
  } catch (_) {
    /* leave the empty frame; the rest of the page is unaffected */
  }
}

function boot() {
  gsap.registerPlugin(ScrollTrigger);
  window.__REBO_READY__ = true;

  const S = { vel: 0, entered: false, sound: false, stageOn: false };
  let hero = null;
  let distort = null;
  let lenis = null;
  // cursor smoke: pointer devices only, and not when the visitor asked for less motion
  const smoke = !coarse && !reduce ? createSmoke() : null;

  // initial states for the intro (set from JS: gsap strips inline transforms at identity,
  // which would otherwise let a stylesheet transform take over again)
  if (!reduce) {
    gsap.set('.hero-title .line > span', { yPercent: 112 });
    gsap.set('.nav', { y: -12 });
  }

  /* ───────── smooth scroll ───────── */
  if (!reduce) {
    lenis = new Lenis({ lerp: 0.1 });
    lenis.on('scroll', (e) => {
      ScrollTrigger.update();
      S.vel = (e.velocity || 0) / 25;
    });
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    lenis.stop();
  } else {
    document.body.style.overflow = 'hidden';
  }

  /* ───────── WebGL scenes (lazy) ───────── */
  function webglOk() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2');
      if (!gl) return false;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      if (/swiftshader|llvmpipe|software|basic render/i.test(name)) {
        window.__REBO_SOFTWARE_GL__ = true;
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  const gpu = webglOk();
  let fallbackCards = null;

  async function initHero() {
    if (!gpu) return html.classList.add('no-webgl');
    try {
      const mod = await import('./ribbons.js');
      hero = mod.createRibbons($('#hero-canvas'));
      if (reduce) hero.setStatic(true); // one still frame, re-drawn only on resize
    } catch (err) {
      console.warn('[rebo] hero scene unavailable', err);
      html.classList.add('no-webgl');
    }
  }

  async function initDistort() {
    const cards = await drawResourceTextures();
    if (gpu) {
      try {
        const mod = await import('./distort.js');
        distort = mod.createDistort($('#distort-canvas'), cards);
        return;
      } catch (err) {
        console.warn('[rebo] preview scene unavailable', err);
      }
    }
    // 2D fallback: show the drawn cards as plain images
    fallbackCards = cards.map((c) => c.toDataURL('image/jpeg', 0.84));
    const img = document.createElement('img');
    img.className = 'distort-fallback';
    img.alt = '資源預覽';
    img.src = fallbackCards[0];
    $('#distort-canvas').replaceWith(img);
  }

  const scenesReady = Promise.allSettled([initHero(), initDistort()]);

  /* ───────── loader ───────── */
  const rings = initRings($('#loader-rings'));
  const counter = $('#loader-count');
  const actions = $('#loader-actions');
  const o = { v: 0 };
  gsap.to(o, {
    v: 100,
    duration: reduce ? 0.01 : 2.4,
    ease: 'power2.inOut',
    onUpdate() {
      counter.textContent = String(Math.round(o.v)).padStart(3, '0');
      rings.setProgress(o.v / 100);
    },
    onComplete() {
      actions.classList.add('show');
      $('#enter-sound')?.focus({ preventScroll: true });
    },
  });
  $('#enter-sound').addEventListener('click', () => enter(true));
  $('#enter-mute').addEventListener('click', () => enter(false));

  async function enter(withSound) {
    if (S.entered) return;
    S.entered = true;
    actions.classList.remove('show');
    if (withSound) {
      await initAudio();
      startAmbient();
      S.sound = true;
      syncSound();
    }
    await Promise.race([scenesReady, new Promise((r) => setTimeout(r, 4500))]);
    gsap.to('#loader', {
      yPercent: -100,
      duration: reduce ? 0.01 : 1.1,
      ease: 'power4.inOut',
      onComplete() {
        rings.stop();
        $('#loader').remove();
        document.body.style.overflow = '';
        lenis?.start();
        ScrollTrigger.refresh();
      },
    });
    intro();
    smoke?.setEnabled(true);
  }

  function intro() {
    if (reduce) {
      gsap.set('.hero-title .line > span', { yPercent: 0 });
      gsap.set(['.hero-side', '.eyebrow', '.marquee', '.nav'], { opacity: 1, y: 0 });
      return;
    }
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' }, delay: 0.5 });
    tl.fromTo('.hero-title .line > span', { yPercent: 112 }, { yPercent: 0, duration: 1.3, stagger: 0.12 }, 0)
      .to('.eyebrow', { opacity: 1, duration: 0.9 }, 0.2)
      .to('.hero-side', { opacity: 1, duration: 1 }, 0.55)
      .to('.marquee', { opacity: 1, duration: 1 }, 0.8)
      .to('.nav', { opacity: 1, y: 0, duration: 0.9 }, 0.4);
  }

  /* ───────── sound toggle ───────── */
  function syncSound() {
    $('#sound-btn').setAttribute('aria-pressed', String(S.sound && !isMuted()));
  }
  $('#sound-btn').addEventListener('click', async () => {
    if (!S.sound) {
      await initAudio();
      startAmbient();
      S.sound = true;
    } else {
      setMuted(!isMuted());
    }
    syncSound();
  });

  /* ───────── anchors, logo easter egg, cursor, progress ───────── */
  $$('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      const target = $(id);
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { duration: 1.6 });
      else target.scrollIntoView();
      blip(660);
    });
  });

  $('#logo').addEventListener('click', () => {
    hero?.pulse(1);
    blip(520, 0.12);
    gsap.fromTo('#logo svg', { rotate: 0 }, { rotate: 360, duration: 0.9, ease: 'power3.out' });
  });
  $$('.hero-cta .btn, .nav-right .btn').forEach((b) => {
    b.addEventListener('pointerenter', () => hero?.setCharge(0.55));
  });

  if (!coarse && !reduce) {
    const ring = $('#cursor');
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    window.addEventListener('pointermove', (e) => {
      tx = e.clientX;
      ty = e.clientY;
      ring.classList.add('on');
    }, { passive: true });
    document.addEventListener('pointerleave', () => ring.classList.remove('on'));
    document.addEventListener('pointerover', (e) => {
      ring.classList.toggle('hot', !!e.target.closest('a, button, summary, input, [data-tilt]'));
    });
    gsap.ticker.add(() => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      ring.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    });
  }

  const bar = $('#progress-bar');
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate(self) {
      bar.style.transform = `translateY(${self.progress * (innerHeight - bar.offsetHeight)}px)`;
    },
  });

  /* ───────── render loop ───────── */
  gsap.ticker.add((time) => {
    S.vel *= 0.92;
    const sy = window.scrollY;
    const vh = innerHeight;
    if (!reduce) {
      hero?.render(time, {
        scrollP: Math.min(1, sy / vh),
        velocity: S.vel,
        visible: sy < vh * 1.05 && !document.hidden,
      });
    }
    if (distort && S.stageOn) distort.render(reduce ? 0 : time, S.vel);
    smoke?.render(time);
  });
  new IntersectionObserver(([e]) => (S.stageOn = e.isIntersecting), { rootMargin: '120px' }).observe($('#stage'));

  /* ───────── hero scroll ───────── */
  if (!reduce) {
    gsap.to('.hero-grid', {
      yPercent: -10,
      opacity: 0.25,
      ease: 'none',
      scrollTrigger: { trigger: '#what', start: 'top bottom', end: 'top 15%', scrub: true },
    });
  }

  /* ───────── stage: sticky switcher ───────── */
  const items = $$('.stage-list li');
  const panels = $$('.panel');
  const tabs = $$('.tabs button');
  const label = $('#distort-label');
  let stageST = null;
  let curPanel = 0;
  let curTab = -1;

  function setPanel(i) {
    if (i === curPanel) return;
    curPanel = i;
    items.forEach((el, k) => el.classList.toggle('on', k === i));
    panels.forEach((el, k) => el.classList.toggle('is-active', k === i));
    blip(520 + i * 120);
    if (i === 1) playTerminal();
  }

  function setTab(i) {
    if (i === curTab) return;
    curTab = i;
    tabs.forEach((el, k) => el.classList.toggle('on', k === i));
    label.textContent = `Resource Preview · ${String(i + 1).padStart(2, '0')} / 04`;
  }

  function showCard(i) {
    const img = $('.distort-fallback');
    if (img && fallbackCards) img.src = fallbackCards[i];
    setTab(i);
  }

  let termTl = null;
  function playTerminal() {
    const lines = $$('#term .l');
    termTl?.kill();
    if (reduce) return gsap.set(lines, { opacity: 1 });
    gsap.set(lines, { opacity: 0 });
    termTl = gsap.timeline();
    lines.forEach((l, i) => termTl.to(l, { opacity: 1, duration: 0.05 }, 0.25 + i * 0.42));
  }

  const mm = gsap.matchMedia();
  mm.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
    html.classList.add('pinned-stage');
    stageST = ScrollTrigger.create({
      trigger: '#stage',
      start: 'top top',
      end: '+=380%',
      pin: true,
      onUpdate(self) {
        const p = self.progress;
        setPanel(Math.min(3, Math.floor(p * 4)));
        const f = Math.min(3, ((p * 4) / 0.92) * 3);
        if (distort) distort.setIndex(f);
        setTab(Math.round(f));
      },
    });
    const jump = (p) => {
      const y = stageST.start + p * (stageST.end - stageST.start);
      if (lenis) lenis.scrollTo(y, { duration: 1.4 });
      else window.scrollTo(0, y);
    };
    const offs = [];
    items.forEach((li, k) => {
      const fn = () => jump(k === 0 ? 0.001 : k / 4 + 0.04);
      li.addEventListener('click', fn);
      offs.push(() => li.removeEventListener('click', fn));
    });
    tabs.forEach((t, k) => {
      const fn = () => jump(((k / 3) * 0.92) / 4 + 0.001);
      t.addEventListener('click', fn);
      offs.push(() => t.removeEventListener('click', fn));
    });
    return () => {
      html.classList.remove('pinned-stage');
      offs.forEach((f) => f());
      stageST?.kill();
      stageST = null;
    };
  });
  mm.add('(max-width: 900px), (prefers-reduced-motion: reduce)', () => {
    // stacked layout: all panels visible; preview auto-cycles while on screen
    panels.forEach((el) => el.classList.add('is-active'));
    const state = { v: 0 };
    let idx = 0;
    const goTo = (k) => {
      idx = k;
      gsap.to(state, {
        v: k,
        duration: reduce ? 0.01 : 1.1,
        ease: 'power2.inOut',
        overwrite: true,
        onUpdate() {
          distort?.setIndex(state.v);
        },
        onComplete: () => showCard(k),
      });
      showCard(k);
    };
    const offs = [];
    tabs.forEach((t, k) => {
      const fn = () => goTo(k);
      t.addEventListener('click', fn);
      offs.push(() => t.removeEventListener('click', fn));
    });
    let timer = null;
    const vis = new IntersectionObserver(([e]) => {
      clearInterval(timer);
      if (e.isIntersecting && !reduce) timer = setInterval(() => goTo((idx + 1) % 4), 3200);
    });
    vis.observe($('.distort'));
    const termST = ScrollTrigger.create({ trigger: '#term', start: 'top 80%', once: true, onEnter: playTerminal });
    return () => {
      clearInterval(timer);
      vis.disconnect();
      termST.kill();
      offs.forEach((f) => f());
      panels.forEach((el, k) => el.classList.toggle('is-active', k === curPanel));
    };
  });

  /* ───────── calculator ───────── */
  setupCalc();
  function setupCalc() {
    const ref = $('#in-ref');
    const days = $('#in-days');
    const rent = $('#in-rent');
    const segs = $$('.seg button');
    const out = { day: $('#o-day'), total: $('#o-total'), dep: $('#o-deposit'), late: $('#o-late'), max: $('#o-max') };
    const vals = { ref: $('#v-ref'), days: $('#v-days'), rent: $('#v-rent') };
    const nf = (n) => Math.round(n).toLocaleString('en-US');
    const shown = { day: 0, total: 0, dep: 0, late: 0 };
    let kind = 'general';

    function fill(el) {
      const p = ((el.value - el.min) / (el.max - el.min || 1)) * 100;
      el.style.setProperty('--p', `${p}%`);
    }

    function compute(animate = true) {
      const R = +ref.value;
      const maxDays = kind === 'big' ? 30 : 14;
      days.max = maxDays;
      if (+days.value > maxDays) days.value = maxDays;
      const D = +days.value;
      const dayCap = R * 0.1; // 日租 ≤ 參考價值 10%
      rent.max = Math.max(0, Math.floor(dayCap / 10) * 10);
      if (+rent.value > +rent.max) rent.value = rent.max;
      const r = +rent.value;
      const valuable = R >= 5000;
      const target = {
        day: dayCap,
        total: Math.min(r * D, R * 0.5), // 單次總額 ≤ 50%
        dep: Math.min(R * 0.3, valuable ? 3000 : 1000), // 押金 ≤ 30%，一般 1,000／貴重 3,000
        late: r > 0 ? r * 1.5 : valuable ? 100 : 50, // 日租 ×1.5；免費出借 50／貴重 100
      };
      vals.ref.textContent = `NT$ ${nf(R)}`;
      vals.days.textContent = String(D);
      vals.rent.textContent = `NT$ ${nf(r)}`;
      out.max.textContent = `${maxDays} 天 · +7 天`;
      [ref, days, rent].forEach(fill);
      const write = () => {
        out.day.textContent = nf(shown.day);
        out.total.textContent = `NT$ ${nf(shown.total)}`;
        out.dep.textContent = `NT$ ${nf(shown.dep)}`;
        out.late.textContent = `NT$ ${nf(shown.late)}`;
      };
      if (animate && !reduce) gsap.to(shown, { ...target, duration: 0.5, ease: 'power3.out', overwrite: true, onUpdate: write });
      else Object.assign(shown, target), write();
    }
    [ref, days, rent].forEach((el) => el.addEventListener('input', () => compute()));
    segs.forEach((b) =>
      b.addEventListener('click', () => {
        kind = b.dataset.kind;
        segs.forEach((x) => x.classList.toggle('on', x === b));
        compute();
        blip(700);
      })
    );
    compute(false);
  }

  /* ───────── manifesto ───────── */
  const words = splitWords($('#statement'));
  if (reduce) gsap.set(words, { opacity: 1 });
  else {
    gsap.fromTo(
      words,
      { opacity: 0.16 },
      {
        opacity: 1,
        ease: 'none',
        stagger: 0.12,
        scrollTrigger: { trigger: '#statement', start: 'top 80%', end: 'bottom 42%', scrub: true },
      }
    );
  }

  /* ───────── risks table ───────── */
  const rows = $$('.rk li');
  if (reduce) rows.forEach((li) => li.classList.add('in'));
  else {
    $$('.rk-m').forEach(prepareScramble);
    rows.forEach((li) => {
      ScrollTrigger.create({
        trigger: li,
        start: 'top 90%',
        once: true,
        onEnter() {
          li.classList.add('in');
          scramble($('.rk-m', li), { duration: 1.1, delay: 0.1 });
        },
      });
    });
  }

  /* ───────── roles ───────── */
  if (!reduce) {
    gsap.from('.role', {
      y: 50,
      opacity: 0,
      duration: 0.9,
      stagger: 0.1,
      ease: 'power3.out',
      clearProps: 'transform,opacity',
      scrollTrigger: { trigger: '.role-grid', start: 'top 82%' },
    });
  }
  if (!coarse && !reduce) {
    $$('[data-tilt]').forEach((el) => {
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `rotateY(${x * 12}deg) rotateX(${-y * 12}deg) translateZ(0)`;
      });
      el.addEventListener('pointerleave', () => (el.style.transform = ''));
    });
  }

  /* ───────── count-up stats ───────── */
  if (!reduce) {
    $$('.count').forEach((el) => {
      const to = Number(el.dataset.to);
      const s = { v: 0 };
      el.textContent = '0';
      ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        once: true,
        onEnter() {
          gsap.to(s, { v: to, duration: 1.4, ease: 'power3.out', onUpdate: () => (el.textContent = String(Math.round(s.v))) });
        },
      });
    });
  }

  /* ───────── journey: horizontal pin on desktop ───────── */
  mm.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
    html.classList.add('tl-pinned');
    const track = $('.tl-track');
    const dist = () => Math.max(0, track.scrollWidth - window.innerWidth + 48);
    const tween = gsap.to(track, {
      x: () => -dist(),
      ease: 'none',
      scrollTrigger: { trigger: '#journey', start: 'top top', end: () => `+=${dist()}`, pin: true, scrub: true, invalidateOnRefresh: true },
    });
    return () => {
      html.classList.remove('tl-pinned');
      tween.scrollTrigger?.kill();
      tween.kill();
      gsap.set(track, { clearProps: 'transform' });
    };
  });

  /* ───────── join ───────── */
  if (!reduce) {
    gsap.from('.join-title', {
      y: 60,
      opacity: 0,
      duration: 1.1,
      ease: 'power4.out',
      scrollTrigger: { trigger: '#join', start: 'top 70%' },
    });
  }

  /* ───────── late layout fixes ───────── */
  window.addEventListener('load', () => ScrollTrigger.refresh());
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  // read-only debug handle (handy in the browser console)
  window.__rebo = {
    state: S,
    get hero() { return hero; },
    get distort() { return distort; },
    get smoke() { return smoke; },
    lenis,
  };

  if (reduce) {
    // no loader pause for reduced motion: auto-enter once scenes are ready
    scenesReady.then(() => enter(false));
  }
}

/* ───────── loader rings (2D canvas) ───────── */
function initRings(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;
  let prog = 0;
  let alive = true;
  const rings = Array.from({ length: 9 }, (_, i) => ({
    r: 0.27 + i * 0.066,
    lw: 1 + (i % 3) * 0.9,
    ph: i * 0.9,
    sp: (0.28 + i * 0.045) * (i % 2 ? 1 : -1),
    sweep: 2.5 + (i % 4) * 0.55,
  }));
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth;
    h = canvas.clientHeight;
    canvas.width = Math.max(1, w * dpr);
    canvas.height = Math.max(1, h * dpr);
  };
  resize();
  window.addEventListener('resize', resize);
  const t0 = performance.now();
  const frame = (now) => {
    if (!alive) return;
    const t = (now - t0) / 1000;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const base = Math.min(w, h);
    rings.forEach((rg) => {
      const a0 = rg.ph + t * rg.sp;
      const sweep = rg.sweep * (0.3 + 0.7 * prog);
      const pos = Math.min(0.98, sweep / (Math.PI * 2));
      let stroke = 'rgba(255,90,31,0.8)';
      if (ctx.createConicGradient) {
        const g = ctx.createConicGradient(a0, cx, cy);
        g.addColorStop(0, 'rgba(255,90,31,0)');
        g.addColorStop(pos * 0.78, 'rgba(255,90,31,0.9)');
        g.addColorStop(pos, 'rgba(255,238,226,1)');
        g.addColorStop(Math.min(1, pos + 0.002), 'rgba(255,238,226,0)');
        g.addColorStop(1, 'rgba(255,238,226,0)');
        stroke = g;
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = rg.lw;
      ctx.beginPath();
      ctx.arc(cx, cy, rg.r * base * 0.6, a0, a0 + sweep);
      ctx.stroke();
    });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return {
    setProgress(p) {
      prog = p;
    },
    stop() {
      alive = false;
      window.removeEventListener('resize', resize);
    },
  };
}
