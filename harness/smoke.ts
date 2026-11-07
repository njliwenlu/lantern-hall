// Ad-hoc end-to-end smoke: reference engine scenarios + QuickJS boundary behaviour.
// Not a unit suite; prints observations for a human to eyeball.  node harness/smoke.ts
import { simulate } from "../engine/reference.ts";
import { runBounded, runCandidate } from "../engine/sandbox-core.ts";
import { quickjs } from "./sandbox-node.ts";
import type { Layout } from "../engine/types.ts";

const base = (): Layout => ({ walls: [], lamps: [], glass: [], sensors: [], doors: [], player: { x: 0, y: 6 }, crates: [] });
const show = (name: string, ok: boolean, extra = "") => console.log(`${ok ? "OK  " : "FAIL"} ${name} ${extra}`);

// 1 directional lamp, glass recolour before crate stop
{
  const l = base();
  l.lamps.push({ x: 0, y: 0, color: "white", dir: "E" });
  l.glass.push({ x: 2, y: 0, color: "red" });
  l.crates.push({ id: "c1", x: 2, y: 0 });
  const o = simulate(l, []).observations[0];
  show("recolour-before-stop", o.light[0].join("|") === "|w|r||||" && o.crates[0].lit, o.light[0].join("|"));
  show("directional (nothing south)", o.light[1][0] === "");
}
// 2 lit crate slides to wall, player takes origin
{
  const l = base();
  l.lamps.push({ x: 3, y: 0, color: "green", dir: "S" });
  l.crates.push({ id: "c1", x: 3, y: 3 });
  l.player = { x: 2, y: 3 };
  l.walls.push({ x: 6, y: 3 });
  const t = simulate(l, ["E"]).observations[1];
  show("lit slide", t.crates[0].x === 5 && t.player.x === 3 && !t.crates[0].lit, JSON.stringify(t.crates[0]));
}
// 3 crate on closed door slides out, player stays outside
{
  const l = base();
  l.lamps.push({ x: 3, y: 0, color: "red", dir: "S" });
  l.sensors.push({ id: "s1", x: 6, y: 6 });
  l.doors.push({ id: "d1", x: 3, y: 3, color: "red", sensor: "s1" });
  l.crates.push({ id: "c1", x: 3, y: 3 });
  l.player = { x: 2, y: 3 };
  const t = simulate(l, ["E"]).observations;
  show("door-exit crate, player stays", t[1].crates[0].x === 6 && t[1].player.x === 2 && !t[0].doors[0].open, JSON.stringify(t[1].player));
}
// 4 sensor opens door; door transmits light
{
  const l = base();
  l.lamps.push({ x: 0, y: 2, color: "blue", dir: "E" });
  l.doors.push({ id: "d1", x: 2, y: 2, color: "blue", sensor: "s1" });
  l.sensors.push({ id: "s1", x: 4, y: 2 });
  const o = simulate(l, []).observations[0];
  show("sensor->door open", o.doors[0].open && o.sensors[0].light === "b");
}
// 5 invalid layout
try {
  const l = base();
  l.crates.push({ id: "c1", x: 0, y: 6 });
  simulate(l, []);
  show("invalid rejected", false);
} catch (e) {
  show("invalid rejected", true, (e as Error).message);
}

const Q = await quickjs();
const r1 = runBounded(Q, "while(true){}", "1", { timeMs: 300, memoryBytes: 16 << 20, stackBytes: 256 << 10, outputChars: 1000 });
show("infinite loop interrupted", !r1.ok, `${r1.error} ${r1.ms.toFixed(0)}ms`);
const r2 = runBounded(Q, "", "Math.random()");
show("Math.random disabled", !r2.ok, r2.error);
const r3 = runBounded(Q, "", "typeof Date + typeof require + typeof fetch + typeof process + typeof std + typeof os");
show("no Date/require/fetch/process/std/os", r3.ok && r3.value === "undefinedundefinedundefinedundefinedundefinedundefined", String(r3.value));
const r4 = runBounded(Q, "const a=[]; while(true) a.push(new Array(1e5).fill(1));", "1", { timeMs: 5000, memoryBytes: 8 << 20, stackBytes: 256 << 10, outputChars: 1000 });
show("memory limit", !r4.ok, r4.error);
const Q2 = await quickjs(true);
const r5 = runBounded(Q2, "", "(function f(){return f()})()");
show("stack limit", !r5.ok, r5.error);
const r6 = runBounded(Q2, "", "'x'.repeat(500000)");
show("output limit", !r6.ok, r6.error);
const r7 = runBounded(Q2, "", "import('fs')");
show("no module loader (dynamic import)", !r7.ok || JSON.stringify(r7.value) === "{}", String(r7.error ?? JSON.stringify(r7.value)));
const r8 = runCandidate(Q2, "function simulate(l,a){ return [{player:l.player}].concat(a.map(()=>({player:l.player}))); }", base(), ["N"]);
show("candidate contract", r8.ok && Array.isArray(r8.value) && (r8.value as unknown[]).length === 2);
