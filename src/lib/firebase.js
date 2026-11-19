// 우리 반 모드: mind-jump Firebase 프로젝트의 rooms/* 규칙을 재사용한다.
// (sel-platformer의 rooms/{code}/students, mind-ride의 rooms/{code}/riders와 동일 패턴)
//
// 보안 규칙(2026-11 잠금판): 익명 로그인한 사람만 읽고 쓸 수 있고,
// 학생은 '내 uid' 문서(builders/{uid})에만 쓸 수 있다. 지우기는 아무도 못 한다.
import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, connectAuthEmulator } from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  setDoc,
  collection,
  onSnapshot,
} from "firebase/firestore";

const FB_CONFIG = {
  apiKey: "AIzaSyAPjRhpGsBiILOk4xIO6qdwU5deE556nis",
  authDomain: "mind-jump.firebaseapp.com",
  projectId: "mind-jump",
  storageBucket: "mind-jump.firebasestorage.app",
  messagingSenderId: "640879942374",
  appId: "1:640879942374:web:072026fb598ddc39777927",
};

// 개발 PC에서 ?emu 를 붙여 열 때만 로컬 에뮬레이터로 (배포 주소 github.io 에서는 켜지지 않음)
const USE_EMULATOR =
  typeof location !== "undefined" &&
  /^(localhost|127\.0\.0\.1)$/.test(location.hostname) &&
  new URLSearchParams(location.search).has("emu");

let db = null;
let auth = null;
let uidPromise = null;

function init() {
  if (db) return;
  const app = initializeApp(FB_CONFIG);
  db = getFirestore(app);
  auth = getAuth(app);
  if (USE_EMULATOR) {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
}

function getDb() {
  init();
  return db;
}

// 익명 로그인 — 같은 기기·브라우저면 uid 가 유지되어 '새로 시작'해도 같은 문서를 이어 쓴다
// (예전 cb_uid 와 같은 역할). 실패하면 다음 호출 때 다시 시도한다.
export function ensureUid() {
  init();
  if (!uidPromise) {
    uidPromise = signInAnonymously(auth)
      .then((cred) => cred.user.uid)
      .catch((error) => {
        uidPromise = null;
        throw error;
      });
  }
  return uidPromise;
}

// 로그인 뒤에 구독을 시작하고, 바로 쓸 수 있는 구독 해제 함수를 돌려준다
function subscribeAfterAuth(start, onFail) {
  let unsub = null;
  let cancelled = false;
  ensureUid()
    .then(() => {
      if (!cancelled) unsub = start();
    })
    .catch(() => {
      if (!cancelled) onFail();
    });
  return () => {
    cancelled = true;
    if (unsub) unsub();
  };
}

// 주의: Firestore 규칙이 rooms/{room}의 하위 문서만 허용하므로
// 방 부모 문서는 만들지 않는다. 방은 builders 하위 문서로 암묵 생성된다.
// 문서 ID 는 넘겨받은 playerId 대신 익명 로그인 uid 를 쓴다(규칙: 내 uid 문서만 쓰기).
export async function pushProgress(code, _playerId, data) {
  const uid = await ensureUid();
  await setDoc(
    doc(getDb(), "rooms", code, "builders", uid),
    { ...data, updatedAt: Date.now() },
    { merge: true }
  );
}

export function watchRoom(code, callback) {
  return subscribeAfterAuth(
    () =>
      onSnapshot(
        collection(getDb(), "rooms", code, "builders"),
        (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        () => callback(null)
      ),
    () => callback(null)
  );
}

// 부하 최적화: 학생 전원이 반 전체를 구독하면 read가 N²로 폭증한다.
// 그래서 교사 화면만 watchRoom으로 전체를 집계하고, 반 밝기 요약을
// builders/__summary 한 문서에 대신 기록한다(규칙: total·count·purified·updatedAt 만 허용).
// 학생은 이 한 문서만 watchSummary로 구독해 read를 O(N)로 낮춘다.
export async function pushSummary(code, data) {
  await ensureUid();
  await setDoc(
    doc(getDb(), "rooms", code, "builders", "__summary"),
    { ...data, updatedAt: Date.now() },
    { merge: true }
  );
}

export function watchSummary(code, callback) {
  return subscribeAfterAuth(
    () =>
      onSnapshot(
        doc(getDb(), "rooms", code, "builders", "__summary"),
        (snap) => callback(snap.exists() ? snap.data() : null),
        () => callback(null)
      ),
    () => callback(null)
  );
}
