import { createHash } from "node:crypto";
import { CURATION_SCORE_VERSION, DEFAULT_SCORE_WEIGHTS, type ScoreWeights, validScoreWeights } from "./curation-score-v2.ts";

export function scoreWeightsRevision(weights:ScoreWeights):string {
  if(!validScoreWeights(weights)) throw new Error("score_weights_invalid");
  const values=Object.keys(DEFAULT_SCORE_WEIGHTS).map(key=>weights[key as keyof ScoreWeights]);
  return `${CURATION_SCORE_VERSION}:${createHash("sha256").update(JSON.stringify(values)).digest("hex").slice(0,16)}`;
}
