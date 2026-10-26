import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CVE_RANGE = {
  id: 'CVE-2026-48063',
  ghsa: 'GHSA-qvv5-jq5g-4cgg',
  vulnerableFrom: '7.0.0-rc.1',
  firstFixed: '7.0.0-rc.12',
};

function parseRc(version: string): { major: number; minor: number; patch: number; rc: number } | null {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)-rc\.?(\d+)$/);
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3], rc: +m[4] };
}

function isVulnerableToCve48063(version: string): boolean {
  const v = parseRc(version);
  if (!v) return false;
  if (v.major !== 7 || v.minor !== 0 || v.patch !== 0) return false;
  return v.rc >= 1 && v.rc < 12;
}

test('baileys: package.json pins 7.0.0-rc.9', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.dependencies.baileys, '7.0.0-rc.9');
});

test('baileys: installed package is 7.0.0-rc.9 (CVE-2026-48063 range)', () => {
  const installed = JSON.parse(readFileSync('node_modules/baileys/package.json', 'utf8'));
  assert.equal(installed.version, '7.0.0-rc.9');
  assert.equal(isVulnerableToCve48063(installed.version), true);
  assert.equal(isVulnerableToCve48063('7.0.0-rc.12'), false);
  assert.equal(isVulnerableToCve48063('7.0.0-rc13'), false);
});

test('baileys: messages.upsert still accepts requestId (CVE injection surface)', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  const upsert = src.slice(src.indexOf("'messages.upsert':"), src.indexOf("'messages.upsert':") + 2500);
  assert.match(upsert, /requestId\?: string/);
  // rc2 logs requestId but does not drop forged upserts that carry it.
  assert.match(upsert, /else if \(requestId\)/);
  assert.equal(upsert.includes('if (requestId) return'), false);
  assert.equal(upsert.includes('if (requestId) continue'), false);
});

test('baileys: waveform patch targets rc.6 but is applied onto rc.9', () => {
  const patchName = 'patches/baileys+7.0.0-rc.6.patch';
  const patch = readFileSync(patchName, 'utf8');
  assert.match(patch, /baileys/);
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.dependencies.baileys, '7.0.0-rc.9');
});

test('baileys: develop bumped to 7.0.0-rc13 in #2575 — rc2 did not take that bump', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.notEqual(pkg.dependencies.baileys, '7.0.0-rc13');
  assert.ok(isVulnerableToCve48063(pkg.dependencies.baileys));
  assert.equal(CVE_RANGE.id, 'CVE-2026-48063');
});
