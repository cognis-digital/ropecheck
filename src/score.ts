/**
 * Scoring engine: turn signals into a clamped 0-100 score and a tier.
 */

import type { TokenMetadata, ScanResult, RiskSignal, RiskTier } from "./types.js";
import { evaluateSignals } from "./signals.js";

/** Tier cut points on the 0-100 risk scale (inclusive lower bound). */
export const TIER_THRESHOLDS = {
  /** score < this => SAFE-ish */
  caution: 20,
  /** score < this => CAUTION */
  highRisk: 45,
  /** score < this => HIGH-RISK; at/above => AVOID */
  avoid: 70,
} as const;

/** Map a numeric score to a tier. */
export function tierForScore(score: number): RiskTier {
  if (score >= TIER_THRESHOLDS.avoid) return "AVOID";
  if (score >= TIER_THRESHOLDS.highRisk) return "HIGH-RISK";
  if (score >= TIER_THRESHOLDS.caution) return "CAUTION";
  return "SAFE-ish";
}

/** Order signals worst-first for display (by points desc, then severity). */
const SEVERITY_RANK: Record<RiskSignal["severity"], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
  good: 5,
};

export function sortSignals(signals: RiskSignal[]): RiskSignal[] {
  return [...signals].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  });
}

/**
 * Score a single token's metadata.
 * Sum of signal points, clamped to [0, 100], rounded to nearest integer.
 */
export function scoreToken(m: TokenMetadata): ScanResult {
  const signals = evaluateSignals(m);
  const raw = signals.reduce((acc, s) => acc + s.points, 0);
  const clamped = Math.max(0, Math.min(100, raw));
  const score = Math.round(clamped);

  return {
    name: m.name?.trim() || "(unnamed)",
    symbol: m.symbol?.trim() || "?",
    score,
    tier: tierForScore(score),
    signals: sortSignals(signals),
    metadata: m,
  };
}

/** Score a batch and return worst-first. */
export function scoreBatch(tokens: TokenMetadata[]): ScanResult[] {
  return tokens
    .map(scoreToken)
    .sort((a, b) => b.score - a.score);
}
