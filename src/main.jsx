import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  BadgeCheck,
  Compass,
  Gamepad2,
  MapIcon,
  Navigation,
  PartyPopper,
  RotateCcw,
  Sparkles,
  UsersRound,
} from "lucide-react";
import GameWorld from "./world.jsx";
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
} from "./data/index.js";
import { uid } from "./lib/utils.js";
import "./styles.css";

const HAIR_OPTIONS = [0x25314d, 0x3b2a20, 0x30223d, 0x2f2430];

function statOf(key) {
  return stats.find((s) => s.key === key);
}

function Joystick({ inputRef }) {
  const padRef = useRef(null);
  const activeRef = useRef(false);
  const [thumb, setThumb] = useState({ x: 0, y: 0 });

  const apply = (event) => {
    const rect = padRef.current.getBoundingClientRect();
    let dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    let dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    inputRef.current.joy = { x: dx, y: dy };
    setThumb({ x: dx, y: dy });
  };

  const release = () => {
    activeRef.current = false;
    inputRef.current.joy = { x: 0, y: 0 };
    setThumb({ x: 0, y: 0 });
  };

  return (
    <div
      className="joystick"
      ref={padRef}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        activeRef.current = true;
        apply(event);
      }}
      onPointerMove={(event) => {
        if (activeRef.current) apply(event);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      aria-label="이동 조이스틱"
    >
      <span
        className="joystick-thumb"
        style={{ transform: `translate(${thumb.x * 34}px, ${thumb.y * 34}px)` }}
      />
    </div>
  );
}

function IntroScreen({ onStart }) {
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");

  const start = () => {
    onStart(name.trim() || `탐험가${Math.floor(Math.random() * 90) + 10}`, room.trim().toUpperCase());
  };

  return (
    <section className="intro-layer" style={{ backgroundImage: `url(${TITLE_BG})` }}>
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
        <button className="intro-start" onClick={start}>
          <Sparkles size={18} /> 모험 시작
        </button>
        <p className="intro-help">
          PC: WASD·화살표 이동 / 스페이스 빛구슬 / E 대화 · 모바일: 조이스틱
        </p>
        <a className="teacher-link" href="#teacher">교사용 화면 열기 →</a>
      </div>
    </section>
  );
}

function TeacherBoard() {
  const [code, setCode] = useState(localStorage.getItem("cb_room") || "");
  const [active, setActive] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");

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
            setRows(list);
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

  const open = (value) => {
    const next = value.trim().toUpperCase();
    if (!next) return;
    localStorage.setItem("cb_room", next);
    setCode(next);
    setRows([]);
    setActive(next);
  };

  const sorted = [...rows].sort((a, b) => (b.solvedCount || 0) - (a.solvedCount || 0));
  const avg = (key) =>
    rows.length ? Math.round(rows.reduce((sum, row) => sum + (row.score?.[key] || 0), 0) / rows.length) : 0;

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
      </section>

      {error && <p className="teacher-error">{error}</p>}

      {active && (
        <section className="teacher-summary">
          <div><strong>{rows.length}</strong><span>참여 학생</span></div>
          {stats.map((stat) => (
            <div key={stat.key}>
              <strong style={{ color: stat.color }}>{avg(stat.key)}</strong>
              <span>{stat.label} 평균</span>
            </div>
          ))}
          <div>
            <strong>{rows.filter((row) => row.done).length}</strong>
            <span>마을 완성</span>
          </div>
        </section>
      )}

      {active && (
        <section className="teacher-table">
          <div className="teacher-row head">
            <span>학생</span>
            <span>미션</span>
            <span>발견</span>
            <span>장벽</span>
            <span>역량</span>
          </div>
          {sorted.map((row) => (
            <div className={row.done ? "teacher-row done" : "teacher-row"} key={row.id}>
              <span className="student">
                <i style={{ background: row.color || "#94a3b8" }} />
                {row.name || "이름없음"}
                {row.done && <PartyPopper size={14} />}
              </span>
              <span>{row.solvedCount || 0}/{quests.length}</span>
              <span>{row.found || 0}/{quests.length}</span>
              <span>{row.cleared || 0}/{fogSeeds.length}</span>
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

function saveResultCard({ name, score, energy, cleared, title }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1000;
  canvas.height = 700;
  const ctx = canvas.getContext("2d");

  const bg = ctx.createLinearGradient(0, 0, 1000, 700);
  bg.addColorStop(0, "#0b1a2e");
  bg.addColorStop(1, "#123047");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1000, 700);

  ctx.strokeStyle = "rgba(255,255,255,.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 28, 944, 644);

  ctx.fillStyle = "#facc15";
  ctx.font = "900 30px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText("공동체 빌더스 · 마을 완성 인증서", 60, 96);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "900 58px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(`${name} 탐험가`, 60, 180);

  ctx.fillStyle = "#94e2b8";
  ctx.font = "800 30px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(`칭호: ${title}`, 60, 232);

  ctx.fillStyle = "#cbd5e1";
  ctx.font = "700 22px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(`16개 공동체 미션 완주 · 빛장벽 ${cleared}개 해제 · 공동체 에너지 ${energy}`, 60, 280);

  stats.forEach((stat, index) => {
    const y = 348 + index * 74;
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

  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 20px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(`${new Date().toLocaleDateString("ko-KR")} · 사회정서교육(SEL) 공동체 활동`, 60, 648);

  const link = document.createElement("a");
  link.download = `공동체빌더스_${name}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function Game() {
  const [profile, setProfile] = useState(null);
  const started = !!profile;

  const user = useMemo(() => {
    const index = Math.floor(Math.random() * playerPalette.length);
    return {
      id: uid(),
      color: playerPalette[index],
      hair: HAIR_OPTIONS[index % 4],
    };
  }, []);

  // 초기 방향은 카메라를 마주 보게(-3π/4) 두어 얼굴이 먼저 보이도록 한다
  const playerRef = useRef({ x: 0, z: 0, dir: -Math.PI * 0.75, moving: false });
  const inputRef = useRef({ keys: new Set(), joy: { x: 0, y: 0 } });
  const runningRef = useRef(false);

  const [playerHud, setPlayerHud] = useState({ x: 0, z: 0, dir: 0 });
  const [nearQuest, setNearQuest] = useState(null);
  const [activeQuest, setActiveQuest] = useState(null);
  const [solved, setSolved] = useState({});
  const [answered, setAnswered] = useState({});
  const [discovered, setDiscovered] = useState({});
  const [peers, setPeers] = useState({});
  const [fogs, setFogs] = useState(() => fogSeeds.map((fog) => ({ ...fog, cleared: false })));
  const [projectiles, setProjectiles] = useState([]);
  const [energy, setEnergy] = useState(0);
  const [toast, setToast] = useState("");
  const [score, setScore] = useState({ self: 20, empathy: 20, relation: 20, community: 20 });
  const [endingDismissed, setEndingDismissed] = useState(false);

  const fogsRef = useRef(fogs);
  const projectilesRef = useRef(projectiles);
  const nearQuestRef = useRef(null);

  const completed = Object.values(solved).filter(Boolean).length;
  const discoveredCount = Object.values(discovered).filter(Boolean).length;
  const peerList = Object.values(peers);
  const onlineCount = peerList.length + 1;
  const clearedFogCount = fogs.filter((fog) => fog.cleared).length;
  const endingOpen = started && completed === quests.length && !endingDismissed;

  runningRef.current = started && !activeQuest && !endingOpen;

  useEffect(() => {
    fogsRef.current = fogs;
  }, [fogs]);

  useEffect(() => {
    projectilesRef.current = projectiles;
  }, [projectiles]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // 월드 rAF 루프에서 140ms마다 호출되는 위치 동기화
  const handleSync = useCallback((snapshot) => {
    setPlayerHud(snapshot);
  }, []);

  const handleBlocked = useCallback(() => {
    setToast("길이 빛장벽에 막혔습니다. 스페이스(공감 빛구슬)로 깨고 지나가세요.");
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
  }, [playerHud, discovered]);

  const openQuest = useCallback((quest) => {
    setActiveQuest({ quest, view: null });
  }, []);
  const openQuestRef = useRef(openQuest);
  openQuestRef.current = openQuest;

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

  // 키보드는 마운트 시 1회만 바인딩하고, 최신 상태는 ref로 읽는다.
  useEffect(() => {
    const keyMap = {
      w: "up", arrowup: "up",
      s: "down", arrowdown: "down",
      a: "left", arrowleft: "left",
      d: "right", arrowright: "right",
    };
    const onDown = (event) => {
      if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      const key = event.key.toLowerCase();
      if (keyMap[key]) {
        event.preventDefault();
        inputRef.current.keys.add(keyMap[key]);
      }
      if (event.code === "Space") {
        event.preventDefault();
        if (!event.repeat && runningRef.current) shootRef.current();
      }
      if (key === "e" && !event.repeat && nearQuestRef.current && runningRef.current) {
        openQuestRef.current(nearQuestRef.current);
      }
    };
    const onUp = (event) => {
      const key = event.key.toLowerCase();
      if (keyMap[key]) inputRef.current.keys.delete(keyMap[key]);
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

      current.forEach((projectile) => {
        const moved = {
          ...projectile,
          x: projectile.x + projectile.dx * 1.2,
          z: projectile.z + projectile.dz * 1.2,
          life: projectile.life - 1,
        };
        const hit = fogsNow.find(
          (fog) => !fog.cleared && Math.hypot(fog.x - moved.x, fog.z - moved.z) < 1.45
        );
        if (hit) {
          hitFogIds.add(hit.id);
        } else if (moved.life > 0 && Math.abs(moved.x) < HALF && Math.abs(moved.z) < HALF) {
          next.push(moved);
        }
      });

      if (hitFogIds.size) {
        setFogs((prev) => prev.map((fog) => (hitFogIds.has(fog.id) ? { ...fog, cleared: true } : fog)));
        setEnergy((prev) => Math.min(100, prev + hitFogIds.size * 12));
        setScore((prev) => ({
          ...prev,
          empathy: Math.min(100, prev.empathy + hitFogIds.size * 4),
          community: Math.min(100, prev.community + hitFogIds.size * 5),
        }));
        setToast(`빛장벽 ${hitFogIds.size}개 해제!`);
      }
      setProjectiles(next);
    }, 70);
    return () => window.clearInterval(interval);
  }, []);

  // 로컬 멀티플레이(WS): http 환경에서만, 접속은 1회만 맺고 위치는 주기 전송
  useEffect(() => {
    if (!started) return undefined;
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

  // 우리 반 모드: 진행 상황을 1초 디바운스로 Firestore에 기록
  useEffect(() => {
    if (!profile?.room) return undefined;
    const timer = window.setTimeout(() => {
      import("./lib/firebase.js")
        .then((fb) => fb.pushProgress(profile.room, user.id, {
          name: profile.name,
          color: user.color,
          found: discoveredCount,
          solvedCount: completed,
          cleared: clearedFogCount,
          energy,
          score,
          done: completed === quests.length,
        }))
        .catch(() => {});
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [profile, user, discoveredCount, completed, clearedFogCount, energy, score]);

  const startGame = (name, room) => {
    setProfile({ name, room });
    if (room) {
      import("./lib/firebase.js")
        .then(async (fb) => {
          await fb.pushProgress(room, user.id, {
            name,
            color: user.color,
            found: 0,
            solvedCount: 0,
            cleared: 0,
            energy: 0,
            score,
            done: false,
          });
          setToast(`우리 반(${room})에 연결되었습니다. 마을을 깨워 볼까요?`);
        })
        .catch(() => setToast("우리 반 연결에 실패했습니다. 혼자 모드로 시작합니다."));
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
        setScore((prev) => ({ ...prev, [quest.stat]: Math.min(100, prev[quest.stat] + 18) }));
        setEnergy((prev) => Math.min(100, prev + 8));
        setSolved((prev) => ({ ...prev, [quest.id]: true }));
      } else if (!answered[quest.id]) {
        setScore((prev) => ({ ...prev, [quest.stat]: Math.min(100, prev[quest.stat] + 5) }));
      }
    }
    setAnswered((prev) => ({ ...prev, [quest.id]: true }));
    setActiveQuest({ quest, view: "result", choice });
  };

  const reset = () => {
    playerRef.current = { x: 0, z: 0, dir: -Math.PI * 0.75, moving: false };
    setPlayerHud({ x: 0, z: 0, dir: 0 });
    setSolved({});
    setAnswered({});
    setDiscovered({});
    const resetFogs = fogSeeds.map((fog) => ({ ...fog, cleared: false }));
    setFogs(resetFogs);
    fogsRef.current = resetFogs;
    setProjectiles([]);
    projectilesRef.current = [];
    setEnergy(0);
    setScore({ self: 20, empathy: 20, relation: 20, community: 20 });
    setEndingDismissed(false);
    setToast("공동체 월드가 다시 시작되었습니다.");
    setActiveQuest(null);
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

  const dialogView = activeQuest
    ? activeQuest.view || (solved[activeQuest.quest.id] ? "recap" : "ask")
    : null;

  return (
    <main className="game-shell">
      <GameWorld
        playerRef={playerRef}
        inputRef={inputRef}
        fogsRef={fogsRef}
        runningRef={runningRef}
        solved={solved}
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
          {profile?.room && <div className="room-chip small">반 {profile.room}</div>}
        </div>
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

      <section className="hud bottom-left">
        <div className="control-title">
          <Gamepad2 size={18} />
          <span>이동</span>
        </div>
        <Joystick inputRef={inputRef} />
        <button className="shoot-button" onClick={() => runningRef.current && shoot()}>
          <Sparkles size={16} /> 공감 빛구슬
        </button>
        <button className="reset" onClick={reset}><RotateCcw size={16} /> 다시 시작</button>
      </section>

      <section className="hud bottom-right">
        <div className="near-card">
          {nearQuest ? (
            <>
              <div className="near-avatar" style={{ borderColor: nearQuest.color }}>
                <img src={portraitOf(nearQuest.id)} alt={nearQuest.name} />
              </div>
              <div>
                <strong>{nearQuest.title}</strong>
                <span>
                  {solved[nearQuest.id]
                    ? `${nearQuest.name}의 미션을 이미 해결했습니다.`
                    : `${nearQuest.name}와 공동체 미션을 시작할 수 있습니다.`}
                </span>
                <button onClick={() => openQuest(nearQuest)}>
                  {solved[nearQuest.id] ? "다시 이야기하기" : "함께 해결하기 (E)"}
                </button>
              </div>
            </>
          ) : (
            <>
              <Compass size={18} />
              <div>
                <strong>넓은 공동체 월드</strong>
                <span>장벽 {clearedFogCount}/{fogs.length} 해제 · 미션 {completed}/{quests.length} 해결</span>
              </div>
            </>
          )}
        </div>
      </section>

      {toast && <div className="toast">{toast}</div>}

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
                {dialogView === "recap" && <h2>우리가 함께 해결한 미션이야. 고마워!</h2>}
              </div>
            </div>

            {dialogView === "ask" && (
              <div className="choice-grid">
                {activeQuest.quest.choices.map((choice) => (
                  <button key={choice.text} onClick={() => choose(choice)}>
                    {choice.text}
                  </button>
                ))}
              </div>
            )}

            {(dialogView === "result" || dialogView === "recap") && (
              <div className="insight-block">
                {dialogView === "recap" && (
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
                <button className="dialog-confirm" onClick={() => setActiveQuest(null)}>
                  확인
                </button>
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
              <br />빛장벽 {clearedFogCount}개 해제 · 공동체 에너지 {energy}
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
              <button
                className="primary"
                onClick={() => saveResultCard({
                  name: profile.name,
                  score,
                  energy,
                  cleared: clearedFogCount,
                  title: endingTitle,
                })}
              >
                인증서 저장
              </button>
              <button onClick={() => setEndingDismissed(true)}>계속 탐험</button>
              <button onClick={reset}>다시 시작</button>
            </div>
          </div>
        </section>
      )}

      {!started && <IntroScreen onStart={startGame} />}
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

createRoot(document.getElementById("root")).render(<App />);
