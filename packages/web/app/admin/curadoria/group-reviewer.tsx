"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { REJECTION_REASONS, type CurationReason } from "../../../lib/curation-contract.ts";
import type { CurationGroupCard, CurationQueueProduct } from "../../../lib/curation-db.ts";
import { fetchGroupMembers, submitGroupAction, undoGroupAction } from "./actions.ts";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

interface LastBulkAction {
  bulkActionId: string;
  affectedCount: number;
  groupTitle: string;
}

export default function GroupReviewer({
  initialCards,
}: {
  initialCards: CurationGroupCard[];
}) {
  const router = useRouter();
  const cards = initialCards;
  const [selectedRepsByGroup, setSelectedRepsByGroup] = useState<Record<string, string[]>>(() => {
    // Por padrão, pré-seleciona os 2 primeiros representantes de cada grupo (ou o primeiro)
    const initial: Record<string, string[]> = {};
    for (const card of initialCards) {
      initial[card.groupId] = card.representatives.slice(0, Math.min(2, card.representatives.length)).map((r) => r.id);
    }
    return initial;
  });
  const [rejectionModalGroup, setRejectionModalGroup] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<CurationReason | null>(null);
  const [reasonDetail, setReasonDetail] = useState("");
  const [saturationModal, setSaturationModal] = useState<{
    groupId: string;
    action: "approve" | "reject" | "hold";
    members: CurationQueueProduct[];
    rejectReasonCode?: CurationReason | null;
    rejectReasonDetail?: string | null;
  } | null>(null);
  const [saturationJustification, setSaturationJustification] = useState("");
  const [expandedGroupMembers, setExpandedGroupMembers] = useState<{ groupId: string; members: CurationQueueProduct[] } | null>(null);
  const [loadingMembersGroup, setLoadingMembersGroup] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [lastBulkAction, setLastBulkAction] = useState<LastBulkAction | null>(null);
  const [isPending, startTransition] = useTransition();

  async function openSaturationModal(
    card: CurationGroupCard,
    action: "approve" | "reject" | "hold",
    code?: CurationReason | null,
    detail?: string | null,
  ) {
    let members: CurationQueueProduct[] = [];
    if (expandedGroupMembers?.groupId === card.groupId && expandedGroupMembers.members.length > 0) {
      members = expandedGroupMembers.members;
    } else {
      setLoadingMembersGroup(card.groupId);
      const res = await fetchGroupMembers(card.groupId);
      setLoadingMembersGroup(null);
      if (res.ok && Array.isArray(res.members) && res.members.length > 0) {
        members = res.members;
      } else {
        setMessage("Não foi possível carregar a lista completa de membros do grupo para retenção. Tente novamente.");
        return;
      }
    }

    if (members.length === 0 || members.length < card.totalCount) {
      setMessage("Não foi possível comprovar a completude dos membros do grupo para retenção. Tente novamente.");
      return;
    }

    setSaturationModal({
      groupId: card.groupId,
      action,
      members,
      rejectReasonCode: code,
      rejectReasonDetail: detail,
    });
    setSaturationJustification("");
  }

  function toggleRep(groupId: string, productId: string) {
    setSelectedRepsByGroup((prev) => {
      const current = prev[groupId] ?? [];
      const next = current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId];
      return { ...prev, [groupId]: next };
    });
  }

  function selectAllReps(groupId: string, allRepIds: string[]) {
    setSelectedRepsByGroup((prev) => {
      const current = prev[groupId] ?? [];
      const isAll = allRepIds.every((id) => current.includes(id));
      return { ...prev, [groupId]: isAll ? [] : allRepIds };
    });
  }

  function handleGroupAction(
    groupId: string,
    action: "approve" | "reject" | "hold",
    retainRemaining: boolean,
    code?: CurationReason | null,
    detail?: string | null,
    saturationJust?: string | null,
    expectedMemberIds?: string[] | null,
  ) {
    if (isPending) return;
    const groupCard = cards.find((c) => c.groupId === groupId);
    if (!groupCard) return;

    const selectedIds = action === "hold" ? [] : selectedRepsByGroup[groupId] ?? [];
    if (selectedIds.length === 0 && !retainRemaining) {
      setMessage("Selecione ao menos um representante ou use a retenção dos semelhantes.");
      return;
    }

    setMessage("");
    startTransition(async () => {
      const result = await submitGroupAction({
        groupId,
        selectedProductIds: selectedIds,
        action,
        reasonCode: code ?? null,
        reasonDetail: detail ?? null,
        retainRemainingAsSaturation: retainRemaining,
        saturationJustification: saturationJust ?? null,
        expectedMemberProductIds: expectedMemberIds ?? null,
      });

      if (!result.ok) {
        if (result.error === "curation_group_members_changed") {
          setMessage("O grupo de produtos foi modificado no catálogo durante a análise. A lista foi atualizada.");
          router.refresh();
        } else if (result.error === "curation_group_not_found") {
          setMessage("Grupo não encontrado ou já resolvido.");
        } else {
          setMessage(`Erro ao processar lote: ${result.error}`);
        }
        return;
      }

      router.refresh();
      setSelectedRepsByGroup((prev) => ({ ...prev, [groupId]: [] }));
      setLastBulkAction({
        bulkActionId: result.bulkActionId,
        affectedCount: result.affectedCount,
        groupTitle: groupCard.familyLabel,
      });
      setMessage(`Lote concluído: ${result.affectedCount} produtos resolvidos em "${groupCard.familyLabel}".`);
      setRejectionModalGroup(null);
      setReasonCode(null);
      setReasonDetail("");
      setExpandedGroupMembers(null);
    });
  }

  function handleUndoBulk() {
    if (!lastBulkAction || isPending) return;
    const actionToUndo = lastBulkAction;
    startTransition(async () => {
      const result = await undoGroupAction(actionToUndo.bulkActionId);
      if (!result.ok) {
        setMessage("A ação em lote não pôde ser desfeita (conflito de estado).");
        return;
      }
      router.refresh();
      setLastBulkAction(null);
      setExpandedGroupMembers(null);
      setMessage(`Ação em lote desfeita: ${actionToUndo.affectedCount} produtos restaurados em "${actionToUndo.groupTitle}".`);
    });
  }

  async function handleOpenAllMembers(groupId: string) {
    if (expandedGroupMembers?.groupId === groupId) {
      setExpandedGroupMembers(null);
      return;
    }
    setLoadingMembersGroup(groupId);
    const result = await fetchGroupMembers(groupId);
    setLoadingMembersGroup(null);
    if (result.ok) {
      setExpandedGroupMembers({ groupId, members: result.members });
    } else {
      setMessage("Não foi possível carregar os membros completos do grupo.");
    }
  }

  if (cards.length === 0) {
    return (
      <section className="curation-empty">
        {message && <p role="status">{message}</p>}
        {lastBulkAction && <button type="button" disabled={isPending} onClick={handleUndoBulk}>Desfazer última ação em lote ({lastBulkAction.affectedCount} produtos)</button>}
        <span className="curation-proof">GRUPOS<br />ZERADOS</span>
        <p className="eyebrow">Curadoria</p>
        <h1>Nenhum grupo repetitivo pendente.</h1>
        <p>Todos os grupos com produtos semelhantes foram avaliados ou não há ofertas repetitivas na fila.</p>
        <div style={{ display: "flex", gap: "12px", marginTop: "20px" }}>
          <a className="admin-curation-start" href="/admin/curadoria?aba=excecoes&sub=singulars">Revisar item a item →</a>
          <button type="button" onClick={() => router.refresh()}>Atualizar grupos</button>
          <a className="admin-curation-start" href="/admin">← Voltar ao painel</a>
        </div>
      </section>
    );
  }

  return (
    <section className="curation-groups-view">
      {message && (
        <div className="curation-alert-bar" role="status">
          <span>{message}</span>
          {lastBulkAction && (
            <button type="button" className="undo-btn" disabled={isPending} onClick={handleUndoBulk}>
              Desfazer última ação em lote ({lastBulkAction.affectedCount} produtos)
            </button>
          )}
        </div>
      )}

      <div className="curation-groups-grid">
        {cards.map((card) => {
          const selectedIds = selectedRepsByGroup[card.groupId] ?? [];
          const repIds = card.representatives.map((r) => r.id);
          const allSelected = repIds.length > 0 && repIds.every((id) => selectedIds.includes(id));
          const isModalOpen = rejectionModalGroup === card.groupId;
          const isExpanded = expandedGroupMembers?.groupId === card.groupId;
          const isLoadingMembers = loadingMembersGroup === card.groupId;

          return (
            <article key={card.groupId} className="curation-group-card" aria-labelledby={`grp-title-${card.groupId}`}>
              <header className="group-card-header">
                <div className="group-card-title">
                  <span className="group-reason">Semelhantes na mesma família</span>
                  <h2 id={`grp-title-${card.groupId}`}>{card.familyLabel}</h2>
                  <p className="group-family-notice"><small>Aviso: O agrupamento por família editorial reúne ofertas da mesma categoria/linha, mas não assegura que se trate do mesmo modelo ou configuração idêntica.</small></p>
                  <div className="group-meta-badges">
                    <span className="group-badge highlight"><b>{card.totalCount}</b> produtos</span>
                    <span className="group-badge">{brl.format(card.priceRange.minCents / 100)} – {brl.format(card.priceRange.maxCents / 100)}</span>
                    <div className="stat-marketplaces">
                      {Object.entries(card.marketplaceDistribution).map(([mp, cnt]) => (
                        <span key={mp} className="marketplace-pill">{mp}: {cnt}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </header>

              <div className="group-reps-section">
                <div className="group-reps-header">
                  <h3>Representantes ordenados por evidência e variação ({card.representatives.length} de {card.totalCount})</h3>
                  <button
                    type="button"
                    className="btn-select-all"
                    onClick={() => selectAllReps(card.groupId, repIds)}
                  >
                    {allSelected ? "Desmarcar todos" : "Selecionar todos os representantes"}
                  </button>
                </div>

                <div className="group-reps-grid">
                  {card.representatives.map((rep) => {
                    const isChecked = selectedIds.includes(rep.id);
                    return (
                      <div
                        key={rep.id}
                        className={`group-rep-card ${isChecked ? "selected" : ""}`}
                        onClick={() => toggleRep(card.groupId, rep.id)}
                      >
                        <div className="group-rep-top">
                          <label className="rep-select-label" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              className="rep-checkbox"
                              checked={isChecked}
                              onChange={() => toggleRep(card.groupId, rep.id)}
                              aria-label={`Selecionar representante ${rep.title}`}
                            />
                            <span>{isChecked ? "Selecionado" : "Selecionar"}</span>
                          </label>
                          <span className="rep-marketplace">{rep.marketplace}</span>
                        </div>

                        <div className="rep-photo-wrap">
                          {rep.imageUrl ? (
                            <Image
                              src={rep.imageUrl}
                              alt={rep.title}
                              fill
                              sizes="(max-width: 600px) 140px, 180px"
                            />
                          ) : (
                            <span>Sem foto</span>
                          )}
                        </div>

                        <div className="rep-info">
                          <h4 title={rep.title}>{rep.title}</h4>
                          <p className="rep-price">
                            <strong>{brl.format(rep.priceCents / 100)}</strong>
                            {rep.originalPriceCents && rep.originalPriceCents > rep.priceCents ? (
                              <del>{brl.format(rep.originalPriceCents / 100)}</del>
                            ) : null}
                          </p>
                          <div className="rep-badges">
                            {rep.lowestVerified && <span className="badge-lowest">Menor preço</span>}
                            {rep.ratingStar !== null && <span className="badge-rating">★ {rep.ratingStar.toFixed(1)}</span>}
                            {rep.salesLabel && <span className="badge-sales">{rep.salesLabel}</span>}
                            {rep.variant?.confirmed ? (
                              <span className="badge-variant confirmed" title={rep.variant.description}>
                                Variante: {rep.variant.description}
                              </span>
                            ) : (
                              <span className="badge-variant unconfirmed" title="Variante sem origem sustentada pela fonte">
                                Variante: não confirmada
                              </span>
                            )}
                          </div>
                          <a
                            href={rep.productUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rep-link"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Abrir anúncio ↗
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {isModalOpen && (
                <div className="group-rejection-panel" role="region" aria-label="Motivo da rejeição em lote">
                  <p className="eyebrow">Rejeitar selecionados</p>
                  <h4>Qual o motivo para rejeitar os representantes selecionados?</h4>
                  <div className="curation-reason-chips">
                    {REJECTION_REASONS.map(([code, label]) => (
                      <button
                        key={code}
                        type="button"
                        className={reasonCode === code ? "active" : ""}
                        onClick={() => setReasonCode(code)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {reasonCode === "other" && (
                    <label className="curation-other">
                      <span>Texto livre obrigatório para 'Outro' (3 a 1000 caracteres):</span>
                      <textarea
                        autoFocus
                        maxLength={1000}
                        value={reasonDetail}
                        onChange={(e) => setReasonDetail(e.target.value)}
                        placeholder="Por que estes produtos estão sendo rejeitados?"
                      />
                      <small>{reasonDetail.length}/1000</small>
                    </label>
                  )}
                  <div className="group-rejection-actions">
                    <button type="button" onClick={() => setRejectionModalGroup(null)}>Cancelar</button>
                    <button
                      type="button"
                      className="confirm-reject"
                      disabled={!reasonCode || isPending || (reasonCode === "other" && reasonDetail.trim().length < 3)}
                      onClick={() => handleGroupAction(card.groupId, "reject", false, reasonCode, reasonDetail.trim() || null)}
                    >
                      Confirmar rejeição
                    </button>
                    <button
                      type="button"
                      className="confirm-reject-combo"
                      disabled={!reasonCode || isPending || (reasonCode === "other" && reasonDetail.trim().length < 3)}
                      onClick={() => {
                        setRejectionModalGroup(null);
                        openSaturationModal(card, "reject", reasonCode, reasonDetail.trim() || null);
                      }}
                    >
                      Rejeitar selecionados e reter demais por saturação
                    </button>
                  </div>
                </div>
              )}

              {saturationModal && saturationModal.groupId === card.groupId && (
                <div className="group-rejection-panel" role="region" aria-label="Justificativa de saturação">
                  <p className="eyebrow">Retenção por saturação deliberada</p>
                  <h4>Membros do grupo afetados por esta ação:</h4>
                  <div style={{ maxHeight: "180px", overflowY: "auto", margin: "8px 0", fontSize: "0.85rem", background: "rgba(0,0,0,0.03)", padding: "8px", borderRadius: "4px" }}>
                    <div style={{ marginBottom: "6px" }}>
                      <strong>{saturationModal.action === "approve" ? "Aprovar" : saturationModal.action === "reject" ? "Rejeitar" : "Reter"} ({selectedIds.length} produtos):</strong>
                      <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                        {saturationModal.members.filter((m) => selectedIds.includes(m.id)).map((m) => (
                          <li key={m.id}>
                            {m.title} — <em>{m.marketplace}</em> (ID: {m.id})
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Reter por saturação ({saturationModal.members.length - selectedIds.length} produtos restantes):</strong>
                      <ul style={{ margin: "4px 0", paddingLeft: "20px" }}>
                        {saturationModal.members.filter((m) => !selectedIds.includes(m.id)).map((m) => (
                          <li key={m.id}>
                            {m.title} — <em>{m.marketplace}</em> (ID: {m.id})
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <label htmlFor="saturation-justification-field">
                    <strong>Justificativa editorial para retenção (obrigatória, mínimo 3 caracteres):</strong>
                  </label>
                  <textarea
                    id="saturation-justification-field"
                    autoFocus
                    required
                    minLength={3}
                    maxLength={500}
                    value={saturationJustification}
                    onChange={(e) => setSaturationJustification(e.target.value)}
                    placeholder="Justifique a retenção dos modelos semelhantes por saturação..."
                  />
                  <small>{saturationJustification.trim().length}/500 caracteres (mínimo 3)</small>
                  <div className="group-rejection-actions">
                    <button type="button" onClick={() => setSaturationModal(null)}>Cancelar</button>
                    <button
                      type="button"
                      className="confirm-reject"
                      disabled={isPending || saturationJustification.trim().length < 3}
                      onClick={() => {
                        const act = saturationModal.action;
                        const just = saturationJustification.trim();
                        if (just.length < 3) return;
                        const expectedIds = saturationModal.members.map((m) => m.id);
                        const rCode = saturationModal.rejectReasonCode;
                        const rDetail = saturationModal.rejectReasonDetail;
                        setSaturationModal(null);
                        setSaturationJustification("");
                        handleGroupAction(card.groupId, act, true, rCode, rDetail, just, expectedIds);
                      }}
                    >
                      Confirmar ação e retenção
                    </button>
                  </div>
                </div>
              )}

              <footer className="curation-group-actions">
                <div className="group-actions-primary">
                  <button
                    type="button"
                    className="action-combo"
                    disabled={isPending || selectedIds.length === 0}
                    onClick={() => openSaturationModal(card, "approve")}
                    title="Aprova os selecionados e envia automaticamente todos os demais produtos do grupo para espera por saturação de família"
                  >
                    ✓ Aprovar selecionados ({selectedIds.length}) e reter demais ({card.totalCount - selectedIds.length}) por saturação
                  </button>
                  <button
                    type="button"
                    className="action-approve"
                    disabled={isPending || selectedIds.length === 0}
                    onClick={() => handleGroupAction(card.groupId, "approve", false)}
                  >
                    Aprovar selecionados ({selectedIds.length})
                  </button>
                  <button
                    type="button"
                    className="action-reject"
                    disabled={isPending || selectedIds.length === 0}
                    onClick={() => {
                      setRejectionModalGroup(card.groupId);
                      setReasonCode(null);
                      setReasonDetail("");
                    }}
                  >
                    Rejeitar selecionados ({selectedIds.length})…
                  </button>
                  <button
                    type="button"
                    className="action-hold-all"
                    disabled={isPending}
                    onClick={() => openSaturationModal(card, "hold")}
                    title="Retém todos os produtos deste grupo como saturação de família"
                  >
                    Reter todo o grupo por saturação
                  </button>
                </div>

                <div className="group-actions-secondary">
                  <button
                    type="button"
                    className="action-view-all"
                    disabled={isLoadingMembers}
                    onClick={() => handleOpenAllMembers(card.groupId)}
                  >
                    {isLoadingMembers ? "Carregando…" : isExpanded ? "Ocultar todos os produtos" : `Abrir todos os produtos do grupo (${card.totalCount})`}
                  </button>
                  <a
                    href="/admin/curadoria?aba=excecoes&sub=singulars"
                    className="action-desk-link"
                    title="Abrir a fila completa de produtos pendentes"
                  >
                    Abrir revisão item a item →
                  </a>
                </div>
              </footer>

              {isExpanded && expandedGroupMembers && (
                <div className="group-expanded-members">
                  <h4>Todos os {expandedGroupMembers.members.length} produtos do grupo</h4>
                  <div className="group-members-table-wrap">
                    <table className="group-members-table">
                      <thead>
                        <tr>
                          <th>Loja</th>
                          <th>Título</th>
                          <th>Preço</th>
                          <th>Evidências</th>
                          <th>Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expandedGroupMembers.members.map((m) => (
                          <tr key={m.id} className={selectedIds.includes(m.id) ? "row-selected" : ""}>
                            <td><span className="marketplace-pill">{m.marketplace}</span></td>
                            <td className="member-title-cell">
                              <span>{m.title}</span>
                              <small>ID: {m.id}</small>
                            </td>
                            <td><strong>{brl.format(m.priceCents / 100)}</strong></td>
                            <td>
                              <small>
                                {m.ratingStar ? `★ ${m.ratingStar.toFixed(1)} · ` : ""}
                                {m.salesLabel ?? (m.salesCount ? `${m.salesCount} vendas` : "—")}
                              </small>
                            </td>
                            <td>
                              <a href={m.productUrl} target="_blank" rel="noreferrer">anúncio ↗</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
