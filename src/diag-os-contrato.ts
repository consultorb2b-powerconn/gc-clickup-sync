/**
 * diag-os-contrato.ts — inspeciona POR QUE uma OS específica é (ou não) detectada
 * como contrato pelo routeContrato. Mostra os sinais que o roteador usa:
 *   - produtos[*].produto.nome_tipo_valor  (override "CONTRATO - X")
 *   - serviços (nome do serviço, caso o override venha por serviço)
 *   - atributo "TIPO DE CONTRATO" (= SIM?)
 *   - atributo de REGIÃO/UTD (texto livre, com erros de digitação)
 *   - o veredito final do routeContrato
 *
 * Uso (uma ou várias OS por código, separadas por espaço):
 *   npx tsx --env-file=.env src/diag-os-contrato.ts 6391
 *   npx tsx --env-file=.env src/diag-os-contrato.ts 6391 6392 6394 6545
 */

import { listOrdensServicos } from "./gestaoclick.js";
import { routeContrato } from "./contrato.js";

const GC_BASE = "https://api.gestaoclick.com";
const ACCESS = process.env.GC_ACCESS_TOKEN ?? "";
const SECRET = process.env.GC_SECRET_TOKEN ?? "";

function gcHeaders() {
  return { "access-token": ACCESS, "secret-access-token": SECRET, "Content-Type": "application/json" };
}

/** Busca UMA OS pelo id interno (não o código). Usa o endpoint de detalhe. */
async function getOsById(id: string): Promise<any | null> {
  const res = await fetch(`${GC_BASE}/ordens_servicos/${id}`, { headers: gcHeaders() });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.data ?? data ?? null;
}

function up(s: unknown): string {
  return String(s ?? "").toUpperCase().trim();
}

function dumpOs(os: any) {
  const codigo = os.codigo ?? os.id;
  console.log("\n========================================================");
  console.log(`OS ${codigo} | id ${os.id} | situação ${os.situacao_id} (${os.nome_situacao ?? "?"})`);
  console.log(`cliente: ${os.nome_cliente ?? "-"}`);

  // 1) Produtos — override por nome_tipo_valor "CONTRATO - X"
  const prods = (os.produtos ?? []).map((p: any) => p.produto ?? {});
  console.log(`\n[produtos] ${prods.length}`);
  for (const p of prods) {
    console.log(`   - ${p.nome_produto ?? "?"} | nome_tipo_valor: "${p.nome_tipo_valor ?? ""}"`);
  }

  // 2) Serviços — caso o override venha por serviço
  const servs = (os.servicos ?? []).map((s: any) => s.servico ?? {});
  console.log(`\n[serviços] ${servs.length}`);
  for (const s of servs) {
    console.log(`   - ${s.nome_servico ?? "?"} | nome_tipo_valor: "${s.nome_tipo_valor ?? ""}"`);
  }

  // 3) Atributos — TIPO DE CONTRATO + REGIÃO/UTD
  const ats = (os.atributos ?? []).map((a: any) => a.atributo ?? {});
  console.log(`\n[atributos] ${ats.length}`);
  for (const a of ats) {
    console.log(`   - "${a.descricao ?? "?"}" = "${a.conteudo ?? ""}"`);
  }
  const tipoContrato = ats.find((a: any) => up(a.descricao).includes("TIPO DE CONTRATO"));
  const regiao = ats.find((a: any) => {
    const d = up(a.descricao);
    return d.includes("REGI") || d.includes("UTD") || d.includes("REGIONAL");
  });
  console.log(`\n   >> TIPO DE CONTRATO: descricao="${tipoContrato?.descricao ?? "(ausente)"}" conteudo="${tipoContrato?.conteudo ?? ""}"`);
  console.log(`   >> REGIÃO/UTD:       descricao="${regiao?.descricao ?? "(ausente)"}" conteudo="${regiao?.conteudo ?? ""}"`);

  // 4) Veredito do roteador atual
  const key = routeContrato(os);
  console.log(`\n   >> routeContrato => "${key}"  ${key === "avulso" ? "(NÃO detectou contrato)" : "(detectou contrato)"}`);
  console.log("========================================================");
}

async function main() {
  const alvos = process.argv.slice(2).map((s) => s.trim()).filter(Boolean);
  if (alvos.length === 0) {
    console.error("Informe ao menos um código de OS. Ex.: npx tsx --env-file=.env src/diag-os-contrato.ts 6391");
    process.exit(1);
  }
  console.log(`[diag] inspecionando OS: ${alvos.join(", ")}`);

  // Estratégia: varre a janela do ano e filtra pelos códigos pedidos.
  // (o endpoint de detalhe por id varia entre contas; varrer a lista é mais robusto)
  const ordens = await listOrdensServicos({ dataInicio: "2026-01-01", dataFim: new Date().toISOString().slice(0, 10) });
  console.log(`[diag] ${ordens.length} OS na janela; filtrando...`);

  const set = new Set(alvos.map(String));
  const achadas = ordens.filter((o: any) => set.has(String(o.codigo)) || set.has(String(o.id)));

  if (achadas.length === 0) {
    console.log("[diag] nenhuma das OS pedidas apareceu na janela. Tentando detalhe por id...");
    for (const a of alvos) {
      const os = await getOsById(a);
      if (os) dumpOs(os);
      else console.log(`[diag] OS ${a} não encontrada nem na lista nem por id.`);
    }
    return;
  }
  for (const os of achadas) dumpOs(os);
}

main().catch((e) => { console.error(e); process.exit(1); });
