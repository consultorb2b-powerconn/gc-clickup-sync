type ListKey = "AVULSO" | "CPFL" | "NEOENERGIA";

function req(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return v.trim();
}

function parseCentroCustoMap(raw: string | undefined): Record<string, ListKey> {
  const map: Record<string, ListKey> = {};
  if (!raw) return map;
  for (const pair of raw.split(",")) {
    const [id, key] = pair.split(":").map((s) => s.trim());
    if (id && (key === "AVULSO" || key === "CPFL" || key === "NEOENERGIA")) {
      map[id] = key;
    }
  }
  return map;
}

export const config = {
  gc: {
    accessToken: req("GC_ACCESS_TOKEN"),
    secretToken: req("GC_SECRET_TOKEN"),
    lojaId: process.env.GC_LOJA_ID?.trim() || undefined,
    baseUrl: "https://api.gestaoclick.com/api",
  },
  clickup: {
    token: req("CLICKUP_TOKEN"),
    baseUrl: "https://api.clickup.com/api/v2",
    lists: {
      AVULSO: req("CLICKUP_LIST_AVULSO"),
      CPFL: req("CLICKUP_LIST_CPFL"),
      NEOENERGIA: req("CLICKUP_LIST_NEOENERGIA"),
    } as Record<ListKey, string>,
  },
  centroCustoMap: parseCentroCustoMap(process.env.GC_CENTRO_CUSTO_MAP),
  sync: {
    cron: process.env.SYNC_CRON?.trim() || "*/10 * * * *",

    // Janela de BUSCA na API (por data de entrada da OS). O endpoint
    // /ordens_servicos só filtra por data_inicio/data_fim (= data de entrada),
    // então precisa ser larga o bastante para que OS antigas ainda voltem na
    // resposta e possam ser reavaliadas pela data de modificação abaixo.
    // Ajuste via SYNC_SEARCH_DAYS (padrão: 120 dias).
    searchLookbackDays: Number(process.env.SYNC_SEARCH_DAYS ?? 120),

    // Recorte por data de MODIFICAÇÃO (client-side): dentro do que a busca
    // trouxe, só processa OS mexidas nos últimos N dias. É isso que faz editar
    // uma OS antiga no GestãoClick disparar o sync do card. Mantém compat com o
    // antigo LOOKBACK_DAYS; ajuste via SYNC_MODIFIED_DAYS (padrão: 3 dias).
    modifiedWithinDays: Number(
      process.env.SYNC_MODIFIED_DAYS ?? process.env.LOOKBACK_DAYS ?? 3
    ),

    // Data fixa de início da janela (AAAA-MM-DD). Se definida, sobrepõe o
    // searchLookbackDays E desativa o recorte por modificação (backfill pega
    // tudo no intervalo). Útil para carga única, ex.: SYNC_SINCE=2026-01-01.
    since: process.env.SYNC_SINCE?.trim() || "",

    initialStatus: process.env.INITIAL_STATUS?.trim() || "",
    // Re-sync de campos em cards já existentes (GestãoClick manda nesses campos).
    // Ligado por padrão; defina RESYNC_FIELDS=false para desligar.
    resyncFields: (process.env.RESYNC_FIELDS?.trim() ?? "true") !== "false",
    runOnce:
      process.env.RUN_ONCE === "true" || process.argv.includes("--once"),
  },
};

export type { ListKey };
