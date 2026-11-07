import { commitment, primaryEval, primaryRun, runs } from "./data.ts";

export function Evidence({ open, onClose }: { open: boolean; onClose: () => void }) {
  const run = primaryRun;
  const init = run?.rounds.find((r) => r.init)?.init as Record<string, unknown> | undefined;
  const cost = run?.rounds.reduce((a, r) => a + (Number(r.result?.total_cost_usd) || 0), 0) ?? 0;
  const toolUses = run?.rounds.reduce((a, r) => a + (Number(r.result?.tool_use_events) || 0), 0) ?? 0;
  return (
    <div className={`lh-drawer ${open ? "is-open" : ""}`} aria-hidden={!open} role="dialog" aria-label="Evidence">
      <div className="lh-drawer-head">
        <h2 className="lh-h2 is-small">Evidence</h2>
        <button className="lh-chip" onClick={onClose}>
          close
        </button>
      </div>
      {!run ? (
        <p>No discovery artifacts in this build.</p>
      ) : (
        <div className="lh-drawer-body">
          <section>
            <div className="lh-label">Temporal boundary</div>
            <p className="lh-small">
              The rules and source of the original engine were withheld from the discovery model during the recorded run. They are public in this site and repository now, after the fact; the replica was frozen before the held-out corpus was revealed.
            </p>
          </section>
          <section>
            <div className="lh-label">Discovery process isolation ({run.runId})</div>
            <ul className="lh-kv">
              <li><span>model</span><b>{run.model}</b></li>
              <li><span>process</span><b>{run.cli.binary}, one fresh process per round</b></li>
              <li><span>flags</span><code>{run.cli.flags.join(" ")}</code></li>
              <li><span>environment</span><b>{run.cli.env}</b></li>
              <li><span>working dir</span><b>{run.cli.cwd}</b></li>
              <li><span>init: tools</span><b>{JSON.stringify(init?.tools ?? "n/a")}</b></li>
              <li><span>init: MCP servers</span><b>{JSON.stringify(init?.mcp_servers ?? "n/a")}</b></li>
              <li><span>init: skills / commands</span><b>{JSON.stringify(init?.skills ?? "n/a")} / {JSON.stringify(init?.slash_commands ?? "n/a")}</b></li>
              <li><span>tool-use events observed</span><b>{toolUses}</b></li>
              <li><span>CLI version</span><b>{String(init?.claude_code_version ?? "n/a")}</b></li>
              <li><span>prompt template sha256</span><code>{run.templateSha256.slice(0, 24)}…</code></li>
              <li><span>schema sha256</span><code>{run.schemaSha256.slice(0, 24)}…</code></li>
              <li><span>rounds / experiments</span><b>{run.rounds.length} / {run.experiments.length}</b></li>
              <li><span>reported model cost</span><b>${cost.toFixed(2)}</b></li>
            </ul>
            <p className="lh-small lh-dim">
              The init event also lists installed plugin and agent-type names; with an empty tool list none can be invoked. Raw stream logs stay private because they contain session ids and local paths; this public trace is sanitized from them.
            </p>
          </section>
          <section>
            <div className="lh-label">Comparators</div>
            <p className="lh-small">
              During the run, validation feedback on the model’s own experiments came from an earlier comparator that tolerated some shape differences (for example a missing false flag). Before the final evaluation it was replaced by a strict recursive comparator (exact fields, types, order, lengths, trace length). The held-out result and the live duel on this page use the strict one.
            </p>
          </section>
          <section>
            <div className="lh-label">Held-out commitment</div>
            <ul className="lh-kv">
              <li><span>committed sha256</span><code>{commitment?.sha256 ?? "n/a"}</code></li>
              <li><span>traces</span><b>{commitment?.count ?? "n/a"}</b></li>
              {primaryEval && <li><span>verified at evaluation</span><b>{primaryEval.heldout.verified ? "yes, hashes match" : "NO, mismatch"}</b></li>}
              {primaryEval?.heldout.commitCommit && <li><span>commitment git commit</span><code>{primaryEval.heldout.commitCommit}</code></li>}
            </ul>
          </section>
          <section>
            <div className="lh-label">Rounds</div>
            <table className="lh-table">
              <thead>
                <tr><th>#</th><th>time</th><th>prompt</th><th>exps</th><th>code</th><th>reply</th></tr>
              </thead>
              <tbody>
                {run.rounds.map((r) => (
                  <tr key={r.round}>
                    <td>{r.round}</td>
                    <td>{(r.durationMs / 1000).toFixed(0)}s</td>
                    <td className="lh-mono">{r.promptSha256.slice(0, 8)} · {(r.promptChars / 1000).toFixed(1)}k</td>
                    <td>{r.experimentIds.length}{r.rejectedExperiments.length ? ` (${r.rejectedExperiments.length} rej.)` : ""}</td>
                    <td>{r.codeVersion ? `v${r.codeVersion}` : "—"}</td>
                    <td>
                      {r.responseText ? (
                        <details>
                          <summary>raw</summary>
                          <pre className="lh-raw">{r.responseText}</pre>
                        </details>
                      ) : (
                        r.failure ?? "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {runs.length > 1 && (
            <section>
              <div className="lh-label">All recorded runs</div>
              <ul className="lh-kv">
                {runs.map((r) => (
                  <li key={r.runId}><span>{r.runId}</span><b>{r.status}, {r.rounds.length} rounds, {r.codeVersions.length} code versions</b></li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <div className="lh-label">Files in the repository</div>
            <ul className="lh-small lh-files">
              <li><code>engine/reference.ts</code> original engine (withheld during discovery)</li>
              <li><code>harness/schema.md</code>, <code>harness/prompt-template.md</code> everything the model was told</li>
              <li><code>artifacts/discovery/{run.runId}.json</code> sanitized trace: prompts’ hashes, replies, experiments, code versions</li>
              <li><code>artifacts/replica/{run.runId}.js</code> frozen generated reconstruction</li>
              <li><code>artifacts/evaluation/{run.runId}.json</code>, <code>artifacts/heldout.json</code> sealed evaluation</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
