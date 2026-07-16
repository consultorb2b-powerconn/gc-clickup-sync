/* contrato.ts — Decide a lista do ClickUp (avulso / cpfl / neo / conecta) para uma OS.
 *
 * Sinal primário (conclusão do diagnóstico de classificação):
 *   - O NOME DO CLIENTE é o sinal mais confiável. Mantemos listas curadas
 *     (EMPRESAS_CPFL / EMPRESAS_NEO / EMPRESAS_CONECTA) e o match por cliente
 *     VENCE qualquer outro sinal — inclusive força contrato mesmo quando o
 *     GestãoClick traz TIPO DE ENTRADA=AVULSO.
 *   - O override por produto/serviço "CONTRATO - X" é frágil; vira só fallback
 *     para clientes que NÃO estão nas listas curadas.
 *
 * Prioridade:
 *   1) Cliente bate em lista curada (CPFL / NEO / CONECTA) -> decide (definitivo).
 *   2) (cliente fora das listas) override por item "CONTRATO - X" / "- CPFL" / "- NEOENERGIA".
 *   3) TIPO DE ENTRADA == "CONTRATO": tenta CPFL/NEO por keyword (cliente OU região).
 *   4) Caso contrário -> avulso.
 *
 * O match de cliente é por nome NORMALIZADO (maiúsculas, sem acento, pontuação e
 * "_" viram espaço, espaços colapsados), pra tolerar a bagunça do cadastro
 * (ex.: "CPFL -   INDAIATUBA_SP", "COELBA- NEO ENERGIA").
 */
export type ContratoKey = "avulso" | "cpfl" | "neo" | "conecta" | "tronnix_pmpr" | "tronnix_comodato";

/** Map contrato -> list id do ClickUp (Powerconn BR). */
export const LISTA_POR_CONTRATO: Record<ContratoKey, string> = {
  avulso: process.env.CLICKUP_LIST_AVULSO ?? "901327620288",
  cpfl: process.env.CLICKUP_LIST_CPFL ?? "901327620289",
  neo: process.env.CLICKUP_LIST_NEOENERGIA ?? "901327620291",
  conecta: process.env.CLICKUP_LIST_CONECTA ?? "901327705932",
  // Defina no .env após criar as listas (sem default chumbado de propósito).
  tronnix_pmpr: process.env.CLICKUP_LIST_TRONNIX_PMPR ?? "",
  tronnix_comodato: process.env.CLICKUP_LIST_TRONNIX_COMODATO ?? "",
};

/**
 * Roteamento por ID de cliente do GestãoClick (VENCE tudo, inclusive o nome).
 * Necessário para o Tronnix, cujos dois cadastros compartilham a MESMA razão
 * social ("TRONNIX SOLUCOES DE SEGURANCA LTDA") — só o cliente_id os distingue:
 *   32600822 = "POLICIA MILITAR DO PARANÁ-PR"  -> contrato PMPR
 *   59600772 = "TRONNIX -  COMODATO"           -> comodato (ativo interno)
 */
const CONTRATO_POR_CLIENTE_ID: Record<string, ContratoKey> = {
  "32600822": "tronnix_pmpr",
  "59600772": "tronnix_comodato",
};

// === Bases de contrato (curadas a partir do GestãoClick) ===
// Mantemos os nomes ORIGINAIS aqui (legível/auditável); a normalização é feita
// em runtime ao montar os Sets abaixo.
const EMPRESAS_CPFL = [
  "CPFL -   INDAIATUBA_SP",
  "CPFL - AMERICANA -SP",
  "CPFL - BOP CAMPINAS  - BOA VISTA",
  "CPFL - CUBATÃO",
  "CPFL - EA FRANCA DIAMANTE",
  "CPFL - OLIMPIA - SP",
  "CPFL - PIRATININGA",
  "CPFL - RIBEIRÃO PRETO",
  "CPFL - VOTORANTIM",
  "CPFL -PORTO ALEGRE-RS",
  "CPFL -SANTA CRUZ",
  "CPFL -SAPUCAIA DO SUL",
  "CPFL BARRETOS",
  "CPFL EA MARILIA (SERVIÇOS OBRA)",
  "CPFL PAULISTA - Campinas",
  "CPFL PAULISTA - SUMARÉ - SP",
  "CPFL PAULISTA ARARAGUARA SP",
  "CPFL PAULISTA-BIRIGUI SP",
  "CPFL RGE - EA SANTIAGO",
  "CPFL SERVICOS  - CAMPINAS - COSEG",
  "CPFL SERVICOS - ARAÇATUBA",
  "CPFL SERVIÇOS - AVARÉ",
  "CPFL SERVIÇOS - BOP PIRACICABA",
  "CPFL SERVICOS BOP MARILIA",
  "CPFL SERVICOS- (SÃO JOSÉ DO RIO PRETO)",
  "CPFL- AMPARO",
  "CPFL- BOTUCATU",
  "CPFL- EA MARILIA - ( SERVIÇOS CAMPO)",
  "CPFL- JAÚ",
  "CPFL- LINS",
  "CPFL- SÂO JOAQUIM DA BARRA",
  "CPFL- SOROCABA",
  "CPFL- SUBSTAÇÃO MARACANU II",
  "CPFL- VALINHOS",
  "EA FRANCA- RESENDE",
  "ESTACAO AVANCADA DE SAO ROQUE",
  "RGE -  SÃO BORJA - RS",
  "RGE - CRUZ ALTA RS",
  "RGE - GRAMADO -RS",
  "RGE - NOVA PETROPOLIS RS",
  "RGE CANOAS",
  "RGE MONTENEGRO",
  "RGE NOVA PRATA RS",
  "RGE SUL -  LAJEADO",
  "RGE-  EA- URUGUAIANA - PAMPAS",
  "RGE-  GRAVATAI I-RS",
  "RGE- BENTO GONÇALVES-RS",
  "RGE- LAGOA VERMELHA- RS",
  "RGE- LAJEADO RS",
  "RGE- PORTO LUCENA- RS",
  "RGE- ROSARIO DO SUL",
  "RGE- SANTA MARIA-RS",
  "RGE- SANTA ROSA-RS",
  "RGE- SANTANA  DO LIVRAMENTO- RS",
  "RGE- SÃO GABRIEL -RS",
  "RGE- TRES PASSOS",
];

const EMPRESAS_NEO = [
  "CELP- NEOENERGIA PERNAMBUCO",
  "COELBA- NEO ENERGIA",
  "EKTT 11 - ITAJAI",
  "ELEKTRO - ARARAS",
  "ELEKTRO - FRANCO DA ROCHA",
  "ELEKTRO - REGISTRO",
  "ELEKTRO - SAO LUIZ DO PARAITINGA",
  "ELEKTRO ANDRADINA",
  "ELEKTRO DRACENA",
  "ELEKTRO IGUAPE",
  "ELEKTRO ITANHAEM",
  "ELEKTRO ITAPEVA",
  "ELEKTRO MAIRIPORÃ",
  "ELEKTRO MOGI GUACU",
  "ELEKTRO PIRACAIA",
  "ELEKTRO REDES ATIBAIA",
  "ELEKTRO REDES JALES",
  "ELEKTRO REDES LIMEIRA",
  "ELEKTRO REDES S.A - PIRAPOZINHO",
  "ELEKTRO TATUI",
  "ELEKTRO TRES LAGOAS M.S",
  "ELEKTRO UBATUBA",
  "ELEKTRO VOTUPORANGA",
  "ELEKTRO- RIO CLARO-SP",
  "ILHA SOLTEIRA",
  "NEOENERGIA BRASILIA",
];

// Contrato CONECTA (cliente único). A regra de token \bCONECTA\b em
// contratoPorClienteCurado() permanece como rede de segurança.
const EMPRESAS_CONECTA = [
  "CONECTA EMPREENDIMENTOS LTDA",
];

/** Normaliza nome: maiúsculas, sem acento, pontuação/_ -> espaço, espaços colapsados. */
function normaliza(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacríticos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ") // pontuação, "_", traços -> espaço
    .trim()
    .replace(/\s+/g, " ");
}

const SET_CPFL = new Set(EMPRESAS_CPFL.map(normaliza));
const SET_NEO = new Set(EMPRESAS_NEO.map(normaliza));
const SET_CONECTA = new Set(EMPRESAS_CONECTA.map(normaliza));

/** Palavras-chave por contrato (fallback p/ clientes fora das listas curadas). */
const KW_CPFL = ["CPFL", "RGE", "PIRATININGA", "PAULISTA", "FORCA E LUZ"];
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

/** Match determinístico por nome de cliente (listas curadas). Vence tudo. */
function contratoPorClienteCurado(cliente: unknown): ContratoKey | null {
  const n = normaliza(cliente);
  if (!n) return null;
  // Conecta primeiro (mais específico), depois CPFL, depois NEO.
  if (SET_CONECTA.has(n)) return "conecta";
  if (SET_CPFL.has(n)) return "cpfl";
  if (SET_NEO.has(n)) return "neo";
  // Regra provisória Conecta por token no nome (enquanto EMPRESAS_CONECTA
  // estiver vazia). Confirmar/remover quando houver lista curada.
  if (/\bCONECTA\b/.test(n)) return "conecta";
  return null;
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
  // 0) Determinístico por ID de cliente. VENCE tudo — é o único jeito de separar
  //    os dois cadastros Tronnix (mesma razão social, cliente_id diferente).
  const porId = CONTRATO_POR_CLIENTE_ID[String(os?.cliente_id ?? "")];
  if (porId) return porId;

  // 1) Determinístico por nome de cliente (lista curada). Vence tudo e FORÇA
  //    contrato mesmo se TIPO DE ENTRADA=AVULSO no GestãoClick.
  const porClienteCurado = contratoPorClienteCurado(os?.nome_cliente);
  if (porClienteCurado) return porClienteCurado;

  // 2) (cliente fora das listas) override definitivo pelo item de contrato.
  const porItem = contratoPorItem(os);
  if (porItem) return porItem;

  // 3) É contrato? Sinal = atributo "TIPO DE ENTRADA" == "CONTRATO".
  const tipoEntrada = getAttr(os, /TIPO\s+DE\s+ENTRADA/i).trim().toUpperCase();
  if (tipoEntrada === "CONTRATO") {
    const cliente = String(os?.nome_cliente ?? "");
    const regiao = getAttr(os, /REGI.?O\s*\/?\s*UTD|REGIAO|REGI[AÃ]O/i);
    const decidido = classificaTexto(cliente) ?? classificaTexto(regiao);
    if (decidido) return decidido;

    console.warn(
      `[contrato] OS ${os?.codigo ?? os?.id}: TIPO DE ENTRADA=CONTRATO mas ` +
        `cliente/região não casam CPFL/NEO/CONECTA (cliente="${cliente}", região="${regiao}"). ` +
        `Enviada para Avulso.`,
    );
    return "avulso";
  }

  // 4) Não é contrato (LOCAÇÃO, AVULSO, etc.).
  return "avulso";
}

/** Atalho: OS -> list id alvo. */
export function listIdParaOs(os: any): string {
  const contrato = routeContrato(os);
  const listId = LISTA_POR_CONTRATO[contrato];
  if (!listId) {
    console.warn(
      `[contrato] OS ${os?.codigo ?? os?.id}: contrato "${contrato}" sem list id ` +
        `configurado (defina CLICKUP_LIST_TRONNIX_PMPR / CLICKUP_LIST_TRONNIX_COMODATO no .env). ` +
        `Enviada para Avulso por segurança.`,
    );
    return LISTA_POR_CONTRATO.avulso;
  }
  return listId;
}
