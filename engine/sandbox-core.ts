// Bounded execution of MODEL-GENERATED reconstruction source inside QuickJS (WASM).
// No host bindings are installed: no filesystem, network, timers, console or module
// loader. Date and Math.random are removed before the candidate source is evaluated.
// Each run gets a fresh runtime with time, memory, stack and output limits.
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import type { Action, Layout } from "./types.ts";

export interface SandboxLimits {
  timeMs: number;
  memoryBytes: number;
  stackBytes: number;
  outputChars: number;
}

export const DEFAULT_LIMITS: SandboxLimits = {
  timeMs: 2000,
  memoryBytes: 32 * 1024 * 1024,
  stackBytes: 512 * 1024,
  outputChars: 400_000,
};

export interface SandboxResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  ms: number;
  /** true if the WASM module should be discarded (OOM / host stack exhaustion) */
  poisoned?: boolean;
}

const PRELUDE = `
"use strict";
delete globalThis.Date;
Math.random = function () { throw new Error("Math.random is disabled"); };
`;

/** Evaluate arbitrary source + expression in a fresh bounded context; returns JSON value. */
export function runBounded(
  QuickJS: QuickJSWASMModule,
  source: string,
  expression: string,
  limits: SandboxLimits = DEFAULT_LIMITS,
): SandboxResult {
  const start = performance.now();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(limits.stackBytes);
  const deadline = Date.now() + limits.timeMs;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const ctx = runtime.newContext();
  let poisoned = false;
  const fail = (error: string): SandboxResult => {
    if (/out of memory|stack|host:/i.test(error)) poisoned = true;
    return { ok: false, error: error.slice(0, 500), ms: performance.now() - start, poisoned };
  };
  try {
    const pre = ctx.evalCode(PRELUDE, "prelude.js");
    if (pre.error) {
      const e = ctx.dump(pre.error);
      pre.error.dispose();
      return fail(`prelude: ${JSON.stringify(e)}`);
    }
    pre.value.dispose();
    const code = `${source}\n;\n(function(){ const __r = (${expression}); return JSON.stringify(__r); })()`;
    const res = ctx.evalCode(code, "candidate.js");
    if (res.error) {
      const e = ctx.dump(res.error);
      res.error.dispose();
      const msg = typeof e === "object" && e ? `${e.name ?? "Error"}: ${e.message ?? JSON.stringify(e)}` : String(e);
      return fail(msg);
    }
    const out = ctx.getString(res.value);
    res.value.dispose();
    if (typeof out !== "string") return { ok: false, error: "non-string output", ms: performance.now() - start };
    if (out.length > limits.outputChars) return { ok: false, error: "output limit exceeded", ms: performance.now() - start };
    return { ok: true, value: out === undefined ? null : JSON.parse(out), ms: performance.now() - start };
  } catch (e) {
    return fail(`host: ${(e as Error).message}`);
  } finally {
    // After OOM QuickJS cannot free its runtime cleanly; leak it and let the caller
    // discard the whole WASM module instead.
    if (!poisoned) try {
      ctx.dispose();
      runtime.dispose();
    } catch {
      /* runtime may be poisoned after OOM; it is discarded either way */
    }
  }
}

/** Contract: candidate source defines `function simulate(layout, actions)` returning
 *  an array of observations (length actions.length + 1). */
export function runCandidate(
  QuickJS: QuickJSWASMModule,
  source: string,
  layout: Layout,
  actions: Action[],
  limits: SandboxLimits = DEFAULT_LIMITS,
): SandboxResult {
  const input = JSON.stringify({ layout, actions });
  const expr = `(function(){ if (typeof simulate !== "function") throw new Error("simulate is not defined"); const __i = JSON.parse(${JSON.stringify(input)}); return simulate(__i.layout, __i.actions); })()`;
  const r = runBounded(QuickJS, source, expr, limits);
  if (r.ok && !Array.isArray(r.value)) return { ok: false, error: "simulate must return an array of observations", ms: r.ms };
  return r;
}
