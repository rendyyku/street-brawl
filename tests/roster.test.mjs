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
