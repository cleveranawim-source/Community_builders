// WebAudio 합성 사운드 — 파일 없이 효과음·오르골 BGM을 만든다.
// iOS 정책상 첫 사용자 제스처(모험 시작 버튼)에서 initAudio()를 호출해야 한다.

let ctx = null;
let bgmTimer = null;
let muted = typeof localStorage !== "undefined" && localStorage.getItem("cb_muted") === "1";

export function getMuted() {
  return muted;
}

export function setMuted(next) {
  muted = next;
  try {
    localStorage.setItem("cb_muted", next ? "1" : "0");
  } catch {
    // 사파리 프라이빗 모드 등은 무시
  }
}

export function initAudio() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    startBgm();
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}

function tone(freq, dur, { type = "sine", vol = 0.12, when = 0, sweep = null } = {}) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  pickup() {
    tone(880, 0.12, { vol: 0.14 });
    tone(1318, 0.2, { when: 0.09, vol: 0.12 });
  },
  barrier() {
    tone(660, 0.08, { type: "triangle", vol: 0.1 });
    tone(880, 0.08, { type: "triangle", when: 0.05, vol: 0.1 });
    tone(1174, 0.16, { type: "triangle", when: 0.1, vol: 0.09 });
  },
  discover() {
    tone(523, 0.12, { vol: 0.11 });
    tone(659, 0.12, { when: 0.1, vol: 0.11 });
    tone(784, 0.22, { when: 0.2, vol: 0.11 });
  },
  solve() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.32, { when: i * 0.12, vol: 0.1 }));
  },
  bad() {
    tone(392, 0.2, { vol: 0.07 });
    tone(330, 0.3, { when: 0.12, vol: 0.07 });
  },
  boost() {
    tone(440, 0.12, { sweep: 880, vol: 0.12 });
    tone(880, 0.18, { when: 0.1, sweep: 1760, vol: 0.1 });
  },
  ending() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.45, { when: i * 0.13, vol: 0.12 }));
  },
};

// 잔잔한 펜타토닉 오르골 멜로디 (저음량 루프)
const BGM_MELODY = [523, 659, 784, 659, 587, 784, 880, 784, 659, 784, 1046, 880, 784, 659, 587, 523];

function startBgm() {
  if (bgmTimer) return;
  let step = 0;
  bgmTimer = setInterval(() => {
    if (!ctx || muted || document.hidden) return;
    tone(BGM_MELODY[step % BGM_MELODY.length], 1.3, { vol: 0.035 });
    if (step % 4 === 0) tone(BGM_MELODY[step % BGM_MELODY.length] / 2, 1.6, { vol: 0.022 });
    step += 1;
  }, 1400);
}
