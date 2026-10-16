import {
  validateWorkspace,
  type MarketingSnapshot,
  type MarketingWorkspace,
} from "./marketing-contract.ts";
import { initialMarketingWorkspace } from "./marketing-seed.ts";

export class MarketingConflict extends Error {
  constructor() {
    super(
      "Este espaço foi atualizado em outra aba. Exporte suas alterações antes de recarregar e reconciliar os textos.",
    );
  }
}
export interface MarketingStorage {
  exclusive<T>(owner: string, task: () => Promise<T>): Promise<T>;
  read(owner: string): Promise<unknown | null>;
  write(owner: string, snapshot: MarketingSnapshot): Promise<void>;
}
export function parseSnapshot(value: unknown): MarketingSnapshot {
  const snapshot = value as MarketingSnapshot;
  if (
    !snapshot ||
    !Number.isSafeInteger(snapshot.revision) ||
    snapshot.revision < 1 ||
    typeof snapshot.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(snapshot.updatedAt))
  )
    throw new Error("Não foi possível ler o espaço salvo.");
  return {
    revision: snapshot.revision,
    updatedAt: snapshot.updatedAt,
    workspace: validateWorkspace(snapshot.workspace),
  };
}
export async function loadMarketing(
  storage: MarketingStorage,
  owner: string,
): Promise<MarketingSnapshot> {
  return storage.exclusive(owner, async () => {
    const saved = await storage.read(owner);
    if (saved !== null) return parseSnapshot(saved);
    const initial = {
      revision: 1,
      updatedAt: new Date().toISOString(),
      workspace: validateWorkspace(initialMarketingWorkspace()),
    };
    await storage.write(owner, initial);
    return initial;
  });
}
export async function saveMarketing(
  storage: MarketingStorage,
  owner: string,
  revision: number,
  workspace: MarketingWorkspace,
): Promise<MarketingSnapshot> {
  const validated = validateWorkspace(workspace);
  return storage.exclusive(owner, async () => {
    const saved = await storage.read(owner);
    if (!saved || parseSnapshot(saved).revision !== revision)
      throw new MarketingConflict();
    const next = {
      revision: revision + 1,
      updatedAt: new Date().toISOString(),
      workspace: validated,
    };
    await storage.write(owner, next);
    return next;
  });
}
