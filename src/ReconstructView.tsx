import { useEffect, useMemo, useState } from "react";
import { Board, diffCellsOf } from "./Board.tsx";
import { commitment, displaySource, heldout, identicalTo, primaryEval, primaryRun } from "./data.ts";
import { Stepper } from "./Stepper.tsx";
import { hooks, initialParams } from "./hooks.ts";
import type { Observation } from "../engine/types.ts";

function lineDiff(a: string[], b: string[]) {
  const n = a.length;
  const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: { t: " " | "+" | "-"; s: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ t: " ", s: a[i] });
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: "-", s: a[i++] });
    else out.push({ t: "+", s: b[j++] });
  }
  while (i < n) out.push({ t: "-", s: a[i++] });
  while (j < m) out.push({ t: "+", s: b[j++] });
  return out;
}

const ARROW: Record<string, string> = { N: "↑", S: "↓", E: "→", W: "←" };

export function ReconstructView({ present }: { present: boolean }) {
  const run = primaryRun;
  const ev = primaryEval;
  const versions = run?.codeVersions ?? [];
  const [ver, setVer] = useState<number>(Number(initialParams.version) || ev?.replica.version || versions[versions.length - 1]?.version || 1);
  const [showDiff, setShowDiff] = useState(true);
  const cur = versions.find((v) => v.version === ver);
  const prev = versions.find((v) => v.version === ver - 1);
  const curText = cur && run ? displaySource(run.runId, cur) : null;
  const prevText = prev && run ? displaySource(run.runId, prev) : null;
  const same = cur && run ? identicalTo(run, cur) : undefined;
  const diff = useMemo(() => (curText && prevText ? lineDiff(prevText.text.split("\n"), curText.text.split("\n")) : null), [curText, prevText]);
  const changed = diff ? diff.filter((d) => d.t !== " ").length : 0;
  const [traceId, setTraceId] = useState<string | null>(initialParams.trace);
  const tr = ev?.traces.find((t) => t.id === traceId) ?? null;
  const ht = heldout.find((h) => h.id === tr?.id);
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(tr?.firstDivergence ?? 0);
  }, [tr]);
  useEffect(() => {
    hooks.reconstruct = { setVersion: setVer, setTrace: setTraceId, setStep };
  });
  const verScore = (v: number) => ev?.versions.find((x) => x.version === v);

  if (!run || !versions.length)
    return (
      <section className="lh-view">
        <div className="lh-empty">
          <h2>No generated reconstruction in this build</h2>
          <p>The discovery run has not produced code yet. This page only shows real artifacts.</p>
        </div>
      </section>
    );

  return (
    <section className={`lh-view lh-recon ${present ? "is-present" : ""}`}>
      <aside className="lh-rail">
        <div className="lh-kicker">II · Reconstruct</div>
        <h2 className="lh-h2 is-small">Code the model wrote</h2>
        <ol className="lh-rounds">
          {versions.map((v) => {
            const s = verScore(v.version);
            return (
              <li key={v.version}>
                <button className={`lh-round ${v.version === ver ? "is-on" : ""}`} onClick={() => setVer(v.version)}>
                  <span className="lh-round-n">
                    v{v.version} <span className="lh-dim">· round {v.round}</span>
                    {ev?.replica.version === v.version && <span className="lh-badge is-replica is-tiny">frozen</span>}
                    {identicalTo(run, v) && <span className="lh-dim"> · = v{identicalTo(run, v)!.version}</span>}
                  </span>
                  <span className="lh-round-meta">
                    own experiments {v.validation.exact}/{v.validation.experiments}
                    {s ? ` · held-out ${s.exactTraces}/${ev!.summary.traces}` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="lh-small lh-dim">
          “Own experiments” is the feedback the model saw during the run; {run.runId === "run-01" ? "it was computed by an earlier, more lenient comparator." : "it used the same strict comparator as the final evaluation."} All held-out scores use the final strict field-by-field comparator. Held-out scores for non-frozen versions were computed after the run for this exhibit; the model never saw held-out data or scores.
        </p>
      </aside>

      <div className="lh-stage">
        {cur && (
          <div className="lh-code-card">
            <div className="lh-code-head">
              <span>
                <b>simulate()</b> v{cur.version} · {cur.source.length.toLocaleString()} chars submitted · <span className="lh-mono">sha256 {cur.sha256.slice(0, 12)}…</span>
                {same && <span className="lh-dim"> · byte-identical to v{same.version}</span>}
              </span>
              {prev && (
                <button className="lh-chip" onClick={() => setShowDiff((d) => !d)}>
                  {showDiff ? `changes since v${prev.version} (${changed} lines) · show full` : `show changes since v${prev.version}`}
                </button>
              )}
            </div>
            <pre className="lh-code" tabIndex={0}>
              {showDiff && diff
                ? diff.map((d, i) => (
                    <div key={i} className={`ln ln-${d.t === "+" ? "add" : d.t === "-" ? "del" : "ctx"}`}>
                      <span className="ln-m">{d.t}</span>
                      {d.s || " "}
                    </div>
                  ))
                : (curText?.text ?? cur.source).split("\n").map((s, i) => (
                    <div key={i} className="ln ln-ctx">
                      <span className="ln-m">{i + 1}</span>
                      {s || " "}
                    </div>
                  ))}
            </pre>
            <div className="lh-codenote">
              {curText?.formatted
                ? `${cur.source.trim().split("\n").length === 1 ? "The model submitted this as a single line of minified JavaScript. " : ""}Shown reformatted with Prettier; the hash and executed code are the verbatim submission.`
                : "Verbatim submission."}
            </div>
          </div>
        )}
      </div>

      <aside className="lh-notes lh-eval">
        <div className="lh-label">Sealed held-out evaluation</div>
        {ev ? (
          <>
            <div className="lh-score">
              <span className="lh-score-n">{ev.summary.exactTraces}</span>
              <span className="lh-score-d">/ {ev.summary.traces}</span>
            </div>
            <p className="lh-small">
              unseen traces reproduced exactly by frozen v{ev.replica.version}; {ev.summary.matchingSteps}/{ev.summary.steps} individual observations identical
              {ev.summary.errors ? `; ${ev.summary.errors} runtime errors` : ""}.
            </p>
            <p className={`lh-small ${ev.heldout.verified ? "lh-ok" : "lh-warn"}`}>
              {ev.heldout.verified ? "✓ corpus hash matches the commitment made before discovery" : "✗ corpus hash does NOT match the commitment"}
              <br />
              <span className="lh-mono lh-dim">{ev.heldout.committedSha256.slice(0, 24)}…</span>
            </p>
            <div className="lh-grid" role="list">
              {ev.traces.map((t) => (
                <button
                  key={t.id}
                  role="listitem"
                  className={`lh-cellbtn ${t.exact ? "is-good" : "is-bad"} ${t.id === traceId ? "is-on" : ""}`}
                  onClick={() => setTraceId(t.id === traceId ? null : t.id)}
                  title={`${t.id} ${t.kind}: ${t.matchingSteps}/${t.steps}`}
                >
                  {t.id}
                </button>
              ))}
            </div>
            <p className="lh-small lh-dim">R = seeded random rooms, E = hand-built edge cases. Click any trace.</p>
          </>
        ) : (
          <p className="lh-small">
            Not evaluated yet. {commitment ? `Corpus committed: sha256 ${commitment.sha256.slice(0, 16)}… (${commitment.count} traces).` : ""}
          </p>
        )}
      </aside>

      {tr && ht && (
        <div className="lh-tracepanel" role="dialog" aria-label={`held-out trace ${tr.id}`}>
          <div className="lh-tracehead">
            <span>
              <b>{tr.id}</b> <span className="lh-dim">{tr.kind}</span> · {tr.exact ? "exact match" : tr.error ? `error: ${tr.error}` : `${tr.matchingSteps}/${tr.steps} observations, first divergence at step ${tr.firstDivergence}`}
            </span>
            <button className="lh-chip" onClick={() => setTraceId(null)}>
              close
            </button>
          </div>
          <div className="lh-duo is-compact">
            <figure className="lh-exhibit">
              <figcaption>
                <span className="lh-badge is-live">Original</span>
              </figcaption>
              <Board layout={ht.layout} obs={ht.observations[step]} />
            </figure>
            <figure className="lh-exhibit">
              <figcaption>
                <span className="lh-badge is-replica">Frozen v{ev!.replica.version}</span>
              </figcaption>
              <Board
                layout={ht.layout}
                obs={((tr.replicaObservations?.[step] as Observation)?.light ? (tr.replicaObservations![step] as Observation) : null)}
                diffCells={diffCellsOf(ht.observations[step], tr.replicaObservations?.[step])}
              />
            </figure>
          </div>
          <Stepper
            count={ht.observations.length}
            step={step}
            setStep={setStep}
            verdicts={ht.observations.map((_, i) => !tr.diffs.some((d) => d.step === i))}
            labels={["start", ...ht.actions.map((a) => ARROW[a])]}
          />
          {tr.diffs.find((d) => d.step === step) && (
            <ul className="lh-difflist">
              {tr.diffs
                .find((d) => d.step === step)!
                .fields.slice(0, 8)
                .map((f, i) => (
                  <li key={i}>
                    <b>{f.field}</b> original {JSON.stringify(f.expected)} · replica {JSON.stringify(f.actual)}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
