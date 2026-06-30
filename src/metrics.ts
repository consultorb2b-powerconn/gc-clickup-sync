/**
 * metrics.ts — transforma as tarefas do ClickUp nas métricas do painel.
 *
 * Campos lidos (nomes exatos no ClickUp):
 *   "Cliente", "Técnico", "Situação GestãoClick",
 *   "Data de Recebimento" (epoch ms), "Data de Saída" (epoch ms),
 *   "Valor Total OS" (moeda).
 */
import { fetchAllTasks, campo, campoNum, type CuTask } from "./clickup.js";

const LISTS = {
  avulso: process.env.CLICKUP_LIST_AVULSO ?? "901327620288",
  cpfl: process.env.CLICKUP_LIST_CPFL ?? "901327620289",
  neo: process.env.CLICKUP_LIST_NEOENERGIA ?? "901327620291",
  conecta: process.env.CLICKUP_LIST_CONECTA ?? "901327705932",
};

/**
 * Status considerados "a receber" (serviço feito, aguardando NF/faturamento).
 */
const STATUS_A_RECEBER = new Set(
  [
    "serv. fim – ag. nf",
    "nf retorno autorizada",
    "faturar contrato",
    "faturar avulso",
    "serv. fim - ag. nf",
  ].map((s) => s.toLowerCase()),
);

type Periodo = "dia" | "semana" | "mes";

/**
 * Uma OS está FINALIZADA quando:
 *   - o tipo do status é fechado/concluído (closed/done), OU
 *   - o nome do status contém "finalizado" (ex.: "Finalizado Contrato",
 *     "Finalizado / Enviado") — cobre status finalizados que o ClickUp
 *     mantém como tipo "custom" e não marca como closed.
 * Se houver outros nomes de status finalizados, some-os abaixo.
 */
function finalizada(t: CuTask): boolean {
  const tipo = t.status?.type ?? "";
  if (tipo === "closed" || tipo === "done") return true;
  const nome = (t.status?.status ?? "").toLowerCase();
  if (nome.includes("finalizado")) return true;
  // GestãoClick é a fonte da verdade: OS já DESPACHADA/enviada não conta como
  // aberta, mesmo que o status no ClickUp ainda esteja "ANÁLISE – MONTAR O.S."
  // (caso típico das OS de contrato da Conecta: "FATURAR CONTRATO/ DESPACHADO").
  const sit = (campo(t, "Situação GestãoClick") ?? "").toLowerCase();
  if (sit.includes("despachado")) return true;
  return false;
}

function dataMs(t: CuTask, nome: string): Date | null {
  const ms = campoNum(t, nome);
  return ms ? new Date(ms) : null;
}

/** Chave de período. dia=YYYY-MM-DD, mes=YYYY-MM, semana=YYYY-Www. */
function chavePeriodo(d: Date, p: Periodo): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  if (p === "mes") return `${y}-${m}`;
  if (p === "dia") return `${y}-${m}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const inicioAno = new Date(Date.UTC(y, 0, 1));
  const dias = Math.floor((d.getTime() - inicioAno.getTime()) / 86_400_000);
  const semana = String(Math.ceil((dias + inicioAno.getUTCDay() + 1) / 7)).padStart(2, "0");
  return `${y}-W${semana}`;
}

function rotuloMes(chave: string): string {
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [, m] = chave.split("-");
  return nomes[Number(m) - 1] ?? chave;
}

export interface Metrics {
  geradoEm: string;
  // snapshot (independente do período)
  emAberto: number;
  porLista: { avulso: number; cpfl: number; neo: number; conecta: number };
  porTecnico: { nome: string; total: number }[];
  valoresReceber: { contrato: number; avulso: number; porStatus: { status: string; valor: number }[] };
  esteira: { status: string; total: number; tipo: string }[];
  porEmpresa: { nome: string; total: number; contrato: "cpfl" | "neo" | "conecta" | "avulso" }[];
  // dependente do período selecionado
  serie: { periodo: Periodo; pontos: { chave: string; rotulo: string; entradas: number; saidas: number }[] };
  entradas: number; // entradas no período atual (dia/semana/mês corrente)
  saidas: number;   // saídas no período atual
}

export async function buildMetrics(periodo: Periodo = "mes"): Promise<Metrics> {
  const [avulso, cpfl, neo, conecta] = await Promise.all([
    fetchAllTasks(LISTS.avulso),
    fetchAllTasks(LISTS.cpfl),
    fetchAllTasks(LISTS.neo),
    fetchAllTasks(LISTS.conecta),
  ]);
  const marcados: { t: CuTask; lista: "avulso" | "cpfl" | "neo" | "conecta" }[] = [
    ...avulso.map((t) => ({ t, lista: "avulso" as const })),
    ...cpfl.map((t) => ({ t, lista: "cpfl" as const })),
    ...neo.map((t) => ({ t, lista: "neo" as const })),
    ...conecta.map((t) => ({ t, lista: "conecta" as const })),
  ];

  // ---- Em aberto (exclui finalizadas) ----
  const abertos = marcados.filter((x) => !finalizada(x.t));
  const porLista = {
    avulso: abertos.filter((x) => x.lista === "avulso").length,
    cpfl: abertos.filter((x) => x.lista === "cpfl").length,
    neo: abertos.filter((x) => x.lista === "neo").length,
    conecta: abertos.filter((x) => x.lista === "conecta").length,
  };

  // ---- Série entrada × saída (por período) ----
  const mapaEnt = new Map<string, number>();
  const mapaSai = new Map<string, number>();
  for (const { t } of marcados) {
    const ent = dataMs(t, "Data de Recebimento");
    if (ent) {
      const k = chavePeriodo(ent, periodo);
      mapaEnt.set(k, (mapaEnt.get(k) ?? 0) + 1);
    }
    const sai = dataMs(t, "Data de Saída");
    if (sai) {
      const k = chavePeriodo(sai, periodo);
      mapaSai.set(k, (mapaSai.get(k) ?? 0) + 1);
    }
  }
  const chaves = Array.from(new Set([...mapaEnt.keys(), ...mapaSai.keys()])).sort();
  const ultimas = chaves.slice(-6);
  const pontos = ultimas.map((k) => ({
    chave: k,
    rotulo: periodo === "mes" ? rotuloMes(k) : k.slice(5),
    entradas: mapaEnt.get(k) ?? 0,
    saidas: mapaSai.get(k) ?? 0,
  }));
  // entradas/saídas do período CORRENTE (dia/semana/mês de hoje)
  const chaveAtual = chavePeriodo(new Date(), periodo);
  const entradas = mapaEnt.get(chaveAtual) ?? 0;
  const saidas = mapaSai.get(chaveAtual) ?? 0;

  // ---- Por empresa (acumulado, todas as OS) ----
  const empresa = new Map<string, { total: number; lista: "cpfl" | "neo" | "conecta" | "avulso" }>();
  for (const { t, lista } of marcados) {
    const c = campo(t, "Cliente");
    if (!c) continue;
    const cur = empresa.get(c) ?? { total: 0, lista };
    cur.total++;
    empresa.set(c, cur);
  }
  const porEmpresa = Array.from(empresa.entries())
    .map(([nome, v]) => ({ nome, total: v.total, contrato: v.lista }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 12);

  // ---- Carga por técnico (em aberto) ----
  const tecnico = new Map<string, number>();
  for (const { t } of abertos) {
    const tec = campo(t, "Técnico") ?? "Sem técnico";
    tecnico.set(tec, (tecnico.get(tec) ?? 0) + 1);
  }
  const porTecnico = Array.from(tecnico.entries())
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  // ---- Valores a receber ----
  let recContrato = 0, recAvulso = 0;
  const recPorStatus = new Map<string, number>();
  for (const { t, lista } of marcados) {
    const st = (t.status?.status ?? "").toLowerCase();
    if (!STATUS_A_RECEBER.has(st)) continue;
    const valor = campoNum(t, "Valor Total OS") ?? 0;
    if (valor <= 0) continue;
    if (lista === "avulso") recAvulso += valor; else recContrato += valor;
    recPorStatus.set(t.status.status, (recPorStatus.get(t.status.status) ?? 0) + valor);
  }
  const valoresReceber = {
    contrato: recContrato,
    avulso: recAvulso,
    porStatus: Array.from(recPorStatus.entries()).map(([status, valor]) => ({ status, valor })).sort((a, b) => b.valor - a.valor),
  };

  // ---- Esteira por status (listas de contrato) ----
  const esteiraMap = new Map<string, { total: number; tipo: string }>();
  for (const { t, lista } of marcados) {
    if (lista === "avulso") continue;
    const s = t.status?.status ?? "?";
    const cur = esteiraMap.get(s) ?? { total: 0, tipo: t.status?.type ?? "" };
    cur.total++;
    esteiraMap.set(s, cur);
  }
  const esteira = Array.from(esteiraMap.entries()).map(([status, v]) => ({ status, total: v.total, tipo: v.tipo }));

  return {
    geradoEm: new Date().toISOString(),
    emAberto: abertos.length,
    porLista,
    porTecnico,
    valoresReceber,
    esteira,
    porEmpresa,
    serie: { periodo, pontos },
    entradas,
    saidas,
  };
}
