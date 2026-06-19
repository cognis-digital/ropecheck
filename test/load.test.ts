import { test } from "node:test";
import assert from "node:assert/strict";
import { coerceToken, LoadError } from "../src/load.js";

test("coerceToken accepts a valid object", () => {
  const m = coerceToken({
    name: "X",
    symbol: "X",
    ownershipRenounced: true,
    buyTaxPct: 5,
    honeypotSim: "pass",
  });
  assert.equal(m.name, "X");
  assert.equal(m.ownershipRenounced, true);
  assert.equal(m.buyTaxPct, 5);
  assert.equal(m.honeypotSim, "pass");
});

test("coerceToken rejects non-objects", () => {
  assert.throws(() => coerceToken(42), LoadError);
  assert.throws(() => coerceToken([]), LoadError);
  assert.throws(() => coerceToken(null), LoadError);
});

test("coerceToken rejects wrong field types", () => {
  assert.throws(() => coerceToken({ ownershipRenounced: "yes" }), LoadError);
  assert.throws(() => coerceToken({ buyTaxPct: "5" }), LoadError);
  assert.throws(() => coerceToken({ name: 5 }), LoadError);
});

test("coerceToken rejects bad honeypotSim value", () => {
  assert.throws(() => coerceToken({ honeypotSim: "maybe" }), LoadError);
});

test("coerceToken ignores null/undefined fields", () => {
  const m = coerceToken({ name: "X", symbol: null, buyTaxPct: undefined });
  assert.equal(m.name, "X");
  assert.equal(m.symbol, undefined);
  assert.equal(m.buyTaxPct, undefined);
});
