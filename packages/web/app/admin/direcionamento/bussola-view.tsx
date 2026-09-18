"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type {
  EditorialGuidelineConfig,
  GoldenExample,
} from "../../../lib/editorial-compass.ts";
import { saveEditorialGuidelineAction } from "./actions.ts";

const PROMPT_SUGGESTIONS = [
  { label: "+ Gadgets e presentes criativos", text: "Privilegiar gadgets inteligentes, presentes criativos e novidades práticas com forte apelo visual." },
  { label: "+ Soluções para o cotidiano", text: "Focar em produtos que resolvem pequenas dores diárias de organização, cozinha e tecnologia pessoal." },
  { label: "+ Filtrar peças industriais", text: "Descartar peças de reposição avulsas, parafusos, insumos industriais secos e componentes sem apelo popular." },
  { label: "+ Ticket atrativo", text: "Dar preferência a ofertas com ticket percebido vantajoso e boa percepção de custo-benefício." },
];

export default function BussolaView({
  initialGuideline,
  goldenExamples,
}: {
  initialGuideline: EditorialGuidelineConfig;
  goldenExamples: GoldenExample[];
}) {
  const router = useRouter();
  const [guideline, setGuideline] = useState(initialGuideline.guideline);
  const [autoPublish, setAutoPublish] = useState(initialGuideline.autoPublish);
  const [minScore, setMinScore] = useState(initialGuideline.minScoreAutoPublish);
  const [isSaving, startSaving] = useTransition();
  const [saveFeedback, setSaveFeedback] = useState<{ msg: string; isError?: boolean } | null>(null);

  const handleAppendSuggestion = (text: string) => {
    setGuideline((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return text;
      if (trimmed.includes(text)) return prev;
      return `${trimmed}\n\n• ${text}`;
    });
  };

  const handleSave = () => {
    setSaveFeedback(null);
    startSaving(async () => {
      const res = await saveEditorialGuidelineAction({
        guideline,
        autoPublish,
        minScore,
      });
      if (res.ok) {
        setSaveFeedback({ msg: "Diretrizes e regras do piloto salvas com sucesso!" });
        router.refresh();
        setTimeout(() => setSaveFeedback(null), 4000);
      } else {
        setSaveFeedback({ msg: `Erro ao salvar: ${res.error}`, isError: true });
      }
    });
  };

  return (
    <div className="bussola-reborn-container">
      <nav className="section-local-nav" aria-label="Configurações">
        <a className="active" href="/admin/curadoria?aba=bussola">Critérios e automação</a>
        <a href="/admin?aba=afiliados">Contas de afiliados</a>
      </nav>
      {/* 1. Cockpit de Automação & Piloto Automático (Largura Total Alinhada) */}
      <section className="bussola-cockpit-hero" aria-labelledby="cockpit-heading">
        <div className="cockpit-hero-top">
          <div className="cockpit-hero-identity">
            <span className="cockpit-hero-badge">Centro de Inteligência Editorial</span>
            <h2 id="cockpit-heading">🚀 Piloto Automático & Automação de Vitrine</h2>
            <p>
              Defina o comportamento do pipeline: quando ativo, produtos que alcançarem a nota de corte são publicados automaticamente, sem esteira de aprovação manual.
            </p>
          </div>

          <div className="cockpit-hero-status">
            <span className={`cockpit-status-pill ${autoPublish ? "active" : "paused"}`}>
              {autoPublish ? "🟢 Piloto em Operação" : "⚪ Piloto em Pausa (Manual)"}
            </span>
          </div>
        </div>

        {/* Barra de Controles Principais */}
        <div className="cockpit-controls-strip">
          {/* Controle A: Chave Liga/Desliga */}
          <div className="cockpit-control-cell">
            <span className="control-cell-eyebrow">Modo de Publicação</span>
            <label className="cockpit-switch-label">
              <input
                type="checkbox"
                checked={autoPublish}
                onChange={(e) => setAutoPublish(e.target.checked)}
                className="cockpit-switch-input"
              />
              <span className="cockpit-switch-track" aria-hidden="true">
                <span className="cockpit-switch-thumb" />
              </span>
              <span className="cockpit-switch-text">
                <strong>{autoPublish ? "Auto-Publicação Ativa" : "Aprovação Manual"}</strong>
                <small>{autoPublish ? "Aprovados da IA vão direto ao site" : "Todas as ofertas exigem julgamento"}</small>
              </span>
            </label>
          </div>

          {/* Controle B: Nota Mínima de Corte */}
          <div className="cockpit-control-cell">
            <span className="control-cell-eyebrow">Nota Mínima de Corte</span>
            <div className="cockpit-score-box">
              <select
                id="min-score-select"
                className="cockpit-score-select"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                disabled={!autoPublish}
              >
                <option value={3}>⭐⭐⭐ 3 estrelas (Mais permissivo)</option>
                <option value={4}>⭐⭐⭐⭐ 4 estrelas (Recomendado · Alta qualidade)</option>
                <option value={5}>⭐⭐⭐⭐⭐ 5 estrelas (Ultrarrigoroso · Apenas pérolas)</option>
              </select>
              <span className="cockpit-score-hint">
                {minScore >= 4 ? "Garante vitrine limpa e achados relevantes" : "Permite maior volume de produtos"}
              </span>
            </div>
          </div>

          {/* Controle C: Ação Direta para Pipeline */}
          <div className="cockpit-control-cell action-cell">
            <span className="control-cell-eyebrow">Execução de Lotes</span>
            <a href="/admin/curadoria?aba=pipeline" className="cockpit-pipeline-btn">
              <span>⚡ Ir para o Pipeline de Triagem</span>
              <small>Disparar IA sobre pendentes →</small>
            </a>
          </div>
        </div>

        {/* Régua de Proteções do Funil */}
        <div className="cockpit-safeguards-strip">
          <div className="safeguard-pill">
            <span className="safeguard-icon" aria-hidden="true">🛡️</span>
            <div>
              <strong>Piso de Valor R$ 20</strong>
              <small>Itens de valor baixo bloqueados</small>
            </div>
          </div>
          <div className="safeguard-pill">
            <span className="safeguard-icon" aria-hidden="true">🔄</span>
            <div>
              <strong>Anti-Saturação</strong>
              <small>Máx. 3 variações por produto</small>
            </div>
          </div>
          <div className="safeguard-pill">
            <span className="safeguard-icon" aria-hidden="true">🧹</span>
            <div>
              <strong>Filtro de Insumos</strong>
              <small>Peças e cabos secos rejeitados</small>
            </div>
          </div>
          <div className="safeguard-pill">
            <span className="safeguard-icon" aria-hidden="true">🎯</span>
            <div>
              <strong>Spot-Check Ativo</strong>
              <small>12 itens por dia em cerca de 10–15 min</small>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Diretrizes Editoriais Vivas (Prompt Editor com Dicas) */}
      <section className="bussola-prompt-card" aria-labelledby="prompt-heading">
        <div className="prompt-card-header">
          <div>
            <span className="eyebrow">Instrução Direta para a IA</span>
            <h3 id="prompt-heading">🧭 Diretrizes Editoriais (Prompt do Gemini 2.5 Flash)</h3>
            <p>
              Este texto é injetado integralmente na requisição de triagem. Descreva o tom de curadoria do BizuMiner, o que deve ser priorizado e o que deve ser sumariamente rejeitado.
            </p>
          </div>
          <div className="prompt-meta-badge">
            <span className="model-tag">Gemini 2.5 Flash</span>
            <span className="char-count">{guideline.length} caracteres</span>
          </div>
        </div>

        {/* Sugestões Rápidas de Prompt */}
        <div className="prompt-suggestions-bar">
          <span className="suggestions-label">Adicionar ao prompt:</span>
          <div className="suggestions-chips">
            {PROMPT_SUGGESTIONS.map((sug) => (
              <button
                key={sug.label}
                type="button"
                className="chip-btn"
                onClick={() => handleAppendSuggestion(sug.text)}
                title={sug.text}
              >
                {sug.label}
              </button>
            ))}
          </div>
        </div>

        {/* Textarea do Prompt */}
        <div className="prompt-editor-box">
          <label htmlFor="guideline-textarea" className="sr-only">Diretrizes da IA</label>
          <textarea
            id="guideline-textarea"
            className="prompt-textarea"
            rows={8}
            value={guideline}
            onChange={(e) => setGuideline(e.target.value)}
            placeholder="Escreva as diretrizes aqui... Ex: Priorizar produtos criativos, utilidades inteligentes para casa e presentes que geram desejo imediato..."
          />
        </div>

        {/* Do's & Don'ts Grid */}
        <div className="prompt-guidelines-columns">
          <div className="guideline-column do-box">
            <div className="column-title">
              <span className="column-icon">✓</span>
              <strong>O que a IA deve privilegiar:</strong>
            </div>
            <ul>
              <li>Produtos que resolvem dores cotidianas reais com simplicidade.</li>
              <li>Gadgets, utilidades domésticas inteligentes e itens visuais para compra de impulso.</li>
              <li>Ofertas com ticket atrativo e boa reputação comprovada.</li>
            </ul>
          </div>

          <div className="guideline-column dont-box">
            <div className="column-title">
              <span className="column-icon">✕</span>
              <strong>O que a IA deve filtrar e rejeitar:</strong>
            </div>
            <ul>
              <li>Peças de reposição industrial avulsas (parafusos, engrenagens, fios sem conector).</li>
              <li>Produtos genéricos sem apelo popular ou utilidade evidente.</li>
              <li>Anúncios com fotos amadoras poluídas ou promessas enganosas.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 3. Exemplos de Referência (Golden Examples / Few-Shot Calibration) */}
      <section className="bussola-golden-card" aria-labelledby="golden-heading">
        <div className="golden-card-header">
          <div>
            <span className="eyebrow">Calibração Dinâmica</span>
            <h3 id="golden-heading">⭐ Exemplos de Referência (Few-Shot Dinâmico)</h3>
            <p>
              Decisões humanas reais recentes que a IA analisa como espelho de julgamento para manter a consistência editorial.
            </p>
          </div>
          <span className="golden-count-pill">
            {goldenExamples.length} decisões de modelo
          </span>
        </div>

        {goldenExamples.length === 0 ? (
          <div className="golden-empty-state">
            <p>Nenhuma decisão humana recente arquivada como referência ainda.</p>
            <small>Conforme você julga exceções na Curadoria, os exemplos mais relevantes aparecem aqui automaticamente.</small>
          </div>
        ) : (
          <div className="golden-cards-grid">
            {goldenExamples.map((ex) => (
              <article key={ex.productId} className={`golden-card ${ex.decision}`}>
                <div className="golden-card-top">
                  <span className={`golden-badge ${ex.decision}`}>
                    {ex.decision === "approved" ? "✓ Aprovado" : ex.decision === "rejected" ? "✕ Rejeitado" : "⏸ Em Espera"}
                  </span>
                  {ex.priceFormatted && <span className="golden-price">{ex.priceFormatted}</span>}
                </div>
                <h4 className="golden-product-title" title={ex.title}>
                  {ex.title}
                </h4>
                {ex.rationale && (
                  <p className="golden-rationale-quote">
                    &ldquo;{ex.rationale}&rdquo;
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {/* 4. Barra Fixa de Salvamento no Rodapé */}
      <div className="bussola-floating-save-bar">
        <div className="save-bar-left">
          <span className="save-bar-notice">
            Configurações e diretrizes são aplicadas instantaneamente em cada nova triagem.
          </span>
          {saveFeedback && (
            <span className={`save-feedback-alert ${saveFeedback.isError ? "error" : "success"}`}>
              {saveFeedback.msg}
            </span>
          )}
        </div>
        <div className="save-bar-right">
          <button
            type="button"
            className="save-bar-btn"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Salvando alterações..." : "💾 Salvar Bússola & Piloto Automático"}
          </button>
        </div>
      </div>
    </div>
  );
}
