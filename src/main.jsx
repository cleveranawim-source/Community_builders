import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  BadgeCheck,
  BookOpen,
  MapIcon,
  Menu,
  Navigation,
  PartyPopper,
  Sparkles,
  UsersRound,
} from "lucide-react";
import GameWorld, { treasureSeeds } from "./world.jsx";
import {
  quests,
  fogSeeds,
  stats,
  HALF,
  NPC_RADIUS,
  playerPalette,
  portraitOf,
  HERO_PORTRAIT,
  TITLE_BG,
  TITLE_BG_VIDEO,
  TEASER_VIDEO,
  easterEggs,
  lostItems,
  badges,
  MOOD_LBL,
  moodIcon,
  sceneOf,
  sceneThumbOf,
  ENDING_ART,
} from "./data/index.js";
import { uid, josa } from "./lib/utils.js";
import { initAudio, sfx, getMuted, setMuted, getBgmVolume, getSfxVolume, setBgmVolume, setSfxVolume } from "./lib/sound.js";
import "./styles.css";

const HAIR_OPTIONS = [0x25314d, 0x3b2a20, 0x30223d, 0x2f2430];

function statOf(key) {
  return stats.find((s) => s.key === key);
}

// 역량별 문항 수가 달라도 만점(20+72=92)이 같도록 획득량을 정규화한다
const QUEST_STAT_COUNT = quests.reduce((acc, q) => {
  acc[q.stat] = (acc[q.stat] || 0) + 1;
  return acc;
}, {});
const gainForStat = (stat) => Math.round(72 / (QUEST_STAT_COUNT[stat] || 4));

// 진행 자동 저장 (새로고침해도 이어서 하기)
const SAVE_KEY = "cb_save_v1";

// 우리 반 기록에 함께 싣는 오늘 마무리 칸 (보안 규칙: moodPre·moodPost 1~5, promise 60자)
const REFLECT_KEYS = ["moodPre", "moodPost", "promise"];
function reflectFields(r) {
  const out = {};
  if (r?.moodPre >= 1 && r.moodPre <= 5) out.moodPre = r.moodPre;
  if (r?.moodPost >= 1 && r.moodPost <= 5) out.moodPost = r.moodPost;
  const promise = (r?.promise || "").trim().slice(0, 60);
  if (promise) out.promise = promise;
  return out;
}

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save?.profile?.name || !save?.user?.id) return null;
    return save;
  } catch {
    return null;
  }
}

// 발사 버튼: 네이티브 터치로 즉시 반응 + 꾹 누르면 연사.
// 조이스틱과 별개 손가락으로 동시에 눌러도 안정적으로 동작한다.
function FireButton({ onStart, onStop }) {
  const btnRef = useRef(null);
  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return undefined;
    const start = (event) => {
      event.preventDefault(); // 터치 시 지연·고스트클릭·제스처 방지
      onStart();
    };
    const stop = () => onStop();
    btn.addEventListener("touchstart", start, { passive: false });
    btn.addEventListener("touchend", stop);
    btn.addEventListener("touchcancel", stop);
    // 마우스(PC) 폴백
    btn.addEventListener("mousedown", start);
    window.addEventListener("mouseup", stop);
    return () => {
      btn.removeEventListener("touchstart", start);
      btn.removeEventListener("touchend", stop);
      btn.removeEventListener("touchcancel", stop);
      btn.removeEventListener("mousedown", start);
      window.removeEventListener("mouseup", stop);
    };
  }, [onStart, onStop]);

  return (
    <button ref={btnRef} className="shoot-fab" aria-label="공감 빛구슬 발사">
      <Sparkles size={30} />
      <em>빛구슬</em>
    </button>
  );
}

// 네이티브 터치 이벤트로 직접 처리해 태블릿 멀티터치를 안정화한다.
// 각 손가락(touch.identifier)을 추적하므로 조이스틱과 발사 버튼을 동시에 쓸 수 있다.
function Joystick({ inputRef }) {
  const padRef = useRef(null);
  const touchIdRef = useRef(null); // 이 조이스틱을 조작 중인 손가락 id
  const [thumb, setThumb] = useState({ x: 0, y: 0 });

  const applyFromPoint = (clientX, clientY) => {
    const rect = padRef.current.getBoundingClientRect();
    let dx = (clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    let dy = (clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    inputRef.current.joy = { x: dx, y: dy };
    setThumb({ x: dx, y: dy });
  };

  const reset = () => {
    touchIdRef.current = null;
    inputRef.current.joy = { x: 0, y: 0 };
    setThumb({ x: 0, y: 0 });
  };

  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return undefined;

    const findTouch = (list, id) => {
      for (let i = 0; i < list.length; i += 1) {
        if (list[i].identifier === id) return list[i];
      }
      return null;
    };

    const onStart = (event) => {
      if (touchIdRef.current !== null) return; // 이미 다른 손가락이 조작 중
      const t = event.changedTouches[0];
      touchIdRef.current = t.identifier;
      event.preventDefault();
      applyFromPoint(t.clientX, t.clientY);
    };
    const onMove = (event) => {
      if (touchIdRef.current === null) return;
      const t = findTouch(event.touches, touchIdRef.current);
      if (!t) return;
      event.preventDefault();
      applyFromPoint(t.clientX, t.clientY);
    };
    const onEnd = (event) => {
      if (touchIdRef.current === null) return;
      // 내 손가락이 떼졌을 때만 리셋 (다른 손가락 이벤트는 무시)
      if (findTouch(event.changedTouches, touchIdRef.current)) reset();
    };

    // passive:false 로 등록해야 preventDefault가 실제로 먹는다(스크롤/제스처 차단)
    pad.addEventListener("touchstart", onStart, { passive: false });
    pad.addEventListener("touchmove", onMove, { passive: false });
    pad.addEventListener("touchend", onEnd);
    pad.addEventListener("touchcancel", onEnd);

    // 마우스(PC) 폴백
    let mouseDown = false;
    const onMouseDown = (e) => { mouseDown = true; applyFromPoint(e.clientX, e.clientY); };
    const onMouseMove = (e) => { if (mouseDown) applyFromPoint(e.clientX, e.clientY); };
    const onMouseUp = () => { mouseDown = false; reset(); };
    pad.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);

    return () => {
      pad.removeEventListener("touchstart", onStart);
      pad.removeEventListener("touchmove", onMove);
      pad.removeEventListener("touchend", onEnd);
      pad.removeEventListener("touchcancel", onEnd);
      pad.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="joystick" ref={padRef} aria-label="이동 조이스틱">
      <span
        className="joystick-thumb"
        style={{ transform: `translate(${thumb.x * 34}px, ${thumb.y * 34}px)` }}
      />
    </div>
  );
}

// 그림 아이콘 (못 읽으면 이모지로). 크기는 감싸는 글자 크기(em)를 따른다.
function IconImg({ src, emoji, className = "" }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return <span className={className}>{emoji}</span>;
  return <img className={`ico-img ${className}`} src={src} alt="" draggable={false} onError={() => setBad(true)} />;
}

// 미션을 풀면 되살아난 장소의 그림. 못 읽으면(또는 교사가 장소 이름을 바꿨으면) 칸째 감춘다.
function SceneArt({ quest }) {
  const [bad, setBad] = useState(false);
  if (quest.noScene || bad) return null;
  return (
    <figure className="scene-card">
      <img src={sceneOf(quest.id)} alt={`${quest.title} — 달라진 마을 모습`} draggable={false} onError={() => setBad(true)} />
      <figcaption>{quest.title}</figcaption>
    </figure>
  );
}

// 마음 날씨 고르기 (1 폭풍 … 5 맑음). 같은 것을 다시 누르면 비운다.
function MoodPicker({ value, onChange, label }) {
  return (
    <div className="mood-pick" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={value === n ? "on" : ""}
          aria-pressed={value === n}
          aria-label={`마음 날씨 ${MOOD_LBL[n]}`}
          onClick={() => onChange(value === n ? 0 : n)}
        >
          <img src={moodIcon(n)} alt="" />
          <span>{MOOD_LBL[n]}</span>
        </button>
      ))}
    </div>
  );
}

function moodDiffText(pre, post) {
  if (!pre || !post) return "";
  const line = `${MOOD_LBL[pre]} → ${MOOD_LBL[post]}`;
  if (post > pre) return `${line} · 처음보다 마음이 한결 맑아졌어요`;
  if (post < pre) return `${line} · 마음이 조금 무거워졌네요. 선생님께 이야기해도 괜찮아요`;
  return `${line} · 처음과 같은 마음 날씨예요`;
}

// 오늘 마무리: 다 마친 뒤 마음 날씨 + 우리 반 약속 한 문장 (끝 화면·마무리 창에서 함께 쓴다)
function ReflectPanel({ reflect, setReflect, room, onToast }) {
  const [draft, setDraft] = useState(reflect.promise || "");
  const text = draft.trim().slice(0, 60);
  const saved = !!reflect.promise && reflect.promise === text;
  const save = () => {
    setReflect((r) => ({ ...r, promise: text }));
    if (text) onToast(room ? "약속을 우리 반 약속 벽에 올렸어요 (이름 없이 보여요)" : "약속을 남겼어요. 인증서에 함께 담겨요");
    else onToast("약속을 지웠어요");
  };
  return (
    <div className="reflect-panel">
      <p className="rp-q">다 마친 지금, 내 마음 날씨는?</p>
      <MoodPicker
        value={reflect.moodPost}
        onChange={(n) => setReflect((r) => ({ ...r, moodPost: n }))}
        label="다 마친 뒤 마음 날씨"
      />
      {reflect.moodPre > 0 && reflect.moodPost > 0 && (
        <p className="rp-diff">{moodDiffText(reflect.moodPre, reflect.moodPost)}</p>
      )}
      <label className="rp-q" htmlFor="rp-promise">우리 반에 남기는 약속 한 문장</label>
      <div className="rp-promise">
        <input
          id="rp-promise"
          value={draft}
          maxLength={60}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && !saved && save()}
          placeholder="예: 친구 말을 끝까지 들어 줄게요"
        />
        <button type="button" onClick={save} disabled={saved || (!text && !reflect.promise)}>
          {saved ? "남겼어요 ✓" : "약속 남기기"}
        </button>
      </div>
      <p className="rp-note">{room ? "약속은 이름 없이 우리 반 약속 벽에 보여요." : "약속은 인증서에 함께 담겨요."}</p>
    </div>
  );
}

function IntroScreen({ onStart, onContinue, savedGame }) {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [moodPre, setMoodPre] = useState(0);
  const [videoOk, setVideoOk] = useState(true);
  const [showTeaser, setShowTeaser] = useState(false);
  const videoRef = useRef(null);

  // 일부 브라우저는 autoPlay 속성만으로 재생을 시작하지 않으므로 마운트 시 명시적으로 재생 시도
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.play().catch(() => {});
  }, [videoOk]);

  const start = () => {
    onStart(name.trim() || `탐험가${Math.floor(Math.random() * 90) + 10}`, room.trim().toUpperCase(), moodPre);
  };
  const savedSolved = savedGame ? Object.values(savedGame.solved || {}).filter(Boolean).length : 0;

  return (
    <section className="intro-layer" style={{ backgroundImage: `url(${TITLE_BG})` }}>
      {videoOk && (
        <video
          ref={videoRef}
          className="intro-bg-video"
          autoPlay
          muted
          loop
          playsInline
          poster={TITLE_BG}
          onError={() => setVideoOk(false)}
        >
          <source src={TITLE_BG_VIDEO} type="video/mp4" />
        </video>
      )}
      <div className="intro-panel">
        <img className="intro-hero" src={HERO_PORTRAIT} alt="탐험가" />
        <h1>공동체 빌더스</h1>
        <p className="intro-sub">
          안개에 갇힌 마을을 깨우는 사회정서(SEL) 탐험.
          <br />16개의 보물 거점에서 친구들의 고민을 함께 해결해 보세요.
        </p>
        <div className="intro-fields">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="별칭 (예: 반짝탐험가 · 실명 말고)"
            maxLength={10}
            onKeyDown={(event) => event.key === "Enter" && start()}
          />
          <input
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            placeholder="우리 반 코드 (선택)"
            maxLength={10}
            onKeyDown={(event) => event.key === "Enter" && start()}
          />
        </div>
        <div className="intro-mood">
          <p>지금 내 마음 날씨는? <em>골라도 되고 안 골라도 돼요</em></p>
          <MoodPicker value={moodPre} onChange={setMoodPre} label="시작할 때 마음 날씨" />
        </div>
        {savedGame && (
          <button className="intro-continue" onClick={onContinue}>
            이어서 하기 — {savedGame.profile.name} · 미션 {savedSolved}/{quests.length}
          </button>
        )}
        <button className="intro-start" onClick={start}>
          <Sparkles size={18} /> {savedGame ? "새로 시작" : "모험 시작"}
        </button>
        <button className="intro-teaser" onClick={() => setShowTeaser(true)}>
          ▶ 티저 영상 보기 <em>30초</em>
        </button>
        <p className="intro-help">
          PC: 화살표·WASD 이동 / 스페이스 빛구슬 / E 대화
          <br />모바일: 왼손 조이스틱 이동 · 오른손 빛구슬(꾹 누르면 연사)
        </p>
        <a className="teacher-link" href="#teacher">교사용 화면 열기 →</a>
      </div>
      <div className="intro-brand" aria-label="만든 사람 LevLab Yeol">
        <b>Lev</b>Lab <span>Yeol</span>
      </div>

      {showTeaser && (
        <div className="teaser-modal" onClick={() => setShowTeaser(false)}>
          <div className="teaser-frame" onClick={(event) => event.stopPropagation()}>
            <button className="teaser-close" onClick={() => setShowTeaser(false)} aria-label="닫기">✕</button>
            <video
              className="teaser-video"
              src={TEASER_VIDEO}
              autoPlay
              controls
              playsInline
              onEnded={() => setShowTeaser(false)}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// 학생 기록의 배지 이모지 묶음(badgeIcons) → 배지 그림들. 모르는 글자는 그대로 둔다.
function badgeImgsOf(text) {
  const parts = typeof Intl !== "undefined" && Intl.Segmenter
    ? [...new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text)].map((x) => x.segment)
    : Array.from(text);
  return parts.map((ch, i) => {
    const b = badges.find((x) => x.icon === ch);
    return b ? <img key={i} src={b.img} alt={b.name} title={b.name} /> : <span key={i}>{ch}</span>;
  });
}

const TEACHER_HEAD = `${import.meta.env.BASE_URL}assets/teacher_head.webp`;

// 새 반 코드: 헷갈리는 글자(0·O·1·I·L) 뺀 6자리, 암호학적 난수
function randomRoomCode() {
  const abc = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(6);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => abc[n % abc.length]).join("");
}

function TeacherBoard() {
  const [code, setCode] = useState(localStorage.getItem("cb_room") || "");
  const [active, setActive] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [priv, setPriv] = useState(false);
  // 요약 기록 throttle: 학생 밝기막대용 __summary 문서를 최대 8초에 한 번만 갱신
  const lastSummaryRef = useRef({ total: -1, count: -1, purified: -1 });
  const lastSummaryAtRef = useRef(0);

  useEffect(() => {
    if (!active) return undefined;
    let unsub = null;
    let cancelled = false;
    import("./lib/firebase.js")
      .then((fb) => {
        if (cancelled) return;
        unsub = fb.watchRoom(active, (list) => {
          if (list) {
            setError("");
            // __summary는 학생 밝기막대용 집계 문서 — 학생 명단에서 제외
            setRows(list.filter((r) => r.id !== "__summary"));
          } else {
            setError("실시간 연결이 끊겼습니다.");
          }
        });
      })
      .catch(() => setError("Firebase 로드에 실패했습니다."));
    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, [active]);

  // 교사 화면이 반 전체를 대신 집계해 요약 1문서에 기록한다(학생은 이것만 읽음).
  // 변경이 있을 때만, 최대 8초에 한 번 기록해 write·read를 모두 낮춘다.
  useEffect(() => {
    if (!active || !rows.length) return undefined;
    const total = rows.reduce((sum, r) => sum + (r.cleared || 0), 0);
    const purified = rows.reduce((sum, r) => sum + (r.purified || 0), 0);
    const count = rows.length;
    const last = lastSummaryRef.current;
    if (total === last.total && count === last.count && purified === last.purified) return undefined;
    const delay = Math.max(0, 8000 - (Date.now() - lastSummaryAtRef.current));
    const timer = window.setTimeout(() => {
      lastSummaryRef.current = { total, count, purified };
      lastSummaryAtRef.current = Date.now();
      import("./lib/firebase.js").then((fb) => fb.pushSummary(active, { total, count, purified })).catch(() => {});
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active, rows]);

  const open = (value) => {
    const next = value.trim().toUpperCase();
    if (!next) return;
    localStorage.setItem("cb_room", next);
    setCode(next);
    setRows([]);
    setPriv(false);   // 반을 바꾸면 학생별 기록은 다시 닫힌 채로 (프로젝터 노출 방지)
    setActive(next);
  };

  // 재접속으로 생긴 옛 문서 정리: 같은 닉네임은 가장 최근에 갱신된 문서만 표시
  // (같은 기기 재접속은 cb_uid 재사용으로 원천 차단되지만, 기기 교체·과거 중복 문서 대비)
  const students = useMemo(() => {
    const byKey = new Map();
    rows.forEach((row) => {
      const key = (row.name || "").trim() || row.id;
      const prev = byKey.get(key);
      if (!prev || (row.updatedAt || 0) > (prev.updatedAt || 0)) byKey.set(key, row);
    });
    return [...byKey.values()];
  }, [rows]);

  // 장벽 누적은 빌런 재안개로 144를 넘을 수 있어 표시·점수는 144로 상한
  const clearedOf = (row) => Math.min(row.cleared || 0, fogSeeds.length);
  // 모험 포인트: 미션×10 · 빛장벽×1 · 마음 조각×3 · 돌려준 물건×5 · 숨은 장소×8
  const pointsOf = (row) =>
    (row.solvedCount || 0) * 10 +
    clearedOf(row) +
    (row.gems || 0) * 3 +
    (row.returned || 0) * 5 +
    (row.eggs || 0) * 8;

  // 완주 순번: 마을 완성(16미션) 시각이 이른 순으로 1·2·3… (동점 순위의 타이브레이크에도 사용)
  const finishTime = (row) => row.completedAt || Infinity;
  const finishOrder = new Map(
    students
      .filter((r) => r.completedAt)
      .sort((a, b) => a.completedAt - b.completedAt)
      .map((r, i) => [r.id, i + 1]),
  );
  // 순위: 포인트 우선, 동점이면 먼저 완주한 학생이 앞선다 (440점 만점 동점 → 완주 시간순)
  const sorted = [...students].sort((a, b) => {
    const dp = pointsOf(b) - pointsOf(a);
    if (dp !== 0) return dp;
    return finishTime(a) - finishTime(b);
  });
  const maxPoints = Math.max(1, ...sorted.map(pointsOf));
  // 반 전체 정화 에너지 = 완주자들이 정화한 장벽 총합 (반별 대결용)
  const classPurified = students.reduce((sum, r) => sum + (r.purified || 0), 0);

  // 다부문 타이틀: 부문별 최고 학생에게 왕관을 준다 (한 줄 순위가 완주 후 동점되는 걸 보완).
  // 상한 있는 값이라 완주자끼리 총점은 같아지지만, 부문마다 다른 주인공이 나오게 하는 게 핵심.
  const TITLE_DEFS = [
    { key: "build", icon: "🏘️", name: "건축왕", unit: "미션", val: (r) => r.solvedCount || 0 },
    { key: "collect", icon: "💎", name: "수집왕", unit: "조각", val: (r) => r.gems || 0 },
    { key: "deliver", icon: "📮", name: "배달왕", unit: "물건", val: (r) => r.returned || 0 },
    { key: "explore", icon: "🗺️", name: "탐험왕", unit: "숨은장소", val: (r) => r.eggs || 0 },
    { key: "purify", icon: "⚡", name: "정화왕", unit: "정화", val: (r) => r.purified || 0 },
  ];
  const titleAwards = TITLE_DEFS.map((def) => {
    const best = students.reduce((m, r) => Math.max(m, def.val(r)), 0);
    const holders = best > 0 ? students.filter((r) => def.val(r) === best) : [];
    return { ...def, best, holders };
  });

  const moodOf = (v) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : 0);
  const avg = (key) =>
    students.length ? Math.round(students.reduce((sum, row) => sum + (row.score?.[key] || 0), 0) / students.length) : 0;

  // 수업 기록용 CSV 내보내기 (엑셀 한글 호환 BOM 포함)
  const exportCsv = () => {
    const header = ["순위", "이름", "포인트", "완주 순번", "완주 시각", "미션 해결", "거점 발견", "빛장벽(누적)", "마음 조각", "돌려준 물건", "숨은 장소", "배지", "정화(완주후)", "에너지", "마음알기", "서로듣기", "관계잇기", "마을세우기", "마을 완성", "마음 날씨(시작)", "마음 날씨(끝)", "우리 반 약속"];
    const lines = sorted.map((row, i) => [
      i + 1,
      row.name || "",
      pointsOf(row),
      finishOrder.get(row.id) || "",
      row.completedAt ? new Date(row.completedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "",
      row.solvedCount || 0,
      row.found || 0,
      clearedOf(row),
      row.gems || 0,
      row.returned || 0,
      row.eggs || 0,
      row.badges || 0,
      row.purified || 0,
      row.energy || 0,
      row.score?.self || 0,
      row.score?.empathy || 0,
      row.score?.relation || 0,
      row.score?.community || 0,
      row.done ? "O" : "",
      MOOD_LBL[moodOf(row.moodPre)] || "",
      MOOD_LBL[moodOf(row.moodPost)] || "",
      typeof row.promise === "string" ? row.promise : "",
    ]);
    // 엑셀 수식 주입 막기: = + - @ 로 시작하는 칸은 앞에 ' 를 붙인다
    const cellText = (v) => {
      const t = String(v);
      return /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
    };
    const csv = "\ufeff" + [header, ...lines]
      .map((cells) => cells.map((v) => `"${cellText(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `공동체빌더스_${active}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  // ── 반 전체 합계 (프로젝터용 기본 화면: 이름 없음) ──
  const classCleared = students.reduce((sum, r) => sum + clearedOf(r), 0);
  const classReturned = students.reduce((sum, r) => sum + (r.returned || 0), 0);
  const doneCount = students.filter((row) => row.done).length;
  const moodCount = { pre: [0, 0, 0, 0, 0, 0], post: [0, 0, 0, 0, 0, 0] };
  const moodMove = { up: 0, same: 0, down: 0 };
  students.forEach((r) => {
    const a = moodOf(r.moodPre);
    const b = moodOf(r.moodPost);
    if (a) moodCount.pre[a] += 1;
    if (b) moodCount.post[b] += 1;
    if (a && b) moodMove[b > a ? "up" : b < a ? "down" : "same"] += 1;
  });
  const promises = students.filter((r) => typeof r.promise === "string" && r.promise.trim());

  return (
    <main className={priv ? "teacher-shell priv" : "teacher-shell"}>
      <header className="teacher-head tb-hero" style={{ backgroundImage: `url(${TEACHER_HEAD})` }}>
        <div className="tb-hero-text">
          <p className="tb-kicker">교사 화면</p>
          <h1>공동체 빌더스</h1>
          <p>반 코드를 정해 입력하면, 같은 코드로 들어온 학생들이 실시간으로 모여요. 처음 화면은 이름 없이 반 전체만 보여 줘서 프로젝터에 띄워도 괜찮아요.</p>
        </div>
        <a href="#" onClick={(event) => { event.preventDefault(); window.location.hash = ""; }}>
          ← 게임으로
        </a>
      </header>

      <section className="teacher-join">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="반 코드 (예: 3학년2반, MJ301)"
          maxLength={10}
          onKeyDown={(event) => event.key === "Enter" && open(code)}
        />
        <button onClick={() => open(code)}>모니터링 시작</button>
        <button className="ghost" onClick={() => open(randomRoomCode())}>
          🎲 새 코드 만들기
        </button>
        {active && <span className="room-chip">참여 코드: {active}</span>}
      </section>

      {error && <p className="teacher-error">{error}</p>}

      {active && (
        <>
          <section className="tb-headline">
            <div className="tb-big">
              <strong>{classCleared}</strong>
              <span>우리 반이 함께 걷어 낸 빛장벽</span>
            </div>
            <div className="tb-stats">
              <div><strong>{students.length}</strong><span>참여</span></div>
              <div><strong>{doneCount}</strong><span>마을 완성</span></div>
              <div><strong>{classReturned}</strong><span>돌려준 물건</span></div>
              <div className="purify-total"><strong>⚡{classPurified}</strong><span>반 전체 정화</span></div>
            </div>
          </section>

          <section className="tb-grid">
            <div className="tb-card">
              <h2>🌱 역량 평균 <em>반 전체 · 100점 기준</em></h2>
              <div className="tb-comp">
                {stats.map((stat) => (
                  <div className="tb-comp-row" key={stat.key} style={{ "--c": stat.color }}>
                    <span className="tb-comp-name">{stat.label}</span>
                    <i className="tb-comp-bar"><b style={{ width: `${Math.max(3, avg(stat.key))}%` }} /></i>
                    <strong>{avg(stat.key)}</strong>
                  </div>
                ))}
              </div>
              {!students.length && <p className="teacher-empty">학생이 들어오면 평균이 나타나요.</p>}
            </div>

            <div className="tb-card">
              <h2>🌤️ 우리 반 마음 날씨 <em>고른 학생만 · 사람 수</em></h2>
              <div className="tb-mood">
                <div />
                {[1, 2, 3, 4, 5].map((v) => (
                  <div key={v}>
                    <img src={moodIcon(v)} alt="" />
                    <span className="ml">{MOOD_LBL[v]}</span>
                  </div>
                ))}
                {[["pre", "시작할 때"], ["post", "다 마친 뒤"]].map(([key, label]) => (
                  <React.Fragment key={key}>
                    <span className="rl">{label}</span>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <span key={v} className={moodCount[key][v] ? "mc" : "mc zero"}>{moodCount[key][v]}</span>
                    ))}
                  </React.Fragment>
                ))}
              </div>
              <p className="tb-mood-foot">
                <span className="up">맑아짐 <b>{moodMove.up}</b>명</span>
                <span>그대로 <b>{moodMove.same}</b>명</span>
                <span className="down">흐려짐 <b>{moodMove.down}</b>명</span>
                <span className="note">처음과 끝을 둘 다 고른 학생만 셉니다</span>
              </p>
            </div>
          </section>

          <section className="tb-card tb-promises">
            <h2>🤝 우리 반 약속 벽 <em>이름 없이 약속만 보여요</em></h2>
            {promises.length ? (
              <div className="tb-promise-wall">
                {promises.map((r) => (
                  <div className="tb-pchip" key={r.id}>
                    {r.promise}
                    <span className="by">— {r.name || "이름 없음"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="teacher-empty">아직 남긴 약속이 없어요. 학생이 끝 화면이나 위쪽 「오늘 마무리」 단추에서 약속을 남기면 여기에 나타나요.</p>
            )}
          </section>

          <div className="tb-priv-bar">
            <button className={priv ? "on" : ""} onClick={() => setPriv((v) => !v)}>
              {priv ? "👤 학생별 보기 닫기" : "👤 학생별 보기 (교사 전용)"}
            </button>
            <span>학생 이름·순위·개인 기록이 나와요. 프로젝터 화면을 끄거나 내 화면에서만 여세요.</span>
            {priv && students.length > 0 && (
              <button className="ghost" onClick={exportCsv}>CSV 내보내기</button>
            )}
          </div>
        </>
      )}
      {active && priv && students.length > 0 && (
        <section className="teacher-titles">
          <h2>👑 오늘의 타이틀 <em>부문별 최고에게</em></h2>
          <div className="title-grid">
            {titleAwards.map((t) => (
              <div className={`title-card${t.holders.length ? "" : " empty"}`} key={t.key}>
                <span className="title-emoji">{t.icon}</span>
                <span className="title-name">{t.name}</span>
                {t.holders.length ? (
                  <>
                    <span className="title-holder">
                      <i style={{ background: t.holders[0].color || "#94a3b8" }} />
                      {t.holders[0].name || "이름 없음"}
                      {t.holders.length > 1 && <em> 외 {t.holders.length - 1}명</em>}
                    </span>
                    <span className="title-val">{t.best} {t.unit}</span>
                  </>
                ) : (
                  <span className="title-holder dim">아직 없음</span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {active && priv && (
        <section className="teacher-race">
          <h2>
            🏁 실시간 마을 레이스
            <em>미션×10 · 빛장벽×1 · 조각×3 · 물건×5 · 숨은장소×8 · 동점은 먼저 완주한 순</em>
          </h2>
          {!sorted.length && (
            <p className="teacher-empty">학생이 반 코드로 접속하면 실시간 순위가 여기에 표시됩니다.</p>
          )}
          {sorted.map((row, i) => {
            const pts = pointsOf(row);
            return (
              <div className={`race-row${i < 3 ? ` top${i + 1}` : ""}`} key={row.id}>
                <span className="race-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                <span className="race-name">
                  <i style={{ background: row.color || "#94a3b8" }} />
                  {row.name || "이름 없음"}
                  {finishOrder.has(row.id) && (
                    <b className="finish-badge" title="마을 완성(16미션 완주) 순번">🏁{finishOrder.get(row.id)}</b>
                  )}
                </span>
                <div className="race-track">
                  <div className="race-bar" style={{ width: `${Math.max(6, (pts / maxPoints) * 100)}%` }}>
                    <b>{pts}</b>
                  </div>
                </div>
                <span className="race-chips" title="배지 · 마음 조각 · 돌려준 물건 · 숨은 장소 · 정화(완주 후)">
                  🏅{row.badges || 0} 💛{row.gems || 0} 📮{row.returned || 0} 🗺️{row.eggs || 0}
                  {row.purified > 0 && <b className="purify-tag"> ⚡{row.purified}</b>}
                </span>
              </div>
            );
          })}
        </section>
      )}

      {active && priv && (
        <section className="teacher-table">
          <div className="teacher-row head">
            <span>학생</span>
            <span>포인트</span>
            <span>미션</span>
            <span>발견</span>
            <span>장벽</span>
            <span>조각</span>
            <span>물건</span>
            <span>숨은곳</span>
            <span>배지</span>
            <span title="완주 후 되살아난 장벽 정화 횟수 (순위와 별개 보너스)">정화</span>
            <span title="시작할 때 → 다 마친 뒤">마음 날씨</span>
            <span>역량</span>
          </div>
          {sorted.map((row) => (
            <div className={row.done ? "teacher-row done" : "teacher-row"} key={row.id}>
              <span className="student">
                <i style={{ background: row.color || "#94a3b8" }} />
                {row.name || "이름 없음"}
                {row.done && <PartyPopper size={14} />}
              </span>
              <span className="pts">{pointsOf(row)}</span>
              <span>{row.solvedCount || 0}/{quests.length}</span>
              <span>{row.found || 0}/{quests.length}</span>
              <span>{clearedOf(row)}/{fogSeeds.length}</span>
              <span>💛{row.gems || 0}</span>
              <span>📮{row.returned || 0}/{lostItems.length}</span>
              <span>🗺️{row.eggs || 0}/{easterEggs.length}</span>
              <span className="badge-cell" title={`획득 배지 ${row.badges || 0}/${badges.length}`}>
                {row.badgeIcons ? badgeImgsOf(row.badgeIcons) : row.badges ? `🏅×${row.badges}` : "—"}
              </span>
              <span className="pts">{row.purified > 0 ? `⚡${row.purified}` : "—"}</span>
              <span className="mood-cell" title={`${MOOD_LBL[moodOf(row.moodPre)] || "안 고름"} → ${MOOD_LBL[moodOf(row.moodPost)] || "안 고름"}`}>
                {moodOf(row.moodPre) ? <img src={moodIcon(moodOf(row.moodPre))} alt={MOOD_LBL[moodOf(row.moodPre)]} /> : <em>·</em>}
                <i>→</i>
                {moodOf(row.moodPost) ? <img src={moodIcon(moodOf(row.moodPost))} alt={MOOD_LBL[moodOf(row.moodPost)]} /> : <em>·</em>}
              </span>
              <span className="bars">
                {stats.map((stat) => (
                  <i
                    key={stat.key}
                    title={`${stat.label} ${row.score?.[stat.key] || 0}`}
                    style={{ background: stat.color, width: `${Math.max(6, (row.score?.[stat.key] || 0) * 0.56)}px` }}
                  />
                ))}
              </span>
            </div>
          ))}
          {!sorted.length && (
            <p className="teacher-empty">아직 참여한 학생이 없습니다. 학생 화면에서 반 코드를 입력하게 해주세요.</p>
          )}
        </section>
      )}
      <p className="tb-sign">만든 사람 LevLab Yeol</p>
    </main>
  );
}

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// 그림을 칸에 꽉 차게(가운데 기준으로 잘라) 그린다. r = 모서리 둥글기
function drawCover(ctx, img, x, y, w, h, r = 0) {
  const s = Math.max(w / img.width, h / img.height);
  const sw = w / s;
  const sh = h / s;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  ctx.restore();
}

// 긴 한국어 문장을 낱말 단위로 줄 나누기 (낱말 중간에서 자르지 않음)
function wrapWords(ctx, text, maxWidth, maxLines) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    // 띄어쓰기 없이 한 줄보다 긴 낱말만 글자 단위로 나눈다
    while (ctx.measureText(word).width > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && ctx.measureText(word.slice(0, cut)).width > maxWidth) cut -= 1;
      if (line) lines.push(line);
      line = "";
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

async function saveResultCard({ name, room, score, energy, cleared, gems, eggs = 0, returned = 0, earnedBadges = [], title, reflect = {} }) {
  const badgeImgs = await Promise.all(earnedBadges.map((b) => (b.img ? loadImage(b.img) : null)));
  const moodImgs = await Promise.all([reflect.moodPre, reflect.moodPost].map((n) => (n ? loadImage(moodIcon(n)) : null)));
  // 마을 그림: 맨 위 띠(완성된 마을) + 되살린 장소 모음. 못 읽은 그림은 빼고 그린다(하나도 없으면 예전 모양 그대로).
  const sceneQuests = quests.filter((q) => !q.noScene);
  const [headArt, ...sceneLoaded] = await Promise.all([loadImage(ENDING_ART), ...sceneQuests.map((q) => loadImage(sceneThumbOf(q.id)))]);
  const sceneImgs = sceneLoaded.filter(Boolean);
  const promise = (reflect.promise || "").trim();
  const hasMood = !!(reflect.moodPre || reflect.moodPost);
  const extra = (promise ? 110 : 0) + (hasMood ? 84 : 0);
  const HEAD = headArt ? 236 : 0;
  const ALBUM_COLS = 8;
  const ALBUM_GAP = 8;
  const ALBUM_W = (880 - ALBUM_GAP * (ALBUM_COLS - 1)) / ALBUM_COLS;
  const ALBUM_H = Math.round(ALBUM_W * 0.6);
  const albumRows = Math.ceil(sceneImgs.length / ALBUM_COLS);
  const ALBUM = albumRows ? 66 + albumRows * (ALBUM_H + ALBUM_GAP) : 0;
  const W = 1000;
  const H = 880 + extra + HEAD + ALBUM;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1a2e");
  bg.addColorStop(1, "#123047");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  if (headArt) {
    // 완성된 마을 그림을 맨 위에 두르고, 아래쪽은 바탕색으로 스며들게 한다
    drawCover(ctx, headArt, 28, 28, W - 56, HEAD + 30);
    const fade = ctx.createLinearGradient(0, 28 + HEAD - 110, 0, 28 + HEAD + 30);
    fade.addColorStop(0, "rgba(13,31,52,0)");
    fade.addColorStop(1, "rgba(13,31,52,1)");
    ctx.fillStyle = fade;
    ctx.fillRect(28, 28 + HEAD - 110, W - 56, 141);
  }

  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, W - 56, H - 56);

  ctx.translate(0, HEAD);   // 아래 내용은 그림 띠만큼 내려 그린다

  ctx.fillStyle = "#facc15";
  ctx.font = "900 30px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText("공동체 빌더스 · 마을 완성 인증서", 60, 92);

  // 닉네임을 확실히 강조 — "탐험가"로 끝나는 닉네임은 중복 표기하지 않는다
  const displayName = /탐험가$/.test(name) ? name : `${name} 탐험가`;
  ctx.fillStyle = "#7dd3fc";
  ctx.font = "800 22px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(room ? `${room}반 · 닉네임` : "닉네임", 60, 150);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 58px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(displayName, 60, 210);

  ctx.fillStyle = "#94e2b8";
  ctx.font = "800 30px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(`칭호: ${title}`, 60, 262);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 22px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(`16개 미션 완주 · 빛장벽 ${cleared}개 해제 · 마음 조각 ${gems}개 · 에너지 ${energy}`, 60, 304);

  stats.forEach((stat, index) => {
    const y = 366 + index * 70;
    const value = score[stat.key] || 0;
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "800 24px 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText(stat.label, 60, y + 8);
    ctx.fillStyle = "rgba(255,255,255,.16)";
    ctx.beginPath();
    ctx.roundRect(220, y - 16, 640, 30, 15);
    ctx.fill();
    ctx.fillStyle = stat.color;
    ctx.beginPath();
    ctx.roundRect(220, y - 16, Math.max(30, 640 * (value / 100)), 30, 15);
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "900 24px 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText(String(value), 880, y + 8);
  });

  // 수집·성취(도감) 섹션
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(60, 636);
  ctx.lineTo(W - 60, 636);
  ctx.stroke();

  ctx.fillStyle = "#facc15";
  ctx.font = "900 22px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText("수집 · 성취", 60, 676);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 21px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(
    `마음 조각 ${gems}/${treasureSeeds.length}    ·    숨은 장소 ${eggs}/${easterEggs.length}    ·    돌려준 물건 ${returned}/${lostItems.length}`,
    60, 712
  );

  ctx.fillStyle = "#94e2b8";
  ctx.font = "800 20px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(`획득 배지 ${earnedBadges.length}/${badges.length}`, 60, 752);

  // 획득한 배지를 한 줄로 (그림, 못 읽으면 이모지)
  ctx.font = "34px 'Apple SD Gothic Neo', sans-serif";
  ctx.textBaseline = "middle";
  earnedBadges.forEach((b, i) => {
    const img = badgeImgs[i];
    if (img) ctx.drawImage(img, 56 + i * 58, 766, 52, 52);
    else ctx.fillText(b.icon, 60 + i * 58, 792);
  });
  ctx.textBaseline = "alphabetic";

  // 내가 되살린 마을: 미션 장소 그림 모음
  if (albumRows) {
    ctx.fillStyle = "#facc15";
    ctx.font = "900 22px 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText(`내가 되살린 마을 ${sceneImgs.length}곳`, 60, 866);
    sceneImgs.forEach((img, i) => {
      const cx = 60 + (i % ALBUM_COLS) * (ALBUM_W + ALBUM_GAP);
      const cy = 884 + Math.floor(i / ALBUM_COLS) * (ALBUM_H + ALBUM_GAP);
      drawCover(ctx, img, cx, cy, ALBUM_W, ALBUM_H, 10);
      ctx.strokeStyle = "rgba(255,255,255,.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cx, cy, ALBUM_W, ALBUM_H, 10);
      ctx.stroke();
    });
  }

  // 오늘 마무리: 마음 날씨 · 우리 반 약속
  let y = 866 + ALBUM;
  if (hasMood) {
    ctx.fillStyle = "#facc15";
    ctx.font = "900 22px 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText("마음 날씨", 60, y);
    let x = 190;
    ctx.font = "800 22px 'Apple SD Gothic Neo', sans-serif";
    [["시작", reflect.moodPre, moodImgs[0]], ["끝", reflect.moodPost, moodImgs[1]]].forEach(([label, n, img], i) => {
      if (!n) return;
      if (i === 1 && reflect.moodPre) {
        ctx.fillStyle = "#94a3b8";
        ctx.fillText("→", x, y);
        x += 40;
      }
      ctx.fillStyle = "#cbd5e1";
      ctx.fillText(label, x, y);
      x += ctx.measureText(label).width + 8;
      if (img) ctx.drawImage(img, x, y - 30, 40, 40);
      x += 46;
      ctx.fillStyle = "#f8fafc";
      ctx.fillText(MOOD_LBL[n], x, y);
      x += ctx.measureText(MOOD_LBL[n]).width + 28;
    });
    y += 64;
  }
  if (promise) {
    ctx.fillStyle = "#3FE5A0";
    ctx.font = "900 22px 'Apple SD Gothic Neo', sans-serif";
    ctx.fillText("우리 반에 남긴 약속", 60, y);
    ctx.fillStyle = "#f8fafc";
    ctx.font = "800 24px 'Apple SD Gothic Neo', sans-serif";
    wrapWords(ctx, `“${promise}”`, W - 120, 2).forEach((line, i) => ctx.fillText(line, 60, y + 36 + i * 32));
    y += 110;
  }

  const today = new Date().toLocaleDateString("ko-KR");
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 20px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(`${today} · 사회정서교육(SEL) 공동체 활동`, 60, H - HEAD - 44);

  const stamp = new Date().toISOString().slice(0, 10);
  const roomTag = room ? `${room}반_` : "";
  const link = document.createElement("a");
  link.download = `공동체빌더스_${roomTag}${name}_${stamp}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function makeUser() {
  const index = Math.floor(Math.random() * playerPalette.length);
  // 기기 고유 id를 재사용 — '새로 시작'해도 같은 Firestore 문서를 덮어써
  // 교사 화면에 재접속 학생이 두 줄로 보이는 문제를 원천 차단한다.
  let id = null;
  try {
    id = localStorage.getItem("cb_uid");
  } catch {
    // 무시
  }
  if (!id) {
    id = uid();
    try {
      localStorage.setItem("cb_uid", id);
    } catch {
      // 무시
    }
  }
  return {
    id,
    color: playerPalette[index],
    hair: HAIR_OPTIONS[index % 4],
  };
}

// 이스터에그 발견 색종이 — 리렌더마다 값이 바뀌지 않도록 고정 배열(결정론적)
const EGG_CONFETTI = Array.from({ length: 34 }, (_, i) => ({
  left: (i * 41 + 5) % 100,
  delay: (i % 12) * 0.045,
  dur: 1.5 + ((i * 7) % 6) * 0.16,
  rot: (i * 53) % 360,
  drift: ((i % 7) - 3) * 16,
  size: 8 + (i % 3) * 3,
  round: i % 2 === 0,
  slot: i % 4,
}));

function Game() {
  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [savedGame, setSavedGame] = useState(loadSave);
  const started = !!profile;

  // 30명이 동시에 시작해도 겹치지 않도록 광장 둘레 랜덤 지점에 스폰
  const spawn = useMemo(() => {
    const angle = Math.random() * Math.PI * 2;
    return { x: Math.cos(angle) * 5.2, z: Math.sin(angle) * 5.2 };
  }, []);
  // 초기 방향은 카메라를 마주 보게(-3π/4)
  const playerRef = useRef({ x: spawn.x, z: spawn.z, dir: -Math.PI * 0.75, moving: false });
  const inputRef = useRef({ keys: new Set(), joy: { x: 0, y: 0 } });
  const runningRef = useRef(false);
  if (import.meta.env.DEV) {
    globalThis.__cbDebug = { ...globalThis.__cbDebug, playerRef, inputRef, runningRef, treasureSeeds };
  }

  const [playerHud, setPlayerHud] = useState({ x: 0, z: 0, dir: 0 });
  const [nearQuest, setNearQuest] = useState(null);
  const [activeQuest, setActiveQuest] = useState(null);
  // 읽기 게이트: 미션을 열면 잠깐 선택지를 잠가(문제 안 읽고 대충 고르는 것 방지)
  const [choicesReady, setChoicesReady] = useState(true);
  const [readCountdown, setReadCountdown] = useState(0);
  const [solved, setSolved] = useState({});
  const [answered, setAnswered] = useState({});
  const [discovered, setDiscovered] = useState({});
  const [peers, setPeers] = useState({});
  const [fogs, setFogs] = useState(() => fogSeeds.map((fog) => ({ ...fog, cleared: false, dmg: 0 })));
  const [treasures, setTreasures] = useState(() => treasureSeeds.map((t) => ({ ...t, found: false })));
  const [foundEggs, setFoundEggs] = useState({});
  const [eggPopup, setEggPopup] = useState(null);
  // 분실물: 각 물건의 상태(ground|returned) + 지금 들고 있는 물건 + 발견/돌려줌 프롬프트
  const [lost, setLost] = useState(() => lostItems.map((l) => ({ id: l.id, status: "ground", x: l.x, z: l.z })));
  const [carrying, setCarrying] = useState(null);
  const [nearLost, setNearLost] = useState(null);
  const [deliverTarget, setDeliverTarget] = useState(null);
  const [deliverPopup, setDeliverPopup] = useState(null);
  const [codexOpen, setCodexOpen] = useState(false);
  const [albumView, setAlbumView] = useState(null);
  const [endingArtOk, setEndingArtOk] = useState(true);   // 마무리 그림을 못 읽으면 예전 한 줄 배치로   // 도감 「마을 앨범」에서 크게 보는 미션
  const [reflectOpen, setReflectOpen] = useState(false);
  // 오늘 마무리 기록: 시작·끝 마음 날씨(0=안 고름)와 우리 반 약속
  const [reflect, setReflect] = useState({ moodPre: 0, moodPost: 0, promise: "" });
  const [projectiles, setProjectiles] = useState([]);
  const [energy, setEnergy] = useState(0);
  const [toast, setToast] = useState("");
  const [score, setScore] = useState({ self: 20, empathy: 20, relation: 20, community: 20 });
  const [endingDismissed, setEndingDismissed] = useState(false);
  const [classSummary, setClassSummary] = useState(null);
  // 누적 기록: '다시 시작'해도 줄지 않는다 (반 밝기·교사 화면용)
  const [lifetimeCleared, setLifetimeCleared] = useState(0);
  const [lifetimeGems, setLifetimeGems] = useState(0);
  // 무한 정화: 완주(16미션) 후 되살아난 장벽을 부순 누적 횟수 (메인 점수와 별개 보너스 스탯)
  const [purified, setPurified] = useState(0);
  // 마을 완성(16미션 완주) 시각 — 점수 동점 시 '먼저 완주한 순서'로 순위를 가른다 (한 번만 기록)
  const [completedAt, setCompletedAt] = useState(null);
  // 획득한 배지 id (한 번 얻으면 유지 — 장벽 재생성으로 조건이 잠깐 깨져도 유지)
  const [earnedIds, setEarnedIds] = useState({});
  const prevClearedRef = useRef(0);
  const prevGemsRef = useRef(0);
  // 반짝 부스트: 만료 시각(Date.now 기준)
  const boostUntilRef = useRef(0);
  const [boostLeft, setBoostLeft] = useState(0);
  const [muted, setMutedState] = useState(getMuted);
  const [bgmVol, setBgmVol] = useState(getBgmVolume);
  const [sfxVol, setSfxVol] = useState(getSfxVolume);
  const [confirmReset, setConfirmReset] = useState(false);
  // 점수 상승 팝업 (장벽 파괴 시 "+N"이 화면에 떠오름)
  const [scorePops, setScorePops] = useState([]);
  const addScorePop = useCallback((text, kind = "energy") => {
    const id = uid();
    setScorePops((prev) => [...prev.slice(-4), { id, text, kind }]);
    window.setTimeout(() => setScorePops((prev) => prev.filter((p) => p.id !== id)), 1000);
  }, []);

  const fogsRef = useRef(fogs);
  const treasuresRef = useRef(treasures);
  const foundEggsRef = useRef(foundEggs);
  const projectilesRef = useRef(projectiles);
  const nearQuestRef = useRef(null);
  // 분실물: world 렌더용(상태 배열·들고있는 id) + E키 판정용(근접 물건·전달 대상)
  const lostRef = useRef(lost);
  const carryingRef = useRef(null);
  const nearLostRef = useRef(null);
  const deliverTargetRef = useRef(null);
  // 안개 빌런 3마리: 배회하며 깬 장벽에 안개를 되살림, 빛구슬 맞으면 진정(스턴)
  const makeVillains = () => [
    { x: 40, z: 40, tx: 40, tz: 40, stunUntil: 0, active: true },
    { x: -40, z: 40, tx: -40, tz: 40, stunUntil: 0, active: true },
    { x: 40, z: -40, tx: 40, tz: -40, stunUntil: 0, active: true },
  ];
  const villainsRef = useRef(makeVillains());
  const worldProgressRef = useRef(0);
  const lastVillainToastRef = useRef(0);

  const completed = Object.values(solved).filter(Boolean).length;
  const discoveredCount = Object.values(discovered).filter(Boolean).length;
  const peerList = Object.values(peers);
  const onlineCount = peerList.length + 1;
  // 왼쪽 패널 초상 줄은 6칸: 나 1칸 + 친구(넘치면 4명 + '더 있음') + 남는 칸은 마을 주민
  const partyPeerShown = peerList.length > 5 ? 4 : peerList.length;
  const partyMineCols = 1 + partyPeerShown + (peerList.length > partyPeerShown ? 1 : 0);
  const partyNpcCount = 6 - partyMineCols;
  const clearedFogCount = fogs.filter((fog) => fog.cleared).length;
  const treasureCount = treasures.filter((t) => t.found).length;
  const eggCount = Object.values(foundEggs).filter(Boolean).length;
  const returnedCount = lost.filter((l) => l.status === "returned").length;
  const endingOpen = started && completed === quests.length && !endingDismissed;
  // 무한 정화 모드: 16미션 완주 + 엔딩을 닫고(계속 탐험) 나면 활성 — 빌런이 계속 안개를 되살린다
  const endlessMode = started && completed === quests.length && endingDismissed;
  const endlessModeRef = useRef(false);
  endlessModeRef.current = endlessMode;

  // 도감용 수집 현황 + 배지 획득 판정
  const codexStats = {
    solved: completed,
    cleared: clearedFogCount,
    fogTotal: fogs.length,
    gems: treasureCount,
    gemTotal: treasures.length,
    eggs: eggCount,
    returned: returnedCount,
    lostTotal: lostItems.length,
  };
  // 배지는 한 번 얻으면 유지 — 빌런이 장벽을 되살려 clearedFogCount가 줄어도 다시 잠기지 않는다.
  const earnedBadges = badges.filter((b) => earnedIds[b.id]);

  // 조건을 처음 만족한 배지를 영구 획득 목록에 추가(제거는 안 함)
  useEffect(() => {
    const newly = badges.filter((b) => !earnedIds[b.id] && b.check(codexStats));
    if (newly.length) {
      setEarnedIds((prev) => ({ ...prev, ...Object.fromEntries(newly.map((b) => [b.id, true])) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, clearedFogCount, treasureCount, eggCount, returnedCount]);

  // 마을 완성(16미션) 시각을 딱 한 번 기록 — 교사 화면에서 동점 시 '먼저 완주한 순서'로 순위를 가른다
  useEffect(() => {
    if (started && completed === quests.length && !completedAt) setCompletedAt(Date.now());
  }, [started, completed, completedAt]);

  // 화면 전체를 덮는 창(도감·잠깐 멈춤 메뉴·이스터에그·돌려주기)이 떠 있는 동안도 세계를 멈춘다.
  // 흐린 막 뒤에서 3D 를 계속 그리면 막을 매번 다시 흐리게 계산해 기기가 가장 뜨거워지는 구간이 된다.
  const modalOpen = codexOpen || confirmReset || !!eggPopup || !!deliverPopup;
  runningRef.current = started && !activeQuest && !endingOpen && !reflectOpen && !modalOpen;

  useEffect(() => {
    fogsRef.current = fogs;
  }, [fogs]);

  useEffect(() => {
    treasuresRef.current = treasures;
  }, [treasures]);

  useEffect(() => {
    foundEggsRef.current = foundEggs;
  }, [foundEggs]);

  useEffect(() => {
    lostRef.current = lost;
  }, [lost]);

  useEffect(() => {
    carryingRef.current = carrying?.id || null;
  }, [carrying]);

  // 누적 카운터: 증가분만 더한다 (리셋으로 0이 되어도 누적은 유지)
  // 주의: 델타는 반드시 지역 변수로 먼저 캡처한다 — setState 업데이터 안에서
  // ref.current를 직접 읽으면, 업데이터가 실행되는 시점엔 이미 아래에서
  // ref가 최신값으로 덮어써진 뒤라 delta가 항상 0이 되는 버그가 있었다.
  useEffect(() => {
    const prev = prevClearedRef.current;
    if (clearedFogCount > prev) {
      const delta = clearedFogCount - prev;
      setLifetimeCleared((v) => v + delta);
      // 완주 후(무한 정화 모드)에 부순 장벽만 '정화 횟수'로 따로 센다
      if (endlessModeRef.current) setPurified((v) => v + delta);
    }
    prevClearedRef.current = clearedFogCount;
  }, [clearedFogCount]);

  // 무한 정화 모드 진입 안내 (한 번만)
  const endlessAnnouncedRef = useRef(false);
  useEffect(() => {
    if (endlessMode && !endlessAnnouncedRef.current) {
      endlessAnnouncedRef.current = true;
      setToast("⚡ 무한 정화 모드! 안개 빌런이 계속 나타나요 — 마음껏 정화해 보세요!");
    }
    if (!endlessMode) endlessAnnouncedRef.current = false;
  }, [endlessMode]);

  if (import.meta.env.DEV) {
    globalThis.__cbDebug = { ...globalThis.__cbDebug, lifetimeCleared, lifetimeGems, prevClearedRef, projectilesRef, fogsRef, playerHud, easterEggs, foundEggs, villainsRef, worldProgressRef, setEggPopup, lostItems, lost, carrying, lostRef, carryingRef };
  }

  useEffect(() => {
    const prev = prevGemsRef.current;
    if (treasureCount > prev) {
      setLifetimeGems((v) => v + treasureCount - prev);
    }
    prevGemsRef.current = treasureCount;
  }, [treasureCount]);

  // 부스트 잔여 시간 표시
  useEffect(() => {
    const interval = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((boostUntilRef.current - Date.now()) / 1000));
      setBoostLeft((prev) => (prev === left ? prev : left));
    }, 250);
    return () => window.clearInterval(interval);
  }, []);

  // 진행 자동 저장: 최신 상태를 담는 저장 함수를 렌더마다 갱신해 두고,
  // 상태 변화 시 0.8초 디바운스 + 4초 주기 저장(이동 중 위치 보존)을 병행한다
  const saveNowRef = useRef(() => {});
  saveNowRef.current = () => {
    if (!started || !user) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        profile,
        user,
        solved,
        answered,
        discovered,
        cleared: fogs.filter((f) => f.cleared).map((f) => f.id),
        found: treasures.filter((t) => t.found).map((t) => t.id),
        eggs: foundEggs,
        lost: lost.map((l) => ({ id: l.id, status: l.status, x: l.x, z: l.z })),
        energy,
        score,
        endingDismissed,
        lifetimeCleared,
        lifetimeGems,
        purified,
        completedAt,
        earnedIds,
        reflect,
        pos: { x: playerRef.current.x, z: playerRef.current.z },
      }));
    } catch {
      // 저장 공간 부족 등은 무시
    }
  };

  useEffect(() => {
    if (!started || !user) return undefined;
    const timer = window.setTimeout(() => saveNowRef.current(), 800);
    return () => window.clearTimeout(timer);
  }, [started, user, profile, solved, answered, discovered, fogs, treasures, foundEggs, lost, energy, score, endingDismissed, lifetimeCleared, lifetimeGems, purified, completedAt, earnedIds, reflect]);

  useEffect(() => {
    if (!started || !user) return undefined;
    const interval = window.setInterval(() => saveNowRef.current(), 4000);
    return () => window.clearInterval(interval);
  }, [started, user]);

  useEffect(() => {
    projectilesRef.current = projectiles;
  }, [projectiles]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // iOS Safari 주소창으로 100vh가 화면보다 커져 하단이 잘리는 문제 방지:
  // 실제 보이는 높이(visualViewport)를 --app-height로 반영한다
  useEffect(() => {
    const vv = window.visualViewport;
    const apply = () => {
      const h = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty("--app-height", `${h}px`);
    };
    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    vv?.addEventListener("resize", apply);
    vv?.addEventListener("scroll", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      vv?.removeEventListener("resize", apply);
      vv?.removeEventListener("scroll", apply);
    };
  }, []);

  // 월드 rAF 루프에서 140ms마다 호출되는 위치 동기화 (변화 없으면 리렌더 생략)
  const handleSync = useCallback((snapshot) => {
    setPlayerHud((prev) => (
      Math.abs(prev.x - snapshot.x) < 0.01 &&
      Math.abs(prev.z - snapshot.z) < 0.01 &&
      Math.abs(prev.dir - snapshot.dir) < 0.01
        ? prev
        : snapshot
    ));
  }, []);

  const handleBlocked = useCallback(() => {
    setToast("길이 빛장벽에 막혔습니다. 공감 빛구슬로 깨뜨리고 지나가세요.");
  }, []);

  useEffect(() => {
    const newlyFound = quests.filter(
      (quest) => !discovered[quest.id] && Math.hypot(quest.pos[0] - playerHud.x, quest.pos[1] - playerHud.z) < 7.5
    );
    if (newlyFound.length) {
      setDiscovered((prev) => ({
        ...prev,
        ...Object.fromEntries(newlyFound.map((quest) => [quest.id, true])),
      }));
      setToast(`보물 거점 발견: ${newlyFound.map((quest) => quest.title).join(", ")}`);
      sfx.discover();
    }

    // 숨은 마음 조각 줍기
    const picked = treasures.filter(
      (t) => !t.found && Math.hypot(t.x - playerHud.x, t.z - playerHud.z) < 1.7
    );
    if (picked.length) {
      const foundTotal = treasures.filter((t) => t.found).length + picked.length;
      setTreasures((prev) => prev.map((t) => (
        picked.some((p) => p.id === t.id) ? { ...t, found: true } : t
      )));
      setEnergy((prev) => Math.min(100, prev + picked.length * 6));
      setToast(`✨ 숨은 마음 조각 발견! (${foundTotal}/${treasureSeeds.length}) 에너지 +${picked.length * 6}`);
      sfx.pickup();
    }

    // 숨은 이스터에그 발견 → 전용 축하 팝업
    const newEgg = easterEggs.find(
      (egg) => !foundEggs[egg.id] && Math.hypot(egg.x - playerHud.x, egg.z - playerHud.z) < 1.8
    );
    if (newEgg) {
      const total = Object.values(foundEggs).filter(Boolean).length + 1;
      setFoundEggs((prev) => ({ ...prev, [newEgg.id]: true }));
      setEggPopup({ ...newEgg, count: total });
      setEnergy((prev) => Math.min(100, prev + 10));
      sfx.ending();
    }

    let nearest = null;
    let nearestDistance = Infinity;
    quests.forEach((quest) => {
      const distance = Math.hypot(quest.pos[0] - playerHud.x, quest.pos[1] - playerHud.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = quest;
      }
    });
    const next = nearestDistance < NPC_RADIUS ? nearest : null;
    nearQuestRef.current = next;
    setNearQuest(next);

    // 분실물: 들고 있지 않을 때만 근처 물건을 '줍기' 후보로, 들고 있으면 주인 근접 시 '돌려주기' 후보로
    let pickable = null;
    let deliver = null;
    if (carrying) {
      const owner = quests.find((q) => q.id === carrying.owner);
      if (owner && Math.hypot(owner.pos[0] - playerHud.x, owner.pos[1] - playerHud.z) < NPC_RADIUS) {
        deliver = carrying;
      }
    } else {
      pickable = lostItems.find((item) => {
        const state = lost.find((l) => l.id === item.id);
        return state?.status === "ground" && Math.hypot(state.x - playerHud.x, state.z - playerHud.z) < 2.4;
      }) || null;
    }
    nearLostRef.current = pickable;
    deliverTargetRef.current = deliver;
    setNearLost(pickable);
    setDeliverTarget(deliver);
  }, [playerHud, discovered, treasures, foundEggs, lost, carrying]);

  const openQuest = useCallback((quest) => {
    // 정답이 늘 왼쪽에 오지 않도록 선택지 순서를 무작위로 섞는다 (패턴 학습 방지)
    const choices = Math.random() < 0.5 ? [...quest.choices] : [...quest.choices].reverse();
    setActiveQuest({ quest, view: null, choices });
  }, []);
  const openQuestRef = useRef(openQuest);
  openQuestRef.current = openQuest;

  // 분실물 줍기 — 한 번에 하나만. 들면 주인 안내 표식이 켜진다.
  const pickUpLost = useCallback((item) => {
    if (!item) return;
    setCarrying(item);
    carryingRef.current = item.id;
    setToast(`${item.icon} ${item.name}을(를) 주웠어요. 주인 ${item.ownerName}에게 돌려줄까요?`);
    sfx.pickup();
  }, []);
  const pickUpLostRef = useRef(pickUpLost);
  pickUpLostRef.current = pickUpLost;

  // 분실물 내려놓기 — 지금 서 있는 자리에 그대로 놓는다.
  const dropLost = useCallback(() => {
    setCarrying((cur) => {
      if (!cur) return null;
      const px = Math.round(playerRef.current.x);
      const pz = Math.round(playerRef.current.z);
      setLost((prev) => prev.map((l) => (l.id === cur.id ? { ...l, status: "ground", x: px, z: pz } : l)));
      carryingRef.current = null;
      setToast(`${cur.icon} ${cur.name}을(를) 여기에 내려놓았어요.`);
      return null;
    });
  }, []);
  const dropLostRef = useRef(dropLost);
  dropLostRef.current = dropLost;

  // 분실물 돌려주기 — 주인에게 전달하면 사연 팝업 + 에너지 보상
  const deliverLost = useCallback(() => {
    setCarrying((cur) => {
      if (!cur) return cur;
      setLost((prev) => prev.map((l) => (l.id === cur.id ? { ...l, status: "returned" } : l)));
      carryingRef.current = null;
      setDeliverPopup(cur);
      setEnergy((prev) => Math.min(100, prev + 12));
      sfx.solve();
      return null;
    });
  }, []);
  const deliverLostRef = useRef(deliverLost);
  deliverLostRef.current = deliverLost;

  const shoot = useCallback(() => {
    const player = playerRef.current;
    // 정면 벡터 = (-sin dir, -cos dir)
    const dx = -Math.sin(player.dir);
    const dz = -Math.cos(player.dir);
    setProjectiles((prev) => [
      ...prev.slice(-8),
      {
        id: uid(),
        x: player.x + dx * 0.85,
        z: player.z + dz * 0.85,
        dx,
        dz,
        life: 34,
      },
    ]);
  }, []);
  const shootRef = useRef(shoot);
  shootRef.current = shoot;

  // 빛구슬 버튼: 누르는 즉시 1발 + 꾹 누르고 있으면 연사 (이동하며 발사 가능)
  const holdFireRef = useRef(0);
  const startFiring = useCallback(() => {
    if (!runningRef.current) return;
    shootRef.current();
    window.clearInterval(holdFireRef.current);
    holdFireRef.current = window.setInterval(() => {
      if (runningRef.current) shootRef.current();
    }, 240);
  }, []);
  const stopFiring = useCallback(() => {
    window.clearInterval(holdFireRef.current);
    holdFireRef.current = 0;
  }, []);
  useEffect(() => () => window.clearInterval(holdFireRef.current), []);

  // 키보드는 마운트 시 1회만 바인딩하고, 최신 상태는 ref로 읽는다.
  // event.code(물리적 키 위치)로 판정해 한글/영문 입력 상태와 무관하게 동작한다.
  useEffect(() => {
    const codeMap = {
      KeyW: "up", ArrowUp: "up",
      KeyS: "down", ArrowDown: "down",
      KeyA: "left", ArrowLeft: "left",
      KeyD: "right", ArrowRight: "right",
    };
    const onDown = (event) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      const move = codeMap[event.code];
      if (move) {
        event.preventDefault();
        inputRef.current.keys.add(move);
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat && runningRef.current) shootRef.current();
      }
      if (event.code === "KeyE" && !event.repeat && runningRef.current) {
        // 우선순위: 돌려주기 > 줍기 > 미션 대화 > (들고 있으면) 내려놓기
        if (deliverTargetRef.current) {
          deliverLostRef.current();
        } else if (nearLostRef.current) {
          pickUpLostRef.current(nearLostRef.current);
        } else if (nearQuestRef.current) {
          openQuestRef.current(nearQuestRef.current);
        } else if (carryingRef.current) {
          dropLostRef.current();
        }
      }
    };
    const onUp = (event) => {
      const move = codeMap[event.code];
      if (move) inputRef.current.keys.delete(move);
    };
    const onBlur = () => inputRef.current.keys.clear();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // 빛구슬 진행/충돌 판정
  useEffect(() => {
    const interval = window.setInterval(() => {
      const current = projectilesRef.current;
      if (!current.length) return;
      const fogsNow = fogsRef.current;
      const next = [];
      const hitFogIds = new Set();
      let villainHitNow = false;
      const villains = villainsRef.current;
      const nowMs = Date.now();

      current.forEach((projectile) => {
        const moved = {
          ...projectile,
          x: projectile.x + projectile.dx * 1.2,
          z: projectile.z + projectile.dz * 1.2,
          life: projectile.life - 1,
        };
        // 빌런 명중 → 진정(스턴)
        const hitVillain = villains.find(
          (v) => v.active && v.stunUntil < nowMs && Math.hypot(v.x - moved.x, v.z - moved.z) < 1.7
        );
        if (hitVillain) {
          hitVillain.stunUntil = nowMs + 5000;
          villainHitNow = true;
          return;
        }
        const hit = fogsNow.find(
          (fog) => !fog.cleared && Math.hypot(fog.x - moved.x, fog.z - moved.z) < 1.45
        );
        if (hit) {
          hitFogIds.add(hit.id);
        } else if (moved.life > 0 && Math.abs(moved.x) < HALF && Math.abs(moved.z) < HALF) {
          next.push(moved);
        }
      });

      if (villainHitNow) {
        setToast("💛 안개 빌런을 진정시켰어요! 잠시 안개를 멈춰요.");
        sfx.solve();
      }

      if (hitFogIds.size) {
        // 이번 타격으로 실제 '파괴'된 장벽만 점수·팝업에 반영 (hp 여러 방)
        const snapshot = fogsRef.current;
        let destroyed = 0;
        hitFogIds.forEach((id) => {
          const fog = snapshot.find((f) => f.id === id);
          if (fog && !fog.cleared && (fog.dmg || 0) + 1 >= (fog.hp || 1)) destroyed += 1;
        });

        setFogs((prev) => prev.map((fog) => {
          if (!hitFogIds.has(fog.id) || fog.cleared) return fog;
          const dmg = (fog.dmg || 0) + 1;
          return dmg >= (fog.hp || 1) ? { ...fog, dmg, cleared: true } : { ...fog, dmg };
        }));

        if (destroyed > 0) {
          const gain = destroyed * 12;
          setEnergy((prev) => Math.min(100, prev + gain));
          setScore((prev) => ({
            ...prev,
            empathy: Math.min(100, prev.empathy + destroyed * 4),
            community: Math.min(100, prev.community + destroyed * 5),
          }));
          addScorePop(`+${gain}`);
          setToast(`빛장벽 ${destroyed}개 해제! 공동체 에너지 +${gain}`);
          sfx.barrier();
        } else {
          sfx.barrier();
        }
      }
      setProjectiles(next);
    }, 70);
    return () => window.clearInterval(interval);
  }, []);

  // 안개 빌런 3마리: 주기적으로 각자 근처 깬 장벽에 안개를 되살린다 (스턴 아닐 때만).
  // 마을이 밝아질수록 한 마리씩 사라진다 — 노력하면 이긴다는 감각.
  useEffect(() => {
    if (!started) return undefined;
    const iv = window.setInterval(() => {
      const now = Date.now();
      const prog = worldProgressRef.current;
      // 진행도에 따라 활동하는 빌런 수를 줄인다 (0.55→2마리, 0.75→1마리, 0.9→0마리).
      // 무한 정화 모드(완주 후)에는 2마리를 계속 유지해 장벽을 끝없이 되살린다.
      const allowedActive = endlessModeRef.current
        ? 2
        : prog >= 0.9 ? 0 : prog >= 0.75 ? 1 : prog >= 0.55 ? 2 : 3;
      const villains = villainsRef.current;
      let activeCount = villains.filter((v) => v.active).length;
      villains.forEach((v) => {
        if (v.active && activeCount > allowedActive) {
          v.active = false;
          activeCount -= 1;
          if (!endlessModeRef.current) setToast("🌈 마을이 밝아지자 안개 빌런 하나가 스르르 사라졌어요!");
        }
      });
      // 무한 정화 모드: 필요하면 사라졌던 빌런을 다시 깨운다
      if (endlessModeRef.current) {
        villains.forEach((v) => {
          if (!v.active && activeCount < allowedActive) {
            v.active = true;
            v.stunUntil = 0;
            activeCount += 1;
          }
        });
      }

      const revivedIds = [];
      const px = playerRef.current.x;
      const pz = playerRef.current.z;
      villains.forEach((v) => {
        if (!v.active || v.stunUntil > now) return;
        const target = fogsRef.current.find(
          (f) =>
            f.cleared &&
            !revivedIds.includes(f.id) &&
            Math.hypot(f.x - v.x, f.z - v.z) < 11 &&
            // 플레이어 발밑·바로 옆엔 되살리지 않는다 (가둠 방지)
            Math.hypot(f.x - px, f.z - pz) > 4.5
        );
        if (target) revivedIds.push(target.id);
      });
      if (revivedIds.length) {
        setFogs((prev) => prev.map((f) => (revivedIds.includes(f.id) ? { ...f, cleared: false, dmg: 0 } : f)));
        if (now - lastVillainToastRef.current > 4000) {
          lastVillainToastRef.current = now;
          setToast(`😈 안개 빌런이 안개를 ${revivedIds.length}곳에 다시 퍼뜨렸어요! 빛구슬로 막아요.`);
        }
      }
    }, 2600);
    return () => window.clearInterval(iv);
  }, [started]);

  // 로컬 멀티플레이(WS): http 환경에서만, 접속은 1회만 맺고 위치는 주기 전송
  useEffect(() => {
    if (!started || !user) return undefined;
    if (window.location.protocol !== "http:") return undefined;
    let socket;
    try {
      socket = new WebSocket(`ws://${window.location.hostname}:5183`);
    } catch {
      return undefined;
    }
    const publish = () => {
      if (socket.readyState !== WebSocket.OPEN) return;
      const player = playerRef.current;
      socket.send(JSON.stringify({
        type: "player-state",
        user: { id: user.id, name: profile.name, color: user.color, hair: user.hair },
        player: { x: player.x, z: player.z, dir: player.dir },
        time: Date.now(),
      }));
    };
    socket.onopen = publish;
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type !== "players") return;
        setPeers(Object.fromEntries(
          message.players
            .filter((peer) => peer.id !== user.id)
            .map((peer) => [peer.id, peer])
        ));
      } catch {
        // 잘못된 메시지는 무시
      }
    };
    socket.onerror = () => setPeers({});
    const interval = window.setInterval(publish, 700);
    return () => {
      window.clearInterval(interval);
      socket.close();
      setPeers({});
    };
  }, [started, profile, user]);

  // 우리 반 모드: 반 밝기 '요약 1문서'만 구독한다(전체 컬렉션 구독 금지 — read O(N²)→O(N)).
  // 요약은 교사 화면이 대신 집계해 기록한다. 교사 화면이 없으면 개인 진행으로 자연 폴백.
  useEffect(() => {
    if (!profile?.room) return undefined;
    let unsub = null;
    let cancelled = false;
    import("./lib/firebase.js")
      .then((fb) => {
        if (cancelled) return;
        unsub = fb.watchSummary(profile.room, (data) => setClassSummary(data));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (unsub) unsub();
      setClassSummary(null);
    };
  }, [profile]);

  // 우리 반 모드: 진행 상황을 2.5초 디바운스로 Firestore에 기록 (장벽·조각은 누적값).
  // write 부하를 줄이려 '자주 바뀌는 energy'는 트리거(deps)에서 제외한다 — 미션·장벽·조각
  // 등 의미 있는 변화가 일어날 때 함께 최신 energy가 실려 나가므로 대시보드엔 충분히 반영된다.
  // 지금 상태를 반 기록에 바로 올리는 함수 (자동저장 타이머·홈으로 나가기에서 함께 쓴다)
  const pushRemoteRef = useRef(() => {});
  pushRemoteRef.current = () => {
    if (!profile?.room || !user) return;
    const room = profile.room;
    const body = {
      ...reflectFields(reflect),
      name: profile.name,
      color: user.color,
      found: discoveredCount,
      solvedCount: completed,
      cleared: lifetimeCleared,
      gems: lifetimeGems,
      returned: returnedCount,
      eggs: eggCount,
      badges: earnedBadges.length,
      badgeIcons: earnedBadges.map((b) => b.icon).join(""),
      purified,
      completedAt: completedAt ?? null,
      energy,
      score,
      done: completed === quests.length,
    };
    import("./lib/firebase.js")
      .then((fb) => fb.pushProgress(room, user.id, body, REFLECT_KEYS))
      .catch(() => {});
  };
  const remotePendingRef = useRef(false);
  useEffect(() => {
    if (!profile?.room || !user) return undefined;
    remotePendingRef.current = true;
    const timer = window.setTimeout(() => {
      remotePendingRef.current = false;
      pushRemoteRef.current();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [profile, user, discoveredCount, completed, lifetimeCleared, lifetimeGems, returnedCount, eggCount, earnedBadges.length, purified, completedAt, score, reflect]);

  // fresh: 새로 시작 — 지난번 마음 날씨·약속을 비우고 이번 시작 날씨만 남긴다
  const joinRoom = (room, name, userInfo, fresh = null) => {
    import("./lib/firebase.js")
      .then(async (fb) => {
        await fb.pushProgress(room, userInfo.id, {
          ...(fresh ? reflectFields(fresh) : {}),
          name,
          color: userInfo.color,
          found: 0,
          solvedCount: 0,
          cleared: 0,
          gems: 0,
          returned: 0,
          eggs: 0,
          badges: 0,
          badgeIcons: "",
          purified: 0,
          energy: 0,
          score: fresh ? { self: 20, empathy: 20, relation: 20, community: 20 } : score,
          done: false,
        }, fresh ? REFLECT_KEYS : []);
        setToast(`우리 반(${room})에 연결되었습니다. 마을을 깨워 볼까요?`);
      })
      .catch(() => setToast("우리 반 연결에 실패했습니다. 혼자 모드로 시작합니다."));
  };

  const continueGame = () => {
    const save = loadSave();
    if (!save) return;
    initAudio();
    setUser(save.user);
    setSolved(save.solved || {});
    setAnswered(save.answered || {});
    setDiscovered(save.discovered || {});
    const restoredFogs = fogSeeds.map((f) => ({ ...f, dmg: 0, cleared: (save.cleared || []).includes(f.id) }));
    setFogs(restoredFogs);
    fogsRef.current = restoredFogs;
    const restoredTreasures = treasureSeeds.map((t) => ({ ...t, found: (save.found || []).includes(t.id) }));
    setTreasures(restoredTreasures);
    setFoundEggs(save.eggs || {});
    treasuresRef.current = restoredTreasures;
    const restoredLost = lostItems.map((l) => {
      const saved = (save.lost || []).find((s) => s.id === l.id);
      if (saved) return { id: l.id, status: saved.status, x: saved.x ?? l.x, z: saved.z ?? l.z };
      // 구버전 세이브 호환: returned 배열만 있던 시절
      const wasReturned = (save.returned || []).includes(l.id);
      return { id: l.id, status: wasReturned ? "returned" : "ground", x: l.x, z: l.z };
    });
    setLost(restoredLost);
    lostRef.current = restoredLost;
    setCarrying(null);
    carryingRef.current = null;
    setEnergy(save.energy || 0);
    setScore(save.score || { self: 20, empathy: 20, relation: 20, community: 20 });
    setEndingDismissed(!!save.endingDismissed);
    prevClearedRef.current = restoredFogs.filter((f) => f.cleared).length;
    prevGemsRef.current = restoredTreasures.filter((t) => t.found).length;
    setLifetimeCleared(save.lifetimeCleared ?? prevClearedRef.current);
    setLifetimeGems(save.lifetimeGems ?? prevGemsRef.current);
    setPurified(save.purified ?? 0);
    setCompletedAt(save.completedAt ?? null);
    setEarnedIds(save.earnedIds ?? {});
    setReflect({ moodPre: 0, moodPost: 0, promise: "", ...(save.reflect || {}) });
    playerRef.current = {
      x: save.pos?.x ?? spawn.x,
      z: save.pos?.z ?? spawn.z,
      dir: -Math.PI * 0.75,
      moving: false,
    };
    setPlayerHud({ x: playerRef.current.x, z: playerRef.current.z, dir: 0 });
    setProfile(save.profile);
    if (save.profile.room) joinRoom(save.profile.room, save.profile.name, save.user);
    else setToast("이어서 탐험을 시작합니다!");
  };

  const startGame = (name, room, moodPre = 0) => {
    initAudio();
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // 무시
    }
    // 같은 탭에서 홈으로 나갔다가 새로 시작하면 앞 판(다른 반일 수도)의 기록이 따라오지 않게 모두 비운다
    resetWorld();
    setLifetimeCleared(0);
    setLifetimeGems(0);
    prevClearedRef.current = 0;
    prevGemsRef.current = 0;
    const newUser = makeUser();
    setUser(newUser);
    setProfile({ name, room });
    const fresh = { moodPre, moodPost: 0, promise: "" };
    setReflect(fresh);
    if (room) {
      joinRoom(room, name, newUser, fresh);
    } else {
      setToast("빛장벽을 깨고 보물 거점을 찾아보세요!");
    }
  };

  const choose = (choice) => {
    if (!activeQuest) return;
    const quest = activeQuest.quest;
    const alreadySolved = !!solved[quest.id];
    if (!alreadySolved) {
      if (choice.good) {
        setScore((prev) => ({ ...prev, [quest.stat]: Math.min(100, prev[quest.stat] + gainForStat(quest.stat)) }));
        setEnergy((prev) => Math.min(100, prev + 8));
        setSolved((prev) => ({ ...prev, [quest.id]: true }));
        sfx.solve();
      } else if (!answered[quest.id]) {
        setScore((prev) => ({ ...prev, [quest.stat]: Math.min(100, prev[quest.stat] + 5) }));
        sfx.bad();
      }
    }
    setAnswered((prev) => ({ ...prev, [quest.id]: true }));
    setActiveQuest({ quest, view: "result", choice });
  };

  // 읽기 게이트: 새 미션(아직 안 푼 것)을 열면 문제 길이에 비례해 2.5~5초간 선택지를 잠근다.
  // 문제를 최소한 '읽는 시간'을 확보 — 대충 답 찍고 넘어가는 것 방지.
  useEffect(() => {
    const freshAsk = activeQuest && !activeQuest.view && !solved[activeQuest.quest.id];
    if (!freshAsk) {
      setChoicesReady(true);
      setReadCountdown(0);
      return undefined;
    }
    setChoicesReady(false);
    const problem = activeQuest.quest.problem || "";
    const delayMs = Math.min(5000, Math.max(2500, problem.length * 55));
    setReadCountdown(Math.ceil(delayMs / 1000));
    const done = window.setTimeout(() => {
      setChoicesReady(true);
      setReadCountdown(0);
    }, delayMs);
    const tick = window.setInterval(() => setReadCountdown((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => {
      window.clearTimeout(done);
      window.clearInterval(tick);
    };
  }, [activeQuest, solved]);

  // 월드(미션·장벽·보물·분실물·점수)를 처음 상태로 — '처음부터 다시'와 '새로 시작'이 함께 쓴다
  const resetWorld = () => {
    playerRef.current = { x: spawn.x, z: spawn.z, dir: -Math.PI * 0.75, moving: false };
    setPlayerHud({ x: spawn.x, z: spawn.z, dir: 0 });
    setSolved({});
    setAnswered({});
    setDiscovered({});
    const resetFogs = fogSeeds.map((fog) => ({ ...fog, cleared: false, dmg: 0 }));
    setFogs(resetFogs);
    fogsRef.current = resetFogs;
    const resetTreasures = treasureSeeds.map((t) => ({ ...t, found: false }));
    setTreasures(resetTreasures);
    treasuresRef.current = resetTreasures;
    setFoundEggs({});
    const resetLost = lostItems.map((l) => ({ id: l.id, status: "ground", x: l.x, z: l.z }));
    setLost(resetLost);
    lostRef.current = resetLost;
    setCarrying(null);
    carryingRef.current = null;
    villainsRef.current = makeVillains();
    setProjectiles([]);
    projectilesRef.current = [];
    setEnergy(0);
    setPurified(0);
    setCompletedAt(null);
    setEarnedIds({});
    setScore({ self: 20, empathy: 20, relation: 20, community: 20 });
    setEndingDismissed(false);
    setActiveQuest(null);
    setConfirmReset(false);
  };
  const reset = () => {
    resetWorld();
    // 새 판이니 지난 판의 '다 마친 뒤' 날씨와 약속은 비운다 (오늘 시작 날씨는 그대로)
    setReflect((r) => ({ ...r, moodPost: 0, promise: "" }));
    setToast("공동체 월드가 다시 시작되었습니다.");
  };

  // 시작 화면으로 나가기 — 진행은 자동저장되므로 '이어서 하기'로 복귀 가능
  const goHome = () => {
    saveNowRef.current();          // 현재 진행을 즉시 저장
    // 2.5초 자동저장을 기다리던 변경(방금 남긴 약속 등)은 나가기 전에 반 기록에도 바로 올린다
    if (remotePendingRef.current) { remotePendingRef.current = false; pushRemoteRef.current(); }
    setSavedGame(loadSave());      // 시작 화면의 '이어서 하기'에 최신 진행 반영
    setActiveQuest(null);
    setConfirmReset(false);
    setProfile(null);              // started=false → 시작 화면 표시
  };

  // 가장 가까운 미해결 거점으로 향하는 화면 기준 안내 각도
  const guide = useMemo(() => {
    let best = null;
    let bestDistance = Infinity;
    quests.forEach((quest) => {
      if (solved[quest.id]) return;
      const distance = Math.hypot(quest.pos[0] - playerHud.x, quest.pos[1] - playerHud.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = quest;
      }
    });
    if (!best || bestDistance < NPC_RADIUS) return null;
    const dx = best.pos[0] - playerHud.x;
    const dz = best.pos[1] - playerHud.z;
    const angle = Math.atan2((dx + dz) / Math.SQRT2, (dx - dz) / Math.SQRT2);
    return { quest: best, distance: Math.round(bestDistance), angle };
  }, [playerHud, solved]);

  const averageScore = Math.round(stats.reduce((sum, stat) => sum + score[stat.key], 0) / stats.length);
  const endingTitle = averageScore >= 85 ? "마을의 건축가" : averageScore >= 70 ? "공동체 정원사" : "따뜻한 탐험가";

  // 인증서 저장 — 미션 점수 + 도감 수집·성취를 함께 담는다. 엔딩·도감 어디서든 호출 가능.
  const saveCertificate = () => saveResultCard({
    name: profile.name,
    room: profile.room,
    score,
    energy,
    cleared: clearedFogCount,
    gems: treasureCount,
    eggs: eggCount,
    returned: returnedCount,
    earnedBadges,
    title: endingTitle,
    reflect,
  });

  // 우리 반 마을 밝기: 교사 화면이 집계해 준 요약(총 깬 장벽·인원)으로 계산
  const classBrightness = useMemo(() => {
    if (!classSummary || !classSummary.count) return null;
    const total = classSummary.total || 0;
    const goal = Math.max(fogSeeds.length, classSummary.count * 30);
    return { total, ratio: Math.min(1, total / goal) };
  }, [classSummary]);

  const personalProgress = (completed / quests.length) * 0.75 + (clearedFogCount / fogs.length) * 0.25;
  // 반 모드에서는 반 전체 밝기와 개인 진행 중 더 밝은 쪽으로 안개가 걷힌다
  const worldProgress = classBrightness ? Math.max(personalProgress, classBrightness.ratio) : personalProgress;
  worldProgressRef.current = worldProgress;

  const dialogView = activeQuest
    ? activeQuest.view || (solved[activeQuest.quest.id] ? "recap" : "ask")
    : null;

  // 작은 화면에서는 대화창 안을 스크롤해 선택지를 고른다 → 화면이 바뀌면(질문→결과) 맨 위부터 다시 보이게
  const dialogBoxRef = useRef(null);
  const dialogQuestId = activeQuest?.quest.id;
  useEffect(() => {
    if (dialogBoxRef.current) dialogBoxRef.current.scrollTop = 0;
  }, [dialogView, dialogQuestId]);
  // 미션 창을 열면 그 장소 그림을 미리 받아 둔다 → 답을 고른 순간 바로 보인다
  useEffect(() => {
    if (!dialogQuestId) return;
    const quest = quests.find((q) => q.id === dialogQuestId);
    if (quest && !quest.noScene) new Image().src = sceneOf(quest.id);
  }, [dialogQuestId]);

  // 엔딩 팡파레 (1회)
  const endingPlayedRef = useRef(false);
  useEffect(() => {
    if (endingOpen && !endingPlayedRef.current) {
      endingPlayedRef.current = true;
      sfx.ending();
    }
    if (completed < quests.length) endingPlayedRef.current = false;
  }, [endingOpen, completed]);

  // 반짝 부스트: 에너지 60을 소모해 10초간 이동속도 1.5배
  const boostActive = boostLeft > 0;
  const boost = () => {
    if (!started || boostActive || energy < 60) return;
    setEnergy((prev) => prev - 60);
    boostUntilRef.current = Date.now() + 10000;
    setBoostLeft(10);
    setToast("⚡ 반짝 부스트! 10초간 빠르게 달립니다.");
    sfx.boost();
  };

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    <main className="game-shell">
      <GameWorld
        playerRef={playerRef}
        inputRef={inputRef}
        fogsRef={fogsRef}
        treasuresRef={treasuresRef}
        foundEggsRef={foundEggsRef}
        lostRef={lostRef}
        carryingRef={carryingRef}
        villainsRef={villainsRef}
        boostUntilRef={boostUntilRef}
        runningRef={runningRef}
        solved={solved}
        discovered={discovered}
        progress={worldProgress}
        peers={peerList}
        projectiles={projectiles}
        onSync={handleSync}
        onBlocked={handleBlocked}
      />

      <section className="hud top-left">
        <div className="brand">
          <Sparkles size={22} />
          <div>
            <h1>공동체 빌더스</h1>
            <span>Class Community World</span>
          </div>
        </div>
        <div className="quest-progress">
          <BadgeCheck size={18} />
          <strong>{completed}/{quests.length}</strong>
          <span>미션 해결 · 발견 {discoveredCount}</span>
        </div>
        {/* 6칸 한 줄: [나 + 접속 친구] | [마을 주민]. 위에 이름표를 달아 접속 인원과 헷갈리지 않게 */}
        <div className="party-cap" aria-hidden="true">
          <span className="pc-me" style={{ gridColumn: `span ${partyMineCols}` }}>
            {partyMineCols === 1 ? "나" : "나·접속 친구"}
          </span>
          {partyNpcCount > 0 && (
            <span className="pc-npc" style={{ gridColumn: `span ${partyNpcCount}` }}>마을 주민</span>
          )}
        </div>
        <div className="party-strip" aria-label="나와 접속한 친구, 마을 주민">
          <div className="party-member current">
            <img src={HERO_PORTRAIT} alt="나" />
            <span>{profile?.name || "나"}</span>
          </div>
          {peerList.slice(0, partyPeerShown).map((peer) => (
            <div className="party-member online" key={peer.id}>
              <i style={{ background: peer.color }} />
              <span>{peer.name}</span>
            </div>
          ))}
          {peerList.length > partyPeerShown && (
            <div className="party-member more">
              <i>+{peerList.length - partyPeerShown}</i>
              <span>더 있음</span>
            </div>
          )}
          {quests.slice(0, partyNpcCount).map((quest) => (
            <div className={solved[quest.id] ? "party-member npc solved" : "party-member npc"} key={quest.id}>
              <img src={portraitOf(quest.id)} alt={quest.name} />
              <span>{quest.name}</span>
            </div>
          ))}
        </div>
        <div className="chip-row">
          <div className="online-chip"><UsersRound size={13} /> {onlineCount}명 접속</div>
          <div className="energy-chip">
            <strong>{energy}</strong>
            <span>공동체 에너지</span>
          </div>
          <div className="treasure-chip" title="숨은 마음 조각 (맵 곳곳에 숨어 있어요)">
            💛 {treasureCount}/{treasureSeeds.length}
          </div>
          {endlessMode && (
            <div className="purify-chip" title="완주 후 되살아난 장벽을 정화한 횟수">
              ⚡ 정화 {purified}
              {profile?.room && classSummary?.purified > 0 && (
                <em> · 우리 반 {classSummary.purified}</em>
              )}
            </div>
          )}
          {profile?.room && <div className="room-chip small">반 {profile.room}</div>}
          <div className="sys-buttons">
            <button className="icon-chip" onClick={toggleMuted} title={muted ? "소리 켜기" : "소리 끄기"} aria-label={muted ? "소리 켜기" : "소리 끄기"}>
              {muted ? "🔇" : "🔊"}
            </button>
            <button
              className={reflect.moodPost || reflect.promise ? "icon-chip reflect-chip done" : "icon-chip reflect-chip"}
              onClick={() => setReflectOpen(true)}
              title="오늘 마무리 (마음 날씨·약속)"
              aria-label="오늘 마무리 열기 — 마음 날씨와 우리 반 약속"
            >
              <img src={moodIcon(reflect.moodPost || 4)} alt="" />
            </button>
            <button className="icon-chip codex-chip" onClick={() => { setAlbumView(null); setCodexOpen(true); }} title="수집 도감" aria-label="수집 도감 열기">
              <BookOpen size={15} />
              {earnedBadges.length > 0 && <b>{earnedBadges.length}</b>}
            </button>
            <button className="icon-chip" onClick={() => setConfirmReset(true)} title="메뉴" aria-label="메뉴 열기">
              <Menu size={15} />
            </button>
          </div>
        </div>
        {classBrightness && (
          <div
            className="brightness-chip"
            title={`우리 반이 함께 깨뜨린 빛장벽 ${classBrightness.total}개`}
          >
            <span>우리 반 마을 밝기</span>
            <i><b style={{ width: `${Math.round(classBrightness.ratio * 100)}%` }} /></i>
            <strong>{Math.round(classBrightness.ratio * 100)}%</strong>
          </div>
        )}
        {/* 세로 폰 전용: 화면 중앙을 가리지 않도록 길안내를 패널 속 칩으로 (CSS로 표시 전환) */}
        {started && guide && (
          <div className="guide-chip">
            <Navigation size={12} style={{ transform: `rotate(${guide.angle - Math.PI / 4}rad)` }} />
            <span>{guide.quest.title} <em>{guide.distance}m</em></span>
          </div>
        )}
      </section>

      <section className="hud top-right">
        <div className="mini-map">
          <MapIcon size={18} />
          {quests.filter((quest) => discovered[quest.id] || solved[quest.id]).map((quest) => (
            <span
              key={quest.id}
              className={solved[quest.id] ? "pin solved" : "pin"}
              style={{
                left: `${50 + (quest.pos[0] / HALF) * 42}%`,
                top: `${50 + (quest.pos[1] / HALF) * 42}%`,
                background: quest.color,
              }}
              title={quest.title}
            />
          ))}
          {fogs.filter((fog) => !fog.cleared).map((fog) => (
            <em
              key={fog.id}
              className="fog-pin"
              style={{
                left: `${50 + (fog.x / HALF) * 42}%`,
                top: `${50 + (fog.z / HALF) * 42}%`,
              }}
              title={fog.label}
            />
          ))}
          <b style={{ left: `${50 + (playerHud.x / HALF) * 42}%`, top: `${50 + (playerHud.z / HALF) * 42}%` }} />
        </div>
        <div className="stats">
          {stats.map(({ key, label, color }) => (
            <div className="stat" key={key}>
              <i className="stat-dot" style={{ background: color }} />
              <span>{label}</span>
              <i
                className="stat-bar"
                role="meter"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={score[key]}
                style={{ "--c": color }}
              >
                <b style={{ width: `${Math.max(4, score[key])}%` }} />
              </i>
              <strong className="stat-num" style={{ color }}>{score[key]}</strong>
            </div>
          ))}
        </div>
      </section>

      {started && guide && (
        <div className="guide-arrow">
          <Navigation size={16} style={{ transform: `rotate(${guide.angle - Math.PI / 4}rad)` }} />
          <span>
            {guide.quest.title} <em>{guide.distance}m</em>
          </span>
        </div>
      )}

      {/* 분실물 들고 있을 때: 무엇을 나르는지 + 주인 안내 + 내려놓기 */}
      {carrying && (
        <div className="carry-hud">
          <span className="carry-icon"><IconImg src={carrying.img} emoji={carrying.icon} /></span>
          <span className="carry-text">
            <b>{carrying.name}</b>
            <em>주인 {carrying.ownerName}에게 돌려주세요 📍</em>
          </span>
          <button className="carry-drop" onClick={dropLost}>내려놓기 <span className="carry-key">E</span></button>
        </div>
      )}

      {/* 왼손: 이동 조이스틱 */}
      <section className="hud pad-left">
        <Joystick inputRef={inputRef} />
        <span className="pad-hint">이동</span>
      </section>

      {/* 오른손: 빛구슬 발사 + 부스트 */}
      <section className="hud pad-right">
        <button
          className={boostActive ? "boost-fab active" : "boost-fab"}
          onClick={boost}
          disabled={!boostActive && energy < 60}
          title={boostActive ? `부스트 ${boostLeft}초` : "반짝 부스트 (에너지 60)"}
        >
          ⚡{boostActive ? boostLeft : ""}
        </button>
        <FireButton onStart={startFiring} onStop={stopFiring} />
      </section>

      {/* 근접 안내 배너 — 우선순위: 돌려주기 > 줍기 > 미션 (한 번에 하나만) */}
      {deliverTarget && !activeQuest ? (
        <button className="quest-prompt lost-return" onClick={deliverLost}>
          <span className="quest-prompt-badge">📮</span>
          <span className="quest-prompt-avatar" style={{ borderColor: "#f5c665" }}>
            <img src={portraitOf(deliverTarget.owner)} alt={deliverTarget.ownerName} />
          </span>
          <span className="quest-prompt-text">
            <b>{deliverTarget.ownerName}에게 돌려주기</b>
            <em><IconImg src={deliverTarget.img} emoji={deliverTarget.icon} /> {deliverTarget.name}</em>
          </span>
          <span className="quest-prompt-cta">돌려주기 <span className="quest-prompt-key">E</span></span>
        </button>
      ) : nearLost && !activeQuest ? (
        <button className="quest-prompt lost-pickup" onClick={() => pickUpLost(nearLost)}>
          <span className="quest-prompt-badge">?</span>
          <span className="quest-prompt-emoji"><IconImg src={nearLost.img} emoji={nearLost.icon} /></span>
          <span className="quest-prompt-text">
            <b>누가 흘리고 갔어요</b>
            <em>{nearLost.name} · 주워 볼까요?</em>
          </span>
          <span className="quest-prompt-cta">줍기 <span className="quest-prompt-key">E</span></span>
        </button>
      ) : nearQuest && !activeQuest ? (
        <button
          className={solved[nearQuest.id] ? "quest-prompt solved" : "quest-prompt"}
          onClick={() => openQuest(nearQuest)}
          style={{ "--quest-color": nearQuest.color }}
        >
          <span className="quest-prompt-badge">{solved[nearQuest.id] ? "✓" : "!"}</span>
          <span className="quest-prompt-avatar" style={{ borderColor: nearQuest.color }}>
            <img src={portraitOf(nearQuest.id)} alt={nearQuest.name} />
          </span>
          <span className="quest-prompt-text">
            <b>{solved[nearQuest.id] ? "해결한 미션" : "새 미션 발견!"}</b>
            <em>{nearQuest.title} · {nearQuest.name}</em>
          </span>
          <span className="quest-prompt-cta">
            {solved[nearQuest.id] ? "다시 보기" : "함께 해결"} <span className="quest-prompt-key">E</span>
          </span>
        </button>
      ) : null}

      {toast && <div className="toast">{toast}</div>}

      {scorePops.length > 0 && (
        <div className="score-pops" aria-hidden="true">
          {scorePops.map((pop) => (
            <span key={pop.id} className={`score-pop ${pop.kind}`}>
              <Sparkles size={15} /> {pop.text}
            </span>
          ))}
        </div>
      )}

      {reflectOpen && (
        <section className="dialog-layer" onClick={() => setReflectOpen(false)}>
          <div className="codex-box reflect-box" onClick={(event) => event.stopPropagation()}>
            <div className="codex-head">
              <h3><img className="reflect-head-ico" src={moodIcon(reflect.moodPost || 4)} alt="" /> 오늘 마무리</h3>
              <button className="codex-close" onClick={() => setReflectOpen(false)} aria-label="닫기">✕</button>
            </div>
            {reflect.moodPre > 0 && (
              <p className="rp-pre">
                시작할 때 고른 마음 날씨 <img src={moodIcon(reflect.moodPre)} alt="" /> <b>{MOOD_LBL[reflect.moodPre]}</b>
              </p>
            )}
            <ReflectPanel reflect={reflect} setReflect={setReflect} room={profile?.room} onToast={setToast} />
            <button className="codex-save" onClick={() => setReflectOpen(false)}>다시 탐험하기</button>
          </div>
        </section>
      )}

      {codexOpen && (
        <section className="dialog-layer" onClick={() => setCodexOpen(false)}>
          <div className="codex-box" onClick={(event) => event.stopPropagation()}>
            <div className="codex-head">
              <h3><BookOpen size={20} /> 수집 도감</h3>
              <button className="codex-close" onClick={() => setCodexOpen(false)} aria-label="닫기">✕</button>
            </div>

            <div className="codex-progress">
              <div><span>미션</span><strong>{completed}/{quests.length}</strong></div>
              <div><span>빛장벽</span><strong>{clearedFogCount}/{fogs.length}</strong></div>
              <div><span>마음 조각</span><strong>{treasureCount}/{treasures.length}</strong></div>
              <div><span>숨은 장소</span><strong>{eggCount}/{easterEggs.length}</strong></div>
              <div><span>돌려준 물건</span><strong>{returnedCount}/{lostItems.length}</strong></div>
            </div>

            <p className="codex-section-label">마을 앨범 · {completed}/{quests.length}</p>
            <div className="codex-album">
              {quests.map((quest) => (solved[quest.id] && !quest.noScene ? (
                <button
                  key={quest.id}
                  type="button"
                  className="album-cell open"
                  onClick={() => setAlbumView(quest)}
                  aria-label={`${quest.title} 그림 크게 보기`}
                >
                  <span className="album-pic">
                    <img src={sceneThumbOf(quest.id)} alt="" loading="lazy" draggable={false} onError={(event) => { event.currentTarget.style.display = "none"; }} />
                  </span>
                  <b>{quest.title}</b>
                </button>
              ) : (
                <div key={quest.id} className={solved[quest.id] ? "album-cell done" : "album-cell"}>
                  <span className="album-pic" aria-hidden="true">{solved[quest.id] ? "✓" : "?"}</span>
                  <b>{quest.title}</b>
                </div>
              )))}
            </div>
            <p className="codex-album-hint">미션을 풀 때마다 그 장소의 그림이 한 장씩 열려요. 그림을 누르면 크게 볼 수 있어요.</p>

            <p className="codex-section-label">획득한 배지 · {earnedBadges.length}/{badges.length}</p>
            <div className="codex-badges">
              {badges.map((badge) => {
                const earned = earnedBadges.some((b) => b.id === badge.id);
                return (
                  <div key={badge.id} className={earned ? "codex-badge earned" : "codex-badge"}>
                    <span className="codex-badge-icon">
                      <IconImg src={badge.img} emoji={earned ? badge.icon : "🔒"} className={earned ? "" : "locked"} />
                    </span>
                    <b>{badge.name}</b>
                    <em>{badge.desc}</em>
                  </div>
                );
              })}
            </div>

            {completed === quests.length ? (
              <button className="codex-save" onClick={saveCertificate}>
                🏅 지금까지의 인증서 저장 (수집·배지 포함)
              </button>
            ) : (
              <p className="codex-save-hint">16개 미션을 모두 해결하면 여기서 인증서를 저장할 수 있어요.</p>
            )}
          </div>
        </section>
      )}

      {codexOpen && albumView && (
        <section className="dialog-layer album-layer" onClick={() => setAlbumView(null)}>
          <figure className="album-view" onClick={(event) => event.stopPropagation()}>
            <img src={sceneOf(albumView.id)} alt={`${albumView.title} — 달라진 마을 모습`} draggable={false} onError={(event) => { event.currentTarget.style.display = "none"; }} />
            <figcaption>
              <b>{albumView.title}</b>
              <p>{albumView.choices.find((c) => c.good)?.reward}</p>
              <small>{albumView.name}{josa(albumView.name, "과", "와")} 함께 되살린 곳</small>
            </figcaption>
            <button className="codex-close" onClick={() => setAlbumView(null)} aria-label="닫기">✕</button>
          </figure>
        </section>
      )}

      {eggPopup && (
        <section
          className="dialog-layer egg-layer"
          onClick={() => setEggPopup(null)}
          style={{ "--egg-color": eggPopup.color || "#ffd98a" }}
        >
          <div className="egg-burst" aria-hidden="true">
            <div className="egg-flash" />
            <div className="egg-ring" />
            {EGG_CONFETTI.map((c, i) => (
              <span
                key={i}
                className={c.round ? "confetti round" : "confetti"}
                style={{
                  left: `${c.left}%`,
                  width: c.size,
                  height: c.round ? c.size : c.size * 1.6,
                  background: ["var(--egg-color)", "#ffffff", "#facc15", "#3FE5A0"][c.slot],
                  "--drift": `${c.drift}px`,
                  "--rot": `${c.rot}deg`,
                  animationDelay: `${c.delay}s`,
                  animationDuration: `${c.dur}s`,
                }}
              />
            ))}
          </div>
          <div className="egg-popup" onClick={(event) => event.stopPropagation()}>
            <div className="egg-popup-glow" aria-hidden="true" />
            <div className="egg-popup-icon">{eggPopup.icon}</div>
            <p className="egg-popup-kicker">숨은 장소 발견!</p>
            <h3 className="egg-popup-name">{eggPopup.name}</h3>
            <p className="egg-popup-text">{eggPopup.toast}</p>
            <p className="egg-popup-count">숨은 장소 {eggPopup.count}/{easterEggs.length} 발견</p>
            <button className="primary" onClick={() => setEggPopup(null)}>계속 탐험하기</button>
          </div>
        </section>
      )}

      {deliverPopup && (
        <section className="dialog-layer" onClick={() => setDeliverPopup(null)}>
          <div className="deliver-popup" onClick={(event) => event.stopPropagation()}>
            <div className="deliver-popup-avatar">
              <img src={portraitOf(deliverPopup.owner)} alt={deliverPopup.ownerName} />
              <span className="deliver-popup-item"><IconImg src={deliverPopup.img} emoji={deliverPopup.icon} /></span>
            </div>
            <p className="deliver-popup-kicker">{deliverPopup.ownerName}에게 돌려주었어요</p>
            <p className="deliver-popup-thanks">“{deliverPopup.thanks}”</p>
            <p className="deliver-popup-count">돌려준 물건 {returnedCount}/{lostItems.length} · 에너지 +12</p>
            <button className="primary" onClick={() => setDeliverPopup(null)}>마음이 따뜻해졌어요</button>
          </div>
        </section>
      )}

      {confirmReset && (
        <section className="dialog-layer" onClick={() => setConfirmReset(false)}>
          <div className="confirm-box" onClick={(event) => event.stopPropagation()}>
            <h3>잠깐 멈췄어요</h3>

            <div className="sound-settings">
              <label className="sound-row">
                <span>🎵 음악</span>
                <input
                  type="range" min="0" max="1" step="0.05" value={bgmVol}
                  onChange={(event) => { const v = parseFloat(event.target.value); setBgmVol(v); setBgmVolume(v); }}
                />
                <em>{Math.round(bgmVol * 100)}</em>
              </label>
              <label className="sound-row">
                <span>🔔 효과음</span>
                <input
                  type="range" min="0" max="1" step="0.05" value={sfxVol}
                  onChange={(event) => { const v = parseFloat(event.target.value); setSfxVol(v); setSfxVolume(v); }}
                />
                <em>{Math.round(sfxVol * 100)}</em>
              </label>
            </div>

            <div className="confirm-menu">
              <button className="primary" onClick={() => setConfirmReset(false)}>계속하기</button>
              <button className="ghost" onClick={goHome}>홈으로 나가기</button>
              <button className="danger" onClick={reset}>처음부터 다시 시작</button>
            </div>
            <p className="confirm-note">홈으로 나가도 진행 상황은 저장돼요.</p>
          </div>
        </section>
      )}

      {activeQuest && (
        <section className="dialog-layer" onClick={() => dialogView !== "ask" && setActiveQuest(null)}>
          <div className="dialog" ref={dialogBoxRef} onClick={(event) => event.stopPropagation()}>
            <div className="dialog-character">
              <div className="dialog-avatar" style={{ borderColor: activeQuest.quest.color }}>
                <img src={portraitOf(activeQuest.quest.id)} alt={activeQuest.quest.name} />
              </div>
              <div>
                <span>{activeQuest.quest.name} | {activeQuest.quest.title}</span>
                {dialogView === "ask" && <h2>{activeQuest.quest.problem}</h2>}
                {dialogView === "result" && <h2>{activeQuest.choice.reward}</h2>}
                {dialogView === "recap" && <h2>{activeQuest.quest.followup || "우리가 함께 해결한 미션이야. 고마워!"}</h2>}
              </div>
            </div>

            {dialogView === "ask" && (
              <>
                {!choicesReady && (
                  <div className="read-gate">
                    <span>📖 친구의 고민을 천천히 읽어볼까요…</span>
                    <b>{readCountdown}</b>
                  </div>
                )}
                <div className={choicesReady ? "choice-grid" : "choice-grid locked"}>
                  {(activeQuest.choices || activeQuest.quest.choices).map((choice) => (
                    <button
                      key={choice.text}
                      disabled={!choicesReady}
                      onClick={() => choicesReady && choose(choice)}
                    >
                      {choice.text}
                    </button>
                  ))}
                </div>
              </>
            )}

            {(dialogView === "result" || dialogView === "recap") && (
              <div className="insight-block">
                {/* 좋은 선택을 했을 때(그리고 푼 미션을 다시 열었을 때)만 되살아난 장소 그림을 보여 준다 */}
                {(dialogView === "recap" || activeQuest.choice?.good) && (
                  <SceneArt key={activeQuest.quest.id} quest={activeQuest.quest} />
                )}
                <div className="insight-main">
                  {dialogView === "result" && (
                    <div className={activeQuest.choice.good ? "answer-tag good" : "answer-tag soft"}>
                      {activeQuest.choice.good
                        ? "좋은 선택이에요! 마을이 한 뼘 더 따뜻해졌어요."
                        : "그 마음도 이해돼요. 그런데 이렇게 하면 친구가 더 좋았을 거예요 👇"}
                    </div>
                  )}
                  {(dialogView === "recap" || (dialogView === "result" && !activeQuest.choice.good)) && (
                    <p className="recap-choice">✓ {activeQuest.quest.choices.find((c) => c.good)?.text}</p>
                  )}
                  <div className="insight-card">
                    <span
                      className="stat-chip"
                      style={{ background: statOf(activeQuest.quest.stat)?.color }}
                    >
                      {statOf(activeQuest.quest.stat)?.label}
                    </span>
                    <p>{activeQuest.quest.insight}</p>
                  </div>
                </div>
                <div className="result-actions">
                  {dialogView === "result" && !activeQuest.choice.good && !solved[activeQuest.quest.id] && (
                    <button
                      className="dialog-retry"
                      onClick={() => setActiveQuest({ quest: activeQuest.quest, view: null, choices: activeQuest.choices })}
                    >
                      다시 골라볼래요?
                    </button>
                  )}
                  <button className="dialog-confirm" onClick={() => setActiveQuest(null)}>
                    확인
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {endingOpen && (
        <section className="ending-layer">
          <div className={`ending-card${endingArtOk ? " with-art" : ""}`}>
            <div className="ending-head">
            {endingArtOk && <img className="ending-art" src={ENDING_ART} alt="불이 켜진 우리 마을" draggable={false} onError={() => setEndingArtOk(false)} />}
            <PartyPopper size={40} color="#facc15" />
            <h2>미션 1단계 완주! 🎉</h2>
            <p className="ending-title">칭호: <strong>{endingTitle}</strong></p>
            <p className="ending-sub">
              {profile.name} 탐험가가 16개의 마음 미션을 모두 풀었어요.
              <br /><strong style={{ color: "#86efac" }}>하지만 아직 끝이 아니에요 — 마을엔 할 일이 많이 남았어요!</strong>
            </p>
            </div>
            <div className="ending-body">
            <div className="ending-todo">
              <div className={treasureCount >= treasures.length ? "done" : ""}>💛 마음 조각 <b>{treasureCount}/{treasures.length}</b></div>
              <div className={returnedCount >= lostItems.length ? "done" : ""}>📮 분실물 돌려주기 <b>{returnedCount}/{lostItems.length}</b></div>
              <div className={eggCount >= easterEggs.length ? "done" : ""}>🗺️ 숨은 장소 <b>{eggCount}/{easterEggs.length}</b></div>
              <div className={earnedBadges.length >= badges.length ? "done" : ""}>🏅 도감 배지 <b>{earnedBadges.length}/{badges.length}</b></div>
              <div>⚡ 그리고 <b>무한 정화 모드</b>가 열렸어요!</div>
            </div>
            <ReflectPanel reflect={reflect} setReflect={setReflect} room={profile.room} onToast={setToast} />
            <div className="ending-actions">
              <button className="primary" onClick={() => setEndingDismissed(true)}>
                <Sparkles size={16} /> 계속 탐험하기
              </button>
              <button className="ghost" onClick={saveCertificate}>지금까지 인증서 저장</button>
              <button className="ghost" onClick={goHome}>메인으로</button>
              <button className="ghost" onClick={() => setConfirmReset(true)}>처음부터 다시</button>
            </div>
            </div>
          </div>
        </section>
      )}

      {!started && <IntroScreen onStart={startGame} onContinue={continueGame} savedGame={savedGame} />}
    </main>
  );
}

function App() {
  const [route, setRoute] = useState(window.location.hash);
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (route === "#teacher") return <TeacherBoard />;
  return <Game />;
}

// 교사 커스텀 문항: public/quests-custom.json이 있으면 텍스트 필드만 덮어쓴다
// (좌표·색상·역량은 게임 밸런스와 지형에 묶여 있어 텍스트만 허용)
async function applyCustomQuests() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}quests-custom.json`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    (data.quests || []).forEach((custom) => {
      const target = quests.find((q) => q.id === custom.id);
      if (!target) return;
      // 장소 이름을 바꾸면 준비된 장면 그림과 맞지 않으므로 그 미션의 그림은 감춘다
      if (typeof custom.title === "string" && custom.title && custom.title !== target.title) target.noScene = true;
      ["name", "title", "problem", "insight"].forEach((key) => {
        if (typeof custom[key] === "string" && custom[key]) target[key] = custom[key];
      });
      if (Array.isArray(custom.choices)) {
        custom.choices.forEach((choice, i) => {
          if (!target.choices[i]) return;
          if (typeof choice.text === "string" && choice.text) target.choices[i].text = choice.text;
          if (typeof choice.reward === "string" && choice.reward) target.choices[i].reward = choice.reward;
          if (typeof choice.good === "boolean") target.choices[i].good = choice.good;
        });
      }
    });
  } catch {
    // 커스텀 파일이 없으면 기본 문항 사용
  }
}

// HMR로 엔트리 모듈이 재실행돼도 루트를 한 번만 만든다
const container = document.getElementById("root");
if (!container.__reactRoot) container.__reactRoot = createRoot(container);
applyCustomQuests().finally(() => container.__reactRoot.render(<App />));
