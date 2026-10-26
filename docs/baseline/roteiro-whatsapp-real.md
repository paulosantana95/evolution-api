# Roteiro — testes que exigem número WhatsApp real

Nesta etapa **nenhum QR foi gerado e nenhum número foi conectado**. Abaixo está o roteiro para quando Paulo conectar um (ou dois) números na imagem `2.4.0-rc2`.

Pré-requisitos comuns:

- API no ar com licença ativa (seed local ou registro real).
- `AUTHENTICATION_API_KEY` (global) e o `token` da instância.
- Instância Baileys em `connectionState.state === "open"`.
- Segundo aparelho (ou WhatsApp Web) para **ver** o que chegou — a API sozinha não prova renderização.

```bash
export BASE=http://127.0.0.1:8080
export GLOBAL=baseline-global-key-rc2
export INSTANCE=paulo-rc2
export TOKEN=<token-da-instancia>
export DEST=55XXXXXXXXXXX   # número destino, só dígitos
```

Conectar (só quando Paulo autorizar):

```bash
curl -s -H "apikey: $GLOBAL" -H 'Content-Type: application/json' \
  -d "{\"instanceName\":\"$INSTANCE\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":true}" \
  "$BASE/instance/create"

curl -s -H "apikey: $TOKEN" "$BASE/instance/connect/$INSTANCE"
# Escanear o QR retornado. NÃO fazer isso nesta etapa de baseline.
curl -s -H "apikey: $TOKEN" "$BASE/instance/connectionState/$INSTANCE"
```

## 1. Isolamento entre instâncias (#2435) — parcialmente coberta sem WA

Já reproduzido via `GET /instance/connectionState/A?instanceName=B`. Com WhatsApp real, confirmar que o bypass também **envia** pela instância B:

```bash
# token da instância A, path A, query B
curl -s -D- -H "apikey: $TOKEN_A" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"text\":\"bypass-from-A-via-B\"}" \
  "$BASE/message/sendText/$INSTANCE_A?instanceName=$INSTANCE_B"
```

Esperado na rc2: 201 e a mensagem sai pelo número da instância B.  
Esperado após o cherry-pick de #2549: 201 ainda na instância A (query ignorada) ou 4xx.

## 2. PIX no Android/iOS (relato Paulo / PR #2742)

```bash
curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "number":"'"$DEST"'",
    "title":"Pagamento teste",
    "buttons":[{
      "type":"pix",
      "currency":"BRL",
      "name":"Loja Paulo",
      "keyType":"random",
      "key":"<chave-pix-evp>"
    }]
  }' \
  "$BASE/message/sendButtons/$INSTANCE"
```

Verificar **no celular** (remetente e destinatário) e no WhatsApp Web:

| Cliente | rc2 esperada | PR #2742 |
|---|---|---|
| WhatsApp Web | cartão PIX aparece | cartão PIX aparece |
| Android / iOS | mensagem chega vazia / sem cartão | cartão + copiar chave |

Sem o aparelho não há como fechar este item.

## 3. Catálogo / produtos (relato Paulo)

Não existe `POST /message/sendCatalog`. O que a rc2 expõe:

```bash
# Somente LEITURA do catálogo Business do JID informado (precisa conta Business + socket open)
curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"limit\":10}" \
  "$BASE/business/getCatalog/$INSTANCE"

curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"limit\":10}" \
  "$BASE/business/getCollections/$INSTANCE"
```

Para **envio** de lista de produtos, a rc2 não tem endpoint. Se o Manager/integração montar um `listMessage` com `listType = PRODUCT_LIST`, `patchMessageBeforeSending` reescreve para `SINGLE_SELECT` — confirmar no aparelho se o catálogo chega como lista comum ou some.

Pedir ao Paulo o payload exato que ele usa (Manager, n8n, curl) antes de tratar como bug de `getCatalog`.

## 4. sendText 500 (#2583) e PENDING eterno (#2597)

```bash
curl -s -D- -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"text\":\"ping rc2\"}" \
  "$BASE/message/sendText/$INSTANCE"
```

Anotar: HTTP, `status` no JSON (`PENDING`?), se a mensagem aparece no destino em 30s, e `GET /instance/connectionState/$INSTANCE` imediatamente depois (o relato #2583 perde o campo `state`).

Repetir com o formato antigo (deve 400 na rc2):

```bash
curl -s -D- -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"textMessage\":{\"text\":\"ping\"}}" \
  "$BASE/message/sendText/$INSTANCE"
```

## 5. Link preview não entrega (#2762)

Duas chamadas idênticas, só muda `linkPreview`:

```bash
curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"text\":\"test https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/\",\"linkPreview\":true}" \
  "$BASE/message/sendText/$INSTANCE"

curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"text\":\"test https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/\",\"linkPreview\":false}" \
  "$BASE/message/sendText/$INSTANCE"
```

Esperado no relato: as duas respondem `PENDING`; só a segunda chega no celular.

## 6. Webhook MESSAGES_UPSERT (#2647) e contextInfo em respostas (#2713)

Configurar webhook da instância para um coletor (webhook.site / httpbin / n8n):

```bash
curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"enabled":true,"url":"https://<coletor>","events":["MESSAGES_UPSERT","MESSAGES_UPDATE","CONNECTION_UPDATE"],"webhookByEvents":false}' \
  "$BASE/webhook/set/$INSTANCE"
```

No celular, na conversa da instância:

1. Enviar texto simples → deve chegar `event: messages.upsert` com `message.conversation`.
2. **Responder** (quote) a uma mensagem de texto → o payload da rc2 deve vir `messageType: "conversation"` **sem** `extendedTextMessage.contextInfo` (stanzaId/quotedMessage). Anotar o JSON.
3. Responder com imagem → `contextInfo` tende a sobreviver (relato #2713).
4. Deixar a instância ligada por horas/dias e repetir (o #2647 é intermitente após runtime longo).

## 7. Desconexões (#2658) e 515 (#2509)

Manter a instância `open` e registrar `CONNECTION_UPDATE` + logs `Connection closed, evaluating reconnection` / `statusCode`. Procurar sequência `stream:error 515` → `open` → `401 loggedOut` → instância morta.

## 8. Passkey (#2618)

Só reproduz em conta WhatsApp que **obriga** Passkey no link de dispositivo. Escanear QR e observar se o fluxo para (novo QR) sem prompt de Passkey. Contas sem Passkey não servem.

## 9. CVE-2026-48063 (Baileys 7.0.0-rc.9)

Não tentar explorar em produção. A suíte só constata a versão e que `messages.upsert` aceita `requestId` sem descartar. Qualquer prova de injeção exige número real **e** um peer malicioso — fora do escopo desta etapa.
