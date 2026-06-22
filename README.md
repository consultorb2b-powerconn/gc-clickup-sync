# gc-clickup-sync

Sincronização automática **GestãoClick → ClickUp**: a cada N minutos, busca as OS recentes no GestãoClick e cria um card no ClickUp para cada OS que ainda não existe lá.

Por que polling e não webhook: a API do GestãoClick **não expõe webhooks**, então não há como ela avisar quando uma OS é criada. O serviço consulta periodicamente (cron) uma janela de datas recente.

## Como funciona

1. A cada tick, calcula a janela `[hoje - LOOKBACK_DAYS, hoje]` e chama `GET /ordens_servicos` (paginado, respeitando ~3 req/s).
2. Para cada OS, decide a lista de destino pelo `centro_custo_id` (mapa configurável Avulso/CPFL/NEOENERGIA).
3. **Deduplicação:** consulta o ClickUp por um card cujo custom field **ID GestãoClick** seja igual ao `id` da OS. Se já existe, pula. Isso torna o sync idempotente e à prova de redeploy — não precisa de banco de dados próprio.
4. Se não existe, cria o card mapeando os campos (ver `src/mapper.ts`).

## Pré-requisitos no ClickUp (uma vez, manualmente)

A API até cria cards, mas **não cria a definição de custom fields**. Antes de rodar, crie na UI do ClickUp (idealmente Workspace-level) ao menos:

- **ID GestãoClick** (texto) — obrigatório, é a chave de dedup. Sem ele o serviço pula a OS e avisa no log.
- **Nº OS**, **Número de Série**, **Modelo**, **Defeitos Relatados pelo Cliente**, **Solução Aplicada**, **Laudo Técnico**, **Valor Total OS**, **Observações Internas** — opcionais; cada um que existir será preenchido, os demais são ignorados.

Os nomes precisam bater (sem diferenciar maiúsculas) com as chaves em `src/mapper.ts` → `fieldValuesFromOs`.

## Configuração

Copie `.env.example` para `.env` e preencha. Tokens **nunca** vão no código — só em variáveis de ambiente.

| Variável | Para que serve |
|---|---|
| `GC_ACCESS_TOKEN` / `GC_SECRET_TOKEN` | Credenciais da API GestãoClick |
| `CLICKUP_TOKEN` | Personal API token do ClickUp (`pk_...`) |
| `CLICKUP_LIST_AVULSO/CPFL/NEOENERGIA` | IDs das listas de OS |
| `GC_CENTRO_CUSTO_MAP` | Ex.: `1:CPFL,2:NEOENERGIA`; resto cai em Avulso |
| `SYNC_CRON` | Frequência (padrão `*/10 * * * *`) |
| `LOOKBACK_DAYS` | Janela de busca pra trás (padrão 3) |
| `INITIAL_STATUS` | Status do card novo (deve existir na lista) |

## Rodar local

```bash
npm install
cp .env.example .env   # preencha
npm run sync:once      # uma rodada, pra testar
npm run dev            # cron contínuo, com reload
```

## Deploy no Railway

1. Suba este diretório como um serviço novo.
2. Em Variables, cole as do `.env`.
3. Start command: `npm start`.
4. Como é um worker contínuo (cron interno), **não** precisa de porta HTTP exposta.

## Limites e cuidados

- GestãoClick: 3 req/s e 30.000 req/dia por empresa. O paginador já dá um respiro de 400ms entre páginas e faz backoff em 429.
- `LOOKBACK_DAYS` deve ser maior que o maior intervalo entre rodadas, para nenhuma OS escapar da janela. Como a dedup é por ID, reprocessar a mesma janela não duplica nada.
- O serviço só **cria** cards. Atualizações de status/edição posteriores (ClickUp como mestre do workflow) não são empurradas de volta ao GestãoClick — isso é um próximo passo separado.

## Próximos passos sugeridos

- Vincular `cliente_id` a um relationship em vez de só citar o nome no título.
- Mapear `produtos[]`/`servicos[]` para os campos de componentes/serviços e totais.
- Tabela de-para de status (GestãoClick ↔ ClickUp) se for sincronizar status.
