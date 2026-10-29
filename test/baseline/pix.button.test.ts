import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { Button } from '../../src/api/dto/sendMessage.dto';
import {
  buildInteractiveBizNode,
  buildPixBizNodes,
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

test('pix: generic biz node still uses native_flow name=mixed for non-PIX interactive', () => {
  const node = buildInteractiveBizNode();
  assert.equal(node.tag, 'biz');
  const interactive = (node.content as any[])[0];
  const flow = interactive.content[0];
  assert.equal(flow.attrs.name, 'mixed');
});

test('pix (PR #2742): 1:1 PIX stanza uses payment_info biz node and bot biz_bot=1', () => {
  const nodes = buildPixBizNodes('5511999999999@s.whatsapp.net');
  assert.equal(nodes.length, 2);
  assert.equal(nodes[0].tag, 'biz');
  const interactive = (nodes[0].content as any[])[0];
  const flow = interactive.content[0];
  assert.equal(flow.attrs.name, 'payment_info');
  assert.equal(nodes[1].tag, 'bot');
  assert.equal(nodes[1].attrs.biz_bot, '1');
});

test('pix (PR #2742): group PIX stanza omits bot biz_bot', () => {
  const nodes = buildPixBizNodes('120363000000000000@g.us');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].tag, 'biz');
  const interactive = (nodes[0].content as any[])[0];
  const flow = interactive.content[0];
  assert.equal(flow.attrs.name, 'payment_info');
});

test('pix (PR #2742): helper exports buildPixBizNodes with payment_info and biz_bot', () => {
  const helperSrc = readFileSync(
    'src/api/integrations/channel/whatsapp/helpers/interactiveMessage.helper.ts',
    'utf8',
  );
  assert.equal(helperSrc.includes('buildPixBizNodes'), true);
  assert.equal(helperSrc.includes('biz_bot'), true);
  assert.match(helperSrc, /attrs: \{ name: 'payment_info' \}/);
});

test('pix (PR #2742): PIX branch sends order_details, messageVersion and messageSecret', () => {
  const serviceSrc = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  assert.match(serviceSrc, /name: this\.mapType\.get\('pix'\)/);
  assert.match(serviceSrc, /native_flow_name: 'order_details'/);
  assert.match(serviceSrc, /buildPixBizNodes/);
  const pixBlock = serviceSrc.slice(
    serviceSrc.indexOf('// PIX'),
    serviceSrc.indexOf('// CTA (url / call / copy)'),
  );
  assert.match(pixBlock, /messageVersion: 1/);
  assert.match(pixBlock, /data\.title/);
  assert.match(pixBlock, /messageContextInfo/);
  assert.match(pixBlock, /messageSecret: randomBytes\(32\)/);
  assert.equal(pixBlock.includes("from: 'api'"), false);
  assert.equal(pixBlock.includes('templateId: v4()'), false);
});

test('pix: sendButtons is the only public PIX endpoint (no dedicated /message/sendPix)', () => {
  const routerSrc = readFileSync('src/api/routes/sendMessage.router.ts', 'utf8');
  assert.match(routerSrc, /routerPath\('sendButtons'\)/);
  assert.equal(routerSrc.includes('sendPix'), false);
});
