import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { simulate, validateLayout } from "../engine/reference.ts";
import { compareTraces, type TraceComparison } from "../engine/compare.ts";
import type { Action, Color, Layout, Observation } from "../engine/types.ts";
import { COLORS } from "../engine/types.ts";
import { Board, COLOR_HEX, diffCellsOf } from "./Board.tsx";
import { PRESETS, emptyLayout } from "./presets.ts";
import { frozenCode, primaryEval } from "./data.ts";
import { runReplica, sha256Hex } from "./replica.ts";
import { Stepper, useAutoplay } from "./Stepper.tsx";
import { hooks, initialParams } from "./hooks.ts";

type Tool = "erase" | "wall" | "lamp" | "glass" | "sensor" | "door" | "crate" | "player";
const TOOLS: { id: Tool; label: string; hint: string }[] = [
  { id: "wall", label: "Wall", hint: "stone block" },
  { id: "lamp", label: "Lamp", hint: "click again to turn" },
  { id: "glass", label: "Glass", hint: "coloured pane" },
  { id: "crate", label: "Crate", hint: "" },
  { id: "sensor", label: "Sensor", hint: "then place its door" },
  { id: "door", label: "Door", hint: "links newest free sensor" },
  { id: "player", label: "Visitor", hint: "the player" },
  { id: "erase", label: "Erase", hint: "" },
];
const DIR_NEXT: Record<Action, Action> = { N: "E", E: "S", S: "W", W: "N" };
const ARROW: Record<Action, string> = { N: "↑", S: "↓", E: "→", W: "←" };

function unlitPreview(l: Layout): Observation {
  return {
    player: l.player,
    crates: l.crates.map((c) => ({ ...c, lit: false })),
    light: Array.from({ length: 7 }, () => Array(7).fill("")),
    sensors: l.sensors.map((s) => ({ id: s.id, light: "" })),
    doors: l.doors.map((d) => ({ id: d.id, open: false })),
  };
}

function edit(l: Layout, tool: Tool, color: Color, x: number, y: number): Layout {
  const n: Layout = JSON.parse(JSON.stringify(l));
  const at = (p: { x: number; y: number }) => p.x === x && p.y === y;
  const lamp = n.lamps.find(at);
  if (tool === "lamp" && lamp) {
    lamp.dir = DIR_NEXT[lamp.dir];
    lamp.color = color;
    return n;
  }
  const clearTerrain = () => {
    n.walls = n.walls.filter((p) => !at(p));
    n.lamps = n.lamps.filter((p) => !at(p));
    n.glass = n.glass.filter((p) => !at(p));
    const s = n.sensors.find(at);
    if (s) {
      n.sensors = n.sensors.filter((p) => p !== s);
      n.doors = n.doors.filter((d) => d.sensor !== s.id);
    }
    const d = n.doors.find(at);
    if (d) {
      n.doors = n.doors.filter((p) => p !== d);
      n.sensors = n.sensors.filter((p) => p.id !== d.sensor);
    }
  };
  const clearOcc = () => {
    n.crates = n.crates.filter((c) => !at(c));
  };
  const nextId = (p: string, used: string[]) => {
    for (let i = 1; ; i++) if (!used.includes(`${p}${i}`)) return `${p}${i}`;
  };
  switch (tool) {
    case "erase":
      if (n.crates.some(at)) clearOcc();
      else clearTerrain();
      break;
    case "wall":
      clearTerrain();
      clearOcc();
      if (!at(n.player)) n.walls.push({ x, y });
      break;
    case "lamp":
      clearTerrain();
      clearOcc();
      if (!at(n.player)) n.lamps.push({ x, y, color, dir: "E" });
      break;
    case "glass":
      clearTerrain();
      n.glass.push({ x, y, color });
      break;
    case "sensor":
      clearTerrain();
      n.sensors.push({ id: nextId("s", n.sensors.map((s) => s.id)), x, y });
      break;
    case "door": {
      const free = [...n.sensors].reverse().find((s) => !n.doors.some((d) => d.sensor === s.id) && !(s.x === x && s.y === y));
      if (!free) break;
      clearTerrain();
      n.doors.push({ id: nextId("d", n.doors.map((d) => d.id)), x, y, color, sensor: free.id });
      break;
    }
    case "crate":
      if (n.crates.some(at)) clearOcc();
      else if (!at(n.player) && !n.walls.some(at) && !n.lamps.some(at)) n.crates.push({ id: nextId("c", n.crates.map((c) => c.id)), x, y });
      break;
    case "player":
      if (!n.crates.some(at) && !n.walls.some(at) && !n.lamps.some(at)) n.player = { x, y };
      break;
  }
  return n;
}

type Phase = "compose" | "sealing" | "sealed" | "revealed";
interface Sealed {
  layout: Layout;
  actions: Action[];
  hash: string;
  observations: unknown[] | null;
  error?: string;
  ms: number;
  at: string;
}

export function PredictView({ present }: { present: boolean }) {
  const p0 = PRESETS.find((p) => p.id === initialParams.preset) ?? PRESETS[0];
  const [presetId, setPresetId] = useState<string | null>(p0.id);
  const [layout, setLayout] = useState<Layout>(p0.layout);
  const [actions, setActions] = useState<Action[]>(
    initialParams.actions ? (initialParams.actions.split("").filter((a) => "NSEW".includes(a)) as Action[]) : p0.actions,
  );
  const [tool, setTool] = useState<Tool>("wall");
  const [color, setColor] = useState<Color>("red");
  const [editing, setEditing] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [phase, setPhase] = useState<Phase>("compose");
  const [sealed, setSealed] = useState<Sealed | null>(null);
  const [truth, setTruth] = useState<Observation[] | null>(null);
  const [cmp, setCmp] = useState<TraceComparison | null>(null);
  const [step, setStep] = useState(0);
  const invalid = validateLayout(layout);
  const customSetup = JSON.stringify(layout) !== JSON.stringify(p0.layout) || JSON.stringify(actions) !== JSON.stringify(p0.actions);
  const code = frozenCode;
  const sealAttempt = useRef(0);
  useEffect(() => () => { sealAttempt.current++; }, []);

  const reset = useCallback(() => {
    sealAttempt.current++;
    setPhase("compose");
    setSealed(null);
    setTruth(null);
    setCmp(null);
    setStep(0);
  }, []);

  const loadPreset = (id: string) => {
    const p = PRESETS.find((q) => q.id === id)!;
    setPresetId(id);
    setLayout(p.layout);
    setActions(p.actions);
    reset();
  };

  const push = useCallback(
    (a: Action) => {
      if (phase !== "compose") return;
      setActions((q) => (q.length >= 12 ? q : [...q, a]));
    },
    [phase],
  );

  const seal = useCallback(async () => {
    if (!code || invalid || phase !== "compose") return;
    const attempt = ++sealAttempt.current;
    const inputLayout = structuredClone(layout);
    const inputActions = [...actions];
    setPhase("sealing");
    const r = await runReplica(code.source, inputLayout, inputActions).catch((e: unknown) => ({ ok: false, value: undefined, error: String(e), ms: 0 }));
    if (attempt !== sealAttempt.current) return;
    const payload = JSON.stringify({ replicaSha256: code.sha256, layout: inputLayout, actions: inputActions, observations: r.ok ? r.value : null, error: r.error ?? null });
    const hash = await sha256Hex(payload);
    if (attempt !== sealAttempt.current) return;
    setSealed({ layout: inputLayout, actions: inputActions, hash, observations: r.ok ? (r.value as unknown[]) : null, error: r.error, ms: r.ms, at: new Date().toISOString() });
    setPhase("sealed");
  }, [code, invalid, phase, layout, actions]);

  const reveal = useCallback(() => {
    if (phase !== "sealed" || !sealed) return;
    const t = simulate(sealed.layout, sealed.actions).observations;
    setTruth(t);
    setCmp(compareTraces(t, sealed.observations, sealed.error));
    setStep(0);
    setPhase("revealed");
  }, [phase, sealed, layout, actions]);

  const auto = useAutoplay(phase === "revealed" ? actions.length + 1 : 0, step, setStep);

  // keyboard: arrows/WASD queue moves; Enter seals / reveals
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      const map: Record<string, Action> = { ArrowUp: "N", ArrowDown: "S", ArrowLeft: "W", ArrowRight: "E", w: "N", s: "S", a: "W", d: "E" };
      if (customizing && map[e.key] && phase === "compose") {
        e.preventDefault();
        push(map[e.key]);
      } else if (customizing && e.key === "Backspace" && phase === "compose") setActions((q) => q.slice(0, -1));
      else if (e.key === "Enter" && !(e.target as HTMLElement)?.closest("button,summary,a")) {
        if (phase === "compose") seal();
        else if (phase === "sealed") reveal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, push, seal, reveal, customizing]);

  useEffect(() => {
    hooks.predict = { seal, reveal, reset, setStep, loadPreset, phase: () => phase };
  });

  useEffect(() => {
    if (initialParams.autoplay === "seal") seal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (initialParams.autoplay === "seal" && phase === "sealed") {
      const t = setTimeout(reveal, Number(initialParams.revealDelay ?? 1800));
      return () => clearTimeout(t);
    }
  }, [phase, reveal]);

  const replicaObs = (sealed?.observations?.[step] ?? null) as Observation | null;
  const truthObs = truth?.[step] ?? null;
  const diff = useMemo(() => (phase === "revealed" && truthObs ? diffCellsOf(truthObs, replicaObs) : undefined), [phase, truthObs, replicaObs]);
  const stepVerdicts = cmp ? Array.from({ length: cmp.steps }, (_, i) => !cmp.diffs.some((d) => d.step === i)) : null;
  const stepDiff = cmp?.diffs.find((d) => d.step === step);
  const preview = unlitPreview(layout);

  if (!code)
    return (
      <section className="lh-view">
        <div className="lh-empty">
          <h2>No frozen reconstruction yet</h2>
          <p>The prediction duel needs a replica frozen by a completed discovery run and an evaluation artifact. None is present in this build, so nothing is simulated here.</p>
        </div>
      </section>
    );

  return (
    <section className={`lh-view lh-predict ${present ? "is-present" : ""}`}>
      <div className="lh-predict-left">
        <div className="lh-kicker">III · Predict</div>
        <h2 className="lh-h2">Your experiment.</h2>
        <p className="lh-lede">
          Can the AI’s rebuilt engine predict this room? We’ve prepared a room and {actions.length} moves for you. Start below—no setup needed.
        </p>

        <div className="lh-actions">
          {phase === "compose" && (
            <button className="lh-primary" onClick={seal} disabled={!!invalid}>
              1. Predict with the AI engine
            </button>
          )}
          {phase === "sealing" && <button className="lh-primary" disabled>Computing the prediction…</button>}
          {phase === "sealed" && (
            <button className="lh-primary is-gold" onClick={reveal}>
              2. Run original &amp; compare
            </button>
          )}
          {phase === "revealed" && (
            <button className="lh-secondary" onClick={reset}>
              Start a new prediction
            </button>
          )}
        </div>
        <p className="lh-guidance" aria-live="polite">
          {phase === "compose" ? "The AI’s prediction is sealed first. Then you’ll run the original and compare them." : phase === "sealing" ? "Computing and locking the prediction…" : phase === "sealed" ? "Prediction locked. Now run the original to see whether they agree." : "Both engines have run. Play the comparison to watch the same moves side by side."}
        </p>
        <p className="lh-small">{customSetup ? "Custom setup" : "Ready to try: The Red Gate"} · {actions.length} planned moves</p>
        {customSetup && phase === "compose" && <button className="lh-secondary" onClick={() => { loadPreset(p0.id); setEditing(false); }}>Reset to default</button>}
        <details className="lh-advanced" open={customizing} onToggle={(e) => { const open = e.currentTarget.open; setCustomizing(open); if (!open) setEditing(false); }}>
          <summary>Customize the room &amp; moves</summary>
          <p className="lh-small">Optional: choose another room, plan different moves, or edit the scene.</p>
        <div className="lh-field">
          <div className="lh-label">Rooms</div>
          <div className="lh-presets">
            {PRESETS.map((p) => (
              <button key={p.id} className={`lh-chip ${presetId === p.id ? "is-on" : ""}`} onClick={() => loadPreset(p.id)} disabled={phase === "sealing"}>
                {p.name}
              </button>
            ))}
            <button
              className={`lh-chip ${presetId === null ? "is-on" : ""}`}
              disabled={phase === "sealing"}
              onClick={() => {
                setPresetId(null);
                setLayout(emptyLayout());
                setActions([]);
                setEditing(true);
                reset();
              }}
            >
              Blank room
            </button>
          </div>
          {presetId && <p className="lh-small">{PRESETS.find((p) => p.id === presetId)?.blurb}</p>}
        </div>

        <div className="lh-field">
          <div className="lh-label">
            Plan the visitor’s moves <span className="lh-dim">({actions.length}/12)</span>
          </div>
          <div className="lh-moves">
            {actions.length === 0 && <span className="lh-dim">No moves yet: only the opening state will be compared.</span>}
            {actions.map((a, i) => (
              <span key={i} className={`lh-move-chip ${phase === "revealed" && i + 1 === step ? "is-on" : ""} ${stepVerdicts && !stepVerdicts[i + 1] ? "is-bad" : ""}`}>
                {ARROW[a]}
              </span>
            ))}
          </div>
          <p className="lh-small">Each arrow adds a move to the plan above. The visitor stays still until you run the comparison.</p>
          <div className="lh-pad" aria-label="Add moves to the plan">
            {(["N", "W", "S", "E"] as Action[]).map((a) => (
              <button key={a} className={`lh-key k-${a}`} onClick={() => push(a)} disabled={phase !== "compose" || actions.length >= 12} title={`Add a move ${ {N: "up", S: "down", E: "right", W: "left"}[a]}`} aria-label={`Add a move ${ {N: "up", S: "down", E: "right", W: "left"}[a]}`}>
                {ARROW[a]}
              </button>
            ))}
            <button className="lh-key k-back" onClick={() => setActions((q) => q.slice(0, -1))} disabled={phase !== "compose" || !actions.length}>
              Undo last
            </button>
            <button className="lh-key k-clear" onClick={() => setActions([])} disabled={phase !== "compose" || !actions.length}>
              clear
            </button>
          </div>
        </div>

        <div className="lh-field">
          <button className={`lh-toggle ${editing ? "is-on" : ""}`} onClick={() => setEditing((e) => !e)} disabled={phase !== "compose"}>
            {editing ? "Done editing" : "Edit this room"}
          </button>
          {editing && phase === "compose" && (
            <div className="lh-editor">
              <div className="lh-tools">
                {TOOLS.map((t) => (
                  <button key={t.id} className={`lh-tool ${tool === t.id ? "is-on" : ""}`} onClick={() => setTool(t.id)} title={t.hint}>
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="lh-swatches">
                {COLORS.map((c) => (
                  <button key={c} className={`lh-swatch ${color === c ? "is-on" : ""}`} style={{ background: COLOR_HEX[c] }} onClick={() => setColor(c)} aria-label={c} title={c} />
                ))}
                <span className="lh-small">{TOOLS.find((t) => t.id === tool)?.hint || "click a cell"}</span>
              </div>
            </div>
          )}
          {invalid && <p className="lh-warn">Not a valid room: {invalid}</p>}
        </div>

        </details>
      </div>

      <div className="lh-stage">
        <div className="lh-duo">
          <figure className="lh-exhibit">
            <figcaption>
              <span className="lh-badge is-live">Live</span> Original engine
            </figcaption>
            <div className="lh-board-wrap">
              <Board
                layout={layout}
                obs={phase === "revealed" ? truthObs : preview}
                onCellClick={editing && phase === "compose" ? (x, y) => setLayout((l) => edit(l, tool, color, x, y)) : undefined}
                dim={phase !== "revealed" && !editing}
                title="Original engine"
              />
              {phase !== "revealed" && !editing && <div className="lh-veil">{phase === "sealed" ? "waiting for the seal to be opened" : "the original has not run yet"}</div>}
            </div>
          </figure>
          <figure className="lh-exhibit">
            <figcaption>
              <span className="lh-badge is-replica">Frozen</span> Generated reconstruction v{code.version}
            </figcaption>
            <div className="lh-board-wrap">
              <Board layout={layout} obs={phase === "revealed" && replicaObs?.light ? replicaObs : preview} diffCells={diff} dim={phase !== "revealed"} title="Generated reconstruction" />
              {(phase === "sealed" || phase === "sealing") && (
                <div className="lh-seal">
                  <div className="lh-seal-wax">{phase === "sealing" ? "…" : "sealed"}</div>
                  {sealed && (
                    <>
                      <div className="lh-mono">sha256 {sealed.hash.slice(0, 16)}…{sealed.hash.slice(-8)}</div>
                      <div className="lh-small">
                        {sealed.error ? `replica failed: ${sealed.error}` : `${sealed.observations?.length} observations computed in ${sealed.ms.toFixed(0)} ms`}
                      </div>
                    </>
                  )}
                </div>
              )}
              {phase === "compose" && <div className="lh-veil">prediction not computed yet</div>}
              {phase === "revealed" && sealed?.error && <div className="lh-veil is-bad">replica error: {sealed.error}</div>}
            </div>
          </figure>
        </div>

        {phase === "revealed" && cmp && (
          <div className="lh-verdict">
            <Stepper count={actions.length + 1} step={step} setStep={setStep} auto={auto} verdicts={stepVerdicts ?? undefined} labels={["start", ...actions.map((a) => ARROW[a])]} />
            <div className={`lh-verdict-line ${cmp.exact ? "is-good" : "is-bad"}`}>
              {cmp.exact
                ? `Agreement: all ${cmp.steps} observations identical, field by field.`
                : cmp.error
                  ? `The reconstruction failed to produce a trace: ${cmp.error}`
                  : `${cmp.matchingSteps} of ${cmp.steps} observations identical. First divergence at ${cmp.firstDivergence === 0 ? "the opening state" : `move ${cmp.firstDivergence}`}.`}
              <span className="lh-mono lh-dim"> seal {sealed?.hash.slice(0, 10)}</span>
            </div>
            {stepDiff && (
              <ul className="lh-difflist">
                {stepDiff.fields.slice(0, 6).map((f, i) => (
                  <li key={i}>
                    <b>{f.field}</b> original {JSON.stringify(f.expected)} · replica {JSON.stringify(f.actual)}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {phase !== "revealed" && primaryEval && (
          <p className="lh-foot">
            On the sealed held-out set this replica matched {primaryEval.summary.exactTraces} of {primaryEval.summary.traces} traces exactly. Try a new arrangement to challenge it.
          </p>
        )}
      </div>
    </section>
  );
}
