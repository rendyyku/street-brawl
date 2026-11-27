import { ARCHETYPES } from './constants.js';

const STORAGE_KEY = 'street_brawl_custom_fighters_v2';

export const BUILTIN_FIGHTERS = [
  {
    id: 'nadia',
    name: 'NADIA',
    title: 'Sarjana Fighter',
    archetype: 'shotokan',
    specialName: 'WISUDA WAVE',
    superName: 'CUM LAUDE BLAST',
    spriteSheet: 'assets/fighters/nadia_sheet.webp',
    portrait: 'assets/fighters/nadia_portrait.webp',
    colors: {
      primary: '#8c223c',
      accent: '#38bdf8',
      energy: '#38bdf8',
      energyCore: '#e0f2fe',
    },
    isCustom: false,
  },
  {
    id: 'rendy',
    name: 'RENDY',
    title: 'Sandal Jepit Striker',
    archetype: 'striker',
    specialName: 'API KAMPUNG',
    superName: 'METEOR SANDAL',
    spriteSheet: 'assets/fighters/rendy_sheet.webp',
    portrait: 'assets/fighters/rendy_portrait.webp',
    colors: {
      primary: '#f97316',
      accent: '#facc15',
      energy: '#fb923c',
      energyCore: '#fef9c3',
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
