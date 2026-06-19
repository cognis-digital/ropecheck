#!/usr/bin/env node
/**
 * ropecheck CLI — defensive token/contract rug-pull & honeypot risk scanner.
 *
 * Subcommands:
 *   scan  <token.json>   score one token (table or --json)
 *   batch <tokens.json>  rank a list worst-first (table or --json)
 *   explain              print the signal reference
 *
 * Flags:
 *   --json               machine-readable output
 *   --fail-on avoid|high exit non-zero when the worst tier meets the gate
 *   --live               reserved for an isolated chain/explorer collector
 *                        (not implemented here; offline metadata only)
 *
 * Informational only — not financial advice.
 */

import { loadToken, loadBatch, LoadError } from "./load.js";
import { scoreToken, scoreBatch } from "./score.js";
import { renderScan, renderBatch } from "./render.js";
import { renderExplain } from "./explain.js";
import type { ScanResult, RiskTier } from "./types.js";

const VERSION = "0.1.0";

interface ParsedArgs {
  command?: string;
  positionals: string[];
  json: boolean;
  failOn?: "avoid" | "high";
  live: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const a: ParsedArgs = {
    positionals: [],
    json: false,
    live: false,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    switch (tok) {
      case "--json":
        a.json = true;
        break;
      case "--live":
        a.live = true;
        break;
      case "-h":
      case "--help":
        a.help = true;
        break;
      case "-v":
      case "--version":
        a.version = true;
        break;
      case "--fail-on": {
        const v = argv[++i];
        if (v !== "avoid" && v !== "high") {
          throw new LoadError(`--fail-on expects "avoid" or "high", got "${v ?? ""}"`);
        }
        a.failOn = v;
        break;
      }
      default:
        if (tok.startsWith("--fail-on=")) {
          const v = tok.slice("--fail-on=".length);
          if (v !== "avoid" && v !== "high") {
            throw new LoadError(`--fail-on expects "avoid" or "high", got "${v}"`);
          }
          a.failOn = v;
        } else if (tok.startsWith("-")) {
          throw new LoadError(`unknown flag: ${tok}`);
        } else if (a.command === undefined) {
          a.command = tok;
        } else {
          a.positionals.push(tok);
        }
    }
  }
  return a;
}

const HELP = `ropecheck v${VERSION} — defensive rug-pull & honeypot risk scanner

USAGE
  ropecheck scan  <token.json>   [--json] [--fail-on avoid|high]
  ropecheck batch <tokens.json>  [--json] [--fail-on avoid|high]
  ropecheck explain
  ropecheck --version | --help

DESCRIPTION
  Scores token/contract metadata on a 0-100 rug-risk scale and assigns a tier
  (SAFE-ish / CAUTION / HIGH-RISK / AVOID) with per-signal reasons. Works
  offline on a provided JSON snapshot. Run "ropecheck explain" for the model.

  --fail-on avoid  exits 2 if any token is AVOID
  --fail-on high   exits 2 if any token is HIGH-RISK or AVOID
  --live           reserved for an isolated on-chain collector (not enabled)

  Informational only — NOT financial advice.`;

const TIER_RANK: Record<RiskTier, number> = {
  "SAFE-ish": 0,
  CAUTION: 1,
  "HIGH-RISK": 2,
  AVOID: 3,
};

/** Decide the process exit code based on --fail-on and the worst tier seen. */
function gateExitCode(results: ScanResult[], failOn?: "avoid" | "high"): number {
  if (!failOn) return 0;
  const worst = results.reduce(
    (m, r) => Math.max(m, TIER_RANK[r.tier]),
    -1
  );
  const threshold = failOn === "avoid" ? TIER_RANK.AVOID : TIER_RANK["HIGH-RISK"];
  return worst >= threshold ? 2 : 0;
}

/** Injectable IO sink so output is testable without monkey-patching globals. */
export interface IO {
  out: (s: string) => void;
  err: (s: string) => void;
}

const defaultIO: IO = {
  out: (s) => process.stdout.write(s),
  err: (s) => process.stderr.write(s),
};

async function cmdScan(args: ParsedArgs, io: IO): Promise<number> {
  const file = args.positionals[0];
  if (!file) throw new LoadError("scan requires a <token.json> path");
  if (args.live) {
    io.err(
      "note: --live collector is not enabled in this build; scoring provided metadata only.\n"
    );
  }
  const meta = await loadToken(file);
  const result = scoreToken(meta);
  if (args.json) {
    io.out(JSON.stringify(result, null, 2) + "\n");
  } else {
    io.out(renderScan(result) + "\n");
  }
  return gateExitCode([result], args.failOn);
}

async function cmdBatch(args: ParsedArgs, io: IO): Promise<number> {
  const file = args.positionals[0];
  if (!file) throw new LoadError("batch requires a <tokens.json> path");
  const metas = await loadBatch(file);
  const results = scoreBatch(metas);
  if (args.json) {
    io.out(JSON.stringify(results, null, 2) + "\n");
  } else {
    io.out(renderBatch(results) + "\n");
  }
  return gateExitCode(results, args.failOn);
}

export async function run(argv: string[], io: IO = defaultIO): Promise<number> {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (e) {
    io.err(`error: ${(e as Error).message}\n`);
    return 1;
  }

  if (args.version) {
    io.out(VERSION + "\n");
    return 0;
  }
  if (args.help || !args.command) {
    io.out(HELP + "\n");
    return args.command ? 0 : args.help ? 0 : 1;
  }

  try {
    switch (args.command) {
      case "scan":
        return await cmdScan(args, io);
      case "batch":
        return await cmdBatch(args, io);
      case "explain":
        io.out(renderExplain() + "\n");
        return 0;
      default:
        io.err(`error: unknown command "${args.command}"\n\n`);
        io.out(HELP + "\n");
        return 1;
    }
  } catch (e) {
    if (e instanceof LoadError) {
      io.err(`error: ${e.message}\n`);
      return 1;
    }
    io.err(`error: ${(e as Error).message}\n`);
    return 1;
  }
}

// Entry point — only when executed directly, not when imported by tests.
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";

function isMain(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
