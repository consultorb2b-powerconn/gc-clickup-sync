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

/**
 * Verifica se já existe um card na lista cujo custom field "ID GestãoClick"
 * é igual ao id informado. É a nossa trava de deduplicação (idempotência).
 */
export async function taskExistsByGcId(
  listId: string,
  idFieldId: string,
  gcId: string
): Promise<boolean> {
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
  const body = (await res.json()) as { tasks: unknown[] };
  return (body.tasks?.length ?? 0) > 0;
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
