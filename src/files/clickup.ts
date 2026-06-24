import { config } from "./config.js";

export interface ClickUpField {
  id: string;
  name: string;
  type: string;
}

export interface CustomFieldValue {
  id: string;
  value: unknown;
}

export interface CreateTaskInput {
  name: string;
  status?: string;
  markdown_description?: string;
  custom_fields?: CustomFieldValue[];
}

function headers(): Record<string, string> {
  return {
    Authorization: config.clickup.token,
    "Content-Type": "application/json",
  };
}

const fieldCache = new Map<string, Map<string, ClickUpField>>();

/** Lê os custom fields de uma lista e indexa por nome (lowercase). Cacheado. */
export async function getListFields(listId: string): Promise<Map<string, ClickUpField>> {
  const cached = fieldCache.get(listId);
  if (cached) return cached;

  const res = await fetch(`${config.clickup.baseUrl}/list/${listId}/field`, {
    headers: headers(),
  });
  if (!res.ok) {
    throw new Error(`ClickUp GET fields falhou (${listId}): ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { fields: ClickUpField[] };
  const byName = new Map<string, ClickUpField>();
  for (const f of body.fields ?? []) byName.set(f.name.toLowerCase(), f);

  fieldCache.set(listId, byName);
  return byName;
}

export interface ExistingTask {
  id: string;
  status: string; // nome do status atual (lowercase), ex.: "to do"
  fields: Map<string, string>; // fieldId -> valor atual (string), para comparação
}

/**
 * Procura o card cujo custom field "ID GestãoClick" é igual ao id informado.
 * Trava de deduplicação E base para atualizar status/campos.
 * Retorna o card (id, status, valores atuais dos campos) ou null se não existir.
 */
export async function findTaskByGcId(
  listId: string,
  idFieldId: string,
  gcId: string
): Promise<ExistingTask | null> {
  const filter = JSON.stringify([
    { field_id: idFieldId, operator: "=", value: gcId },
  ]);
  const url =
    `${config.clickup.baseUrl}/list/${listId}/task` +
    `?include_closed=true&custom_fields=${encodeURIComponent(filter)}`;

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    throw new Error(`ClickUp GET tasks (dedup) falhou: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as {
    tasks: {
      id: string;
      status?: { status?: string } | string;
      custom_fields?: { id: string; value?: unknown }[];
    }[];
  };
  const t = body.tasks?.[0];
  if (!t) return null;

  const status =
    typeof t.status === "string" ? t.status : t.status?.status ?? "";

  const fields = new Map<string, string>();
  for (const cf of t.custom_fields ?? []) {
    if (cf.value !== undefined && cf.value !== null && cf.value !== "") {
      fields.set(cf.id, String(cf.value));
    }
  }
  return { id: t.id, status: status.toLowerCase(), fields };
}

/** Atualiza o status de um card existente. */
export async function updateTaskStatus(taskId: string, status: string): Promise<void> {
  const res = await fetch(`${config.clickup.baseUrl}/task/${taskId}`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    throw new Error(`ClickUp PUT task (status) falhou: ${res.status} ${await res.text()}`);
  }
}

/** Define o valor de um custom field num card existente. */
export async function setTaskFieldValue(
  taskId: string,
  fieldId: string,
  value: unknown
): Promise<void> {
  const res = await fetch(
    `${config.clickup.baseUrl}/task/${taskId}/field/${fieldId}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ value }),
    }
  );
  if (!res.ok) {
    throw new Error(
      `ClickUp POST field falhou (campo ${fieldId}): ${res.status} ${await res.text()}`
    );
  }
}

export async function createTask(listId: string, input: CreateTaskInput): Promise<string> {
  const res = await fetch(`${config.clickup.baseUrl}/list/${listId}/task`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`ClickUp POST task falhou: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return body.id;
}
