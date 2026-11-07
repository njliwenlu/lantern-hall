import { useCallback, useEffect, useMemo, useState } from "react";
import { Board } from "./Board.tsx";
import { primaryRun } from "./data.ts";
import { experimentTitle } from "./experimentTitles.ts";
import { Stepper, useAutoplay } from "./Stepper.tsx";
import { hooks, initialParams } from "./hooks.ts";

const ARROW: Record<string, string> = { N: "↑", S: "↓", E: "→", W: "←" };

export function DiscoverView({ present }: { present: boolean }) {
  const run = primaryRun;
  const rounds = run?.rounds ?? [];
  const hasGuidedStory = run?.runId === "run-01" && ["darkCrateLitPlayer", "litCrateDarkPlayer"].every((id) =>
    run.experiments.some((e) => e.round === 2 && e.id === id && !!e.observations?.length));
  const firstExperiment = run?.experiments.find((e) => !e.error && e.observations?.length);
  const defaultRound = hasGuidedStory ? 2 : firstExperiment?.round ?? rounds[0]?.round ?? 1;
  const [round, setRound] = useState<number>(Number(initialParams.round) || defaultRound);
  const rec = rounds.find((r) => r.round === round) ?? rounds[0];
  const exps = useMemo(() => run?.experiments.filter((e) => e.round === rec?.round) ?? [], [run, rec]);
  const [expId, setExpId] = useState<string | null>(initialParams.exp ?? (hasGuidedStory ? "darkCrateLitPlayer" : firstExperiment?.id ?? null));
  const [showAll, setShowAll] = useState(!hasGuidedStory || Boolean(initialParams.round || initialParams.exp));
  const exp = exps.find((e) => e.id === expId) ?? exps.find((e) => !e.error) ?? exps[0];
  const [step, setStep] = useState(Number(initialParams.step) || 0);
  const count = exp?.observations?.length ?? 0;
  // Guided playback is one continuous sequence of recorded observations.
  // Archive playback remains scoped to the selected experiment.
  const guidedFrames = useMemo(() => (hasGuidedStory ? ["darkCrateLitPlayer", "litCrateDarkPlayer"] : []).flatMap((id) =>
    (run?.experiments.find((e) => e.round === 2 && e.id === id)?.observations ?? []).map((_, index) => ({ id, step: index }))
  ), [run, hasGuidedStory]);
  const guidedIndex = guidedFrames.findIndex((f) => f.id === exp?.id && f.step === step);
  const setPlaybackStep = useCallback((index: number) => {
    if (showAll) { setStep(index); return; }
    const frame = guidedFrames[index];
    if (frame) { setRound(2); setExpId(frame.id); setStep(frame.step); }
  }, [showAll, guidedFrames]);
  const auto = useAutoplay(count, step, setStep);
  const tour = useAutoplay(guidedFrames.length, Math.max(0, guidedIndex), setPlaybackStep);
  const playing = auto.playing || tour.playing;
  const stopTour = () => { if (tour.playing) tour.toggle(); };
  const manualStep = (n: number) => { stopTour(); setStep(n); };
  const manualAuto = { playing: auto.playing, toggle: () => { stopTour(); auto.toggle(); } };
  const previous = step > 0 ? exp?.observations?.[step - 1] : null;
  const current = exp?.observations?.[step];
  const crateMoved = previous && current && current.crates.some((c) => {
    const before = previous.crates.find((p) => p.id === c.id);
    return before && (before.x !== c.x || before.y !== c.y);
  });
  const visitorMoved = previous && current && (previous.player.x !== current.player.x || previous.player.y !== current.player.y);
  const actionResult = crateMoved ? "Crate slides" : visitorMoved ? "Visitor moves" : "Blocked · nothing moved";

  useEffect(() => {
    hooks.discover = { setRound: (n: number) => { stopTour(); setRound(n); setShowAll(true); }, setExp: (id: string) => { stopTour(); setExpId(id); setShowAll(true); }, setGuidedExperiment: (id: string) => { if (!hasGuidedStory || !["darkCrateLitPlayer", "litCrateDarkPlayer"].includes(id)) return; stopTour(); setRound(2); setExpId(id); setShowAll(false); setStep(0); }, setStep: manualStep };
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
    <section className={`lh-view lh-discover ${showAll ? "is-browsing" : "is-guided"} ${present ? "is-present" : ""}`}>
      <aside className="lh-rail" aria-label="discovery rounds">
        {hasGuidedStory && <div className="lh-guidance">
          <div className="lh-kicker">A two-experiment discovery</div>
          <h2 className="lh-h2 is-small">What makes a crate move?</h2>
          <p>The model suspected the visitor needed to stand in light. Two experiments put that idea to the test.</p>
          <button className="lh-primary" onClick={() => { if (playing) { stopTour(); if (auto.playing) auto.toggle(); } else { tour.toggle(); } }}>{playing ? "Pause discovery" : guidedIndex === guidedFrames.length - 1 ? "Replay discovery" : guidedIndex > 0 ? "Continue discovery" : "Watch the discovery"} <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span></button>
          <p className="lh-play-feedback" role="status">
            {step > 0
              ? exp?.id === "darkCrateLitPlayer"
                ? `${step === count - 1 ? "Both pushes" : "Push 1"} blocked. The dark crate did not move.${step === count - 1 ? " Next: light on the crate." : ""}`
                : "The lit crate slid, even though the visitor started in darkness."
              : playing ? "Playing: the visitor is trying to push the crate…" : "Watch both experiments in sequence. First the push is blocked; then the lit crate slides."}
          </p>
          <ol className="lh-story-steps">
            <li className={exp?.id === "darkCrateLitPlayer" ? "is-current" : ""}>Light on the visitor.<small>The crate stays dark.</small></li>
            <li className={exp?.id === "litCrateDarkPlayer" ? "is-current" : ""}>Light on the crate.<small>The visitor stays dark.</small></li>
          </ol>
        </div>}
        <details className="lh-advanced" open={showAll} onToggle={(e) => { const open = !hasGuidedStory || e.currentTarget.open; if (open) stopTour(); setShowAll(open); if (!open && !["darkCrateLitPlayer", "litCrateDarkPlayer"].includes(exp?.id ?? "")) { setRound(2); setExpId("darkCrateLitPlayer"); setStep(0); if (auto.playing) auto.toggle(); } }}>
        <summary>Explore all experiments</summary>
        {hasGuidedStory && <button className="lh-chip" onClick={() => { setShowAll(false); setRound(2); setExpId("darkCrateLitPlayer"); setStep(0); if (auto.playing) auto.toggle(); }}>← Back to guided tour</button>}
        <p className="lh-small">The AI ran {run.experiments.length} experiments to uncover the rules. Choose one below, then press Play experiment. A round is one cycle of experiments and feedback.</p>
        <label className="lh-archive-label" htmlFor="experiment-picker">Choose an experiment</label>
        <select id="experiment-picker" className="lh-experiment-picker" value={exp?.id ?? ""} onChange={(e) => {
          const selected = run.experiments.find((x) => x.id === e.target.value);
          if (!selected) return;
          stopTour(); if (auto.playing) auto.toggle();
          setRound(selected.round); setExpId(selected.id); setStep(0);
        }}>
          {!exp && <option value="">Choose an experiment…</option>}
          {rounds.filter((r) => run.experiments.some((e) => e.round === r.round)).map((r) => <optgroup key={r.round} label={`Round ${r.round}`}>
            {run.experiments.filter((e) => e.round === r.round).map((e) => <option key={e.id} value={e.id}>{experimentTitle(e.id, run.runId, e.purpose)} · {e.actions.length} moves</option>)}
          </optgroup>)}
        </select>
        <details className="lh-advanced lh-run-details"><summary>Technical details</summary>
          <p className="lh-small">Run: {run.runId}<br />Model: {run.model}<br />Experiment ID: {exp?.id ?? "none"}</p>
          <p className="lh-small">{run.provider === "meta" ? "Each round uses a stateless API request with no tools." : "Each round uses a fresh, tool-free model process."} The final code-only round is shown on Reconstruct.</p>
        </details>
        </details>
      </aside>

      <div className="lh-stage">
        <div className="lh-exp-head">
          <div className="lh-label">The observation room · round {rec?.round}</div>
          <h2 className="lh-h2">{exp ? <>{experimentTitle(exp.id, run.runId, exp.purpose)}</> : rec?.round === run.maxRounds ? "Final round: code only" : "No experiment this round"}</h2>
          {exp?.purpose && <p className="lh-quote">{hasGuidedStory && exp.id === "darkCrateLitPlayer" ? "The visitor stands in light and pushes south. Watch the dark crate." : hasGuidedStory && exp.id === "litCrateDarkPlayer" ? "Now the crate is lit, and the visitor is dark. Watch the northward push." : `“${exp.purpose}”`}</p>}
        </div>
        {exp && exp.observations ? (
          <>
            <figure className="lh-exhibit is-solo">
              <figcaption>
                <span className="lh-badge is-rec">Recorded</span> Original world · recorded observation
              </figcaption>
              <div className="lh-board-wrap">
                <Board layout={exp.layout} obs={exp.observations[step]} title={`experiment ${exp.id}, step ${step}`} />
                {!showAll && <div className="lh-action-caption" key={`${exp.id}-${step}`} aria-live="polite">
                  <span>Experiment {exp.id === "darkCrateLitPlayer" ? "1" : "2"} of 2</span>
                  <strong>{step === 0 ? (playing ? "Playing · watch the push" : "Ready to replay") : `Attempt ${step} ${ARROW[exp.actions[step - 1]] ?? ""} · ${actionResult}`}</strong>
                </div>}

              </div>
            </figure>
            {showAll ? <div className="lh-archive-playback">
              <button className="lh-primary" onClick={manualAuto.toggle} disabled={count < 2}>{auto.playing ? "Pause experiment" : step === count - 1 ? "Replay experiment" : "Play experiment"} <span aria-hidden="true">{auto.playing ? "Ⅱ" : "▶"}</span></button>
              <p className="lh-small">{step === 0 ? "Starting position" : `Move ${step} of ${count - 1}`} · replaying recorded results</p>
              <details className="lh-playback-details"><summary>Step through moves</summary><Stepper count={count} step={step} setStep={manualStep} labels={["start", ...exp.actions.map((a) => ARROW[a] ?? a)]} /></details>
            </div> : <div className="lh-guided-playback">
              <p className="lh-small" aria-live="polite">{step === 0 ? "Starting position · press Watch to begin" : `Move ${step} of ${count - 1} · push ${exp.actions[step - 1] === "S" ? "south ↓" : "north ↑"}${step === count - 1 ? " · experiment complete" : ""}`}</p>
              <details className="lh-playback-details"><summary>Replay controls</summary><Stepper count={count} step={step} setStep={manualStep} auto={manualAuto} labels={["start", ...exp.actions.map((a) => ARROW[a] ?? a)]} /></details>
            </div>}
            {!showAll && <div className="lh-discovery-next">
              {exp.id === "darkCrateLitPlayer" ? <button className={`lh-chip ${step === count - 1 ? "is-on" : ""}`} onClick={() => { stopTour(); setExpId("litCrateDarkPlayer"); setStep(0); if (!auto.playing) auto.toggle(); }}>Next experiment: light the crate →</button>
                : step === count - 1 ? <><p>The crate moves even with the visitor in darkness. In round 3, the model rejected its visitor-light hypothesis.</p><button className="lh-chip is-on" onClick={() => hooks.setTab?.("predict")}>Try a prediction →</button></> : <p>Watch what happens when the visitor pushes north.</p>}
            </div>}

          </>
        ) : exp?.error ? (
          <div className="lh-empty is-inline">
            <p>The host rejected this request: {exp.error}</p>
          </div>
        ) : null}
      </div>

      <aside className="lh-notes" aria-label="model notes">
        <details className="lh-advanced">
        <summary>AI’s notes &amp; hypotheses <span>Written responses from this round</span></summary>
        <p className="lh-small lh-dim">These are notes and hypotheses the model explicitly wrote in its responses, not its private internal thoughts.</p>
        {rec?.notes && (
          <div className="lh-note lh-journal-note">
            <div className="lh-label">Model’s written notes · round {rec.round}</div>
            <p className="lh-quote">“{rec.notes}”</p>
          </div>
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
        </details>
      </aside>
    </section>
  );
}
