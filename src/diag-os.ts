import { config } from "./config.js";
import { listOrdensServicos } from "./gestaoclick.js";

// Uso: npm run diag -- <codigo>            (acha pelo código na listagem)
//  ou: npm run diag -- <id> <codigo>
// Ex.: npm run diag -- 6510
const arg1 = process.argv[2] ?? "6510";
const arg2 = process.argv[3];
// Se só veio 1 argumento, tratamos como código (é o caso comum).
const idArg = arg2 ? arg1 : undefined;
const codigo = arg2 ?? arg1;

const h = {
  "access-token": config.gc.accessToken,
  "secret-access-token": config.gc.secretToken,
};

function datasDe(os: Record<string, unknown> | undefined | null): string {
  if (!os) return "(objeto vazio)";
  const chaves = Object.keys(os).filter((k) => k.toLowerCase().includes("data"));
  return chaves.map((k) => `${k}=${JSON.stringify(os[k])}`).join(" | ") || "(nenhuma chave com 'data')";
}

/** Imprime status + um trecho do corpo de uma URL, sem explodir se não for JSON. */
async function probe(label: string, url: string): Promise<void> {
  try {
    const res = await fetch(url, { headers: h });
    const txt = await res.text();
    const snippet = txt.length > 800 ? txt.slice(0, 800) + " …(truncado)" : txt;
    console.log(`\n[${label}] HTTP ${res.status} — ${url}`);
    console.log(snippet || "(corpo vazio)");
  } catch (e) {
    console.log(`\n[${label}] FALHOU — ${url}`);
    console.log(e instanceof Error ? e.message : e);
  }
}

console.log(`\n>>> Diagnóstico OS codigo=${codigo}${idArg ? ` id=${idArg}` : ""}\n`);

// 1) LISTAGEM — exatamente o que o sync enxerga. Achamos a OS e despejamos TUDO.
let osReal: Record<string, unknown> | undefined;
try {
  const lista = await listOrdensServicos({ dataInicio: "2026-01-01", dataFim: "2026-12-31" });
  osReal = lista.find(
    (o) => (idArg && String(o.id) === idArg) || String(o.codigo) === codigo
  ) as unknown as Record<string, unknown> | undefined;

  console.log(`=== LISTAGEM (o que o sync lê) — ${lista.length} OS na janela ===`);
  if (!osReal) {
    console.log(`OS codigo=${codigo} NÃO encontrada na listagem da janela 2026.`);
  } else {
    console.log("datas       :", datasDe(osReal));
    console.log("\n=== TODAS AS CHAVES DO OBJETO ===");
    console.log(Object.keys(osReal).sort().join(", "));
    console.log("\n=== JSON CRU COMPLETO DA OS ===");
    console.log(JSON.stringify(osReal, null, 2));
  }
} catch (e) {
  console.log("LISTAGEM falhou:", e instanceof Error ? e.message : e);
}

// 2) id real da OS (vindo da listagem) para sondar endpoints de histórico.
const idReal = idArg ?? (osReal?.id !== undefined ? String(osReal.id) : undefined);

if (!idReal) {
  console.log("\n(Sem id real da OS — pulei a sondagem de histórico.)");
} else {
  console.log(`\n\n>>> SONDAGEM DE ENDPOINTS DE HISTÓRICO (id real = ${idReal})`);
  const base = config.gc.baseUrl;
  await probe("detalhe", `${base}/ordens_servicos/${idReal}`);
  await probe("historico-sub", `${base}/ordens_servicos/${idReal}/historico`);
  await probe("historicos-sub", `${base}/ordens_servicos/${idReal}/historicos`);
  await probe("situacoes-sub", `${base}/ordens_servicos/${idReal}/situacoes`);
  await probe("historico-query", `${base}/ordens_servicos_historico?ordem_servico_id=${idReal}`);
  await probe("historico-situacoes", `${base}/historico_situacoes?ordem_servico_id=${idReal}`);
  await probe("os-situacoes", `${base}/ordens_servicos_situacoes?ordem_servico_id=${idReal}`);
}
