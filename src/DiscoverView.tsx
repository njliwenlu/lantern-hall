import { useEffect, useMemo, useState } from "react";
import { Board } from "./Board.tsx";
import { primaryRun } from "./data.ts";
import { Stepper, useAutoplay } from "./Stepper.tsx";
import { hooks, initialParams } from "./hooks.ts";

const ARROW: Record<string, string> = { N: "↑", S: "↓", E: "→", W: "←" };

export function DiscoverView({ present }: { present: boolean }) {
  const run = primaryRun;
  const rounds = run?.rounds ?? [];
  const [round, setRound] = useState<number>(Number(initialParams.round) || (rounds.some((r) => r.round === 2) ? 2 : rounds[0]?.round) || 1);
  const rec = rounds.find((r) => r.round === round) ?? rounds[0];
  const exps = useMemo(() => run?.experiments.filter((e) => e.round === rec?.round) ?? [], [run, rec]);
  const [expId, setExpId] = useState<string | null>(initialParams.exp ?? "litCrateDarkPlayer");
  const exp = exps.find((e) => e.id === expId) ?? exps.find((e) => !e.error) ?? exps[0];
  const [step, setStep] = useState(Number(initialParams.step) || 0);
  const count = exp?.observations?.length ?? 0;
  const auto = useAutoplay(initialParams.manualClock ? 0 : count, step, setStep);

  useEffect(() => {
    hooks.discover = { setRound, setExp: setExpId, setStep };
  });
  useEffect(() => {
    if (step >= count) setStep(0);
  }, [count, step]);

  if (!run)
    return (
      <section className="lh-view">
        <div className="lh-empty">
          <h2>No recorded discovery in this build</h2>
          <p>Run <code>npm run discover</code> to produce a real trace. Nothing is shown until one exists.</p>
        </div>
      </section>
    );

  const prevHyp = rounds.find((r) => r.round === (rec?.round ?? 1) - 1)?.hypotheses ?? [];
  const cv = run.codeVersions.find((v) => v.version === rec?.codeVersion);

  return (
    <section className={`lh-view lh-discover ${present ? "is-present" : ""}`}>
      <aside className="lh-rail" aria-label="discovery rounds">
        <div className="lh-kicker">I · Discover</div>
        <div className="lh-recorded">
          <span className="lh-badge is-rec">Recorded discovery</span>
          <span className="lh-mono lh-dim">{run.runId}</span>
        </div>
        <ol className="lh-rounds">
          {rounds.map((r) => {
            const v = run.codeVersions.find((c) => c.version === r.codeVersion);
            return (
              <li key={r.round}>
                <button className={`lh-round ${r.round === rec?.round ? "is-on" : ""}`} onClick={() => { setRound(r.round); setExpId(null); setStep(0); }}>
                  <span className="lh-round-n">Round {r.round}</span>
                  <span className="lh-round-meta">
                    {r.failure ? "call failed" : r.parseError ? "unparseable reply" : `${r.experimentIds.length} experiment${r.experimentIds.length === 1 ? "" : "s"}`}
                    {v ? ` · code v${v.version} (${v.validation.exact}/${v.validation.experiments})` : ""}
                    {r.final ? " · final" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="lh-small lh-dim">
          Each round is a fresh, tool-free {run.model} process given only the schema and these results. {run.status !== "completed" ? `Run status: ${run.status}.` : ""}
        </p>
      </aside>

      <div className="lh-stage">
        <div className="lh-exp-head">
          <div className="lh-label">The observation room · round {rec?.round}</div>
          <h2 className="lh-h2">{exp ? <>{exp.id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ")}</> : rec?.round === run.maxRounds ? "Final round: code only" : "No experiment this round"}</h2>
          {exp && <div className="lh-catalog-id">{exp.id}</div>}
          {exp?.purpose && <p className="lh-quote">“{exp.purpose}”</p>}
        </div>
        {exps.length > 1 && (
          <div className="lh-exptabs">
            {exps.map((e) => (
              <button key={e.id} className={`lh-chip ${e.id === exp?.id ? "is-on" : ""} ${e.error ? "is-bad" : ""}`} onClick={() => { setExpId(e.id); setStep(0); }}>
                {e.id}
              </button>
            ))}
          </div>
        )}
        {exp && exp.observations ? (
          <>
            <figure className="lh-exhibit is-solo">
              <figcaption>
                <span className="lh-badge is-rec">Recorded</span> Original world · recorded observation
              </figcaption>
              <div className="lh-board-wrap">
                <Board layout={exp.layout} obs={exp.observations[step]} title={`experiment ${exp.id}, step ${step}`} />
              </div>
            </figure>
            <Stepper count={count} step={step} setStep={setStep} auto={auto} labels={["start", ...exp.actions.map((a) => ARROW[a] ?? a)]} />
          </>
        ) : exp?.error ? (
          <div className="lh-empty is-inline">
            <p>The host rejected this request: {exp.error}</p>
          </div>
        ) : null}
      </div>

      <aside className="lh-notes" aria-label="model notes">
        <div className="lh-kicker">The field journal</div>
        {rec?.notes && (
          <details className="lh-note lh-journal-note">
            <summary>Read the model’s notes · round {rec.round}</summary>
            <p className="lh-quote">“{rec.notes}”</p>
          </details>
        )}
        {rec?.hypotheses && rec.hypotheses.length > 0 && (
          <div className="lh-note">
            <div className="lh-label">Hypotheses, verbatim</div>
            <ul className="lh-hyps">
              {rec.hypotheses.map((h) => {
                const before = prevHyp.find((p) => p.id === h.id);
                const changed = before && before.status !== h.status;
                return (
                  <li key={h.id} className={`lh-hyp s-${h.status}`}>
                    <span className="lh-hyp-status">
                      {h.id} · {h.status}
                      {changed ? ` (was ${before.status})` : ""}
                    </span>
                    <span>{h.statement}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {cv && (
          <div className="lh-note">
            <div className="lh-label">Code submitted</div>
            <p className="lh-small">
              v{cv.version} · {cv.source.split("\n").length} lines · reproduced {cv.validation.exact}/{cv.validation.experiments} of its own experiments exactly
            </p>
          </div>
        )}
        {rec?.failure && <p className="lh-warn">{rec.failure}</p>}
        {rec?.parseError && <p className="lh-warn">Reply could not be parsed: {rec.parseError}</p>}
      </aside>
    </section>
  );
}
