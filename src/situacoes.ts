import "dotenv/config";

const base = "https://api.gestaoclick.com/api";
const headers = {
  "access-token": process.env.GC_ACCESS_TOKEN ?? "",
  "secret-access-token": process.env.GC_SECRET_TOKEN ?? "",
  "Content-Type": "application/json",
};

if (!headers["access-token"] || !headers["secret-access-token"]) {
  console.error("Faltam GC_ACCESS_TOKEN / GC_SECRET_TOKEN no .env");
  process.exit(1);
}

const res = await fetch(`${base}/situacoes_ordens_servicos`, { headers });
if (!res.ok) {
  console.error("Falha:", res.status, await res.text());
  process.exit(1);
}

const body = (await res.json()) as { data?: { id: string; nome: string }[] };
const situacoes = (body.data ?? []).slice().sort((a, b) =>
  String(a.nome).localeCompare(String(b.nome), "pt-BR")
);

console.log(`\nSituacoes de OS no GestaoClick — ${situacoes.length} encontradas:\n`);
for (const s of situacoes) {
  console.log(`${s.id}\t${s.nome}`);
}
console.log("");
