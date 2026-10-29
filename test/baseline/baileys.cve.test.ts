import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const CVE_RANGE = {
  id: 'CVE-2026-48063',
  ghsa: 'GHSA-qvv5-jq5g-4cgg',
  vulnerableFrom: '7.0.0-rc.1',
  firstFixed: '7.0.0-rc.12',
};

const TARGET = '7.0.0-rc13';

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

test('baileys: package.json pins 7.0.0-rc13 (CVE-2026-48063 fixed in rc.12+)', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.dependencies.baileys, TARGET);
  assert.equal(isVulnerableToCve48063(pkg.dependencies.baileys), false);
  assert.equal(CVE_RANGE.id, 'CVE-2026-48063');
});

test('baileys: installed package is 7.0.0-rc13 and outside the CVE range', () => {
  const installed = JSON.parse(readFileSync('node_modules/baileys/package.json', 'utf8'));
  assert.equal(installed.version, TARGET);
  assert.equal(isVulnerableToCve48063(installed.version), false);
  assert.equal(isVulnerableToCve48063('7.0.0-rc.9'), true);
  assert.equal(isVulnerableToCve48063('7.0.0-rc.12'), false);
  assert.equal(isVulnerableToCve48063('7.0.0-rc13'), false);
});

test('baileys: stack remains Prisma 6 / Express 4 (no #2575 platform bump)', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.match(pkg.dependencies['@prisma/client'], /^\^6\./);
  assert.match(pkg.dependencies.prisma, /^\^6\./);
  assert.match(pkg.dependencies.express, /^\^4\./);
  assert.match(pkg.devDependencies.typescript, /^\^5\./);
});

test('baileys: whatsapp-rust-bridge override is 0.5.5 (CJS require)', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(pkg.overrides['whatsapp-rust-bridge'], '0.5.5');
  const bridge = JSON.parse(readFileSync('node_modules/whatsapp-rust-bridge/package.json', 'utf8'));
  assert.equal(bridge.version, '0.5.5');
  assert.ok(bridge.exports?.['.']?.require);
});

test('baileys: rc.6 waveform patch is gone; rc13 ships the PTT guard', () => {
  assert.equal(existsSync('patches/baileys+7.0.0-rc.6.patch'), false);
  const messages = readFileSync('node_modules/baileys/lib/Utils/messages.js', 'utf8');
  assert.match(
    messages,
    /requiresWaveformProcessing = mediaType === 'audio' && uploadData\.ptt === true && typeof uploadData\.waveform === 'undefined'/,
  );
});

test('baileys: Evolution still receives requestId on messages.upsert (library-level CVE is the bump)', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  const upsert = src.slice(src.indexOf("'messages.upsert':"), src.indexOf("'messages.upsert':") + 2500);
  assert.match(upsert, /requestId\?: string/);
  assert.match(upsert, /else if \(requestId\)/);
});
