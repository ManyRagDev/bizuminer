export function selectionWorkflowState(
  input: {
    schemaReady: boolean;
    mode: "catalog" | "editorial" | "unavailable";
    count: number;
    validUntil: string | null;
  },
  now = new Date(),
): { ready: boolean; label: string } {
  if (!input.schemaReady || input.mode === "unavailable")
    return { ready: false, label: "Seleção indisponível" };
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
