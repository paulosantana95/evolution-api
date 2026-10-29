import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validate } from 'jsonschema';

import { textMessageSchema } from '../../src/validate/message.schema';

/**
 * Replica of BaileysStartupService.prepareMessage flattening
 * (whatsapp.baileys.service.ts ~5209-5226). Kept in the test so we can
 * reproduce #2713 without instantiating the 5k-line service.
 */
function flattenLikePrepareMessage(messageRaw: any): any {
  if (messageRaw.message.extendedTextMessage) {
    messageRaw.messageType = 'conversation';
    messageRaw.message.conversation = messageRaw.message.extendedTextMessage.text;
    delete messageRaw.message.extendedTextMessage;
  }
  const quotedMessage = messageRaw?.contextInfo?.quotedMessage;
  if (quotedMessage) {
    if (quotedMessage.extendedTextMessage) {
      quotedMessage.conversation = quotedMessage.extendedTextMessage.text;
      delete quotedMessage.extendedTextMessage;
    }
  }
  return messageRaw;
}

test('#2713 contextInfo: prepareMessage assigns messageContextInfo (not quote contextInfo)', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  assert.match(src, /contextInfo: this\.deserializeMessageBuffers\(message\.message\?\.messageContextInfo\)/);
  assert.match(src, /if \(messageRaw\.message\.extendedTextMessage\) \{/);
  assert.match(src, /delete messageRaw\.message\.extendedTextMessage/);
});

test('#2713 contextInfo: flattening a text reply destroys stanzaId/quotedMessage', () => {
  const inbound = {
    messageType: 'extendedTextMessage',
    message: {
      messageContextInfo: { threadId: [], messageSecret: { 0: 1 } },
      extendedTextMessage: {
        text: 'Teste',
        contextInfo: {
          stanzaId: 'ORIG-MSG-ID',
          participant: '5562...@s.whatsapp.net',
          quotedMessage: { conversation: 'original' },
        },
      },
    },
    contextInfo: { threadId: [], messageSecret: { 0: 1 } },
  };

  const out = flattenLikePrepareMessage(structuredClone(inbound));
  assert.equal(out.messageType, 'conversation');
  assert.equal(out.message.conversation, 'Teste');
  assert.equal(out.message.extendedTextMessage, undefined);
  // Quote relationship is gone from message.*; only the (wrong) top-level
  // contextInfo — messageSecret/threadId — remains.
  assert.equal(out.contextInfo.stanzaId, undefined);
  assert.equal(out.contextInfo.quotedMessage, undefined);
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

test('#2647 MESSAGES_UPSERT: early `return` inside media/S3 block skips the webhook', () => {
  const src = readFileSync('src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts', 'utf8');
  const upsert = src.slice(src.indexOf("'messages.upsert':"), src.indexOf('this.sendDataWebhook(Events.MESSAGES_UPSERT'));
  assert.match(upsert, /if \(isVideo && !this\.configService\.get<S3>\('S3'\)\.SAVE_VIDEO\)/);
  assert.match(upsert, /return;/);
  assert.match(upsert, /No valid media to upload \(messageContextInfo only\), skipping MinIO/);
  // The webhook call is AFTER these returns, so they abort emission.
  const webhookIndex = src.indexOf('this.sendDataWebhook(Events.MESSAGES_UPSERT, messageRaw)');
  const firstReturnInMedia = src.indexOf("this.logger.warn('Video upload is disabled. Skipping video upload.')");
  assert.ok(firstReturnInMedia > 0 && firstReturnInMedia < webhookIndex);
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
