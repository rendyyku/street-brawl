import {
  GROUND_Y,
  MAX_SUPER,
  MOVES,
  STAGES,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  STATES,
  TICK_RATE,
  ULTIMATE_THEMES,
} from './constants.js';

const CODE_TOKENS = ['</>', 'claude>', '{ }', '0xFF', 'git!', '>>>', 'API', '⚡'];

/**
 * 4x4 Sprite Sheet Grid Mapping (cell index 0..15):
 * Row 0: 0=Idle1, 1=Idle2, 2=Walk1, 3=Walk2
 * Row 1: 4=Crouch, 5=Jump, 6=Block, 7=Hit
 * Row 2: 8=LP, 9=HP, 10=LK, 11=HK
 * Row 3: 12=SpecialCharge, 13=SpecialBlast, 14=KO, 15=Victory
 */
export function getSpriteCellIndex(f) {
  const sf = f.stateFrame;
  switch (f.state) {
    case STATES.IDLE:
      return Math.floor(sf / 16) % 2 === 0 ? 0 : 1;
    case STATES.WALK_F:
    case STATES.WALK_B:
      return Math.floor(sf / 8) % 2 === 0 ? 2 : 3;
    case STATES.CROUCH:
      return 4;
    case STATES.JUMP:
      return 5;
    case STATES.BLOCK:
    case STATES.CROUCH_BLOCK:
      return 6;
    case STATES.HITSTUN:
      return 7;
    case STATES.LP:
      return sf < 3 ? 0 : 8;
    case STATES.HP:
      return sf < 5 ? 8 : 9;
    case STATES.LK:
      return sf < 3 ? 4 : 10;
    case STATES.HK:
      return sf < 6 ? 1 : 11;
    case STATES.SPECIAL: {
      const m = MOVES[STATES.SPECIAL];
      return sf < m.startup ? 12 : 13;
    }
    case STATES.UPPERCUT:
      return sf < 4 ? 4 : sf < 16 ? 9 : 5;
    case STATES.DASH_KICK:
      return sf < 5 ? 5 : 11;
    case STATES.SUPER: {
      const m = MOVES[STATES.SUPER];
      return sf < m.startup ? 12 : 13;
    }
    case STATES.KNOCKDOWN:
    case STATES.KO:
      return 14;
    case STATES.WAKEUP:
      return 4;
    case STATES.VICTORY:
      return 15;
    default:
      return 0;
  }
}

export function getAnimationKeyForState(state) {
  switch (state) {
    case STATES.IDLE:
      return 'idle';
    case STATES.WALK_F:
    case STATES.WALK_B:
      return 'walk';
    case STATES.LP:
    case STATES.HP:
    case STATES.UPPERCUT:
      return 'punch';
    case STATES.LK:
    case STATES.HK:
    case STATES.DASH_KICK:
      return 'kick';
    case STATES.SPECIAL:
      return 'special';
    case STATES.SUPER:
      return 'ultimate';
    case STATES.KO:
    case STATES.KNOCKDOWN:
      return 'ko';
    case STATES.VICTORY:
      return 'victory';
    default:
      return null;
  }
}

function drawHeart(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.35);
  ctx.bezierCurveTo(-size, -size * 0.35, -size * 0.6, -size * 1.15, 0, -size * 0.45);
  ctx.bezierCurveTo(size * 0.6, -size * 1.15, size, -size * 0.35, 0, size * 0.35);
  ctx.fill();
  ctx.restore();
}

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = STAGE_WIDTH;
    this.canvas.height = STAGE_HEIGHT;
    this.spriteCache = new Map();
    this.particles = [];
    this.afterimages = [];
    this.shake = 0;
    this.stage = STAGES[0];
    this.bgTick = 0;
  }

  setStage(stageId) {
    this.stage = STAGES.find((s) => s.id === stageId) || STAGES[0];
  }

  cacheImage(src) {
    if (!src || this.spriteCache.has(src)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = src;
    this.spriteCache.set(src, img);
  }

  preloadFighter(fighter) {
    if (!fighter) return;
    this.cacheImage(fighter.spriteSheet);
    this.cacheImage(fighter.portrait);
    this.cacheImage(fighter.ultimateCutin);
    if (fighter.animations && typeof fighter.animations === 'object') {
      for (const anim of Object.values(fighter.animations)) {
        if (anim?.src) this.cacheImage(anim.src);
      }
    }
  }

  spawnHitSparks(x, y, color = '#facc15', count = 12, heavy = false, style = 'spark') {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = (heavy ? 7 : 4.5) + Math.random() * 5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: heavy ? 22 : 14,
        maxLife: heavy ? 22 : 14,
        size: heavy ? 8 + Math.random() * 6 : 4 + Math.random() * 4,
        color: i % 2 === 0 ? '#ffffff' : color,
        kind: style,
        token: CODE_TOKENS[i % CODE_TOKENS.length],
      });
    }
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 12,
      maxLife: 12,
      size: heavy ? 18 : 12,
      color,
      kind: 'ring',
    });
  }

  spawnDust(x, y, count = 5) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 32,
        y: y - 4,
        vx: (Math.random() - 0.5) * 3.2,
        vy: -1 - Math.random() * 2,
        life: 16,
        maxLife: 16,
        size: 7 + Math.random() * 8,
        color: 'rgba(226, 232, 240, 0.55)',
        kind: 'dust',
      });
    }
  }

  handleEvents(events, configs) {
    for (const ev of events) {
      if (ev.type === 'hit') {
        const atkCfg = configs[ev.attacker] || {};
        const theme = ULTIMATE_THEMES[atkCfg.ultimateTheme] || ULTIMATE_THEMES.cyber;
        const col = atkCfg.colors?.energy || theme.primary;
        const style = ev.heavy ? theme.particleStyle : 'spark';
        this.spawnHitSparks(ev.x, ev.y, col, ev.heavy ? 18 : 11, ev.heavy, style);
        this.shake = Math.max(this.shake, ev.heavy ? 12 : 6);
      } else if (ev.type === 'block') {
        this.spawnHitSparks(ev.x, ev.y, '#38bdf8', 9, false, 'spark');
        this.shake = Math.max(this.shake, 4);
      } else if (ev.type === 'projectile_clash') {
        this.spawnHitSparks(ev.x, ev.y, '#facc15', 16, true, 'spark');
        this.shake = Math.max(this.shake, 8);
      } else if (ev.type === 'jump' || ev.type === 'land') {
        this.spawnDust(ev.x, ev.y, 6);
      } else if (ev.type === 'ko') {
        this.shake = 18;
      } else if (ev.type === 'super_activate') {
        const theme = ULTIMATE_THEMES[ev.ultimateTheme] || ULTIMATE_THEMES.cyber;
        this.spawnHitSparks(ev.x, ev.y, theme.primary, 24, true, theme.particleStyle);
        this.shake = 12;
      }
    }
  }

  render(engine, configs) {
    const ctx = this.ctx;
    this.bgTick += 1;

    ctx.save();
    if (this.shake > 0.3) {
      const sx = (Math.random() - 0.5) * this.shake * 2;
      const sy = (Math.random() - 0.5) * this.shake * 2;
      ctx.translate(sx, sy);
      this.shake *= 0.82;
    } else {
      this.shake = 0;
    }

    // 1. Background stage
    this.drawStage(ctx);

    // 1b. Anime motion afterimages (Dash Kick, Uppercut, Super)
    this.updateAndDrawAfterimages(ctx);

    // 2. Fighters (draw attacker on top)
    const order = engine.fighters[0].stateFrame < engine.fighters[1].stateFrame ? [1, 0] : [0, 1];
    for (const idx of order) {
      this.drawFighter(ctx, engine.fighters[idx], configs[idx]);
    }

    // 3. Projectiles
    for (const proj of engine.projectiles) {
      this.drawProjectile(ctx, proj, configs[proj.owner]);
    }

    // 4. Particles
    this.updateAndDrawParticles(ctx);

    // 5. Cinematic Ultimate Cut-In overlay (during superFlash)
    if (engine.superFlash > 0 && engine.superFlashOwner >= 0) {
      this.drawUltimateCutIn(ctx, engine, configs[engine.superFlashOwner]);
    }

    // 6. Combo Callouts & Round/KO Banners
    this.drawOverlays(ctx, engine, configs);

    ctx.restore();
  }

  drawUltimateCutIn(ctx, engine, cfg) {
    const theme = ULTIMATE_THEMES[cfg?.ultimateTheme] || ULTIMATE_THEMES.cyber;
    const progress = 1 - engine.superFlash / 30;
    const owner = engine.fighters[engine.superFlashOwner];

    ctx.save();
    // Darken full arena
    ctx.fillStyle = 'rgba(6, 5, 16, 0.78)';
    ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);

    // Glowing radial burst behind caster
    if (owner) {
      const g = ctx.createRadialGradient(owner.x, owner.y - 95, 14, owner.x, owner.y - 95, 240);
      g.addColorStop(0, theme.core);
      g.addColorStop(0.45, theme.primary + 'aa');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
    }

    // Full-width anime cut-in ribbon
    const bandY = 152;
    const bandH = 196;
    const slideX = progress < 0.2 ? (1 - progress / 0.2) * -320 : 0;

    ctx.save();
    ctx.translate(slideX, 0);

    const bandGrad = ctx.createLinearGradient(0, bandY, STAGE_WIDTH, bandY + bandH);
    bandGrad.addColorStop(0, theme.bgTop);
    bandGrad.addColorStop(0.55, theme.bgBottom);
    bandGrad.addColorStop(1, theme.bgTop);
    ctx.fillStyle = bandGrad;
    ctx.fillRect(0, bandY, STAGE_WIDTH, bandH);

    // Top & bottom neon accent borders
    ctx.fillStyle = theme.accent;
    ctx.fillRect(0, bandY, STAGE_WIDTH, 5);
    ctx.fillRect(0, bandY + bandH - 5, STAGE_WIDTH, 5);

    // Animated speedlines inside banner
    ctx.strokeStyle = theme.secondary + '44';
    ctx.lineWidth = 3;
    for (let i = 0; i < 16; i++) {
      const ly = bandY + 14 + i * 12;
      const offset = ((this.bgTick * 28 + i * 97) % (STAGE_WIDTH + 220)) - 220;
      ctx.beginPath();
      ctx.moveTo(offset, ly);
      ctx.lineTo(offset + 180, ly);
      ctx.stroke();
    }

    // Theme-specific live background motifs
    if (theme.id === 'love') {
      for (let i = 0; i < 14; i++) {
        const hx = ((i * 83 + this.bgTick * 9) % (STAGE_WIDTH + 60)) - 30;
        const hy = bandY + 28 + ((i * 47) % (bandH - 56));
        drawHeart(ctx, hx, hy, 12 + (i % 3) * 5, i % 2 === 0 ? '#fda4af88' : '#fde04788');
      }
    } else if (theme.id === 'claude_code') {
      ctx.font = '700 14px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.fillStyle = 'rgba(74, 222, 128, 0.28)';
      const lines = [
        '> claude --dangerously-skip-permissions',
        'compiling ultimate_combo.ts ... 100%',
        'tokens: 99,999 | context: OVERDRIVE',
        'git push origin main --force-with-lease',
        '✓ 0 errors, MAXIMUM DAMAGE DEPLOYED',
      ];
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 300 + (i % 2) * 40, bandY + 36 + i * 32);
      }
    }

    // Cut-in artwork (uses custom 16:9 ultimateCutin if generated by ChatGPT Plus, else crisp portrait)
    const cutinImg = cfg?.ultimateCutin ? this.spriteCache.get(cfg.ultimateCutin) : null;
    const portImg = cfg?.portrait ? this.spriteCache.get(cfg.portrait) : null;
    if (cutinImg && cutinImg.complete && cutinImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, bandY + 5, STAGE_WIDTH, bandH - 10);
      ctx.clip();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(cutinImg, 28, bandY + 5, 340, bandH - 10);
      ctx.restore();
    } else if (portImg && portImg.complete && portImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(165, bandY + bandH / 2, 78, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(portImg, 87, bandY + bandH / 2 - 78, 156, 156);
      ctx.restore();
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(165, bandY + bandH / 2, 78, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ultimate Title & Quote Typography
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.accent;
    ctx.font = '900 18px ui-monospace, system-ui, sans-serif';
    ctx.fillText(theme.bannerTag, 290, bandY + 52);

    ctx.font = 'italic 900 50px system-ui, sans-serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#09090b';
    ctx.fillStyle = theme.core;
    const title = cfg?.superName || 'ULTIMATE BLAST';
    ctx.strokeText(title, 286, bandY + 114);
    ctx.fillText(title, 286, bandY + 114);

    if (cfg?.superQuote) {
      ctx.font = '800 20px ui-monospace, system-ui, sans-serif';
      ctx.fillStyle = theme.secondary;
      ctx.fillText(cfg.superQuote, 290, bandY + 156);
    }

    ctx.restore();
    ctx.restore();
  }

  drawStage(ctx) {
    const s = this.stage;
    const skyGrad = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    skyGrad.addColorStop(0, s.skyTop);
    skyGrad.addColorStop(1, s.skyBottom);
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, STAGE_WIDTH, GROUND_Y);

    if (s.id === 'neon-alley') {
      ctx.fillStyle = '#15122b';
      const buildings = [
        [20, 140, 90], [120, 100, 110], [250, 170, 80], [360, 115, 130],
        [520, 95, 120], [670, 155, 95], [790, 120, 150],
      ];
      for (const [bx, by, bw] of buildings) {
        ctx.fillRect(bx, by, bw, GROUND_Y - by);
        ctx.fillStyle = 'rgba(255, 224, 130, 0.22)';
        for (let wy = by + 18; wy < GROUND_Y - 40; wy += 24) {
          for (let wx = bx + 12; wx < bx + bw - 14; wx += 18) {
            if ((wx + wy) % 3 !== 0) ctx.fillRect(wx, wy, 8, 12);
          }
        }
        ctx.fillStyle = '#15122b';
      }
      const pulse = 0.75 + Math.sin(this.bgTick * 0.08) * 0.25;
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = '#ff3d81';
      ctx.strokeStyle = `rgba(255, 61, 129, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(142, 220, 116, 40);
      ctx.fillStyle = '#ff99c8';
      ctx.font = '900 16px system-ui, sans-serif';
      ctx.fillText('WARUNG 24H', 150, 246);

      ctx.shadowColor = '#00f5d4';
      ctx.strokeStyle = `rgba(0, 245, 212, ${pulse})`;
      ctx.strokeRect(690, 200, 132, 42);
      ctx.fillStyle = '#99f6e4';
      ctx.fillText('STREET BRAWL', 698, 227);
      ctx.restore();
    } else if (s.id === 'sunset-temple') {
      const sunGrad = ctx.createRadialGradient(480, 290, 10, 480, 290, 120);
      sunGrad.addColorStop(0, '#fef08a');
      sunGrad.addColorStop(0.55, '#fb923c');
      sunGrad.addColorStop(1, 'rgba(232, 93, 38, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(480, 290, 120, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#2b1318';
      ctx.fillRect(360, 240, 240, GROUND_Y - 240);
      ctx.fillRect(390, 190, 180, 55);
      ctx.fillRect(425, 145, 110, 50);
      ctx.fillRect(455, 112, 50, 38);
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(380, 260, 200, 180);
      ctx.fillStyle = '#2b1318';
      ctx.fillRect(442, 320, 76, 148);
    } else {
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(760, 110, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c2d48';
      ctx.fillRect(0, 340, STAGE_WIDTH, GROUND_Y - 340);
      const boxes = [
        [60, 285, 130, 80, '#dc2626'],
        [195, 295, 110, 70, '#2563eb'],
        [680, 280, 140, 85, '#d97706'],
        [825, 300, 115, 65, '#16a34a'],
      ];
      for (const [x, y, w, h, c] of boxes) {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        for (let rx = x + 12; rx < x + w; rx += 16) ctx.fillRect(rx, y + 6, 4, h - 12);
      }
    }

    ctx.fillStyle = s.floorColor;
    ctx.fillRect(0, GROUND_Y, STAGE_WIDTH, STAGE_HEIGHT - GROUND_Y);

    ctx.strokeStyle = s.floorLine;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y);
    ctx.lineTo(STAGE_WIDTH, GROUND_Y);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    for (let x = -220; x <= STAGE_WIDTH + 220; x += 90) {
      const topX = STAGE_WIDTH / 2 + (x - STAGE_WIDTH / 2) * 0.55;
      ctx.beginPath();
      ctx.moveTo(topX, GROUND_Y);
      ctx.lineTo(x, STAGE_HEIGHT);
      ctx.stroke();
    }
  }

  drawFighter(ctx, f, config) {
    const airRatio = Math.max(0.35, 1 - (GROUND_Y - f.y) / 260);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND_Y + 6, 56 * airRatio, 13 * airRatio, 0, 0, Math.PI * 2);
    ctx.fill();

    if (f.superMeter >= MAX_SUPER || f.state === STATES.SUPER) {
      const theme = ULTIMATE_THEMES[config?.ultimateTheme] || ULTIMATE_THEMES.cyber;
      const pulse = 0.25 + Math.sin(this.bgTick * 0.2) * 0.12;
      const g = ctx.createRadialGradient(f.x, f.y - 90, 12, f.x, f.y - 90, 110);
      g.addColorStop(0, theme.primary + '77');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalAlpha = pulse + 0.35;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 90, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 1) Try optional multi-frame horizontal strip for this action first
    const animKey = getAnimationKeyForState(f.state);
    const stripCfg = animKey && config?.animations ? config.animations[animKey] : null;
    const stripImg = stripCfg?.src ? this.spriteCache.get(stripCfg.src) : null;
    const baseImg = config?.spriteSheet ? this.spriteCache.get(config.spriteSheet) : null;

    const drawW = 216;
    const drawH = 216;
    let scaleX = 1;
    let scaleY = 1;
    let offsetX = 0;
    let offsetY = 10;
    let tilt = 0;
    const sf = f.stateFrame;

    // Fluid procedural kinematics (breathing, anticipation, lunge, squash & stretch)
    switch (f.state) {
      case STATES.IDLE: {
        const b = Math.sin(this.bgTick * 0.11 + f.slot * 1.4);
        scaleY = 1 + b * 0.028;
        scaleX = 1 - b * 0.018;
        break;
      }
      case STATES.WALK_F:
      case STATES.WALK_B: {
        const step = Math.abs(Math.sin(sf * 0.24));
        offsetY = 10 - step * 6;
        scaleY = 1 + step * 0.03;
        scaleX = 1 - step * 0.02;
        tilt = f.state === STATES.WALK_F ? 0.045 : -0.035;
        break;
      }
      case STATES.CROUCH: {
        if (sf < 4) {
          scaleY = 0.92 + (sf / 4) * 0.08;
          scaleX = 1.07 - (sf / 4) * 0.07;
        }
        break;
      }
      case STATES.JUMP: {
        if (f.vy < -4) {
          scaleY = 1.08;
          scaleX = 0.93;
        } else if (f.vy > 6) {
          scaleY = 1.05;
          scaleX = 0.95;
        }
        tilt = f.vx * f.facing * 0.012;
        break;
      }
      case STATES.LP:
      case STATES.LK: {
        if (sf < 3) {
          offsetX = -f.facing * 5;
          scaleX = 0.95;
        } else if (sf < 8) {
          offsetX = f.facing * 12;
          scaleX = 1.08;
          scaleY = 0.96;
        } else {
          const t = Math.min(1, (sf - 8) / 7);
          offsetX = f.facing * 12 * (1 - t);
        }
        break;
      }
      case STATES.HP:
      case STATES.HK: {
        if (sf < 5) {
          offsetX = -f.facing * 10;
          scaleX = 0.92;
          scaleY = 1.04;
          tilt = -0.06;
        } else if (sf < 12) {
          offsetX = f.facing * 20;
          scaleX = 1.13;
          scaleY = 0.93;
          tilt = 0.08;
        } else {
          const t = Math.min(1, (sf - 12) / 14);
          offsetX = f.facing * 20 * (1 - t);
          tilt = 0.08 * (1 - t);
        }
        break;
      }
      case STATES.SPECIAL:
      case STATES.SUPER: {
        const m = MOVES[f.state];
        if (sf < m.startup) {
          const pulse = Math.sin(sf * 0.9) * 0.04;
          scaleX = 0.93 - pulse;
          scaleY = 1.06 + pulse;
          offsetX = -f.facing * 8;
        } else if (sf < m.startup + 10) {
          offsetX = f.facing * 18;
          scaleX = 1.14;
          scaleY = 0.92;
        }
        break;
      }
      case STATES.UPPERCUT: {
        if (sf < 4) {
          scaleY = 0.88;
          scaleX = 1.1;
        } else if (sf < 16) {
          scaleY = 1.13;
          scaleX = 0.9;
          tilt = 0.06;
        }
        break;
      }
      case STATES.DASH_KICK: {
        scaleX = 1.12;
        scaleY = 0.94;
        tilt = 0.1;
        break;
      }
      case STATES.HITSTUN: {
        if (sf < 8) {
          offsetX = sf % 2 === 0 ? -6 : 6;
          scaleX = 0.93;
          scaleY = 1.06;
        }
        tilt = -0.1;
        break;
      }
      case STATES.BLOCK:
      case STATES.CROUCH_BLOCK: {
        if (sf < 5) {
          offsetX = -f.facing * 6;
          scaleX = 0.94;
        }
        break;
      }
      case STATES.VICTORY: {
        const hop = Math.abs(Math.sin(sf * 0.16));
        offsetY = 10 - hop * 8;
        scaleY = 1 + hop * 0.04;
        break;
      }
      default:
        break;
    }

    // Spawn anime afterimage trail on fast specials / Ultimate
    const isTrailState =
      f.state === STATES.DASH_KICK ||
      f.state === STATES.UPPERCUT ||
      f.state === STATES.SUPER ||
      (f.state === STATES.HP && sf >= 5 && sf < 11) ||
      (f.state === STATES.HK && sf >= 5 && sf < 11);
    if (isTrailState && sf % 3 === 0 && baseImg && baseImg.complete && baseImg.naturalWidth > 0) {
      const theme = ULTIMATE_THEMES[config?.ultimateTheme] || ULTIMATE_THEMES.cyber;
      this.afterimages.push({
        img: baseImg,
        cell: getSpriteCellIndex(f),
        x: f.x + offsetX,
        y: f.y + offsetY,
        facing: f.facing,
        scaleX,
        scaleY,
        tilt,
        tint: theme.primary,
        life: 9,
        maxLife: 9,
      });
    }

    ctx.save();
    ctx.translate(f.x + offsetX, f.y + offsetY);
    ctx.scale(f.facing * scaleX, scaleY);
    if (tilt !== 0) ctx.transform(1, 0, tilt, 1, 0, 0);

    if (f.state === STATES.HITSTUN && f.stateFrame < 4) {
      ctx.filter = 'brightness(2.2)';
    } else if (f.invincibleFrames > 0 && f.state === STATES.WAKEUP && f.stateFrame % 4 < 2) {
      ctx.globalAlpha = 0.65;
    }

    if (stripImg && stripImg.complete && stripImg.naturalWidth > 0) {
      const frames = Math.max(1, stripCfg.frames || 6);
      const fps = stripCfg.fps || 12;
      const ticksPerFrame = Math.max(1, Math.round(TICK_RATE / fps));
      const loop = animKey === 'idle' || animKey === 'walk';
      const rawIdx = Math.floor(f.stateFrame / ticksPerFrame);
      const idx = loop ? rawIdx % frames : Math.min(frames - 1, rawIdx);
      const fw = stripImg.naturalWidth / frames;
      const fh = stripImg.naturalHeight;
      const stripDrawW = Math.round(drawH * (fw / Math.max(1, fh)));
      ctx.drawImage(stripImg, idx * fw, 0, fw, fh, -stripDrawW / 2, -drawH, stripDrawW, drawH);
    } else if (baseImg && baseImg.complete && baseImg.naturalWidth > 0) {
      const cell = getSpriteCellIndex(f);
      const col = cell % 4;
      const row = Math.floor(cell / 4);
      const cw = baseImg.naturalWidth / 4;
      const ch = baseImg.naturalHeight / 4;
      ctx.drawImage(baseImg, col * cw, row * ch, cw, ch, -drawW / 2, -drawH, drawW, drawH);
    } else {
      ctx.fillStyle = config?.colors?.primary || '#e11d48';
      ctx.fillRect(-32, -140, 64, 140);
    }
    ctx.restore();

    if (f.state === STATES.BLOCK || f.state === STATES.CROUCH_BLOCK) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(f.x + f.facing * 26, f.y - 86, 46, -Math.PI * 0.45, Math.PI * 0.45, f.facing === -1);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawProjectile(ctx, proj, ownerCfg) {
    const dir = proj.vx >= 0 ? 1 : -1;
    const r = proj.radius;

    // Themed Ultimate Projectiles!
    if (proj.isSuper && proj.ultimateTheme === 'love') {
      ctx.save();
      ctx.translate(proj.x, proj.y);
      ctx.scale(dir, 1);

      const beamGrad = ctx.createLinearGradient(-r * 3.8, 0, r, 0);
      beamGrad.addColorStop(0, 'rgba(244, 63, 94, 0)');
      beamGrad.addColorStop(0.6, 'rgba(253, 164, 175, 0.85)');
      beamGrad.addColorStop(1, '#f43f5e');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(-r * 3.8, 0);
      ctx.lineTo(0, -r * 1.15);
      ctx.lineTo(0, r * 1.15);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 32;
      ctx.shadowColor = '#f43f5e';
      drawHeart(ctx, 0, 12, r * 1.25, '#f43f5e');
      drawHeart(ctx, 4, 8, r * 0.8, '#fda4af');
      drawHeart(ctx, 6, 4, r * 0.45, '#fff1f2');

      // Orbiting mini hearts
      for (let i = 0; i < 4; i++) {
        const ang = this.bgTick * 0.25 + (i * Math.PI) / 2;
        drawHeart(ctx, -r * 0.9 + Math.cos(ang) * 28, Math.sin(ang) * 38, 12, '#fde047');
      }
      ctx.restore();
      return;
    }

    if (proj.isSuper && proj.ultimateTheme === 'claude_code') {
      ctx.save();
      ctx.translate(proj.x, proj.y);

      const beamGrad = ctx.createLinearGradient(-dir * r * 4, 0, dir * r, 0);
      beamGrad.addColorStop(0, 'rgba(217, 119, 87, 0)');
      beamGrad.addColorStop(0.55, 'rgba(217, 119, 87, 0.9)');
      beamGrad.addColorStop(1, '#fef3c7');
      ctx.fillStyle = beamGrad;
      ctx.fillRect(dir > 0 ? -r * 4 : -r, -r * 0.82, r * 5, r * 1.64);

      ctx.shadowBlur = 30;
      ctx.shadowColor = '#d97757';
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#d97757';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(-r * 0.95, -r * 0.72, r * 1.9, r * 1.44, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#4ade80';
      ctx.font = '900 18px ui-monospace, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('> CLAUDE', 0, -10);
      ctx.fillStyle = '#fef3c7';
      ctx.font = '800 13px ui-monospace, Menlo, monospace';
      ctx.fillText('CODE // ⚡', 0, 12);

      // Orbiting floating code tokens
      ctx.font = '800 14px ui-monospace, monospace';
      for (let i = 0; i < 4; i++) {
        const ang = this.bgTick * 0.22 + (i * Math.PI) / 2;
        ctx.fillStyle = i % 2 === 0 ? '#4ade80' : '#f59e0b';
        ctx.fillText(CODE_TOKENS[(i + Math.floor(this.bgTick / 6)) % CODE_TOKENS.length], Math.cos(ang) * 58, Math.sin(ang) * 48);
      }
      ctx.restore();
      return;
    }

    // Standard Special or Generic Super Projectile
    const col = ownerCfg?.colors?.energy || '#38bdf8';
    const core = ownerCfg?.colors?.energyCore || '#ffffff';

    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.scale(dir, 1);

    const tailGrad = ctx.createLinearGradient(-r * 2.8, 0, r, 0);
    tailGrad.addColorStop(0, 'rgba(0,0,0,0)');
    tailGrad.addColorStop(1, col);
    ctx.fillStyle = tailGrad;
    ctx.beginPath();
    ctx.moveTo(-r * 2.8, 0);
    ctx.lineTo(0, -r * 0.95);
    ctx.lineTo(0, r * 0.95);
    ctx.closePath();
    ctx.fill();

    ctx.shadowBlur = proj.isSuper ? 28 : 16;
    ctx.shadowColor = col;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(r * 0.15, 0, r * 0.58, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  updateAndDrawAfterimages(ctx) {
    const drawW = 216;
    const drawH = 216;
    for (const a of this.afterimages) {
      a.life -= 1;
      const alpha = Math.max(0, (a.life / a.maxLife) * 0.36);
      const col = a.cell % 4;
      const row = Math.floor(a.cell / 4);
      const cw = a.img.naturalWidth / 4;
      const ch = a.img.naturalHeight / 4;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(a.x, a.y);
      ctx.scale(a.facing * a.scaleX, a.scaleY);
      if (a.tilt) ctx.transform(1, 0, a.tilt, 1, 0, 0);
      ctx.shadowBlur = 14;
      ctx.shadowColor = a.tint;
      ctx.drawImage(a.img, col * cw, row * ch, cw, ch, -drawW / 2, -drawH, drawW, drawH);
      ctx.restore();
    }
    this.afterimages = this.afterimages.filter((a) => a.life > 0);
  }

  updateAndDrawParticles(ctx) {
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 1;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.kind === 'ring') {
        const radius = p.size + (1 - alpha) * 34;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'heart') {
        drawHeart(ctx, p.x, p.y, p.size * (0.7 + alpha * 0.5), p.color);
      } else if (p.kind === 'code') {
        ctx.fillStyle = p.color;
        ctx.font = `900 ${Math.round(11 + p.size * 0.6)}px ui-monospace, monospace`;
        ctx.fillText(p.token || '</>', p.x, p.y);
      } else if (p.kind === 'spark') {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.2 - alpha * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  drawOverlays(ctx, engine, configs) {
    for (let i = 0; i < 2; i++) {
      const f = engine.fighters[i];
      if (f.comboCount >= 2 && f.comboTimer > 0) {
        const x = i === 0 ? 115 : STAGE_WIDTH - 115;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '900 42px system-ui, sans-serif';
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#0f172a';
        ctx.fillStyle = configs[i]?.colors?.energy || '#facc15';
        const text = `${f.comboCount} HIT!`;
        ctx.strokeText(text, x, 195);
        ctx.fillText(text, x, 195);
        ctx.font = '800 15px system-ui, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('COMBO', x, 216);
        ctx.restore();
      }
    }

    if (engine.bannerText) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'italic 900 68px system-ui, sans-serif';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#09090b';
      const grad = ctx.createLinearGradient(0, 195, 0, 265);
      grad.addColorStop(0, '#fef08a');
      grad.addColorStop(0.5, '#f97316');
      grad.addColorStop(1, '#ef4444');
      ctx.fillStyle = grad;
      ctx.strokeText(engine.bannerText, STAGE_WIDTH / 2, 232);
      ctx.fillText(engine.bannerText, STAGE_WIDTH / 2, 232);

      if (engine.bannerSub) {
        ctx.font = '800 22px system-ui, sans-serif';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#09090b';
        ctx.fillStyle = '#ffffff';
        ctx.strokeText(engine.bannerSub, STAGE_WIDTH / 2, 286);
        ctx.fillText(engine.bannerSub, STAGE_WIDTH / 2, 286);
      }
      ctx.restore();
    }
  }
}
