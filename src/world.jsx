import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { quests, fogSeeds, HALF } from "./data/index.js";
import { clamp } from "./lib/utils.js";

const MOVE_SPEED = 9.2;
const SYNC_INTERVAL = 140;

const terrainColors = {
  grass: 0x72d36b,
  moss: 0x9bea7e,
  sand: 0xf0cf80,
  water: 0x5bc7f0,
  path: 0xdcb887,
  plaza: 0xd8d0be,
  bridge: 0xb98a52,
};

const terrainTopColors = {
  grass: 0x91dd78,
  moss: 0x91dd78,
  sand: 0xf7dd9a,
  path: 0xe6c794,
  plaza: 0xe4ddca,
  bridge: 0xcda06a,
};

const POOLS = [
  { x: 22, z: -19, r: 6 },
  { x: -18, z: 26, r: 6 },
];

// 마을 집 후보(방사형 길 사이 각도) — 아래에서 길·장벽·연못과 겹치지 않는 곳만 선별
const HOUSE_CANDIDATES = [
  [15, 3], [-15, 3], [-5, -14], [5, -13], [-1, 13.5], [16, -2], [-16, -2], [13, 10],
  [34.3, 6.9], [-34.5, 6.1], [-6.3, 34.4], [12, 32.9], [8.2, -34], [-12.8, -32.6], [-33.3, -10.8], [27.2, -22],
];
const HOUSE_COLORS = [0xf4a9a0, 0xa8d8f0, 0xf7d794, 0xb8e0b8, 0xd7b8e8, 0xf0c8a0];

function groundHeight(x, z) {
  return Math.sin(x * 0.8) * Math.cos(z * 0.7) * 0.08;
}

// 지형 데이터: 중앙 광장 + 16거점 방사형 길 + 순환로(반지름 24) + 연못/다리
function computeTerrainData() {
  const pathSet = new Set();
  const key = (x, z) => `${x},${z}`;
  const stamp = (x, z) => {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) pathSet.add(key(x + dx, z + dz));
    }
  };
  quests.forEach((quest) => {
    const [qx, qz] = quest.pos;
    const steps = Math.ceil(Math.hypot(qx, qz));
    for (let i = 0; i <= steps; i += 1) {
      const fx = (qx * i) / steps;
      const fz = (qz * i) / steps;
      // 길은 광장 가장자리부터 시작 (중심 수렴으로 광장이 길로 뒤덮이는 것 방지)
      if (Math.hypot(fx, fz) < 7.5) continue;
      stamp(Math.round(fx), Math.round(fz));
    }
  });
  // 내측·외측 순환로
  [24, 46].forEach((ringRadius) => {
    const ringSteps = Math.ceil(ringRadius * 9);
    for (let i = 0; i < ringSteps; i += 1) {
      const angle = (i / ringSteps) * Math.PI * 2;
      stamp(Math.round(Math.cos(angle) * ringRadius), Math.round(Math.sin(angle) * ringRadius));
    }
  });

  const tiles = [];
  const waterSet = new Set();
  for (let x = -HALF; x <= HALF; x += 1) {
    for (let z = -HALF; z <= HALF; z += 1) {
      const d = Math.sqrt(x * x + z * z);
      if (d > HALF + 0.6) continue;
      const onPath = pathSet.has(key(x, z));
      const inPool = POOLS.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < p.r * p.r);
      const nearPool = POOLS.some((p) => (x - p.x) ** 2 + (z - p.z) ** 2 < (p.r + 1.8) ** 2);
      let type = "grass";
      if ((x + 41) ** 2 + (z - 45) ** 2 < 110 || (x - 42) ** 2 + (z - 41) ** 2 < 90) type = "moss";
      if (onPath) type = "path";
      if (d <= 7) type = "plaza";
      if (nearPool && !inPool && !onPath && d > 7) type = "sand";
      if (d > HALF - 2.5) type = "sand";
      if (inPool) type = onPath ? "bridge" : "water";
      if (type === "water") waterSet.add(key(x, z));
      const height =
        type === "water" ? -0.1 :
        type === "bridge" ? 0.06 :
        type === "plaza" ? 0.02 :
        groundHeight(x, z);
      tiles.push({ x, z, type, height });
    }
  }
  return { tiles, pathSet, waterSet };
}

const TERRAIN = computeTerrainData();

// 길·연못·거점·빛장벽·이웃 집과 겹치지 않는 후보만 집으로 확정
function isHouseSpotFree(x, z, placed) {
  const rx = Math.round(x);
  const rz = Math.round(z);
  for (let dx = -2; dx <= 2; dx += 1) {
    for (let dz = -2; dz <= 2; dz += 1) {
      if (TERRAIN.pathSet.has(`${rx + dx},${rz + dz}`)) return false;
    }
  }
  if (POOLS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 3.5)) return false;
  if (quests.some((q) => Math.hypot(x - q.pos[0], z - q.pos[1]) < 6)) return false;
  if (fogSeeds.some((f) => Math.hypot(x - f.x, z - f.z) < 3.4)) return false;
  if (placed.some((h) => Math.hypot(x - h[0], z - h[1]) < 7)) return false;
  return true;
}

const HOUSES = HOUSE_CANDIDATES.reduce((placed, [x, z], index) => {
  if (placed.length < 9 && isHouseSpotFree(x, z, placed)) {
    placed.push([x, z, HOUSE_COLORS[index % HOUSE_COLORS.length]]);
  }
  return placed;
}, []);

// 보물찾기: 길에서 벗어난 곳에 숨겨 두는 '마음 조각' 24개
export const treasureSeeds = (() => {
  const rand = mulberry32(777123);
  const spots = [];
  let tries = 0;
  while (spots.length < 24 && tries < 6000) {
    tries += 1;
    const x = (rand() * 2 - 1) * (HALF - 6);
    const z = (rand() * 2 - 1) * (HALF - 6);
    const d = Math.hypot(x, z);
    if (d < 10 || d > HALF - 6) continue;
    const rx = Math.round(x);
    const rz = Math.round(z);
    let onPath = false;
    for (let dx = -1; dx <= 1 && !onPath; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        if (TERRAIN.pathSet.has(`${rx + dx},${rz + dz}`)) {
          onPath = true;
          break;
        }
      }
    }
    if (onPath) continue;
    if (POOLS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 2)) continue;
    if (quests.some((q) => Math.hypot(x - q.pos[0], z - q.pos[1]) < 5)) continue;
    if (fogSeeds.some((f) => Math.hypot(x - f.x, z - f.z) < 2.2)) continue;
    if (HOUSES.some((h) => Math.hypot(x - h[0], z - h[1]) < 2.8)) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 7)) continue;
    spots.push({ id: `treasure-${spots.length + 1}`, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 });
  }
  return spots;
})();

function mat(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.68,
    metalness: 0.02,
    ...options,
  });
}

function lerpAngle(current, target, t) {
  const delta = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return current + delta * t;
}

function easeOutBack(x) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}

// 청키(복셀풍) 캐릭터: 얼굴·앞머리·발끝은 앞(-z), 뒷머리·백팩은 뒤(+z)로
// 앞뒤가 한눈에 구분되고, 팔다리는 어깨/골반 피벗으로 걷기 애니메이션이 가능하다.
function createCharacterModel({ color, hair = 0x26314d, player = false }) {
  const group = new THREE.Group();
  const skinMat = mat(0xffd9bd, { roughness: 0.72 });
  const outfitMat = mat(color, { roughness: 0.6 });
  const pantsMat = mat(0x2b3a55, { roughness: 0.75 });
  const hairMat = mat(hair, { roughness: 0.85 });
  const shoeMat = mat(0x212c3f, { roughness: 0.55 });
  const scleraMat = mat(0xffffff, { roughness: 0.3 });
  const pupilMat = mat(0x141d2e, { roughness: 0.3 });
  const browMat = mat(0x2a2016, { roughness: 0.6 });
  const smileMat = mat(0xc65b66, { roughness: 0.5 });
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xff9d9d, transparent: true, opacity: 0.5 });
  const capMat = mat(0xf59e0b, { roughness: 0.55 });
  const packMat = mat(0xef4444, { roughness: 0.6 });

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.52, 36),
    new THREE.MeshBasicMaterial({ color: 0x223044, transparent: true, opacity: 0.2 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;

  const legGeo = new THREE.BoxGeometry(0.2, 0.34, 0.24);
  legGeo.translate(0, -0.17, 0);
  const footGeo = new THREE.BoxGeometry(0.22, 0.12, 0.34);
  footGeo.translate(0, -0.4, -0.06);

  const makeLeg = (x) => {
    const leg = new THREE.Group();
    const upper = new THREE.Mesh(legGeo, pantsMat);
    upper.castShadow = true;
    const foot = new THREE.Mesh(footGeo, shoeMat);
    foot.castShadow = true;
    leg.add(upper, foot);
    leg.position.set(x, 0.46, 0);
    return leg;
  };
  const leftLeg = makeLeg(-0.15);
  const rightLeg = makeLeg(0.15);

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.54, 0.4), outfitMat);
  body.position.y = 0.73;
  body.castShadow = true;
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.46, 0.02), mat(0xf8fafc, { roughness: 0.5 }));
  placket.position.set(0, 0.73, -0.205);

  const armGeo = new THREE.BoxGeometry(0.17, 0.42, 0.21);
  armGeo.translate(0, -0.18, 0);
  const handGeo = new THREE.SphereGeometry(0.095, 12, 10);
  handGeo.translate(0, -0.42, 0);

  const makeArm = (x) => {
    const arm = new THREE.Group();
    const sleeve = new THREE.Mesh(armGeo, outfitMat);
    sleeve.castShadow = true;
    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.castShadow = true;
    arm.add(sleeve, hand);
    arm.position.set(x, 0.96, 0);
    return arm;
  };
  const leftArm = makeArm(-0.41);
  const rightArm = makeArm(0.41);

  const head = new THREE.Group();
  head.position.y = 1.02;

  const face = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.58, 0.6), skinMat);
  face.position.y = 0.29;
  face.castShadow = true;

  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.66), hairMat);
  hairTop.position.set(0, 0.56, 0);
  hairTop.castShadow = true;
  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.5, 0.18), hairMat);
  hairBack.position.set(0, 0.28, 0.26);
  hairBack.castShadow = true;
  const fringe = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.13, 0.08), hairMat);
  fringe.position.set(0, 0.47, -0.29);

  const eyeGeoWhite = new THREE.CircleGeometry(0.085, 20);
  const eyeGeoPupil = new THREE.CircleGeometry(0.048, 16);
  const eyeGeoLight = new THREE.CircleGeometry(0.018, 10);
  const faceZ = -0.302;
  const makeEye = (x) => {
    const eye = new THREE.Group();
    const sclera = new THREE.Mesh(eyeGeoWhite, scleraMat);
    const pupil = new THREE.Mesh(eyeGeoPupil, pupilMat);
    pupil.position.z = -0.004;
    const light = new THREE.Mesh(eyeGeoLight, scleraMat);
    light.position.set(0.022, 0.024, -0.008);
    eye.add(sclera, pupil, light);
    eye.position.set(x, 0.31, faceZ);
    eye.rotation.y = Math.PI;
    return eye;
  };
  const leftEye = makeEye(-0.16);
  const rightEye = makeEye(0.16);

  const browGeo = new THREE.BoxGeometry(0.14, 0.035, 0.02);
  const leftBrow = new THREE.Mesh(browGeo, browMat);
  leftBrow.position.set(-0.16, 0.45, faceZ);
  const rightBrow = new THREE.Mesh(browGeo, browMat);
  rightBrow.position.set(0.16, 0.45, faceZ);

  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 8, 20, Math.PI), smileMat);
  smile.position.set(0, 0.16, faceZ);
  smile.rotation.z = Math.PI;

  const blushGeo = new THREE.CircleGeometry(0.055, 12);
  const leftBlush = new THREE.Mesh(blushGeo, blushMat);
  leftBlush.position.set(-0.24, 0.18, faceZ);
  leftBlush.rotation.y = Math.PI;
  const rightBlush = new THREE.Mesh(blushGeo, blushMat);
  rightBlush.position.set(0.24, 0.18, faceZ);
  rightBlush.rotation.y = Math.PI;

  head.add(face, hairTop, hairBack, fringe, leftEye, rightEye, leftBrow, rightBrow, smile, leftBlush, rightBlush);

  group.add(shadow, leftLeg, rightLeg, body, placket, leftArm, rightArm, head);

  if (player) {
    const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.2, 0.68), capMat);
    capTop.position.set(0, 0.62, 0);
    capTop.castShadow = true;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.06, 0.3), capMat);
    brim.position.set(0, 0.53, -0.46);
    head.add(capTop, brim);

    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.44, 0.22), packMat);
    pack.position.set(0, 0.78, 0.3);
    pack.castShadow = true;
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.06), mat(0xfca5a5, { roughness: 0.6 }));
    pocket.position.set(0, 0.68, 0.43);
    group.add(pack, pocket);

    const tri = new THREE.Shape();
    tri.moveTo(-0.16, 0);
    tri.lineTo(0.16, 0);
    tri.lineTo(0, 0.34);
    const arrowGeo = new THREE.ShapeGeometry(tri);
    arrowGeo.rotateX(-Math.PI / 2);
    const arrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.55, depthWrite: false })
    );
    arrow.position.set(0, 0.045, -0.62);
    group.add(arrow);
  }

  group.scale.setScalar(player ? 1.04 : 0.94);
  return {
    group,
    parts: { leftArm, rightArm, leftLeg, rightLeg, body, head },
  };
}

function createFogModel() {
  const group = new THREE.Group();
  const crystalMat = mat(0x6d7488, {
    roughness: 0.24,
    transparent: true,
    opacity: 0.86,
    emissive: new THREE.Color(0x7c8cff),
    emissiveIntensity: 0.26,
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.78, 1), crystalMat);
  core.scale.set(0.9, 1.45, 0.9);
  core.position.y = 0.15;
  core.castShadow = true;
  const shardA = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), crystalMat);
  shardA.position.set(-0.62, -0.05, 0.08);
  shardA.scale.set(0.75, 1.25, 0.75);
  shardA.rotation.z = -0.34;
  shardA.castShadow = true;
  const shardB = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), crystalMat);
  shardB.position.set(0.58, -0.08, -0.06);
  shardB.scale.set(0.72, 1.1, 0.72);
  shardB.rotation.z = 0.28;
  shardB.castShadow = true;
  const ringMat = mat(0x9aa3b8, {
    transparent: true,
    opacity: 0.62,
    emissive: new THREE.Color(0x8ba0ff),
    emissiveIntensity: 0.35,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.035, 10, 64), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.54;
  group.add(core, shardA, shardB, ring);
  group.position.y = 1.05;
  return { group, mats: [crystalMat, ringMat] };
}

// 마음 조각(보물): 반짝이는 작은 하트
// 씬 dispose와 함께 정리되도록 캐시 없이 매번 생성한다 (24개, 비용 미미)
function createTreasureMesh() {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.35);
  shape.bezierCurveTo(0, 0.6, -0.35, 0.6, -0.35, 0.3);
  shape.bezierCurveTo(-0.35, 0.05, 0, -0.05, 0, -0.35);
  shape.bezierCurveTo(0, -0.05, 0.35, 0.05, 0.35, 0.3);
  shape.bezierCurveTo(0.35, 0.6, 0, 0.6, 0, 0.35);
  const treasureGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    bevelSegments: 2,
  });
  treasureGeo.center();
  const treasureMat = mat(0xff6b9d, {
    emissive: new THREE.Color(0xff4d88),
    emissiveIntensity: 0.85,
    roughness: 0.28,
  });
  const group = new THREE.Group();
  const heart = new THREE.Mesh(treasureGeo, treasureMat);
  heart.scale.setScalar(0.55);
  heart.castShadow = true;
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.32, 20),
    new THREE.MeshBasicMaterial({ color: 0xff9dbd, transparent: true, opacity: 0.28, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = -0.72;
  group.add(heart, glow);
  return group;
}

// 숨은 NPC를 감싸는 안개 고치 + 물음표 표식
let questionTexture = null;
function getQuestionTexture() {
  if (questionTexture) return questionTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 74px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", 64, 68);
  questionTexture = new THREE.CanvasTexture(canvas);
  return questionTexture;
}

function createMistCocoon() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xe3e9f2,
    transparent: true,
    opacity: 0.82,
    roughness: 1,
    metalness: 0,
  });
  const geo = new THREE.SphereGeometry(1, 14, 10);
  [
    [0, 0.75, 0, 0.95],
    [0.72, 0.55, 0.25, 0.62],
    [-0.68, 0.6, -0.12, 0.66],
    [0.18, 0.5, 0.7, 0.56],
    [-0.24, 0.55, -0.66, 0.6],
    [0, 1.5, 0, 0.62],
  ].forEach(([x, y, z, s]) => {
    const puff = new THREE.Mesh(geo, material);
    puff.position.set(x, y, z);
    puff.scale.setScalar(s);
    group.add(puff);
  });
  const spriteMat = new THREE.SpriteMaterial({ map: getQuestionTexture(), transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(0.85, 0.85, 1);
  sprite.position.y = 2.55;
  group.add(sprite);
  return { group, material, sprite };
}

// 지형은 타일 수천 개를 InstancedMesh로 묶어 드로우콜과 재질 수를 최소화한다.
function buildTerrain(scene) {
  const blockGeo = new THREE.BoxGeometry(1, 0.42, 1);
  const edgeGeo = new THREE.BoxGeometry(0.92, 0.035, 0.92);
  const matrix = new THREE.Matrix4();

  const byType = {};
  TERRAIN.tiles.forEach((tile) => {
    (byType[tile.type] ||= []).push(tile);
  });

  Object.entries(byType).forEach(([type, group]) => {
    if (!group.length) return;
    const isWater = type === "water";
    const material = mat(terrainColors[type], {
      roughness: isWater ? 0.26 : 0.78,
      metalness: isWater ? 0.02 : 0,
      ...(isWater
        ? { transparent: true, opacity: 0.68, emissive: new THREE.Color(0x1b7fb3), emissiveIntensity: 0.1 }
        : {}),
    });
    const instanced = new THREE.InstancedMesh(blockGeo, material, group.length);
    group.forEach((tile, i) => {
      matrix.setPosition(tile.x, tile.height, tile.z);
      instanced.setMatrixAt(i, matrix);
    });
    instanced.receiveShadow = true;
    instanced.castShadow = !isWater;
    scene.add(instanced);

    if (!isWater) {
      const tops = new THREE.InstancedMesh(edgeGeo, mat(terrainTopColors[type], { roughness: 0.82 }), group.length);
      group.forEach((tile, i) => {
        matrix.setPosition(tile.x, tile.height + 0.23, tile.z);
        tops.setMatrixAt(i, matrix);
      });
      tops.receiveShadow = true;
      scene.add(tops);
    }
  });
}

function mulberry32(seed) {
  let a = seed;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isDecorBlocked(x, z) {
  const d = Math.hypot(x, z);
  if (d > HALF - 4 || d < 8.5) return true;
  const rx = Math.round(x);
  const rz = Math.round(z);
  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dz = -1; dz <= 1; dz += 1) {
      if (TERRAIN.pathSet.has(`${rx + dx},${rz + dz}`)) return true;
    }
  }
  if (POOLS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 2)) return true;
  if (quests.some((q) => Math.hypot(x - q.pos[0], z - q.pos[1]) < 4.5)) return true;
  if (fogSeeds.some((f) => Math.hypot(x - f.x, z - f.z) < 2.4)) return true;
  if (HOUSES.some((h) => Math.hypot(x - h[0], z - h[1]) < 3.6)) return true;
  return false;
}

function buildHouse(scene, x, z, bodyColor) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.6, 2.2), mat(bodyColor, { roughness: 0.72 }));
  body.position.y = 1.0;
  body.castShadow = true;
  body.receiveShadow = true;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.15, 1.3, 4), mat(0xc95f4b, { roughness: 0.7 }));
  roof.position.y = 2.42;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.9, 0.08), mat(0x7a5230, { roughness: 0.8 }));
  door.position.set(0, 0.68, -1.12);
  const windowMat = mat(0xffe9a8, { emissive: new THREE.Color(0xffd166), emissiveIntensity: 0.55, roughness: 0.4 });
  const windowGeo = new THREE.BoxGeometry(0.5, 0.5, 0.06);
  const leftWindow = new THREE.Mesh(windowGeo, windowMat);
  leftWindow.position.set(-0.75, 1.15, -1.12);
  const rightWindow = new THREE.Mesh(windowGeo, windowMat);
  rightWindow.position.set(0.75, 1.15, -1.12);
  group.add(body, roof, door, leftWindow, rightWindow);
  group.position.set(x, groundHeight(x, z) + 0.21, z);
  group.rotation.y = Math.atan2(x, z);
  scene.add(group);
}

function buildFountain(scene) {
  const group = new THREE.Group();
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.5, 20), mat(0xcfc8b8, { roughness: 0.8 }));
  basin.position.y = 0.45;
  basin.castShadow = true;
  basin.receiveShadow = true;
  const waterMat = mat(0x5bc7f0, {
    roughness: 0.2,
    transparent: true,
    opacity: 0.85,
    emissive: new THREE.Color(0x1b7fb3),
    emissiveIntensity: 0.25,
  });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.12, 20), waterMat);
  water.position.y = 0.66;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.9, 12), mat(0xbfb7a4, { roughness: 0.8 }));
  column.position.y = 1.1;
  column.castShadow = true;
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), waterMat);
  orb.position.y = 1.68;
  group.add(basin, water, column, orb);
  group.position.y = 0.22;
  scene.add(group);
  return orb;
}

function buildDecorations(scene) {
  const rand = mulberry32(20260704);
  const trees = [];
  const bushes = [];
  const rocks = [];
  const flowers = [];
  const scatter = (count, arr, spacing) => {
    let tries = 0;
    while (arr.length < count && tries < 4000) {
      tries += 1;
      const x = (rand() * 2 - 1) * (HALF - 4);
      const z = (rand() * 2 - 1) * (HALF - 4);
      if (isDecorBlocked(x, z)) continue;
      if (arr.some((p) => Math.hypot(p[0] - x, p[1] - z) < spacing)) continue;
      arr.push([x, z, rand()]);
    }
  };
  scatter(110, trees, 3);
  scatter(55, bushes, 2.4);
  scatter(34, rocks, 3);
  scatter(180, flowers, 1.4);

  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const color = new THREE.Color();

  const trunkMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.22, 1.3, 7),
    mat(0x8b6138, { roughness: 0.9 }),
    trees.length
  );
  const leafMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.7, 14, 11),
    mat(0xffffff, { roughness: 0.82 }),
    trees.length
  );
  const leafShades = [0x4fae68, 0x5cbd74, 0x3f9e5c, 0x6ac97f];
  trees.forEach(([x, z, r], i) => {
    const s = 0.8 + r * 0.6;
    const y = groundHeight(x, z);
    matrix.compose(pos.set(x, y + 0.65 * s, z), quat, scale.set(s, s, s));
    trunkMesh.setMatrixAt(i, matrix);
    matrix.compose(pos.set(x, y + 1.72 * s, z), quat, scale.set(s, s * 0.94, s));
    leafMesh.setMatrixAt(i, matrix);
    leafMesh.setColorAt(i, color.setHex(leafShades[i % leafShades.length]));
  });
  trunkMesh.castShadow = true;
  leafMesh.castShadow = true;
  scene.add(trunkMesh, leafMesh);

  const bushMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.5, 12, 9),
    mat(0xffffff, { roughness: 0.85 }),
    bushes.length
  );
  bushes.forEach(([x, z, r], i) => {
    const s = 0.8 + r * 0.5;
    matrix.compose(pos.set(x, groundHeight(x, z) + 0.42 * s, z), quat, scale.set(1.25 * s, 0.72 * s, 1.25 * s));
    bushMesh.setMatrixAt(i, matrix);
    bushMesh.setColorAt(i, color.setHex(i % 2 ? 0x55b06b : 0x66c07a));
  });
  bushMesh.castShadow = true;
  scene.add(bushMesh);

  const rockMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(0.42, 0),
    mat(0xffffff, { roughness: 0.9 }),
    rocks.length
  );
  rocks.forEach(([x, z, r], i) => {
    const s = 0.7 + r * 0.7;
    matrix.compose(pos.set(x, groundHeight(x, z) + 0.32 * s, z), quat, scale.set(s, 0.78 * s, s));
    rockMesh.setMatrixAt(i, matrix);
    rockMesh.setColorAt(i, color.setHex(i % 2 ? 0x9aa3ad : 0xb2bac2));
  });
  rockMesh.castShadow = true;
  scene.add(rockMesh);

  // 꽃: 홑꽃 + 꽃밭 클러스터 12곳, 3종(구슬꽃·데이지·튤립)
  const flowerSpots = [];
  flowers.forEach(([x, z, r]) => flowerSpots.push({ x, z, type: Math.floor(r * 3) % 3, v: r }));
  const clusterCenters = [];
  scatter(12, clusterCenters, 13);
  clusterCenters.forEach(([cx, cz, cr]) => {
    const count = 14 + Math.floor(cr * 9);
    const clusterType = Math.floor(cr * 3) % 3;
    for (let i = 0; i < count; i += 1) {
      const angle = rand() * Math.PI * 2;
      const radius = Math.sqrt(rand()) * 4.2;
      const x = cx + Math.cos(angle) * radius;
      const z = cz + Math.sin(angle) * radius;
      if (TERRAIN.pathSet.has(`${Math.round(x)},${Math.round(z)}`)) continue;
      if (POOLS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 1.5)) continue;
      flowerSpots.push({ x, z, type: rand() < 0.75 ? clusterType : Math.floor(rand() * 3), v: rand() });
    }
  });

  // 광장 화단: 분수대를 두르는 꽃 테두리 (길목은 비움)
  for (let i = 0; i < 48; i += 1) {
    const angle = (i / 48) * Math.PI * 2;
    const radius = 5.4 + (i % 2) * 0.9;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (TERRAIN.pathSet.has(`${Math.round(x)},${Math.round(z)}`)) continue;
    flowerSpots.push({ x, z, type: i % 3, v: (i * 0.137) % 1 });
  }

  const byFlowerType = [[], [], []];
  flowerSpots.forEach((spot) => byFlowerType[spot.type].push(spot));

  const stemMesh = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.28, 6),
    mat(0x3d9b5d),
    flowerSpots.length
  );
  flowerSpots.forEach((spot, i) => {
    const y = groundHeight(spot.x, spot.z);
    matrix.compose(pos.set(spot.x, y + 0.48, spot.z), quat, scale.set(1, 1, 1));
    stemMesh.setMatrixAt(i, matrix);
  });
  scene.add(stemMesh);

  // 구슬꽃
  const orbShades = [0xff8fab, 0xffd166, 0x8b5cf6, 0x7dd3fc, 0xfb923c];
  const orbMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.105, 10, 8),
    mat(0xffffff, { roughness: 0.5 }),
    byFlowerType[0].length
  );
  byFlowerType[0].forEach((spot, i) => {
    const y = groundHeight(spot.x, spot.z);
    matrix.compose(pos.set(spot.x, y + 0.66, spot.z), quat, scale.set(1, 1, 1));
    orbMesh.setMatrixAt(i, matrix);
    orbMesh.setColorAt(i, color.setHex(orbShades[Math.floor(spot.v * orbShades.length) % orbShades.length]));
  });
  orbMesh.castShadow = true;
  scene.add(orbMesh);

  // 데이지 (납작한 꽃판 + 노란 중심)
  const daisyShades = [0xffffff, 0xffe4ef, 0xfdf3c8];
  const daisyPetal = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.13, 10, 8),
    mat(0xffffff, { roughness: 0.55 }),
    byFlowerType[1].length
  );
  const daisyCenter = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    mat(0xffd166, { roughness: 0.5 }),
    byFlowerType[1].length
  );
  byFlowerType[1].forEach((spot, i) => {
    const y = groundHeight(spot.x, spot.z);
    matrix.compose(pos.set(spot.x, y + 0.63, spot.z), quat, scale.set(1, 0.32, 1));
    daisyPetal.setMatrixAt(i, matrix);
    daisyPetal.setColorAt(i, color.setHex(daisyShades[Math.floor(spot.v * daisyShades.length) % daisyShades.length]));
    matrix.compose(pos.set(spot.x, y + 0.68, spot.z), quat, scale.set(1, 1, 1));
    daisyCenter.setMatrixAt(i, matrix);
  });
  scene.add(daisyPetal, daisyCenter);

  // 튤립 (달걀형 꽃봉오리)
  const tulipShades = [0xef4444, 0xf472b6, 0xa855f7, 0xfb923c, 0xfacc15];
  const tulipMesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.1, 10, 8),
    mat(0xffffff, { roughness: 0.45 }),
    byFlowerType[2].length
  );
  byFlowerType[2].forEach((spot, i) => {
    const y = groundHeight(spot.x, spot.z);
    matrix.compose(pos.set(spot.x, y + 0.68, spot.z), quat, scale.set(0.8, 1.3, 0.8));
    tulipMesh.setMatrixAt(i, matrix);
    tulipMesh.setColorAt(i, color.setHex(tulipShades[Math.floor(spot.v * tulipShades.length) % tulipShades.length]));
  });
  tulipMesh.castShadow = true;
  scene.add(tulipMesh);

  // 순환로 바깥 가로등 (내측·외측)
  const lanternSpots = [];
  [[26.4, 12], [48.4, 16]].forEach(([radius, count]) => {
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.PI / count;
      lanternSpots.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
  });
  for (const [x, z] of lanternSpots) {
    if (isDecorBlocked(x, z)) continue;
    const lantern = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.5, 8), mat(0x5b4a3a, { roughness: 0.85 }));
    pole.position.y = 0.75;
    pole.castShadow = true;
    const lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 12, 10),
      mat(0xffe9a8, { emissive: new THREE.Color(0xffd166), emissiveIntensity: 1.1, roughness: 0.3 })
    );
    lamp.position.y = 1.55;
    lantern.add(pole, lamp);
    lantern.position.set(x, groundHeight(x, z) + 0.2, z);
    scene.add(lantern);
  }

  HOUSES.forEach(([x, z, bodyColor]) => buildHouse(scene, x, z, bodyColor));
  return buildFountain(scene);
}

function disposeScene(scene, renderer) {
  const geometries = new Set();
  const materials = new Set();
  scene.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material) {
      (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach((m) => materials.add(m));
    }
  });
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  renderer.dispose();
}

// 걷기 애니메이션: 팔다리 스윙 + 몸통 통통 튀는 바운스
function applyWalkPose(parts, t, moving) {
  const swing = moving ? Math.sin(t * 11) * 0.65 : 0;
  parts.leftArm.rotation.x = swing;
  parts.rightArm.rotation.x = -swing;
  parts.leftLeg.rotation.x = -swing * 0.9;
  parts.rightLeg.rotation.x = swing * 0.9;
  if (!moving) {
    const breathe = 1 + Math.sin(t * 2.4) * 0.012;
    parts.body.scale.set(1, breathe, 1);
    parts.leftArm.rotation.z = 0.06 + Math.sin(t * 2.4) * 0.02;
    parts.rightArm.rotation.z = -0.06 - Math.sin(t * 2.4) * 0.02;
  } else {
    parts.body.scale.set(1, 1, 1);
    parts.leftArm.rotation.z = 0.04;
    parts.rightArm.rotation.z = -0.04;
  }
}

export default function GameWorld({
  playerRef,
  inputRef,
  fogsRef,
  treasuresRef,
  runningRef,
  solved,
  discovered,
  progress,
  peers,
  projectiles,
  onSync,
  onBlocked,
}) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const questRefs = useRef(new globalThis.Map());
  const peerRefs = useRef(new globalThis.Map());
  const fogRefs = useRef(new globalThis.Map());
  const treasureRefs = useRef(new globalThis.Map());
  const projectileRefs = useRef(new globalThis.Map());
  const onSyncRef = useRef(onSync);
  const onBlockedRef = useRef(onBlocked);
  const discoveredRef = useRef(discovered);
  const progressRef = useRef(progress);
  const solvedRef = useRef(solved);

  onSyncRef.current = onSync;
  onBlockedRef.current = onBlocked;
  discoveredRef.current = discovered;
  progressRef.current = progress;
  solvedRef.current = solved;

  useEffect(() => {
    if (!mountRef.current) return undefined;

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    // 초반에는 안개가 짙고, 미션이 풀릴수록 걷힌다 (rAF에서 progress 따라 보간)
    scene.background = new THREE.Color(0xbfd6e4);
    scene.fog = new THREE.Fog(0xbfd6e4, 24, 60);
    const skyFrom = new THREE.Color(0xbfd6e4);
    const skyTo = new THREE.Color(0xcdeeff);
    const skyNow = new THREE.Color();

    const aspect = mount.clientWidth / mount.clientHeight || 1;
    // ?zoom=2 처럼 붙이면 확대 (수업 시연·검증용)
    const zoom = Math.max(0.5, Math.min(4, parseFloat(new URLSearchParams(window.location.search).get("zoom")) || 1));
    const cameraSize = 18.5 / zoom;
    const camera = new THREE.OrthographicCamera(
      (-cameraSize * aspect) / 2,
      (cameraSize * aspect) / 2,
      cameraSize / 2,
      -cameraSize / 2,
      0.1,
      400
    );
    camera.position.set(7.8, 8.4, 7.8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xffffff, 0x6c7a5c, 2.4);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3df, 3.4);
    sun.position.set(8, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    scene.add(sun);
    scene.add(sun.target);
    const rim = new THREE.DirectionalLight(0x88c7ff, 1.3);
    rim.position.set(-8, 6, -8);
    scene.add(rim);

    buildTerrain(scene);
    const fountainOrb = buildDecorations(scene);

    const playerChar = createCharacterModel({ color: 0xffcf5a, hair: 0x25314d, player: true });
    scene.add(playerChar.group);

    questRefs.current.clear();
    quests.forEach((quest, questIndex) => {
      const group = new THREE.Group();
      group.position.set(quest.pos[0], 0.22, quest.pos[1]);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 0.28, 24), mat(quest.colorNum, { roughness: 0.62 }));
      base.castShadow = true;
      const character = createCharacterModel({ color: quest.colorNum, hair: quest.hairNum });
      character.group.visible = false;

      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28),
        mat(0xffffff, { emissive: new THREE.Color(quest.colorNum), emissiveIntensity: 0.7, roughness: 0.28 })
      );
      gem.position.y = 2.38;
      gem.visible = false;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.88, 0.025, 10, 72),
        mat(quest.colorNum, { emissive: new THREE.Color(quest.colorNum), emissiveIntensity: 0.25 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.2;
      ring.visible = false;

      const cocoon = createMistCocoon();
      group.add(base, ring, character.group, gem, cocoon.group);
      scene.add(group);
      questRefs.current.set(quest.id, { group, gem, ring, character, cocoon, pos: quest.pos, questIndex, reveal: 0, bloom: 0 });
    });

    // 미션을 해결하면 거점 둘레에 피어나는 꽃 (거점당 12송이, 전체 인스턴싱)
    const BLOOMS_PER_QUEST = 12;
    const bloomRand = mulberry32(4242);
    const solveFlowerData = [];
    quests.forEach((quest, questIndex) => {
      for (let i = 0; i < BLOOMS_PER_QUEST; i += 1) {
        const angle = bloomRand() * Math.PI * 2;
        const radius = 1.5 + bloomRand() * 1.3;
        solveFlowerData.push({
          questIndex,
          x: quest.pos[0] + Math.cos(angle) * radius,
          z: quest.pos[1] + Math.sin(angle) * radius,
          s: 0.7 + bloomRand() * 0.7,
          colorHex: [quest.colorNum, 0xff8fab, 0xffffff, 0xffd166][i % 4],
        });
      }
    });
    const solveBlooms = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.12, 10, 8),
      mat(0xffffff, { roughness: 0.5 }),
      solveFlowerData.length
    );
    {
      const m4 = new THREE.Matrix4();
      const col = new THREE.Color();
      const zeroScale = new THREE.Vector3(0.001, 0.001, 0.001);
      const q0 = new THREE.Quaternion();
      solveFlowerData.forEach((flower, i) => {
        m4.compose(new THREE.Vector3(flower.x, 0.5, flower.z), q0, zeroScale);
        solveBlooms.setMatrixAt(i, m4);
        solveBlooms.setColorAt(i, col.setHex(flower.colorHex));
      });
    }
    scene.add(solveBlooms);

    fogRefs.current.clear();
    fogSeeds.forEach((fog) => {
      const handle = createFogModel();
      handle.group.position.x = fog.x;
      handle.group.position.z = fog.z;
      scene.add(handle.group);
      fogRefs.current.set(fog.id, { handle, anim: 0 });
    });

    treasureRefs.current.clear();
    treasureSeeds.forEach((treasure) => {
      const group = createTreasureMesh();
      group.position.set(treasure.x, 0.85, treasure.z);
      scene.add(group);
      treasureRefs.current.set(treasure.id, { group, anim: 0 });
    });

    const clouds = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    [[-13, 13, -9], [-8, 13, -6], [5, 14, -8], [9, 12, 3], [13, 13, 10]].forEach(([x, y, z]) => {
      const cloud = new THREE.Group();
      [0, 0.7, -0.7].forEach((offset, i) => {
        const puff = new THREE.Mesh(new THREE.SphereGeometry(0.62 - i * 0.06, 16, 10), cloudMat);
        puff.position.x = offset;
        puff.scale.set(1.45, 0.48, 0.72);
        cloud.add(puff);
      });
      cloud.position.set(x, y, z);
      clouds.add(cloud);
    });
    scene.add(clouds);

    sceneRef.current = { scene, camera, renderer };

    const onResize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      const nextAspect = mount.clientWidth / mount.clientHeight;
      camera.left = (-cameraSize * nextAspect) / 2;
      camera.right = (cameraSize * nextAspect) / 2;
      camera.top = cameraSize / 2;
      camera.bottom = -cameraSize / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    // 이동 물리 + 카메라 추적 + 연출을 단일 rAF 루프에서 처리한다.
    let raf = 0;
    let last = performance.now();
    let lastSync = 0;
    let lastBlockedToast = 0;
    const camTarget = new THREE.Vector3();
    const bloomM4 = new THREE.Matrix4();
    const bloomQ = new THREE.Quaternion();
    const bloomS = new THREE.Vector3();
    const bloomP = new THREE.Vector3();

    const animate = () => {
      raf = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const t = now * 0.001;
      const player = playerRef.current;

      if (runningRef.current) {
        const input = inputRef.current;
        let ix = input.joy.x;
        let iy = input.joy.y;
        if (input.keys.has("up")) iy -= 1;
        if (input.keys.has("down")) iy += 1;
        if (input.keys.has("left")) ix -= 1;
        if (input.keys.has("right")) ix += 1;
        const len = Math.hypot(ix, iy);
        if (len > 0.05) {
          const nx = ix / Math.max(len, 1);
          const ny = iy / Math.max(len, 1);
          // 화면 기준 입력을 아이소메트릭 월드 축으로 변환 (화면 위 = 월드 -x,-z)
          const wx = (nx + ny) / Math.SQRT2;
          const wz = (ny - nx) / Math.SQRT2;
          const tx = clamp(player.x + wx * MOVE_SPEED * dt, -HALF + 1, HALF - 1);
          const tz = clamp(player.z + wz * MOVE_SPEED * dt, -HALF + 1, HALF - 1);
          const blocked = fogsRef.current.some(
            (fog) => !fog.cleared && Math.hypot(fog.x - tx, fog.z - tz) < 1.65
          );
          // NPC 단상·분수대·연못·섬 밖은 조용히 막는다
          const bump =
            quests.some((quest) => Math.hypot(quest.pos[0] - tx, quest.pos[1] - tz) < 1.5) ||
            Math.hypot(tx, tz) < 2.1 ||
            Math.hypot(tx, tz) > HALF - 1.2 ||
            TERRAIN.waterSet.has(`${Math.round(tx)},${Math.round(tz)}`);
          if (bump) {
            // 이동만 멈추고 토스트는 띄우지 않는다
          } else if (blocked) {
            if (now - lastBlockedToast > 1600) {
              lastBlockedToast = now;
              onBlockedRef.current?.();
            }
          } else {
            player.x = tx;
            player.z = tz;
          }
          // 모델 정면은 -z: rotation.y=θ일 때 정면 벡터는 (-sinθ, -cosθ)
          player.dir = Math.atan2(-wx, -wz);
          player.moving = true;
        } else {
          player.moving = false;
        }
      }

      playerChar.group.position.set(
        player.x,
        player.moving ? Math.abs(Math.sin(t * 11)) * 0.09 : 0,
        player.z
      );
      playerChar.group.rotation.y = lerpAngle(playerChar.group.rotation.y, player.dir, 0.28);
      applyWalkPose(playerChar.parts, t, player.moving);

      camTarget.set(player.x + 7.8, 8.4, player.z + 7.8);
      camera.position.lerp(camTarget, 0.16);
      camera.lookAt(camera.position.x - 7.8, 0.9, camera.position.z - 7.8);

      sun.position.set(player.x + 8, 14, player.z + 9);
      sun.target.position.set(player.x, 0, player.z);

      clouds.position.x = player.x * 0.7 + Math.sin(t * 0.08) * 0.8;
      clouds.position.z = player.z * 0.7;

      fountainOrb.position.y = 1.68 + Math.sin(t * 2.2) * 0.08;

      // 진행도에 따라 전역 안개가 서서히 걷힌다
      const progressNow = clamp(progressRef.current || 0, 0, 1);
      const targetNear = 24 + 36 * progressNow;
      const targetFar = 60 + 110 * progressNow;
      scene.fog.near += (targetNear - scene.fog.near) * 0.02;
      scene.fog.far += (targetFar - scene.fog.far) * 0.02;
      skyNow.copy(skyFrom).lerp(skyTo, progressNow);
      scene.fog.color.lerp(skyNow, 0.02);
      scene.background.lerp(skyNow, 0.02);

      // NPC: 발견 전에는 안개 고치 속에 숨어 있고, 발견 순간 안개가 흩어지며 등장
      questRefs.current.forEach((entry, id) => {
        const { gem, ring, character, cocoon, pos: questPos } = entry;
        const isDiscovered = !!discoveredRef.current?.[id];
        if (isDiscovered) {
          if (entry.reveal < 1) {
            entry.reveal = Math.min(1, entry.reveal + dt * 1.2);
            const k = entry.reveal;
            character.group.visible = true;
            character.group.scale.setScalar(0.94 * Math.max(0.02, easeOutBack(k)));
            cocoon.group.scale.setScalar(1 + k * 1.4);
            cocoon.material.opacity = 0.82 * (1 - k);
            cocoon.sprite.material.opacity = 1 - k;
            if (k >= 1) {
              cocoon.group.visible = false;
              gem.visible = true;
              ring.visible = true;
            }
          } else {
            gem.rotation.y += 0.025;
            gem.position.y = 2.38 + Math.sin(t * 2.2 + id.length) * 0.12;
            ring.rotation.z += 0.006;
            // NPC는 플레이어가 다가오면 몸을 돌려 마주 본다
            const dx = player.x - questPos[0];
            const dz = player.z - questPos[1];
            const distance = Math.hypot(dx, dz);
            const targetDir = distance < 9
              ? Math.atan2(-dx, -dz)
              : -Math.PI * 0.75 + Math.sin(t * 0.8 + id.length) * 0.2;
            character.group.rotation.y = lerpAngle(character.group.rotation.y, targetDir, 0.06);
            applyWalkPose(character.parts, t + id.length, false);
          }
        } else {
          if (entry.reveal > 0 || gem.visible) {
            // 다시 시작: 재은닉
            entry.reveal = 0;
            character.group.visible = false;
            gem.visible = false;
            ring.visible = false;
            cocoon.group.visible = true;
            cocoon.group.scale.setScalar(1);
            cocoon.material.opacity = 0.82;
            cocoon.sprite.material.opacity = 1;
          }
          cocoon.group.rotation.y = t * 0.25;
          cocoon.group.position.y = Math.sin(t * 1.4 + id.length) * 0.05;
          cocoon.sprite.position.y = 2.55 + Math.sin(t * 2 + id.length) * 0.12;
        }

        // 해결된 거점 둘레에 꽃이 피어난다 (마을이 살아나는 연출)
        const isSolved = !!solvedRef.current?.[id];
        if (isSolved && entry.bloom < 1) {
          entry.bloom = Math.min(1, entry.bloom + dt * 1.1);
          const bk = easeOutBack(entry.bloom);
          for (let i = 0; i < BLOOMS_PER_QUEST; i += 1) {
            const flower = solveFlowerData[entry.questIndex * BLOOMS_PER_QUEST + i];
            bloomM4.compose(
              bloomP.set(flower.x, 0.28 + 0.28 * entry.bloom, flower.z),
              bloomQ,
              bloomS.setScalar(Math.max(0.001, flower.s * bk))
            );
            solveBlooms.setMatrixAt(entry.questIndex * BLOOMS_PER_QUEST + i, bloomM4);
          }
          solveBlooms.instanceMatrix.needsUpdate = true;
        } else if (!isSolved && entry.bloom > 0) {
          entry.bloom = 0;
          for (let i = 0; i < BLOOMS_PER_QUEST; i += 1) {
            const flower = solveFlowerData[entry.questIndex * BLOOMS_PER_QUEST + i];
            bloomM4.compose(bloomP.set(flower.x, 0.5, flower.z), bloomQ, bloomS.setScalar(0.001));
            solveBlooms.setMatrixAt(entry.questIndex * BLOOMS_PER_QUEST + i, bloomM4);
          }
          solveBlooms.instanceMatrix.needsUpdate = true;
        }
      });

      // 빛장벽: 깨지는 순간 떠오르며 녹아 사라진다
      fogsRef.current.forEach((fog) => {
        const entry = fogRefs.current.get(fog.id);
        if (!entry) return;
        const { group, mats } = entry.handle;
        if (!fog.cleared) {
          if (entry.anim > 0) {
            entry.anim = 0;
            mats[0].opacity = 0.86;
            mats[1].opacity = 0.62;
            group.position.y = 1.05;
          }
          group.visible = true;
          group.scale.setScalar(1 + Math.sin(t * 1.6 + fog.x) * 0.05);
        } else if (entry.anim < 1) {
          entry.anim = Math.min(1, entry.anim + dt * 1.6);
          const k = entry.anim;
          group.visible = k < 1;
          group.scale.setScalar(1 + k * 0.9);
          group.position.y = 1.05 + k * 1.4;
          group.rotation.y += dt * 2.5;
          mats[0].opacity = 0.86 * (1 - k);
          mats[1].opacity = 0.62 * (1 - k);
        }
      });

      // 마음 조각: 둥실거리다가 주우면 위로 솟으며 사라진다
      treasuresRef.current?.forEach((treasure, index) => {
        const entry = treasureRefs.current.get(treasure.id);
        if (!entry) return;
        if (!treasure.found) {
          if (entry.anim > 0) {
            entry.anim = 0;
            entry.group.scale.setScalar(1);
          }
          entry.group.visible = true;
          entry.group.position.y = 0.85 + Math.sin(t * 2.4 + index) * 0.12;
          entry.group.rotation.y = t * 1.6 + index;
        } else if (entry.anim < 1) {
          entry.anim = Math.min(1, entry.anim + dt * 3.2);
          const k = entry.anim;
          entry.group.visible = k < 1;
          entry.group.scale.setScalar(1 + k * 1.2);
          entry.group.position.y = 0.85 + k * 1.6;
          entry.group.rotation.y += dt * 9;
        }
      });

      // 다른 탐험가(피어): 위치 보간 + 이동 중이면 걷기 모션
      peerRefs.current.forEach((entry) => {
        const { character, target } = entry;
        const g = character.group;
        g.position.x += (target.x - g.position.x) * 0.22;
        g.position.z += (target.z - g.position.z) * 0.22;
        g.rotation.y = lerpAngle(g.rotation.y, target.dir, 0.22);
        const peerMoving = now - entry.lastMoveAt < 400;
        g.position.y = peerMoving ? Math.abs(Math.sin(t * 11)) * 0.09 : 0;
        applyWalkPose(character.parts, t, peerMoving);
      });

      if (now - lastSync > SYNC_INTERVAL) {
        lastSync = now;
        onSyncRef.current?.({ x: player.x, z: player.z, dir: player.dir });
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      disposeScene(scene, renderer);
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      sceneRef.current = null;
      peerRefs.current.clear();
      projectileRefs.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    quests.forEach((quest) => {
      const entry = questRefs.current.get(quest.id);
      if (entry) {
        entry.group.scale.setScalar(solved[quest.id] ? 0.72 : 1);
        entry.gem.material.emissiveIntensity = solved[quest.id] ? 1.4 : 0.55;
      }
    });
  }, [solved]);

  useEffect(() => {
    const world = sceneRef.current;
    if (!world) return;
    const liveIds = new Set(peers.map((peer) => peer.id));

    peers.forEach((peer) => {
      let entry = peerRefs.current.get(peer.id);
      if (!entry) {
        const character = createCharacterModel({
          color: parseInt(String(peer.color).replace("#", ""), 16) || 0x38bdf8,
          hair: peer.hair || 0x26314d,
        });
        character.group.position.set(peer.player.x, 0, peer.player.z);
        world.scene.add(character.group);
        entry = { character, target: { ...peer.player }, lastMoveAt: 0 };
        peerRefs.current.set(peer.id, entry);
      }
      const movedDistance = Math.hypot(peer.player.x - entry.target.x, peer.player.z - entry.target.z);
      if (movedDistance > 0.05) entry.lastMoveAt = performance.now();
      entry.target = { ...peer.player };
    });

    peerRefs.current.forEach((entry, id) => {
      if (!liveIds.has(id)) {
        world.scene.remove(entry.character.group);
        peerRefs.current.delete(id);
      }
    });
  }, [peers]);

  useEffect(() => {
    const world = sceneRef.current;
    if (!world) return;
    const liveIds = new Set(projectiles.map((projectile) => projectile.id));

    projectiles.forEach((projectile) => {
      let mesh = projectileRefs.current.get(projectile.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 18, 14),
          mat(0xfff7a8, {
            roughness: 0.18,
            emissive: new THREE.Color(0xffd166),
            emissiveIntensity: 1.4,
          })
        );
        mesh.castShadow = true;
        world.scene.add(mesh);
        projectileRefs.current.set(projectile.id, mesh);
      }
      mesh.position.set(projectile.x, 1.05, projectile.z);
    });

    projectileRefs.current.forEach((mesh, id) => {
      if (!liveIds.has(id)) {
        world.scene.remove(mesh);
        projectileRefs.current.delete(id);
      }
    });
  }, [projectiles]);

  return <div className="world-canvas" ref={mountRef} aria-label="복셀 공동체 탐험 월드" />;
}
