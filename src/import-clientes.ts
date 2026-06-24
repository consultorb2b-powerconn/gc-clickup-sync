/**
 * import-clientes.ts
 * --------------------------------------------------------------------------
 * Carga única: GestãoClick (clientes) -> ClickUp (List "Clientes").
 *
 * - Roda na SUA máquina (a rede do GestãoClick não é acessível do meu ambiente).
 * - Reaproveita os tokens do projeto gc-clickup-sync (mesmo .env).
 * - Deduplica por ID GestãoClick (campo de texto na List Clientes).
 * - Resolve os custom fields por NOME em runtime (sem IDs chumbados),
 *   então qualquer campo novo na lista é detectado automaticamente.
 *
 * Como rodar (PowerShell), DOIS comandos separados:
 *
 *   # 1) Validar SEM gravar nada (recomendado primeiro):
 *   npx tsx src/import-clientes.ts --dry-run
 *
 *   # 2) Gravar de verdade:
 *   npx tsx src/import-clientes.ts
 *
 * .env esperado (mesmas chaves do gc-clickup-sync):
 *   GC_ACCESS_TOKEN=...            (header access-token)
 *   GC_SECRET_TOKEN=...            (header secret-access-token)
 *   CLICKUP_TOKEN=...              (token pessoal do ClickUp; aceita CU_TOKEN / CLICKUP_API_TOKEN)
 *
 * Opcionais:
 *   GC_BASE_URL=...                (default https://api.beteltecnologia.com — CONFIRME no seu src/gestaoclick.ts)
 *   CLICKUP_CLIENTES_LIST_ID=...   (default 901714722374)
 * --------------------------------------------------------------------------
 */

import 'dotenv/config';

// ----------------------------- Config --------------------------------------

const GC_BASE = (process.env.GC_BASE_URL || 'https://api.beteltecnologia.com').replace(/\/+$/, '');
const GC_ACCESS = process.env.GC_ACCESS_TOKEN || '';
const GC_SECRET = process.env.GC_SECRET_TOKEN || '';

const CU_TOKEN =
  process.env.CLICKUP_TOKEN || process.env.CU_TOKEN || process.env.CLICKUP_API_TOKEN || '';
const CU_LIST = process.env.CLICKUP_CLIENTES_LIST_ID || '901714722374';
const CU_BASE = 'https://api.clickup.com/api/v2';

const DRY_RUN = process.argv.includes('--dry-run');

// Throttles (segurança contra rate-limit)
const GC_GAP_MS = 400; // GestãoClick: ~2.5 req/s (limite ~3/s)
const CU_GAP_MS = 700; // ClickUp: ~1.4 req/s (limite ~100/min no Free)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function die(msg: string): never {
  console.error(`\n[ERRO] ${msg}\n`);
  process.exit(1);
}

if (!GC_ACCESS || !GC_SECRET) die('Faltam GC_ACCESS_TOKEN / GC_SECRET_TOKEN no .env.');
if (!CU_TOKEN) die('Falta o token do ClickUp no .env (CLICKUP_TOKEN / CU_TOKEN / CLICKUP_API_TOKEN).');

// --------------------------- GestãoClick ------------------------------------

async function gcGet(path: string, params: Record<string, string | number> = {}): Promise<any> {
  const url = new URL(GC_BASE + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: {
        'access-token': GC_ACCESS,
        'secret-access-token': GC_SECRET,
        'Content-Type': 'application/json',
      },
    });

    if (res.status === 429) {
      const wait = 1500 * (attempt + 1);
      console.warn(`[gc] 429 rate-limit, aguardando ${wait}ms...`);
      await sleep(wait);
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`GestãoClick GET ${path} falhou: ${res.status} ${text}`);
    }
    return JSON.parse(text);
  }
}

async function fetchAllClientes(): Promise<any[]> {
  const out: any[] = [];
  let pagina = 1;
  let loggedSample = false;

  while (true) {
    const json = await gcGet('/clientes', { pagina });
    // GestãoClick costuma devolver { code, status, meta, data: [...] }
    const data: any[] = json.data ?? json.clientes ?? [];

    if (!loggedSample && data[0]) {
      console.log('[gc] chaves do 1º cliente (para conferência de mapeamento):');
      console.log('     ' + Object.keys(data[0]).join(', '));
      loggedSample = true;
    }

    out.push(...data);
    console.log(`[gc] página ${pagina}: +${data.length} (acumulado ${out.length})`);

    const prox = json.meta?.proxima_pagina;
    if (!prox || data.length === 0) break;
    pagina++;
    await sleep(GC_GAP_MS);
  }
  return out;
}

// ------------------------------ ClickUp -------------------------------------

async function cuFetch(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(CU_BASE + path, {
    ...init,
    headers: {
      Authorization: CU_TOKEN, // token pessoal: vai direto, SEM "Bearer"
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (res.status === 429) {
    console.warn('[cu] 429 rate-limit, aguardando 3s...');
    await sleep(3000);
    return cuFetch(path, init);
  }
  if (!res.ok) throw new Error(`ClickUp ${init.method || 'GET'} ${path} falhou: ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

type FieldMap = {
  byName: Map<string, any>;
  tipoOption: (label: 'PF' | 'PJ') => string | undefined;
};

async function loadListFields(): Promise<FieldMap> {
  const json = await cuFetch(`/list/${CU_LIST}/field`);
  const fields: any[] = json.fields || [];
  const byName = new Map<string, any>();
  for (const f of fields) byName.set(String(f.name).trim().toLowerCase(), f);

  const tipo = byName.get('tipo');
  const tipoOption = (label: 'PF' | 'PJ') =>
    tipo?.type_config?.options?.find((o: any) => o.name === label)?.id;

  // Aviso se algum campo esperado não existir
  for (const n of ['ID GestãoClick', 'Tipo', 'CPF/CNPJ', 'Telefone', 'E-mail', 'Cidade/UF', 'Endereço']) {
    if (!byName.get(n.toLowerCase())) console.warn(`[cu] aviso: campo "${n}" não encontrado na lista.`);
  }
  return { byName, tipoOption };
}

async function fetchExistingGcIds(gcFieldId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let page = 0;
  while (true) {
    const json = await cuFetch(`/list/${CU_LIST}/task?page=${page}&include_closed=true&subtasks=false`);
    const tasks: any[] = json.tasks || [];
    for (const t of tasks) {
      const cf = (t.custom_fields || []).find((f: any) => f.id === gcFieldId);
      if (cf && cf.value != null && String(cf.value).trim() !== '') ids.add(String(cf.value).trim());
    }
    if (json.last_page || tasks.length === 0) break;
    page++;
  }
  return ids;
}

// --------------------------- Mapeamento -------------------------------------

function pick(obj: any, keys: string[]): string {
  for (const k of keys) {
    const v = obj?.[k];
    if (v != null && typeof v !== 'object' && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

// GestãoClick embrulha cada endereço: enderecos: [ { endereco: { ... } } ]
function firstEndereco(c: any): any {
  let e = Array.isArray(c?.enderecos) ? c.enderecos[0] : c?.endereco;
  if (e && typeof e === 'object' && e.endereco && typeof e.endereco === 'object') e = e.endereco;
  return e && typeof e === 'object' ? e : {};
}

function buildEndereco(c: any): string {
  const e = firstEndereco(c);
  const logradouro = pick(e, ['logradouro', 'rua', 'endereco']);
  const numero = pick(e, ['numero', 'num']);
  const complemento = pick(e, ['complemento']);
  const bairro = pick(e, ['bairro']);
  const cep = pick(e, ['cep']);

  const linha1 = [logradouro, numero].filter(Boolean).join(', ');
  const partes = [linha1, complemento, bairro].filter(Boolean).join(' - ');
  return [partes, cep && `CEP ${cep}`].filter(Boolean).join(' - ').trim();
}

function buildCidadeUf(c: any): string {
  const e = firstEndereco(c);
  const cidade =
    pick(c, ['cidade', 'nome_cidade', 'nome_municipio', 'municipio']) ||
    pick(e, ['cidade', 'nome_cidade', 'nome_municipio', 'municipio']);
  const uf = pick(c, ['estado', 'uf']) || pick(e, ['estado', 'uf']);
  if (cidade && uf) return `${cidade}/${uf}`;
  return cidade || uf || '';
}

function normPhone(p: string): string {
  if (!p) return '';
  const d = p.replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55')) return '+' + d;
  if (d.length === 10 || d.length === 11) return '+55' + d;
  return '+' + d;
}

interface MappedClient {
  gcId: string;
  nome: string;
  tipo: 'PF' | 'PJ' | '';
  doc: string;
  telefone: string;
  email: string;
  cidadeUf: string;
  endereco: string;
}

function mapCliente(c: any): MappedClient {
  const gcId = String(c?.id ?? c?.cliente_id ?? '').trim();
  const cnpj = pick(c, ['cnpj']);
  const cpf = pick(c, ['cpf']);

  let tipoRaw = pick(c, ['tipo_pessoa', 'tipo']).toUpperCase();
  let tipo: 'PF' | 'PJ' | '' = '';
  if (tipoRaw.includes('J') || (!tipoRaw && cnpj)) tipo = 'PJ';
  else if (tipoRaw.includes('F') || (!tipoRaw && cpf)) tipo = 'PF';

  const nome = pick(c, ['nome', 'razao_social', 'nome_fantasia']) || `Cliente ${gcId}`;
  const emailRaw = pick(c, ['email', 'email_secundario']);

  return {
    gcId,
    nome,
    tipo,
    doc: cnpj || cpf || '',
    telefone: normPhone(pick(c, ['celular', 'telefone', 'fone', 'telefone_comercial'])),
    email: emailRaw.includes('@') ? emailRaw : '',
    cidadeUf: buildCidadeUf(c),
    endereco: buildEndereco(c),
  };
}

// ------------------------------- Main ---------------------------------------

async function main() {
  console.log(`\n=== Importar clientes GestãoClick -> ClickUp ${DRY_RUN ? '(DRY-RUN)' : ''} ===`);
  console.log(`Lista alvo: ${CU_LIST}`);
  console.log(`GC base: ${GC_BASE}\n`);

  const fmap = await loadListFields();
  const fId = (n: string) => fmap.byName.get(n.toLowerCase())?.id as string | undefined;

  const gcFieldId = fId('ID GestãoClick');
  if (!gcFieldId) die('Campo "ID GestãoClick" não existe na lista — necessário para dedup.');

  console.log('[cu] lendo cards existentes para dedup...');
  const existing = await fetchExistingGcIds(gcFieldId);
  console.log(`[cu] já existem ${existing.size} clientes com ID GestãoClick.\n`);

  console.log('[gc] buscando clientes...');
  const clientes = await fetchAllClientes();
  console.log(`\n[gc] total de clientes no GestãoClick: ${clientes.length}`);

  if (DRY_RUN && clientes[0]) {
    console.log('[gc] enderecos cru do 1º cliente (para conferência):');
    console.log('     ' + JSON.stringify(clientes[0].enderecos));
  }

  const mapped = clientes.map(mapCliente).filter((m) => m.gcId);
  const novos = mapped.filter((m) => !existing.has(m.gcId));
  console.log(`[plano] novos a criar: ${novos.length} | já existentes (pulados): ${mapped.length - novos.length}\n`);

  // Amostra para conferência
  console.log('[amostra] primeiros 3 mapeados:');
  for (const m of novos.slice(0, 3)) console.log('   ', JSON.stringify(m));
  console.log('');

  if (DRY_RUN) {
    console.log('DRY-RUN: nada foi gravado. Confira o mapeamento acima e rode sem --dry-run para criar.');
    return;
  }

  const tipoFieldId = fId('Tipo');
  const docFieldId = fId('CPF/CNPJ');
  const telFieldId = fId('Telefone');
  const mailFieldId = fId('E-mail');
  const cidadeFieldId = fId('Cidade/UF');
  const endFieldId = fId('Endereço');

  let ok = 0;
  let fail = 0;

  for (const m of novos) {
    const custom_fields: { id: string; value: string }[] = [];
    const add = (id: string | undefined, value: string) => {
      if (id && value) custom_fields.push({ id, value });
    };
    add(gcFieldId, m.gcId);
    add(docFieldId, m.doc);
    add(telFieldId, m.telefone);
    add(mailFieldId, m.email);
    add(cidadeFieldId, m.cidadeUf);
    add(endFieldId, m.endereco);
    if (m.tipo) {
      const optId = fmap.tipoOption(m.tipo);
      if (tipoFieldId && optId) custom_fields.push({ id: tipoFieldId, value: optId });
    }

    // Cria com retry: se o ClickUp recusar telefone (FIELD_016) ou e-mail
    // (FIELD_015), remove só o campo inválido e tenta de novo.
    let fields = [...custom_fields];
    let dropped: string[] = [];
    let created = false;
    let lastErr = '';

    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      try {
        await cuFetch(`/list/${CU_LIST}/task`, {
          method: 'POST',
          body: JSON.stringify({ name: m.nome, custom_fields: fields }),
        });
        created = true;
      } catch (e: any) {
        lastErr = e.message || String(e);
        if (lastErr.includes('FIELD_016') && telFieldId && fields.some((f) => f.id === telFieldId)) {
          fields = fields.filter((f) => f.id !== telFieldId);
          dropped.push('telefone');
          continue;
        }
        if (lastErr.includes('FIELD_015') && mailFieldId && fields.some((f) => f.id === mailFieldId)) {
          fields = fields.filter((f) => f.id !== mailFieldId);
          dropped.push('e-mail');
          continue;
        }
        break; // erro não tratável
      }
    }

    if (created) {
      ok++;
      const note = dropped.length ? ` (sem ${dropped.join(' e ')} — inválido no GestãoClick)` : '';
      console.log(`[ok] ${m.gcId} — ${m.nome}${note}`);
    } else {
      fail++;
      console.error(`[falha] ${m.gcId} — ${m.nome}: ${lastErr}`);
    }
    await sleep(CU_GAP_MS);
  }

  console.log(`\n=== Concluído: ${ok} criados, ${fail} falhas, ${mapped.length - novos.length} já existiam. ===`);
}

main().catch((e) => die(e?.stack || e?.message || String(e)));
