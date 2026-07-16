/**
 * statusMapContrato.ts — De-para situacao_id (GestaoClick) -> status do fluxo de
 * CONTRATO no ClickUp (secao 10 do mapeamento), com nomes encurtados (~20 chars).
 *
 * 18 status: os 16 da secao 10 + "Retornado s/ Reparo" (situacoes de retorno sem
 * reparo, ~136 OS) + "Enviar E-mail" (situacao ENVIAR EMAIL 8910314; existe nas
 * listas CPFL e Neo — a Conecta nunca passa por essa situacao).
 *
 * Situacoes nao mapeadas (ex.: ATUALIZACAO FW 5995833) -> o sync NAO mexe no
 * status do card (mesma regra do fluxo Avulso).
 */
/** Os 18 status do fluxo de Contrato (nomes EXATOS a criar no ClickUp). */
export const STATUS_CONTRATO = [
  "Entrada e Pré-Análise",       // 1  Not started
  "Pré-Análise Finalizada",      // 2  Not started
  "Análise – Montar O.S.",       // 3  Active   (en-dash)
  "Enviar E-mail",               // 4  Active   (NOVO; CPFL e Neo)
  "Retornar T4/T5",              // 5  Active
  "Aguardando Aprovação",        // 6  Active
  "Aprovado p/ Manutenção",      // 7  Active
  "Aguardando Componentes",      // 8  Active
  "Em Manutenção (Fila)",        // 9  Active
  "Em Bancada (Semana)",         // 10 Active
  "Em Teste Pré-Envio",          // 11 Active
  "Serv. Fim – Ag. NF",          // 12 Active   (en-dash)
  "NF Retorno Autorizada",       // 13 Active
  "Embalagem/Pré-Postagem",      // 14 Active
  "Concluído / Enviado",         // 15 Active
  "Faturar Contrato",            // 16 Active
  "Finalizado Contrato",         // 17 Closed
  "Retornado s/ Reparo",         // 18 Active
] as const;
/** situacao_id -> nome do status de contrato. */
export const SITUACAO_TO_STATUS_CONTRATO: Record<string, string> = {
  // --- compartilhadas de reparo (cobertura, mesmo sem dados hoje) ---
  "6155342": "Entrada e Pré-Análise",        // ENTRADA/ PRE ANALISE
  "9123792": "Análise – Montar O.S.",        // EM ANALISE
  "8910314": "Enviar E-mail",                // ENVIAR EMAIL (CPFL/Neo; Conecta nao usa)
  "9135850": "Retornar T4/T5",               // T5/ DESCONTINUADO
  "5810995": "Aguardando Aprovação",         // EM APROVACAO
  "9123813": "Aprovado p/ Manutenção",       // APROVADO/ AG. MANUTENCAO
  "6345313": "Aguardando Componentes",       // AGUARDANDO COMPONENTE
  "5810996": "Em Manutenção (Fila)",         // EM MANUTENCAO/ BANCADA
  "7183929": "Em Teste Pré-Envio",           // TESTE / PRE ENVIO
  "9123852": "Serv. Fim – Ag. NF",           // SERV. FINALIZADO / AG. NF RETORNO
  "9123854": "NF Retorno Autorizada",        // NF RET. / AUTORIZADO
  "9123911": "Embalagem/Pré-Postagem",       // LIBERADO/ EMBALAGEM PRE POSTAGEM
  "7322770": "Embalagem/Pré-Postagem",       // AGUARDANDO ENVIO
  // --- T4 (perda total) -> mesmo destino do T5 ---
  "6341882": "Retornar T4/T5",               // T4- SEM MANUTENCAO
  // --- faturamento / finalizacao de contrato ---
  "9135852": "Faturar Contrato",             // FATURAR CONTRATO/ DESPACHADO
  "7222674": "Finalizado Contrato",          // FINALIZADO EM CONTRATO
  "6162740": "Finalizado Contrato",          // FINALIZADO EM GARANTIA
  "7215392": "Finalizado Contrato",          // FINALIZADO SEM CUSTO
  "5810997": "Finalizado Contrato",          // FINALIZADO
  // --- retornos sem reparo -> status dedicado ---
  "6368825": "Retornado s/ Reparo",          // RETORNO/ NAO APROVADO
  "8518151": "Retornado s/ Reparo",          // RETORNO/ SEM APROVACAO
  "8517728": "Retornado s/ Reparo",          // RETORNO SEM MANUTENCAO
  // SEM mapeamento (sync nao mexe): 5995833 ATUALIZACAO FW
};
/** Devolve o status de contrato para uma situacao, ou null se nao mapeada. */
export function statusForSituacaoContrato(situacaoId: string | number | undefined | null): string | null {
  if (situacaoId == null) return null;
  return SITUACAO_TO_STATUS_CONTRATO[String(situacaoId)] ?? null;
}
