"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  validateWorkspace,
  type MarketingSnapshot,
  type MarketingWorkspace,
} from "../../../lib/marketing-contract";
import { withEditorialStarter } from "../../../lib/marketing-editorial";

export function useMarketingWorkspace(tenantId: string) {
  const [workspace, setWorkspace] = useState<MarketingWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");
  const [savedVersion, setSavedVersion] = useState(0);
  const revision = useRef(0),
    saved = useRef(""),
    draft = useRef(workspace),
    busy = useRef(false),
    mounted = useRef(true);
  draft.current = workspace;
  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/marketing", {
          cache: "no-store",
          headers: { "x-bm-account": tenantId },
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
            : AbortSignal.timeout(30000),
        });
        const data: MarketingSnapshot & { error?: string } =
          await response.json();
        if (!response.ok)
          throw new Error(data.error || "Não foi possível abrir sua rotina.");
        const validated = validateWorkspace(data.workspace);
        if (!mounted.current || signal?.aborted) return;
        revision.current = data.revision;
        saved.current = JSON.stringify(validated);
        const prepared = withEditorialStarter(validated);
        draft.current = prepared;
        setWorkspace(prepared);
        setUpdatedAt(data.updatedAt);
      } catch (reason) {
        if (!signal?.aborted && mounted.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Não foi possível carregar.",
          );
      } finally {
        if (!signal?.aborted && mounted.current) setLoading(false);
      }
    },
    [tenantId],
  );
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [load]);
  const save = useCallback(async () => {
    if (!draft.current || busy.current) return;
    let body: MarketingWorkspace;
    try {
      body = validateWorkspace(draft.current);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Revise os campos antes de salvar.",
      );
      return;
    }
    const serialized = JSON.stringify(body);
    if (serialized === saved.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/admin/marketing", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-bm-account": tenantId,
        },
        body: JSON.stringify({ revision: revision.current, workspace: body }),
        signal: AbortSignal.timeout(30000),
      });
      const data: MarketingSnapshot & { error?: string } =
        await response.json();
      if (!response.ok)
        throw new Error(
          data.error ||
            "Não foi possível salvar. Suas alterações continuam nesta tela.",
        );
      if (!mounted.current) return;
      revision.current = data.revision;
      saved.current = serialized;
      setUpdatedAt(data.updatedAt);
      // A response to an older edit must not replace text typed while the request was in flight.
      setWorkspace((current) =>
        JSON.stringify(current) === serialized
          ? validateWorkspace(data.workspace)
          : current,
      );
      setSavedVersion((value) => value + 1);
    } catch (reason) {
      if (mounted.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Falha ao salvar; tente novamente.",
        );
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [tenantId]);
  useEffect(() => {
    if (!workspace || JSON.stringify(workspace) === saved.current) return;
    const timer = setTimeout(() => {
      void save();
    }, 650);
    return () => clearTimeout(timer);
  }, [workspace, savedVersion, save]);
  const dirty =
    workspace !== null && JSON.stringify(workspace) !== saved.current;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(change: (current: MarketingWorkspace) => MarketingWorkspace) {
    if (!draft.current) return;
    try {
      const next = change(draft.current);
      draft.current = next;
      setWorkspace(next);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível aplicar a alteração.",
      );
    }
  }
  return {
    workspace,
    loading,
    saving,
    error,
    updatedAt,
    dirty,
    update,
    retry: save,
    reload: load,
  };
}
