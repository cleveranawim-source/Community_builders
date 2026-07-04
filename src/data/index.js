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
export const fogSeeds = Array.from({ length: 144 }, (_, index) => {
  const ring = Math.floor(index / 18);
  const angle = (index % 18) * (Math.PI * 2 / 18) + ring * 0.31;
  const radius = 10 + ring * 7 + ((index * 7) % 4);
  return {
    id: `barrier-${index + 1}`,
    x: Math.round(Math.cos(angle) * radius),
    z: Math.round(Math.sin(angle) * radius),
    label: barrierLabels[index % barrierLabels.length],
  };
});

const BASE = import.meta.env.BASE_URL;

export function portraitOf(id) {
  return `${BASE}assets/portraits/${id}.jpg`;
}

export const HERO_PORTRAIT = `${BASE}assets/portraits/hero.jpg`;
export const TITLE_BG = `${BASE}assets/portraits/title-bg.jpg`;
export const TITLE_BG_VIDEO = `${BASE}assets/video/title-bg.mp4`;
