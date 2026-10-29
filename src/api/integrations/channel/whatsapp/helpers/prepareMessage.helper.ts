import { getContentType, proto } from 'baileys';

/**
 * Quote / mention metadata lives on the content node (`extendedTextMessage.contextInfo`,
 * `imageMessage.contextInfo`, …). `messageContextInfo` is a different protobuf
 * (messageSecret / threadId) and must not replace the quote.
 */
export function pickQuoteContextInfo(message: proto.IMessage | null | undefined): proto.IContextInfo | undefined {
  if (!message) {
    return undefined;
  }

  const type = getContentType(message);
  const content = type ? (message as Record<string, any>)[type] : undefined;
  return (content?.contextInfo as proto.IContextInfo | undefined) ?? undefined;
}

/**
 * Flatten plain `extendedTextMessage` (no quote/mentions) to `conversation`.
 * Text replies keep the wrapper so `contextInfo` (stanzaId / quotedMessage) survives.
 */
export function flattenPlainExtendedText(messageRaw: { messageType?: string; message?: Record<string, any> }): void {
  const extended = messageRaw?.message?.extendedTextMessage;
  if (!extended) {
    return;
  }

  if (extended.contextInfo) {
    return;
  }

  messageRaw.messageType = 'conversation';
  messageRaw.message.conversation = extended.text;
  delete messageRaw.message.extendedTextMessage;
}
