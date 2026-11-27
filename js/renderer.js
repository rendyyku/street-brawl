import {
  GROUND_Y,
  MAX_SUPER,
  MOVES,
  STAGES,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  STATES,
} from './constants.js';

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

export class GameRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.canvas.width = STAGE_WIDTH;
    this.canvas.height = STAGE_HEIGHT;
    this.spriteCache = new Map();
    this.particles = [];
    this.shake = 0;
    this.stage = STAGES[0];
    this.bgTick = 0;
  }

  setStage(stageId) {
    this.stage = STAGES.find((s) => s.id === stageId) || STAGES[0];
  }

  preloadFighter(fighter) {
    if (!fighter?.spriteSheet) return;
    if (this.spriteCache.has(fighter.spriteSheet)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = fighter.spriteSheet;
    this.spriteCache.set(fighter.spriteSheet, img);
  }

  spawnHitSparks(x, y, color = '#facc15', count = 12, heavy = false) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
      const spd = (heavy ? 7 : 4.5) + Math.random() * 5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: heavy ? 18 : 13,
        maxLife: heavy ? 18 : 13,
        size: heavy ? 7 + Math.random() * 6 : 4 + Math.random() * 4,
        color: i % 2 === 0 ? '#ffffff' : color,
        kind: 'spark',
      });
    }
    // Impact ring
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
        const col = configs[ev.attacker]?.colors?.energy || '#facc15';
        this.spawnHitSparks(ev.x, ev.y, col, ev.heavy ? 18 : 11, ev.heavy);
        this.shake = Math.max(this.shake, ev.heavy ? 12 : 6);
      } else if (ev.type === 'block') {
        this.spawnHitSparks(ev.x, ev.y, '#38bdf8', 9, false);
        this.shake = Math.max(this.shake, 4);
      } else if (ev.type === 'projectile_clash') {
        this.spawnHitSparks(ev.x, ev.y, '#facc15', 16, true);
        this.shake = Math.max(this.shake, 8);
      } else if (ev.type === 'jump' || ev.type === 'land') {
        this.spawnDust(ev.x, ev.y, 6);
      } else if (ev.type === 'ko') {
        this.shake = 18;
      } else if (ev.type === 'super_activate') {
        this.spawnHitSparks(ev.x, ev.y, '#facc15', 22, true);
        this.shake = 10;
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

    // Super flash cinematic dark backdrop
    if (engine.superFlash > 0) {
      ctx.fillStyle = 'rgba(8, 6, 22, 0.72)';
      ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      const owner = engine.fighters[engine.superFlashOwner];
      if (owner) {
        const grad = ctx.createRadialGradient(owner.x, owner.y - 95, 16, owner.x, owner.y - 95, 220);
        grad.addColorStop(0, 'rgba(255,255,255,0.85)');
        grad.addColorStop(0.4, (configs[owner.slot]?.colors?.energy || '#38bdf8') + 'aa');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, STAGE_WIDTH, STAGE_HEIGHT);
      }
    }

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

    // 5. In-canvas Combo Callouts & Round/KO Banners
    this.drawOverlays(ctx, engine, configs);

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
      // City skyline silhouette + glowing neon signs
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
      // Neon arcade signs
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
      // Giant crimson sun
      const sunGrad = ctx.createRadialGradient(480, 290, 10, 480, 290, 120);
      sunGrad.addColorStop(0, '#fef08a');
      sunGrad.addColorStop(0.55, '#fb923c');
      sunGrad.addColorStop(1, 'rgba(232, 93, 38, 0)');
      ctx.fillStyle = sunGrad;
      ctx.beginPath();
      ctx.arc(480, 290, 120, 0, Math.PI * 2);
      ctx.fill();

      // Traditional brick Candi / Temple silhouette inspired by the user's photo!
      ctx.fillStyle = '#2b1318';
      ctx.fillRect(360, 240, 240, GROUND_Y - 240);
      ctx.fillRect(390, 190, 180, 55);
      ctx.fillRect(425, 145, 110, 50);
      ctx.fillRect(455, 112, 50, 38);
      // Warm terracotta brick accent blocks
      ctx.fillStyle = '#7c2d12';
      ctx.fillRect(380, 260, 200, 180);
      ctx.fillStyle = '#2b1318';
      ctx.fillRect(442, 320, 76, 148);
    } else {
      // Harbor Arena: moonlight, ocean shimmer, container cranes
      ctx.fillStyle = '#e0f2fe';
      ctx.beginPath();
      ctx.arc(760, 110, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0c2d48';
      ctx.fillRect(0, 340, STAGE_WIDTH, GROUND_Y - 340);
      // Shipping containers
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

    // Arcade Floor with perspective lines
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
    // Ground shadow
    const airRatio = Math.max(0.35, 1 - (GROUND_Y - f.y) / 260);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.ellipse(f.x, GROUND_Y + 6, 56 * airRatio, 13 * airRatio, 0, 0, Math.PI * 2);
    ctx.fill();

    // Super aura glow if meter full or doing super
    if (f.superMeter >= MAX_SUPER || f.state === STATES.SUPER) {
      const auraCol = config?.colors?.energy || '#38bdf8';
      const pulse = 0.25 + Math.sin(this.bgTick * 0.2) * 0.12;
      const g = ctx.createRadialGradient(f.x, f.y - 90, 12, f.x, f.y - 90, 110);
      g.addColorStop(0, auraCol + '66');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.globalAlpha = pulse + 0.35;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y - 90, 110, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const img = config?.spriteSheet ? this.spriteCache.get(config.spriteSheet) : null;
    if (img && img.complete && img.naturalWidth > 0) {
      const cell = getSpriteCellIndex(f);
      const col = cell % 4;
      const row = Math.floor(cell / 4);
      const cw = img.naturalWidth / 4;
      const ch = img.naturalHeight / 4;

      // Draw size calibrated to arcade fighting scale (chibi fighters ~210px tall)
      const drawW = 216;
      const drawH = 216;

      // Subtle squash/stretch + hit shake
      let scaleX = 1;
      let scaleY = 1;
      let offsetX = 0;
      let offsetY = 10; // aligns sprite feet cleanly onto GROUND_Y

      if (f.state === STATES.HITSTUN && f.stateFrame < 8) {
        offsetX = (f.stateFrame % 2 === 0 ? -5 : 5);
      } else if (f.state === STATES.UPPERCUT && f.stateFrame >= 4 && f.stateFrame < 14) {
        scaleY = 1.07;
        scaleX = 0.94;
      } else if (f.state === STATES.DASH_KICK) {
        scaleX = 1.08;
      }

      ctx.save();
      ctx.translate(f.x + offsetX, f.y + offsetY);
      ctx.scale(f.facing * scaleX, scaleY);

      // Flash white on hit impact or invincible wakeup
      if (f.state === STATES.HITSTUN && f.stateFrame < 4) {
        ctx.filter = 'brightness(2.2)';
      } else if (f.invincibleFrames > 0 && f.state === STATES.WAKEUP && f.stateFrame % 4 < 2) {
        ctx.globalAlpha = 0.65;
      }

      ctx.drawImage(
        img,
        col * cw,
        row * ch,
        cw,
        ch,
        -drawW / 2,
        -drawH,
        drawW,
        drawH
      );
      ctx.restore();
    } else {
      // Fallback placeholder silhouette while image loads
      ctx.fillStyle = config?.colors?.primary || '#e11d48';
      ctx.fillRect(f.x - 32, f.y - 140, 64, 140);
    }

    // Block shield visual
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
    const col = ownerCfg?.colors?.energy || '#38bdf8';
    const core = ownerCfg?.colors?.energyCore || '#ffffff';
    const dir = proj.vx >= 0 ? 1 : -1;
    const r = proj.radius;

    ctx.save();
    ctx.translate(proj.x, proj.y);
    ctx.scale(dir, 1);

    // Comet energy tail
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

    // Outer glow orb
    ctx.shadowBlur = proj.isSuper ? 28 : 16;
    ctx.shadowColor = col;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Hot white core
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(r * 0.15, 0, r * 0.58, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
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
    // Combo counters
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

    // Center Round / FIGHT / K.O. Banner
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
