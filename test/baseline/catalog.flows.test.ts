import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validate } from 'jsonschema';
import { proto } from 'baileys';

import { catalogMessageSchema, productMessageSchema } from '../../src/validate/message.schema';
import { normalizeListType } from '../../src/api/integrations/channel/whatsapp/helpers/listMessage.helper';

test('catalog: sendProduct / sendCatalog / sendProductList exist next to sendList', () => {
  const sendRouter = readFileSync('src/api/routes/sendMessage.router.ts', 'utf8');
  assert.match(sendRouter, /routerPath\('sendProduct'\)/);
  assert.match(sendRouter, /routerPath\('sendCatalog'\)/);
  assert.match(sendRouter, /routerPath\('sendProductList'\)/);
  assert.match(sendRouter, /productMessageSchema/);
  assert.match(sendRouter, /catalogMessageSchema/);

  const controller = readFileSync('src/api/controllers/sendMessage.controller.ts', 'utf8');
  assert.match(controller, /sendProduct\(/);
  assert.match(controller, /sendCatalog\(/);
  assert.match(controller, /\.productMessage\(data\)/);
  assert.match(controller, /\.catalogMessage\(data\)/);
});

test('catalog: fetchCatalog rethrows instead of returning isBusiness:false', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  const start = src.indexOf('public async fetchCatalog');
  const end = src.indexOf('public async getCatalog');
  const block = src.slice(start, end);
  assert.match(block, /catch \(error\)/);
  assert.match(block, /throw new InternalServerErrorException\('Error fetchCatalog'/);
  assert.equal(block.includes("return { wuid: jid, name: null, isBusiness: false }"), false);
  assert.match(block, /this\.getCatalog\(/);
  assert.match(src, /this\.client\.getCatalog\(/);
});

test('catalog (envio): PRODUCT_LIST with productListInfo is kept; bare PRODUCT_LIST still becomes SINGLE_SELECT', () => {
  const realCatalog: proto.Message.IListMessage = {
    listType: proto.Message.ListMessage.ListType.PRODUCT_LIST,
    productListInfo: {
      businessOwnerJid: '5511999999999@s.whatsapp.net',
      productSections: [{ title: 'A', products: [{ productId: '1' }] }],
    },
  };
  normalizeListType(realCatalog);
  assert.equal(realCatalog.listType, proto.Message.ListMessage.ListType.PRODUCT_LIST);

  const misTagged: proto.Message.IListMessage = {
    listType: proto.Message.ListMessage.ListType.PRODUCT_LIST,
    sections: [{ title: 'Menu', rows: [{ title: 'A', rowId: 'a' }] }],
  };
  normalizeListType(misTagged);
  assert.equal(misTagged.listType, proto.Message.ListMessage.ListType.SINGLE_SELECT);
});

test('catalog: product schema requires productId + title + productImage', () => {
  const valid = validate(
    {
      number: '5511999999999',
      productId: '123',
      title: 'Camiseta',
      productImage: 'https://example.com/p.jpg',
    },
    productMessageSchema,
  );
  assert.equal(valid.valid, true);

  const missingImage = validate(
    { number: '5511999999999', productId: '123', title: 'Camiseta' },
    productMessageSchema,
  );
  assert.equal(missingImage.valid, false);
});

test('catalog: catalog schema requires headerImage and title/buttonText', () => {
  const valid = validate(
    {
      number: '5511999999999',
      title: 'Catálogo',
      buttonText: 'Ver produtos',
      headerImage: 'https://example.com/capa.jpg',
      productIds: ['123', '456'],
    },
    catalogMessageSchema,
  );
  assert.equal(valid.valid, true);

  const missingHeader = validate(
    {
      number: '5511999999999',
      title: 'Catálogo',
      buttonText: 'Ver',
      productIds: ['123'],
    },
    catalogMessageSchema,
  );
  assert.equal(missingHeader.valid, false);
});

test('catalog: Baileys service builds PRODUCT_LIST and productMessage', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  assert.match(src, /public async productMessage\(data: SendProductDto\)/);
  assert.match(src, /public async catalogMessage\(data: SendCatalogDto\)/);
  assert.match(src, /ListType\.PRODUCT_LIST/);
  assert.match(src, /productListInfo/);
  assert.match(src, /message\['product'\]/);
});
