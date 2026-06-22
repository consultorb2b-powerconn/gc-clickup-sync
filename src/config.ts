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
    lookbackDays: Number(process.env.LOOKBACK_DAYS ?? 3),
    initialStatus: process.env.INITIAL_STATUS?.trim() || "Entrada e Pré-Análise",
    runOnce:
      process.env.RUN_ONCE === "true" || process.argv.includes("--once"),
  },
};

export type { ListKey };
