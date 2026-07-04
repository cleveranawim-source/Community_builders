import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { quests, fogSeeds, HALF } from "./data/index.js";
import { clamp } from "./lib/utils.js";

const MOVE_SPEED = 8.2;
const SYNC_INTERVAL = 140;

const terrainColors = {
  grass: 0x72d36b,
  moss: 0x9bea7e,
  sand: 0xf0cf80,
  water: 0x5bc7f0,
  path: 0xdcb887,
};

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

  // 다리 + 발 (발끝이 앞으로 튀어나와 방향성 제공)
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

  // 몸통 (+앞면 흰 지퍼선으로 정면 표시)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.54, 0.4), outfitMat);
  body.position.y = 0.73;
  body.castShadow = true;
  const placket = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.46, 0.02), mat(0xf8fafc, { roughness: 0.5 }));
  placket.position.set(0, 0.73, -0.205);

  // 팔 (어깨 피벗 + 살구색 손)
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

  // 머리 (목 피벗): 얼굴은 -z 면에만 배치 → 앞뒤가 확실히 다르다
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
    // 주인공: 노란 탐험가 모자(챙=앞) + 빨간 백팩(=뒤) + 발밑 진행 방향 화살표
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
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.98, 0.035, 10, 64),
    mat(0x9aa3b8, { transparent: true, opacity: 0.62, emissive: new THREE.Color(0x8ba0ff), emissiveIntensity: 0.35 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -0.54;
  group.add(core, shardA, shardB, ring);
  group.position.y = 1.05;
  return group;
}

function makeTerrain() {
  const tiles = [];
  for (let x = -HALF; x <= HALF; x += 1) {
    for (let z = -HALF; z <= HALF; z += 1) {
      const d = Math.sqrt(x * x + z * z);
      if (d > HALF + 0.6) continue;
      let type = "grass";
      if (d > HALF - 1.5) type = "sand";
      if (
        Math.abs(x) <= 1 ||
        Math.abs(z) <= 1 ||
        Math.abs(x - z) <= 1 ||
        Math.abs(x + z) <= 1 ||
        Math.abs(x - 28) <= 1 ||
        Math.abs(z + 28) <= 1
      ) type = "path";
      if ((x + 30) ** 2 + (z - 33) ** 2 < 70 || (x - 31) ** 2 + (z - 30) ** 2 < 55) type = "moss";
      if ((x - 34) ** 2 + (z + 30) ** 2 < 64 || (x + 35) ** 2 + (z + 28) ** 2 < 50) type = "water";
      const height = type === "water" ? -0.08 : Math.sin(x * 0.8) * Math.cos(z * 0.7) * 0.08;
      tiles.push({ x, z, type, height });
    }
  }
  return tiles;
}

// 지형은 타일 수천 개를 InstancedMesh로 묶어 드로우콜과 재질 수를 최소화한다.
function buildTerrain(scene) {
  const tiles = makeTerrain();
  const blockGeo = new THREE.BoxGeometry(1, 0.42, 1);
  const edgeGeo = new THREE.BoxGeometry(0.92, 0.035, 0.92);
  const matrix = new THREE.Matrix4();

  const byType = { grass: [], moss: [], sand: [], water: [], path: [] };
  tiles.forEach((tile) => byType[tile.type].push(tile));

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
  });

  const pathTops = byType.path;
  const grassTops = [...byType.grass, ...byType.moss, ...byType.sand];
  [[pathTops, 0xe6c794], [grassTops, 0x91dd78]].forEach(([group, color]) => {
    if (!group.length) return;
    const instanced = new THREE.InstancedMesh(edgeGeo, mat(color, { roughness: 0.82 }), group.length);
    group.forEach((tile, i) => {
      matrix.setPosition(tile.x, tile.height + 0.23, tile.z);
      instanced.setMatrixAt(i, matrix);
    });
    instanced.receiveShadow = true;
    scene.add(instanced);
  });
}

function buildDecorations(scene) {
  const treeTrunk = new THREE.CylinderGeometry(0.16, 0.2, 1.3, 8);
  const treeTop = new THREE.SphereGeometry(0.68, 18, 14);
  const trunkMat = mat(0x8b6138, { roughness: 0.9 });
  const leafMat = mat(0x4fae68, { roughness: 0.82 });
  [
    [-13, -2], [-12, 6], [-10, 13], [-7, 2], [-6, 6], [-4, -12], [-2, -7],
    [2, 7], [4, -14], [7, 1], [7, -6], [9, 13], [12, -2], [13, 6],
  ].forEach(([x, z]) => {
    const trunk = new THREE.Mesh(treeTrunk, trunkMat);
    trunk.position.set(x, 0.8, z);
    trunk.castShadow = true;
    const leaf = new THREE.Mesh(treeTop, leafMat);
    leaf.position.set(x, 1.8, z);
    leaf.scale.set(1, 0.92, 1);
    leaf.castShadow = true;
    scene.add(trunk, leaf);
  });

  const flowerMat = [mat(0xff8fab), mat(0xffd166), mat(0x8b5cf6), mat(0x7dd3fc)];
  const stemGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.28, 6);
  const bloomGeo = new THREE.SphereGeometry(0.105, 10, 8);
  const stemMat = mat(0x3d9b5d);
  [[-12, 4], [-8, -6], [-3, -2], [-2, 3], [3, -5], [6, 2], [-6, -1], [1, 6], [5, -1], [8, 8], [12, -7], [-10, 10]].forEach(([x, z], i) => {
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(x + 0.18, 0.48, z - 0.16);
    const bloom = new THREE.Mesh(bloomGeo, flowerMat[i % flowerMat.length]);
    bloom.position.set(x + 0.18, 0.66, z - 0.16);
    bloom.castShadow = true;
    scene.add(stem, bloom);
  });
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
    // 숨쉬기 유휴 모션
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
  runningRef,
  solved,
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
  const projectileRefs = useRef(new globalThis.Map());
  const onSyncRef = useRef(onSync);
  const onBlockedRef = useRef(onBlocked);

  onSyncRef.current = onSync;
  onBlockedRef.current = onBlocked;

  useEffect(() => {
    if (!mountRef.current) return undefined;

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xcdeeff);
    scene.fog = new THREE.Fog(0xcdeeff, 42, 130);

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
      100
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
    buildDecorations(scene);

    const playerChar = createCharacterModel({ color: 0xffcf5a, hair: 0x25314d, player: true });
    scene.add(playerChar.group);

    questRefs.current.clear();
    quests.forEach((quest) => {
      const group = new THREE.Group();
      group.position.set(quest.pos[0], 0.22, quest.pos[1]);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.82, 0.28, 24), mat(quest.colorNum, { roughness: 0.62 }));
      base.castShadow = true;
      const character = createCharacterModel({ color: quest.colorNum, hair: quest.hairNum });

      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.28),
        mat(0xffffff, { emissive: new THREE.Color(quest.colorNum), emissiveIntensity: 0.7, roughness: 0.28 })
      );
      gem.position.y = 2.38;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.88, 0.025, 10, 72),
        mat(quest.colorNum, { emissive: new THREE.Color(quest.colorNum), emissiveIntensity: 0.25 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.2;
      group.add(base, ring, character.group, gem);
      scene.add(group);
      questRefs.current.set(quest.id, { group, gem, ring, character, pos: quest.pos });
    });

    fogRefs.current.clear();
    fogSeeds.forEach((fog) => {
      const group = createFogModel();
      group.position.x = fog.x;
      group.position.z = fog.z;
      scene.add(group);
      fogRefs.current.set(fog.id, group);
    });

    const clouds = new THREE.Group();
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 });
    [[-13, 8, -9], [-8, 8, -6], [5, 9, -8], [9, 7, 3], [13, 8, 10]].forEach(([x, y, z]) => {
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
          // NPC 단상·연못은 조용히 막는다 (대화는 4.4 반경에서 이미 가능)
          const bumpNpc = quests.some(
            (quest) => Math.hypot(quest.pos[0] - tx, quest.pos[1] - tz) < 1.5
          );
          const inWater =
            (tx - 34) ** 2 + (tz + 30) ** 2 < 64 ||
            (tx + 35) ** 2 + (tz + 28) ** 2 < 50;
          if (bumpNpc || inWater) {
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

      questRefs.current.forEach(({ gem, group, ring, character, pos }, id) => {
        gem.rotation.y += 0.025;
        gem.position.y = 2.38 + Math.sin(t * 2.2 + id.length) * 0.12;
        ring.rotation.z += 0.006;
        // NPC는 플레이어가 다가오면 몸을 돌려 마주 본다
        const dx = player.x - pos[0];
        const dz = player.z - pos[1];
        const distance = Math.hypot(dx, dz);
        const targetDir = distance < 9
          ? Math.atan2(-dx, -dz)
          : -Math.PI * 0.75 + Math.sin(t * 0.8 + id.length) * 0.2;
        character.group.rotation.y = lerpAngle(character.group.rotation.y, targetDir, 0.06);
        applyWalkPose(character.parts, t + id.length, false);
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

      fogsRef.current.forEach((fog) => {
        const group = fogRefs.current.get(fog.id);
        if (!group) return;
        group.visible = !fog.cleared;
        if (!fog.cleared) group.scale.setScalar(1 + Math.sin(t * 1.6 + fog.x) * 0.05);
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
