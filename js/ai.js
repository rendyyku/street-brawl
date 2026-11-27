import { ATTACK_STATES, MAX_SUPER, STATES } from './constants.js';
import { createEmptyInput } from './engine.js';

const DIFFICULTY = {
  easy: { reactionRate: 0.04, blockChance: 0.28, specialChance: 0.012, aggression: 0.42 },
  normal: { reactionRate: 0.085, blockChance: 0.55, specialChance: 0.028, aggression: 0.65 },
  hard: { reactionRate: 0.16, blockChance: 0.80, specialChance: 0.055, aggression: 0.85 },
};

export class FighterAI {
  constructor(difficulty = 'normal') {
    this.setDifficulty(difficulty);
    this.decisionTimer = 0;
    this.intent = 'idle'; // 'approach' | 'retreat' | 'crouch' | 'idle'
    this.blockTimer = 0;
  }

  setDifficulty(diff) {
    this.difficulty = diff;
    this.cfg = DIFFICULTY[diff] || DIFFICULTY.normal;
  }

  computeInput(engine, slot = 1) {
    const input = createEmptyInput();
    if (engine.phase !== 'fight') return input;

    const me = engine.fighters[slot];
    const opp = engine.fighters[1 - slot];
    const dx = opp.x - me.x;
    const dist = Math.abs(dx);
    const towardLeft = dx < 0;

    const setForward = () => {
      if (towardLeft) input.left = true;
      else input.right = true;
    };
    const setBack = () => {
      if (towardLeft) input.right = true;
      else input.left = true;
    };

    // React to incoming projectile or close opponent attack
    const incomingProj = engine.projectiles.find(
      (p) => p.owner !== slot && Math.abs(p.x - me.x) < 165
    );
    const oppAttackingClose = ATTACK_STATES.has(opp.state) && dist < 165;

    if (this.blockTimer > 0) {
      this.blockTimer -= 1;
      setBack();
      if (opp.state === STATES.LK) input.down = true;
      return input;
    }

    if ((incomingProj || oppAttackingClose) && Math.random() < this.cfg.blockChance * 0.25) {
      if (incomingProj && Math.random() < 0.35 && dist > 180) {
        input.up = true;
        setForward();
        return input;
      }
      this.blockTimer = 14 + Math.floor(Math.random() * 12);
      setBack();
      return input;
    }

    // Anti-air if opponent jumps in close
    if (opp.state === STATES.JUMP && dist < 145 && Math.random() < this.cfg.reactionRate) {
      setForward();
      input.sp = true;
      return input;
    }

    // Unleash Super when full and in range!
    if (me.superMeter >= MAX_SUPER && dist < 380 && Math.random() < this.cfg.reactionRate * 0.7) {
      input.sup = true;
      return input;
    }

    // Periodic movement intent update
    this.decisionTimer -= 1;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = 18 + Math.floor(Math.random() * 28);
      const r = Math.random();
      if (dist > 250) {
        this.intent = r < this.cfg.aggression ? 'approach' : 'idle';
      } else if (dist < 95) {
        this.intent = r < 0.3 ? 'retreat' : 'approach';
      } else {
        this.intent = r < 0.55 ? 'approach' : r < 0.78 ? 'retreat' : 'idle';
      }
    }

    if (this.intent === 'approach') setForward();
    else if (this.intent === 'retreat') setBack();

    // Attack decisions by range
    if (dist < 120 && Math.random() < this.cfg.reactionRate) {
      const r = Math.random();
      if (r < 0.32) input.lp = true;
      else if (r < 0.58) input.lk = true;
      else if (r < 0.80) input.hp = true;
      else input.hk = true;
    } else if (dist >= 120 && dist < 210 && Math.random() < this.cfg.reactionRate * 0.6) {
      const r = Math.random();
      if (r < 0.45) input.hk = true;
      else if (r < 0.75) input.hp = true;
      else {
        input.left = false;
        input.right = false;
        setBack();
        input.sp = true; // Cyclone dash kick
      }
    } else if (dist >= 220 && me.specialType === 'fireball' && Math.random() < this.cfg.specialChance) {
      input.left = false;
      input.right = false;
      input.sp = true; // Fireball
    }

    return input;
  }
}
