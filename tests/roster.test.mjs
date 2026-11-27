import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { ULTIMATE_THEMES } from '../js/constants.js';
import { BUILTIN_FIGHTERS } from '../js/roster.js';

test('every built-in fighter references asset files that exist on disk', () => {
  for (const f of BUILTIN_FIGHTERS) {
    const paths = [
      f.spriteSheet,
      f.portrait,
      f.ultimateCutin,
      ...Object.values(f.animations || {}).map((a) => a.src),
      ...Object.values(f.voice || {}),
    ].filter(Boolean);
    for (const p of paths) {
      assert.ok(existsSync(new URL(`../${p}`, import.meta.url)), `${f.id}: missing ${p}`);
    }
  }
});

test('built-in fighters have unique ids and a known ultimate theme', () => {
  const ids = BUILTIN_FIGHTERS.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const f of BUILTIN_FIGHTERS) {
    assert.ok(ULTIMATE_THEMES[f.ultimateTheme], `${f.id}: unknown theme ${f.ultimateTheme}`);
  }
});

test('OWI is registered with the pembangunan ultimate and bicycle special', () => {
  const owi = BUILTIN_FIGHTERS.find((f) => f.id === 'owi');
  assert.ok(owi);
  assert.equal(owi.ultimateTheme, 'pembangunan');
  assert.equal(owi.projectileStyle, 'bicycle');
  assert.equal(owi.superName, 'INFRASTRUKTUR FINALE');
});

test('every stage references painted layers that exist and a known BGM', async () => {
  const { STAGES } = await import('../js/constants.js');
  const { BGM_FILES } = await import('../js/audio.js');
  const ids = STAGES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const s of STAGES) {
    for (const p of [s.bgFar, s.bgMid].filter(Boolean)) {
      assert.ok(existsSync(new URL(`../${p}`, import.meta.url)), `${s.id}: missing ${p}`);
    }
    if (s.bgm) assert.ok(BGM_FILES[s.bgm], `${s.id}: unknown bgm ${s.bgm}`);
  }
});
