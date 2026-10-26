# Relatório de baseline — Evolution API 2.4.0-rc2

**Etapa:** só investigação e testes. Nenhuma correção de produção.  
**Fork:** `paulosantana95/evolution-api`  
**Base publicada:** `base/2.4.0-rc2` → `5624bdaea81c58e4db60fe2a3a8de7c48bba1e60` (tag `2.4.0-rc2`)  
**Branch deste PR:** `test/baseline-2.4.0-rc2`  
**Data:** 2026-10-26

Resultados de qualidade já medidos nesta VM (ver `docs/baseline/quality-results.json`):

| Passo | Resultado |
|---|---|
| `npm run lint:check` | **passou** (exit 0) |
| `npx tsc --noEmit` | **passou** (exit 0) |
| `npm run build` (`tsc` + tsup) | **passou** (exit 0, ~5.8s) |
| `npm run test:baseline` | **39/39 passaram** |
| Suíte `test/all.test.ts` pré-existente | **não existia** (pasta `test/` vazia e no `.gitignore` da rc2) |
| `npm run db:generate` + `db:deploy` | **passou** (Postgres 16, inclusive `RuntimeConfig`) |
| Imagem Docker do repo | **não buildada** — Docker não está instalado nesta VM |
| HTTP smoke (503 + isolamento) | ver `docs/baseline/http-smoke-*.json` após `run-baseline.sh` |

## Passo 0 — git

- Remote `upstream` = `https://github.com/evolution-foundation/evolution-api.git`
- Tag `2.4.0-rc2` buscada do upstream e publicada no fork
- Branch `base/2.4.0-rc2` aponta exatamente para `5624bdae`
- Branch `test/baseline-2.4.0-rc2` parte dessa base e só adiciona teste/docs/scripts

## Ambiente desta VM

| Item | Situação |
|---|---|
| Docker | **Não instalado.** Imagem Docker do repo **não foi buildada**. |
| Node | v22.23.4 / npm 10.9.9 |
| Postgres | 16.15 em `127.0.0.1:5432` (usuário/db `evolution` / `evolution_db`) |
| Redis | 7.0.15 em `127.0.0.1:6379` (PONG) |
| WhatsApp real | **Não conectado** (proibido nesta etapa) |
| Servidor de licença real | Não controlamos. Testes usam seed local + unitários do gate. |

Compose de referência (não executado aqui): `docker-compose.baseline.yml`.

## O que o runner executa

`scripts/baseline/run-baseline.sh`:

1. `npm run lint:check`
2. `npx tsc --noEmit`
3. `npm run build`
4. `npm run test:baseline` (unitários em `test/baseline`)
5. HTTP smoke **sem** licença (espera 503 LICENSE_REQUIRED)
6. HTTP smoke **com** seed local (cria 2 instâncias, reproduz #2435)

## Licença

Ver `docs/baseline/license-flow.md`. Resumo: sem `RuntimeConfig.api_key` a API de negócio fica em 503; `AUTHENTICATION_API_KEY` **não** basta (é tentada em `/v1/activate` no host hardcoded `license.evolutionfoundation.com.br`). Seed local ativa sem o servidor real.

## Itens a–e

### a. Isolamento entre instâncias (#2435 / PR #2549)

**Reproduzido em código e (quando o HTTP smoke ativo roda) via API.**

- `auth.guard` autentica só `req.params.instanceName`.
- `dataValidate` faz `Object.assign(instance, request.query)` **depois**.
- `GET /instance/connectionState/A?instanceName=B` com o token de A deve devolver B.

Hipótese de causa: CWE-639, exatamente o relato do issue. O fix do develop (`sanitizeUntrustedInput`, commit `7a55a2bf`) **não** está na rc2.

### b. Baileys / CVE-2026-48063 (#2686 / PR #2575)

**Reproduzido por inspeção de dependência.**

- `package.json` e `node_modules/baileys`: **7.0.0-rc.9**
- Faixa vulnerável declarada no issue: `>= 7.0.0-rc.1, < 7.0.0-rc.12`
- rc.9 está **dentro** da faixa (CVE-2026-48063 / GHSA-qvv5-jq5g-4cgg)
- `messages.upsert` aceita `requestId` e não descarta o evento
- Patch `patches/baileys+7.0.0-rc.6.patch` é aplicado em cima da rc.9 (warning do patch-package)
- develop já está em **7.0.0-rc13** via #2575, junto com Prisma 7 / Express 5 (arriscado)

Impacto de subir só a Baileys: ver `docs/baseline/cherry-picks.md`. Não aplicado.

### c. Envio de catálogo (relato Paulo)

**Não reproduzido ponta a ponta** — exige conta Business + socket WhatsApp.

O que a rc2 tem hoje:

- Só leitura: `POST /business/getCatalog/:instance` e `getCollections`
- **Não existe** `sendCatalog` / `sendProduct`
- `fetchCatalog` engole o erro e devolve `{ isBusiness: false }` — o cliente vê “não é business” em vez da falha real
- `patchMessageBeforeSending` reescreve `PRODUCT_LIST` → `SINGLE_SELECT` — hipótese forte se o “envio” for uma lista de produtos

Hipótese: ou o Paulo está chamando um endpoint que não existe, ou o getCatalog falha silenciosamente, ou o PRODUCT_LIST é destruído no send. Precisa do payload real dele + número Business. Roteiro: `docs/baseline/roteiro-whatsapp-real.md`.

### d. Envio de Pix (relato Paulo / PR #2742)

**Reproduzido em código; renderização mobile não testada** (precisa de aparelho).

A rc2 monta o botão `payment_info` e manda `buildInteractiveBizNode()` (`native_flow` name=`mixed`) + `messageParamsJson: { from: 'api', templateId }`. Faltam, segundo o PR #2742 (ainda OPEN):

- `messageParamsJson: { native_flow_name: 'order_details', version: 1 }` e `messageVersion: 1`
- `messageContextInfo.messageSecret`
- nó `<biz>` com `native_flow name=payment_info`
- `<bot biz_bot="1"/>` em 1:1
- `title` como body do cartão

Hipótese: a mensagem é relayada e o Web desenha o cartão; Android/iOS ignoram o native flow `mixed` e mostram vazio. Coerente com a tabela de teste do #2742.

### e. Bugs reportados na rc2

| Issue | Reproduzido aqui? | Hipótese (sem corrigir) |
|---|---|---|
| #2597 PENDING eterno | Não (precisa WA). Código: `prepareMessage` grava `status[message.status]` e não promove outbound. | Status fica PENDING se o ack não chegar; pode acoplar a 515/logout (#2509) ou `@lid`. |
| #2647 MESSAGES_UPSERT some | Parcial, por leitura. | `return` cedo no bloco S3/vídeo **antes** de `sendDataWebhook`; filtro `type !== notify\|append`; processor RxJS `EMPTY` após 3 retries. Intermitência longa exige número real. |
| #2658 desconexões rc2 | Não (precisa WA). | Close handler trata `DisconnectReason.loggedOut` como terminal. #2509 (pós-rc2) descreve 401 fantasma após 515. Candidato a cherry-pick. |
| #2583 sendText 500 `textMessage` | Schema reproduzido: `{text}` é válido; `{textMessage:{text}}` é 400. O 500 `undefined.textMessage` **não** aparece no TS da Evolution — hipótese: estado do socket / proto interno do Baileys após o pairing, não o DTO. | Precisa de instância `open`. |
| #2713 perda de contextInfo | **Reproduzido em unitário.** | `prepareMessage` copia `message.messageContextInfo` (secret/thread) e **apaga** `extendedTextMessage` (onde está o quote). |
| #2762 link preview | Parcial. | `linkPreview` default ligado; falha de `generateLinkPreview` retorna `undefined` e o send segue com contexto parcial — relato diz que a mensagem nem chega. Precisa WA. |
| #2618 Passkey | Não. | Zero menção a passkey/webauthn no channel Baileys. Só reproduz em conta que obriga Passkey. |

## Versão da Baileys

**7.0.0-rc.9** (declarada e instalada). Vulnerável a CVE-2026-48063.

## Cherry-picks

Ver `docs/baseline/cherry-picks.md`.

Prioridade para a imagem `2.4.0-paulosantana95`:

1. `#2549` isolamento  
2. `#2509` 515/logout  
3. PR `#2742` PIX (ainda não mergeado)  
4. bump **só** Baileys → rc13 (não levar Prisma 7 / Express 5)

## WhatsApp real

Roteiro passo a passo: `docs/baseline/roteiro-whatsapp-real.md`.

## Como rerodar

```bash
export DATABASE_PROVIDER=postgresql
export DATABASE_CONNECTION_URI='postgresql://evolution:evolution@127.0.0.1:5432/evolution_db?schema=evolution_api'
bash scripts/baseline/run-baseline.sh
```
