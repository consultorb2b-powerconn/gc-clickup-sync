# HANDOFF — Integração GestãoClick → ClickUp (Powerconn / Repair Center)

> Documento para retomar o trabalho em um chat novo sem perder contexto.
> Última atualização: 2026-06-26. Usuário: Fernando (Powerconn, consultoria de utilities/energia).
> Idioma de trabalho: pt-BR.

---

## 1. O QUE É O PROJETO

Serviço **`gc-clickup-sync`** (Node/TypeScript) que sincroniza Ordens de Serviço (OS) do
**GestãoClick** para o **ClickUp**, no Repair Center (Centro de Reparos) da Powerconn.

- **Local:** `C:\Users\Fernando\Downloads\gc-clickup-sync\gc-clickup-sync`
- **GitHub:** `github.com/consultorb2b-powerconn/gc-clickup-sync` (branch `main`)
- **Roda via:** `npm run sync:once` (local) e **GitHub Actions** (`.github/workflows/sync.yml`)
- **Arquitetura:** polling (GestãoClick NÃO tem webhook) → GET de OS por janela de data →
  para cada OS: roteia por centro de custo → dedup pelo campo "ID GestãoClick" →
  cria card OU atualiza status + re-sync de campos.

---

## 2. ESTADO ATUAL (o que JÁ está feito e funcionando)

### Workspaces ClickUp
- **PWC** (antigo, free) — onde o conector MCP/API está autorizado. Tem o Space "8. Repair Center".
- **Powerconn BR** (novo, PAGO) — **workspace id `90132980166`**. É o ALVO da integração.
  ⚠️ Conector MCP/API **NÃO** autorizado aqui. Ações via UI só por **navegador (Claude in Chrome)**.
  O **token pessoal `pk_` do sync FUNCIONA** aqui. deviceId do navegador do Fernando:
  `0d7736ec-0d2a-4f62-bc71-c0a0aa7ed25e`.

### Estrutura no Powerconn BR
- Space **"8.REPAIR CENTER - ENTRADA"** → Pasta **"1. Operação (OS)"**
  - **OS – Avulso** → **list id `901327620288`** ← LISTA PRINCIPAL EM USO
  - OS – Contrato CPFL, OS – Contrato NEOENERGIA (roteamento DESLIGADO)

### Campos da OS – Avulso (custom fields, preenchidos pelo sync via API)
Texto: ID GestãoClick (chave de dedup), Nº OS, Cliente, Número de Série, Modelo do Equipamento,
Serviços Aplicados, Componentes Aplicados, **Técnico**, **Situação GestãoClick**, **Cód. Rastreio**.
Texto longo: Defeitos Relatados, Solução Aplicada, Laudo Técnico, Observações Internas, **Ficha Técnica**.
Dinheiro: Total Serviços, Total Produtos, Valor Total OS.
Data: Data de Recebimento, **Data de Saída**.
Texto (dd/mm/aaaa, leitura humana): **Data Recebimento (BR)**, **Data Saída (BR)**.

> Os campos em **negrito** foram adicionados na sessão de 2026-06-26 (ver seção 3).

### Status — 19 status personalizados (FEITO em 2026-06-26)
A lista OS – Avulso usa **status personalizados** (não herda mais do Space). 19 status do fluxo Avulso.
Os 3 base (TO DO/IN PROGRESS/COMPLETE) foram RENOMEADOS; os outros 16 criados. Ver seção 4.
⚠️ ClickUp limita nome de status a ~20 caracteres → vários nomes foram ENCURTADOS (ver tabela seção 4).

### Backfills — FEITOS
Vários backfills com `SYNC_SINCE=2026-01-01`: 1566 cards na OS – Avulso, todos os campos preenchidos,
status reposicionados pelo `situacao_id`. Última rodada de validação: `0 atualizadas, inalteradas` —
confirmou que o sync não reescreve mais nada à toa (ver seção 5, correções).

### Formulário de entrada — FEITO e PUBLICADO
View "Formulário" na OS – Avulso ("Entrada de Equipamento — Repair Center"). Cria card PENDENTE
com Cliente, Número de Série, Modelo, Defeitos + Anexos (fotos).

---

## 3. SESSÃO 2026-06-26 — O QUE FOI FEITO

### Fase 1 — campos novos (CONCLUÍDA)
A partir do JSON cru da OS (diag-os.ts), descobriu-se que a API entrega dados que não iam pro ClickUp:
- **Data de Saída** ← `os.data_saida` (campo Data) + **Data Saída (BR)** (texto dd/mm/aaaa).
- **Técnico** ← `os.nome_tecnico`.
- **Situação GestãoClick** ← `os.nome_situacao` (situação crua, ex. "FINALIZADO/ AVULSO").
- **Cód. Rastreio** ← atributo cujo nome contém "RASTREIO" (`os.atributos[]`).
- **Ficha Técnica** (texto longo) ← consolida `os.atributos[]` em "Descrição: conteúdo · …",
  pulando vazios, "EM BRANCO" e o rastreio (que tem campo próprio).

Helpers adicionados em `mapper.ts`: `formatGcDateBR`, `codRastreio`, `fichaTecnica`.
Tipo `GcAtributo` + campo `atributos` adicionados em `gestaoclick.ts`.

**NÃO é possível** (limitação da API, confirmado): "Previsão de entrega" não vem na API;
"Histórico" de mudanças de situação não existe na API (endpoints /historico dão 404).
A timeline que aparece na tela do GestãoClick é só da UI deles.

### Fase 2 — 19 status (CONCLUÍDA)
`statusMap.ts` reescrito: de-para `situacao_id → nome do status`. Ver tabela completa na seção 4.

### Correções de bug no sync (CONCLUÍDAS) — ver seção 5
1. Status comparado case-insensitive (ClickUp normaliza pra minúsculo).
2. Datas comparadas por DIA, não por ms exato (ClickUp desloca ~5h por fuso).
Essas duas correções acabaram com o bug histórico de "1 campo reescrito toda rodada" nos 1566 cards.

### Infra / git (CONCLUÍDO)
- `sync.yml`: `CLICKUP_LIST_AVULSO` corrigido para `901327620288` (estava na lista antiga no GitHub).
  CPFL/NEO restaurados para os ids corretos. Editado pela WEB (token local não tem escopo `workflow`).
- `cuFetch` (retry 429), `config.since` (SYNC_SINCE), limpeza de `src/files/` duplicados — commitados.
- ✅ **O cron do Actions está ATIVO:** `*/30 11-22 * * 1-5` — 30 em 30 min, 08h-19h Brasília
  (11-22 UTC), seg a sex. Fim de semana/madrugada não rodam. `workflow_dispatch` ativo (rodar manual).
  Backfills locais funcionam normal. Consumo estimado ~790 min/mês (de ~2000 grátis).

---

## 4. OS 19 STATUS E O DE-PARA (situacao_id → status)

### Nomes dos status no ClickUp (encurtados p/ caber no limite ~20 chars)
| # | Grupo ClickUp | Nome no ClickUp |
|---|---|---|
| 1 | Not started | Entrada e Pré-Análise |
| 2 | Not started | Pré-Análise Finalizada |
| 3 | Active | Análise – Montar O.S. |
| 4 | Active | Retornar T4/T5 |
| 5 | Active | Aguardando Aprovação |
| 6 | Active | Cobrar – Não Aprovado |
| 7 | Active | Cobrar – Sem Resposta |
| 8 | Active | Liberado para Retorno |
| 9 | Active | Retornado s/ Reparo |
| 10 | Active | Aprovado p/ Manutenção |
| 11 | Active | Aguardando Componentes |
| 12 | Active | Em Manutenção (Fila) |
| 13 | Active | Em Bancada (Semana) |
| 14 | Active | Em Teste Pré-Envio |
| 15 | Active | Serv. Fim – Ag. NF |
| 16 | Active | NF Retorno Autorizada |
| 17 | Active | Faturar Avulso |
| 18 | Active | Embalagem/Pré-Postagem |
| 19 | Closed | Finalizado / Enviado |

(Atenção: status 3, 6, 7, 15 usam EN-DASH "–", não hífen. Os nomes acima são os EXATOS do `statusMap.ts`.)

### De-para situacao_id → status (em statusMap.ts, SITUACAO_TO_STATUS)
| situacao_id | Situação GestãoClick | → Status |
|---|---|---|
| 6155342 | ENTRADA/ PRÉ ANALISE | Entrada e Pré-Análise |
| 9123792 | EM ANALISE | Análise – Montar O.S. |
| 9135850 | T5/ DESCONTINUADO | Retornar T4/T5 |
| 6341882 | T4- SEM MANUTENÇÃO | Retornar T4/T5 |
| 5810995 | EM APROVAÇÃO | Aguardando Aprovação |
| 6368825 | RETORNO/ NÃO APROVADO | Cobrar – Não Aprovado |
| 8518151 | RETORNO/ SEM APROVAÇÃO | Cobrar – Não Aprovado |
| 9123930 | FATURAR/ NÃO APROVADOS | Cobrar – Não Aprovado |
| 9123949 | FATURAR / RET. SEM RESPOSTA | Cobrar – Sem Resposta |
| 9123813 | APROVADO/ AG. MANUTENÇÃO | Aprovado p/ Manutenção |
| 6345313 | AGUARDANDO COMPONENTE | Aguardando Componentes |
| 5810996 | EM MANUTENÇÃO/ BANCADA | Em Manutenção (Fila) |
| 7183929 | TESTE / PRÉ ENVIO | Em Teste Pré-Envio |
| 9123852 | SERV. FINALIZADO / AG. NF RETORNO | Serv. Fim – Ag. NF |
| 9123854 | NF RET. / AUTORIZADO | NF Retorno Autorizada |
| 9123815 | FATURAR / AVULSO | Faturar Avulso |
| 8517728 | RETORNO SEM MANUTENÇÃO | Retornado s/ Reparo |
| 8138949 | RETORNO/ SEM AVARIAS | Retornado s/ Reparo |
| 9123911 | LIBERADO/ EMBALAGEM PRÉ POSTAGEM | Embalagem/Pré-Postagem |
| 7322770 | AGUARDANDO ENVIO | Embalagem/Pré-Postagem |
| 9123891 | FINALIZADO/ AVULSO | Finalizado / Enviado |

**SEM mapeamento (de propósito):** ENVIAR EMAIL (8910314), ATUALIZAÇÃO FW (5995833) — não têm
status equivalente. Situações de CONTRATO (FINALIZADO EM CONTRATO 7222674, FATURAR CONTRATO 9135852,
FINALIZADO EM GARANTIA 6162740, FINALIZADO SEM CUSTO 7215392) — ficam de fora do fluxo Avulso.
Situações sem mapeamento → o sync NÃO mexe no status do card (loga "situação não mapeada").

**Status sem fonte no sync (só manuais):** 2 (Pré-Análise Finalizada), 8 (Liberado para Retorno),
13 (Em Bancada). Existem no ClickUp mas nenhuma situação GC os alimenta.

---

## 5. CORREÇÕES DE BUG IMPORTANTES (sync.ts, função sameValue e comparação de status)

### Bug 1: status reescrito toda rodada (caixa)
ClickUp normaliza status pra minúsculo. A comparação `alvo !== existing.status` era sensível a caixa →
reescrevia sempre. Corrigido: `alvo.toLowerCase() !== existing.status.toLowerCase()`.

### Bug 2: campo de data reescrito toda rodada (fuso)
O sync grava data como meio-dia UTC (`parseGcDateMs`). O ClickUp devolve o timestamp deslocado ~5h
(meia-noite no fuso da conta). A comparação exata de ms nunca batia → reescrevia "data de recebimento"
e "data de saída" toda rodada (era o bug dos ~1566 cards do handoff antigo).
Corrigido no `sameValue`: para epoch ms (valores > 1e12), compara o DIA (`Math.floor(ms/86_400_000)`)
com tolerância de 1, em vez do ms exato.

Resultado: backfill de validação deu `0 atualizadas` — o sync só toca no que muda de verdade.

---

## 6. PRÓXIMOS PASSOS (backlog)

1. **Cron já ATIVO** (`*/30 11-22 * * 1-5` = 30 min, 08h-19h Brasília, seg-sex). Se quiser mudar
   cadência, editar o `sync.yml` PELA WEB (token local sem escopo `workflow`). Cron em UTC (Brasília=UTC-3).
   Ex.: hora em hora dia todo = `0 * * * *`; só comercial úteis = `*/30 11-22 * * 1-5` (atual).
2. **Geração de número de O.S** para entradas pelo formulário (Nº OS e ID GestãoClick vazios):
   - Opção A: passo no próprio sync que numera `OS #NNN`. Opção B: webhook Node/TS (Railway).
   - Padrão preferido: `OS #001` (3 dígitos). Fernando ainda não escolheu A/B.
3. **Separar OS de CONTRATO da lista Avulso** — OS com situação de contrato (ex. 6562-6573) caem
   na Avulso hoje e o sync as ignora (status mantido). Quando quiser, ativar roteamento por centro
   de custo (`GC_CENTRO_CUSTO_MAP`) e listas CPFL/NEO próprias.
4. **Emissão/impressão da OS** — discussão aberta: emitir do GestãoClick (A) ou gerar PDF do card (B).
5. **Segurança:** tokens apareceram em chats antigos — regenerar quando der (atualizar `.env` +
   GitHub Secrets). Regenerar o PAT do GitHub COM escopo `workflow` resolveria o bloqueio de push no sync.yml.
6. Limpeza de cards órfãos no PWC antigo (opcional).

---

## 7. ARQUIVOS DO PROJETO (src/)

- `config.ts` — env e flags. `sync.{lookbackDays, since (SYNC_SINCE), initialStatus, resyncFields}`.
- `gestaoclick.ts` — client GC. Tipo `GcOrdemServico` (com `data_entrada`, `data_saida`, `nome_tecnico`,
  `nome_situacao`, `atributos[]` etc.). Lista por janela `data_entrada`. **DETALHE /ordens_servicos/{id}
  espera o `id` interno (não o código)** — a LISTAGEM é o que o sync lê e traz tudo.
- `clickup.ts` — `cuFetch` (retry 429), `getListFields` (indexa por nome lowercase), `findTaskByGcId`
  (dedup, traz status + valores atuais), `createTask`, `updateTaskStatus`, `setTaskFieldValue`.
- `mapper.ts` — `routeListKey`, `buildCustomFields`, `buildTaskInput`, `buildDescription`,
  `fieldValuesFromOs`, `parseGcDateMs`, `formatGcDateBR`, `codRastreio`, `fichaTecnica`.
- `sync.ts` — `runOnce`. `sameValue` (trata número/dinheiro/data-por-dia). Comparação de status
  case-insensitive. Loga "situação não mapeada" quando aplicável.
- `statusMap.ts` — `STATUS_AVULSO` (19 nomes) + `SITUACAO_TO_STATUS` (de-para) + `statusForSituacao`.
- `index.ts` — entrypoint. `diag-os.ts` — diagnóstico (dump JSON cru + sondagem de endpoints).
  `situacoes.ts` — lista id→nome das situações do GestãoClick.

### Chaves do mapper (fieldValuesFromOs) → nome do campo no ClickUp (case-insensitive)
`id gestãoclick`, `nº os`, `cliente`, `número de série`, `modelo do equipamento`,
`defeitos relatados pelo cliente`, `solução aplicada`, `laudo técnico`, `serviços aplicados`,
`componentes aplicados`, `total serviços`, `total produtos`, `valor total os`, `observações internas`,
`data de recebimento` (← `data_entrada`), `data recebimento (br)`, `data de saída` (← `data_saida`),
`data saída (br)`, `técnico`, `situação gestãoclick`, `cód. rastreio`, `ficha técnica`.

---

## 8. CONFIG / ENV

### .env local (estado correto atual)
```
CLICKUP_LIST_AVULSO=901327620288
LOOKBACK_DAYS=3
(SEM SYNC_SINCE — só adicionar temporariamente para backfill, depois remover)
```

### GitHub Actions (.github/workflows/sync.yml)
- Secrets: `GC_ACCESS_TOKEN`, `GC_SECRET_TOKEN`, `CLICKUP_TOKEN` (referenciados via `${{ secrets.X }}`,
  nunca em texto no arquivo — isso é o correto).
- `CLICKUP_LIST_AVULSO: "901327620288"` (corrigido). CPFL `901714621079`, NEO `901714621083`.
- **cron ATIVO:** `*/30 11-22 * * 1-5` (30 min, 08h-19h Brasília, seg-sex). `workflow_dispatch` ativo.
- Editar o sync.yml só PELA WEB (token local sem escopo `workflow`). **NUNCA** `SYNC_SINCE` no workflow.

---

## 9. ARMADILHAS RECORRENTES (PowerShell / ambiente)

- Fernando às vezes cola conteúdo de arquivo no terminal por engano → dar blocos que ESCREVEM o arquivo
  (`[System.IO.File]::WriteAllLines(...)`), não pedir edição manual.
- O terminal às vezes está em `C:\Windows\system32` em vez da pasta do projeto → sempre `cd` primeiro.
- `npx tsx src/x.ts` "solto" não carrega o .env → usar `--env-file=.env`. `npm run sync:once` carrega.
- Sandbox do Claude NÃO acessa `api.gestaoclick.com` nem `api.clickup.com` — testes reais na máquina do Fernando.
- Powerconn BR só pelo navegador (MCP bloqueado). Limite de nome de status no ClickUp: ~20 chars.
- Push que altera `.github/workflows/` é REJEITADO (token sem escopo `workflow`) → editar pela web.

---

## 10. COMO RETOMAR NO CHAT NOVO

1. Ler este documento.
2. Estado: Fase 1 (campos novos) e Fase 2 (19 status) CONCLUÍDAS. Bugs de fuso/caixa CORRIGIDOS.
   Sync valida com `0 atualizadas` quando nada muda. Cron do Actions ATIVO (30 min, comercial úteis).
3. Próximo provável: geração de número de O.S (item 2), OU separar OS de contrato (item 3),
   OU automações ClickUp de responsável/prateleira do blueprint.
4. Estilo: passos em PowerShell que escrevem arquivos, entregar .ts via arquivo pra commitar, pt-BR, direto.
