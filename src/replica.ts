// Runs the FROZEN generated reconstruction in the browser, inside QuickJS (WASM),
// with the same bounded sandbox used by the discovery host.
import { newQuickJSWASMModuleFromVariant } from "quickjs-emscripten-core";
import type { QuickJSWASMModule } from "quickjs-emscripten-core";
import { runCandidate, type SandboxResult } from "../engine/sandbox-core.ts";
import type { Action, Layout } from "../engine/types.ts";

let modP: Promise<QuickJSWASMModule> | null = null;
function load(fresh = false) {
  if (!modP || fresh)
    modP = import("@jitl/quickjs-singlefile-browser-release-sync").then((v) =>
      newQuickJSWASMModuleFromVariant(v.default ?? v),
    );
  return modP;
}

export async function runReplica(source: string, layout: Layout, actions: Action[]): Promise<SandboxResult> {
  const Q = await load();
  const r = runCandidate(Q, source, layout, actions);
  if (r.poisoned) load(true);
  return r;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
