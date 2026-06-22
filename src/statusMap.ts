// De-para: situacao_id do GestãoClick -> status do ClickUp (to do / in progress / complete).
// Mão única (GestãoClick manda). É só uma tabela — ajuste à vontade.
// Situações não listadas aqui NÃO alteram o status do card (segurança).

export type ClickUpStatus = "to do" | "in progress" | "complete";

const MAP: Record<string, ClickUpStatus> = {
  // --- to do (chegou, ainda não trabalhado) ---
  "6155342": "to do", // ENTRADA/ PRÉ ANALISE
  "5811003": "to do", // Em aberto (legado)
  "5810999": "to do", // Em aberto (legado)

  // --- in progress (em trabalho / aguardando etapa) ---
  "9123792": "in progress", // EM ANALISE
  "8910314": "in progress", // ENVIAR EMAIL
  "5810995": "in progress", // EM APROVAÇÃO
  "9123813": "in progress", // APROVADO/ AG. MANUTENÇÃO
  "5810996": "in progress", // EM MANUTENÇÃO/ BANCADA
  "6345313": "in progress", // AGUARDANDO COMPONENTE
  "5995833": "in progress", // ATUALIZAÇÃO FW
  "7183929": "in progress", // TESTE / PRÉ ENVIO
  "9123815": "in progress", // FATURAR / AVULSO
  "9135852": "in progress", // FATURAR CONTRATO/ DESPACHADO
  "9123949": "in progress", // FATURAR / RET. SEM RESPOSTA
  "9123930": "in progress", // FATURAR/ NÃO APROVADOS
  "9123852": "in progress", // SERV. FINALIZADO / AG. NF RETORNO
  "9123854": "in progress", // NF RET. / AUTORIZADO
  "9123911": "in progress", // LIBERADO/ EMBALAGEM PRÉ POSTAGEM
  "7322770": "in progress", // AGUARDANDO ENVIO
  "8519526": "in progress", // INTERNO
  "5811007": "in progress", // Aguardando pagamento (legado)
  "5811008": "in progress", // Pagamento confirmado (legado)
  "5811009": "in progress", // Pedido embalado (legado)
  "5811011": "in progress", // Pedido enviado (legado)
  "5811000": "in progress", // Em andamento (legado)
  "5811004": "in progress", // Em andamento (legado)

  // --- complete (finalizado / cancelado / retornado = fim da operação) ---
  "9123891": "complete", // FINALIZADO/ AVULSO
  "7222674": "complete", // FINALIZADO EM CONTRATO
  "5810997": "complete", // FINALIZADO
  "7215392": "complete", // FINALIZADO SEM CUSTO
  "6162740": "complete", // FINALIZADO EM GARANTIA
  "5996034": "complete", // CANCELADA
  "6341882": "complete", // T4- SEM MANUTENÇÃO
  "9135850": "complete", // T5/ DESCONTINUADO
  "8138949": "complete", // RETORNO/ SEM AVARIAS
  "8518151": "complete", // RETORNO/ SEM APROVAÇÃO
  "6368825": "complete", // RETORNO/ NÃO APROVADO
  "8517728": "complete", // RETORNO SEM MANUTENÇÃO
  "5811012": "complete", // Pedido entregue (legado)
  "5811005": "complete", // Concretizado (legado)
  "5811001": "complete", // Concretizada (legado)
  "5811006": "complete", // Cancelado (legado)
  "5811002": "complete", // Cancelada (legado)
  "5811010": "complete", // Pedido cancelado (legado)
  // Não mapeados (ex.: "00" 9139534, "000" 9139590): card não muda de status.
};

/** Retorna o status ClickUp para a situação, ou undefined se não mapeada. */
export function statusForSituacao(situacaoId: string | null | undefined): ClickUpStatus | undefined {
  if (!situacaoId) return undefined;
  return MAP[situacaoId];
}
