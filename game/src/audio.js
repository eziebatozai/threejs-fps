// DUSTLINE — procedural sound. Every effect is synthesized with WebAudio:
// no audio files, no network. A single shared context, created lazily on
// the first user gesture, so autoplay policies never block the game.

let ctx = null;
let master = null;

export function ensureAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
}

function noiseBuffer(seconds) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function burst({ dur, type = 'lowpass', freq = 1200, gain = 0.6, slideTo = null, when = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur + 0.05);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, t);
  if (slideTo !== null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter); filter.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

function tone({ freq, dur, type = 'sine', gain = 0.25, slideTo = null, when = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

// Distance attenuation: 1 at the ear, ~0.15 at 40 m.
function atten(dist) {
  return Math.max(0.08, 1 - dist / 48);
}

export const sfx = {
  shot(kind, dist = 0) {
    const v = atten(dist);
    if (kind === 'needle') { burst({ dur: 0.28, freq: 900, slideTo: 120, gain: 0.7 * v }); tone({ freq: 140, dur: 0.22, slideTo: 45, gain: 0.5 * v }); }
    else if (kind === 'hornet') { burst({ dur: 0.11, freq: 2200, slideTo: 300, gain: 0.45 * v }); tone({ freq: 190, dur: 0.08, slideTo: 70, gain: 0.3 * v }); }
    else if (kind === 'longbow') { burst({ dur: 0.16, freq: 1600, slideTo: 200, gain: 0.55 * v }); tone({ freq: 160, dur: 0.12, slideTo: 55, gain: 0.4 * v }); }
    else { burst({ dur: 0.1, freq: 2600, slideTo: 400, gain: 0.4 * v }); }
  },
  dry() { tone({ freq: 1400, dur: 0.03, type: 'square', gain: 0.12 }); },
  reload() {
    tone({ freq: 900, dur: 0.04, type: 'square', gain: 0.14 });
    tone({ freq: 600, dur: 0.04, type: 'square', gain: 0.14, when: 0.28 });
    tone({ freq: 1100, dur: 0.05, type: 'square', gain: 0.16, when: 0.62 });
  },
  hit(head) {
    tone({ freq: head ? 1900 : 1300, dur: 0.05, type: 'triangle', gain: 0.3 });
  },
  kill() {
    tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.28 });
    tone({ freq: 990, dur: 0.09, type: 'triangle', gain: 0.28, when: 0.07 });
  },
  hurt() { burst({ dur: 0.12, freq: 500, slideTo: 150, gain: 0.4 }); tone({ freq: 90, dur: 0.15, slideTo: 50, gain: 0.35 }); },
  step(dist = 0) { burst({ dur: 0.05, freq: 350, gain: 0.1 * atten(dist) }); },
  plantBeep() { tone({ freq: 1200, dur: 0.08, type: 'square', gain: 0.2 }); },
  explode(dist = 0) {
    const v = atten(dist);
    burst({ dur: 0.9, freq: 800, slideTo: 60, gain: 0.9 * v });
    tone({ freq: 70, dur: 0.8, slideTo: 28, gain: 0.7 * v });
  },
  grenadePin() { tone({ freq: 1500, dur: 0.03, type: 'square', gain: 0.12 }); },
  roundWin() {
    tone({ freq: 523, dur: 0.12, type: 'triangle', gain: 0.25 });
    tone({ freq: 659, dur: 0.12, type: 'triangle', gain: 0.25, when: 0.12 });
    tone({ freq: 784, dur: 0.22, type: 'triangle', gain: 0.28, when: 0.24 });
  },
  roundLose() {
    tone({ freq: 392, dur: 0.15, type: 'triangle', gain: 0.25 });
    tone({ freq: 311, dur: 0.25, type: 'triangle', gain: 0.25, when: 0.15 });
  },
  buy() { tone({ freq: 880, dur: 0.06, type: 'triangle', gain: 0.2 }); tone({ freq: 1174, dur: 0.08, type: 'triangle', gain: 0.2, when: 0.06 }); },
  denied() { tone({ freq: 220, dur: 0.12, type: 'square', gain: 0.15 }); },
};
