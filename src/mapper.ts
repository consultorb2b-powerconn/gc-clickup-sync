import { config, type ListKey } from "./config.js";
import type { GcOrdemServico } from "./gestaoclick.js";
import type { ClickUpField, CustomFieldValue, CreateTaskInput } from "./clickup.js";

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

/**
 * De-para entre o nome do custom field no ClickUp e o valor extraído da OS.
 * Os nomes precisam bater (case-insensitive) com os campos criados na UI.
 * Campos que não existirem na lista são simplesmente ignorados.
 */
function fieldValuesFromOs(os: GcOrdemServico): Record<string, unknown> {
  const eq = os.equipamentos?.[0]?.equipamento ?? {};
  const tServ = totalServicos(os);
  const tProd = totalProdutos(os);
  const valorTotal = os.valor_total ? Number(os.valor_total) : tServ + tProd;

  return {
    "id gestãoclick": os.id,
    "nº os": os.codigo,
    "número de série": eq.serie || undefined,
    "modelo": eq.modelo || undefined,
    "defeitos relatados pelo cliente": eq.defeitos || undefined,
    "solução aplicada": eq.solucao || undefined,
    "laudo técnico": eq.laudo || undefined,
    "serviços aplicados": listaServicos(os) || undefined,
    "componentes aplicados": listaComponentes(os) || undefined,
    "total serviços": tServ || undefined,
    "total produtos": tProd || undefined,
    "valor total os": valorTotal || undefined,
    "observações internas": os.observacoes_interna || undefined,
  };
}

export function buildTaskInput(
  os: GcOrdemServico,
  listFields: Map<string, ClickUpField>
): CreateTaskInput {
  const values = fieldValuesFromOs(os);
  const custom_fields: CustomFieldValue[] = [];

  for (const [name, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "") continue;
    const field = listFields.get(name);
    if (field) custom_fields.push({ id: field.id, value });
  }

  const modelo = os.equipamentos?.[0]?.equipamento?.modelo;
  const serie = os.equipamentos?.[0]?.equipamento?.serie;
  const cliente = os.nome_cliente ?? "sem cliente";
  const partes = [`OS ${os.codigo}`, cliente, modelo, serie].filter(Boolean);

  return {
    name: partes.join(" — "),
    status: config.sync.initialStatus,
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
    os.data ? `**Data de recebimento:** ${os.data}` : null,
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
