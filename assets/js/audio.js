// Tiny Web Audio layer: a quiet ambient pad plus UI blips. Nothing plays until the user opts in.

let ctx = null;
let master = null;
let muted = true;
let started = false;

export async function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  try {
    await ctx.resume();
  } catch (_) {
    /* autoplay policy; stays suspended until another gesture */
  }
}

export function startAmbient() {
  if (!ctx || started) return;
  started = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  filter.Q.value = 0.7;
  filter.connect(master);

  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.07;
  lfoGain.gain.value = 180;
  lfo.connect(lfoGain).connect(filter.frequency);
  lfo.start();

  [55, 82.41, 110.3, 164.8].forEach((f, i) => {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = i % 2 ? 'sine' : 'triangle';
    osc.frequency.value = f;
    osc.detune.value = (i - 1.5) * 4;
    g.gain.value = 0.12 / (i + 1);
    osc.connect(g).connect(filter);
    osc.start();
  });
  setMuted(false);
}

export function setMuted(value) {
  muted = value;
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(muted ? 0 : 0.55, ctx.currentTime, 0.2);
}

export function isMuted() {
  return muted;
}

export function blip(freq = 880, dur = 0.07) {
  if (!ctx || muted) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const t = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
