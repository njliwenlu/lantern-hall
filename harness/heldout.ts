// Generate the sealed held-out evaluation corpus BEFORE discovery.
// Writes private/heldout.json (git-ignored, never given to the discovery harness) and
// artifacts/heldout-commitment.json (sha256 commitment, committed before round 1).
//   node harness/heldout.ts [--force]
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { simulate, validateLayout } from "../engine/reference.ts";
import { COLORS, ACTIONS, type Action, type Color, type Layout, type XY } from "../engine/types.ts";

if (existsSync("private/heldout.json") && !process.argv.includes("--force")) {
  console.error("private/heldout.json already exists; refusing to regenerate (use --force)");
  process.exit(1);
}

const seedHex = randomBytes(8).toString("hex");
let s = parseInt(seedHex.slice(0, 8), 16) >>> 0;
const rnd = () => {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (n: number) => Math.floor(rnd() * n);
const pick = <T,>(a: readonly T[]) => a[ri(a.length)];
const DV: Record<Action, XY> = { N: { x: 0, y: -1 }, S: { x: 0, y: 1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } };

function randomLayout(): Layout {
  const used = new Set<string>();
  const k = (x: number, y: number) => `${x},${y}`;
  const free = (): XY | null => {
    for (let i = 0; i < 200; i++) {
      const p = { x: ri(7), y: ri(7) };
      if (!used.has(k(p.x, p.y))) return p;
    }
    return null;
  };
  const take = (p: XY) => used.add(k(p.x, p.y));
  const l: Layout = { walls: [], lamps: [], glass: [], sensors: [], doors: [], player: { x: 0, y: 0 }, crates: [] };
  const beamCells: XY[][] = [];
  const nl = 1 + ri(3);
  for (let i = 0; i < nl; i++) {
    const p = free();
    if (!p) break;
    take(p);
    const dir = pick(ACTIONS);
    l.lamps.push({ ...p, color: pick(COLORS), dir });
    const cells: XY[] = [];
    for (let x = p.x + DV[dir].x, y = p.y + DV[dir].y; x >= 0 && y >= 0 && x < 7 && y < 7; x += DV[dir].x, y += DV[dir].y)
      cells.push({ x, y });
    beamCells.push(cells);
  }
  const onBeam = (): XY | null => {
    const cells = pick(beamCells).filter((c) => !used.has(k(c.x, c.y)));
    return cells.length ? pick(cells) : null;
  };
  const ng = ri(4);
  for (let i = 0; i < ng; i++) {
    const p = rnd() < 0.7 ? onBeam() : free();
    if (!p) continue;
    take(p);
    l.glass.push({ ...p, color: pick(COLORS) });
  }
  const npairs = ri(3);
  for (let i = 0; i < npairs; i++) {
    const sp = rnd() < 0.7 ? onBeam() : free();
    if (!sp) continue;
    take(sp);
    const dp = free();
    if (!dp) continue;
    take(dp);
    l.sensors.push({ id: `s${i + 1}`, ...sp });
    l.doors.push({ id: `d${i + 1}`, ...dp, color: pick(COLORS), sensor: `s${i + 1}` });
  }
  const nw = ri(5);
  for (let i = 0; i < nw; i++) {
    const p = free();
    if (!p) continue;
    take(p);
    l.walls.push(p);
  }
  // occupants may stand on glass/sensor/door, not on walls/lamps
  const blocked = new Set([...l.walls, ...l.lamps].map((p) => k(p.x, p.y)));
  const occ = new Set<string>();
  const freeOcc = (pref?: XY | null): XY | null => {
    if (pref && !blocked.has(k(pref.x, pref.y)) && !occ.has(k(pref.x, pref.y))) return pref;
    for (let i = 0; i < 200; i++) {
      const p = { x: ri(7), y: ri(7) };
      if (!blocked.has(k(p.x, p.y)) && !occ.has(k(p.x, p.y))) return p;
    }
    return null;
  };
  const nc = 1 + ri(3);
  for (let i = 0; i < nc; i++) {
    const cells = pick(beamCells);
    const p = freeOcc(rnd() < 0.7 && cells.length ? pick(cells) : null);
    if (!p) continue;
    occ.add(k(p.x, p.y));
    l.crates.push({ id: `c${i + 1}`, ...p });
  }
  // player often adjacent to a crate
  let pp: XY | null = null;
  if (l.crates.length && rnd() < 0.75) {
    const c = pick(l.crates);
    const d = DV[pick(ACTIONS)];
    pp = freeOcc({ x: c.x + d.x, y: c.y + d.y });
    if (pp && (pp.x < 0 || pp.y < 0 || pp.x > 6 || pp.y > 6)) pp = null;
  }
  pp = pp ?? freeOcc();
  l.player = pp!;
  return l;
}

function randomActions(l: Layout): Action[] {
  const n = 3 + ri(6);
  const out: Action[] = [];
  // bias: first move toward the nearest crate if adjacent
  for (const c of l.crates) {
    for (const a of ACTIONS) if (l.player.x + DV[a].x === c.x && l.player.y + DV[a].y === c.y && rnd() < 0.8) out.push(a);
  }
  while (out.length < n) out.push(rnd() < 0.4 && out.length ? out[out.length - 1] : pick(ACTIONS));
  return out.slice(0, n);
}

const cases: { id: string; kind: string; layout: Layout; actions: Action[] }[] = [];
let tries = 0;
while (cases.length < 40 && tries++ < 5000) {
  const l = randomLayout();
  if (validateLayout(l)) continue;
  cases.push({ id: `R${String(cases.length + 1).padStart(2, "0")}`, kind: "random", layout: l, actions: randomActions(l) });
}

// Hand-built edge cases (authored by the implementer who knows the rules; evaluation only).
const E = (): Layout => ({ walls: [], lamps: [], glass: [], sensors: [], doors: [], player: { x: 3, y: 6 }, crates: [] });
const edge: [string, Layout, Action[]][] = [];
{
  const l = E(); // glass then crate on same cell: recolour before stop; push lit crate
  l.lamps.push({ x: 0, y: 2, color: "white", dir: "E" });
  l.glass.push({ x: 3, y: 2, color: "blue" });
  l.crates.push({ id: "c1", x: 3, y: 2 });
  l.player = { x: 3, y: 3 };
  edge.push(["glass-crate-same-cell", l, ["N", "W", "N", "E", "E"]]);
}
{
  const l = E(); // last glass wins
  l.lamps.push({ x: 0, y: 4, color: "white", dir: "E" });
  l.glass.push({ x: 1, y: 4, color: "red" }, { x: 3, y: 4, color: "green" });
  l.sensors.push({ id: "s1", x: 5, y: 4 });
  l.doors.push({ id: "d1", x: 5, y: 1, color: "green", sensor: "s1" });
  l.crates.push({ id: "c1", x: 2, y: 5 });
  l.player = { x: 2, y: 6 };
  edge.push(["last-glass-wins-door", l, ["N", "E", "N", "N", "N", "E", "E", "E", "N"]]);
}
{
  const l = E(); // crate on sensor under beam; push it off, door closes
  l.lamps.push({ x: 3, y: 0, color: "red", dir: "S" });
  l.sensors.push({ id: "s1", x: 3, y: 3 });
  l.doors.push({ id: "d1", x: 6, y: 3, color: "red", sensor: "s1" });
  l.crates.push({ id: "c1", x: 3, y: 3 });
  l.player = { x: 2, y: 3 };
  edge.push(["crate-on-sensor-push", l, ["E", "E", "W", "W"]]);
}
{
  const l = E(); // crate on closed door slides out, player stays
  l.lamps.push({ x: 2, y: 0, color: "green", dir: "S" });
  l.sensors.push({ id: "s1", x: 6, y: 0 });
  l.doors.push({ id: "d1", x: 2, y: 4, color: "green", sensor: "s1" });
  l.crates.push({ id: "c1", x: 2, y: 4 });
  l.player = { x: 1, y: 4 };
  edge.push(["door-exit-crate", l, ["E", "E", "S", "E"]]);
}
{
  const l = E(); // two lamps overlap, set of colours; crates block each other (no chain)
  l.lamps.push({ x: 0, y: 3, color: "red", dir: "E" }, { x: 4, y: 0, color: "blue", dir: "S" });
  l.crates.push({ id: "c1", x: 2, y: 3 }, { id: "c2", x: 5, y: 3 });
  l.player = { x: 1, y: 3 };
  edge.push(["overlap-no-chain", l, ["E", "E", "W", "N", "E", "E", "S"]]);
}
{
  const l = E(); // player on door that closes, then leaves; cannot re-enter
  l.lamps.push({ x: 0, y: 1, color: "white", dir: "E" });
  l.sensors.push({ id: "s1", x: 4, y: 1 });
  l.doors.push({ id: "d1", x: 3, y: 4, color: "white", sensor: "s1" });
  l.crates.push({ id: "c1", x: 2, y: 2 });
  l.player = { x: 3, y: 4 };
  edge.push(["occupied-door-closes", l, ["N", "N", "W", "N", "S", "S", "E", "S"]]);
}
{
  const l = E(); // lit crate slides into shadow behind wall; unlit crate blocks
  l.lamps.push({ x: 6, y: 5, color: "blue", dir: "W" });
  l.walls.push({ x: 0, y: 5 }, { x: 3, y: 2 });
  l.crates.push({ id: "c1", x: 4, y: 5 }, { id: "c2", x: 3, y: 3 });
  l.player = { x: 5, y: 5 };
  edge.push(["slide-into-shadow", l, ["W", "W", "N", "W", "N", "E", "N"]]);
}
{
  const l = E(); // closed door blocks slide; lamp beam blocked by lamp
  l.lamps.push({ x: 0, y: 0, color: "red", dir: "S" }, { x: 0, y: 6, color: "green", dir: "N" });
  l.sensors.push({ id: "s1", x: 6, y: 6 });
  l.doors.push({ id: "d1", x: 0, y: 1, color: "red", sensor: "s1" });
  l.crates.push({ id: "c1", x: 0, y: 4 });
  l.player = { x: 0, y: 5 };
  edge.push(["door-blocks-slide", l, ["N", "E", "N", "W", "N"]]);
}
edge.forEach(([kind, layout, actions], i) => {
  const err = validateLayout(layout);
  if (err) throw new Error(`edge ${kind}: ${err}`);
  cases.push({ id: `E${i + 1}`, kind, layout, actions });
});

const traces = cases.map((c) => ({ ...c, observations: simulate(c.layout, c.actions).observations }));
const body = JSON.stringify({ version: 1, generator: "harness/heldout.ts", count: traces.length, traces });
const sha256 = createHash("sha256").update(body).digest("hex");
mkdirSync("private", { recursive: true });
mkdirSync("artifacts", { recursive: true });
writeFileSync("private/heldout.json", body);
writeFileSync("private/heldout-seed.txt", seedHex + "\n");
writeFileSync(
  "artifacts/heldout-commitment.json",
  JSON.stringify(
    {
      sha256,
      count: traces.length,
      random: traces.filter((t) => t.kind === "random").length,
      edge: traces.filter((t) => t.kind !== "random").length,
      createdAt: new Date().toISOString(),
      note: "SHA-256 of the exact bytes of private/heldout.json, committed before the first discovery call. The file is revealed only after the replica is frozen.",
    },
    null,
    2,
  ) + "\n",
);
const crateMoves = traces.filter((t) => t.observations.some((o, i) => i > 0 && JSON.stringify(o.crates.map((c) => [c.x, c.y])) !== JSON.stringify(t.observations[i - 1].crates.map((c) => [c.x, c.y])))).length;
const doorOpen = traces.filter((t) => t.observations.some((o) => o.doors.some((d) => d.open))).length;
console.log(`heldout: ${traces.length} traces, sha256=${sha256}; with crate motion ${crateMoves}, with an open door ${doorOpen}`);
