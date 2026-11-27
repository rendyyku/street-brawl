import { ARCHETYPES } from './constants.js';

const STORAGE_KEY = 'street_brawl_custom_fighters_v2';

export const BUILTIN_FIGHTERS = [
  {
    id: 'nadia',
    name: 'NADIA',
    title: 'Sarjana Fighter',
    archetype: 'shotokan',
    specialName: 'WISUDA WAVE',
    rushName: 'ROSE DASH BARRAGE',
    rushQuote: 'Kelopak mawar, serbu!',
    superName: 'HEARTSTORM FINALE',
    superQuote: 'CINTA TANPA BATAS!',
    ultimateTheme: 'love',
    spriteSheet: 'assets/fighters/nadia_sheet.webp',
    portrait: 'assets/fighters/nadia_portrait.webp',
    ultimateCutin: 'assets/fighters/nadia_cutin.webp',
    animations: {
      ultimate: { src: 'assets/fighters/nadia_ultimate.webp', frames: 6, fps: 30 },
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
    rushName: 'GIT PUSH RUSH',
    rushQuote: '$ git push --force',
    superName: 'CLAUDE CODE OVERDRIVE',
    superQuote: '> claude --ship-it --force',
    ultimateTheme: 'claude_code',
    spriteSheet: 'assets/fighters/rendy_sheet.webp',
    portrait: 'assets/fighters/rendy_portrait.webp',
    ultimateCutin: 'assets/fighters/rendy_cutin.webp',
    animations: {
      ultimate: { src: 'assets/fighters/rendy_ultimate.webp', frames: 6, fps: 30 },
    },
    colors: {
      primary: '#d97757',
      accent: '#4ade80',
      energy: '#d97757',
      energyCore: '#fef3c7',
    },
    isCustom: false,
  },
  {
    id: 'owi',
    name: 'OWI',
    title: 'Blusukan Builder',
    archetype: 'shotokan',
    specialName: 'BAGI-BAGI SEPEDA',
    rushName: 'BLUSUKAN RUSH',
    rushQuote: 'Turun langsung ke lapangan!',
    superName: 'INFRASTRUKTUR FINALE',
    superQuote: 'KERJA! KERJA! KERJA!',
    ultimateTheme: 'pembangunan',
    projectileStyle: 'bicycle',
    spriteSheet: 'assets/fighters/owi_sheet.webp',
    portrait: 'assets/fighters/owi_portrait.webp',
    ultimateCutin: 'assets/fighters/owi_cutin.webp',
    animations: {
      ultimate: { src: 'assets/fighters/owi_ultimate.webp', frames: 6, fps: 30 },
    },
    voice: {
      fight: 'assets/audio/owi/sanggup.mp3',
      super: 'assets/audio/owi/lawan.mp3',
      hurt: 'assets/audio/owi/kaget.mp3',
      ko: 'assets/audio/owi/diam.mp3',
      victory: 'assets/audio/owi/hidup.mp3',
      timeOver: 'assets/audio/owi/sudah_belum.mp3',
    },
    colors: {
      primary: '#f59e0b',
      accent: '#ffffff',
      energy: '#f59e0b',
      energyCore: '#fffbeb',
    },
    isCustom: false,
  },
];

const SAFE_ASSET = /^assets\/[\w\-./]+$/;
const safeAsset = (src, allowDataImage = false) =>
  typeof src === 'string' &&
  !src.includes('..') &&
  (SAFE_ASSET.test(src) || (allowDataImage && src.startsWith('data:image/')))
    ? src
    : undefined;

/**
 * Fighters received from an online opponent may carry arbitrary URLs.
 * Keep only local asset paths (and inline data images for custom uploads) so a
 * remote peer can't make this browser fetch or play third-party URLs.
 */
export function sanitizeRemoteFighter(fighter) {
  if (!fighter || typeof fighter !== 'object') return null;
  const clean = { ...fighter };
  clean.spriteSheet = safeAsset(fighter.spriteSheet, true);
  clean.portrait = safeAsset(fighter.portrait, true);
  clean.ultimateCutin = safeAsset(fighter.ultimateCutin, true);
  if (fighter.animations && typeof fighter.animations === 'object') {
    clean.animations = {};
    for (const [key, anim] of Object.entries(fighter.animations)) {
      const src = safeAsset(anim?.src, true);
      if (src) clean.animations[key] = { src, frames: Number(anim.frames) || 6, fps: Number(anim.fps) || 12 };
    }
  }
  if (fighter.voice && typeof fighter.voice === 'object') {
    clean.voice = {};
    for (const [key, src] of Object.entries(fighter.voice)) {
      const ok = safeAsset(src);
      if (ok && ok.startsWith('assets/audio/')) clean.voice[key] = ok;
    }
  }
  for (const key of ['name', 'title', 'specialName', 'rushName', 'rushQuote', 'superName', 'superQuote']) {
    if (clean[key] != null) clean[key] = String(clean[key]).slice(0, 40);
  }
  return clean;
}

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
