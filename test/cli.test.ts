import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { run } from "../src/cli.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/test -> repo root -> examples
const examples = join(here, "..", "..", "examples");
const SAFE = join(examples, "safeish-token.json");
const RUG = join(examples, "rug-token.json");
const WATCH = join(examples, "watchlist.json");

/** Capture output via the injectable IO sink (no global monkey-patching). */
async function capture(argv: string[]): Promise<{ code: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const code = await run(argv, {
    out: (s) => {
      out += s;
    },
    err: (s) => {
      err += s;
    },
  });
  return { code, out, err };
}

test("scan --json on safe token returns SAFE-ish, exit 0", async () => {
  const { code, out } = await capture(["scan", SAFE, "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.tier, "SAFE-ish");
  assert.ok(parsed.score < 20);
});

test("scan --json on rug token returns AVOID", async () => {
  const { code, out } = await capture(["scan", RUG, "--json"]);
  assert.equal(code, 0);
  const parsed = JSON.parse(out);
  assert.equal(parsed.tier, "AVOID");
});

test("--fail-on avoid exits 2 for rug token", async () => {
  const { code } = await capture(["scan", RUG, "--json", "--fail-on", "avoid"]);
  assert.equal(code, 2);
});

test("--fail-on avoid exits 0 for safe token", async () => {
  const { code } = await capture(["scan", SAFE, "--json", "--fail-on", "avoid"]);
  assert.equal(code, 0);
});

test("--fail-on high exits 2 for rug token", async () => {
  const { code } = await capture(["scan", RUG, "--json", "--fail-on=high"]);
  assert.equal(code, 2);
});

test("batch ranks worst-first and gates", async () => {
  const { code, out } = await capture(["batch", WATCH, "--json", "--fail-on", "avoid"]);
  assert.equal(code, 2);
  const arr = JSON.parse(out);
  assert.equal(arr[0].symbol, "RUG");
  assert.equal(arr[arr.length - 1].symbol, "SAFE");
});

test("explain prints reference, exit 0", async () => {
  const { code, out } = await capture(["explain"]);
  assert.equal(code, 0);
  assert.match(out, /SIGNALS/);
  assert.match(out, /not financial advice/i);
});

test("unknown command exits 1", async () => {
  const { code } = await capture(["frobnicate"]);
  assert.equal(code, 1);
});

test("scan without file errors exit 1", async () => {
  const { code, err } = await capture(["scan"]);
  assert.equal(code, 1);
  assert.match(err, /requires a/);
});

test("bad --fail-on value errors exit 1", async () => {
  const { code } = await capture(["scan", SAFE, "--fail-on", "sometimes"]);
  assert.equal(code, 1);
});

test("--version prints version", async () => {
  const { code, out } = await capture(["--version"]);
  assert.equal(code, 0);
  assert.match(out, /\d+\.\d+\.\d+/);
});
