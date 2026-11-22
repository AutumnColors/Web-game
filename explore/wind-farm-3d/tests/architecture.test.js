// Project rules: physics independent of rendering, every coefficient documented.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { REGISTRY } from '../physics/parameters.js';

const dir = new URL('../physics/', import.meta.url);

test('physics modules import nothing but other physics modules (no three.js, no DOM)', () => {
  for (const f of readdirSync(dir)) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const m of src.matchAll(/import[^'"]*['"]([^'"]+)['"]/g)) assert.ok(m[1].startsWith('./'), `${f} imports ${m[1]}`);
    assert.ok(!/\b(document|window|THREE)\b/.test(src.replace(/\/\/.*$/gm, '')), `${f} touches rendering globals`);
  }
});

test('every registered coefficient states value, unit, meaning, source and status', () => {
  const statuses = new Set(['standard', 'reference-design', 'literature', 'approximation', 'numerical']);
  const entries = Object.values(REGISTRY);
  assert.ok(entries.length >= 15);
  for (const e of entries) {
    for (const k of ['value', 'unit', 'meaning', 'source']) assert.ok(e[k] !== undefined && e[k] !== '', `${e.key}.${k}`);
    assert.ok(statuses.has(e.status), `${e.key}: ${e.status}`);
  }
});
