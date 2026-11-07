// Full-state differential comparison between two observations / traces.
import type { Observation } from "./types.ts";

export interface FieldDiff {
  field: string;
  expected: unknown;
  actual: unknown;
}

export function diffObservation(expected: Observation, actual: unknown): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  // The published contract fixes field types, array order and lengths. Structural
  // equality prevents absent false booleans or extra entities passing as "exact".
  const compare = (e: unknown, a: unknown, path: string) => {
    if (Object.is(e, a)) return;
    if (Array.isArray(e)) {
      if (!Array.isArray(a)) { diffs.push({ field: path, expected: e, actual: a ?? null }); return; }
      if (e.length !== a.length) diffs.push({ field: `${path}.length`, expected: e.length, actual: a.length });
      e.forEach((v, i) => compare(v, a[i], `${path}[${i}]`));
      return;
    }
    if (e !== null && typeof e === "object") {
      if (a === null || typeof a !== "object" || Array.isArray(a)) {
        diffs.push({ field: path, expected: e, actual: a ?? null }); return;
      }
      const eo = e as Record<string, unknown>, ao = a as Record<string, unknown>;
      for (const k of Object.keys(eo)) compare(eo[k], Object.hasOwn(ao, k) ? ao[k] : undefined, `${path}.${k}`);
      for (const k of Object.keys(ao)) if (!Object.hasOwn(eo, k))
        diffs.push({ field: `${path}.${k}`, expected: null, actual: ao[k] });
      return;
    }
    diffs.push({ field: path, expected: e, actual: a ?? null });
  };
  compare(expected, actual, "observation");
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
  if (error || !Array.isArray(actual)) {
    res.error = error ?? "no output";
    res.firstDivergence = 0;
    return res;
  }
  if (actual.length !== expected.length) {
    res.firstDivergence = Math.min(actual.length, expected.length);
    res.diffs.push({ step: res.firstDivergence, fields: [{ field: "trace.length", expected: expected.length, actual: actual.length }] });
  }
  expected.forEach((e, i) => {
    const f = diffObservation(e, actual[i]);
    if (f.length === 0) res.matchingSteps++;
    else {
      if (res.firstDivergence === null || i < res.firstDivergence) res.firstDivergence = i;
      res.diffs.push({ step: i, fields: f.slice(0, 20) });
    }
  });
  res.diffs.sort((a, b) => a.step - b.step);
  res.exact = actual.length === expected.length && res.matchingSteps === expected.length;
  return res;
}
