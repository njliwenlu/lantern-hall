// Loads the REAL artifacts produced by harness/discover.ts and harness/evaluate.ts.
// Nothing here is synthesized: if an artifact is missing the UI says so.
import type { Action, Layout, Observation } from "../engine/types.ts";
import type { TraceComparison } from "../engine/compare.ts";

export interface Hypothesis {
  id: string;
  statement: string;
  status: string;
  evidence?: string;
}
export interface DiscoveryExperiment {
  id: string;
  round: number;
  purpose: string;
  layout: Layout;
  actions: Action[];
  error?: string;
  observations?: Observation[];
}
export interface DiscoveryRound {
  round: number;
  startedAt: string;
  durationMs: number;
  promptSha256: string;
  promptChars: number;
  init?: Record<string, unknown>;
  result?: Record<string, unknown>;
  responseText?: string;
  parseError?: string;
  notes?: string;
  hypotheses?: Hypothesis[];
  experimentIds: string[];
  rejectedExperiments: { id: string; error: string }[];
  codeVersion?: number;
  final?: boolean;
  failure?: string;
  revalidation?: { version: number; experiments: number; exact: number };
}
export interface CodeVersion {
  version: number;
  round: number;
  sha256: string;
  source: string;
  validation: { experiments: number; exact: number; steps: number; matchingSteps: number };
}
export interface DiscoveryRun {
  runId: string;
  status: string;
  model: string;
  cli: { binary: string; flags: string[]; env: string; cwd: string };
  templateSha256: string;
  schemaSha256: string;
  maxRounds: number;
  rounds: DiscoveryRound[];
  experiments: DiscoveryExperiment[];
  codeVersions: CodeVersion[];
  finalCodeVersion: number | null;
}
export interface EvalTrace extends TraceComparison {
  id: string;
  kind: string;
  replicaObservations: unknown[] | null;
}
export interface Evaluation {
  runId: string;
  evaluatedAt: string;
  replica: { version: number; round: number; sha256: string };
  heldout: { sha256: string; committedSha256: string; verified: boolean; count: number; commitCommit?: string };
  summary: { traces: number; exactTraces: number; steps: number; matchingSteps: number; errors: number };
  traces: EvalTrace[];
  versions: { version: number; round: number; exactTraces: number; steps: number; matchingSteps: number }[];
}
export interface HeldoutTrace {
  id: string;
  kind: string;
  layout: Layout;
  actions: Action[];
  observations: Observation[];
}

const discMods = import.meta.glob<{ default: DiscoveryRun }>("../artifacts/discovery/*.json", { eager: true });
const evalMods = import.meta.glob<{ default: Evaluation }>("../artifacts/evaluation/*.json", { eager: true });
const heldMods = import.meta.glob<{ default: { traces: HeldoutTrace[] } }>("../artifacts/heldout.json", { eager: true });
const displayMods = import.meta.glob<{ default: { runId: string; formatted: Record<string, string> } }>("../artifacts/code-display/*.json", { eager: true });
const commitMods = import.meta.glob<{ default: { sha256: string; count: number; createdAt: string } }>("../artifacts/heldout-commitment.json", { eager: true });

export const runs: DiscoveryRun[] = Object.values(discMods)
  .map((m) => m.default)
  .sort((a, b) => a.runId.localeCompare(b.runId));
/** Primary run shown in the exhibit: the latest run that produced code. */
export const primaryRun: DiscoveryRun | null = [...runs].reverse().find((r) => r.codeVersions.length) ?? runs[runs.length - 1] ?? null;
export const evaluations: Evaluation[] = Object.values(evalMods).map((m) => m.default);
export const primaryEval: Evaluation | null = evaluations.find((e) => e.runId === primaryRun?.runId) ?? null;
export const heldout: HeldoutTrace[] = Object.values(heldMods)[0]?.default.traces ?? [];
export const commitment = Object.values(commitMods)[0]?.default ?? null;

export const frozenCode: CodeVersion | null = primaryEval
  ? primaryRun?.codeVersions.find((v) => v.version === primaryEval.replica.version) ?? null
  : null;

/** Prettier-formatted source for reading (display only). Falls back to the verbatim submission. */
export function displaySource(runId: string, v: CodeVersion): { text: string; formatted: boolean } {
  const m = Object.values(displayMods).find((x) => x.default.runId === runId);
  const f = m?.default.formatted[String(v.version)];
  return f ? { text: f, formatted: true } : { text: v.source, formatted: false };
}
/** Earlier version with byte-identical source, if any (e.g. a resubmission). */
export function identicalTo(run: DiscoveryRun, v: CodeVersion): CodeVersion | undefined {
  return run.codeVersions.find((o) => o.version < v.version && o.sha256 === v.sha256);
}
export const distinctVersions = primaryRun ? new Set(primaryRun.codeVersions.map((v) => v.sha256)).size : 0;
