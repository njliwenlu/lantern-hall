import { useEffect, useState } from "react";
import { initialParams } from "./hooks.ts";

export interface Auto {
  playing: boolean;
  toggle: () => void;
}

/** Step autoplay with a fixed cadence (deterministic order; disabled with ?clock=manual). */
export function useAutoplay(count: number, step: number, setStep: (n: number) => void): Auto {
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (count > 0 && !initialParams.manualClock) setPlaying(true);
    else setPlaying(false);
  }, [count]);
  useEffect(() => {
    if (!playing || count <= 0) return;
    if (step >= count - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep(step + 1), 900 / initialParams.speed);
    return () => clearTimeout(t);
  }, [playing, step, count, setStep]);
  return {
    playing,
    toggle: () => {
      if (!playing && step >= count - 1) setStep(0);
      setPlaying((p) => !p);
    },
  };
}

export function Stepper({
  count,
  step,
  setStep,
  auto,
  verdicts,
  labels,
}: {
  count: number;
  step: number;
  setStep: (n: number) => void;
  auto?: Auto;
  verdicts?: boolean[];
  labels?: string[];
}) {
  return (
    <div className="lh-stepper">
      {auto && (
        <button className="lh-play" onClick={auto.toggle} aria-label={auto.playing ? "pause" : "play"}>
          {auto.playing ? "❚❚" : "▶"}
        </button>
      )}
      <button className="lh-stepbtn" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="previous step">
        ‹
      </button>
      <div className="lh-ticks">
        {Array.from({ length: count }, (_, i) => (
          <button
            key={i}
            className={`lh-tick ${i === step ? "is-on" : ""} ${verdicts ? (verdicts[i] ? "is-good" : "is-bad") : ""}`}
            onClick={() => setStep(i)}
            aria-label={`step ${i}`}
          >
            {labels?.[i] ?? i}
          </button>
        ))}
      </div>
      <button className="lh-stepbtn" onClick={() => setStep(Math.min(count - 1, step + 1))} disabled={step >= count - 1} aria-label="next step">
        ›
      </button>
    </div>
  );
}
