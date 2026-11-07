// Sealed held-out evaluation of a FROZEN replica.
//   node harness/evaluate.ts --run-id run-01
// 1. verifies private/heldout.json against the pre-discovery commitment hash
// 2. runs the frozen replica (artifacts/replica/<run>.js) on every held-out trace in QuickJS
// 3. full-state comparison per step; writes artifacts/evaluation/<run>.json
// 4. reveals the corpus as artifacts/heldout.json (byte-identical copy)
// It also scores earlier code versions post hoc (clearly labelled; never shown to the model).
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { compareTraces } from "../engine/compare.ts";
import type { Action, Layout, Observation } from "../engine/types.ts";
import { runCandidateNode } from "./sandbox-node.ts";

const i = process.argv.indexOf("--run-id");
const RUN_ID = i >= 0 ? process.argv[i + 1] : "run-01";

const corpusPath = existsSync("private/heldout.json") ? "private/heldout.json" : "artifacts/heldout.json";
const raw = readFileSync(corpusPath, "utf8");
const sha = createHash("sha256").update(raw).digest("hex");
const commitment = JSON.parse(readFileSync("artifacts/heldout-commitment.json", "utf8"));
let commitCommit: string | undefined;
try {
  commitCommit = execSync("git log --diff-filter=A --format=%h -- artifacts/heldout-commitment.json", { encoding: "utf8" }).trim().split("\n").pop();
} catch {
  /* git unavailable */
}
const verified = sha === commitment.sha256;
if (!verified) throw new Error(`heldout hash ${sha} != committed ${commitment.sha256}`);

const corpus = JSON.parse(raw) as { traces: { id: string; kind: string; layout: Layout; actions: Action[]; observations: Observation[] }[] };
const frozen = JSON.parse(readFileSync(`artifacts/replica/${RUN_ID}.frozen.json`, "utf8"));
const source = readFileSync(`artifacts/replica/${RUN_ID}.js`, "utf8");
const srcSha = createHash("sha256").update(source).digest("hex");
if (srcSha !== frozen.sha256) throw new Error("frozen replica source hash mismatch");
const disc = JSON.parse(readFileSync(`artifacts/discovery/${RUN_ID}.json`, "utf8"));

async function score(src: string, keepObs: boolean) {
  const traces = [];
  for (const t of corpus.traces) {
    const r = await runCandidateNode(src, t.layout, t.actions);
    const cmp = compareTraces(t.observations, r.ok ? (r.value as unknown[]) : null, r.ok ? undefined : r.error);
    traces.push({ id: t.id, kind: t.kind, ...cmp, replicaObservations: keepObs && r.ok ? (r.value as unknown[]) : null });
  }
  return traces;
}

const traces = await score(source, true);
const summary = {
  traces: traces.length,
  exactTraces: traces.filter((t) => t.exact).length,
  steps: traces.reduce((a, t) => a + t.steps, 0),
  matchingSteps: traces.reduce((a, t) => a + t.matchingSteps, 0),
  errors: traces.filter((t) => t.error).length,
};
const versions = [];
for (const v of disc.codeVersions as { version: number; round: number; source: string }[]) {
  const s = v.version === frozen.version ? traces : await score(v.source, false);
  versions.push({
    version: v.version,
    round: v.round,
    exactTraces: s.filter((t) => t.exact).length,
    steps: s.reduce((a, t) => a + t.steps, 0),
    matchingSteps: s.reduce((a, t) => a + t.matchingSteps, 0),
  });
}

mkdirSync("artifacts/evaluation", { recursive: true });
writeFileSync(
  `artifacts/evaluation/${RUN_ID}.json`,
  JSON.stringify(
    {
      runId: RUN_ID,
      evaluatedAt: new Date().toISOString(),
      comparator: "engine/compare.ts (structural, field-by-field full observation equality)",
      replica: { version: frozen.version, round: frozen.round, sha256: frozen.sha256 },
      heldout: { sha256: sha, committedSha256: commitment.sha256, verified, count: corpus.traces.length, commitCommit },
      summary,
      traces,
      versions,
      versionsNote: "Scores for non-frozen versions are post-hoc analysis for the exhibit; the model never saw held-out data or scores.",
    },
    null,
    1,
  ),
);
if (corpusPath !== "artifacts/heldout.json") copyFileSync(corpusPath, "artifacts/heldout.json");
console.log(`[${RUN_ID}] frozen v${frozen.version}: ${summary.exactTraces}/${summary.traces} traces exact, ${summary.matchingSteps}/${summary.steps} observations, ${summary.errors} errors; heldout verified=${verified}`);
for (const v of versions) console.log(`  v${v.version} (round ${v.round}): ${v.exactTraces}/${summary.traces} exact, ${v.matchingSteps}/${v.steps} obs`);
for (const t of traces.filter((x) => !x.exact)) console.log(`  MISMATCH ${t.id} (${t.kind}) first@${t.firstDivergence}: ${t.error ?? t.diffs[0]?.fields.slice(0, 3).map((f) => f.field).join(", ")}`);
