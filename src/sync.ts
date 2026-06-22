import { config } from "./config.js";
import { listOrdensServicos } from "./gestaoclick.js";
import { getListFields, taskExistsByGcId, createTask } from "./clickup.js";
import { routeListKey, listIdFor, buildTaskInput } from "./mapper.js";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const ID_FIELD_NAME = "id gestãoclick";

export async function runOnce(): Promise<void> {
  const fim = new Date();
  const inicio = new Date(fim);
  inicio.setDate(inicio.getDate() - config.sync.lookbackDays);

  const janela = { dataInicio: ymd(inicio), dataFim: ymd(fim) };
  console.log(`[sync] janela ${janela.dataInicio} → ${janela.dataFim}`);

  const ordens = await listOrdensServicos(janela);
  console.log(`[sync] ${ordens.length} OS retornadas pelo GestãoClick`);

  let criadas = 0;
  let puladas = 0;

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
        puladas++;
        continue;
      }

      const exists = await taskExistsByGcId(listId, idField.id, os.id);
      if (exists) {
        puladas++;
        continue;
      }

      const input = buildTaskInput(os, fields);
      const taskId = await createTask(listId, input);
      criadas++;
      console.log(`[sync] criado card ${taskId} ← OS ${os.codigo} (${key})`);
    } catch (err) {
      console.error(`[sync] erro na OS ${os.codigo}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`[sync] fim: ${criadas} criadas, ${puladas} já existiam/puladas`);
}
