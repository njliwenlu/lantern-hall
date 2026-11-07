# EvoArena: Lantern Hall

### [Try the live demo →](https://njliwenlu.github.io/lantern-hall/)

*A museum of impossible physics.* An AI discovers hidden rules through experiments, then writes an executable reconstruction of the world.

## 60-second demo pitch

**0–5s · The challenge**  
“We hid a game’s source code. Could an AI discover its rules?”

**5–20s · One discovery**  
“Its guess: the visitor—the character it moves—needs light to push. Visitor lit, crate dark: the push fails. Visitor dark, crate lit: the crate slides. It rejected that hypothesis in the next round.”

**20–26s · Six more experiments**  
“Those were two of thirty-six experiments. Here are six more.”

**26–31s · Generated code**  
“Five distinct implementations. We froze the final code.”

**31–45s · Predict, seal, compare**  
“Now challenge that reconstruction with another room. We seal its prediction before running the original. Reveal both. Watch the two engines side by side. Seven of seven observations match, including the starting state.”

**45–56s · Held-out evidence**  
“Forty-eight held-out tests, scored afterward—never feedback for the AI. All three hundred thirty-one observations matched, including starting states. Here’s one of those tests.”

**56–60s · Close**  
“One small world, not general proof. Hidden rules, rebuilt as code.”

*Read the quoted words aloud. Times are rounded cues. The video shows selected discovery experiments and one held-out replay; the results grid covers all 48 tests.*

## Run locally

Requires Node 22.18+.

```sh
npm install
npm run dev
```

[Technical notes & evidence](TECHNICAL_NOTES.md)
