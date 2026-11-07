// Display-only formatting of the model's submitted code (it submitted minified one-line JS).
// Whitespace/formatting changes only, via Prettier; every hash shown refers to the EXACT
// submitted source in artifacts/discovery/<run>.json, which is what was executed.
//   node harness/format-code.ts --run-id run-01
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as prettier from "prettier";

const i = process.argv.indexOf("--run-id");
const RUN_ID = i >= 0 ? process.argv[i + 1] : "run-01";
const disc = JSON.parse(readFileSync(`artifacts/discovery/${RUN_ID}.json`, "utf8"));
const out: Record<string, string> = {};
for (const v of disc.codeVersions as { version: number; sha256: string; source: string }[]) {
  try {
    out[v.version] = await prettier.format(v.source, { parser: "babel", printWidth: 88 });
  } catch (e) {
    out[v.version] = v.source; // keep verbatim if it cannot be parsed
    console.warn(`v${v.version}: not formatted (${(e as Error).message.split("\n")[0]})`);
  }
}
mkdirSync("artifacts/code-display", { recursive: true });
writeFileSync(
  `artifacts/code-display/${RUN_ID}.json`,
  JSON.stringify({ runId: RUN_ID, note: "Prettier-formatted for reading only; executed/hashed source is the verbatim submission.", formatted: out }, null, 1),
);
console.log(`formatted ${Object.keys(out).length} versions -> artifacts/code-display/${RUN_ID}.json`);
