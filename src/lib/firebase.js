// 우리 반 모드: mind-jump Firebase 프로젝트의 rooms/* 규칙을 재사용한다.
// (sel-platformer의 rooms/{code}/students, mind-ride의 rooms/{code}/riders와 동일 패턴)
import { initializeApp } from "firebase/app";
import {
  getFirestore,
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

let db = null;

function getDb() {
  if (!db) db = getFirestore(initializeApp(FB_CONFIG));
  return db;
}

// 주의: Firestore 규칙이 rooms/{room}의 하위 문서만 허용하므로
// 방 부모 문서는 만들지 않는다. 방은 builders 하위 문서로 암묵 생성된다.
export async function pushProgress(code, playerId, data) {
  await setDoc(
    doc(getDb(), "rooms", code, "builders", playerId),
    { ...data, updatedAt: Date.now() },
    { merge: true }
  );
}

export function watchRoom(code, callback) {
  return onSnapshot(
    collection(getDb(), "rooms", code, "builders"),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    () => callback(null)
  );
}
