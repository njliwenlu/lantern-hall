import { newQuickJSWASMModule } from "quickjs-emscripten";
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import { runCandidate, type SandboxResult } from "../engine/sandbox-core.ts";
import type { Action, Layout } from "../engine/types.ts";

let mod: QuickJSWASMModule | null = null;
export async function quickjs(fresh = false): Promise<QuickJSWASMModule> {
  if (!mod || fresh) mod = (await newQuickJSWASMModule()) as unknown as QuickJSWASMModule;
  return mod;
}

/** Run candidate; if the run poisoned the WASM instance, replace it for the next call. */
export async function runCandidateNode(source: string, layout: Layout, actions: Action[]): Promise<SandboxResult> {
  const Q = await quickjs();
  const r = runCandidate(Q, source, layout, actions);
  if (r.poisoned) await quickjs(true);
  return r;
}
