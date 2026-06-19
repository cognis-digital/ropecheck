import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreToken, scoreBatch, tierForScore } from "../src/score.js";
import { evaluateSignals, WEIGHTS } from "../src/signals.js";
import type { TokenMetadata } from "../src/types.js";

const SAFE: TokenMetadata = {
  name: "Safe",
  symbol: "SAFE",
  ownershipRenounced: true,
  contractVerified: true,
  mintFunctionPresent: false,
  canPause: false,
  canBlacklist: false,
  hasModifiableTax: false,
  liquidityLocked: true,
  lockDurationDays: 365,
  buyTaxPct: 1,
  sellTaxPct: 1,
  topHolderConcentrationPct: 12,
  honeypotSim: "pass",
};

const RUG: TokenMetadata = {
  name: "Rug",
  symbol: "RUG",
  ownershipRenounced: false,
  contractVerified: false,
  mintFunctionPresent: true,
  canPause: true,
  canBlacklist: true,
  hasModifiableTax: true,
  liquidityLocked: false,
  lockDurationDays: 0,
  buyTaxPct: 10,
  sellTaxPct: 35,
  topHolderConcentrationPct: 78,
  honeypotSim: "fail",
};

test("safe token scores low and tiers SAFE-ish", () => {
  const r = scoreToken(SAFE);
  assert.ok(r.score < 20, `expected <20, got ${r.score}`);
  assert.equal(r.tier, "SAFE-ish");
});

test("rug token scores high and tiers AVOID", () => {
  const r = scoreToken(RUG);
  assert.ok(r.score >= 70, `expected >=70, got ${r.score}`);
  assert.equal(r.tier, "AVOID");
});

test("score is clamped to [0,100]", () => {
  const r = scoreToken(RUG);
  assert.ok(r.score >= 0 && r.score <= 100);
  // Renounced + verified + pass should never go negative.
  const veryClean: TokenMetadata = {
    ...SAFE,
    buyTaxPct: 0,
    sellTaxPct: 0,
    topHolderConcentrationPct: 0,
  };
  assert.ok(scoreToken(veryClean).score >= 0);
});

test("honeypot fail is the dominant single signal", () => {
  const sigs = evaluateSignals(RUG);
  const hp = sigs.find((s) => s.id === "honeypot_fail");
  assert.ok(hp);
  assert.equal(hp!.points, WEIGHTS.honeypotFail);
  // It should be the highest-point signal.
  const maxPts = Math.max(...sigs.map((s) => s.points));
  assert.equal(maxPts, WEIGHTS.honeypotFail);
});

test("renounced ownership reduces risk (credit applied)", () => {
  const sigs = evaluateSignals(SAFE);
  const credit = sigs.find((s) => s.id === "ownership_renounced");
  assert.ok(credit);
  assert.ok(credit!.points < 0);
});

test("unlocked liquidity raises risk vs locked", () => {
  // Use a mild base so neither variant saturates at the 100 clamp.
  const base: TokenMetadata = { contractVerified: true, honeypotSim: "pass" };
  const locked = scoreToken({ ...base, liquidityLocked: true, lockDurationDays: 365 });
  const unlocked = scoreToken({ ...base, liquidityLocked: false });
  assert.ok(unlocked.score > locked.score);
});

test("short lock penalized less than no lock", () => {
  const noLock = scoreToken({ liquidityLocked: false });
  const shortLock = scoreToken({ liquidityLocked: true, lockDurationDays: 5 });
  const longLock = scoreToken({ liquidityLocked: true, lockDurationDays: 400 });
  assert.ok(noLock.score > shortLock.score);
  assert.ok(shortLock.score > longLock.score);
});

test("high tax adds points and is capped", () => {
  const huge = evaluateSignals({ buyTaxPct: 50, sellTaxPct: 50 });
  const tax = huge.find((s) => s.id === "high_tax");
  assert.ok(tax);
  assert.ok(tax!.points <= WEIGHTS.taxMaxPoints);
});

test("concentration adds points and is capped", () => {
  const huge = evaluateSignals({ topHolderConcentrationPct: 100 });
  const conc = huge.find((s) => s.id === "holder_concentration");
  assert.ok(conc);
  assert.ok(conc!.points <= WEIGHTS.concentrationMaxPoints);
});

test("missing fields score conservatively (unknown honeypot, unverified, unlocked)", () => {
  const sigs = evaluateSignals({});
  assert.ok(sigs.find((s) => s.id === "honeypot_unknown"));
  assert.ok(sigs.find((s) => s.id === "unverified"));
  assert.ok(sigs.find((s) => s.id === "liquidity_unlocked"));
});

test("tierForScore boundaries", () => {
  assert.equal(tierForScore(0), "SAFE-ish");
  assert.equal(tierForScore(19), "SAFE-ish");
  assert.equal(tierForScore(20), "CAUTION");
  assert.equal(tierForScore(44), "CAUTION");
  assert.equal(tierForScore(45), "HIGH-RISK");
  assert.equal(tierForScore(69), "HIGH-RISK");
  assert.equal(tierForScore(70), "AVOID");
  assert.equal(tierForScore(100), "AVOID");
});

test("batch ranks worst-first", () => {
  const results = scoreBatch([SAFE, RUG]);
  assert.equal(results.length, 2);
  assert.equal(results[0].symbol, "RUG");
  assert.equal(results[1].symbol, "SAFE");
  assert.ok(results[0].score >= results[1].score);
});

test("signals are sorted worst-first in scan result", () => {
  const r = scoreToken(RUG);
  for (let i = 1; i < r.signals.length; i++) {
    assert.ok(r.signals[i - 1].points >= r.signals[i].points);
  }
});
