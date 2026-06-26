import { config } from "./config.js";
import { listOrdensServicos } from "./gestaoclick.js";
import {
  getListFields,
  findTaskByGcId,
  createTask,
  updateTaskStatus,
  setTaskFieldValue,
} from "./clickup.js";
import { routeListKey, listIdFor, buildTaskInput, buildCustomFields } from "./mapper.js";
import { statusForSituacao } from "./statusMap.js";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compara o valor atual (string) com o desejado, tratando números (dinheiro/data). */
function sameValue(current: string, desired: unknown): boolean {
  const cn = Number(current);
  const dn = Number(desired as never);
  if (current !== "" && Number.isFinite(cn) && Number.isFinite(dn)) return cn === dn;
  return current === String(desired ?? "");
}

const ID_FIELD_NAME = "id gestãoclick";

export async function runOnce(): Promise<void> {
  const fim = new Date();
  let dataInicio: string;
  if (config.sync.since) {
    dataInicio = config.sync.since; // janela fixa (backfill)
  } else {
    const inicio = new Date(fim);
    inicio.setDate(inicio.getDate() - config.sync.lookbackDays);
    dataInicio = ymd(inicio);
  }

  const janela = { dataInicio, dataFim: ymd(fim) };
  console.log(`[sync] janela ${janela.dataInicio} → ${janela.dataFim}`);

  const ordens = await listOrdensServicos(janela);
  console.log(`[sync] ${ordens.length} OS retornadas pelo GestãoClick`);

  let criadas = 0;
  let atualizadas = 0;
  let inalteradas = 0;

  for (const os of ordens) {
    try {
      const key = routeListKey(os);
      const listId = listIdFor(key);
      const fields = await getListFields(listId);

      const idField = fields.get(ID_FIELD_NAME);
      if (!idField) {
        console.warn(
          `[sync] lista ${listId} não tem o campo "ID GestãoClick" — crie-o na UI. Pulando OS ${os.codigo}.`
        );
        continue;
      }

      const existing = await findTaskByGcId(listId, idField.id, os.id);

      if (!existing) {
        const input = buildTaskInput(os, fields);
        const taskId = await createTask(listId, input);
        criadas++;
        console.log(`[sync] criado card ${taskId} ← OS ${os.codigo} (${key})`);
        continue;
      }

      // Card já existe: (1) status se a situação mudou; (2) re-sync dos campos que mudaram.
      const alvo = statusForSituacao(os.situacao_id);
      // ClickUp normaliza o status para minúsculas; compara case-insensitive
      // para não reescrever o status à toa quando só difere a caixa.
      const statusMudou =
        !!alvo && alvo.toLowerCase() !== (existing.status ?? "").toLowerCase();

      let camposMudados: { id: string; value: unknown }[] = [];
      if (config.sync.resyncFields) {
        const desejados = buildCustomFields(os, fields);
        camposMudados = desejados.filter(
          (f) => !sameValue(existing.fields.get(f.id) ?? "", f.value)
        );
      }

      // Re-sync dos campos alterados (GestãoClick manda nesses campos).
      for (const f of camposMudados) {
        await setTaskFieldValue(existing.id, f.id, f.value);
      }
      if (statusMudou) {
        await updateTaskStatus(existing.id, alvo);
      }

      if (statusMudou || camposMudados.length > 0) {
        atualizadas++;
        const partes: string[] = [];
        if (statusMudou) partes.push(`status "${existing.status}" → "${alvo}"`);
        if (camposMudados.length > 0) partes.push(`${camposMudados.length} campo(s)`);
        console.log(`[sync] atualizado OS ${os.codigo}: ${partes.join(", ")}`);
      } else {
        if (!alvo && os.situacao_id) {
          console.warn(
            `[sync] situação não mapeada na OS ${os.codigo}: id ${os.situacao_id} (${os.nome_situacao ?? "?"}) — status mantido`
          );
        }
        inalteradas++;
      }
    } catch (err) {
      console.error(`[sync] erro na OS ${os.codigo}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(
    `[sync] fim: ${criadas} criadas, ${atualizadas} atualizadas, ${inalteradas} inalteradas`
  );
}
