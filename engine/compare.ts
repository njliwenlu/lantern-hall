// Full-state differential comparison between two observations / traces.
import type { Observation } from "./types.ts";

export interface FieldDiff {
  field: string;
  expected: unknown;
  actual: unknown;
}

export function diffObservation(expected: Observation, actual: unknown): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const a = (actual ?? {}) as Partial<Observation>;
  const push = (field: string, e: unknown, v: unknown) => diffs.push({ field, expected: e, actual: v });
  if (a.player?.x !== expected.player.x || a.player?.y !== expected.player.y)
    push("player", expected.player, a.player ?? null);
  const ac = Array.isArray(a.crates) ? a.crates : [];
  expected.crates.forEach((c, i) => {
    const o = ac.find((x) => x && x.id === c.id) ?? ac[i];
    if (!o || o.x !== c.x || o.y !== c.y) push(`crate ${c.id} position`, { x: c.x, y: c.y }, o ? { x: o.x, y: o.y } : null);
    if (!o || Boolean(o.lit) !== c.lit) push(`crate ${c.id} lit`, c.lit, o ? o.lit : null);
  });
  for (let y = 0; y < expected.light.length; y++) {
    for (let x = 0; x < expected.light[y].length; x++) {
      const e = expected.light[y][x];
      const raw = Array.isArray(a.light) && Array.isArray(a.light[y]) ? a.light[y][x] : undefined;
      const v = typeof raw === "string" ? raw.split("").sort().join("") : raw;
      if (v !== e) push(`light ${x},${y}`, e, v ?? null);
    }
  }
  const as = Array.isArray(a.sensors) ? a.sensors : [];
  expected.sensors.forEach((s) => {
    const o = as.find((x) => x && x.id === s.id);
    const v = o && typeof o.light === "string" ? o.light.split("").sort().join("") : o?.light;
    if (v !== s.light) push(`sensor ${s.id}`, s.light, v ?? null);
  });
  const ad = Array.isArray(a.doors) ? a.doors : [];
  expected.doors.forEach((d) => {
    const o = ad.find((x) => x && x.id === d.id);
    if (!o || Boolean(o.open) !== d.open) push(`door ${d.id}`, d.open, o ? o.open : null);
  });
  return diffs;
}

export interface TraceComparison {
  steps: number; // observations compared (incl. reset)
  matchingSteps: number;
  exact: boolean;
  firstDivergence: number | null; // index into observations
  diffs: { step: number; fields: FieldDiff[] }[];
  error?: string;
}

export function compareTraces(expected: Observation[], actual: unknown[] | null, error?: string): TraceComparison {
  const res: TraceComparison = {
    steps: expected.length,
    matchingSteps: 0,
    exact: false,
    firstDivergence: null,
    diffs: [],
  };
  if (error || !actual) {
    res.error = error ?? "no output";
    res.firstDivergence = 0;
    return res;
  }
  expected.forEach((e, i) => {
    const f = diffObservation(e, actual[i]);
    if (f.length === 0) res.matchingSteps++;
    else {
      if (res.firstDivergence === null) res.firstDivergence = i;
      res.diffs.push({ step: i, fields: f.slice(0, 20) });
    }
  });
  res.exact = res.matchingSteps === expected.length;
  return res;
}
