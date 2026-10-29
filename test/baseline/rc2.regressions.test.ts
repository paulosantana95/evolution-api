import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validate } from 'jsonschema';

import { textMessageSchema } from '../../src/validate/message.schema';

import {
  flattenPlainExtendedText,
  pickQuoteContextInfo,
} from '../../src/api/integrations/channel/whatsapp/helpers/prepareMessage.helper';

test('#2713 contextInfo: prepareMessage prefers quote contextInfo over messageContextInfo', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  assert.match(src, /pickQuoteContextInfo/);
  assert.match(src, /flattenPlainExtendedText\(messageRaw\)/);
  assert.equal(src.includes('delete messageRaw.message.extendedTextMessage'), false);
});

test('#2713 contextInfo: text reply keeps extendedTextMessage and stanzaId/quotedMessage', () => {
  const inboundMessage = {
    messageContextInfo: { threadId: [], messageSecret: { 0: 1 } },
    extendedTextMessage: {
      text: 'Teste',
      contextInfo: {
        stanzaId: 'ORIG-MSG-ID',
        participant: '5562...@s.whatsapp.net',
        quotedMessage: { conversation: 'original' },
      },
    },
  };

  const messageRaw: any = {
    messageType: 'extendedTextMessage',
    message: structuredClone(inboundMessage),
    contextInfo: pickQuoteContextInfo(inboundMessage as any) ?? inboundMessage.messageContextInfo,
  };

  flattenPlainExtendedText(messageRaw);

  assert.equal(messageRaw.messageType, 'extendedTextMessage');
  assert.equal(messageRaw.message.conversation, undefined);
  assert.equal(messageRaw.message.extendedTextMessage.text, 'Teste');
  assert.equal(messageRaw.contextInfo.stanzaId, 'ORIG-MSG-ID');
  assert.equal(messageRaw.contextInfo.quotedMessage.conversation, 'original');
});

test('#2713 contextInfo: plain extendedText without quote still flattens to conversation', () => {
  const messageRaw: any = {
    messageType: 'extendedTextMessage',
    message: { extendedTextMessage: { text: 'hello' } },
  };
  flattenPlainExtendedText(messageRaw);
  assert.equal(messageRaw.messageType, 'conversation');
  assert.equal(messageRaw.message.conversation, 'hello');
  assert.equal(messageRaw.message.extendedTextMessage, undefined);
});

test('#2583 sendText: schema requires top-level {number,text}; nested textMessage is rejected', () => {
  const modern = validate({ number: '5511999999999', text: 'hello' }, textMessageSchema);
  assert.equal(modern.valid, true);

  const nested = validate(
    { number: '5511999999999', textMessage: { text: 'hello' } },
    textMessageSchema,
  );
  assert.equal(nested.valid, false);
  assert.ok(nested.errors.some((e) => String(e.stack).includes('text') || String(e.property).includes('text')));
});

test('#2583 sendText: controller/service read data.text, not data.textMessage', () => {
  const controller = readFileSync('src/api/controllers/sendMessage.controller.ts', 'utf8');
  assert.match(controller, /\.textMessage\(data\)/);
  const service = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  const fn = service.slice(service.indexOf('public async textMessage'), service.indexOf('public async textMessage') + 600);
  assert.match(fn, /conversation: data\.text/);
  assert.equal(fn.includes('data.textMessage'), false);
});

test('#2762 linkPreview: default is ON; generateLinkPreview failure returns undefined (no fallback text-only send)', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  assert.match(src, /const linkPreview = options\?\.linkPreview === false \? false : undefined/);
  assert.match(src, /previewContext = await this\.generateLinkPreview/);
  assert.match(src, /this\.logger\.error\(`Error generating link preview: \$\{error\}`\)/);
  assert.match(src, /return undefined;/);
});

test('#2647 MESSAGES_UPSERT: S3/video skip does not return before the webhook', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  const upsertStart = src.indexOf("'messages.upsert':");
  const webhookIndex = src.indexOf('this.sendDataWebhook(Events.MESSAGES_UPSERT, messageRaw)');
  const upsert = src.slice(upsertStart, webhookIndex);
  assert.match(upsert, /skipVideoUpload/);
  assert.match(upsert, /No valid media to upload \(messageContextInfo only\), skipping MinIO/);
  assert.equal(/^\s+return;/m.test(upsert), false);
  const firstSkip = src.indexOf("this.logger.warn('Video upload is disabled. Skipping video upload.')");
  assert.ok(firstSkip > 0 && firstSkip < webhookIndex);
});

test('#2647 MESSAGES_UPSERT: type must be notify|append and received.message must exist', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  assert.match(src, /if \(\(type !== 'notify' && type !== 'append'\) \|\| editedMessage \|\| !received\?\.message\)/);
});

test('#2597 PENDING: send path stores Baileys status as-is (no local SERVER_ACK promotion)', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  const prepare = src.slice(src.indexOf('private prepareMessage'), src.indexOf('private async syncChatwootLostMessages'));
  assert.match(prepare, /status: status\[message\.status\]/);
  // Incoming (!fromMe) is forced to DELIVERED; outgoing is not.
  assert.match(prepare, /if \(!messageRaw\.status && message\.key\.fromMe === false\)/);
});

test('#2509 / #2658 disconnect: loggedOut after stream:error 515 reconnects within the grace window', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  assert.match(src, /STREAM_515_RECONNECT_GRACE_MS/);
  assert.match(src, /STREAM_ERROR_CODE_RECONNECT/);
  assert.match(src, /CB:stream:error/);
  assert.match(src, /statusCode === DisconnectReason\.loggedOut && recentStream515/);
});

test('#2618 Passkey: no passkey / webauthn handling in the Baileys channel', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  const lower = src.toLowerCase();
  assert.equal(lower.includes('passkey'), false);
  assert.equal(lower.includes('webauthn'), false);
});
