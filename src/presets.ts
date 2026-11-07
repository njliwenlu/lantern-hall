// Audience rooms for the live prediction duel. Authored after discovery for the exhibit;
// they are NOT part of the sealed held-out corpus and were never shown to the model.
import type { Action, Layout } from "../engine/types.ts";

export interface Preset {
  id: string;
  name: string;
  blurb: string;
  layout: Layout;
  actions: Action[];
}

const row4walls = [0, 1, 2, 4, 5, 6].map((x) => ({ x, y: 4 }));

export const PRESETS: Preset[] = [
  {
    id: "red-gate",
    name: "The Red Gate",
    blurb: "A crate swallows a red beam. Move it, and the far sensor may wake.",
    layout: {
      walls: row4walls,
      lamps: [{ x: 0, y: 1, color: "red", dir: "E" }],
      glass: [],
      sensors: [{ id: "s1", x: 5, y: 1 }],
      doors: [{ id: "d1", x: 3, y: 4, color: "red", sensor: "s1" }],
      player: { x: 2, y: 2 },
      crates: [{ id: "c1", x: 2, y: 1 }],
    },
    actions: ["N", "S", "S", "E", "S", "S"],
  },
  {
    id: "prism",
    name: "Prism Corridor",
    blurb: "White light crosses two panes of glass. A crate rests on the second pane.",
    layout: {
      walls: [{ x: 6, y: 0 }, { x: 0, y: 0 }],
      lamps: [{ x: 0, y: 3, color: "white", dir: "E" }],
      glass: [
        { x: 2, y: 3, color: "blue" },
        { x: 4, y: 3, color: "green" },
      ],
      sensors: [{ id: "s1", x: 6, y: 3 }],
      doors: [{ id: "d1", x: 5, y: 1, color: "green", sensor: "s1" }],
      player: { x: 4, y: 4 },
      crates: [{ id: "c1", x: 4, y: 3 }],
    },
    actions: ["N", "E", "N", "N"],
  },
  {
    id: "shadow",
    name: "Into the Shadow",
    blurb: "A green column of light, two crates, and a push that runs out of light.",
    layout: {
      walls: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 5, y: 2 }],
      lamps: [{ x: 3, y: 6, color: "green", dir: "N" }],
      glass: [],
      sensors: [],
      doors: [],
      player: { x: 2, y: 4 },
      crates: [
        { id: "c1", x: 3, y: 4 },
        { id: "c2", x: 3, y: 1 },
      ],
    },
    actions: ["E", "N", "N", "N", "E", "E"],
  },
  {
    id: "two-colours",
    name: "Two Colours, One Sensor",
    blurb: "Red and blue meet on one plate. Two doors listen for different colours.",
    layout: {
      walls: [{ x: 6, y: 6 }],
      lamps: [
        { x: 0, y: 2, color: "red", dir: "E" },
        { x: 4, y: 6, color: "blue", dir: "N" },
      ],
      glass: [],
      sensors: [
        { id: "s1", x: 4, y: 2 },
        { id: "s2", x: 6, y: 2 },
      ],
      doors: [
        { id: "d1", x: 2, y: 5, color: "blue", sensor: "s1" },
        { id: "d2", x: 2, y: 4, color: "red", sensor: "s2" },
      ],
      player: { x: 5, y: 4 },
      crates: [{ id: "c1", x: 4, y: 4 }],
    },
    actions: ["W", "W", "S", "W", "W"],
  },
];

export const emptyLayout = (): Layout => ({
  walls: [],
  lamps: [],
  glass: [],
  sensors: [],
  doors: [],
  player: { x: 3, y: 6 },
  crates: [],
});
