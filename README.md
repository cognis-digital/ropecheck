# ropecheck

**Defensive token/contract rug-pull & honeypot risk scanner.**

`ropecheck` reads a plain JSON snapshot of a token's on-chain / explorer facts
and computes a **0-100 rug-risk score** with a tier
(`SAFE-ish` / `CAUTION` / `HIGH-RISK` / `AVOID`) and a plain-language reason for
every signal that fired. It is a **consumer-protection** tool: its only purpose
is to help you **avoid** malicious tokens. It does **not** buy, sell, deploy, or
interact with any chain to move funds.

> ⚠️ **Informational only — NOT financial advice.** A low score is not a
> guarantee of safety, and scammers adapt. Always do your own research before
> transacting. `ropecheck` analyzes the metadata you give it; it cannot see
> everything.

- **Offline-first.** The scoring model is pure and deterministic over a JSON
  snapshot — no network calls, no keys, no telemetry.
- **Zero runtime dependencies.** TypeScript compiled to ESM; ships only what
  Node already provides.
- **Explainable.** Every point on the score traces back to a documented signal.

License: COCL 1.0
Maintainer: Cognis Digital

---


<!-- cognis:example:start -->
## 🔎 Example output

**Sample result format** _(illustrative values — run on your own data for real findings):_

```
{
  "rope": {
    "length": 30.0,
    "material": "nylon",
    "condition": "good"
  },
  "check_result": "pass",
  "notes": [
    {
      "type": "minor_knot",
      "location": 10.5
    }
  ]
}
```

<!-- cognis:example:end -->

## Install

```bash
npm install
npm run build
```

This produces `dist/`. The CLI entry is `dist/src/cli.js` (exposed as the
`ropecheck` bin when installed).

## Usage

```bash
# Score one token (human-readable table)
ropecheck scan examples/safeish-token.json
ropecheck scan examples/rug-token.json

# Machine-readable output
ropecheck scan examples/rug-token.json --json

# Rank a watchlist worst-first
ropecheck batch examples/watchlist.json

# CI / pipeline gate: exit 2 if anything is AVOID (or HIGH-RISK)
ropecheck batch examples/watchlist.json --fail-on avoid
ropecheck scan  examples/rug-token.json --fail-on high

# What does each signal mean?
ropecheck explain
```

Run without arguments (or with `--help`) for usage; `--version` prints the
version.

### Exit codes

| Code | Meaning                                                        |
|------|----------------------------------------------------------------|
| `0`  | Success; gate (if any) not tripped                             |
| `1`  | Bad input / usage error (missing file, invalid JSON, bad flag) |
| `2`  | `--fail-on` gate tripped (worst tier met the threshold)        |

`--fail-on high` trips on `HIGH-RISK` **or** `AVOID`; `--fail-on avoid` trips
only on `AVOID`.

### `--live`

A `--live` flag is reserved for an isolated on-chain / explorer collector that
would populate the same metadata shape. It is intentionally **not enabled** in
this build — `ropecheck` scores the metadata you provide. This keeps the core
fully offline, deterministic, and test-covered.

## Input format

A token snapshot is a JSON object. All fields are optional; missing fields are
scored **conservatively** (e.g. an absent honeypot result is treated as
`unknown`, absent verification as unverified, absent lock as unlocked).

```jsonc
{
  "name": "Example Token",
  "symbol": "EXMPL",
  "chain": "ethereum",
  "address": "0x...",

  "ownershipRenounced": true,      // owner role given up?
  "contractVerified": true,        // source verified on explorer?

  "mintFunctionPresent": false,    // can supply be inflated?
  "canPause": false,               // can transfers be frozen?
  "canBlacklist": false,           // can wallets be blocked from selling?
  "hasModifiableTax": false,       // can fees be changed post-launch?

  "liquidityLocked": true,         // LP tokens locked?
  "lockDurationDays": 365,         // remaining lock, in days

  "buyTaxPct": 1,                  // buy fee %
  "sellTaxPct": 1,                 // sell fee %

  "topHolderConcentrationPct": 12, // % held by largest holders

  "honeypotSim": "pass"            // "pass" | "fail" | "unknown"
}
```

A **batch** file is either a top-level array of such objects, or an object with
a `tokens` array (see `examples/watchlist.json`).

## Scoring model

The score is the **clamped sum** of independent signal contributions on a
0-100 scale (higher = riskier). The model is designed around one principle:
the most catastrophic, irreversible outcome for a buyer — *being unable to
sell* — carries the most weight, followed by the mechanisms that enable an
exit-scam.

| Signal                              | Contribution |
|-------------------------------------|--------------|
| Honeypot sim = `fail`               | **+60**      |
| Honeypot sim = `unknown`            | +6           |
| Honeypot sim = `pass`               | **−8** (credit) |
| Liquidity not locked                | +22          |
| Liquidity locked < 30 days          | +10          |
| Mint function present               | +18          |
| Can blacklist                       | +16          |
| Can pause                           | +12          |
| Source not verified                 | +12          |
| Modifiable tax                      | +10          |
| Combined buy+sell tax over 10%      | +1.5 per excess %, capped +25 |
| Top-holder concentration over 25%   | +0.6 per excess %, capped +20 |
| **Ownership renounced**             | **−14** (credit) |

The total is clamped to `[0, 100]` and bucketed:

| Tier        | Score   |
|-------------|---------|
| `SAFE-ish`  | 0-19    |
| `CAUTION`   | 20-44   |
| `HIGH-RISK` | 45-69   |
| `AVOID`     | 70-100  |

Run `ropecheck explain` for the same reference from the CLI. The weights live in
[`src/signals.ts`](src/signals.ts) as documented constants.

## Examples

- [`examples/safeish-token.json`](examples/safeish-token.json) — renounced,
  verified, liquidity locked a year, tiny taxes, clean honeypot sim → `SAFE-ish`.
- [`examples/rug-token.json`](examples/rug-token.json) — owner-retained,
  unverified, mint + pause + blacklist + modifiable tax, unlocked liquidity,
  high taxes, concentrated supply, failed honeypot sim → `AVOID`.
- [`examples/watchlist.json`](examples/watchlist.json) — a 3-token batch.

## Development

```bash
npm run build   # tsc -> dist/
npm test        # builds, then runs node:test over dist/test/*.test.js
```

Tests use the Node built-in test runner (`node:test`); there is no test
framework dependency.

## Scope & ethics

`ropecheck` is strictly **defensive**. It exists to warn people away from
honeypots and rug-pulls. It contains no functionality to deploy contracts, move
funds, or trade, and it is not, and must not be used as, financial advice.
