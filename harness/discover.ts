// Blind discovery orchestrator.
// Each round spawns a FRESH, tool-free Claude CLI process in an empty temporary directory,
// with safe mode, strict (empty) MCP config, no session persistence, slash commands disabled,
// a replaced system prompt, and a scrubbed environment. The process receives only the
// disclosed schema (harness/schema.md), the committed prompt template, the oracle's actual
// observations for experiments the model itself requested, and validation of its own code.
// It never receives engine source, the held-out corpus, or tool access.
//
//   node harness/discover.ts [--rounds 10] [--model claude-opus-5-5] [--run-id ID]
//   node harness/discover.ts --provider meta [--model muse-spark-1.3] [--rounds 10]
//        [--max-output-tokens 16384] [--effort high|medium|low|off] [--timeout-ms 1200000]
//        [--max-retries 2] [--run-id muse-...]     (key: MODEL_API_KEY env var only)
//
// --provider meta replaces ONLY the model call with a stateless HTTPS Messages request
// (harness/meta-provider.ts); the prompt, experiments, QuickJS validation and freezing are shared.
// The default provider remains the Claude CLI path below, unchanged.
//
// Private raw logs: private/discovery/<runId>/ (git-ignored; contain session ids/paths)
// Public sanitized trace: artifacts/discovery/<runId>.json
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simulate, validateLayout } from "../engine/reference.ts";
import { compareTraces, type TraceComparison } from "../engine/compare.ts";
import type { Action, Layout, Observation } from "../engine/types.ts";
import { runCandidateNode } from "./sandbox-node.ts";
import { callMeta, metaRequestShape, META_KEY_ENV, type MetaConfig } from "./meta-provider.ts";

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const PROVIDER = arg("provider", "claude");
if (PROVIDER !== "claude" && PROVIDER !== "meta") throw new Error(`--provider must be claude or meta, got ${PROVIDER}`);
const IS_META = PROVIDER === "meta";
const boundedInt = (name: string, def: number, min: number, max: number) => {
  const v = Number(arg(name, String(def)));
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`--${name} must be an integer in [${min}, ${max}]`);
  return v;
};
const MAX_ROUNDS = IS_META ? boundedInt("rounds", 10, 1, 20) : Number(arg("rounds", "10"));
const MODEL = arg("model", IS_META ? "muse-spark-1.3" : "claude-opus-5-5");
const MAX_EXPERIMENTS = 6;
const MAX_ACTIONS = 12;
const STAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const RUN_ID = arg("run-id", IS_META ? `muse-${STAMP}` : `run-${STAMP}`);
const CLAUDE_BIN = arg("claude-bin", join(process.env.HOME ?? "", ".local/bin/claude"));
const TIMEOUT_MS = 20 * 60 * 1000;

const template = readFileSync("harness/prompt-template.md", "utf8");
const schema = readFileSync("harness/schema.md", "utf8");
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const [, systemPart, userPart] = template.split(/=== (?:SYSTEM|USER) ===\n/);
const SYSTEM_PROMPT = systemPart.trim();

const privDir = join("private", "discovery", RUN_ID);

let META: MetaConfig | null = null;
let META_KEY = "";
if (IS_META) {
  // Preflight before anything is written: muse-* id, never clobber, key present (value never logged).
  if (!/^muse-[A-Za-z0-9._-]{1,80}$/.test(RUN_ID)) throw new Error(`--provider meta requires a run id matching muse-*, got ${RUN_ID}`);
  const taken = [privDir, `artifacts/discovery/${RUN_ID}.json`, `artifacts/replica/${RUN_ID}.js`, `artifacts/replica/${RUN_ID}.frozen.json`].filter((p) => existsSync(p));
  if (taken.length) throw new Error(`refusing to clobber existing run ${RUN_ID}: ${taken.join(", ")}`);
  const effort = arg("effort", "high");
  if (!["high", "medium", "low", "off"].includes(effort)) throw new Error("--effort must be high, medium, low or off");
  META = {
    model: MODEL,
    maxTokens: boundedInt("max-output-tokens", 16384, 1024, 65536),
    effort: effort === "off" ? null : (effort as MetaConfig["effort"]),
    timeoutMs: boundedInt("timeout-ms", 20 * 60 * 1000, 10_000, 30 * 60 * 1000),
    maxRetries: boundedInt("max-retries", 2, 0, 3),
  };
  META_KEY = process.env[META_KEY_ENV] ?? "";
  if (!META_KEY) throw new Error(`${META_KEY_ENV} is not set; the meta provider reads its key from the environment only`);
}
mkdirSync(privDir, { recursive: true });
mkdirSync("artifacts/discovery", { recursive: true });

interface Experiment {
  id: string;
  round: number;
  purpose: string;
  layout: unknown;
  actions: unknown;
  error?: string;
  observations?: Observation[];
}
interface Hypothesis {
  id: string;
  statement: string;
  status: string;
  evidence?: string;
}
interface CodeVersion {
  version: number;
  round: number;
  sha256: string;
  source: string;
  validation: { experiments: number; exact: number; steps: number; matchingSteps: number };
}
interface RoundRecord {
  round: number;
  startedAt: string;
  durationMs: number;
  promptSha256: string;
  promptChars: number;
  exitCode: number | null;
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
}

const experiments: Experiment[] = [];
let hypotheses: Hypothesis[] = [];
const codeVersions: CodeVersion[] = [];
const rounds: RoundRecord[] = [];
let lastValidation: { id: string; cmp: TraceComparison }[] = [];

function cleanEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "LC_ALL", "TERM", "TMPDIR"];
  const env: NodeJS.ProcessEnv = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  return env; // drops CLAUDECODE, CLAUDE_CODE_*, CODEX_* and everything else
}

const FLAGS = [
  "-p",
  "--model", MODEL,
  "--output-format", "stream-json",
  "--verbose",
  "--safe-mode",
  "--strict-mcp-config",
  "--tools", "",
  "--no-session-persistence",
  "--disable-slash-commands",
  "--system-prompt", "<SYSTEM_PROMPT from harness/prompt-template.md>",
];

function callModel(prompt: string, round: number): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const cwd = mkdtempSync(join(tmpdir(), "lantern-blind-"));
  const args = FLAGS.map((f) => (f.startsWith("<SYSTEM_PROMPT") ? SYSTEM_PROMPT : f));
  return new Promise((resolve) => {
    const child = spawn(CLAUDE_BIN, args, { cwd, env: cleanEnv(), stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => {
      clearTimeout(timer);
      const leftovers = readdirSync(cwd);
      writeFileSync(join(privDir, `round-${round}.cwd-after.txt`), `${cwd}\n${JSON.stringify(leftovers)}\n`);
      rmSync(cwd, { recursive: true, force: true });
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(prompt);
  });
}

const compact = (o: unknown) => JSON.stringify(o);

function renderHistory(): string {
  if (!experiments.length) return "(none yet)";
  return experiments
    .map((e) => {
      const head = `#${e.id} (round ${e.round}) purpose: ${e.purpose}\nlayout: ${compact(e.layout)}\nactions: ${compact(e.actions)}`;
      if (e.error) return `${head}\nREJECTED: ${e.error}`;
      return `${head}\n${e.observations!.map((o, i) => `obs[${i}]: ${compact(o)}`).join("\n")}`;
    })
    .join("\n\n");
}

function renderValidation(): string {
  if (!codeVersions.length) return "(no reconstruction submitted yet)";
  const cur = codeVersions[codeVersions.length - 1];
  const lines = [`code v${cur.version}: ${cur.validation.exact}/${cur.validation.experiments} experiments exact, ${cur.validation.matchingSteps}/${cur.validation.steps} observations exact`];
  for (const v of lastValidation) {
    if (v.cmp.exact) continue;
    if (v.cmp.error) {
      lines.push(`#${v.id}: ERROR ${v.cmp.error}`);
      continue;
    }
    const d = v.cmp.diffs[0];
    lines.push(`#${v.id}: first divergence at obs[${d.step}]: ${d.fields.slice(0, 6).map((f) => `${f.field} expected ${compact(f.expected)} got ${compact(f.actual)}`).join("; ")}`);
  }
  return lines.join("\n");
}

function buildPrompt(round: number): string {
  const last = round === MAX_ROUNDS;
  const note = last
    ? "THIS IS THE LAST ROUND: you must include your complete final \"code\". Experiments requested now will not be run."
    : round === 1
      ? "No experiments have been run yet."
      : "";
  return userPart
    .replace("{{SCHEMA}}", schema.trim())
    .replace("{{ROUND}}", String(round))
    .replace("{{MAX_ROUNDS}}", String(MAX_ROUNDS))
    .replace("{{ROUND_NOTE}}", note)
    .replace("{{MAX_EXPERIMENTS}}", String(MAX_EXPERIMENTS))
    .replace("{{HISTORY}}", renderHistory())
    .replace("{{HYPOTHESES}}", hypotheses.length ? hypotheses.map((h) => `${h.id} [${h.status}] ${h.statement}`).join("\n") : "(none)")
    .replace("{{CODE}}", codeVersions.length ? codeVersions[codeVersions.length - 1].source : "(none)")
    .replace("{{VALIDATION}}", renderValidation());
}

function parseResponse(text: string): Record<string, unknown> {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) return JSON.parse(fence[1]);
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error("no JSON object found");
  }
}

function sanitizeInit(ev: Record<string, unknown>) {
  return {
    type: ev.type,
    subtype: ev.subtype,
    model: ev.model,
    tools: ev.tools,
    mcp_servers: ev.mcp_servers,
    slash_commands: ev.slash_commands,
    agents: ev.agents,
    skills: ev.skills,
    plugins: Array.isArray(ev.plugins) ? (ev.plugins as { name: string }[]).map((p) => p.name) : ev.plugins,
    permissionMode: ev.permissionMode,
    claude_code_version: ev.claude_code_version,
    output_style: ev.output_style,
    cwd: "<fresh empty temp dir, deleted after the call>",
  };
}

async function validateCode(source: string) {
  const out: { id: string; cmp: TraceComparison }[] = [];
  for (const e of experiments) {
    if (e.error || !e.observations) continue;
    const r = await runCandidateNode(source, e.layout as Layout, e.actions as Action[]);
    out.push({ id: e.id, cmp: compareTraces(e.observations, r.ok ? (r.value as unknown[]) : null, r.ok ? undefined : r.error) });
  }
  return out;
}

function savePublic(status: string) {
  const pub = {
    runId: RUN_ID,
    status,
    model: MODEL,
    ...(IS_META ? { provider: "meta", transport: metaRequestShape(META!) } : {}),
    ...(IS_META ? {} : { cli: { binary: "claude (Claude Code CLI)", flags: FLAGS, env: "scrubbed: only PATH HOME USER LOGNAME SHELL LANG LC_ALL TERM TMPDIR passed", cwd: "fresh empty mkdtemp directory per round, deleted afterwards" } }),
    templateSha256: sha(template),
    schemaSha256: sha(schema),
    maxRounds: MAX_ROUNDS,
    maxExperimentsPerRound: MAX_EXPERIMENTS,
    rounds,
    experiments,
    codeVersions,
    finalCodeVersion: codeVersions.length ? codeVersions[codeVersions.length - 1].version : null,
  };
  writeFileSync(`artifacts/discovery/${RUN_ID}.json`, JSON.stringify(pub, null, 1));
}

/** Default provider: Claude CLI process; parses its stream-json events into the round record. */
async function claudeRound(prompt: string, round: number, rec: RoundRecord, t0: number): Promise<boolean> {
  let res = await callModel(prompt, round);
  let attempt = 1;
  while ((res.code !== 0 || !res.stdout.includes('"type":"result"')) && attempt < 2) {
    writeFileSync(join(privDir, `round-${round}.attempt-${attempt}.failed.jsonl`), res.stdout + "\n--- stderr ---\n" + res.stderr);
    attempt++;
    console.log(`  attempt failed (exit ${res.code}); retrying once`);
    res = await callModel(prompt, round);
  }
  rec.durationMs = Date.now() - t0;
  rec.exitCode = res.code;
  writeFileSync(join(privDir, `round-${round}.stream.jsonl`), res.stdout);
  if (res.stderr) writeFileSync(join(privDir, `round-${round}.stderr.txt`), res.stderr);
  const events = res.stdout
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Record<string, unknown>[];
  const init = events.find((e) => e.type === "system" && e.subtype === "init");
  if (init) rec.init = sanitizeInit(init);
  const toolUses = events.filter((e) => e.type === "assistant" && JSON.stringify(e).includes('"type":"tool_use"')).length;
  const result = events.find((e) => e.type === "result");
  if (result) {
    rec.result = {
      subtype: result.subtype,
      is_error: result.is_error,
      num_turns: result.num_turns,
      duration_ms: result.duration_ms,
      total_cost_usd: result.total_cost_usd,
      usage: result.usage ? { input_tokens: (result.usage as Record<string, unknown>).input_tokens, output_tokens: (result.usage as Record<string, unknown>).output_tokens } : undefined,
      tool_use_events: toolUses,
    };
    rec.responseText = String(result.result ?? "");
  }
  if (!result || result.is_error) {
    rec.failure = `model call failed (exit ${res.code}): ${res.stderr.slice(0, 300)}`;
    return false;
  }
  return true;
}

/** --provider meta: one stateless HTTPS Messages call (bounded retries inside callMeta). */
async function metaRound(prompt: string, round: number, rec: RoundRecord, t0: number): Promise<boolean> {
  const reply = await callMeta(SYSTEM_PROMPT, prompt, META!, META_KEY);
  rec.durationMs = Date.now() - t0;
  writeFileSync(join(privDir, `round-${round}.responses.json`), JSON.stringify(reply.rawAttempts, null, 1));
  rec.result = reply.result;
  if (!reply.ok) {
    rec.failure = reply.failure;
    return false;
  }
  rec.responseText = reply.text;
  return true;
}

let failed = false;
try {
for (let round = 1; round <= MAX_ROUNDS; round++) {
  const prompt = buildPrompt(round);
  writeFileSync(join(privDir, `round-${round}.prompt.txt`), prompt);
  const rec: RoundRecord = {
    round,
    startedAt: new Date().toISOString(),
    durationMs: 0,
    promptSha256: sha(prompt),
    promptChars: prompt.length,
    exitCode: null,
    experimentIds: [],
    rejectedExperiments: [],
  };
  console.log(`[${RUN_ID}] round ${round}: prompt ${prompt.length} chars -> ${MODEL}`);
  const t0 = Date.now();
  const ok = IS_META ? await metaRound(prompt, round, rec, t0) : await claudeRound(prompt, round, rec, t0);
  if (!ok) {
    rounds.push(rec);
    failed = true;
    savePublic("failed");
    console.log("  " + rec.failure);
    break;
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = parseResponse(rec.responseText!);
  } catch (e) {
    rec.parseError = (e as Error).message;
    rounds.push(rec);
    savePublic("running");
    console.log(`  parse error: ${rec.parseError}`);
    continue;
  }
  rec.notes = typeof parsed.notes === "string" ? parsed.notes : undefined;
  if (Array.isArray(parsed.hypotheses)) {
    hypotheses = (parsed.hypotheses as Hypothesis[]).filter((h) => h && typeof h.statement === "string").slice(0, 30);
    rec.hypotheses = hypotheses;
  }
  // run requested experiments on the ORIGINAL engine (not in the last round)
  const reqs = Array.isArray(parsed.experiments) ? (parsed.experiments as Record<string, unknown>[]) : [];
  if (round < MAX_ROUNDS) {
    for (const [i, r] of reqs.slice(0, MAX_EXPERIMENTS).entries()) {
      let id = String(r?.id ?? `r${round}e${i + 1}`).slice(0, 40);
      if (experiments.some((e) => e.id === id)) id = `${id}-r${round}`;
      const exp: Experiment = { id, round, purpose: String(r?.purpose ?? "").slice(0, 300), layout: r?.layout, actions: r?.actions };
      const acts = r?.actions;
      const verr = validateLayout(r?.layout);
      if (verr) exp.error = `invalid layout: ${verr}`;
      else if (!Array.isArray(acts) || acts.length > MAX_ACTIONS || acts.some((a) => !["N", "S", "E", "W"].includes(a as string)))
        exp.error = `actions must be an array of at most ${MAX_ACTIONS} of N/S/E/W`;
      else exp.observations = simulate(r.layout as Layout, acts as Action[]).observations;
      if (exp.error) rec.rejectedExperiments.push({ id, error: exp.error });
      experiments.push(exp);
      rec.experimentIds.push(id);
    }
  }
  if (typeof parsed.code === "string" && parsed.code.trim()) {
    const source = parsed.code;
    lastValidation = await validateCode(source);
    const v = {
      experiments: lastValidation.length,
      exact: lastValidation.filter((x) => x.cmp.exact).length,
      steps: lastValidation.reduce((a, x) => a + x.cmp.steps, 0),
      matchingSteps: lastValidation.reduce((a, x) => a + x.cmp.matchingSteps, 0),
    };
    codeVersions.push({ version: codeVersions.length + 1, round, sha256: sha(source), source, validation: v });
    rec.codeVersion = codeVersions.length;
  } else if (codeVersions.length) {
    lastValidation = await validateCode(codeVersions[codeVersions.length - 1].source); // include new experiments
    const cur = codeVersions[codeVersions.length - 1];
    rec.codeVersion = undefined;
    // record refreshed validation as a note in the round, version itself unchanged
    (rec as unknown as Record<string, unknown>).revalidation = {
      version: cur.version,
      experiments: lastValidation.length,
      exact: lastValidation.filter((x) => x.cmp.exact).length,
    };
  }
  rec.final = parsed.final === true;
  rounds.push(rec);
  savePublic("running");
  const cv = codeVersions[codeVersions.length - 1];
  console.log(`  ${rec.durationMs}ms; experiments +${rec.experimentIds.length} (${rec.rejectedExperiments.length} rejected); code ${cv ? `v${cv.version} ${cv.validation.exact}/${cv.validation.experiments}` : "none"}; final=${rec.final}`);
  if (rec.final && codeVersions.length) break;
}
} catch (e) {
  failed = true;
  const msg = (e as Error)?.stack ?? String(e);
  writeFileSync(join(privDir, "uncaught-error.txt"), IS_META ? msg.split(META_KEY).join("<redacted>") : msg);
  const publicMessage = String((e as Error)?.message ?? e);
  console.log(`  uncaught error: ${IS_META ? publicMessage.split(META_KEY).join("<redacted>") : publicMessage}`);
}

const status = failed ? "failed" : codeVersions.length ? "completed" : "no-code";
savePublic(status);
if (!failed && codeVersions.length) {
  const final = codeVersions[codeVersions.length - 1];
  mkdirSync("artifacts/replica", { recursive: true });
  writeFileSync(`artifacts/replica/${RUN_ID}.js`, final.source);
  writeFileSync(
    `artifacts/replica/${RUN_ID}.frozen.json`,
    JSON.stringify({ runId: RUN_ID, version: final.version, round: final.round, sha256: final.sha256, frozenAt: new Date().toISOString() }, null, 2),
  );
}
console.log(`[${RUN_ID}] ${status}. Public trace: artifacts/discovery/${RUN_ID}.json`);

if (failed || !codeVersions.length) process.exitCode = 1;
