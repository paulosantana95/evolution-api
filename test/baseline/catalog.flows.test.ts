import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('catalog: only fetch endpoints exist (getCatalog / getCollections), no sendCatalog', () => {
  const routerSrc = readFileSync('src/api/routes/business.router.ts', 'utf8');
  assert.match(routerSrc, /routerPath\('getCatalog'\)/);
  assert.match(routerSrc, /routerPath\('getCollections'\)/);
  assert.equal(routerSrc.includes('sendCatalog'), false);
  assert.equal(routerSrc.includes('sendProduct'), false);

  const sendRouter = readFileSync('src/api/routes/sendMessage.router.ts', 'utf8');
  assert.equal(/sendCatalog|sendProduct|product_list/.test(sendRouter), false);
});

test('catalog: fetchCatalog swallows errors and returns isBusiness:false (hides the real failure)', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  const start = src.indexOf('public async fetchCatalog');
  const end = src.indexOf('public async getCatalog');
  const block = src.slice(start, end);
  assert.match(block, /catch \(error\)/);
  assert.match(block, /return \{ wuid: jid, name: null, isBusiness: false \}/);
  // Client call is Baileys getCatalog — requires a live, business-capable socket.
  assert.match(block, /this\.getCatalog\(/);
  assert.match(src, /this\.client\.getCatalog\(/);
});

test('catalog (envio): patchMessageBeforeSending rewrites PRODUCT_LIST → SINGLE_SELECT', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  assert.match(
    src,
    /if \(listMessage\?\.listType === proto\.Message\.ListMessage\.ListType\.PRODUCT_LIST\)/,
  );
  assert.match(src, /listMessage\.listType = proto\.Message\.ListMessage\.ListType\.SINGLE_SELECT/);
  assert.match(src, /patchMessageBeforeSending\(message\)/);
  assert.match(src, /normalizeListType\(message\.listMessage\)/);
});

test('catalog: getCatalog schema only accepts number + limit (no product payload to send)', () => {
  const schemaSrc = readFileSync('src/validate/business.schema.ts', 'utf8');
  assert.match(schemaSrc, /export const catalogSchema/);
  assert.equal(schemaSrc.includes('productId'), false);
  assert.equal(schemaSrc.includes('catalogId'), false);
});
