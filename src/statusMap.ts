/**
 * De-para entre a situação da OS no GestãoClick (situacao_id) e o status
 * no ClickUp (lista OS – Avulso, 19 status do fluxo Avulso).
 *
 * - Os VALORES precisam bater (case-insensitive) com o NOME do status criado no ClickUp.
 * - situacao_id NÃO listado aqui => statusForSituacao retorna undefined => o sync
 *   NÃO altera o status do card (fica como está / como o usuário deixou).
 *
 * Situações de CONTRATO (FATURAR CONTRATO, FINALIZADO EM CONTRATO/GARANTIA/SEM CUSTO)
 * e situações de pedido/e-commerce legadas ("Em aberto", "Pedido enviado", etc.)
 * ficam de fora de propósito.
 */

/** Os 19 status do fluxo Avulso (nomes exatamente como criados no ClickUp).
 *  Alguns foram encurtados por causa do limite de ~20 caracteres do ClickUp. */
export const STATUS_AVULSO = {
  ENTRADA: "Entrada e Pré-Análise",
  PRE_ANALISE_OK: "Pré-Análise Finalizada",
  ANALISE: "Análise – Montar O.S.",
  RETORNAR_T4_T5: "Retornar T4/T5",
  AG_APROVACAO: "Aguardando Aprovação",
  COBRAR_NAO_APROVADO: "Cobrar – Não Aprovado",
  COBRAR_SEM_RESPOSTA: "Cobrar – Sem Resposta",
  LIBERADO_RETORNO: "Liberado para Retorno",
  RETORNADO_EMBALAGEM: "Retornado s/ Reparo",
  APROVADO_MANUTENCAO: "Aprovado p/ Manutenção",
  AG_COMPONENTES: "Aguardando Componentes",
  EM_MANUTENCAO_FILA: "Em Manutenção (Fila)",
  EM_BANCADA: "Em Bancada (Semana)",
  EM_TESTE: "Em Teste Pré-Envio",
  SERV_FINALIZADO_NF: "Serv. Fim – Ag. NF",
  NF_AUTORIZADA: "NF Retorno Autorizada",
  FATURAR_AVULSO: "Faturar Avulso",
  EMBALAGEM_POSTAGEM: "Embalagem/Pré-Postagem",
  FINALIZADO: "Finalizado / Enviado",
} as const;

/**
 * situacao_id (GestãoClick) -> nome do status (ClickUp).
 * Mapeadas: 23 situações. Sem mapeamento de propósito: ENVIAR EMAIL (8910314),
 * ATUALIZAÇÃO FW (5995833) — etapas que não têm status equivalente.
 */
const SITUACAO_TO_STATUS: Record<string, string> = {
  "6155342": STATUS_AVULSO.ENTRADA,                 // ENTRADA/ PRÉ ANALISE
  "9123792": STATUS_AVULSO.ANALISE,                 // EM ANALISE
  "9135850": STATUS_AVULSO.RETORNAR_T4_T5,          // T5/ DESCONTINUADO
  "6341882": STATUS_AVULSO.RETORNAR_T4_T5,          // T4- SEM MANUTENÇÃO
  "5810995": STATUS_AVULSO.AG_APROVACAO,            // EM APROVAÇÃO
  "6368825": STATUS_AVULSO.COBRAR_NAO_APROVADO,     // RETORNO/ NÃO APROVADO
  "8518151": STATUS_AVULSO.COBRAR_NAO_APROVADO,     // RETORNO/ SEM APROVAÇÃO
  "9123930": STATUS_AVULSO.COBRAR_NAO_APROVADO,     // FATURAR/ NÃO APROVADOS
  "9123949": STATUS_AVULSO.COBRAR_SEM_RESPOSTA,     // FATURAR / RET. SEM RESPOSTA
  "9123813": STATUS_AVULSO.APROVADO_MANUTENCAO,     // APROVADO/ AG. MANUTENÇÃO
  "6345313": STATUS_AVULSO.AG_COMPONENTES,          // AGUARDANDO COMPONENTE
  "5810996": STATUS_AVULSO.EM_MANUTENCAO_FILA,      // EM MANUTENÇÃO/ BANCADA
  "7183929": STATUS_AVULSO.EM_TESTE,                // TESTE / PRÉ ENVIO
  "9123852": STATUS_AVULSO.SERV_FINALIZADO_NF,      // SERV. FINALIZADO / AG. NF RETORNO
  "9123854": STATUS_AVULSO.NF_AUTORIZADA,           // NF RET. / AUTORIZADO
  "9123815": STATUS_AVULSO.FATURAR_AVULSO,          // FATURAR / AVULSO
  "8517728": STATUS_AVULSO.RETORNADO_EMBALAGEM,     // RETORNO SEM MANUTENÇÃO
  "8138949": STATUS_AVULSO.RETORNADO_EMBALAGEM,     // RETORNO/ SEM AVARIAS
  "9123911": STATUS_AVULSO.EMBALAGEM_POSTAGEM,      // LIBERADO/ EMBALAGEM PRÉ POSTAGEM
  "7322770": STATUS_AVULSO.EMBALAGEM_POSTAGEM,      // AGUARDANDO ENVIO
  "9123891": STATUS_AVULSO.FINALIZADO,              // FINALIZADO/ AVULSO
};

/**
 * Retorna o nome do status do ClickUp para a situação da OS, ou undefined
 * se a situação não está mapeada (nesse caso o sync não mexe no status).
 */
export function statusForSituacao(situacaoId: string | null): string | undefined {
  if (!situacaoId) return undefined;
  return SITUACAO_TO_STATUS[String(situacaoId)];
}
