# Commits de `upstream/develop` depois de `2.4.0-rc2`

Comparação: `git log 2.4.0-rc2..upstream/develop`  
Tag `2.4.0-rc2` = `5624bdaea81c58e4db60fe2a3a8de7c48bba1e60`  
`upstream/develop` à época desta investigação: `e273b904` (19 commits).

## Candidatos bons para a 2.4.0-paulosantana95

Cherry-picks pontuais, baixo acoplamento com a stack (Prisma 6 / Express 4) da rc2.

| Commit | PR | Título | Por quê |
|---|---|---|---|
| `7a55a2bf` | #2549 | security: prevent cross-instance auth bypass via query/body override | Corrige #2435. Diff pequeno em `abstract.router.ts`. **Prioridade máxima.** |
| `1d38d4f6` | #2509 | fix(baileys): prevent healthy instances from being killed after stream:error 515 | Candidato direto para #2658 / PENDING se a causa for logout falso. Isolado no close handler. |
| `6d696f32` | #2514 | fix(meta): handle message_echoes and guard missing contact fields | Só Cloud API / Meta. Seguro se Paulo usar Business. |
| `d6caf9b4` | #2460 | fix(channel): remove duplicated pushName alias and prefer Contact.pushName | Baixo risco, fetchChats. |
| `e57bb365` | #2483 | feat(chat): add fetchLid endpoint for PN to LID resolution | Feature pequena. Útil com JIDs `@lid` (contexto de #2597/#2713). Não é fix dos bugs rc2. |

**Não está em develop (ainda):** PR **#2742** (PIX Android/iOS) — OPEN, não mergeado. É o melhor candidato para o Pix do Paulo, mas é cherry-pick do PR, não de develop.

Também **não está em develop:** correções de #2583, #2647, #2713, #2762, #2618 — não há commit pós-rc2 que as resolva.

## Arriscados / não cherry-pickar “no atacado”

| Commit | PR | Título | Risco |
|---|---|---|---|
| `dd552c77` | #2575 | chore(deps): Baileys rc13, Prisma 7, Express 5, ESLint 10, Redis 6, TS 6 | **Não cherry-pickar inteiro.** Prisma 7 (generator `prisma-client` + adapter) e Express 5 (path-to-regexp v8) são migração de plataforma. O pedaço útil é só o bump `baileys` 7.0.0-rc.9 → **7.0.0-rc13** (CVE-2026-48063) + remoção de `patches/baileys+7.0.0-rc.6.patch`. Fazer isso como bump isolado, medindo `tsc`/`sendButtons`/`additionalNodes`. |
| `7db484e3` | (follow-up) | fix(build): corrige compilação do develop quebrada pelo upgrade | Só faz sentido **depois** de #2575. |
| `f7429979` + `9095da7e` + `489febfa` + `63797722` + `1230663f` + `49bbdfe8` + merges #2635/#2636 | #2577 / EVO-2098 | canal EvoHub (proxy Meta Cloud) | Feature nova, schema/rotas/CI. Fora do objetivo da imagem `2.4.0-paulosantana95` salvo se Paulo precisar do hub. |
| `00f8f134` | #2635 | ci(quality): set DATABASE_CONNECTION_URI | Só CI. |
| `7fde2fba` / `e273b904` | #2640 | restore `patches/` no Docker build | Só é necessário se o Dockerfile ainda copiar `./patches` **e** o patch rc.6 continuar existindo. Depois do bump rc13 o patch some — este commit vira irrelevante ou conflitante. |

## Ordem sugerida (próxima etapa, não esta)

1. Cherry-pick `7a55a2bf` (#2549) — isolamento.
2. Cherry-pick `1d38d4f6` (#2509) — 515/logout.
3. Aplicar o diff do PR #2742 — PIX mobile.
4. Bump **somente** `baileys` para `>= 7.0.0-rc.12` (ideal rc13) + dropar o patch rc.6; **não** levar Prisma 7 / Express 5.
5. Correções locais (ainda inexistentes no develop) para flatten de `contextInfo`, link preview, early-return do webhook, catálogo.

Impacto estimado de subir só a Baileys (sem aplicar agora): o #2575 afirma que `additionalNodes` em `relayMessage` ficou igual e que `tsc --noEmit` + tsup passaram no develop **já com** os outros majors. Isolar o bump na rc2 (Prisma 6 / Express 4 / TS 5) pode revelar quebras de tipo em `WASocket`, `proto`, `isPnUser`, `getCatalog`. O patch `baileys+7.0.0-rc.6.patch` (waveform PTT) é aplicado hoje em cima da rc.9 com warning — na rc13 o #2575 remove o patch porque o upstream absorveu o fix. Sem o bump, deixar o patch como está.
