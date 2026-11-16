// audio.js — every sound is synthesized with WebAudio: no audio files,
// no network, nothing to download. One shared context, one noise buffer,
// short envelopes per effect. Silent until the first user gesture.
let ctx = null;
let noiseBuf = null;

export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}

function noise(dur, filterFreq, gain, type = 'lowpass') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t); src.stop(t + dur + 0.02);
}

function tone(freq, dur, gain, type = 'sine', slideTo = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  shot(kind) {
    if (kind === 'shotgun') { noise(0.22, 900, 0.5); tone(120, 0.16, 0.4, 'square', 55); }
    else if (kind === 'smg') { noise(0.09, 1800, 0.28); tone(220, 0.06, 0.16, 'square', 110); }
    else if (kind === 'pistol') { noise(0.11, 1400, 0.34); tone(180, 0.08, 0.2, 'square', 90); }
    else { noise(0.13, 1200, 0.42); tone(150, 0.1, 0.28, 'square', 70); } // rifle
  },
  distantShot() { noise(0.12, 500, 0.1); },
  reload() { tone(900, 0.05, 0.12, 'square'); setTimeout(() => tone(620, 0.05, 0.12, 'square'), 160); setTimeout(() => tone(1100, 0.05, 0.14, 'square'), 420); },
  dryFire() { tone(1400, 0.04, 0.1, 'square'); },
  hit() { tone(1900, 0.05, 0.16, 'sine'); },
  headshot() { tone(2400, 0.07, 0.2, 'sine'); tone(1200, 0.06, 0.12, 'sine'); },
  hurt() { noise(0.15, 300, 0.3); tone(90, 0.18, 0.25, 'sawtooth', 60); },
  kill() { tone(660, 0.08, 0.16, 'sine'); setTimeout(() => tone(990, 0.12, 0.16, 'sine'), 90); },
  plantBeep() { tone(1250, 0.09, 0.18, 'square'); },
  bombBeep() { tone(1500, 0.07, 0.14, 'square'); },
  explosion() { noise(0.9, 350, 0.8); tone(70, 0.8, 0.6, 'sine', 28); },
  grenadePin() { tone(1800, 0.04, 0.1, 'square'); },
  buy() { tone(880, 0.07, 0.14, 'sine'); setTimeout(() => tone(1320, 0.09, 0.14, 'sine'), 80); },
  denied() { tone(220, 0.14, 0.16, 'square', 160); },
  roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.16, 'triangle'), i * 110)); },
  roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.14, 'triangle'), i * 120)); },
  step() { noise(0.05, 400, 0.05); },
};
