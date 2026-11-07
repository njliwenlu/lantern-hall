import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DiscoverView } from "./DiscoverView.tsx";
import { ReconstructView } from "./ReconstructView.tsx";
import { PredictView } from "./PredictView.tsx";
import { Evidence } from "./Evidence.tsx";
import { hooks, initialParams } from "./hooks.ts";

type Tab = "discover" | "reconstruct" | "predict";
const TABS: { id: Tab; n: string; label: string; sub: string }[] = [
  { id: "discover", n: "I", label: "Discover", sub: "recorded experiments" },
  { id: "reconstruct", n: "II", label: "Reconstruct", sub: "generated code" },
  { id: "predict", n: "III", label: "Predict", sub: "live, sealed" },
];

function useStageScale(enabled: boolean) {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    if (!enabled) return;
    const fit = () => setScale(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [enabled]);
  return scale;
}

export default function App() {
  const present = initialParams.present;
  const [tab, setTab] = useState<Tab>((TABS.find((t) => t.id === initialParams.tab)?.id ?? "discover") as Tab);
  const [evidence, setEvidence] = useState(false);
  const scale = useStageScale(present);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hooks.setTab = setTab;
    hooks.setEvidence = setEvidence;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.key === "Escape") setEvidence(false);
      if (tab !== "predict" || present) {
        if (e.key === "1") setTab("discover");
        if (e.key === "2") setTab("reconstruct");
        if (e.key === "3") setTab("predict");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, present]);

  const shell = (
    <div className={`lh-app ${present ? "is-present" : ""}`} ref={mainRef}>
      <header className="lh-header">
        <div className="lh-brand">
          <div className="lh-mark" aria-hidden="true">
            <span />
          </div>
          <div>
            <h1 className="lh-title">EvoArena: Lantern Hall</h1>
            <p className="lh-subtitle">Museum of Impossible Physics</p>
          </div>
        </div>
        <nav className="lh-nav" aria-label="exhibit sections">
          {TABS.map((t) => (
            <button key={t.id} className={`lh-navbtn ${tab === t.id ? "is-on" : ""}`} onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}>
              <span className="lh-navn">{t.n}</span>
              <span className="lh-navl">{t.label}</span>
              <span className="lh-navs">{t.sub}</span>
            </button>
          ))}
        </nav>

      </header>

      <section className="lh-premise" aria-label="About this exhibit">
        <div>
          <div className="lh-kicker">An experiment in machine discovery</div>
          <h2>{tab === "discover" ? "The laws are missing." : tab === "reconstruct" ? "From observation to invention." : "A theory meets reality."}</h2>
        </div>
        <p>{tab === "discover" ? "We hid the rules. A model explored the world, challenged its assumptions, and wrote the engine it believed was inside." : tab === "reconstruct" ? "Follow the model’s changing reconstruction, from its first attempt to the frozen engine. Every version is real, executable code." : "Arrange an unfamiliar room. Seal the model’s prediction. Only then reveal what the original world actually does."}</p>

      </section>

      <main className="lh-main">
        {tab === "discover" && <DiscoverView present={present} />}
        {tab === "reconstruct" && <ReconstructView present={present} />}
        {tab === "predict" && <PredictView present={present} />}
      </main>

      {!present && (
        <footer className="lh-footer">
          <button className="lh-evidence-link" onClick={() => setEvidence(true)}>View experiment evidence</button>
          <span>Rules were withheld from the model during the recorded run; they are public here afterwards.</span>
          <span>Agreement is measured on the tests shown, not proven in general.</span>
        </footer>
      )}
      <Evidence open={evidence} onClose={() => setEvidence(false)} />
      {evidence && <div className="lh-scrim" onClick={() => setEvidence(false)} />}
    </div>
  );

  if (!present) return shell;
  return (
    <div className="lh-present-outer">
      <div className="lh-present-stage" style={{ transform: `scale(${scale})` }}>
        {shell}
      </div>
    </div>
  );
}
