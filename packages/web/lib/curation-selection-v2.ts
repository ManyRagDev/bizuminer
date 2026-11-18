import type { CohortEntrySnapshot } from "./curation-cohort-v2.ts";
export type SelectionMarketplace = "shopee" | "mercadolivre" | "amazon" | "aliexpress";
export type SelectionCandidate = {
  id: string; marketplace: SelectionMarketplace; category: string | null; familyKey: string; equivalenceKey: string | null;
  optionKey: string; priceType: "exact" | "range" | "from"; currency: string; priceCents: number;
  observationId: string; revision: string; verifiedAt: string | null; verificationMethod: "id_lookup" | "listing" | "product_page" | null;
  available: "unknown" | "available" | "unavailable"; affiliateReady: boolean; blocked: boolean; assessmentCurrent: boolean;
  score: number; potentialScore: number; scoreVersion: string; normalizationRevision?:string|null;
  entrySnapshot?:CohortEntrySnapshot; normalizedEntryScore?:number|null; normalizedEntryFingerprint?:string|null;
};
export type OccupantSnapshot = { id: string; entryScore: number; scoreVersion: string; normalizationRevision?:string|null };
export type SelectionPolicyV2 = { capacity: number; categoryShare: number; marketplaceShare: number; challengerMargin: number; dropFraction: number;
  domEntryHours: number; domStayHours: number; shopeeHours: number; pendingLimit: number };
export const DEFAULT_SELECTION_POLICY_V2: SelectionPolicyV2 = { capacity: 24, categoryShare: 0.2, marketplaceShare: 0.3,
  challengerMargin: 0.1, dropFraction: 0.2, domEntryHours: 12, domStayHours: 24, shopeeHours: 1, pendingLimit: 24 };

export function isValidSelectionPolicyV2(policy:SelectionPolicyV2):boolean {
  return Number.isInteger(policy.capacity) && policy.capacity>=1 && policy.capacity<=24
    && Number.isFinite(policy.categoryShare) && policy.categoryShare>0 && policy.categoryShare<=1
    && Number.isFinite(policy.marketplaceShare) && policy.marketplaceShare>0 && policy.marketplaceShare<=1
    && Number.isFinite(policy.challengerMargin) && policy.challengerMargin>=0 && policy.challengerMargin<=1
    && Number.isFinite(policy.dropFraction) && policy.dropFraction>=0 && policy.dropFraction<=1
    && Number.isInteger(policy.pendingLimit) && policy.pendingLimit>=0 && policy.pendingLimit<=100
    && Number.isFinite(policy.domEntryHours) && policy.domEntryHours>0 && policy.domEntryHours<=12
    && Number.isFinite(policy.domStayHours) && policy.domStayHours>=Math.max(1,policy.domEntryHours) && policy.domStayHours<=48
    && Number.isFinite(policy.shopeeHours) && policy.shopeeHours>0 && policy.shopeeHours<=1;
}

/** An old or unproven observation may request a check; it cannot authorize a public offer. */
export function selectionOfferGate(candidate: SelectionCandidate, mode: "entry" | "stay", now: Date, policy: SelectionPolicyV2) {
  const reasons: string[] = [];
  if (candidate.blocked) reasons.push("blocked");
  if (!candidate.assessmentCurrent) reasons.push("awaiting_evaluation");
  if (!candidate.affiliateReady) reasons.push("affiliate_link_missing");
  if (candidate.available === "unavailable") reasons.push("unavailable_confirmed");
  if (candidate.currency !== "BRL" || !candidate.optionKey || !["exact","range","from"].includes(candidate.priceType)
    || !Number.isSafeInteger(candidate.priceCents) || candidate.priceCents <= 0) reasons.push("invalid_price");
  if (!Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 100
    || !Number.isFinite(candidate.potentialScore) || candidate.potentialScore < 0 || candidate.potentialScore > 100) reasons.push("score_unavailable");
  const observed = candidate.verifiedAt ? Date.parse(candidate.verifiedAt) : NaN;
  const age = Number.isFinite(observed) ? (now.getTime() - observed) / 3_600_000 : Infinity;
  const maxAge = candidate.marketplace === "shopee" ? policy.shopeeHours : mode === "entry" ? policy.domEntryHours : policy.domStayHours;
  const correctMethod = candidate.marketplace === "shopee" ? candidate.verificationMethod === "id_lookup"
    : candidate.verificationMethod === "listing" || candidate.verificationMethod === "product_page";
  if (!correctMethod || age < 0 || age >= maxAge) reasons.push("verification_required");
  return { eligible: reasons.length === 0, reasons, validUntil: correctMethod && Number.isFinite(observed)
    ? new Date(observed + maxAge * 3_600_000).toISOString() : null };
}

/** Compose a shadow edition with stable, explicit scarcity and replacement rules. */
export function composeCurationSelection(candidates: readonly SelectionCandidate[], occupants: readonly OccupantSnapshot[],
  now = new Date(), policy: SelectionPolicyV2 = DEFAULT_SELECTION_POLICY_V2) {
  if (!isValidSelectionPolicyV2(policy)) throw new Error("selection_policy_invalid");
  const byId = new Map(candidates.map(candidate => [candidate.id,candidate]));
  if (byId.size !== candidates.length) throw new Error("selection_duplicate_candidate");
  const exits: Array<{id:string;reason:string}> = [];
  // A candidate ejected for a material loss of merit must not immediately
  // refill its own vacancy in the very same composition.
  const meritEjected = new Set<string>();
  const categoryCap = Math.max(1,Math.ceil(policy.capacity * policy.categoryShare));
  const marketplaceCap = Math.max(1,Math.ceil(policy.capacity * policy.marketplaceShare));
  const sameFamily = (a: SelectionCandidate,b: SelectionCandidate) => a.familyKey === b.familyKey
    || !!a.equivalenceKey && a.equivalenceKey === b.equivalenceKey;
  const category = (candidate: SelectionCandidate) => candidate.category && candidate.category !== "Geral" ? candidate.category : `unknown:${candidate.id}`;
  const fits = (candidate: SelectionCandidate, current: readonly SelectionCandidate[], maxExcess: number) => {
    if (current.some(item => sameFamily(item,candidate))) return false;
    const catExcess = Math.max(0, current.filter(item => category(item) === category(candidate)).length + 1 - categoryCap);
    const mktExcess = Math.max(0, current.filter(item => item.marketplace === candidate.marketplace).length + 1 - marketplaceCap);
    return catExcess + mktExcess <= maxExcess;
  };
  const exceedsCap = (candidate: SelectionCandidate, current: readonly SelectionCandidate[]) =>
    current.filter(item => category(item) === category(candidate)).length > categoryCap
    || current.filter(item => item.marketplace === candidate.marketplace).length > marketplaceCap;
  const withinStrictCaps = (items: readonly SelectionCandidate[]) => {
    const picked: SelectionCandidate[] = [];
    for (const item of items) {
      if (!fits(item, picked, 0)) return false;
      picked.push(item);
    }
    return picked.length <= policy.capacity;
  };
  const replacementOrder = (candidate: SelectionCandidate, current: readonly SelectionCandidate[]) =>
    [...current].sort((a,b) =>
      Number(exceedsCap(b,current)) - Number(exceedsCap(a,current))
      || Number(sameFamily(b,candidate) || category(b) === category(candidate)) - Number(sameFamily(a,candidate) || category(a) === category(candidate))
      || a.score-b.score || a.id.localeCompare(b.id));

  // Finds a maximum-cardinality, highest-priority composition strictly within
  // category/marketplace caps so greedy dead-ends never trigger false scarcity.
  const findStrictMax = (
    fixed: readonly SelectionCandidate[],
    rawPool: readonly SelectionCandidate[],
    maxNew: number,
    existingIds: ReadonlySet<string>,
    preferredIds?: ReadonlySet<string>
  ): SelectionCandidate[] => {
    const remSlots = policy.capacity - fixed.length;
    if (remSlots <= 0 || rawPool.length === 0) return [];
    const fixedCat = new Map<string, number>();
    const fixedMkt = new Map<string, number>();
    for (const item of fixed) {
      const cat = category(item);
      fixedCat.set(cat, (fixedCat.get(cat) ?? 0) + 1);
      fixedMkt.set(item.marketplace, (fixedMkt.get(item.marketplace) ?? 0) + 1);
    }
    const eligible = rawPool.filter(item => fits(item, fixed, 0));
    if (eligible.length === 0) return [];

    // Check which families/equivalences cross (marketplace, category) cells.
    const familyCells = new Map<string, string>();
    const eqCells = new Map<string, string>();
    const crossCellFamilies = new Set<string>();
    const crossCellEqs = new Set<string>();
    for (const item of [...fixed, ...eligible]) {
      const cell = `${item.marketplace}\0${category(item)}`;
      const prevFam = familyCells.get(item.familyKey);
      if (prevFam !== undefined && prevFam !== cell) crossCellFamilies.add(item.familyKey);
      else familyCells.set(item.familyKey, cell);
      if (item.equivalenceKey) {
        const prevEq = eqCells.get(item.equivalenceKey);
        if (prevEq !== undefined && prevEq !== cell) crossCellEqs.add(item.equivalenceKey);
        else eqCells.set(item.equivalenceKey, cell);
      }
    }

    const cellLimit = Math.min(marketplaceCap, categoryCap);
    const seenExact = new Set<string>();
    const cellIsoCount = new Map<string, number>();
    const pool: SelectionCandidate[] = [];
    for (const item of eligible) {
      const cat = category(item);
      const cell = `${item.marketplace}\0${cat}`;
      const exactKey = `${cell}\0${item.familyKey}\0${item.equivalenceKey ?? ""}`;
      if (seenExact.has(exactKey)) continue;
      seenExact.add(exactKey);
      const isolated = !crossCellFamilies.has(item.familyKey) && (!item.equivalenceKey || !crossCellEqs.has(item.equivalenceKey));
      if (isolated && !preferredIds?.has(item.id)) {
        const avail = Math.min(cellLimit - Math.max(fixedCat.get(cat) ?? 0, fixedMkt.get(item.marketplace) ?? 0), remSlots);
        const count = cellIsoCount.get(cell) ?? 0;
        if (count >= avail) continue;
        cellIsoCount.set(cell, count + 1);
      }
      pool.push(item);
    }

    const greedy: SelectionCandidate[] = [];
    let greedyNew = 0;
    for (const item of pool) {
      if (greedy.length >= remSlots) break;
      const isNew = !existingIds.has(item.id);
      if (isNew && greedyNew >= maxNew) continue;
      if (fits(item, [...fixed, ...greedy], 0)) {
        greedy.push(item);
        if (isNew) greedyNew++;
      }
    }
    const sumScore = (items: readonly SelectionCandidate[]) => items.reduce((acc, item) => acc + item.score, 0);
    const prefCount = (items: readonly SelectionCandidate[]) =>
      preferredIds ? items.reduce((acc, item) => acc + Number(preferredIds.has(item.id)), 0) : 0;
    const greedyAllPreferred = !preferredIds || greedy.every(item => preferredIds.has(item.id));
    if (greedy.length === remSlots && greedyAllPreferred) return greedy;

    let best = greedy;
    let bestLen = greedy.length;
    let bestPref = prefCount(greedy);
    let bestScore = sumScore(greedy);

    const chosen: SelectionCandidate[] = [];
    const curCat = new Map(fixedCat);
    const curMkt = new Map(fixedMkt);
    const fixedPlusChosen = [...fixed];
    let steps = 0;
    const MAX_STEPS = 25_000;

    const betterThanBest = (len: number, pref: number, score: number) =>
      len > bestLen || (len === bestLen && (pref > bestPref || (pref === bestPref && score > bestScore)));

    const dfs = (startIdx: number, newUsed: number, curPref: number, curScore: number) => {
      if (betterThanBest(chosen.length, curPref, curScore)) {
        best = [...chosen];
        bestLen = chosen.length;
        bestPref = curPref;
        bestScore = curScore;
      }
      if (chosen.length === remSlots || startIdx >= pool.length || ++steps > MAX_STEPS) return;

      const compat: Array<{ idx: number; item: SelectionCandidate; isNew: boolean }> = [];
      const remByCat = new Map<string, number>();
      const remByMkt = new Map<string, number>();
      let compatPref = 0;
      let compatNew = 0;
      const compatScores: number[] = [];

      for (let i = startIdx; i < pool.length; i++) {
        const item = pool[i]!;
        const isNew = !existingIds.has(item.id);
        if (isNew && newUsed >= maxNew) continue;
        const cat = category(item);
        if ((curCat.get(cat) ?? 0) >= categoryCap) continue;
        if ((curMkt.get(item.marketplace) ?? 0) >= marketplaceCap) continue;
        if (fixedPlusChosen.some(cur => sameFamily(cur, item))) continue;
        compat.push({ idx: i, item, isNew });
        remByCat.set(cat, (remByCat.get(cat) ?? 0) + 1);
        remByMkt.set(item.marketplace, (remByMkt.get(item.marketplace) ?? 0) + 1);
        if (preferredIds?.has(item.id)) compatPref++;
        if (isNew) compatNew++;
        compatScores.push(item.score);
      }
      if (compat.length === 0) return;

      let ubCat = 0;
      for (const [cat, cnt] of remByCat) ubCat += Math.min(cnt, categoryCap - (curCat.get(cat) ?? 0));
      let ubMkt = 0;
      for (const [mkt, cnt] of remByMkt) ubMkt += Math.min(cnt, marketplaceCap - (curMkt.get(mkt) ?? 0));
      const newCapLeft = maxNew < Infinity ? (compat.length - compatNew) + Math.min(compatNew, maxNew - newUsed) : compat.length;
      const maxMore = Math.min(remSlots - chosen.length, compat.length, ubCat, ubMkt, newCapLeft);

      if (chosen.length + maxMore < bestLen) return;
      if (chosen.length + maxMore === bestLen) {
        const maxPossiblePref = curPref + Math.min(maxMore, compatPref);
        if (maxPossiblePref < bestPref) return;
        if (maxPossiblePref === bestPref) {
          compatScores.sort((a, b) => b - a);
          let ubScore = curScore;
          for (let k = 0; k < maxMore; k++) ubScore += compatScores[k]!;
          if (ubScore <= bestScore) return;
        }
      }

      const first = compat[0]!;
      const cat = category(first.item);
      chosen.push(first.item);
      fixedPlusChosen.push(first.item);
      curCat.set(cat, (curCat.get(cat) ?? 0) + 1);
      curMkt.set(first.item.marketplace, (curMkt.get(first.item.marketplace) ?? 0) + 1);
      dfs(
        first.idx + 1,
        newUsed + Number(first.isNew),
        curPref + Number(Boolean(preferredIds?.has(first.item.id))),
        curScore + first.item.score
      );
      chosen.pop();
      fixedPlusChosen.pop();
      curCat.set(cat, (curCat.get(cat) ?? 0) - 1);
      curMkt.set(first.item.marketplace, (curMkt.get(first.item.marketplace) ?? 0) - 1);

      if (chosen.length + (compat.length - 1) >= bestLen) {
        dfs(first.idx + 1, newUsed, curPref, curScore);
      }
    };

    dfs(0, 0, 0, 0);
    return best;
  };

  // Validate active occupants against stay gate, merit drop, and sameFamily uniqueness.
  const eligibleOccupants: SelectionCandidate[] = [];
  for (const occupant of occupants) {
    const candidate = byId.get(occupant.id);
    const gate = candidate && selectionOfferGate(candidate,"stay",now,policy);
    const dropped = candidate && gate?.eligible && occupant.scoreVersion === candidate.scoreVersion && !!occupant.normalizationRevision
      && occupant.normalizationRevision===candidate.normalizationRevision && candidate.score < occupant.entryScore * (1-policy.dropFraction);
    if (!candidate || !gate?.eligible || dropped || eligibleOccupants.some(item => sameFamily(item, candidate))) {
      if (dropped) meritEjected.add(occupant.id);
      exits.push({id:occupant.id,reason:!candidate ? "missing" : dropped ? "merit_drop" : gate && !gate.eligible ? gate.reasons.join(",") : "duplicate_or_capacity"});
      continue;
    }
    eligibleOccupants.push(candidate);
  }
  const ranked = [...candidates].sort((a,b) => b.score-a.score || a.id.localeCompare(b.id));
  const exceptions: Array<{id:string;reason:string}> = [];

  const composeCohort = (
    baseItems: readonly SelectionCandidate[],
    queue: readonly SelectionCandidate[],
    options: {
      maxNew?: number;
      toEntry?: (candidate: SelectionCandidate) => SelectionCandidate;
      onReplace?: (victim: SelectionCandidate, reason: string) => void;
      onAdmit?: (candidate: SelectionCandidate) => void;
      onScarcity?: (candidate: SelectionCandidate) => void;
    } = {}
  ): SelectionCandidate[] => {
    const maxNew = options.maxNew ?? Infinity;
    const mapEntry = options.toEntry ?? ((c: SelectionCandidate) => c);
    const baseEntries = baseItems.map(item => item);
    const existingIds = new Set(baseEntries.map(item => item.id));
    const entryById = new Map<string, { original: SelectionCandidate; entry: SelectionCandidate }>();
    const entrantEntries: SelectionCandidate[] = [];
    for (const candidate of queue) {
      const entry = mapEntry(candidate);
      entryById.set(entry.id, { original: candidate, entry });
      entrantEntries.push(entry);
    }

    // Separate existing items that fit strictly from any carried-over excess from prior scarcity.
    const orderedBase = withinStrictCaps(baseEntries)
      ? baseEntries
      : [...baseEntries].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const strictKeep: SelectionCandidate[] = [];
    const overCapBase: SelectionCandidate[] = [];
    for (const item of orderedBase) {
      if (strictKeep.length < policy.capacity && fits(item, strictKeep, 0)) strictKeep.push(item);
      else overCapBase.push(item);
    }

    // 1) Challenger swaps against strictKeep (preserve hysteresis, stay strictly within caps).
    let addedNew = 0;
    const swappedOutIds = new Set<string>();
    const swappedIn: SelectionCandidate[] = [];
    for (const entry of entrantEntries) {
      if (addedNew >= maxNew) break;
      // Leave open-slot admissions for combinatorial strict filling unless entry cannot fit open slots strictly.
      if (strictKeep.length < policy.capacity && fits(entry, strictKeep, 0)) continue;
      const victim = replacementOrder(entry, strictKeep).find(item =>
        entry.score > item.score * (1 + policy.challengerMargin)
        && fits(entry, strictKeep.filter(current => current.id !== item.id), 0));
      if (!victim) continue;
      strictKeep[strictKeep.findIndex(item => item.id === victim.id)] = entry;
      swappedOutIds.add(victim.id);
      swappedIn.push(entry);
      addedNew++;
      options.onReplace?.(victim, "better_challenger");
    }

    // 2) Fill remaining open slots strictly without greedy dead-end false scarcity.
    const usedIds = new Set([...strictKeep.map(x => x.id), ...swappedOutIds]);
    const strictExtra = findStrictMax(
      strictKeep,
      entrantEntries.filter(entry => !usedIds.has(entry.id)),
      Math.max(0, maxNew - addedNew),
      existingIds
    );
    let result = [...strictKeep, ...strictExtra];
    let strictAddedNew = swappedIn.length + strictExtra.length;

    // 3) Reconsider locked incumbents/swaps only if reorganizing strictly increases valid slot fill.
    if (result.length < policy.capacity && baseEntries.length > 0 && addedNew < maxNew) {
      const combined = [...strictKeep, ...entrantEntries.filter(entry => !usedIds.has(entry.id))];
      const preferred = new Set(strictKeep.map(item => item.id));
      const fullStrict = findStrictMax([], combined, maxNew, existingIds, preferred);
      if (fullStrict.length > result.length) {
        const fullIds = new Set(fullStrict.map(item => item.id));
        for (const item of strictKeep) {
          if (!fullIds.has(item.id) && !swappedOutIds.has(item.id)) {
            swappedOutIds.add(item.id);
            options.onReplace?.(item, "duplicate_or_capacity");
          }
        }
        result = fullStrict;
        strictAddedNew = result.filter(item => !existingIds.has(item.id)).length;
      }
    }

    const resultIds = new Set(result.map(item => item.id));
    // Report deferred overCapBase items that were cleanly replaced by strict diversity as capacity exits,
    // or retain them under scarcity ahead of entrants unless beaten by +challengerMargin.
    const scarcityRemaining: Array<{ item: SelectionCandidate; priority: number; isBase: boolean }> = [
      ...overCapBase
        .filter(item => !resultIds.has(item.id) && !swappedOutIds.has(item.id))
        .map(item => ({ item, priority: item.score * (1 + policy.challengerMargin), isBase: true })),
      ...entrantEntries
        .filter(entry => !resultIds.has(entry.id))
        .map(entry => ({ item: entry, priority: entry.score, isBase: false })),
    ].sort((a, b) => b.priority - a.priority || Number(b.isBase) - Number(a.isBase) || a.item.id.localeCompare(b.item.id));

    let curNew = strictAddedNew;
    const scarcityAdmitted: SelectionCandidate[] = [];
    for (let allowance = 1; allowance <= policy.capacity * 2 && result.length < policy.capacity; allowance++) {
      for (const candidate of scarcityRemaining) {
        if (result.length >= policy.capacity) break;
        if (resultIds.has(candidate.item.id)) continue;
        if (!candidate.isBase && curNew >= maxNew) continue;
        if (fits(candidate.item, result, allowance)) {
          result.push(candidate.item);
          resultIds.add(candidate.item.id);
          if (!fits(candidate.item, result.slice(0, -1), 0)) scarcityAdmitted.push(candidate.item);
          if (!candidate.isBase) curNew++;
        }
      }
    }

    for (const item of overCapBase) {
      if (!resultIds.has(item.id) && !swappedOutIds.has(item.id)) {
        const replacedByBetter = !scarcityAdmitted.some(s => s.id === item.id)
          && scarcityAdmitted.some(s => !existingIds.has(s.id) && s.score > item.score * (1 + policy.challengerMargin));
        options.onReplace?.(item, replacedByBetter ? "better_challenger" : "duplicate_or_capacity");
      }
    }
    for (const item of result) {
      const mapped = entryById.get(item.id);
      if (mapped && !existingIds.has(item.id)) options.onAdmit?.(mapped.original);
    }
    for (const item of scarcityAdmitted) {
      options.onScarcity?.(item);
    }
    return result;
  };

  const entryQueue = ranked.filter(candidate => !meritEjected.has(candidate.id)
    && !eligibleOccupants.some(item => item.id === candidate.id)
    && selectionOfferGate(candidate, "entry", now, policy).eligible);
  const selected = composeCohort(eligibleOccupants, entryQueue, {
    onReplace: (victim, reason) => exits.push({ id: victim.id, reason }),
    onScarcity: candidate => exceptions.push({ id: candidate.id, reason: "diversity_scarcity" }),
  });

  // Reserve checks for candidates that could enter the current composition
  // after fresh evidence. Potential score orders this hypothetical contest;
  // it never grants a real place or bypasses the factual gate.
  const pending:SelectionCandidate[] = [], hypothetical=[...selected];
  const needsShopeeRenewal=(candidate:SelectionCandidate) => {
    if(candidate.marketplace!=="shopee" || !selected.some(item=>item.id===candidate.id)) return false;
    const verified=candidate.verifiedAt ? Date.parse(candidate.verifiedAt) : NaN;
    const age=now.getTime()-verified;
    return Number.isFinite(verified) && age>=policy.shopeeHours*3_600_000*0.75
      && selectionOfferGate(candidate,"stay",now,policy).eligible;
  };
  const needsCheck=ranked.filter(candidate=>{
    if (meritEjected.has(candidate.id)) return false;
    const gate=selectionOfferGate(candidate,"entry",now,policy);
    return needsShopeeRenewal(candidate) || gate.reasons.length===1 && gate.reasons[0]==="verification_required";
  }).sort((a,b)=>Number(needsShopeeRenewal(b))-Number(needsShopeeRenewal(a))
    || b.potentialScore-a.potentialScore || a.id.localeCompare(b.id));
  const checkQueue: SelectionCandidate[] = [];
  for (const candidate of needsCheck) {
    if(pending.length>=policy.pendingLimit) break;
    // An incumbent may need renewal even though it can still stay temporarily.
    if(hypothetical.some(item=>item.id===candidate.id)) {pending.push(candidate);continue;}
    checkQueue.push(candidate);
  }
  composeCohort(hypothetical, checkQueue, {
    maxNew: Math.max(0, policy.pendingLimit - pending.length),
    toEntry: candidate => ({ ...candidate, score: candidate.potentialScore }),
    onAdmit: candidate => pending.push(candidate),
  });
  return { selected, pending, exits, exceptions, openSlots: policy.capacity-selected.length };
}
