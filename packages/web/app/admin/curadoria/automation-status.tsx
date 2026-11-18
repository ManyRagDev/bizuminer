"use client";
import type { CurationAutomation } from "../../../lib/curation-automation.ts";
import { curationIssuesHref } from "../../../lib/curation-navigation.ts";
import {useOperationProgress} from '../use-operation-progress.ts';

export default function AutomationStatus({ automation:initial, tenantId, selectionLabel }: {
  automation: CurationAutomation; tenantId: string; selectionLabel: string;
}) {
  const {data,error}=useOperationProgress(tenantId);
  const current=data?.evaluation;
  const automation=current ? {...initial,queued:current.queued,running:current.running,uncertain:current.uncertain,
    assessed:current.recorded,exceptions:current.exceptions,checks:data?.preparation?.products??initial.checks} : initial;
  const query = new URLSearchParams({ conta: tenantId });
  return <section className="curation-start" aria-label="Curadoria automática">
    <p className="eyebrow">Processamento automático</p>
    <h2>Curadoria automática ativa</h2>
    {error&&<p role="alert">Não foi possível atualizar todo o processamento. O resumo conhecido abaixo pode estar desatualizado.</p>}
    <p>As capturas são avaliadas e comparadas pelo sistema. A avaliação e a escolha das ofertas para cada canal são etapas diferentes; a revisão editorial é opcional.</p>
    <dl className="curation-task-counts" aria-label="Situação da avaliação automática">
      <div><dt>Na fila de avaliação</dt><dd>{automation.queued}</dd></div>
      <div><dt>Em avaliação</dt><dd>{automation.running}</dd></div>
      <div><dt>Produtos com avaliação registrada</dt><dd>{automation.assessed}</dd></div>
    </dl>
    <p>{automation.running > 0 ? "Há avaliações em execução."
      : automation.queued > 0 ? "Há avaliações na fila; o início do processamento ainda não está confirmado."
        : "Não há avaliações na fila ou em execução nesta consulta."}</p>
    {automation.uncertain > 0 && <p>{automation.uncertain} avaliações têm resultado incerto e aguardam conferência. Elas não são repetidas automaticamente.</p>}
    {automation.checks > 0 && <p>{automation.checks} ofertas aguardam conferência antes de entrar na seleção.</p>}
    <p>{selectionLabel}. Produto aprovado no catálogo não tem destaque garantido.</p>
    <div className="curation-start-actions">
      {automation.uncertain > 0 && <a className="curation-primary-action" href={curationIssuesHref(tenantId)}>Conferir avaliações incertas · {automation.uncertain}</a>}
      <a href={`/pauta?${query}`}>Conferir pauta de divulgação →</a>
      <a href={`/admin/curadoria?aba=excecoes&${query}`}>Exceções editoriais · {automation.exceptions} · revisão opcional</a>
    </div>
    <p className="curation-start-note">Situação no momento da consulta. Novas capturas atualizam o fluxo; não é necessário iniciar a triagem antiga nem aprovar manualmente todo o catálogo.</p>
  </section>;
}
