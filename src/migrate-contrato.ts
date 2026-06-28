/**
 * migrate-contrato.ts — migração dos cards de contrato que vivem na lista Avulso.
 *
 * Estratégia (segura e reversível):
 *   1) Indexa TODOS os cards da Avulso uma vez (paginado), montando gcId -> card.
 *   2) Identifica as OS de contrato (routeContrato != "avulso") na janela.
 *   3) Cruza com o índice (em memória, instantâneo).
 *   4) DRY-RUN (padrão): só relata quantos/quais seriam migrados (CPFL vs NEO).
 *   5) APPLY (MIGRATE_APPLY=true): ARQUIVA o card na Avulso (reversível).
 *
 * Depois de aplicar, rode o backfill normal:
 *     $env:SYNC_SINCE="2026-01-01"; npm run sync:once; Remove-Item Env:\SYNC_SINCE
 *   O backfill recria os cards nas listas CPFL/NEO (a guarda anti-duplicata
 *   não enxerga cards arquivados, então cria frescos na lista certa, com o
 *   status de contrato correto).
 *
 * Uso:
 *   npx tsx --env-file=.env src/migrate-contrato.ts                       # dry-run
 *   $env:MIGRATE_APPLY="true"; npx tsx --env-file=.env src/migrate-contrato.ts   # aplica
 *
 * Env opcionais:
 *   MIGRATE_SINCE=2026-01-01   janela inicial (padrão 2026-01-01)
 *   MIGRATE_LIMIT=0            limita nº de arquivamentos no APPLY (0 = sem limite)
 */

import { listOrdensServicos } from "./gestaoclick.js";
import { routeContrato } from "./contrato.js";

const CU_BASE = "https://api.clickup.com/api/v2";
const TOKEN = process.env.CLICKUP_TOKEN ?? "";
const AVULSO_LIST_ID = process.env.CLICKUP_LIST_AVULSO ?? "901327620288";
const ID_FIELD_NAME = "id gestãoclick";

const SINCE = process.env.MIGRATE_SINCE ?? "2026-01-01";
const APPLY = process.env.MIGRATE_APPLY === "true";
const LIMIT = Number(process.env.MIGRATE_LIMIT ?? "0") || 0;

function headers() {
  return { Authorization: TOKEN, "Content-Type": "application/json" };
}

/** fetch com retry para 429 (rate limit do ClickUp). */
async function cuFetch(url: string, init?: RequestInit, tentativas = 6): Promise<Response> {
  for (let i = 0; i < tentativas; i++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    const espera = Number(res.headers.get("retry-after") ?? "2") * 1000 || 2000;
    console.warn(`[migrate] 429 rate limit — aguardando ${espera}ms (tentativa ${i + 1}/${tentativas})`);
    await new Promise((r) => setTimeout(r, espera));
  }
  return fetch(url, init);
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

type CardLite = { id: string; name: string; archived: boolean };

/** Extrai o valor (string) de um custom field de uma task do ClickUp. */
function valorCampo(task: any, fieldId: string): string | null {
  const cf = (task?.custom_fields ?? []).find((f: any) => f.id === fieldId);
  if (!cf) return null;
  const v = cf.value;
  if (v === undefined || v === null) return null;
  // ID GestãoClick é texto/curto; normaliza pra string sem espaços.
  return String(v).trim();
}

/**
 * Indexa TODOS os cards da Avulso por gcId, paginando.
 * Uma página = 100 tasks (limite do ClickUp). Inclui arquivados e fechados.
 */
async function indexarAvulso(listId: string, fieldId: string): Promise<Map<string, CardLite>> {
  const idx = new Map<string, CardLite>();

  // No GET tasks do ClickUp, archived=true retorna SÓ os arquivados; o padrão
  // (sem o parâmetro) retorna os não-arquivados. Por isso fazemos 2 passadas.
  async function passada(archived: boolean) {
    let page = 0;
    for (;;) {
      const url =
        `${CU_BASE}/list/${listId}/task?page=${page}` +
        `&include_closed=true&subtasks=false${archived ? "&archived=true" : ""}`;
      const res = await cuFetch(url, { headers: headers() });
      if (!res.ok) throw new Error(`GET tasks (page ${page}, archived=${archived}) falhou: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { tasks: any[]; last_page?: boolean };
      const tasks = data.tasks ?? [];
      for (const t of tasks) {
        const gc = valorCampo(t, fieldId);
        if (gc) idx.set(gc, { id: t.id, name: t.name, archived: !!t.archived });
      }
      process.stdout.write(`\r[migrate] indexando Avulso… ${archived ? "arquivados" : "ativos"} pág ${page + 1}, total ${idx.size} cards`);
      if (tasks.length === 0 || data.last_page) break;
      page++;
    }
  }

  await passada(false); // ativos + fechados
  await passada(true);  // arquivados
  process.stdout.write("\n");
  return idx;
}

/** Descobre o field id do "ID GestãoClick" na lista. */
async function getIdFieldId(listId: string): Promise<string> {
  const res = await cuFetch(`${CU_BASE}/list/${listId}/field`, { headers: headers() });
  if (!res.ok) throw new Error(`GET fields falhou: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { fields: { id: string; name: string }[] };
  const f = data.fields.find((x) => x.name.toLowerCase() === ID_FIELD_NAME);
  if (!f) throw new Error(`Campo "${ID_FIELD_NAME}" não encontrado na lista ${listId}`);
  return f.id;
}

/** Arquiva uma tarefa (reversível). */
async function archiveTask(taskId: string): Promise<void> {
  const res = await cuFetch(`${CU_BASE}/task/${taskId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ archived: true }),
  });
  if (!res.ok) throw new Error(`PUT archive falhou: ${res.status} ${await res.text()}`);
}

async function main() {
  if (!TOKEN) throw new Error("CLICKUP_TOKEN ausente no ambiente (.env).");

  console.log(`[migrate] modo: ${APPLY ? "APPLY (vai arquivar)" : "DRY-RUN (não muda nada)"}`);
  console.log(`[migrate] janela ${SINCE} → ${ymd(new Date())} | lista Avulso ${AVULSO_LIST_ID}`);

  const idFieldId = await getIdFieldId(AVULSO_LIST_ID);

  // 1) Índice da Avulso (uma vez).
  const idx = await indexarAvulso(AVULSO_LIST_ID, idFieldId);

  // 2) OS da janela.
  const ordens = await listOrdensServicos({ dataInicio: SINCE, dataFim: ymd(new Date()) });
  console.log(`[migrate] ${ordens.length} OS retornadas pelo GestãoClick`);

  let contratos = 0;
  let comCardNaAvulso = 0;
  let jaArquivados = 0;
  let arquivados = 0;
  const porDestino: Record<string, number> = { cpfl: 0, neo: 0 };
  const amostra: string[] = [];

  for (const os of ordens) {
    const key = routeContrato(os);
    if (key === "avulso") continue;
    contratos++;

    const legado = idx.get(String(os.id));
    if (!legado) continue; // sem card na Avulso → backfill cria direto na lista certa
    comCardNaAvulso++;
    porDestino[key] = (porDestino[key] ?? 0) + 1;

    if (legado.archived) { jaArquivados++; continue; }
    if (amostra.length < 15) amostra.push(`OS ${os.codigo} (${key}) → card ${legado.id} "${legado.name}"`);

    if (APPLY) {
      if (LIMIT && arquivados >= LIMIT) continue;
      try {
        await archiveTask(legado.id);
        arquivados++;
        console.log(`[migrate] arquivado: OS ${os.codigo} (${key}) card ${legado.id}`);
      } catch (err) {
        console.error(`[migrate] falha ao arquivar OS ${os.codigo}:`, err instanceof Error ? err.message : err);
      }
    }
  }

  console.log("\n==================== RESUMO ====================");
  console.log(`OS de contrato na janela:           ${contratos}`);
  console.log(`  com card legado na Avulso:        ${comCardNaAvulso}  (cpfl: ${porDestino.cpfl}, neo: ${porDestino.neo})`);
  console.log(`  já arquivados antes:              ${jaArquivados}`);
  if (APPLY) {
    console.log(`  arquivados agora:                 ${arquivados}${LIMIT ? `  (limite ${LIMIT})` : ""}`);
    console.log("\nAgora rode o backfill para recriar nas listas novas:");
    console.log('  $env:SYNC_SINCE="2026-01-01"; npm run sync:once; Remove-Item Env:\\SYNC_SINCE');
  } else {
    console.log("\nAmostra do que SERIA arquivado (dry-run):");
    for (const l of amostra) console.log("  - " + l);
    console.log("\nSe estiver ok, valide com um lote pequeno primeiro:");
    console.log('  $env:MIGRATE_APPLY="true"; $env:MIGRATE_LIMIT="5"; npx tsx --env-file=.env src/migrate-contrato.ts; Remove-Item Env:\\MIGRATE_APPLY; Remove-Item Env:\\MIGRATE_LIMIT');
  }
  console.log("================================================");
}

main().catch((e) => { console.error(e); process.exit(1); });
