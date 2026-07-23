import { config } from "./config.js";
import { listOrdensServicos } from "./gestaoclick.js";
import {
  getListFields,
  findTaskByGcId,
  createTask,
  updateTaskStatus,
  setTaskFieldValue,
} from "./clickup.js";
import { buildTaskInput, buildCustomFields, parseGcDateMs } from "./mapper.js";
import { statusForSituacao } from "./statusMap.js";
import { statusForSituacaoContrato } from "./statusMapContrato.js";
import { routeContrato, listIdParaOs } from "./contrato.js";

const AVULSO_LIST_ID = process.env.CLICKUP_LIST_AVULSO ?? "901327620288";

/** Escolhe o de-para situação→status conforme a LISTA onde o card vive. */
function statusFnForList(listId: string) {
  return listId === AVULSO_LIST_ID ? statusForSituacao : statusForSituacaoContrato;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Compara o valor atual (string) com o desejado, tratando números (dinheiro/data). */
function sameValue(current: string, desired: unknown): boolean {
  const cn = Number(current);
  const dn = Number(desired as never);
  if (current !== "" && Number.isFinite(cn) && Number.isFinite(dn)) {
    // Campos de DATA: o ClickUp normaliza o timestamp para a meia-noite do fuso
    // da conta e devolve um valor deslocado (algumas horas) em relação ao que
    // gravamos (meio-dia UTC). Para datas, comparamos o DIA, não o ms exato,
    // senão o campo seria reescrito a cada rodada. Heurística: epoch em ms
    // (valores grandes, > ano 2001) cujos timestamps caem no mesmo dia UTC.
    const ehEpochMs = Math.abs(cn) > 1e12 && Math.abs(dn) > 1e12;
    if (ehEpochMs) {
      const diaC = Math.floor(cn / 86_400_000);
      const diaD = Math.floor(dn / 86_400_000);
      // tolera diferença de 1 "dia" para cobrir o deslocamento de fuso na virada.
      return Math.abs(diaC - diaD) <= 1;
    }
    return cn === dn;
  }
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
    inicio.setDate(inicio.getDate() - config.sync.searchLookbackDays);
    dataInicio = ymd(inicio);
  }

  const janela = { dataInicio, dataFim: ymd(fim) };
  console.log(`[sync] janela de busca ${janela.dataInicio} → ${janela.dataFim}`);

  const ordens = await listOrdensServicos(janela);
  console.log(`[sync] ${ordens.length} OS retornadas pelo GestãoClick`);

  // Recorte por DATA DE MODIFICAÇÃO (client-side). A API só filtra por data de
  // entrada, então buscamos uma janela larga e aqui ficamos só com as OS que
  // foram de fato mexidas recentemente — assim editar uma OS antiga também
  // dispara o sync. No modo backfill (since), processa tudo o que veio.
  let alvoOrdens = ordens;
  if (!config.sync.since) {
    const corteMs = fim.getTime() - config.sync.modifiedWithinDays * 86_400_000;
    alvoOrdens = ordens.filter((os) => {
      // O GestãoClick manda data em AAAA-MM-DD OU DD/MM/AAAA. Convertemos para
      // timestamp e comparamos número com número — comparar string direto
      // quebrava com o formato BR ("20/07/2026") e derrubava OS modificadas.
      const ref = (os.modificado_em ?? os.cadastrado_em ?? os.data_entrada ?? null) as string | null;
      const ms = parseGcDateMs(ref);
      return ms === undefined || ms >= corteMs; // sem data conhecida → processa por segurança
    });
    const corteLabel = ymd(new Date(corteMs));
    console.log(
      `[sync] ${alvoOrdens.length}/${ordens.length} OS modificadas desde ${corteLabel} (janela de modificação: ${config.sync.modifiedWithinDays} dia(s))`
    );
  }

  let criadas = 0;
  let atualizadas = 0;
  let inalteradas = 0;

  for (const os of alvoOrdens) {
    try {
      // Roteamento (Modelo A): produto override -> atributo+região -> avulso.
      const key = routeContrato(os);            // "avulso" | "cpfl" | "neo"
      const listId = listIdParaOs(os);          // id real da lista alvo
      const fields = await getListFields(listId);

      const idField = fields.get(ID_FIELD_NAME);
      if (!idField) {
        console.warn(
          `[sync] lista ${listId} (${key}) não tem o campo "ID GestãoClick" — crie os custom fields nessa lista na UI. Pulando OS ${os.codigo}.`
        );
        continue;
      }

      // Dedup na lista roteada.
      let existing = await findTaskByGcId(listId, idField.id, os.id);
      let cardListId = listId;
      let cardFields = fields;

      // Anti-duplicata: se roteia p/ contrato mas o card legado já existe na
      // Avulso (criado antes do roteamento), atualiza ele LÁ e loga migração
      // pendente, em vez de criar um duplicado na lista de contrato.
      if (!existing && key !== "avulso") {
        const aFields = await getListFields(AVULSO_LIST_ID);
        const aIdField = aFields.get(ID_FIELD_NAME);
        if (aIdField) {
          const legado = await findTaskByGcId(AVULSO_LIST_ID, aIdField.id, os.id);
          if (legado) {
            existing = legado;
            cardListId = AVULSO_LIST_ID;
            cardFields = aFields;
            console.warn(
              `[sync] OS ${os.codigo}: card existe na Avulso, mas roteia p/ ${key}. Atualizando na Avulso (migração de lista pendente).`
            );
          }
        }
      }

      if (!existing) {
        const statusFor = statusFnForList(listId);
        // Em listas de contrato omitimos o status inicial ("to do" não existe lá):
        // o ClickUp usa o primeiro status da lista (Entrada e Pré-Análise).
        const initialStatus = listId === AVULSO_LIST_ID ? config.sync.initialStatus : undefined;
        const input = buildTaskInput(os, fields, { statusFor, initialStatus });
        const taskId = await createTask(listId, input);
        criadas++;
        console.log(`[sync] criado card ${taskId} ← OS ${os.codigo} (${key})`);
        continue;
      }

      // Card já existe: (1) status se a situação mudou; (2) re-sync dos campos.
      // Usa o de-para da LISTA onde o card de fato está (cardListId).
      const statusFor = statusFnForList(cardListId);
      const alvo = statusFor(os.situacao_id);
      // ClickUp normaliza o status para minúsculas; compara case-insensitive
      // para não reescrever o status à toa quando só difere a caixa.
      const statusMudou =
        !!alvo && alvo.toLowerCase() !== (existing.status ?? "").toLowerCase();

      let camposMudados: { id: string; value: unknown }[] = [];
      if (config.sync.resyncFields) {
        const desejados = buildCustomFields(os, cardFields);
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
