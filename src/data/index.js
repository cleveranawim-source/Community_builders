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

// 숨은 이스터에그: 섬 맨 가장자리(반경 ~64) 외진 구석 3군데, 어느 길과도 닿지 않는 각도에 배치.
// 발견 반경 2.2로 아주 좁혀 정확히 밟아야만 찾을 수 있게 한다. (섬 반경 HALF=70)
export const easterEggs = [
  { id: "egg-north", x: -30, z: -57, icon: "🌟", name: "별똥별이 떨어진 자리", toast: "쉿— 마을 북쪽 끝, 별똥별이 떨어진 자리를 발견했어요. 조용히 소원을 빌어볼까요?" },
  { id: "egg-garden", x: -20, z: 63, icon: "🌸", name: "숨은 꽃밭", toast: "마을 남쪽 맨 끝, 아무도 모르는 숨은 꽃밭을 발견했어요. 여기서 잠시 쉬어가도 좋아요." },
  { id: "egg-cat", x: 60, z: 22, icon: "🐈", name: "고양이의 낮잠 자리", toast: "마을 동쪽 구석, 고양이가 낮잠 자는 비밀 장소를 찾았어요... 야옹." },
];

// 분실물 되돌려주기: 땅에 떨어진 물건을 '줍기' 버튼으로 집어 주인 NPC에게 돌려준다.
// 마음 조각(자동 획득)과 달리 능동적으로 줍고, 주인을 찾아 배려하는 친사회적 루프.
// owner = 주인 quest id (portraitOf로 초상 사용), thanks = 돌려준 순간의 사연 한 줄(여운의 핵심)
export const lostItems = [
  {
    id: "lost-scarf",
    icon: "🧣",
    name: "잃어버린 목도리",
    x: -16, z: -20,
    owner: "nari", ownerName: "나리",
    thanks: "아, 이거 우리 할머니가 떠 주신 목도리예요… 잃어버린 줄 알고 계속 마음이 무거웠는데. 찾아줘서 정말 고마워요.",
  },
  {
    id: "lost-letter",
    icon: "✉️",
    name: "떨어진 손편지",
    x: 24, z: 6,
    owner: "welcome", ownerName: "유나",
    thanks: "이 편지… 전학 간 친구한테 부치려던 거였어요. 잃어버려서 얼마나 속상했는지 몰라요. 챙겨줘서 고마워요!",
  },
  {
    id: "lost-lunch",
    icon: "🍱",
    name: "주인 잃은 도시락",
    x: 6, z: 30,
    owner: "celebrate", ownerName: "도윤",
    thanks: "제 도시락이에요! 점심시간에 못 찾아서 배곯을 뻔했는데. 챙겨줘서 고마워요 — 이따 같이 나눠 먹을래요?",
  },
  {
    id: "lost-umbrella",
    icon: "☂️",
    name: "잃어버린 우산",
    x: 12, z: -20,
    owner: "leo", ownerName: "레오",
    thanks: "제 우산이에요! 갑자기 비가 쏟아졌을 때 잃어버려서 쫄딱 젖었거든요. 이렇게 챙겨줘서 고마워요.",
  },
  {
    id: "lost-book",
    icon: "📕",
    name: "떨어뜨린 도서관 책",
    x: 18, z: 28,
    owner: "moru", ownerName: "모루",
    thanks: "도서관에서 빌린 책인데 잃어버려서 변상해야 하나 밤새 걱정했어요. 정말 고마워요!",
  },
  {
    id: "lost-key",
    icon: "🔑",
    name: "떨어진 집 열쇠",
    x: -28, z: -6,
    owner: "signal", ownerName: "하루",
    thanks: "집 열쇠예요! 이거 없으면 집에 못 들어가서 발만 동동 굴렀는데… 찾아줘서 살았어요. 고마워요.",
  },
  {
    id: "lost-glove",
    icon: "🧤",
    name: "한 짝 남은 장갑",
    x: -6, z: -30,
    owner: "promise", ownerName: "준",
    thanks: "짝 잃은 장갑이었는데! 한 짝만 남아서 서랍에 넣어뒀거든요. 다시 두 짝이 됐네요, 고마워요.",
  },
  {
    id: "lost-cap",
    icon: "🧢",
    name: "바람에 날아간 모자",
    x: -26, z: 30,
    owner: "sori", ownerName: "소리",
    thanks: "제 모자예요! 바람에 휙 날아가서 한참 찾아 헤맸는데. 챙겨줘서 정말 고마워요.",
  },
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
  { id: "lost-all", icon: "📮", name: "마을의 배달부", desc: "잃어버린 물건 모두 되돌려주기", check: (s) => s.returned >= s.lostTotal },
];

const BASE = import.meta.env.BASE_URL;

export function portraitOf(id) {
  return `${BASE}assets/portraits/${id}.jpg`;
}

export const HERO_PORTRAIT = `${BASE}assets/portraits/hero.jpg`;
export const TITLE_BG = `${BASE}assets/portraits/title-bg.jpg`;
export const TITLE_BG_VIDEO = `${BASE}assets/video/title-bg.mp4`;
export const TEASER_VIDEO = `${BASE}assets/video/teaser.mp4`;
