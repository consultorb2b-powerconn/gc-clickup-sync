import { config } from "./config.js";

export interface GcEquipamento {
  equipamento?: string;
  serie?: string;
  marca?: string;
  modelo?: string;
  condicoes?: string;
  defeitos?: string;
  acessorios?: string;
  solucao?: string;
  laudo?: string;
  termos_garantia?: string;
}

export interface GcProduto {
  produto_id?: number | string;
  nome_produto?: string;
  quantidade?: string;
  valor_venda?: string;
  valor_total?: string;
}

export interface GcServico {
  servico_id?: string;
  nome_servico?: string;
  quantidade?: string;
  valor_venda?: string | number;
  valor_total?: string;
}

export interface GcAtributo {
  id?: string;
  atributo_id?: string;
  descricao?: string;
  conteudo?: string;
  tipo?: string;
}

export interface GcOrdemServico {
  id: string;
  codigo: string;
  cliente_id: string | null;
  nome_cliente: string | null;
  tecnico_id: string | null;
  nome_tecnico: string | null;
  data: string | null;
  data_entrada: string | null;
  data_saida: string | null;
  previsao_entrega: string | null;
  situacao_id: string | null;
  nome_situacao: string | null;
  valor_total: string | null;
  centro_custo_id: string | null;
  nome_centro_custo: string | null;
  observacoes: string | null;
  observacoes_interna: string | null;
  equipamentos?: { equipamento: GcEquipamento }[];
  produtos?: { produto: GcProduto }[];
  servicos?: { servico: GcServico }[];
  atributos?: { atributo: GcAtributo }[];
  [k: string]: unknown;
}

interface GcListResponse {
  code: number;
  status: string;
  meta: { proxima_pagina: number | null };
  data: GcOrdemServico[];
}

function headers(): Record<string, string> {
  return {
    "access-token": config.gc.accessToken,
    "secret-access-token": config.gc.secretToken,
    "Content-Type": "application/json",
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lista todas as OS dentro da janela [dataInicio, dataFim] (formato AAAA-MM-DD),
 * paginando até o fim. Respeita o limite de ~3 req/s do GestãoClick.
 */
export async function listOrdensServicos(opts: {
  dataInicio: string;
  dataFim: string;
}): Promise<GcOrdemServico[]> {
  const out: GcOrdemServico[] = [];
  let pagina = 1;

  while (true) {
    const params = new URLSearchParams({
      data_inicio: opts.dataInicio,
      data_fim: opts.dataFim,
      pagina: String(pagina),
      ordenacao: "codigo",
      direcao: "asc",
    });
    if (config.gc.lojaId) params.set("loja_id", config.gc.lojaId);

    const url = `${config.gc.baseUrl}/ordens_servicos?${params.toString()}`;
    const res = await fetch(url, { headers: headers() });

    if (res.status === 429) {
      await sleep(1500); // backoff por rate limit
      continue;
    }
    if (!res.ok) {
      throw new Error(`GestãoClick GET ordens_servicos falhou: ${res.status} ${await res.text()}`);
    }

    const body = (await res.json()) as GcListResponse;
    out.push(...(body.data ?? []));

    if (body.meta?.proxima_pagina == null) break;
    pagina = body.meta.proxima_pagina;
    await sleep(400); // ~2.5 req/s, abaixo do teto de 3/s
  }
if (out.length) { console.log("[diag] campos:", JSON.stringify(Object.keys(out[0]))); console.log("[diag] amostra:", JSON.stringify(out[0])); const sidTest = out[0].situacao_id; const pt = new URLSearchParams({ situacao_id: String(sidTest), pagina: "1" }); if (config.gc.lojaId) pt.set("loja_id", config.gc.lojaId); const rt = await fetch(config.gc.baseUrl + "/ordens_servicos?" + pt.toString(), { headers: headers() }); const bt = await rt.json(); const arrT = bt.data || []; const distintas = Array.from(new Set(arrT.map(function(o){ return o.situacao_id; }))); console.log("[diag] filtro situacao_id=" + sidTest + " status=" + rt.status + " total=" + arrT.length + " distintas=" + JSON.stringify(distintas)); }
  return out;
}
