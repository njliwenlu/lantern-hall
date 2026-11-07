// Deterministic replay / presentation hooks.
// URL parameters (all optional):
//   ?present=1            clean 16:9 stage (1920x1080 scaled to the window)
//   &tab=discover|reconstruct|predict
//   &round=3&exp=<id>&step=2     (discover)   &version=4&trace=E3 (reconstruct)
//   &preset=prism&actions=NENN&autoplay=seal&revealDelay=1800       (predict)
//   &clock=manual         starts paused for scripted replay; explicit Play/Watch still works
// window.lantern exposes: setTab, discover.{setRound,setExp,setStep}, predict.{seal,reveal,reset,setStep,loadPreset}
const q = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);

export const initialParams = {
  present: q.get("present") === "1",
  tab: q.get("tab"),
  round: q.get("round"),
  exp: q.get("exp"),
  step: q.get("step"),
  version: q.get("version"),
  trace: q.get("trace"),
  preset: q.get("preset"),
  actions: q.get("actions"),
  autoplay: q.get("autoplay"),
  revealDelay: q.get("revealDelay"),
  manualClock: q.get("clock") === "manual",
  speed: Number(q.get("speed") ?? "1") || 1,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const hooks: Record<string, any> = {};
if (typeof window !== "undefined") (window as unknown as { lantern: typeof hooks }).lantern = hooks;
