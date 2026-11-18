/** The next task follows actual queues; zero AI candidates does not prove all captures were analyzed. */
export function curationNextStep(input: { triageEligible: number; awaiting: number; held: number; deferred: number;
  runningCaptures?: number; incompleteCaptures?: number; pautaCount?: number | null }) {
  if (input.triageEligible > 0) return {
    kind: "triage" as const,
    title: "Comece pela análise das capturas",
    description: "Analise os produtos disponíveis com a IA. Depois, confira os casos que precisam da sua decisão antes de preparar a divulgação.",
    href: null, action: null,
  };
  if (input.awaiting > 0 || input.held > 0) return {
    kind: "review" as const,
    title: "Há produtos esperando sua decisão",
    description: "Confira o produto, o preço e a opção de compra. Aprove o que merece uma indicação, rejeite o que não serve ou adie para conferir depois.",
    href: `/admin/curadoria?aba=excecoes&sub=${input.awaiting > 0 ? "singulars" : "retidos"}`,
    action: "Revisar produtos",
  };
  if (input.pautaCount != null && input.pautaCount > 0) return {
    kind: "pauta" as const,
    title: "Nenhuma revisão pendente agora",
    description: input.deferred > 0
      ? "Há produtos adiados para conferir depois. Abra a pauta para consultar as ofertas disponíveis para divulgação neste momento."
      : "Não há produtos disponíveis para análise automática nem revisão recente nesta conta. Abra a pauta para consultar as ofertas disponíveis. Capturas em andamento aparecem após a conclusão.",
    href: "/pauta", action: "Conferir pauta de divulgação",
  };
  if ((input.incompleteCaptures ?? 0) > 0) return {
    kind: "capture" as const,
    title: "Uma captura precisa ser concluída",
    description: "Há ofertas preparadas em uma rodagem incompleta. Elas ainda não atualizaram o catálogo nem entraram nas filas de análise. Confira a falha em Operação e Captura.",
    href: "/admin?aba=rodagens", action: "Conferir captura incompleta",
  };
  if ((input.runningCaptures ?? 0) > 0) return {
    kind: "capture" as const,
    title: "As capturas ainda estão em andamento",
    description: "Os produtos aparecem para análise após a confirmação da captura. Acompanhe a rodagem antes de iniciar outra.",
    href: "/admin?aba=rodagens", action: "Acompanhar capturas",
  };
  if (input.pautaCount == null) return {
    kind: "unavailable" as const,
    title: "A disponibilidade da pauta ainda precisa ser conferida",
    description: "As filas de análise e revisão estão vazias, mas não foi possível confirmar ofertas elegíveis para divulgação. Abra a pauta para conferir o estado do canal.",
    href: "/pauta", action: "Conferir disponibilidade da pauta",
  };
  return {
    kind: "blocked" as const,
    title: "A pauta ainda não tem ofertas elegíveis",
    description: "Aprovação no catálogo não garante entrada na pauta. As ofertas precisam de preço atual, opção e link de afiliado válidos. Confira os canais e os impedimentos antes de divulgar.",
    href: "/admin/curadoria?aba=selecao&configurar=canais", action: "Conferir canais e impedimentos",
  };
}

export function selectionWorkflowState(
  input: {
    schemaReady: boolean;
    mode: "catalog" | "editorial" | "unavailable";
    count: number;
    validUntil: string | null;
    homepageReady?: boolean;
  },
  now = new Date(),
): { ready: boolean; label: string } {
  if (!input.schemaReady || input.mode === "unavailable")
    return { ready: false, label: "Seleção indisponível" };
  if (input.mode === "catalog" && !input.homepageReady && input.count === 0)
    return { ready: false, label: "Catálogo disponível · destaques ainda não preparados" };
  if (
    input.mode === "editorial" &&
    (!input.validUntil ||
      !Number.isFinite(Date.parse(input.validUntil)) ||
      Date.parse(input.validUntil) <= now.getTime())
  ) {
    return { ready: false, label: "Edição vencida ou retirada" };
  }
  if (input.count === 0)
    return { ready: false, label: "Sem produtos selecionados" };
  return {
    ready: true,
    label: `${input.count} produtos · ${input.mode === "catalog" ? "seleção automática" : "edição editorial"}`,
  };
}
