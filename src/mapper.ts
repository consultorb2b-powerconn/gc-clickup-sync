import { config, type ListKey } from "./config.js";
import type { GcOrdemServico } from "./gestaoclick.js";
import type { ClickUpField, CustomFieldValue, CreateTaskInput } from "./clickup.js";
import { statusForSituacao } from "./statusMap.js";

/** Decide em qual lista o card será criado, a partir do centro de custo. */
export function routeListKey(os: GcOrdemServico): ListKey {
  const cc = os.centro_custo_id ?? "";
  return config.centroCustoMap[cc] ?? "AVULSO";
}

export function listIdFor(key: ListKey): string {
  return config.clickup.lists[key];
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Converte a data do GestãoClick (AAAA-MM-DD ou DD/MM/AAAA) em epoch ms
 * para o campo de Data do ClickUp. Usa meio-dia UTC para evitar virada de fuso.
 */
function parseGcDateMs(d: string | null): number | undefined {
  if (!d) return undefined;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  let y: number, m: number, day: number;
  if (iso) {
    y = +iso[1]; m = +iso[2]; day = +iso[3];
  } else if (br) {
    day = +br[1]; m = +br[2]; y = +br[3];
  } else {
    return undefined;
  }
  const t = Date.UTC(y, m - 1, day, 12, 0, 0);
  return Number.isFinite(t) ? t : undefined;
}

/**
 * Formata a data do GestãoClick (AAAA-MM-DD ou DD/MM/AAAA) como string dd/mm/aaaa
 * para exibição legível no ClickUp (campo de TEXTO), contornando o formato
 * americano (M/D/AA) do app, que não tem toggle de formato confiável.
 */
function formatGcDateBR(d: string | null): string | undefined {
  if (!d) return undefined;
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const br = d.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  let y: number, m: number, day: number;
  if (iso) {
    y = +iso[1]; m = +iso[2]; day = +iso[3];
  } else if (br) {
    day = +br[1]; m = +br[2]; y = +br[3];
  } else {
    return undefined;
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(day)}/${pad(m)}/${y}`;
}

function totalServicos(os: GcOrdemServico): number {
  return (os.servicos ?? []).reduce((acc, s) => acc + num(s.servico?.valor_total), 0);
}

function totalProdutos(os: GcOrdemServico): number {
  return (os.produtos ?? []).reduce((acc, p) => acc + num(p.produto?.valor_total), 0);
}

function listaServicos(os: GcOrdemServico): string {
  return (os.servicos ?? [])
    .map((s) => s.servico?.nome_servico)
    .filter(Boolean)
    .join("; ");
}

function listaComponentes(os: GcOrdemServico): string {
  return (os.produtos ?? [])
    .map((p) => {
      const q = num(p.produto?.quantidade);
      const nome = p.produto?.nome_produto ?? "item";
      return q > 1 ? `${nome} (x${q})` : nome;
    })
    .filter(Boolean)
    .join("; ");
}

/** Remove ":" final e espaços de uma descrição de atributo. Ex.: "MOD:" -> "MOD". */
function limpaDescricao(d: string | undefined): string {
  return (d ?? "").replace(/[:\s]+$/, "").trim();
}

/** Extrai o conteúdo do atributo cujo nome contém "RASTREIO" (ex.: "COD RASTREIO:"). */
function codRastreio(os: GcOrdemServico): string | undefined {
  const at = (os.atributos ?? []).find((a) =>
    (a.atributo?.descricao ?? "").toUpperCase().includes("RASTREIO")
  );
  const v = at?.atributo?.conteudo?.trim();
  return v || undefined;
}

/**
 * Consolida os atributos da OS num texto legível "Descrição: conteúdo · …".
 * Pula vazios, "EM BRANCO" (checklist não marcado) e o COD RASTREIO (tem campo próprio).
 */
function fichaTecnica(os: GcOrdemServico): string | undefined {
  const partes = (os.atributos ?? [])
    .map((a) => a.atributo ?? {})
    .filter((at) => {
      const c = (at.conteudo ?? "").trim();
      const desc = (at.descricao ?? "").toUpperCase();
      if (!c || c.toUpperCase() === "EM BRANCO") return false;
      if (desc.includes("RASTREIO")) return false; // já vai no campo próprio
      return true;
    })
    .map((at) => `${limpaDescricao(at.descricao)}: ${at.conteudo?.trim()}`);
  return partes.length ? partes.join(" · ") : undefined;
}

function fieldValuesFromOs(os: GcOrdemServico): Record<string, unknown> {
  const eq = os.equipamentos?.[0]?.equipamento ?? {};
  const tServ = totalServicos(os);
  const tProd = totalProdutos(os);
  const valorTotal = os.valor_total ? Number(os.valor_total) : tServ + tProd;

  return {
    "id gestãoclick": os.id,
    "nº os": os.codigo,
    "cliente": os.nome_cliente || undefined,
    "número de série": eq.serie || undefined,
    "modelo do equipamento": eq.modelo || undefined,
    "defeitos relatados pelo cliente": eq.defeitos || undefined,
    "solução aplicada": eq.solucao || undefined,
    "laudo técnico": eq.laudo || undefined,
    "serviços aplicados": listaServicos(os) || undefined,
    "componentes aplicados": listaComponentes(os) || undefined,
    "total serviços": tServ || undefined,
    "total produtos": tProd || undefined,
    "valor total os": valorTotal || undefined,
    "observações internas": os.observacoes_interna || undefined,
    "data de recebimento": parseGcDateMs(os.data_entrada ?? os.data),
    "data recebimento (br)": formatGcDateBR(os.data_entrada ?? os.data),
    "data de saída": parseGcDateMs(os.data_saida),
    "data saída (br)": formatGcDateBR(os.data_saida),
    "técnico": os.nome_tecnico || undefined,
    "situação gestãoclick": os.nome_situacao || undefined,
    "cód. rastreio": codRastreio(os),
    "ficha técnica": fichaTecnica(os),
  };
}

/** Monta os pares {id, value} dos custom fields que existem na lista. */
export function buildCustomFields(
  os: GcOrdemServico,
  listFields: Map<string, ClickUpField>
): CustomFieldValue[] {
  const values = fieldValuesFromOs(os);
  const custom_fields: CustomFieldValue[] = [];
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    const field = listFields.get(name);
    if (field) custom_fields.push({ id: field.id, value });
  }
  return custom_fields;
}

export function buildTaskInput(
  os: GcOrdemServico,
  listFields: Map<string, ClickUpField>,
  opts?: {
    /** Mapa situação→status da LISTA onde o card será criado. Padrão: Avulso. */
    statusFor?: (situacaoId: string | number | null | undefined) => string | null;
    /** Status inicial quando a situação não está mapeada. Em contrato: undefined (omite). */
    initialStatus?: string;
  }
): CreateTaskInput {
  const custom_fields = buildCustomFields(os, listFields);

  const modelo = os.equipamentos?.[0]?.equipamento?.modelo;
  const serie = os.equipamentos?.[0]?.equipamento?.serie;
  const cliente = os.nome_cliente ?? "sem cliente";
  const partes = [`OS ${os.codigo}`, cliente, modelo, serie].filter(Boolean);

  // Status inicial: a situação da OS tem prioridade (pelo mapa informado);
  // senão o initialStatus; senão omite. Em listas de contrato o initialStatus
  // vem undefined para não enviar um status ("to do") que não existe lá.
  const statusFor = opts?.statusFor ?? statusForSituacao;
  const initial = opts && "initialStatus" in opts ? opts.initialStatus : config.sync.initialStatus;
  const status = statusFor(os.situacao_id) ?? initial;

  return {
    name: partes.join(" — "),
    ...(status ? { status } : {}),
    markdown_description: buildDescription(os),
    custom_fields,
  };
}

function buildDescription(os: GcOrdemServico): string {
  const eq = os.equipamentos?.[0]?.equipamento ?? {};
  const tServ = totalServicos(os);
  const tProd = totalProdutos(os);

  const servicosTbl =
    (os.servicos ?? []).length > 0
      ? [
          "\n### Serviços",
          "| Item | Qtd | Subtotal |",
          "| --- | --- | --- |",
          ...(os.servicos ?? []).map((s) => {
            const sv = s.servico ?? {};
            return `| ${sv.nome_servico ?? "-"} | ${num(sv.quantidade)} | ${brl(num(sv.valor_total))} |`;
          }),
        ].join("\n")
      : null;

  const produtosTbl =
    (os.produtos ?? []).length > 0
      ? [
          "\n### Produtos / Peças",
          "| Item | Qtd | Subtotal |",
          "| --- | --- | --- |",
          ...(os.produtos ?? []).map((p) => {
            const pr = p.produto ?? {};
            return `| ${pr.nome_produto ?? "-"} | ${num(pr.quantidade)} | ${brl(num(pr.valor_total))} |`;
          }),
        ].join("\n")
      : null;

  const totais =
    tServ || tProd
      ? `\n**Total Serviços:** ${brl(tServ)} · **Total Produtos:** ${brl(tProd)} · **Valor Total OS:** ${brl(tServ + tProd)}`
      : null;

  const linhas = [
    `**Origem:** GestãoClick OS ${os.codigo} (id ${os.id})`,
    os.nome_cliente ? `**Cliente:** ${os.nome_cliente}` : null,
    (os.data_entrada ?? os.data) ? `**Data de recebimento:** ${os.data_entrada ?? os.data}` : null,
    os.data_saida ? `**Data de saída:** ${os.data_saida}` : null,
    os.nome_situacao ? `**Situação no GestãoClick:** ${os.nome_situacao}` : null,
    eq.defeitos ? `\n### Defeitos relatados\n${eq.defeitos}` : null,
    eq.solucao ? `\n### Solução\n${eq.solucao}` : null,
    eq.laudo ? `\n### Laudo\n${eq.laudo}` : null,
    servicosTbl,
    produtosTbl,
    totais,
  ].filter(Boolean);
  return linhas.join("\n");
}
