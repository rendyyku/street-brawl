import assert from 'node:assert/strict';
import test from 'node:test';
import { FighterAI } from '../js/ai.js';
import { GROUND_Y, MAX_SUPER, STATES } from '../js/constants.js';
import { createEmptyInput, FightingEngine } from '../js/engine.js';
import { BUILTIN_FIGHTERS, resolveFighterStats } from '../js/roster.js';

function makeFightEngine() {
  const p1 = resolveFighterStats(BUILTIN_FIGHTERS[0]);
  const p2 = resolveFighterStats(BUILTIN_FIGHTERS[1]);
  const eng = new FightingEngine(p1, p2);
  // Advance past round intro
  for (let i = 0; i < 100; i++) eng.step();
  assert.equal(eng.phase, 'fight');
  return eng;
}

test('fighters walk, jump, and separate via pushbox', () => {
  const eng = makeFightEngine();
  const startX = eng.fighters[0].x;
  const moveRight = { ...createEmptyInput(), right: true };
  for (let i = 0; i < 15; i++) eng.step(moveRight, createEmptyInput());
  assert.ok(eng.fighters[0].x > startX + 30);

  // Jump
  eng.step({ ...createEmptyInput(), up: true }, createEmptyInput());
  assert.equal(eng.fighters[0].state, STATES.JUMP);
  assert.ok(eng.fighters[0].y < GROUND_Y);

  // Land back on ground
  for (let i = 0; i < 60; i++) eng.step();
  assert.equal(eng.fighters[0].y, GROUND_Y);

  // Pushbox prevents overlap
  eng.fighters[0].x = 400;
  eng.fighters[1].x = 410;
  eng.step();
  assert.ok(Math.abs(eng.fighters[1].x - eng.fighters[0].x) >= 67);
});

test('melee punch hits opponent, deals damage, and builds super meter', () => {
  const eng = makeFightEngine();
  eng.fighters[0].x = 400;
  eng.fighters[1].x = 472;
  const hpBefore = eng.fighters[1].hp;

  eng.step({ ...createEmptyInput(), lp: true }, createEmptyInput());
  for (let i = 0; i < 10; i++) eng.step();

  assert.ok(eng.fighters[1].hp < hpBefore);
  assert.ok(eng.fighters[0].superMeter > 0);
});

test('holding back blocks incoming attacks and prevents full damage', () => {
  const eng = makeFightEngine();
  eng.fighters[0].x = 400;
  eng.fighters[1].x = 472;
  const hpBefore = eng.fighters[1].hp;

  // P2 faces left (-1), so holding right blocks!
  const p2Block = { ...createEmptyInput(), right: true };
  eng.step({ ...createEmptyInput(), hp: true }, p2Block);
  for (let i = 0; i < 14; i++) eng.step(createEmptyInput(), p2Block);

  assert.equal(eng.fighters[1].hp, hpBefore);
  const evs = eng.consumeEvents();
  assert.ok(evs.some((e) => e.type === 'block'));
});

test('special spawns projectile that travels and hits opponent', () => {
  const eng = makeFightEngine();
  eng.fighters[0].x = 240;
  eng.fighters[1].x = 520;
  const hpBefore = eng.fighters[1].hp;

  eng.step({ ...createEmptyInput(), sp: true }, createEmptyInput());
  for (let i = 0; i < 45; i++) eng.step();

  assert.ok(eng.fighters[1].hp < hpBefore);
});

test('super move consumes full super meter and triggers super flash', () => {
  const eng = makeFightEngine();
  eng.fighters[0].superMeter = MAX_SUPER;
  eng.step({ ...createEmptyInput(), sup: true }, createEmptyInput());

  assert.equal(eng.fighters[0].state, STATES.SUPER);
  assert.equal(eng.fighters[0].superMeter, 0);
  assert.ok(eng.superFlash > 0);
});

test('KO ends round and awards round win', () => {
  const eng = makeFightEngine();
  eng.fighters[0].x = 400;
  eng.fighters[1].x = 472;
  eng.fighters[1].hp = 20;

  eng.step({ ...createEmptyInput(), hp: true }, createEmptyInput());
  for (let i = 0; i < 20; i++) eng.step();

  assert.equal(eng.fighters[1].hp, 0);
  assert.equal(eng.phase, 'round_over');
  assert.equal(eng.fighters[0].roundsWon, 1);
});

test('AI produces valid inputs and snapshot sync restores state', () => {
  const eng = makeFightEngine();
  const ai = new FighterAI('hard');
  const inp = ai.computeInput(eng, 1);
  assert.equal(typeof inp.left, 'boolean');

  const snap = eng.getSnapshot();
  const eng2 = new FightingEngine(
    resolveFighterStats(BUILTIN_FIGHTERS[0]),
    resolveFighterStats(BUILTIN_FIGHTERS[1])
  );
  eng2.applySnapshot(snap);
  assert.equal(eng2.frame, eng.frame);
  assert.equal(eng2.fighters[0].x, eng.fighters[0].x);
});

test('simultaneous melee attacks trade damage fairly on both players', () => {
  const eng = makeFightEngine();
  eng.fighters[0].x = 400;
  eng.fighters[1].x = 470;
  const hp1 = eng.fighters[0].hp;
  const hp2 = eng.fighters[1].hp;

  const jab = { ...createEmptyInput(), lp: true };
  eng.step(jab, jab);
  for (let i = 0; i < 8; i++) eng.step();

  assert.ok(eng.fighters[0].hp < hp1, 'P1 should take damage on trade');
  assert.ok(eng.fighters[1].hp < hp2, 'P2 should take damage on trade');
});

test('super move does not refund spent super meter on hit', () => {
  const eng = makeFightEngine();
  eng.fighters[0].x = 400;
  eng.fighters[1].x = 472;
  eng.fighters[0].superMeter = MAX_SUPER;

  eng.step({ ...createEmptyInput(), sup: true }, createEmptyInput());
  for (let i = 0; i < 40; i++) eng.step();

  assert.equal(eng.fighters[0].superMeter, 0);
});

test('double KO at 1-1 ends in a draw match instead of favoring P1', () => {
  const eng = makeFightEngine();
  eng.fighters[0].roundsWon = 1;
  eng.fighters[1].roundsWon = 1;
  eng.fighters[0].x = 400;
  eng.fighters[1].x = 470;
  eng.fighters[0].hp = 10;
  eng.fighters[1].hp = 10;

  const jab = { ...createEmptyInput(), lp: true };
  eng.step(jab, jab);
  for (let i = 0; i < 240; i++) eng.step();

  assert.equal(eng.phase, 'match_over');
  assert.equal(eng.winnerSlot, -1);
  assert.equal(eng.bannerText, 'DRAW MATCH');
});

test('directional special after crossup uses updated facing', () => {
  const eng = makeFightEngine();
  // P1 crossed over to the right of P2 while still holding old facing=1
  eng.fighters[0].x = 600;
  eng.fighters[0].facing = 1;
  eng.fighters[1].x = 450;

  // Pressing left (toward P2 now) + SP should trigger UPPERCUT, not DASH_KICK
  eng.step({ ...createEmptyInput(), left: true, sp: true }, createEmptyInput());
  assert.equal(eng.fighters[0].facing, -1);
  assert.equal(eng.fighters[0].state, STATES.UPPERCUT);
});

test('special tapped during hitstop buffers and cancels after hitstop ends', () => {
  const eng = makeFightEngine();
  eng.fighters[0].x = 400;
  eng.fighters[1].x = 472;

  eng.step({ ...createEmptyInput(), lp: true }, createEmptyInput());
  // Advance until hit connects and hitstop triggers
  let enteredHitstop = false;
  for (let i = 0; i < 10; i++) {
    eng.step();
    if (eng.hitstop > 0) {
      enteredHitstop = true;
      break;
    }
  }
  assert.ok(enteredHitstop, 'should enter hitstop on LP hit');

  // Tap and release SP entirely inside hitstop
  eng.step({ ...createEmptyInput(), sp: true }, createEmptyInput());
  for (let i = 0; i < 10; i++) eng.step();

  assert.equal(eng.fighters[0].state, STATES.SPECIAL);
});
