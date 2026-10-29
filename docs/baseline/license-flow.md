# Fluxo de licença obrigatória (2.4.0-rc2)

Investigação apenas — nenhum código de produção foi alterado.

## O que bloqueia a API

No boot (`src/main.ts`):

1. Prisma conecta.
2. `setDB(prisma)` + `initializeRuntime({ tier: 'evolution-api', version, globalApiKey })`.
3. `app.use('/license', buildLicenseRouter(rc))` — rotas públicas.
4. `app.use(gateMiddleware(rc))` — **antes** do router de negócio.
5. `startHeartbeat(rc)` a cada 30 minutos.

`gateMiddleware` devolve **HTTP 503** com `code: "LICENSE_REQUIRED"` para qualquer path que não esteja na allowlist, enquanto `validateContext(rc)` for falso.

Allowlist (passam sem licença):

| Path | Motivo |
|---|---|
| `/`, `/health`, `/server/ok`, `/favicon.ico` | health / landing |
| `/license/status`, `/license/register`, `/license/activate` | fluxo de ativação |
| `/manager`, `/manager/*` | UI do manager |
| `/assets/*`, `/store/*`, arquivos estáticos (`svg/css/js/png/ico/woff/ttf/map`) | UI |
| `/ws` | websocket |

Tudo o mais (`/instance/*`, `/message/*`, `/chat/*`, `/business/*`, …) é bloqueado.

## Como a runtime fica ativa

`initializeRuntime` (nessa ordem):

1. Carrega ou cria `RuntimeConfig.instance_id` (UUID baseado em hostname+MAC). Se a tabela não existir (P2021) o processo **encerra**.
2. Se já existe `RuntimeConfig.api_key` → **ativa localmente** mesmo com o servidor de licença fora. `POST /v1/activate` é fire-and-forget.
3. Senão, se `AUTHENTICATION_API_KEY` estiver setada → tenta usá-la como `api_key` em `POST /v1/activate`. Falha (quase sempre, se for só a chave global da API) cai no banner de registro e permanece inativa.
4. Senão, se `EVOLUTION_OPERATOR_EMAIL` estiver setada → `POST /v1/register/auto` (unsigned). 404/403/409 ou erro de rede → fluxo manual.
5. Senão → inativa + banner no log.

O endpoint do servidor de licença é **somente de build** (`src/licensing/endpoint.ts` + `tsup.config.ts` `define`). Não existe env var de runtime. Em dev o fallback monta `https://license.evolutionfoundation.com.br`.

Assinatura das rotas autenticadas no servidor de licença: header `X-Api-Key` + `X-Signature = HMAC-SHA256(body, apiKey)`.

Heartbeat: `POST /v1/heartbeat` a cada 30 min com `instance_id`, `uptime_seconds`, `version` e, se houver, `telemetry_bundle.messages_sent/recv`. Falha **não** desativa o serviço. No shutdown: `POST /v1/deactivate` (best-effort).

## Como testar sem servidor de licença real

**Não dá** para apontar o processo para um mock via env — a URL é hardcoded.

Formas válidas nesta baseline:

1. **Seed local (recomendado para a suíte HTTP)**  
   Inserir `RuntimeConfig` com `key=api_key` (qualquer string não vazia). O boot ativa localmente e ignora falha do `/v1/activate`.  
   Script: `node scripts/baseline/seed-local-license.mjs`

2. **Testes de unidade do middleware**  
   `test/baseline/license.gate.test.ts` instancia `RuntimeContext` + `gateMiddleware` sem Prisma e sem rede.

3. **Mock HTTP do contrato `/v1/register/auto`**  
   O mesmo arquivo sobe um `http.createServer` local só para documentar o payload (email, tier, version, instance_id). Não substitui o endpoint embutido.

4. **O que NÃO funciona**  
   `LICENSE_ENDPOINT=...`, `EVOLUTION_LICENSE_URL=...` ou similar — não são lidos.  
   `AUTHENTICATION_API_KEY` sozinha **não** libera a API: ela é enviada a `/v1/activate` e, se o servidor real recusar, o gate continua em 503.
