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
} from "./data/index.js";
import { uid, josa } from "./lib/utils.js";
import { initAudio, sfx, getMuted, setMuted } from "./lib/sound.js";
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

function IntroScreen({ onStart, onContinue, savedGame }) {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [videoOk, setVideoOk] = useState(true);
  const [showTeaser, setShowTeaser] = useState(false);
  const videoRef = useRef(null);

  // 일부 브라우저는 autoPlay 속성만으로 재생을 시작하지 않으므로 마운트 시 명시적으로 재생 시도
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.play().catch(() => {});
  }, [videoOk]);

  const start = () => {
    onStart(name.trim() || `탐험가${Math.floor(Math.random() * 90) + 10}`, room.trim().toUpperCase());
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
            placeholder="닉네임 (예: 반짝탐험가)"
            maxLength={10}
            onKeyDown={(event) => event.key === "Enter" && start()}
          />
          <input
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            placeholder="우리 반 코드 (선택)"
            maxLength={6}
            onKeyDown={(event) => event.key === "Enter" && start()}
          />
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
      <div className="intro-brand" aria-label="제작 LevLab YEOL">
        <b>Lev</b>Lab <span>YEOL</span>
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

function TeacherBoard() {
  const [code, setCode] = useState(localStorage.getItem("cb_room") || "");
  const [active, setActive] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  // 요약 기록 throttle: 학생 밝기막대용 __summary 문서를 최대 8초에 한 번만 갱신
  const lastSummaryRef = useRef({ total: -1, count: -1 });
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
    const count = rows.length;
    if (total === lastSummaryRef.current.total && count === lastSummaryRef.current.count) return undefined;
    const delay = Math.max(0, 8000 - (Date.now() - lastSummaryAtRef.current));
    const timer = window.setTimeout(() => {
      lastSummaryRef.current = { total, count };
      lastSummaryAtRef.current = Date.now();
      import("./lib/firebase.js").then((fb) => fb.pushSummary(active, { total, count })).catch(() => {});
    }, delay);
    return () => window.clearTimeout(timer);
  }, [active, rows]);

  const open = (value) => {
    const next = value.trim().toUpperCase();
    if (!next) return;
    localStorage.setItem("cb_room", next);
    setCode(next);
    setRows([]);
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

  // 모험 포인트: 미션×10 · 빛장벽×1 · 마음 조각×3 · 돌려준 물건×5 · 숨은 장소×8
  const pointsOf = (row) =>
    (row.solvedCount || 0) * 10 +
    (row.cleared || 0) +
    (row.gems || 0) * 3 +
    (row.returned || 0) * 5 +
    (row.eggs || 0) * 8;

  const sorted = [...students].sort((a, b) => pointsOf(b) - pointsOf(a));
  const maxPoints = Math.max(1, ...sorted.map(pointsOf));
  const avg = (key) =>
    students.length ? Math.round(students.reduce((sum, row) => sum + (row.score?.[key] || 0), 0) / students.length) : 0;

  // 수업 기록용 CSV 내보내기 (엑셀 한글 호환 BOM 포함)
  const exportCsv = () => {
    const header = ["순위", "이름", "포인트", "미션 해결", "거점 발견", "빛장벽(누적)", "마음 조각", "돌려준 물건", "숨은 장소", "배지", "에너지", "마음알기", "서로듣기", "관계잇기", "마을세우기", "마을 완성"];
    const lines = sorted.map((row, i) => [
      i + 1,
      row.name || "",
      pointsOf(row),
      row.solvedCount || 0,
      row.found || 0,
      row.cleared || 0,
      row.gems || 0,
      row.returned || 0,
      row.eggs || 0,
      row.badges || 0,
      row.energy || 0,
      row.score?.self || 0,
      row.score?.empathy || 0,
      row.score?.relation || 0,
      row.score?.community || 0,
      row.done ? "O" : "",
    ]);
    const csv = "﻿" + [header, ...lines]
      .map((cells) => cells.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `공동체빌더스_${active}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <main className="teacher-shell">
      <header className="teacher-head">
        <div>
          <h1>공동체 빌더스 · 교사 화면</h1>
          <p>학생들이 시작 화면에서 같은 반 코드를 입력하면 진행 상황이 실시간으로 모입니다.</p>
        </div>
        <a href="#" onClick={(event) => { event.preventDefault(); window.location.hash = ""; }}>
          ← 게임으로
        </a>
      </header>

      <section className="teacher-join">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="반 코드 (예: 3반A)"
          maxLength={6}
          onKeyDown={(event) => event.key === "Enter" && open(code)}
        />
        <button onClick={() => open(code)}>모니터링 시작</button>
        <button
          className="ghost"
          onClick={() => open(String(Math.floor(Math.random() * 9000) + 1000))}
        >
          새 코드 만들기
        </button>
        {active && <span className="room-chip">참여 코드: {active}</span>}
        {active && rows.length > 0 && (
          <button className="ghost" onClick={exportCsv}>CSV 내보내기</button>
        )}
      </section>

      {error && <p className="teacher-error">{error}</p>}

      {active && (
        <section className="teacher-summary">
          <div><strong>{students.length}</strong><span>참여 학생</span></div>
          {stats.map((stat) => (
            <div key={stat.key}>
              <strong style={{ color: stat.color }}>{avg(stat.key)}</strong>
              <span>{stat.label} 평균</span>
            </div>
          ))}
          <div>
            <strong>{students.filter((row) => row.done).length}</strong>
            <span>마을 완성</span>
          </div>
        </section>
      )}

      {active && sorted.length > 0 && (
        <section className="teacher-race">
          <h2>
            🏁 실시간 마을 레이스
            <em>미션×10 · 빛장벽×1 · 조각×3 · 물건×5 · 숨은장소×8</em>
          </h2>
          {sorted.map((row, i) => {
            const pts = pointsOf(row);
            return (
              <div className={`race-row${i < 3 ? ` top${i + 1}` : ""}`} key={row.id}>
                <span className="race-rank">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</span>
                <span className="race-name">
                  <i style={{ background: row.color || "#94a3b8" }} />
                  {row.name || "이름 없음"}
                </span>
                <div className="race-track">
                  <div className="race-bar" style={{ width: `${Math.max(6, (pts / maxPoints) * 100)}%` }}>
                    <b>{pts}</b>
                  </div>
                </div>
                <span className="race-chips" title="배지 · 마음 조각 · 돌려준 물건 · 숨은 장소">
                  🏅{row.badges || 0} 💛{row.gems || 0} 📮{row.returned || 0} 🗺️{row.eggs || 0}
                </span>
              </div>
            );
          })}
        </section>
      )}

      {active && (
        <section className="teacher-table">
          <div className="teacher-row head">
            <span>학생</span>
            <span>미션</span>
            <span>발견</span>
            <span>장벽</span>
            <span>조각</span>
            <span>역량</span>
          </div>
          {sorted.map((row) => (
            <div className={row.done ? "teacher-row done" : "teacher-row"} key={row.id}>
              <span className="student">
                <i style={{ background: row.color || "#94a3b8" }} />
                {row.name || "이름 없음"}
                {row.done && <PartyPopper size={14} />}
              </span>
              <span>{row.solvedCount || 0}/{quests.length}</span>
              <span>{row.found || 0}/{quests.length}</span>
              <span>{row.cleared || 0}/{fogSeeds.length}</span>
              <span>💛{row.gems || 0}</span>
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
    </main>
  );
}

function saveResultCard({ name, room, score, energy, cleared, gems, eggs = 0, returned = 0, earnedBadges = [], title }) {
  const W = 1000;
  const H = 880;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0b1a2e");
  bg.addColorStop(1, "#123047");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, W - 56, H - 56);

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

  // 획득한 배지 아이콘을 한 줄로 (이모지)
  ctx.font = "34px 'Apple SD Gothic Neo', sans-serif";
  ctx.textBaseline = "middle";
  earnedBadges.forEach((b, i) => {
    ctx.fillText(b.icon, 60 + i * 52, 792);
  });
  ctx.textBaseline = "alphabetic";

  const today = new Date().toLocaleDateString("ko-KR");
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 20px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(`${today} · 사회정서교육(SEL) 공동체 활동`, 60, 836);

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
  const [projectiles, setProjectiles] = useState([]);
  const [energy, setEnergy] = useState(0);
  const [toast, setToast] = useState("");
  const [score, setScore] = useState({ self: 20, empathy: 20, relation: 20, community: 20 });
  const [endingDismissed, setEndingDismissed] = useState(false);
  const [classSummary, setClassSummary] = useState(null);
  // 누적 기록: '다시 시작'해도 줄지 않는다 (반 밝기·교사 화면용)
  const [lifetimeCleared, setLifetimeCleared] = useState(0);
  const [lifetimeGems, setLifetimeGems] = useState(0);
  const prevClearedRef = useRef(0);
  const prevGemsRef = useRef(0);
  // 반짝 부스트: 만료 시각(Date.now 기준)
  const boostUntilRef = useRef(0);
  const [boostLeft, setBoostLeft] = useState(0);
  const [muted, setMutedState] = useState(getMuted);
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
  const clearedFogCount = fogs.filter((fog) => fog.cleared).length;
  const treasureCount = treasures.filter((t) => t.found).length;
  const eggCount = Object.values(foundEggs).filter(Boolean).length;
  const returnedCount = lost.filter((l) => l.status === "returned").length;
  const endingOpen = started && completed === quests.length && !endingDismissed;

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
  const earnedBadges = badges.filter((b) => b.check(codexStats));

  runningRef.current = started && !activeQuest && !endingOpen;

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
      setLifetimeCleared((v) => v + clearedFogCount - prev);
    }
    prevClearedRef.current = clearedFogCount;
  }, [clearedFogCount]);

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
  }, [started, user, profile, solved, answered, discovered, fogs, treasures, foundEggs, lost, energy, score, endingDismissed, lifetimeCleared, lifetimeGems]);

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
      (egg) => !foundEggs[egg.id] && Math.hypot(egg.x - playerHud.x, egg.z - playerHud.z) < 2.2
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
      // 진행도에 따라 활동하는 빌런 수를 줄인다 (0.55→2마리, 0.75→1마리, 0.9→0마리)
      const allowedActive = prog >= 0.9 ? 0 : prog >= 0.75 ? 1 : prog >= 0.55 ? 2 : 3;
      const villains = villainsRef.current;
      let activeCount = villains.filter((v) => v.active).length;
      villains.forEach((v) => {
        if (v.active && activeCount > allowedActive) {
          v.active = false;
          activeCount -= 1;
          setToast("🌈 마을이 밝아지자 안개 빌런 하나가 스르르 사라졌어요!");
        }
      });

      const revivedIds = [];
      villains.forEach((v) => {
        if (!v.active || v.stunUntil > now) return;
        const target = fogsRef.current.find(
          (f) => f.cleared && !revivedIds.includes(f.id) && Math.hypot(f.x - v.x, f.z - v.z) < 11
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
  useEffect(() => {
    if (!profile?.room || !user) return undefined;
    const timer = window.setTimeout(() => {
      import("./lib/firebase.js")
        .then((fb) => fb.pushProgress(profile.room, user.id, {
          name: profile.name,
          color: user.color,
          found: discoveredCount,
          solvedCount: completed,
          cleared: lifetimeCleared,
          gems: lifetimeGems,
          returned: returnedCount,
          eggs: eggCount,
          badges: earnedBadges.length,
          energy,
          score,
          done: completed === quests.length,
        }))
        .catch(() => {});
    }, 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, user, discoveredCount, completed, lifetimeCleared, lifetimeGems, returnedCount, eggCount, earnedBadges.length, score]);

  const joinRoom = (room, name, userInfo) => {
    import("./lib/firebase.js")
      .then(async (fb) => {
        await fb.pushProgress(room, userInfo.id, {
          name,
          color: userInfo.color,
          found: 0,
          solvedCount: 0,
          cleared: 0,
          gems: 0,
          returned: 0,
          eggs: 0,
          badges: 0,
          energy: 0,
          score,
          done: false,
        });
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

  const startGame = (name, room) => {
    initAudio();
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // 무시
    }
    const newUser = makeUser();
    setUser(newUser);
    setProfile({ name, room });
    if (room) {
      joinRoom(room, name, newUser);
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

  const reset = () => {
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
    setScore({ self: 20, empathy: 20, relation: 20, community: 20 });
    setEndingDismissed(false);
    setToast("공동체 월드가 다시 시작되었습니다.");
    setActiveQuest(null);
    setConfirmReset(false);
  };

  // 시작 화면으로 나가기 — 진행은 자동저장되므로 '이어서 하기'로 복귀 가능
  const goHome = () => {
    saveNowRef.current();          // 현재 진행을 즉시 저장
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
        <div className="party-strip" aria-label="접속한 공동체 탐험가">
          <div className="party-member current">
            <img src={HERO_PORTRAIT} alt="나" />
            <span>{profile?.name || "나"}</span>
          </div>
          {peerList.slice(0, 5).map((peer) => (
            <div className="party-member online" key={peer.id}>
              <i style={{ background: peer.color }} />
              <span>{peer.name}</span>
            </div>
          ))}
          {peerList.length > 5 && (
            <div className="party-member more">
              <i>+{peerList.length - 5}</i>
              <span>더 있음</span>
            </div>
          )}
          {peerList.length < 5 && quests.slice(0, 5 - peerList.length).map((quest) => (
            <div className={solved[quest.id] ? "party-member solved" : "party-member"} key={quest.id}>
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
          {profile?.room && <div className="room-chip small">반 {profile.room}</div>}
          <div className="sys-buttons">
            <button className="icon-chip" onClick={toggleMuted} title={muted ? "소리 켜기" : "소리 끄기"} aria-label={muted ? "소리 켜기" : "소리 끄기"}>
              {muted ? "🔇" : "🔊"}
            </button>
            <button className="icon-chip codex-chip" onClick={() => setCodexOpen(true)} title="수집 도감" aria-label="수집 도감 열기">
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
              <meter min="0" max="100" value={score[key]} />
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
          <span className="carry-icon">{carrying.icon}</span>
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
            <em>{deliverTarget.icon} {deliverTarget.name}</em>
          </span>
          <span className="quest-prompt-cta">돌려주기 <span className="quest-prompt-key">E</span></span>
        </button>
      ) : nearLost && !activeQuest ? (
        <button className="quest-prompt lost-pickup" onClick={() => pickUpLost(nearLost)}>
          <span className="quest-prompt-badge">?</span>
          <span className="quest-prompt-emoji">{nearLost.icon}</span>
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

            <p className="codex-section-label">획득한 배지 · {earnedBadges.length}/{badges.length}</p>
            <div className="codex-badges">
              {badges.map((badge) => {
                const earned = earnedBadges.some((b) => b.id === badge.id);
                return (
                  <div key={badge.id} className={earned ? "codex-badge earned" : "codex-badge"}>
                    <span className="codex-badge-icon">{earned ? badge.icon : "🔒"}</span>
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

      {eggPopup && (
        <section className="dialog-layer" onClick={() => setEggPopup(null)}>
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
              <span className="deliver-popup-item">{deliverPopup.icon}</span>
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
            <p>계속할지, 홈으로 나갈지, 처음부터 다시 시작할지 골라 주세요.</p>
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
          <div className="dialog" onClick={(event) => event.stopPropagation()}>
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
              <div className="choice-grid">
                {(activeQuest.choices || activeQuest.quest.choices).map((choice) => (
                  <button key={choice.text} onClick={() => choose(choice)}>
                    {choice.text}
                  </button>
                ))}
              </div>
            )}

            {(dialogView === "result" || dialogView === "recap") && (
              <div className="insight-block">
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
          <div className="ending-card">
            <PartyPopper size={44} color="#facc15" />
            <h2>마을 완성!</h2>
            <p className="ending-title">칭호: <strong>{endingTitle}</strong></p>
            <p className="ending-sub">
              {profile.name} 탐험가가 16개의 공동체 미션을 모두 해결했습니다.
              <br />빛장벽 {clearedFogCount}개 해제 · 마음 조각 {treasureCount}/{treasureSeeds.length} · 공동체 에너지 {energy}
            </p>
            <div className="ending-stats">
              {stats.map(({ key, label, color }) => (
                <div className="stat" key={key}>
                  <i className="stat-dot" style={{ background: color }} />
                  <span>{label}</span>
                  <meter min="0" max="100" value={score[key]} />
                  <b>{score[key]}</b>
                </div>
              ))}
            </div>
            <div className="ending-actions">
              <button className="primary" onClick={saveCertificate}>
                인증서 저장
              </button>
              <button onClick={() => setEndingDismissed(true)}>계속 탐험 (나중에 저장)</button>
              <button onClick={goHome}>메인으로</button>
              <button onClick={() => setConfirmReset(true)}>다시 시작</button>
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
