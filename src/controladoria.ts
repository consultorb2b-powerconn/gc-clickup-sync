/**
 * controladoria.ts — roteia OS finalizadas (operações + financeiro a receber)
 * para as listas mensais da pasta "3. Controladoria" do Space 7.GSA & GSF.
 *
 * Regras (confirmadas com o gestor):
 *  - 1 card por OS finalizada (granular). NÃO move a origem: cria uma CÓPIA de
 *    consolidação (o card de reparo/recebível permanece na sua lista).
 *  - Mês de destino:
 *      • operações  → "Data de Saída" (custom field, epoch ms)
 *      • financeiro → date_done do ClickUp (quando entrou no status concluído);
 *                     fallback: date_updated.
 *    Ano < 2026 (ou sem data) → lista "0. Anteriores a 2026".
 *  - Coluna (status) do card na Controladoria = a fonte:
 *      MANU-AVULSA / MANU-CONT-{NEO,CPFL,CONECTA} para operações,
 *      FIN-AVULSA  / FIN-*-{NEO,CPFL,CONECTA}      para financeiro.
 *    O nome exato do status é resolvido na própria lista (casamento por tokens),
 *    então variações de pontuação ("MANU - AVULSA", "FIN-CON-NEO") não quebram.
 *  - CONCLUÍDO é estado manual do gestor — o roteador nunca escreve nele.
 *  - PMPR e Comodato ficam de fora.
 *  - Idempotente: dedup por "ID GestãoClick" + status dentro da lista do mês.
 *  - Criação em lotes com pausa (proteção anti-runaway).
 *
 * Só depende do CLICKUP_TOKEN (mesmo token do sync) e do CTRL_SPACE_ID.
 */
import "dotenv/config";
import { config } from "./config.js";
import { getListFields, createTask, type CustomFieldValue } from "./clickup.js";

const BASE = config.clickup.baseUrl;
const TOKEN = config.clickup.token;
const SPACE_ID = process.env.CTRL_SPACE_ID?.trim() || "901313188608"; // 7.GSA & GSF
const BATCH = Number(process.env.CTRL_BATCH ?? 40);
const BATCH_PAUSE_MS = Number(process.env.CTRL_BATCH_PAUSE_MS ?? 1500);
const DRY_RUN = (process.env.CTRL_DRY_RUN?.trim() ?? "false") === "true";
// Piso de data (YYYY-MM-DD): se definido, só consolida finalizados com data >= piso.
const CTRL_SINCE = process.env.CTRL_SINCE?.trim() || "";
const SINCE_MS: number | null = /^\d{4}-\d{2}-\d{2}$/.test(CTRL_SINCE)
  ? Date.UTC(Number(CTRL_SINCE.slice(0, 4)), Number(CTRL_SINCE.slice(5, 7)) - 1, Number(CTRL_SINCE.slice(8, 10)))
  : null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function headers(): Record<string, string> {
  return { Authorization: TOKEN, "Content-Type": "application/json" };
}

async function cuFetch(url: string, init?: RequestInit, tentativas = 5): Promise<Response> {
  for (let i = 0; ; i++) {
    const res = await fetch(url, init ?? { headers: headers() });
    if (res.status !== 429 || i >= tentativas) return res;
    const ra = Number(res.headers.get("retry-after"));
    await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * (i + 1));
  }
}

async function cuGet<T>(path: string): Promise<T> {
  const res = await cuFetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new Error(`ClickUp GET ${path} falhou: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

interface CuTask {
  id: string;
  name: string;
  status?: { status?: string; type?: string };
  date_done?: string | null;
  date_updated?: string | null;
  custom_fields?: { id: string; name: string; value?: unknown }[];
}

/** Todas as tarefas (não arquivadas), incluindo fechadas, de uma lista. */
async function listAllTasks(listId: string): Promise<CuTask[]> {
  const all: CuTask[] = [];
  for (let page = 0; ; page++) {
    const data = await cuGet<{ tasks: CuTask[]; last_page?: boolean }>(
      `/list/${listId}/task?page=${page}&include_closed=true&subtasks=false`
    );
    const tasks = data.tasks ?? [];
    all.push(...tasks);
    if (data.last_page || tasks.length === 0) break;
  }
  return all;
}

interface Folder { id: string; name: string }
interface ListRef { id: string; name: string }

async function getFolders(spaceId: string): Promise<Folder[]> {
  const d = await cuGet<{ folders: Folder[] }>(`/space/${spaceId}/folder?archived=false`);
  return d.folders ?? [];
}
async function getLists(folderId: string): Promise<ListRef[]> {
  const d = await cuGet<{ lists: ListRef[] }>(`/folder/${folderId}/list?archived=false`);
  return d.lists ?? [];
}

/** Definição de status de uma lista (nomes reais). */
async function getListStatuses(listId: string): Promise<string[]> {
  const d = await cuGet<{ statuses?: { status: string }[] }>(`/list/${listId}`);
  return (d.statuses ?? []).map((s) => s.status);
}

/** Busca card já consolidado (mesma OS + mesmo status) na lista do mês. */
async function achaExistente(listId: string, idFieldId: string, gcId: string, statusAlvo: string): Promise<boolean> {
  const filter = JSON.stringify([{ field_id: idFieldId, operator: "=", value: gcId }]);
  const d = await cuGet<{ tasks: { status?: { status?: string } }[] }>(
    `/list/${listId}/task?include_closed=true&custom_fields=${encodeURIComponent(filter)}`
  );
  const alvo = statusAlvo.toLowerCase();
  return (d.tasks ?? []).some((t) => (t.status?.status ?? "").toLowerCase() === alvo);
}

const campo = (t: CuTask, nome: string): string | null => {
  const n = nome.toLowerCase();
  const cf = t.custom_fields?.find((f) => f.name.toLowerCase() === n);
  if (!cf || cf.value === undefined || cf.value === null || cf.value === "") return null;
  return String(cf.value).trim();
};
const campoNum = (t: CuTask, nome: string): number | null => {
  const v = campo(t, nome);
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** OS de operação finalizada (espelha a regra do dashboard). */
function operacaoFinalizada(t: CuTask): boolean {
  const tipo = t.status?.type ?? "";
  if (tipo === "closed" || tipo === "done") return true;
  const nome = (t.status?.status ?? "").toLowerCase();
  if (nome.includes("finalizado")) return true;
  if (nome.includes("retornado")) return true;
  const sit = (campo(t, "Situação GestãoClick") ?? "").toLowerCase();
  if (sit.includes("despachado")) return true;
  return false;
}

/** Recebível finalizado (status "Finalizado" da lista Financeiro a Receber). */
function financeiroFinalizado(t: CuTask): boolean {
  const tipo = t.status?.type ?? "";
  if (tipo === "closed" || tipo === "done") return true;
  return (t.status?.status ?? "").toLowerCase().includes("finalizado");
}

/** Chave de mês (YYYY-MM) ou "anteriores" para < 2026 / sem data. */
function chaveMes(ms: number | null): string {
  if (!ms) return "anteriores";
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  if (y < 2026) return "anteriores";
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const norm = (s: string): string => s.toUpperCase().normalize("NFD").replace(/[^A-Z0-9]/g, "");

/** Casa o tipo lógico (categoria+cliente) com o nome real do status na lista. */
function achaStatusAlvo(statuses: string[], categoria: "MANU" | "FIN", cliente: string): string | null {
  const cli = norm(cliente); // AVULSO/NEO/CPFL/CONECTA (usa prefixo p/ AVULSA≈AVULSO)
  const cliTok = cli.startsWith("AVUL") ? "AVUL" : cli;
  for (const s of statuses) {
    const n = norm(s);
    if (n.startsWith(categoria) && n.includes(cliTok)) return s;
  }
  return null;
}

interface Fonte {
  listId: string;
  categoria: "MANU" | "FIN";
  cliente: string;                 // AVULSO | NEO | CPFL | CONECTA
  finalizado: (t: CuTask) => boolean;
  dataMesMs: (t: CuTask) => number | null;
}

async function main(): Promise<void> {
  console.log(`[ctrl] iniciando roteador da Controladoria (space ${SPACE_ID})${DRY_RUN ? " — MODO DRY-RUN (nao cria nada)" : ""}${SINCE_MS !== null ? ` — piso CTRL_SINCE=${CTRL_SINCE}` : ""}`);

  // 1) Resolve pastas/listas por nome
  const folders = await getFolders(SPACE_ID);
  const fCtrl = folders.find((f) => norm(f.name).includes("CONTROLADORIA"));
  const fFin = folders.find((f) => norm(f.name).includes("FINANCEIROARECEBER"));
  if (!fCtrl) throw new Error('Pasta "3. Controladoria" não encontrada no space.');
  if (!fFin) throw new Error('Pasta "2. Financeiro a Receber" não encontrada no space.');

  const ctrlLists = await getLists(fCtrl.id);
  const mesParaLista = new Map<string, string>(); // "2026-07" | "anteriores" -> listId
  for (const l of ctrlLists) {
    const m = l.name.match(/(\d{4})-(\d{2})/);
    if (m) mesParaLista.set(`${m[1]}-${m[2]}`, l.id);
    else if (norm(l.name).includes("ANTERIORES")) mesParaLista.set("anteriores", l.id);
  }
  console.log(`[ctrl] ${mesParaLista.size} listas de mês mapeadas na Controladoria`);

  // Status reais de uma lista de mês (todas compartilham o mesmo conjunto)
  const algumaLista = mesParaLista.get("anteriores") ?? [...mesParaLista.values()][0];
  const statusCtrl = await getListStatuses(algumaLista);

  // ID do campo "ID GestãoClick" em cada lista de mês (para dedup) — cacheado
  const idFieldCache = new Map<string, string | null>();
  async function idFieldDe(listId: string): Promise<string | null> {
    if (idFieldCache.has(listId)) return idFieldCache.get(listId)!;
    const fields = await getListFields(listId);
    const f = fields.get("id gestãoclick") ?? fields.get("id gestaoclick");
    const id = f ? f.id : null;
    idFieldCache.set(listId, id);
    return id;
  }

  // 2) Resolve as 4 listas de Financeiro a Receber por cliente (por token no nome)
  const finLists = await getLists(fFin.id);
  const finPorCliente = new Map<string, string>();
  for (const l of finLists) {
    const n = norm(l.name);
    if (n.includes("CONECTA")) finPorCliente.set("CONECTA", l.id);
    else if (n.includes("NEO")) finPorCliente.set("NEO", l.id);
    else if (n.includes("CPFL")) finPorCliente.set("CPFL", l.id);
    else if (n.includes("AVUL")) finPorCliente.set("AVULSO", l.id);
  }

  // 3) Fontes
  const opAvulso = config.clickup.lists.AVULSO;
  const opCpfl = config.clickup.lists.CPFL;
  const opNeo = config.clickup.lists.NEOENERGIA;
  const opConecta = process.env.CLICKUP_LIST_CONECTA?.trim();
  if (!opConecta) throw new Error("CLICKUP_LIST_CONECTA ausente (necessário para MANU-CONT-CONECTA).");

  const dataSaida = (t: CuTask) => campoNum(t, "Data de Saída");
  const dataDone = (t: CuTask) => {
    const dd = t.date_done ? Number(t.date_done) : null;
    if (Number.isFinite(dd) && dd) return dd;
    const du = t.date_updated ? Number(t.date_updated) : null;
    return Number.isFinite(du) && du ? du : null;
  };

  const fontes: Fonte[] = [
    { listId: opAvulso, categoria: "MANU", cliente: "AVULSO", finalizado: operacaoFinalizada, dataMesMs: dataSaida },
    { listId: opCpfl, categoria: "MANU", cliente: "CPFL", finalizado: operacaoFinalizada, dataMesMs: dataSaida },
    { listId: opNeo, categoria: "MANU", cliente: "NEO", finalizado: operacaoFinalizada, dataMesMs: dataSaida },
    { listId: opConecta, categoria: "MANU", cliente: "CONECTA", finalizado: operacaoFinalizada, dataMesMs: dataSaida },
  ];
  for (const [cli, listId] of finPorCliente) {
    fontes.push({ listId, categoria: "FIN", cliente: cli, finalizado: financeiroFinalizado, dataMesMs: dataDone });
  }

  // 4) Coleta candidatos
  interface Candidato { origem: CuTask; fonte: Fonte; gcId: string; mesKey: string; statusAlvo: string; destListId: string }
  const candidatos: Candidato[] = [];
  let semData = 0, semStatus = 0, semDest = 0, semGcId = 0, abaixoPiso = 0;

  for (const fonte of fontes) {
    const tarefas = await listAllTasks(fonte.listId);
    const finalizadas = tarefas.filter(fonte.finalizado);
    console.log(`[ctrl] ${fonte.categoria}-${fonte.cliente}: ${finalizadas.length} finalizadas de ${tarefas.length}`);
    for (const t of finalizadas) {
      const gcId = campo(t, "ID GestãoClick");
      if (!gcId) { semGcId++; continue; }
      const ms = fonte.dataMesMs(t);
      if (SINCE_MS !== null && (ms === null || ms < SINCE_MS)) { abaixoPiso++; continue; }
      const mesKey = chaveMes(ms);
      const destListId = mesParaLista.get(mesKey) ?? mesParaLista.get("anteriores");
      if (!destListId) { semDest++; continue; }
      const statusAlvo = achaStatusAlvo(statusCtrl, fonte.categoria, fonte.cliente);
      if (!statusAlvo) { semStatus++; continue; }
      candidatos.push({ origem: t, fonte, gcId, mesKey, statusAlvo, destListId });
    }
  }
  console.log(`[ctrl] ${candidatos.length} candidatos (ignorados: ${semGcId} sem ID, ${semStatus} sem status, ${semDest} sem destino, ${abaixoPiso} abaixo do piso/sem data)`);

  // 5) Cria em lotes, com dedup
  let criados = 0, jaExistiam = 0, lote = 0;
  for (const c of candidatos) {
    const idField = await idFieldDe(c.destListId);
    if (idField && (await achaExistente(c.destListId, idField, c.gcId, c.statusAlvo))) {
      jaExistiam++;
      continue;
    }
    // Mapeia campos por nome (só os que existirem na lista de destino)
    const destFields = await getListFields(c.destListId);
    const cf: CustomFieldValue[] = [];
    for (const nome of ["ID GestãoClick", "Nº OS", "Valor Total OS", "Cliente"]) {
      const f = destFields.get(nome.toLowerCase());
      const v = campo(c.origem, nome);
      if (f && v !== null) cf.push({ id: f.id, value: v });
    }
    const nome = c.origem.name || `OS ${campo(c.origem, "Nº OS") ?? c.gcId}`;
    if (DRY_RUN) {
      console.log(`[ctrl][dry] criaria em ${c.mesKey} / "${c.statusAlvo}": ${nome} (ID GC ${c.gcId})`);
      criados++;
      continue;
    }
    await createTask(c.destListId, { name: nome, status: c.statusAlvo, custom_fields: cf });
    criados++;
    if (++lote >= BATCH) { console.log(`[ctrl] lote de ${BATCH} criado, pausa ${BATCH_PAUSE_MS}ms`); await sleep(BATCH_PAUSE_MS); lote = 0; }
  }

  console.log(`[ctrl] concluído — ${DRY_RUN ? "SIMULARIA" : "criados"} ${criados}, já existiam ${jaExistiam}`);
}

main().catch((err) => {
  console.error("[ctrl] erro fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
