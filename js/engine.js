import {
  ATTACK_STATES,
  GROUND_Y,
  MAX_ROUNDS_TO_WIN,
  MAX_SUPER,
  MOVES,
  PHYSICS,
  ROUND_TIME_SECONDS,
  STAGE_LEFT,
  STAGE_RIGHT,
  STATES,
  TICK_RATE,
  ULTI1_COST,
} from './constants.js';

export function createEmptyInput() {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    lp: false,
    hp: false,
    lk: false,
    hk: false,
    sp: false,
    sup: false,
    ex: false,
  };
}

function createFighterState(slot, config) {
  const isP1 = slot === 0;
  return {
    slot,
    id: config.id,
    name: config.name,
    maxHp: config.maxHp || 1000,
    hp: config.maxHp || 1000,
    trailHp: config.maxHp || 1000,
    superMeter: 0,
    speedMul: config.speedMul || 1.0,
    powerMul: config.powerMul || 1.0,
    specialType: config.specialType || 'fireball',
    x: isP1 ? 260 : 700,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    facing: isP1 ? 1 : -1,
    state: STATES.IDLE,
    stateFrame: 0,
    stunFrames: 0,
    invincibleFrames: 0,
    hitRegistered: false,
    moveHitConnected: false,
    comboCount: 0,
    comboTimer: 0,
    roundsWon: 0,
    prevButtons: { lp: false, hp: false, lk: false, hk: false, sp: false, sup: false, ex: false },
    bufferedButtons: { lp: false, hp: false, lk: false, hk: false, sp: false, sup: false, ex: false },
    bufferedSpDir: null,
    multiHits: 0,
    lastHitFrame: -99,
  };
}

function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export class FightingEngine {
  constructor(p1Config, p2Config) {
    this.configs = [p1Config, p2Config];
    this.fighters = [
      createFighterState(0, p1Config),
      createFighterState(1, p2Config),
    ];
    this.projectiles = [];
    this.events = [];
    this.frame = 0;
    this.round = 1;
    this.timerFrames = ROUND_TIME_SECONDS * TICK_RATE;
    this.phase = 'intro'; // 'intro' | 'fight' | 'round_over' | 'match_over'
    this.phaseTimer = 95;
    this.hitstop = 0;
    this.superFlash = 0;
    this.superFlashOwner = -1;
    this.superFlashKind = 'super';
    this.superFlashMax = 30;
    this.slowMoTimer = 0;
    this.bannerText = 'ROUND 1';
    this.bannerSub = 'GET READY!';
    this.winnerSlot = -1;
    this.roundWinnerSlot = -1;
    this.nextProjId = 1;
  }

  resetRound(incrementRound = true) {
    if (incrementRound) this.round += 1;
    this.projectiles = [];
    this.timerFrames = ROUND_TIME_SECONDS * TICK_RATE;
    this.phase = 'intro';
    this.phaseTimer = 95;
    this.hitstop = 0;
    this.superFlash = 0;
    this.slowMoTimer = 0;
    this.roundWinnerSlot = -1;
    this.bannerText = `ROUND ${this.round}`;
    this.bannerSub = 'GET READY!';

    for (let i = 0; i < 2; i++) {
      const f = this.fighters[i];
      const wins = f.roundsWon;
      const carrySuper = Math.min(MAX_SUPER, Math.floor(f.superMeter * 0.5));
      Object.assign(f, createFighterState(i, this.configs[i]));
      f.roundsWon = wins;
      f.superMeter = carrySuper;
    }
    this.emit('round_start', { round: this.round });
  }

  emit(type, payload = {}) {
    this.events.push({ type, frame: this.frame, ...payload });
  }

  consumeEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  getHurtbox(f) {
    const isCrouch = f.state === STATES.CROUCH || f.state === STATES.CROUCH_BLOCK || f.state === STATES.LK;
    const isDown = f.state === STATES.KNOCKDOWN || f.state === STATES.KO;
    if (isDown) {
      return { x: f.x - 55, y: f.y - 36, w: 110, h: 36 };
    }
    const w = isCrouch ? PHYSICS.hurtboxCrouchW : PHYSICS.hurtboxStandW;
    const h = isCrouch ? PHYSICS.hurtboxCrouchH : PHYSICS.hurtboxStandH;
    return { x: f.x - w / 2, y: f.y - h, w, h };
  }

  getActiveHitbox(f) {
    if (!ATTACK_STATES.has(f.state)) return null;
    const move = MOVES[f.state];
    if (!move || !move.hitbox) return null;
    if (f.stateFrame < move.startup || f.stateFrame >= move.startup + move.active) {
      return null;
    }
    const hb = move.hitbox;
    const x = f.facing === 1 ? f.x + hb.x : f.x - hb.x - hb.w;
    return { x, y: f.y + hb.y, w: hb.w, h: hb.h };
  }

  isGrounded(f) {
    return f.y >= GROUND_Y - 0.5;
  }

  step(rawP1 = createEmptyInput(), rawP2 = createEmptyInput()) {
    this.frame += 1;

    // Trail HP smooth decay
    for (const f of this.fighters) {
      if (f.trailHp > f.hp) {
        f.trailHp = Math.max(f.hp, f.trailHp - 4.5);
      } else {
        f.trailHp = f.hp;
      }
      if (f.comboTimer > 0) {
        f.comboTimer -= 1;
        if (f.comboTimer === 0) f.comboCount = 0;
      }
    }

    if (this.superFlash > 0) {
      this.superFlash -= 1;
      return;
    }

    if (this.hitstop > 0) {
      const inputs = [rawP1, rawP2];
      for (let i = 0; i < 2; i++) {
        const f = this.fighters[i];
        const inp = inputs[i];
        for (const key of ['lp', 'hp', 'lk', 'hk', 'sp', 'sup', 'ex']) {
          if (inp[key] && !f.prevButtons[key]) {
            f.bufferedButtons[key] = true;
            if (key === 'sp') {
              f.bufferedSpDir = {
                left: Boolean(inp.left),
                right: Boolean(inp.right),
                up: Boolean(inp.up),
                down: Boolean(inp.down),
              };
            }
          }
          f.prevButtons[key] = Boolean(inp[key]);
        }
      }
      this.hitstop -= 1;
      return;
    }

    // Slow motion on KO
    if (this.slowMoTimer > 0) {
      this.slowMoTimer -= 1;
      if (this.slowMoTimer % 2 === 1) return;
    }

    if (this.phase === 'intro') {
      this.phaseTimer -= 1;
      if (this.phaseTimer === 30) {
        this.bannerText = 'FIGHT!';
        this.bannerSub = '';
        this.emit('fight_start', { round: this.round });
      }
      if (this.phaseTimer <= 0) {
        this.phase = 'fight';
        this.bannerText = '';
        this.bannerSub = '';
      }
      this.updateIdleOnly();
      return;
    }

    if (this.phase === 'round_over') {
      this.phaseTimer -= 1;
      this.stepPhysicsOnly();
      if (this.phaseTimer <= 0) {
        const p1Won = this.fighters[0].roundsWon >= MAX_ROUNDS_TO_WIN;
        const p2Won = this.fighters[1].roundsWon >= MAX_ROUNDS_TO_WIN;
        if (p1Won && p2Won) {
          this.phase = 'match_over';
          this.winnerSlot = -1;
          this.bannerText = 'DRAW MATCH';
          this.bannerSub = 'DOUBLE K.O.';
          this.emit('match_over', { winnerSlot: -1 });
        } else if (p1Won) {
          this.phase = 'match_over';
          this.winnerSlot = 0;
          this.bannerText = `${this.fighters[0].name} WINS!`;
          this.bannerSub = 'CHAMPION';
          this.emit('match_over', { winnerSlot: 0 });
        } else if (p2Won) {
          this.phase = 'match_over';
          this.winnerSlot = 1;
          this.bannerText = `${this.fighters[1].name} WINS!`;
          this.bannerSub = 'CHAMPION';
          this.emit('match_over', { winnerSlot: 1 });
        } else {
          this.resetRound(true);
        }
      }
      return;
    }

    if (this.phase === 'match_over') {
      this.stepPhysicsOnly();
      return;
    }

    // Active fighting phase
    if (this.timerFrames > 0) {
      this.timerFrames -= 1;
      if (this.timerFrames === 0) {
        this.handleTimeOver();
        return;
      }
    }

    const inputs = [rawP1, rawP2];
    for (let i = 0; i < 2; i++) {
      this.updateFighter(this.fighters[i], this.fighters[1 - i], inputs[i]);
    }

    this.resolvePushboxes();
    this.updateProjectiles();
    this.resolveCombat(inputs);
    this.checkKO();
  }

  updateIdleOnly() {
    for (const f of this.fighters) {
      f.stateFrame += 1;
    }
  }

  stepPhysicsOnly() {
    for (const f of this.fighters) {
      f.stateFrame += 1;
      if (!this.isGrounded(f) || f.vy < 0) {
        f.vy += PHYSICS.gravity;
        f.y += f.vy;
        f.x += f.vx;
        if (f.y >= GROUND_Y) {
          f.y = GROUND_Y;
          f.vy = 0;
          f.vx *= 0.4;
        }
      } else {
        f.x += f.vx;
        f.vx *= PHYSICS.groundFriction;
      }
      f.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, f.x));
    }
  }

  updateFighter(f, opp, input) {
    f.stateFrame += 1;
    if (f.invincibleFrames > 0) f.invincibleFrames -= 1;

    const pressed = {
      lp: Boolean((input.lp && !f.prevButtons.lp) || f.bufferedButtons.lp),
      hp: Boolean((input.hp && !f.prevButtons.hp) || f.bufferedButtons.hp),
      lk: Boolean((input.lk && !f.prevButtons.lk) || f.bufferedButtons.lk),
      hk: Boolean((input.hk && !f.prevButtons.hk) || f.bufferedButtons.hk),
      sp: Boolean((input.sp && !f.prevButtons.sp) || f.bufferedButtons.sp),
      sup: Boolean((input.sup && !f.prevButtons.sup) || f.bufferedButtons.sup),
      ex: Boolean((input.ex && !f.prevButtons.ex) || f.bufferedButtons.ex),
    };
    const spDir = f.bufferedButtons.sp && f.bufferedSpDir ? f.bufferedSpDir : input;
    f.bufferedButtons = { lp: false, hp: false, lk: false, hk: false, sp: false, sup: false, ex: false };
    f.bufferedSpDir = null;
    f.prevButtons = {
      lp: Boolean(input.lp),
      hp: Boolean(input.hp),
      lk: Boolean(input.lk),
      hk: Boolean(input.hk),
      sp: Boolean(input.sp),
      sup: Boolean(input.sup),
      ex: Boolean(input.ex),
    };

    const grounded = this.isGrounded(f);
    let holdingForward = (f.facing === 1 && input.right) || (f.facing === -1 && input.left);
    let holdingBack = (f.facing === 1 && input.left) || (f.facing === -1 && input.right);

    // Handle hitstun / blockstun / knockdown / wakeup
    if (f.state === STATES.HITSTUN || f.state === STATES.BLOCK || f.state === STATES.CROUCH_BLOCK) {
      f.stunFrames -= 1;
      if (f.stunFrames <= 0 && grounded) {
        f.state = input.down ? STATES.CROUCH : STATES.IDLE;
        f.stateFrame = 0;
      }
    } else if (f.state === STATES.KNOCKDOWN) {
      if (grounded && f.stateFrame > 32) {
        f.state = STATES.WAKEUP;
        f.stateFrame = 0;
        f.invincibleFrames = 14;
      }
    } else if (f.state === STATES.WAKEUP) {
      if (f.stateFrame > 12) {
        f.state = STATES.IDLE;
        f.stateFrame = 0;
      }
    } else if (ATTACK_STATES.has(f.state)) {
      const move = MOVES[f.state];
      const total = move.startup + move.active + move.recovery;

      // Spawn projectile on first active frame
      if (move.spawnsProjectile && f.stateFrame === move.startup) {
        this.spawnProjectile(f, move);
      }
      // Special movement impulses (uppercut lift / dash kick)
      if (f.state === STATES.UPPERCUT && f.stateFrame === move.startup) {
        f.vy = move.liftVy;
        f.vx = f.facing * move.lungeVx;
        this.emit('uppercut', { slot: f.slot, x: f.x, y: f.y });
      }
      if (f.state === STATES.DASH_KICK && f.stateFrame >= move.startup && f.stateFrame < move.startup + move.active) {
        f.vx = f.facing * move.lungeVx;
      }
      // Rush Ultimate dashes in, then sticks to the opponent while the barrage lands
      if (f.state === STATES.RUSH && f.stateFrame >= move.startup && f.stateFrame < move.startup + move.active) {
        f.vx = f.facing * (f.multiHits > 0 ? 2.2 : move.lungeVx * f.speedMul);
      }

      // Cancel normal -> special or super on hit/block!
      if (move.cancelable && f.moveHitConnected) {
        if (pressed.sup && f.superMeter >= MAX_SUPER) {
          this.startMove(f, STATES.SUPER);
        } else if (pressed.ex && f.superMeter >= ULTI1_COST) {
          this.startMove(f, STATES.RUSH);
        } else if (pressed.sp) {
          const spForward = (f.facing === 1 && spDir.right) || (f.facing === -1 && spDir.left);
          const spBack = (f.facing === 1 && spDir.left) || (f.facing === -1 && spDir.right);
          this.startSpecial(f, spForward, spBack, spDir.up, spDir.down);
        }
      }

      if (f.stateFrame >= total && this.isGrounded(f)) {
        f.state = input.down ? STATES.CROUCH : STATES.IDLE;
        f.stateFrame = 0;
        f.hitRegistered = false;
        f.moveHitConnected = false;
      }
    } else {
      // Free neutral / walk / crouch / jump state
      if (grounded) {
        f.facing = opp.x >= f.x ? 1 : -1;
        holdingForward = (f.facing === 1 && input.right) || (f.facing === -1 && input.left);
        holdingBack = (f.facing === 1 && input.left) || (f.facing === -1 && input.right);
      }

      // Check attack triggers
      if (pressed.sup && f.superMeter >= MAX_SUPER && grounded) {
        this.startMove(f, STATES.SUPER);
      } else if (pressed.ex && f.superMeter >= ULTI1_COST && grounded) {
        this.startMove(f, STATES.RUSH);
      } else if (pressed.sp && grounded) {
        const spForward = (f.facing === 1 && spDir.right) || (f.facing === -1 && spDir.left);
        const spBack = (f.facing === 1 && spDir.left) || (f.facing === -1 && spDir.right);
        this.startSpecial(f, spForward, spBack, spDir.up, spDir.down);
      } else if (pressed.hp) {
        this.startMove(f, STATES.HP);
      } else if (pressed.hk) {
        this.startMove(f, STATES.HK);
      } else if (pressed.lp) {
        this.startMove(f, STATES.LP);
      } else if (pressed.lk) {
        this.startMove(f, STATES.LK);
      } else if (grounded) {
        if (input.up) {
          f.vy = PHYSICS.jumpVelocity;
          if (holdingForward) f.vx = f.facing * PHYSICS.airForwardSpeed * f.speedMul;
          else if (holdingBack) f.vx = -f.facing * PHYSICS.airBackwardSpeed * f.speedMul;
          else f.vx = 0;
          f.state = STATES.JUMP;
          f.stateFrame = 0;
          this.emit('jump', { slot: f.slot, x: f.x, y: f.y });
        } else if (input.down) {
          f.state = STATES.CROUCH;
          f.vx *= 0.6;
        } else if (holdingForward) {
          f.state = STATES.WALK_F;
          f.vx = f.facing * PHYSICS.walkForwardSpeed * f.speedMul;
        } else if (holdingBack) {
          f.state = STATES.WALK_B;
          f.vx = -f.facing * PHYSICS.walkBackwardSpeed * f.speedMul;
        } else {
          f.state = STATES.IDLE;
          f.vx *= 0.65;
        }
      }
    }

    // Apply physics
    if (!this.isGrounded(f) || f.vy < 0) {
      f.vy += PHYSICS.gravity;
      f.y += f.vy;
      f.x += f.vx;
      if (f.y >= GROUND_Y) {
        f.y = GROUND_Y;
        f.vy = 0;
        f.vx *= 0.4;
        if (f.state === STATES.JUMP || (ATTACK_STATES.has(f.state) && f.state !== STATES.UPPERCUT)) {
          f.state = STATES.IDLE;
          f.stateFrame = 0;
        }
        this.emit('land', { slot: f.slot, x: f.x, y: f.y });
      }
    } else {
      f.x += f.vx;
      if (f.state !== STATES.WALK_F && f.state !== STATES.WALK_B && f.state !== STATES.DASH_KICK) {
        f.vx *= PHYSICS.groundFriction;
      }
    }

    f.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, f.x));
  }

  startSpecial(f, holdingForward, holdingBack, up, down) {
    if (holdingForward || up) {
      this.startMove(f, STATES.UPPERCUT);
    } else if (holdingBack || down) {
      this.startMove(f, STATES.DASH_KICK);
    } else if (f.specialType === 'dash') {
      this.startMove(f, STATES.DASH_KICK);
    } else if (f.specialType === 'uppercut') {
      this.startMove(f, STATES.UPPERCUT);
    } else {
      this.startMove(f, STATES.SPECIAL);
    }
  }

  startMove(f, moveState) {
    const move = MOVES[moveState];
    if (!move) return;
    f.state = moveState;
    f.stateFrame = 0;
    f.hitRegistered = false;
    f.moveHitConnected = false;
    f.multiHits = 0;
    f.lastHitFrame = -99;
    if (this.isGrounded(f)) f.vx *= 0.25;
    if (move.invincibleFrames) {
      f.invincibleFrames = Math.max(f.invincibleFrames, move.invincibleFrames);
    }
    if (moveState === STATES.SUPER) {
      f.superMeter = Math.max(0, f.superMeter - MAX_SUPER);
      this.superFlash = 30;
      this.superFlashMax = 30;
      this.superFlashKind = 'super';
      this.superFlashOwner = f.slot;
      const cfg = this.configs[f.slot] || {};
      this.emit('super_activate', {
        slot: f.slot,
        x: f.x,
        y: f.y - 90,
        name: f.name,
        superName: cfg.superName || 'ULTIMATE BLAST',
        ultimateTheme: cfg.ultimateTheme || 'cyber',
      });
    } else if (moveState === STATES.RUSH) {
      f.superMeter = Math.max(0, f.superMeter - ULTI1_COST);
      this.superFlash = 12;
      this.superFlashMax = 12;
      this.superFlashKind = 'rush';
      this.superFlashOwner = f.slot;
      const cfg = this.configs[f.slot] || {};
      this.emit('rush_activate', {
        slot: f.slot,
        x: f.x,
        y: f.y - 90,
        name: f.name,
        rushName: cfg.rushName || 'RUSH ULTIMATE',
        ultimateTheme: cfg.ultimateTheme || 'cyber',
      });
    } else {
      this.emit('attack_whiff', { slot: f.slot, move: moveState });
    }
  }

  spawnProjectile(f, move) {
    const cfg = this.configs[f.slot] || {};
    const proj = {
      id: this.nextProjId++,
      owner: f.slot,
      x: f.x + f.facing * 56,
      y: f.y - 92,
      vx: f.facing * move.projectileSpeed,
      radius: move.projectileRadius,
      damage: Math.round(move.damage * f.powerMul),
      chipDamage: move.chipDamage,
      hitstun: move.hitstun,
      blockstun: move.blockstun,
      pushback: move.pushback,
      hitstop: move.hitstop,
      knockdown: Boolean(move.knockdown),
      isSuper: Boolean(move.isSuperProjectile),
      ultimateTheme: move.isSuperProjectile ? (cfg.ultimateTheme || 'cyber') : null,
      hitsLeft: move.isSuperProjectile ? 5 : 1,
      hitCooldown: 0,
      life: move.isSuperProjectile ? 130 : 110,
    };
    this.projectiles.push(proj);
    this.emit('projectile_spawn', {
      slot: f.slot,
      x: proj.x,
      y: proj.y,
      isSuper: proj.isSuper,
      ultimateTheme: proj.ultimateTheme,
    });
  }

  updateProjectiles() {
    for (const p of this.projectiles) {
      p.x += p.hitCooldown > 0 ? p.vx * 0.15 : p.vx;
      p.life -= 1;
      if (p.hitCooldown > 0) p.hitCooldown -= 1;
    }

    // Projectile vs Projectile clash
    for (let i = 0; i < this.projectiles.length; i++) {
      for (let j = i + 1; j < this.projectiles.length; j++) {
        const a = this.projectiles[i];
        const b = this.projectiles[j];
        if (a.owner === b.owner || a.hitsLeft <= 0 || b.hitsLeft <= 0) continue;
        if (Math.abs(a.x - b.x) < a.radius + b.radius && Math.abs(a.y - b.y) < a.radius + b.radius) {
          const minHits = Math.min(a.hitsLeft, b.hitsLeft);
          a.hitsLeft -= minHits;
          b.hitsLeft -= minHits;
          this.emit('projectile_clash', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }

    this.projectiles = this.projectiles.filter(
      (p) => p.life > 0 && p.hitsLeft > 0 && p.x > -80 && p.x < STAGE_RIGHT + 140
    );
  }

  resolvePushboxes() {
    const [a, b] = this.fighters;
    const minDist = PHYSICS.pushboxWidth;
    const dx = b.x - a.x;
    const dy = Math.abs(b.y - a.y);
    if (Math.abs(dx) < minDist && dy < 110) {
      const push = (minDist - Math.abs(dx)) / 2;
      const dir = dx >= 0 ? 1 : -1;
      a.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, a.x - dir * push));
      b.x = Math.max(STAGE_LEFT, Math.min(STAGE_RIGHT, b.x + dir * push));
    }
  }

  canBlock(defender, defInput, hitLevel) {
    if (!this.isGrounded(defender)) return false;
    if (
      defender.state === STATES.HITSTUN ||
      defender.state === STATES.KNOCKDOWN ||
      defender.state === STATES.KO ||
      ATTACK_STATES.has(defender.state)
    ) {
      return false;
    }
    const holdingBack =
      (defender.facing === 1 && defInput.left) ||
      (defender.facing === -1 && defInput.right);
    if (!holdingBack) return false;
    if (hitLevel === 'low' && !defInput.down) return false;
    return true;
  }

  applyHit(attacker, defender, defInput, spec, impactX, impactY) {
    if (defender.invincibleFrames > 0 || defender.state === STATES.KO) return false;

    const blocked = this.canBlock(defender, defInput, spec.hitLevel || 'mid');
    attacker.moveHitConnected = true;

    if (blocked) {
      const chip = spec.chipDamage || 0;
      defender.hp = Math.max(1, defender.hp - chip);
      defender.state = defInput.down ? STATES.CROUCH_BLOCK : STATES.BLOCK;
      defender.stateFrame = 0;
      defender.stunFrames = spec.blockstun;
      defender.vx = -defender.facing * (spec.pushback * 0.55);
      attacker.superMeter = Math.min(MAX_SUPER, attacker.superMeter + Math.round((spec.superGain ?? 6) * 0.5));
      defender.superMeter = Math.min(MAX_SUPER, defender.superMeter + 5);
      this.hitstop = Math.max(this.hitstop, Math.max(3, Math.floor(spec.hitstop * 0.7)));
      this.emit('block', {
        attacker: attacker.slot,
        defender: defender.slot,
        x: impactX,
        y: impactY,
        chip,
      });
      return true;
    }

    // Combo scaling
    attacker.comboCount = defender.state === STATES.HITSTUN ? attacker.comboCount + 1 : 1;
    attacker.comboTimer = 65;
    const scale = Math.max(0.45, 1 - (attacker.comboCount - 1) * 0.12);
    const dmg = Math.max(10, Math.round(spec.damage * scale));

    defender.hp = Math.max(0, defender.hp - dmg);
    defender.vx = (attacker.x <= defender.x ? 1 : -1) * (spec.pushback * 0.65);

    if (spec.knockdown || !this.isGrounded(defender)) {
      defender.state = STATES.KNOCKDOWN;
      defender.stateFrame = 0;
      defender.vy = -10.5;
      defender.stunFrames = 32;
    } else {
      defender.state = STATES.HITSTUN;
      defender.stateFrame = 0;
      defender.stunFrames = spec.hitstun;
    }

    attacker.superMeter = Math.min(MAX_SUPER, attacker.superMeter + (spec.superGain ?? 8));
    defender.superMeter = Math.min(MAX_SUPER, defender.superMeter + 10);
    this.hitstop = Math.max(this.hitstop, spec.hitstop);

    this.emit('hit', {
      attacker: attacker.slot,
      defender: defender.slot,
      damage: dmg,
      combo: attacker.comboCount,
      knockdown: Boolean(spec.knockdown),
      heavy: dmg >= 80,
      x: impactX,
      y: impactY,
    });
    return true;
  }

  resolveCombat(inputs) {
    // Evaluate both melee hitboxes before applying hits so simultaneous trades connect fairly
    const pendingMelee = [];
    for (let i = 0; i < 2; i++) {
      const atk = this.fighters[i];
      const def = this.fighters[1 - i];
      const move = MOVES[atk.state];
      const multi = move?.multiHit;
      const canRehit =
        multi && atk.multiHits < multi.count && atk.stateFrame - atk.lastHitFrame >= multi.interval;
      if (atk.hitRegistered && !canRehit) continue;
      const hb = this.getActiveHitbox(atk);
      if (!hb) continue;
      const hurt = this.getHurtbox(def);
      if (rectsOverlap(hb, hurt)) {
        const isFinisher = Boolean(multi) && atk.multiHits === multi.count - 1;
        const impactX = (Math.max(hb.x, hurt.x) + Math.min(hb.x + hb.w, hurt.x + hurt.w)) / 2;
        const impactY = (Math.max(hb.y, hurt.y) + Math.min(hb.y + hb.h, hurt.y + hurt.h)) / 2;
        pendingMelee.push({
          atk,
          def,
          defInput: inputs[1 - i],
          spec: {
            ...move,
            damage: Math.round(move.damage * atk.powerMul),
            knockdown: move.knockdown || isFinisher,
            pushback: isFinisher ? multi.finisherPushback : move.pushback,
          },
          isFinisher,
          impactX,
          impactY,
        });
      }
    }
    for (const m of pendingMelee) {
      const hit = this.applyHit(m.atk, m.def, m.defInput, m.spec, m.impactX, m.impactY);
      if (hit) {
        m.atk.hitRegistered = true;
        m.atk.multiHits += 1;
        m.atk.lastHitFrame = m.atk.stateFrame;
        if (m.isFinisher) this.emit('rush_finisher', { slot: m.atk.slot, x: m.impactX, y: m.impactY });
      }
    }

    // Projectile hits
    for (const p of this.projectiles) {
      if (p.hitsLeft <= 0 || p.hitCooldown > 0) continue;
      const atk = this.fighters[p.owner];
      const def = this.fighters[1 - p.owner];
      const pbox = { x: p.x - p.radius, y: p.y - p.radius, w: p.radius * 2, h: p.radius * 2 };
      const hurt = this.getHurtbox(def);
      if (rectsOverlap(pbox, hurt)) {
        const isLastHit = p.hitsLeft === 1;
        const isSuperFinisher = p.isSuper && isLastHit;
        const hit = this.applyHit(
          atk,
          def,
          inputs[1 - p.owner],
          {
            damage: p.damage,
            chipDamage: p.chipDamage,
            hitstun: p.hitstun,
            blockstun: p.blockstun,
            pushback: isSuperFinisher ? p.pushback * 2.2 : p.pushback,
            hitstop: p.hitstop,
            knockdown: p.knockdown && isLastHit,
            superGain: p.isSuper ? 0 : 8,
            hitLevel: 'mid',
          },
          p.x,
          p.y
        );
        if (hit) {
          p.hitsLeft -= 1;
          p.hitCooldown = p.isSuper ? 4 : 0;
          if (isSuperFinisher) {
            // Dramatic slow-mo on the cinematic Ultimate's final blow
            this.slowMoTimer = Math.max(this.slowMoTimer, 40);
            this.emit('super_finisher', { slot: p.owner, x: p.x, y: p.y });
          }
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.hitsLeft > 0);
  }

  checkKO() {
    const [p1, p2] = this.fighters;
    if (p1.hp > 0 && p2.hp > 0) return;

    this.phase = 'round_over';
    this.phaseTimer = 130;
    this.slowMoTimer = 36;
    this.hitstop = 14;

    if (p1.hp <= 0 && p2.hp <= 0) {
      p1.state = STATES.KO;
      p2.state = STATES.KO;
      p1.roundsWon += 1;
      p2.roundsWon += 1;
      this.roundWinnerSlot = -1;
      this.bannerText = 'DOUBLE K.O.!';
      this.bannerSub = '';
      this.emit('ko', { winnerSlot: -1 });
    } else if (p2.hp <= 0) {
      p2.state = STATES.KO;
      p2.vy = -12;
      p2.vx = -p2.facing * 9;
      p1.state = STATES.VICTORY;
      p1.stateFrame = 0;
      p1.roundsWon += 1;
      this.roundWinnerSlot = 0;
      this.bannerText = p1.hp === p1.maxHp ? 'PERFECT K.O.!' : 'K.O.!';
      this.bannerSub = `${p1.name} TAKES ROUND ${this.round}`;
      this.emit('ko', { winnerSlot: 0, perfect: p1.hp === p1.maxHp, x: p2.x, y: p2.y - 80 });
    } else {
      p1.state = STATES.KO;
      p1.vy = -12;
      p1.vx = -p1.facing * 9;
      p2.state = STATES.VICTORY;
      p2.stateFrame = 0;
      p2.roundsWon += 1;
      this.roundWinnerSlot = 1;
      this.bannerText = p2.hp === p2.maxHp ? 'PERFECT K.O.!' : 'K.O.!';
      this.bannerSub = `${p2.name} TAKES ROUND ${this.round}`;
      this.emit('ko', { winnerSlot: 1, perfect: p2.hp === p2.maxHp, x: p1.x, y: p1.y - 80 });
    }
  }

  handleTimeOver() {
    const [p1, p2] = this.fighters;
    this.phase = 'round_over';
    this.phaseTimer = 120;
    const p1Pct = p1.hp / p1.maxHp;
    const p2Pct = p2.hp / p2.maxHp;
    if (p1Pct > p2Pct) {
      p1.roundsWon += 1;
      p1.state = STATES.VICTORY;
      this.roundWinnerSlot = 0;
      this.bannerText = 'TIME OVER';
      this.bannerSub = `${p1.name} WINS!`;
    } else if (p2Pct > p1Pct) {
      p2.roundsWon += 1;
      p2.state = STATES.VICTORY;
      this.roundWinnerSlot = 1;
      this.bannerText = 'TIME OVER';
      this.bannerSub = `${p2.name} WINS!`;
    } else {
      // A draw awards both players the round (like a double K.O.) so a match can't stall forever
      p1.roundsWon += 1;
      p2.roundsWon += 1;
      this.roundWinnerSlot = -1;
      this.bannerText = 'DRAW GAME';
      this.bannerSub = '';
    }
    this.emit('time_over', { winnerSlot: this.roundWinnerSlot });
  }

  getTimeSeconds() {
    return Math.ceil(this.timerFrames / TICK_RATE);
  }

  getSnapshot() {
    return {
      frame: this.frame,
      round: this.round,
      timerFrames: this.timerFrames,
      phase: this.phase,
      phaseTimer: this.phaseTimer,
      hitstop: this.hitstop,
      superFlash: this.superFlash,
      superFlashOwner: this.superFlashOwner,
      superFlashKind: this.superFlashKind,
      superFlashMax: this.superFlashMax,
      bannerText: this.bannerText,
      bannerSub: this.bannerSub,
      winnerSlot: this.winnerSlot,
      fighters: this.fighters.map((f) => ({
        x: Math.round(f.x * 10) / 10,
        y: Math.round(f.y * 10) / 10,
        vx: Math.round(f.vx * 10) / 10,
        vy: Math.round(f.vy * 10) / 10,
        facing: f.facing,
        hp: f.hp,
        superMeter: f.superMeter,
        state: f.state,
        stateFrame: f.stateFrame,
        stunFrames: f.stunFrames,
        comboCount: f.comboCount,
        roundsWon: f.roundsWon,
      })),
      projectiles: this.projectiles.map((p) => ({
        id: p.id,
        owner: p.owner,
        x: Math.round(p.x),
        y: Math.round(p.y),
        vx: p.vx,
        radius: p.radius,
        isSuper: p.isSuper,
        ultimateTheme: p.ultimateTheme || null,
        hitsLeft: p.hitsLeft,
        life: p.life,
      })),
    };
  }

  applySnapshot(snap) {
    this.frame = snap.frame;
    this.round = snap.round;
    this.timerFrames = snap.timerFrames;
    this.phase = snap.phase;
    this.phaseTimer = snap.phaseTimer;
    this.hitstop = snap.hitstop;
    this.superFlash = snap.superFlash;
    this.superFlashOwner = snap.superFlashOwner;
    this.superFlashKind = snap.superFlashKind || 'super';
    this.superFlashMax = snap.superFlashMax || 30;
    this.bannerText = snap.bannerText;
    this.bannerSub = snap.bannerSub;
    this.winnerSlot = snap.winnerSlot;
    for (let i = 0; i < 2; i++) {
      Object.assign(this.fighters[i], snap.fighters[i]);
    }
    this.projectiles = snap.projectiles.map((p) => ({ ...p }));
  }
}
