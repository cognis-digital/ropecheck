/**
 * Core data contracts for ropecheck.
 *
 * Everything operates on TokenMetadata — a plain, offline-friendly snapshot of
 * the on-chain / explorer facts that matter for rug-pull and honeypot risk.
 * No field requires a network call; a `--live` collector can populate this
 * shape, but the scoring model is pure and deterministic over the struct.
 */

/** Result of a honeypot simulation (a trial buy+sell on a fork/simulator). */
export type HoneypotResult = "pass" | "fail" | "unknown";

/** Token + contract facts used for risk scoring. All fields optional so that
 *  partial metadata still scores (missing data is treated conservatively). */
export interface TokenMetadata {
  /** Display name of the token, e.g. "Example Token". */
  name?: string;
  /** Ticker symbol, e.g. "EXMPL". */
  symbol?: string;
  /** Chain identifier, free-form, e.g. "ethereum", "bsc". */
  chain?: string;
  /** Contract address (informational; not validated on-chain offline). */
  address?: string;

  /** True if the contract owner has been renounced (no privileged owner). */
  ownershipRenounced?: boolean;
  /** True if the source code is verified on a block explorer. */
  contractVerified?: boolean;

  /** True if a mint function exists (owner can inflate supply). */
  mintFunctionPresent?: boolean;
  /** True if the contract can pause transfers. */
  canPause?: boolean;
  /** True if the contract can blacklist / block addresses from selling. */
  canBlacklist?: boolean;
  /** True if the contract has a modifiable / unbounded trading fee. */
  hasModifiableTax?: boolean;

  /** True if LP tokens are locked (vesting / locker contract). */
  liquidityLocked?: boolean;
  /** Remaining lock duration in days. 0 / undefined when not locked. */
  lockDurationDays?: number;

  /** Buy tax as a percentage (0-100). */
  buyTaxPct?: number;
  /** Sell tax as a percentage (0-100). */
  sellTaxPct?: number;

  /** Combined share of supply held by the top holders, percentage (0-100). */
  topHolderConcentrationPct?: number;

  /** Outcome of a honeypot simulation, if one was run. */
  honeypotSim?: HoneypotResult;
}

/** A single contributing risk signal with its computed point contribution. */
export interface RiskSignal {
  /** Stable machine id for the signal. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Points this signal added to (positive) or removed from (negative) risk. */
  points: number;
  /** Plain-language explanation of why this signal fired. */
  reason: string;
  /** Severity bucket for display ordering / coloring. */
  severity: "critical" | "high" | "medium" | "low" | "info" | "good";
}

/** Risk tier derived from the final 0-100 score. */
export type RiskTier = "SAFE-ish" | "CAUTION" | "HIGH-RISK" | "AVOID";

/** Full scan result for one token. */
export interface ScanResult {
  name: string;
  symbol: string;
  /** Final clamped score, 0 (safest seen) to 100 (worst). */
  score: number;
  tier: RiskTier;
  signals: RiskSignal[];
  /** Convenience: signals sorted worst-first for display. */
  metadata: TokenMetadata;
}
