import { ARCHETYPES } from './constants.js';

const STORAGE_KEY = 'street_brawl_custom_fighters_v2';

export const BUILTIN_FIGHTERS = [
  {
    id: 'nadia',
    name: 'NADIA',
    title: 'Sarjana Fighter',
    archetype: 'shotokan',
    specialName: 'WISUDA WAVE',
    superName: 'HEARTSTORM FINALE',
    superQuote: 'CINTA TANPA BATAS!',
    ultimateTheme: 'love',
    spriteSheet: 'assets/fighters/nadia_sheet.webp',
    portrait: 'assets/fighters/nadia_portrait.webp',
    ultimateCutin: 'assets/fighters/nadia_cutin.webp',
    animations: {
      ultimate: { src: 'assets/fighters/nadia_ultimate.webp', frames: 6, fps: 10 },
    },
    colors: {
      primary: '#f43f5e',
      accent: '#fda4af',
      energy: '#f43f5e',
      energyCore: '#fff1f2',
    },
    isCustom: false,
  },
  {
    id: 'rendy',
    name: 'RENDY',
    title: 'Claude Code Striker',
    archetype: 'striker',
    specialName: 'PROMPT BLAST',
    superName: 'CLAUDE CODE OVERDRIVE',
    superQuote: '> claude --ship-it --force',
    ultimateTheme: 'claude_code',
    spriteSheet: 'assets/fighters/rendy_sheet.webp',
    portrait: 'assets/fighters/rendy_portrait.webp',
    ultimateCutin: 'assets/fighters/rendy_cutin.webp',
    animations: {
      ultimate: { src: 'assets/fighters/rendy_ultimate.webp', frames: 6, fps: 10 },
    },
    colors: {
      primary: '#d97757',
      accent: '#4ade80',
      energy: '#d97757',
      energyCore: '#fef3c7',
    },
    isCustom: false,
  },
];

export function resolveFighterStats(fighter) {
  const arch = ARCHETYPES[fighter.archetype] || ARCHETYPES.shotokan;
  return {
    ...fighter,
    maxHp: arch.hp,
    speedMul: arch.speedMul,
    powerMul: arch.powerMul,
    specialType: arch.specialType,
  };
}

export function loadCustomFighters() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomFighter(fighter) {
  const list = loadCustomFighters();
  const idx = list.findIndex((f) => f.id === fighter.id);
  const clean = {
    ...fighter,
    isCustom: true,
  };
  if (idx >= 0) {
    list[idx] = clean;
  } else {
    list.push(clean);
  }
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
  return clean;
}

export function deleteCustomFighter(id) {
  const list = loadCustomFighters().filter((f) => f.id !== id);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }
  return list;
}

export function getFullRoster() {
  return [...BUILTIN_FIGHTERS, ...loadCustomFighters()].map(resolveFighterStats);
}

export function getFighterById(id) {
  return getFullRoster().find((f) => f.id === id) || resolveFighterStats(BUILTIN_FIGHTERS[0]);
}
