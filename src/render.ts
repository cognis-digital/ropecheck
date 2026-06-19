/**
 * Plain-text table rendering for scan and batch results. No color libraries,
 * no runtime deps — just ANSI escapes (auto-disabled when not a TTY).
 */

import type { ScanResult, RiskTier } from "./types.js";

const COLOR = process.stdout.isTTY === true && !process.env.NO_COLOR;

function c(code: string, s: string): string {
  return COLOR ? `\x1b[${code}m${s}\x1b[0m` : s;
}

export function tierColor(tier: RiskTier, s: string): string {
  switch (tier) {
    case "AVOID":
      return c("1;31", s); // bold red
    case "HIGH-RISK":
      return c("31", s); // red
    case "CAUTION":
      return c("33", s); // yellow
    case "SAFE-ish":
      return c("32", s); // green
  }
}

function sign(points: number): string {
  if (points > 0) return `+${points}`;
  return `${points}`;
}

/** Render a single scan result as a human-readable block. */
export function renderScan(r: ScanResult): string {
  const lines: string[] = [];
  const header = `${r.name} (${r.symbol})`;
  lines.push(header);
  lines.push("-".repeat(Math.max(header.length, 40)));
  lines.push(
    `Rug-risk score: ${c("1", String(r.score))}/100   Tier: ${tierColor(
      r.tier,
      r.tier
    )}`
  );
  lines.push("");
  lines.push("Signals (worst first):");
  for (const s of r.signals) {
    const pts = s.points === 0 ? "  0" : sign(s.points).padStart(5);
    lines.push(`  [${pts}] ${s.label}`);
    lines.push(`         ${s.reason}`);
  }
  lines.push("");
  lines.push(
    c("2", "Informational only — not financial advice. Do your own research.")
  );
  return lines.join("\n");
}

/** Render a batch as a ranked table, worst-first. */
export function renderBatch(results: ScanResult[]): string {
  const lines: string[] = [];
  const rank = "#".padStart(3);
  const score = "SCORE".padStart(6);
  const tier = "TIER".padEnd(10);
  const sym = "SYMBOL".padEnd(10);
  lines.push(`${rank}  ${score}  ${tier}  ${sym}  NAME`);
  lines.push("-".repeat(64));
  results.forEach((r, i) => {
    const n = String(i + 1).padStart(3);
    const sc = String(r.score).padStart(6);
    const ti = tierColor(r.tier, r.tier.padEnd(10));
    const sy = r.symbol.padEnd(10);
    lines.push(`${n}  ${sc}  ${ti}  ${sy}  ${r.name}`);
  });
  lines.push("");
  lines.push(
    c("2", "Informational only — not financial advice. Do your own research.")
  );
  return lines.join("\n");
}
