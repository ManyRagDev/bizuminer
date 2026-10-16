interface TodayCommandCenterProps {
  autoPublish: boolean;
  minScore: number;
  captureDoneToday: boolean;
  triageDoneToday: boolean;
  approvedToday: number;
  selectionReady: boolean;
  selectionLabel: string;
  awaiting: number;
  held: number;
  deferred: number;
  auditRemaining: number;
}

export default function TodayCommandCenter(props: TodayCommandCenterProps) {
  const pending = props.awaiting + props.held;
  return (
    <section className="today-command-center" aria-labelledby="today-title">
      <header className="today-command-header">
        <div>
          <p className="eyebrow">Operação de hoje</p>
          <h1 id="today-title">
            {props.selectionReady
              ? "Seleção disponível para preparar a pauta"
              : pending
                ? "Resolva as pendências ou capture novas ofertas"
                : "Capture ofertas para ampliar a seleção"}
          </h1>
          <p>
            {props.selectionLabel}. Aprovação no catálogo e escolha dos
            destaques têm contagens próprias.
          </p>
        </div>
        <div
          className={`autopilot-status ${props.autoPublish ? "active" : "paused"}`}
        >
          <span>
            {props.autoPublish
              ? "Aprovação automática ativa"
              : "Aprovação humana"}
          </span>
          <small>
            {props.autoPublish
              ? `Aprova notas a partir de ${props.minScore}`
              : "A IA recomenda e você decide"}
          </small>
        </div>
      </header>
      <ol className="today-workflow" aria-label="Estado real da operação">
        <li className={props.captureDoneToday ? "done" : ""}>
          <span className="workflow-step-mark">1</span>
          <div>
            <strong>Descoberta</strong>
            <small>
              {props.captureDoneToday
                ? "ofertas capturadas hoje"
                : "sem descoberta concluída hoje"}
            </small>
          </div>
        </li>
        <li className={props.triageDoneToday ? "done" : ""}>
          <span className="workflow-step-mark">2</span>
          <div>
            <strong>Triagem</strong>
            <small>
              {props.triageDoneToday
                ? `${props.approvedToday} aprovados na última rodada de hoje`
                : "sem rodada concluída hoje"}
            </small>
          </div>
        </li>
        <li>
          <span className="workflow-step-mark">3</span>
          <div>
            <strong>Pendências</strong>
            <small>
              {props.awaiting} aguardando · {props.held} retidos ·{" "}
              {props.deferred} adiados
            </small>
          </div>
        </li>
        <li className={props.selectionReady ? "done" : ""}>
          <span className="workflow-step-mark">4</span>
          <div>
            <strong>Seleção e pauta</strong>
            <small>{props.selectionLabel}</small>
          </div>
        </li>
      </ol>
      <div className="today-primary-action">
        <a
          href={
            props.selectionReady ? "/pauta" : "/admin/curadoria?aba=selecao"
          }
        >
          {props.selectionReady ? "Preparar pauta" : "Abrir curadoria"} →
        </a>
        <a href="#captura-hoje">Capturar ofertas</a>
        {pending > 0 && (
          <a href="/admin/curadoria?aba=excecoes">
            Resolver pendências ({pending})
          </a>
        )}
      </div>
      <p className="curation-muted">
        O cron acompanha preços de produtos conhecidos. Qualidade da IA é uma
        amostra opcional
        {props.auditRemaining > 0
          ? ` com ${props.auditRemaining} produtos disponíveis para conferir`
          : ""}
        ; você pode{" "}
        <a href="/admin/curadoria?aba=auditoria">conferi-la separadamente</a>.
      </p>
    </section>
  );
}
