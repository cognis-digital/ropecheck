/**
 * Input loading + validation. Reads token metadata JSON from disk and
 * normalizes it into TokenMetadata. Lenient on missing fields, strict on
 * obviously wrong types (so typos surface instead of silently scoring 0).
 */

import { readFile } from "node:fs/promises";
import type { TokenMetadata, HoneypotResult } from "./types.js";

export class LoadError extends Error {}

const BOOL_FIELDS = [
  "ownershipRenounced",
  "contractVerified",
  "mintFunctionPresent",
  "canPause",
  "canBlacklist",
  "hasModifiableTax",
  "liquidityLocked",
] as const;

const NUM_FIELDS = [
  "lockDurationDays",
  "buyTaxPct",
  "sellTaxPct",
  "topHolderConcentrationPct",
] as const;

const STR_FIELDS = ["name", "symbol", "chain", "address"] as const;

const HONEYPOT_VALUES: HoneypotResult[] = ["pass", "fail", "unknown"];

/** Validate + normalize an unknown object into TokenMetadata. */
export function coerceToken(input: unknown, ctx = "token"): TokenMetadata {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new LoadError(`${ctx}: expected a JSON object`);
  }
  const obj = input as Record<string, unknown>;
  const out: TokenMetadata = {};

  for (const f of STR_FIELDS) {
    if (obj[f] === undefined || obj[f] === null) continue;
    if (typeof obj[f] !== "string") {
      throw new LoadError(`${ctx}.${f}: expected a string`);
    }
    out[f] = obj[f] as string;
  }

  for (const f of BOOL_FIELDS) {
    if (obj[f] === undefined || obj[f] === null) continue;
    if (typeof obj[f] !== "boolean") {
      throw new LoadError(`${ctx}.${f}: expected true/false`);
    }
    out[f] = obj[f] as boolean;
  }

  for (const f of NUM_FIELDS) {
    if (obj[f] === undefined || obj[f] === null) continue;
    if (typeof obj[f] !== "number" || Number.isNaN(obj[f])) {
      throw new LoadError(`${ctx}.${f}: expected a number`);
    }
    out[f] = obj[f] as number;
  }

  if (obj.honeypotSim !== undefined && obj.honeypotSim !== null) {
    const v = obj.honeypotSim;
    if (typeof v !== "string" || !HONEYPOT_VALUES.includes(v as HoneypotResult)) {
      throw new LoadError(
        `${ctx}.honeypotSim: expected one of ${HONEYPOT_VALUES.join(", ")}`
      );
    }
    out.honeypotSim = v as HoneypotResult;
  }

  return out;
}

async function readJson(path: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new LoadError(`cannot read file: ${path}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new LoadError(`invalid JSON in ${path}: ${(e as Error).message}`);
  }
}

/** Load a single token file. */
export async function loadToken(path: string): Promise<TokenMetadata> {
  return coerceToken(await readJson(path), path);
}

/**
 * Load a batch file. Accepts either a top-level array of tokens, or an object
 * with a `tokens` array.
 */
export async function loadBatch(path: string): Promise<TokenMetadata[]> {
  const data = await readJson(path);
  let arr: unknown;
  if (Array.isArray(data)) {
    arr = data;
  } else if (
    typeof data === "object" &&
    data !== null &&
    Array.isArray((data as Record<string, unknown>).tokens)
  ) {
    arr = (data as Record<string, unknown>).tokens;
  } else {
    throw new LoadError(
      `${path}: expected a JSON array of tokens or an object with a "tokens" array`
    );
  }
  return (arr as unknown[]).map((t, i) => coerceToken(t, `${path}[${i}]`));
}
