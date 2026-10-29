# Roteiro — o que ainda precisa de WhatsApp real (`2.4.0-paulosantana95`)

Nenhum QR foi gerado nesta etapa. Use este roteiro **depois** de publicar/rodar a imagem `2.4.0-paulosantana95` (ou a branch `release/2.4.0-paulosantana95`) com um número conectado.

Pré-requisitos:

- API no ar com licença ativa (seed local ou registro real). **Não** alterar o fluxo de licença.
- `AUTHENTICATION_API_KEY` (global) e o `token` da instância.
- Instância Baileys `WHATSAPP-BAILEYS` em `connectionState.state === "open"`.
- Segundo aparelho (ou WhatsApp Web) para **ver** o que chegou.

```bash
export BASE=http://127.0.0.1:8080
export GLOBAL=baseline-global-key-rc2
export INSTANCE=paulo-244
export TOKEN=<token-da-instancia>
export DEST=55XXXXXXXXXXX   # número destino, só dígitos
```

Conectar (só quando Paulo autorizar):

```bash
curl -s -H "apikey: $GLOBAL" -H 'Content-Type: application/json' \
  -d "{\"instanceName\":\"$INSTANCE\",\"integration\":\"WHATSAPP-BAILEYS\",\"qrcode\":true}" \
  "$BASE/instance/create"

curl -s -H "apikey: $TOKEN" "$BASE/instance/connect/$INSTANCE"
# Escanear o QR. curl -s -H "apikey: $TOKEN" "$BASE/instance/connectionState/$INSTANCE"
```

## 1. Isolamento (#2435 / #2549) — validar envio real

Já coberto em HTTP sem WhatsApp (query não sobrescreve o path). Com dois números `open`, confirmar que **não** envia pela instância B:

```bash
curl -s -D- -H "apikey: $TOKEN_A" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"text\":\"must-stay-on-A\"}" \
  "$BASE/message/sendText/$INSTANCE_A?instanceName=$INSTANCE_B"
```

Esperado agora: 201 (ou erro da instância A), mensagem sai **pelo número de A**. Falha se sair pelo número de B.

## 2. PIX no Android/iOS (PR #2742)

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

Verificar no **celular** (remetente e destinatário) e no WhatsApp Web: cartão PIX + copiar chave. Unitários só cobrem o payload (`order_details`, `payment_info`, `biz_bot`).

## 3. Catálogo / produtos (novo contrato)

Conta **Business** com produtos no catálogo. Pegue `productId` reais:

```bash
curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"limit\":10}" \
  "$BASE/business/getCatalog/$INSTANCE"
```

Esperado se falhar: HTTP 5xx com erro real (não `{ "isBusiness": false }`).

Envio de um produto — ver `docs/catalog-send.md`:

```bash
curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "number":"'"$DEST"'",
    "productId":"<id-do-getCatalog>",
    "title":"Produto teste",
    "description":"Descrição",
    "currencyCode":"BRL",
    "priceAmount1000":1990,
    "productImage":"https://<imagem-publica>.jpg",
    "body":"Confira"
  }' \
  "$BASE/message/sendProduct/$INSTANCE"
```

Lista / catálogo:

```bash
curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d '{
    "number":"'"$DEST"'",
    "title":"Catálogo teste",
    "description":"Produtos",
    "buttonText":"Ver produtos",
    "headerImage":"https://<imagem-publica>.jpg",
    "productIds":["<id-1>","<id-2>"]
  }' \
  "$BASE/message/sendCatalog/$INSTANCE"
```

No celular: card de produto e lista nativa de catálogo (não um menu `SINGLE_SELECT`). `sendProductList` é alias de `sendCatalog`.

## 4. sendText (#2583) e PENDING (#2597) — ainda abertos

```bash
curl -s -D- -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"text\":\"ping 2.4.0-paulosantana95\"}" \
  "$BASE/message/sendText/$INSTANCE"
```

Anotar HTTP, `status` no JSON (`PENDING`?), se chega em 30s, e `connectionState` logo depois. Nested `{textMessage:{text}}` deve continuar 400.

## 5. Link preview (#2762) — ainda aberto

```bash
curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"text\":\"test https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/\",\"linkPreview\":true}" \
  "$BASE/message/sendText/$INSTANCE"

curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"number\":\"$DEST\",\"text\":\"test https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/\",\"linkPreview\":false}" \
  "$BASE/message/sendText/$INSTANCE"
```

## 6. Webhook MESSAGES_UPSERT (#2647) e contextInfo (#2713)

```bash
curl -s -H "apikey: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"enabled":true,"url":"https://<coletor>","events":["MESSAGES_UPSERT","MESSAGES_UPDATE","CONNECTION_UPDATE"],"webhookByEvents":false}' \
  "$BASE/webhook/set/$INSTANCE"
```

No celular:

1. Texto simples → `messages.upsert`.
2. **Responder** (quote) a um texto → esperado agora: `messageType: "extendedTextMessage"` **com** `extendedTextMessage.contextInfo.stanzaId` / `quotedMessage` (e `contextInfo` de topo com a citação). Unitário cobre o flatten; o aparelho fecha o loop.
3. Responder com imagem → `contextInfo` no wrapper de mídia.
4. Com S3 ligado e `SAVE_VIDEO=false`, enviar um vídeo → webhook **deve** chegar (antes o `return` abortava o lote).
5. Deixar ligada por horas e repetir (#2647 também tinha causas intermitentes além do `return`).

## 7. Desconexões (#2658) e 515 (#2509)

Manter `open` e registrar `CONNECTION_UPDATE` + logs. Esperado após 515: reconectar na janela de 30s em vez de `loggedOut` permanente. Prova só com sessão longa / queda real.

## 8. Passkey (#2618) — ainda aberto

Só em conta que **obriga** Passkey no link de dispositivo.

## 9. CVE-2026-48063

Baileys agora é `7.0.0-rc13` (fora da faixa). Não explorar em produção. Confirmar só a versão na imagem: `node -p "require('/evolution/node_modules/baileys/package.json').version"` no container.

## 10. Imagem Docker

Não publicar da CI sem criar a tag. Quando Paulo autorizar:

```bash
git tag 2.4.0-paulosantana95
git push origin 2.4.0-paulosantana95
# workflow .github/workflows/publish-paulosantana95-ghcr.yml
# → ghcr.io/paulosantana95/evolution-api:2.4.0-paulosantana95
```
