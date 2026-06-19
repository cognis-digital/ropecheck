/**
 * Static documentation of each signal and the scoring model, surfaced by
 * `ropecheck explain`.
 */

import { WEIGHTS } from "./signals.js";
import { TIER_THRESHOLDS } from "./score.js";

export interface SignalDoc {
  field: string;
  meaning: string;
  effect: string;
}

export const SIGNAL_DOCS: SignalDoc[] = [
  {
    field: "honeypotSim: \"pass\" | \"fail\" | \"unknown\"",
    meaning:
      "Result of a trial buy-then-sell simulation. \"fail\" means the token could not be sold.",
    effect: `fail +${WEIGHTS.honeypotFail} (the single strongest red flag), unknown +${WEIGHTS.honeypotUnknown}, pass ${WEIGHTS.honeypotPass} (credit).`,
  },
  {
    field: "liquidityLocked + lockDurationDays",
    meaning:
      "Whether LP tokens are locked and for how long. Unlocked liquidity can be withdrawn (the pool 'rugged').",
    effect: `unlocked +${WEIGHTS.liquidityUnlocked}; locked < ${WEIGHTS.shortLockThresholdDays}d +${WEIGHTS.liquidityShortLock}; locked longer = no penalty.`,
  },
  {
    field: "mintFunctionPresent",
    meaning: "Whether the owner can mint new supply and dilute holders.",
    effect: `present +${WEIGHTS.mintPresent}.`,
  },
  {
    field: "canPause",
    meaning: "Whether the owner can pause/freeze transfers.",
    effect: `present +${WEIGHTS.canPause}.`,
  },
  {
    field: "canBlacklist",
    meaning: "Whether the owner can block specific wallets from selling.",
    effect: `present +${WEIGHTS.canBlacklist}.`,
  },
  {
    field: "hasModifiableTax",
    meaning:
      "Whether trading fees can be changed after launch (e.g. raised to ~100%).",
    effect: `present +${WEIGHTS.modifiableTax}.`,
  },
  {
    field: "buyTaxPct + sellTaxPct",
    meaning: "Trading fees taken on buys and sells.",
    effect: `combined tax over ${WEIGHTS.taxFreeThresholdPct}% adds ${WEIGHTS.taxPerPctOverThreshold} pt per excess %, capped at +${WEIGHTS.taxMaxPoints}.`,
  },
  {
    field: "topHolderConcentrationPct",
    meaning: "Share of supply held by the largest holders (dump risk).",
    effect: `over ${WEIGHTS.concentrationThresholdPct}% adds ${WEIGHTS.concentrationPerPctOver} pt per excess %, capped at +${WEIGHTS.concentrationMaxPoints}.`,
  },
  {
    field: "contractVerified",
    meaning: "Whether the source code is published/verified on an explorer.",
    effect: `unverified +${WEIGHTS.unverified}; verified = no penalty.`,
  },
  {
    field: "ownershipRenounced",
    meaning:
      "Whether the privileged owner role has been renounced, neutralizing owner-only attacks.",
    effect: `renounced ${WEIGHTS.ownershipRenounced} (credit); retained = no change.`,
  },
];

export const TIER_DOC = [
  `SAFE-ish : score 0-${TIER_THRESHOLDS.caution - 1}`,
  `CAUTION  : score ${TIER_THRESHOLDS.caution}-${TIER_THRESHOLDS.highRisk - 1}`,
  `HIGH-RISK: score ${TIER_THRESHOLDS.highRisk}-${TIER_THRESHOLDS.avoid - 1}`,
  `AVOID    : score ${TIER_THRESHOLDS.avoid}-100`,
];

export function renderExplain(): string {
  const lines: string[] = [];
  lines.push("ropecheck — signal reference");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(
    "ropecheck scores token/contract metadata on a 0-100 rug-risk scale."
  );
  lines.push(
    "Higher = riskier. The score is the clamped sum of the signals below."
  );
  lines.push("");
  lines.push("SIGNALS");
  lines.push("-".repeat(60));
  for (const d of SIGNAL_DOCS) {
    lines.push(`• ${d.field}`);
    lines.push(`    what : ${d.meaning}`);
    lines.push(`    score: ${d.effect}`);
    lines.push("");
  }
  lines.push("TIERS");
  lines.push("-".repeat(60));
  for (const t of TIER_DOC) lines.push(`  ${t}`);
  lines.push("");
  lines.push(
    "Informational only — NOT financial advice. A low score is not a"
  );
  lines.push(
    "guarantee of safety. Always do your own research before transacting."
  );
  return lines.join("\n");
}
