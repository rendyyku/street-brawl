import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SUPER, STATES, ULTI1_COST } from '../js/constants.js';
import { createEmptyInput, FightingEngine } from '../js/engine.js';
import { packInput, unpackInput } from '../js/input.js';
import { BUILTIN_FIGHTERS, resolveFighterStats, sanitizeRemoteFighter } from '../js/roster.js';

function makeFightEngine(p1Id = 'nadia', p2Id = 'rendy') {
  const find = (id) => resolveFighterStats(BUILTIN_FIGHTERS.find((f) => f.id === id));
  const eng = new FightingEngine(find(p1Id), find(p2Id));
  for (let i = 0; i < 100; i++) eng.step();
  assert.equal(eng.phase, 'fight');
  return eng;
}

const press = (keys) => ({ ...createEmptyInput(), ...keys });

/** Steps until the engine leaves superFlash/hitstop so the next input is actually read. */
function settle(eng) {
  for (let i = 0; i < 60 && (eng.superFlash > 0 || eng.hitstop > 0); i++) eng.step();
}

test('ULTI 1 needs half a bar: below 50% the ex button does nothing', () => {
  const eng = makeFightEngine();
  eng.fighters[0].superMeter = ULTI1_COST - 1;
  eng.step(press({ ex: true }), createEmptyInput());
  assert.notEqual(eng.fighters[0].state, STATES.RUSH);
  assert.equal(eng.fighters[0].superMeter, ULTI1_COST - 1);
});

test('ULTI 1 spends 50 meter, emits rush_activate and a short rush cut-in', () => {
  const eng = makeFightEngine('rendy', 'nadia');
  eng.fighters[0].superMeter = MAX_SUPER;
  eng.step(press({ ex: true }), createEmptyInput());
  const ev = eng.consumeEvents().find((e) => e.type === 'rush_activate');
  assert.ok(ev);
  assert.equal(ev.rushName, 'GIT PUSH RUSH');
  assert.equal(ev.ultimateTheme, 'claude_code');
  assert.equal(eng.fighters[0].state, STATES.RUSH);
  assert.equal(eng.fighters[0].superMeter, MAX_SUPER - ULTI1_COST);
  assert.equal(eng.superFlashKind, 'rush');
  assert.ok(eng.superFlash <= 12, 'rush cut-in is much shorter than the cinematic one');
});

test('ULTI 1 barrage lands 4 hits and the finisher knocks down', () => {
  const eng = makeFightEngine();
  eng.fighters[0].x = 400;
  eng.fighters[1].x = 520;
  eng.fighters[0].superMeter = ULTI1_COST;
  eng.step(press({ ex: true }), createEmptyInput());
  let finisher = false;
  let knockedDown = false;
  let maxCombo = 0;
  for (let i = 0; i < 120; i++) {
    eng.step();
    for (const e of eng.consumeEvents()) {
      if (e.type === 'rush_finisher') finisher = true;
      if (e.type === 'hit') maxCombo = Math.max(maxCombo, e.combo);
    }
    if (eng.fighters[1].state === STATES.KNOCKDOWN) knockedDown = true;
  }
  assert.equal(eng.fighters[0].multiHits, 4);
  assert.equal(finisher, true);
  assert.equal(knockedDown, true);
  assert.equal(maxCombo, 4);
});

test('ULTI 1 extends a combo: a jab that connects cancels into the rush', () => {
  const eng = makeFightEngine();
  eng.fighters[0].x = 430;
  eng.fighters[1].x = 500;
  eng.fighters[0].superMeter = ULTI1_COST;
  eng.step(press({ lp: true }), createEmptyInput());
  let cancelled = false;
  for (let i = 0; i < 20 && !cancelled; i++) {
    const hit = eng.fighters[0].moveHitConnected;
    eng.step(hit && i % 2 === 0 ? press({ ex: true }) : createEmptyInput(), createEmptyInput());
    if (eng.fighters[0].state === STATES.RUSH) cancelled = true;
  }
  assert.equal(cancelled, true);
});

test('ULTI 2 still requires a full bar and its final beam hit triggers slow-mo', () => {
  const eng = makeFightEngine('owi', 'nadia');
  eng.fighters[0].superMeter = MAX_SUPER - 1;
  eng.step(press({ sup: true }), createEmptyInput());
  assert.notEqual(eng.fighters[0].state, STATES.SUPER);

  eng.fighters[0].x = 700;
  eng.fighters[1].x = 900;
  eng.fighters[0].superMeter = MAX_SUPER;
  settle(eng);
  eng.step(); // release the button so the next press is a fresh press
  eng.step(press({ sup: true }), createEmptyInput());
  assert.equal(eng.superFlashKind, 'super');
  let sawFinisher = false;
  let sawSlowMo = false;
  for (let i = 0; i < 160; i++) {
    eng.step();
    if (eng.consumeEvents().some((e) => e.type === 'super_finisher')) sawFinisher = true;
    if (eng.slowMoTimer > 0) sawSlowMo = true;
  }
  assert.equal(sawFinisher, true);
  assert.equal(sawSlowMo, true);
});

test('ex button survives hitstop buffering and the online input bitmask', () => {
  const bits = packInput(press({ ex: true, left: true }));
  const back = unpackInput(bits);
  assert.equal(back.ex, true);
  assert.equal(back.left, true);
  assert.equal(back.sup, false);
});

test('time-over draw awards both fighters the round so the match cannot stall', () => {
  const eng = makeFightEngine();
  eng.timerFrames = 1;
  eng.step();
  assert.equal(eng.fighters[0].roundsWon, 1);
  assert.equal(eng.fighters[1].roundsWon, 1);
  assert.equal(eng.bannerText, 'DRAW GAME');
});

test('remote fighters are stripped of third-party URLs', () => {
  const evil = sanitizeRemoteFighter({
    id: 'x',
    name: 'EVIL<script>',
    spriteSheet: 'https://evil.example/track.png',
    portrait: 'data:image/webp;base64,AAAA',
    ultimateCutin: 'assets/../../secret.png',
    animations: { ultimate: { src: 'https://evil.example/a.webp', frames: 6, fps: 30 } },
    voice: { super: 'https://evil.example/a.mp3', hurt: 'assets/audio/owi/kaget.mp3' },
  });
  assert.equal(evil.spriteSheet, undefined);
  assert.equal(evil.portrait, 'data:image/webp;base64,AAAA');
  assert.equal(evil.ultimateCutin, undefined);
  assert.deepEqual(evil.animations, {});
  assert.deepEqual(evil.voice, { hurt: 'assets/audio/owi/kaget.mp3' });
});
