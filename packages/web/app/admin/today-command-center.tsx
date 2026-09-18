import EmergencyApproval from "./emergency-approval";

interface TodayCommandCenterProps {
  autoPublish: boolean;
  minScore: number;
  captureDoneToday: boolean;
  triageDoneToday: boolean;
  publishedToday: number;
  auditReviewed: number;
  auditTarget: number;
  auditComplete: boolean;
  suggestedCandidateCount: number;
  suggestedCandidateExamples: string[];
}

export default function TodayCommandCenter({
  autoPublish,
  minScore,
  captureDoneToday,
  triageDoneToday,
  publishedToday,
  auditReviewed,
  auditTarget,
  auditComplete,
  suggestedCandidateCount,
  suggestedCandidateExamples,
}: TodayCommandCenterProps) {
  const steps = [
    { label: "Captura", done: captureDoneToday, detail: captureDoneToday ? "concluída hoje" : "aguardando" },
    { label: "Triagem IA", done: triageDoneToday, detail: triageDoneToday ? "concluída hoje" : captureDoneToday ? "próxima etapa" : "após a captura" },
    { label: "Seleção", done: triageDoneToday, detail: triageDoneToday ? `${publishedToday} publicados` : "aguardando IA" },
    { label: "Auditoria", done: auditComplete, detail: `${Math.min(auditReviewed, auditTarget)}/${auditTarget} revisados` },
    { label: "Pauta", done: false, detail: auditComplete ? "pronta para preparar" : "após a auditoria" },
  ];

  let actionHref = "#captura-hoje";
  let actionLabel = "Capturar ofertas de hoje";
  let title = "Comece pela captura das lojas";
  let description = "Selecione as fontes abaixo. Quando elas terminarem, a triagem começa automaticamente.";

  if (captureDoneToday && !triageDoneToday) {
    actionHref = "/admin/curadoria?aba=pipeline";
    actionLabel = "Ver estado da triagem";
    title = "A captura terminou; falta concluir a triagem";
    description = "As novas capturas já iniciam a IA automaticamente. Use o estado técnico apenas se ela não avançar.";
  } else if (triageDoneToday && !auditComplete) {
    actionHref = "/admin/curadoria?aba=auditoria";
    actionLabel = `Auditar ${Math.max(0, auditTarget - auditReviewed)} produtos`;
    title = `${publishedToday} produtos foram publicados pela IA`;
    description = "Revise uma amostra curta para acompanhar a qualidade do piloto automático.";
  } else if (auditComplete) {
    actionHref = "/pauta";
    actionLabel = "Preparar pauta de Stories";
    title = "Rotina de hoje concluída";
    description = "A captura, a triagem e a auditoria diária estão resolvidas. Agora você pode distribuir a seleção.";
  }

  return (
    <section className="today-command-center" aria-labelledby="today-title">
      <header className="today-command-header">
        <div>
          <p className="eyebrow">Hoje · próxima ação</p>
          <h1 id="today-title">{title}</h1>
          <p>{description}</p>
        </div>
        <div className={`autopilot-status ${autoPublish ? "active" : "paused"}`}>
          <span>{autoPublish ? "Piloto automático ativo" : "Aprovação manual"}</span>
          <small>{autoPublish ? `Publica notas ${minScore} e 5` : "A IA apenas recomenda"}</small>
        </div>
      </header>

      <ol className="today-workflow" aria-label="Etapas da rotina diária">
        {steps.map((step, index) => (
          <li key={step.label} className={step.done ? "done" : index === steps.findIndex((item) => !item.done) ? "current" : ""}>
            <span className="workflow-step-mark">{step.done ? "✓" : index + 1}</span>
            <div><strong>{step.label}</strong><small>{step.detail}</small></div>
          </li>
        ))}
      </ol>

      <div className="today-primary-action">
        <a href={actionHref}>{actionLabel} →</a>
        <span>Meta diária: cerca de 10–15 minutos de atenção humana.</span>
      </div>
      {triageDoneToday && (
        <EmergencyApproval count={suggestedCandidateCount} examples={suggestedCandidateExamples} />
      )}
    </section>
  );
}
