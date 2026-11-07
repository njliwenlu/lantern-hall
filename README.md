# Lantern Hall: Museum of Impossible Physics

A software-archaeology experiment. We wrote a small deterministic 7×7 world (lamps, coloured glass,
crates, sensors, doors) and withheld its source. A language model with **no tools** could only ask
for experiments and read the original engine's observations. From those it wrote an executable
JavaScript reconstruction. We froze that reconstruction and compared it with the original on a
held-out test set whose hash was committed before discovery began.

**Measured result (run-01):** the frozen reconstruction (submission v6) reproduced **48 of 48**
sealed held-out traces exactly: **331/331** observations identical, field by field, with 0 runtime errors.
The held-out file's SHA-256 matched the commitment made before the first model call.

What this claims: in one recorded run, a tool-free model that saw only the schema and real
observations wrote code that matched the hidden engine on these 48 unseen traces. What it does not
claim: general equivalence. See [Limitations](#limitations).

## The site

A static single-page app (Vite + React, relative `base: "./"`). It has no backend, no model API
and no server-side code execution.

- **I · Discover** replays the recorded run: each round's verbatim notes and hypotheses (including
  rejected ones), and every experiment the model requested, shown exactly as the original engine
  returned it. Labelled *Recorded discovery*.
- **II · Reconstruct** shows every submitted code version with a line diff between versions, the
  validation feedback the model saw, and the sealed held-out result. Each trace can be opened to
  compare the two engines step by step and see any field differences.
- **III · Predict** is the live duel. Pick a preset room or edit one by clicking cells, then queue up
  to 12 moves (arrow keys/WASD or the on-screen pad). **Seal** runs the frozen generated replica in
  QuickJS (WASM) in the browser and shows a SHA-256 of its whole predicted trace. **Reveal** then
  runs the original engine and compares every observation.
- **Evidence** drawer: process flags, the init event's tool list, hashes, per-round timing and
  cost, and the raw replies.

Presentation and replay hooks (for recording): `?present=1` gives a fixed 1920×1080 stage scaled to
the window. URL parameters `tab`, `round`, `exp`, `step`, `version`, `trace`, `preset`, `actions`,
`autoplay=seal`, `revealDelay`, `speed` and `clock=manual` (disables timers) set the starting state.
`window.lantern` exposes `setTab`, `discover.*`, `reconstruct.*` and `predict.{seal,reveal,reset,setStep,loadPreset}`.
See `src/hooks.ts`.

## Commands

Requires Node ≥ 22.18 (TypeScript harness files run with Node's built-in type stripping).

```bash
npm install
npm run dev          # http://127.0.0.1:5173
npm run build        # static site in dist/ (index.html + assets/), deployable to any static host
npm run preview      # serve dist/ locally

npm run smoke        # ad-hoc engine + QuickJS boundary smoke (prints OK/FAIL lines)
npm run heldout      # generate sealed corpus + commitment (refuses to overwrite)
npm run discover -- --rounds 10 --run-id run-02    # a NEW blind discovery run (needs an authenticated `claude` CLI)
npm run evaluate -- --run-id run-01                # sealed evaluation of a frozen replica
node harness/format-code.ts --run-id run-01        # display-only formatting of submitted code
```

`npm run evaluate` needs `private/heldout.json`, which is not in the repository (the revealed copy is
`artifacts/heldout.json`, byte-identical). To re-verify from a clone, compare the hash yourself:
`shasum -a 256 artifacts/heldout.json` should print `f50933a2…2354`, the value committed in
`artifacts/heldout-commitment.json`.

## Source isolation (how discovery was run)

`harness/discover.ts` runs each round as a **fresh** Claude Code CLI process (`claude-opus-5-5`, CLI 2.1.319):

```
claude -p --model claude-opus-5-5 --output-format stream-json --verbose --safe-mode
       --strict-mcp-config --tools "" --no-session-persistence --disable-slash-commands
       --system-prompt <system part of harness/prompt-template.md>
```

- Working directory: a new empty `mkdtemp` directory per round, deleted afterwards.
- Environment: rebuilt from scratch with only `PATH HOME USER LOGNAME SHELL LANG LC_ALL TERM TMPDIR`.
  `CLAUDECODE`, all `CLAUDE_CODE_*` and other inherited variables are dropped.
- The prompt is stdin only: `harness/schema.md` (the interface, with no rules) plus the committed
  template, the model's own previous experiments with the original engine's actual observations,
  its previous hypotheses and code, and validation of that code on its own experiments. The model
  never received engine source, the held-out corpus, or any tool.
- Evidence recorded in `artifacts/discovery/run-01.json`: the init event of every round shows
  `tools: []`, `mcp_servers: []`, `skills: []`, `slash_commands: []`. Every round had 0 tool-use
  events and `num_turns: 1`.
- Disclosure: even in safe mode the init event still *lists* installed plugin names and built-in
  agent type names. With an empty tool list none of them can be invoked. The public trace keeps the
  names and strips local paths.
- Raw stream logs and prompts are kept in git-ignored `private/` because they contain session ids
  and local paths. The public trace is sanitized from them and keeps the prompt hashes and sizes,
  the verbatim replies, all experiments and observations, and all code versions.

Schema field names (`lit`, `open`, `light`) and the lamp's `dir` field name concepts but do not state
rules. The schema says that layouts must be valid and what an observation contains. It does not say
how light, pushing or doors behave.

### Timeline (actual, PST, 2026-11-07)

| time | event |
|---|---|
| 12:05:13 | held-out corpus generated (48 traces), SHA-256 written to `artifacts/heldout-commitment.json` |
| 12:06:36 | git commit `5738600`: engine, harness, schema, prompt template, held-out commitment |
| 12:06:39 | discovery round 1 starts |
| 12:12:25 | round 10 ends; the model marks its code final (v6) |
| 12:12:46 | git commit `5e82cab`: discovery trace + frozen replica, **before** the held-out reveal |
| ≈12:13 | first sealed evaluation, 48/48 (re-run at 12:16:55 with identical result) |

The rules are public **now** (`engine/reference.ts`). They were withheld from the model during the
recorded run.

## Run-01 facts

- 10 rounds, 36 experiments (0 rejected), ≈346 s of model time, reported cost ≈ $2.95.
- 6 code submissions, **5 distinct**: v6 (round 10) is byte-identical to v5 (round 8).
- Hypotheses the model rejected itself, verbatim in the trace: *H6 "Pushing requires the player to
  stand in light"* (rejected in round 3), and *H11 "A crate on a closed door cannot be pushed"*
  (proposed in round 7, rejected in round 8 after the experiment `crateOnClosedDoor`).
- Held-out scores by version (computed after the run, never shown to the model): v1 17/48,
  v2 35/48, v3 46/48, v4 47/48, v5 48/48, v6 48/48.

## Rules of the original engine (public after discovery)

Terrain: floor, wall, lamp, glass, sensor, door. Occupants: player, crate. Walls and lamps block
movement and light. Each lamp shines in one direction (`dir`), starting at the adjacent cell. Glass
can be walked on. A beam entering glass takes the glass colour (the last glass wins), and this
happens *before* a crate in that same cell stops the beam. Rays stop before walls, lamps and the
grid edge. They enter a crate's cell, light the crate, and stop. The player and doors are
transparent to light. Colours on a cell form a set and never blend. A door is open exactly when its
linked sensor's colour set contains the door's colour. Each turn: compute light and doors, move
using those start-of-turn states, recompute, and observe. The player moves one cell. An unlit crate
blocks. A lit crate slides to the last free cell (with no chain pushes), and the player takes the
crate's original cell only if the crate moved and that cell is not a closed door. Occupants may
leave a closed door but never enter one.

## Evaluation scope

- Corpus: 40 seeded-random valid layouts, biased toward beams, glass, crates and sensors, with 3–8
  random moves each, plus 8 hand-written edge cases (glass and crate in the same cell, last glass
  wins, crate on a sensor, crate leaving a closed door, overlapping colours with no chain push, a
  door closing on the player, a slide into shadow, a closed door blocking a slide). Only 10/48
  traces contain crate motion and 8/48 an open door, so the random part leans toward light
  propagation.
- Comparator (`engine/compare.ts`): strict recursive equality of the full observation. It checks
  player, every crate's id, position and lit flag, all 49 light cells, sensor light, door states,
  and array order, lengths and trace length.
- Feedback vs final: during the run, the validation feedback on the model's *own* experiments used an
  earlier, more lenient comparator. Before the final evaluation it was replaced by the strict one.
  The held-out result and the live duel use the strict comparator.

## Sandbox for generated code

`engine/sandbox-core.ts` runs model code in `quickjs-emscripten` (WASM) with a fresh runtime per run.
Limits: 2 s via an interrupt handler, 32 MB of memory, a 512 KB stack, and 400 K characters of output.
There are no host bindings, so no filesystem, network, timers, console or module loader. `Date` is
deleted and `Math.random` throws. `npm run smoke` checks each of these. Known quirk: after an
out-of-memory error, QuickJS cannot free that runtime cleanly, so the host discards the whole WASM
module and loads a new one. Host stack exhaustion is caught the same way. Node `vm` is not used.

## Limitations

- One exhibit, one recorded discovery run, one model. 48 traces is a small test. Exact agreement on
  it is evidence, not proof of equivalence.
- The audience presets in `src/presets.ts` were written after discovery by the implementer, who knows
  the rules. Rooms you edit in the browser are new, but the site cannot prove that they differ from
  everything the model saw.
- The website bundles the reference engine (to run the duel), so the rules are public now.
- The implementation author (also a Claude model) knows the rules. It wrote the engine, harness,
  presets and edge cases, but not the reconstruction. Every line of the replica comes from the
  isolated discovery process (`artifacts/replica/run-01.js` = the v6 `source` in the trace).
- The code viewer shows Prettier-formatted source for readability (the model submitted single-line
  minified JS). The hashes and the executed code are the verbatim submission.

## Repository map

```
engine/       types.ts (contract), reference.ts (original engine), compare.ts, sandbox-core.ts
harness/      schema.md + prompt-template.md (all the model was told), discover.ts, heldout.ts,
              evaluate.ts, format-code.ts, smoke.ts, sandbox-node.ts
artifacts/    heldout-commitment.json, heldout.json (revealed), discovery/run-01.json,
              replica/run-01.js (+ .frozen.json), evaluation/run-01.json, code-display/run-01.json
src/          the static exhibit (React)
private/      git-ignored raw prompts/streams/logs and the held-out seed
scripts/, .openai/  left over from the hosting starter; not used by the static build
```
