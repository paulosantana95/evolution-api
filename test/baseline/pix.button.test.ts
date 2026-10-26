import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Button } from '../../src/api/dto/sendMessage.dto';
import {
  buildInteractiveBizNode,
  toNativeFlowButton,
} from '../../src/api/integrations/channel/whatsapp/helpers/interactiveMessage.helper';

const mapKeyType = new Map([
  ['phone', 'PHONE'],
  ['email', 'EMAIL'],
  ['cpf', 'CPF'],
  ['cnpj', 'CNPJ'],
  ['random', 'EVP'],
] as const);

function pixButton(): Button {
  return {
    type: 'pix',
    displayText: 'Pagar PIX',
    currency: 'BRL',
    name: 'Loja Teste',
    keyType: 'random',
    key: '123e4567-e89b-12d3-a456-426614174000',
  };
}

test('pix: toNativeFlowButton builds payment_info with pix_static_code', () => {
  const native = toNativeFlowButton(pixButton(), {
    generateRandomId: () => 'REFTEST123',
    mapKeyType: mapKeyType as unknown as Map<any, string>,
  });
  assert.equal(native.name, 'payment_info');
  const params = JSON.parse(native.buttonParamsJson);
  assert.equal(params.payment_settings[0].type, 'pix_static_code');
  assert.equal(params.payment_settings[0].pix_static_code.merchant_name, 'Loja Teste');
  assert.equal(params.payment_settings[0].pix_static_code.key_type, 'EVP');
  assert.equal(params.payment_settings[0].pix_static_code.key, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(params.currency, 'BRL');
});

test('pix (PR #2742 gap): generic biz node uses native_flow name=mixed, not payment_info', () => {
  const node = buildInteractiveBizNode();
  assert.equal(node.tag, 'biz');
  const interactive = (node.content as any[])[0];
  const flow = interactive.content[0];
  assert.equal(flow.attrs.name, 'mixed');
  assert.notEqual(flow.attrs.name, 'payment_info');
});

test('pix (PR #2742 gap): helper has no buildPixBizNodes and no <bot biz_bot="1">', () => {
  const helperSrc = readFileSync(
    'src/api/integrations/channel/whatsapp/helpers/interactiveMessage.helper.ts',
    'utf8',
  );
  assert.equal(helperSrc.includes('buildPixBizNodes'), false);
  assert.equal(helperSrc.includes('biz_bot'), false);
  // Button name is payment_info (payload), but the <native_flow> biz node is "mixed".
  assert.match(helperSrc, /attrs: \{ v: '9', name: 'mixed' \}/);
  assert.equal(helperSrc.includes("attrs: { name: 'payment_info' }"), false);
});

test('pix (PR #2742 gap): rc2 PIX branch sends from/api templateId, not order_details', () => {
  const serviceSrc = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  assert.match(serviceSrc, /name: this\.mapType\.get\('pix'\)/);
  assert.match(serviceSrc, /from: 'api'/);
  assert.match(serviceSrc, /templateId: v4\(\)/);
  assert.equal(serviceSrc.includes("native_flow_name: 'order_details'"), false);
  assert.equal(serviceSrc.includes('buildPixBizNodes'), false);
  const pixOnly = serviceSrc.slice(serviceSrc.indexOf('// PIX'), serviceSrc.indexOf('// CTA (url / call / copy)'));
  assert.equal(pixOnly.includes('messageVersion'), false);
  // Title is ignored on the PIX branch (no body.text from data.title).
  const pixBlock = serviceSrc.slice(
    serviceSrc.indexOf('// PIX'),
    serviceSrc.indexOf('// CTA (url / call / copy)'),
  );
  assert.equal(pixBlock.includes('data.title'), false);
  assert.equal(pixBlock.includes('messageContextInfo'), false);
});

test('pix: sendButtons is the only public PIX endpoint (no dedicated /message/sendPix)', () => {
  const routerSrc = readFileSync('src/api/routes/sendMessage.router.ts', 'utf8');
  assert.match(routerSrc, /routerPath\('sendButtons'\)/);
  assert.equal(routerSrc.includes('sendPix'), false);
});
