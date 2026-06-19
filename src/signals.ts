/**
 * Signal catalog and documented scoring weights.
 *
 * The model is an additive points system over a conservative 0..100 risk
 * scale. Each signal independently contributes points; positive points raise
 * rug-risk, negative points (only renounced ownership + a clean honeypot sim)
 * lower it. The total is clamped to [0, 100] and bucketed into a tier.
 *
 * Design rationale (clean-room, authored for this tool):
 *   - The single most catastrophic, irrecoverable outcome for a buyer is being
 *     unable to sell (honeypot) — it is weighted highest.
 *   - Unlocked liquidity is the classic rug mechanism (LP pulled) — high.
 *   - An owner-controlled mint dilutes holders to zero — high.
 *   - Pause / blacklist let an owner freeze a holder mid-trade — high.
 *   - Excessive taxes are a slow drain and often a soft honeypot — scaled.
 *   - Holder concentration is a dump risk — scaled.
 *   - Unverified source hides all of the above — medium.
 *   - Renounced ownership removes a whole class of owner attacks — credit.
 *
 * Weights are intentionally explicit constants so the README can document them
 * and tests can assert against them.
 */

import type { TokenMetadata, RiskSignal } from "./types.js";

/** All weights in one place so they are documentable and testable. */
export const WEIGHTS = {
  /** Confirmed honeypot (cannot sell) — the worst single outcome. */
  honeypotFail: 60,
  /** Honeypot status unknown (no sim run) — mild uncertainty penalty. */
  honeypotUnknown: 6,
  /** Clean honeypot sim — credit, but never a guarantee. */
  honeypotPass: -8,

  /** Liquidity not locked at all. */
  liquidityUnlocked: 22,
  /** Liquidity locked but for a short window (< 30 days). */
  liquidityShortLock: 10,
  /** Threshold (days) under which a lock is considered "short". */
  shortLockThresholdDays: 30,

  /** Mint function present (supply can be inflated). */
  mintPresent: 18,
  /** Pause function present. */
  canPause: 12,
  /** Blacklist function present (can block selling). */
  canBlacklist: 16,
  /** Modifiable / unbounded tax. */
  modifiableTax: 10,

  /** Per-point-of-tax-over-threshold contribution. */
  taxPerPctOverThreshold: 1.5,
  /** Combined buy+sell tax (%) considered acceptable before penalty. */
  taxFreeThresholdPct: 10,
  /** Cap on points contributed by taxes alone. */
  taxMaxPoints: 25,

  /** Holder concentration threshold (%) before penalty. */
  concentrationThresholdPct: 25,
  /** Per-point-over-threshold contribution. */
  concentrationPerPctOver: 0.6,
  /** Cap on points from concentration. */
  concentrationMaxPoints: 20,

  /** Source code not verified on an explorer. */
  unverified: 12,

  /** Owner has been renounced — credit. */
  ownershipRenounced: -14,
} as const;

/** Round to 1 decimal to keep point math readable. */
function r1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Evaluate every signal against the metadata, returning the list that fired.
 * Pure and deterministic. Missing fields are handled conservatively:
 *   - unknown honeypot => small uncertainty penalty
 *   - missing lock info => treated as unlocked
 *   - missing verification => treated as unverified
 *   - missing renounce flag => no credit (assume owner retains control)
 */
export function evaluateSignals(m: TokenMetadata): RiskSignal[] {
  const out: RiskSignal[] = [];

  // --- Honeypot simulation ---------------------------------------------
  const hp = m.honeypotSim ?? "unknown";
  if (hp === "fail") {
    out.push({
      id: "honeypot_fail",
      label: "Honeypot simulation failed",
      points: WEIGHTS.honeypotFail,
      reason:
        "A trial buy+sell simulation could not sell the token. This is the strongest single indicator of a honeypot — buyers may be unable to exit.",
      severity: "critical",
    });
  } else if (hp === "pass") {
    out.push({
      id: "honeypot_pass",
      label: "Honeypot simulation passed",
      points: WEIGHTS.honeypotPass,
      reason:
        "A trial buy+sell simulation completed successfully. This is reassuring but not a guarantee — conditions can change after launch.",
      severity: "good",
    });
  } else {
    out.push({
      id: "honeypot_unknown",
      label: "Honeypot status unknown",
      points: WEIGHTS.honeypotUnknown,
      reason:
        "No honeypot simulation result was provided, so sellability could not be confirmed. Treat as unverified.",
      severity: "info",
    });
  }

  // --- Liquidity lock ---------------------------------------------------
  if (m.liquidityLocked === true) {
    const days = m.lockDurationDays ?? 0;
    if (days < WEIGHTS.shortLockThresholdDays) {
      out.push({
        id: "liquidity_short_lock",
        label: "Liquidity locked only briefly",
        points: WEIGHTS.liquidityShortLock,
        reason: `Liquidity is locked but only for ${days} day(s) (under ${WEIGHTS.shortLockThresholdDays}). A short lock can expire and allow an exit-scam soon after.`,
        severity: "medium",
      });
    } else {
      out.push({
        id: "liquidity_locked",
        label: "Liquidity locked",
        points: 0,
        reason: `Liquidity is locked for ${days} day(s). This makes an immediate liquidity rug harder.`,
        severity: "good",
      });
    }
  } else {
    out.push({
      id: "liquidity_unlocked",
      label: "Liquidity NOT locked",
      points: WEIGHTS.liquidityUnlocked,
      reason:
        "Liquidity provider (LP) tokens are not locked. The deployer can withdraw the trading pool at any time — the classic rug-pull.",
      severity: "high",
    });
  }

  // --- Owner-controlled mint -------------------------------------------
  if (m.mintFunctionPresent === true) {
    out.push({
      id: "mint_present",
      label: "Mint function present",
      points: WEIGHTS.mintPresent,
      reason:
        "The contract can mint new tokens. An owner can inflate supply and dilute holders toward zero value.",
      severity: "high",
    });
  }

  // --- Pause ------------------------------------------------------------
  if (m.canPause === true) {
    out.push({
      id: "can_pause",
      label: "Transfers can be paused",
      points: WEIGHTS.canPause,
      reason:
        "The contract can pause transfers. An owner can freeze trading and trap holders.",
      severity: "high",
    });
  }

  // --- Blacklist --------------------------------------------------------
  if (m.canBlacklist === true) {
    out.push({
      id: "can_blacklist",
      label: "Addresses can be blacklisted",
      points: WEIGHTS.canBlacklist,
      reason:
        "The contract can blacklist addresses. An owner can block specific wallets from selling (a targeted honeypot).",
      severity: "high",
    });
  }

  // --- Modifiable tax ---------------------------------------------------
  if (m.hasModifiableTax === true) {
    out.push({
      id: "modifiable_tax",
      label: "Tax is modifiable",
      points: WEIGHTS.modifiableTax,
      reason:
        "Trading fees can be changed after launch. An owner can raise sell tax to ~100% and create a soft honeypot.",
      severity: "medium",
    });
  }

  // --- Buy/sell tax magnitude ------------------------------------------
  const buy = clampPct(m.buyTaxPct);
  const sell = clampPct(m.sellTaxPct);
  const totalTax = buy + sell;
  if (totalTax > WEIGHTS.taxFreeThresholdPct) {
    const over = totalTax - WEIGHTS.taxFreeThresholdPct;
    const pts = Math.min(
      over * WEIGHTS.taxPerPctOverThreshold,
      WEIGHTS.taxMaxPoints
    );
    out.push({
      id: "high_tax",
      label: "High trading tax",
      points: r1(pts),
      reason: `Combined buy/sell tax is ${r1(totalTax)}% (buy ${r1(buy)}% / sell ${r1(sell)}%), above the ${WEIGHTS.taxFreeThresholdPct}% comfort threshold. High taxes drain value and can mask a honeypot.`,
      severity: totalTax >= 30 ? "high" : "medium",
    });
  }

  // --- Holder concentration --------------------------------------------
  const conc = clampPct(m.topHolderConcentrationPct);
  if (conc > WEIGHTS.concentrationThresholdPct) {
    const over = conc - WEIGHTS.concentrationThresholdPct;
    const pts = Math.min(
      over * WEIGHTS.concentrationPerPctOver,
      WEIGHTS.concentrationMaxPoints
    );
    out.push({
      id: "holder_concentration",
      label: "High holder concentration",
      points: r1(pts),
      reason: `Top holders control ${r1(conc)}% of supply, above the ${WEIGHTS.concentrationThresholdPct}% threshold. A few wallets can dump and crash the price.`,
      severity: conc >= 50 ? "high" : "medium",
    });
  }

  // --- Source verification ---------------------------------------------
  if (m.contractVerified === true) {
    out.push({
      id: "verified",
      label: "Source code verified",
      points: 0,
      reason:
        "Contract source is verified on an explorer, so its behavior can be audited.",
      severity: "good",
    });
  } else {
    out.push({
      id: "unverified",
      label: "Source code NOT verified",
      points: WEIGHTS.unverified,
      reason:
        "Contract source is not verified on an explorer. Hidden code may contain malicious logic that cannot be reviewed.",
      severity: "medium",
    });
  }

  // --- Ownership renounce (credit) -------------------------------------
  if (m.ownershipRenounced === true) {
    out.push({
      id: "ownership_renounced",
      label: "Ownership renounced",
      points: WEIGHTS.ownershipRenounced,
      reason:
        "Ownership has been renounced, removing the privileged owner and a whole class of owner-only attacks (mint/pause/tax changes).",
      severity: "good",
    });
  } else {
    out.push({
      id: "owner_retained",
      label: "Owner retains control",
      points: 0,
      reason:
        "Ownership has not been renounced. Any owner-only powers above remain active and exploitable.",
      severity: "info",
    });
  }

  return out;
}

/** Clamp a percentage-ish value into [0, 100]; undefined => 0. */
function clampPct(n: number | undefined): number {
  if (typeof n !== "number" || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}
