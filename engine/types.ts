// Lantern Hall — shared contract types. This file is the DISCLOSED interface:
// the discovery model sees an equivalent JSON schema (see harness/schema-text.ts),
// never the reference rules in engine/reference.ts.

export const SIZE = 7;
export const COLORS = ["white", "red", "green", "blue"] as const;
export type Color = (typeof COLORS)[number];
export type Action = "N" | "S" | "E" | "W";
export const ACTIONS: Action[] = ["N", "S", "E", "W"];

export interface XY {
  x: number;
  y: number;
}
export interface ColoredCell extends XY {
  color: Color;
}
export interface Lamp extends ColoredCell {
  /** a lamp shines in exactly one direction */
  dir: Action;
}
export interface Sensor extends XY {
  id: string;
}
export interface Door extends XY {
  id: string;
  color: Color;
  sensor: string;
}
export interface Crate extends XY {
  id: string;
}

export interface Layout {
  walls: XY[];
  lamps: Lamp[];
  glass: ColoredCell[];
  sensors: Sensor[];
  doors: Door[];
  player: XY;
  crates: Crate[];
}

/** Light letters: w=white r=red g=green b=blue, sorted alphabetically ("bgrw"). */
export interface Observation {
  player: XY;
  crates: { id: string; x: number; y: number; lit: boolean }[];
  /** light[y][x] = string of colour letters present on that cell, "" if dark */
  light: string[][];
  sensors: { id: string; light: string }[];
  doors: { id: string; open: boolean }[];
}

export interface Trace {
  layout: Layout;
  actions: Action[];
  /** observations[0] = after reset, observations[i] = after actions[i-1] */
  observations: Observation[];
}

export const COLOR_LETTER: Record<Color, string> = {
  white: "w",
  red: "r",
  green: "g",
  blue: "b",
};
