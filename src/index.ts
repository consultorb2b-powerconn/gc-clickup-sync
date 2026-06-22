import "dotenv/config";
import cron from "node-cron";
import { config } from "./config.js";
import { runOnce } from "./sync.js";

let rodando = false;

async function tick(): Promise<void> {
  if (rodando) {
    console.log("[sync] rodada anterior ainda em execução, pulando este tick");
    return;
  }
  rodando = true;
  try {
    await runOnce();
  } catch (err) {
    console.error("[sync] falha na rodada:", err);
  } finally {
    rodando = false;
  }
}

async function main(): Promise<void> {
  console.log("[sync] iniciando — rodada inicial");
  await tick();

  if (config.sync.runOnce) {
    console.log("[sync] RUN_ONCE ativo, encerrando");
    return;
  }

  console.log(`[sync] agendando cron "${config.sync.cron}"`);
  cron.schedule(config.sync.cron, tick);
}

main().catch((err) => {
  console.error("[sync] erro fatal:", err);
  process.exit(1);
});
