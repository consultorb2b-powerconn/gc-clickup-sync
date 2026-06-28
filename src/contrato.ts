/**
 * contrato.ts — Decide a lista do ClickUp (avulso / cpfl / neo) para uma OS.
 *
 * Sinais (descobertos via diagnóstico nos dados reais):
 *   - É CONTRATO quando o atributo "TIPO DE ENTRADA" == "CONTRATO"
 *     (NÃO existe "TIPO DE CONTRATO=SIM"; era suposição antiga).
 *     "LOCAÇÃO", "AVULSO", etc. NÃO são contrato.
 *   - O override por produto/serviço "CONTRATO - X" continua valendo (definitivo).
 *   - QUAL distribuidora vem de CLIENTE + REGIÃO/UTD juntos: a região às vezes
 *     não traz a marca (ex. "COSEG D"), mas o nome do cliente sim
 *     ("COMPANHIA PAULISTA DE FORÇA E LUZ" -> CPFL).
 *
 * Prioridade:
 *   1) Produto/serviço "CONTRATO - X" / "- CPFL" / "- NEOENERGIA" -> override.
 *   2) TIPO DE ENTRADA == "CONTRATO":
 *        cliente OU região casa CPFL/RGE/PAULISTA...  -> cpfl
 *        cliente OU região casa ELEKTRO/COELBA/...     -> neo
 *        senão (Tronnix, PMPR, desconhecido)           -> avulso (log)
 *   3) Caso contrário -> avulso.
 */
export type ContratoKey = "avulso" | "cpfl" | "neo";

/** Map contrato -> list id do ClickUp (Powerconn BR). */
export const LISTA_POR_CONTRATO: Record<ContratoKey, string> = {
  avulso: process.env.CLICKUP_LIST_AVULSO ?? "901327620288",
  cpfl: process.env.CLICKUP_LIST_CPFL ?? "901327620289",
  neo: process.env.CLICKUP_LIST_NEOENERGIA ?? "901327620291",
};

/** Palavras-chave por contrato (busca por SUBSTRING, em maiúsculas). */
const KW_CPFL = ["CPFL", "RGE", "PIRATININGA", "PAULISTA", "FORCA E LUZ", "FORÇA E LUZ"];
const KW_NEO = [
  "ELEKTRO", "ELKTRO", "COELBA", "COLEBA", "COELCA",
  "CELPE", "CELP", "NEOENERGIA", "COSERN", "CURRAIS NOVOS",
];

function classificaTexto(texto: unknown): ContratoKey | null {
  if (typeof texto !== "string") return null;
  const t = texto.toUpperCase();
  // CPFL/RGE e ELEKTRO/COELBA são distintos; ordem não conflita.
  if (KW_CPFL.some((k) => t.includes(k))) return "cpfl";
  if (KW_NEO.some((k) => t.includes(k))) return "neo";
  return null;
}

/** Lê um atributo da OS pela descrição (regex), devolve o conteúdo. */
function getAttr(os: any, re: RegExp): string {
  for (const a of os?.atributos ?? []) {
    if (re.test(String(a?.atributo?.descricao ?? ""))) {
      return String(a?.atributo?.conteudo ?? "");
    }
  }
  return "";
}

/** Override pelo produto/serviço (quando há "CONTRATO - X" ou taxa "- X"). */
function contratoPorItem(os: any): ContratoKey | null {
  for (const p of os?.produtos ?? []) {
    const k = classificaTexto(p?.produto?.nome_tipo_valor);
    if (k) return k;
  }
  for (const s of os?.servicos ?? []) {
    const k =
      classificaTexto(s?.servico?.nome_tipo_valor) ??
      classificaTexto(s?.servico?.nome_servico);
    if (k) return k;
  }
  return null;
}

export function routeContrato(os: any): ContratoKey {
  // 1) Override definitivo pelo item de contrato.
  const porItem = contratoPorItem(os);
  if (porItem) return porItem;

  // 2) É contrato? Sinal real = atributo "TIPO DE ENTRADA" == "CONTRATO".
  const tipoEntrada = getAttr(os, /TIPO\s+DE\s+ENTRADA/i).trim().toUpperCase();
  if (tipoEntrada === "CONTRATO") {
    // Distribuidora vem de CLIENTE ou REGIÃO/UTD (o que casar primeiro).
    const cliente = String(os?.nome_cliente ?? "");
    const regiao = getAttr(os, /REGI.?O\s*\/?\s*UTD|REGIAO|REGI[ÃA]O/i);
    const porCliente = classificaTexto(cliente);
    const porRegiao = classificaTexto(regiao);
    const decidido = porCliente ?? porRegiao;
    if (decidido) return decidido;

    // Contrato que não é CPFL/NEO (Tronnix, PMPR, etc.) -> Avulso por enquanto.
    console.warn(
      `[contrato] OS ${os?.codigo ?? os?.id}: TIPO DE ENTRADA=CONTRATO mas ` +
        `cliente/região não casam CPFL/NEO (cliente="${cliente}", região="${regiao}"). ` +
        `Enviada para Avulso.`,
    );
    return "avulso";
  }

  // 3) Não é contrato (LOCAÇÃO, AVULSO, etc.).
  return "avulso";
}

/** Atalho: OS -> list id alvo. */
export function listIdParaOs(os: any): string {
  return LISTA_POR_CONTRATO[routeContrato(os)];
}
