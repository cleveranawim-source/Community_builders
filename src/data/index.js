import raw from "./quests.json";

export const WORLD_SIZE = 141;
export const HALF = Math.floor(WORLD_SIZE / 2);
export const NPC_RADIUS = 4.4;

export const quests = raw.quests.map((quest) => ({
  ...quest,
  colorNum: parseInt(quest.color.slice(1), 16),
  hairNum: parseInt(quest.hair.slice(1), 16),
}));

export const stats = [
  { key: "self", label: "마음알기", color: "#ff7a59" },
  { key: "empathy", label: "서로듣기", color: "#8b5cf6" },
  { key: "relation", label: "관계잇기", color: "#38bdf8" },
  { key: "community", label: "마을세우기", color: "#34d399" },
];

export const playerPalette = ["#ffcf5a", "#38bdf8", "#8b5cf6", "#34d399", "#ff7a59", "#f472b6"];

const barrierLabels = ["오해 장벽", "침묵 장벽", "불안 장벽", "소외 장벽", "무관심 장벽", "갈등 장벽", "비난 장벽", "부담 장벽"];

// 8겹 링 × 18개 = 144개 빛장벽 (반지름 10~62)
// hp: 대부분 1방(약함), 일부 2방, 소수 3방(큰 수정) — 타격감을 위한 분포
export const fogSeeds = Array.from({ length: 144 }, (_, index) => {
  const ring = Math.floor(index / 18);
  const angle = (index % 18) * (Math.PI * 2 / 18) + ring * 0.31;
  const radius = 10 + ring * 7 + ((index * 7) % 4);
  const hp = index % 9 === 0 ? 3 : index % 3 === 0 ? 2 : 1;
  return {
    id: `barrier-${index + 1}`,
    x: Math.round(Math.cos(angle) * radius),
    z: Math.round(Math.sin(angle) * radius),
    label: barrierLabels[index % barrierLabels.length],
    hp,
  };
});

// 숨은 이스터에그: 길에서 벗어난 특별한 곳 3군데 (발견 반경 3.5)
export const easterEggs = [
  { id: "egg-north", x: 2, z: -63, icon: "🌟", toast: "북쪽 끝까지 온 탐험가! 진짜 모험가구나. 숨은 장소를 찾았어요!" },
  { id: "egg-garden", x: -61, z: 58, icon: "🌸", toast: "숨은 꽃밭을 발견했어요! 여기서 잠시 쉬어가도 좋아요." },
  { id: "egg-cat", x: 60, z: -52, icon: "🐈", toast: "마을 고양이가 낮잠 자고 있어요... 야옹. 숨은 장소 발견!" },
];

// 배지: 수집·성취 도감에 표시되는 획득형 뱃지
export const badges = [
  { id: "first-mission", icon: "🌱", name: "첫 만남", desc: "첫 미션 해결", check: (s) => s.solved >= 1 },
  { id: "half-mission", icon: "🌿", name: "마을의 친구", desc: "미션 8개 해결", check: (s) => s.solved >= 8 },
  { id: "all-mission", icon: "🏘️", name: "마을의 건축가", desc: "16개 미션 모두 해결", check: (s) => s.solved >= 16 },
  { id: "barrier-30", icon: "✨", name: "빛의 인도자", desc: "빛장벽 30개 해제", check: (s) => s.cleared >= 30 },
  { id: "barrier-all", icon: "🌈", name: "안개를 걷은 자", desc: "빛장벽 모두 해제", check: (s) => s.cleared >= s.fogTotal },
  { id: "gem-12", icon: "💛", name: "마음 수집가", desc: "마음 조각 12개", check: (s) => s.gems >= 12 },
  { id: "gem-all", icon: "💎", name: "조각의 완성", desc: "마음 조각 모두 수집", check: (s) => s.gems >= s.gemTotal },
  { id: "egg-all", icon: "🗺️", name: "숨은 길 탐험가", desc: "숨은 장소 3곳 발견", check: (s) => s.eggs >= 3 },
];

const BASE = import.meta.env.BASE_URL;

export function portraitOf(id) {
  return `${BASE}assets/portraits/${id}.jpg`;
}

export const HERO_PORTRAIT = `${BASE}assets/portraits/hero.jpg`;
export const TITLE_BG = `${BASE}assets/portraits/title-bg.jpg`;
export const TITLE_BG_VIDEO = `${BASE}assets/video/title-bg.mp4`;
