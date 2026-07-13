// WebAudio: 효과음은 합성, BGM은 음원 파일을 gapless 루프로 재생한다.
// iOS 정책상 첫 사용자 제스처(모험 시작 버튼)에서 initAudio()를 호출해야 한다.

let ctx = null;
let bgmSource = null;
let bgmGain = null;
let sfxGain = null;
let bgmStarted = false;
const BGM_URL = import.meta.env.BASE_URL + "assets/audio/bgm.wav";

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const loadNum = (key, dflt) => {
  try {
    const v = parseFloat(localStorage.getItem(key));
    return Number.isFinite(v) ? clamp01(v) : dflt;
  } catch {
    return dflt;
  }
};

let muted = typeof localStorage !== "undefined" && localStorage.getItem("cb_muted") === "1";
let bgmVolume = loadNum("cb_bgm_vol", 0.5); // 음악 볼륨 (0~1)
let sfxVolume = loadNum("cb_sfx_vol", 0.9); // 효과음 볼륨 (0~1)

export function getMuted() {
  return muted;
}
export function getBgmVolume() {
  return bgmVolume;
}
export function getSfxVolume() {
  return sfxVolume;
}

function applyBgmGain(fade = 0.3) {
  if (!bgmGain || !ctx) return;
  const now = ctx.currentTime;
  bgmGain.gain.cancelScheduledValues(now);
  bgmGain.gain.setValueAtTime(Math.max(0.0001, bgmGain.gain.value), now);
  bgmGain.gain.linearRampToValueAtTime(muted ? 0.0001 : Math.max(0.0001, bgmVolume), now + fade);
}
function applySfxGain() {
  if (!sfxGain || !ctx) return;
  sfxGain.gain.setValueAtTime(muted ? 0 : sfxVolume, ctx.currentTime);
}

export function setMuted(next) {
  muted = next;
  try {
    localStorage.setItem("cb_muted", next ? "1" : "0");
  } catch {
    // 사파리 프라이빗 모드 등은 무시
  }
  applyBgmGain(0.35);
  applySfxGain();
}

export function setBgmVolume(v) {
  bgmVolume = clamp01(v);
  try {
    localStorage.setItem("cb_bgm_vol", String(bgmVolume));
  } catch {
    // 무시
  }
  applyBgmGain(0.08);
}

export function setSfxVolume(v) {
  sfxVolume = clamp01(v);
  try {
    localStorage.setItem("cb_sfx_vol", String(sfxVolume));
  } catch {
    // 무시
  }
  applySfxGain();
  sfx.pickup(); // 새 볼륨을 바로 들려준다
}

export function initAudio() {
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    // 효과음 전용 게인 (모든 tone이 여기로 → 볼륨 한 곳에서 제어)
    sfxGain = ctx.createGain();
    sfxGain.gain.value = muted ? 0 : sfxVolume;
    sfxGain.connect(ctx.destination);
    startBgm();
    // 백그라운드 탭에서는 오디오 정지 (발열·배터리 절약)
    document.addEventListener("visibilitychange", () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend().catch(() => {});
      else ctx.resume().catch(() => {});
    });
  }
  if (ctx.state === "suspended" && !document.hidden) ctx.resume().catch(() => {});
}

function tone(freq, dur, { type = "sine", vol = 0.12, when = 0, sweep = null } = {}) {
  if (!ctx || muted || !sfxGain) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweep) osc.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(sfxGain);
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

// BGM: 음원 파일을 AudioBufferSourceNode의 loop로 재생 → 샘플 정확한 gapless 루프.
// 파일 자체가 acrossfade로 이음새를 제거한 seamless 루프라 끊김 없이 계속 돈다.
async function startBgm() {
  if (bgmStarted || !ctx) return;
  bgmStarted = true;
  try {
    const res = await fetch(BGM_URL);
    const audioBuffer = await ctx.decodeAudioData(await res.arrayBuffer());
    bgmGain = ctx.createGain();
    bgmGain.gain.value = muted ? 0.0001 : Math.max(0.0001, bgmVolume);
    bgmGain.connect(ctx.destination);
    bgmSource = ctx.createBufferSource();
    bgmSource.buffer = audioBuffer;
    bgmSource.loop = true;
    bgmSource.connect(bgmGain);
    bgmSource.start(0);
  } catch {
    bgmStarted = false; // 로드 실패 시 다음 initAudio에서 재시도
  }
}
