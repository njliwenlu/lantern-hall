// Lantern Hall — REFERENCE ENGINE (the "original" software being excavated).
// Withheld from the discovery model during the recorded run. Public afterwards.
//
// Rules (FINAL_PLAN):
//  * terrain: floor / wall / lamp / glass / sensor / door; occupants: player / crate.
//  * walls & lamps block movement and rays. Glass is traversable.
//  * each lamp emits its colour in ONE direction (its `dir`), starting from the adjacent
//    cell. On entering glass the beam takes the glass colour (last glass wins), and this
//    happens BEFORE a crate in that same cell stops it. A ray stops before walls, lamps
//    and bounds, enters a crate cell (lighting it) then stops. The player is transparent.
//    Doors always transmit light. Colours on a cell are a set, never blended.
//  * a door is open iff its linked sensor's light set contains the door's colour.
//  * turn: light+doors from start state -> move (using start-of-turn doors and light)
//    -> recompute light+doors -> observe.
//  * player moves one cell. Adjacent unlit crate blocks. Adjacent lit crate slides to the
//    last free cell in that direction (no chain push); the player takes the crate's original
//    cell only if the crate moved >=1 cell AND that cell is enterable (amendment: a lit crate
//    on a closed door may slide out, but the player stays put because a closed door is never
//    entered). Free = in bounds, not wall/lamp, not a closed
//    door (start of turn), no crate. Occupants may leave a closed door but never enter one.

import {
  SIZE,
  COLORS,
  COLOR_LETTER,
  type Action,
  type Color,
  type Layout,
  type Observation,
  type Trace,
  type XY,
} from "./types.ts";

const DIRS: Record<Action, XY> = {
  N: { x: 0, y: -1 },
  S: { x: 0, y: 1 },
  E: { x: 1, y: 0 },
  W: { x: -1, y: 0 },
};

type Terrain = "floor" | "wall" | "lamp" | "glass" | "sensor" | "door";
interface TerrainCell {
  kind: Terrain;
  color?: Color;
  id?: string;
  sensor?: string;
}

interface World {
  terrain: TerrainCell[][]; // [y][x]
  lamps: { x: number; y: number; color: Color; dir: Action }[];
  sensorIds: string[];
  doors: { id: string; x: number; y: number; color: Color; sensor: string }[];
  sensorPos: Record<string, XY>;
}

interface Dynamic {
  player: XY;
  crates: { id: string; x: number; y: number }[];
}

const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
const key = (x: number, y: number) => `${x},${y}`;

export function validateLayout(layout: unknown): string | null {
  try {
    const l = layout as Layout;
    if (!l || typeof l !== "object") return "layout must be an object";
    for (const f of ["walls", "lamps", "glass", "sensors", "doors", "crates"] as const) {
      if (!Array.isArray(l[f])) return `${f} must be an array`;
    }
    if (!l.player || typeof l.player !== "object") return "player required";
    const isInt = (n: unknown) => Number.isInteger(n);
    const terrainAt = new Set<string>();
    const occAt = new Set<string>();
    const ids = new Set<string>();
    const checkPos = (p: XY, what: string) => {
      if (!isInt(p?.x) || !isInt(p?.y) || !inBounds(p.x, p.y))
        throw new Error(`${what} out of bounds`);
    };
    const placeTerrain = (p: XY, what: string) => {
      checkPos(p, what);
      const k = key(p.x, p.y);
      if (terrainAt.has(k)) throw new Error(`${what} overlaps other terrain at ${k}`);
      terrainAt.add(k);
    };
    const checkColor = (c: unknown, what: string) => {
      if (!COLORS.includes(c as Color)) throw new Error(`${what} has invalid color`);
    };
    const checkId = (id: unknown, what: string) => {
      if (typeof id !== "string" || !id || id.length > 24) throw new Error(`${what} needs string id`);
      if (ids.has(id)) throw new Error(`duplicate id ${id}`);
      ids.add(id);
    };
    const blocked = new Set<string>();
    for (const w of l.walls) {
      placeTerrain(w, "wall");
      blocked.add(key(w.x, w.y));
    }
    for (const m of l.lamps) {
      placeTerrain(m, "lamp");
      checkColor(m.color, "lamp");
      if (!["N", "S", "E", "W"].includes((m as { dir: string }).dir)) throw new Error("lamp needs dir N/S/E/W");
      blocked.add(key(m.x, m.y));
    }
    for (const g of l.glass) {
      placeTerrain(g, "glass");
      checkColor(g.color, "glass");
    }
    for (const s of l.sensors) {
      placeTerrain(s, "sensor");
      checkId(s.id, "sensor");
    }
    const sensorIds = new Set(l.sensors.map((s) => s.id));
    const linked = new Set<string>();
    for (const d of l.doors) {
      placeTerrain(d, "door");
      checkId(d.id, "door");
      checkColor(d.color, "door");
      if (!sensorIds.has(d.sensor)) throw new Error(`door ${d.id} links unknown sensor`);
      if (linked.has(d.sensor)) throw new Error(`sensor ${d.sensor} linked twice`);
      linked.add(d.sensor);
    }
    if (linked.size !== sensorIds.size) throw new Error("every sensor must link exactly one door");
    const placeOcc = (p: XY, what: string) => {
      checkPos(p, what);
      const k = key(p.x, p.y);
      if (blocked.has(k)) throw new Error(`${what} on wall/lamp`);
      if (occAt.has(k)) throw new Error(`${what} overlaps occupant`);
      occAt.add(k);
    };
    placeOcc(l.player, "player");
    for (const c of l.crates) {
      placeOcc(c, "crate");
      checkId(c.id, "crate");
    }
    if (l.walls.length + l.lamps.length + l.glass.length + l.sensors.length + l.doors.length > 49)
      throw new Error("too many cells");
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

function buildWorld(l: Layout): World {
  const terrain: TerrainCell[][] = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => ({ kind: "floor" as Terrain })),
  );
  for (const w of l.walls) terrain[w.y][w.x] = { kind: "wall" };
  for (const m of l.lamps) terrain[m.y][m.x] = { kind: "lamp", color: m.color };
  for (const g of l.glass) terrain[g.y][g.x] = { kind: "glass", color: g.color };
  const sensorPos: Record<string, XY> = Object.create(null);
  for (const s of l.sensors) {
    terrain[s.y][s.x] = { kind: "sensor", id: s.id };
    sensorPos[s.id] = { x: s.x, y: s.y };
  }
  for (const d of l.doors)
    terrain[d.y][d.x] = { kind: "door", id: d.id, color: d.color, sensor: d.sensor };
  return {
    terrain,
    lamps: l.lamps.map((m) => ({ ...m })),
    sensorIds: l.sensors.map((s) => s.id),
    doors: l.doors.map((d) => ({ ...d })),
    sensorPos,
  };
}

function computeLight(world: World, dyn: Dynamic): Set<Color>[][] {
  const light = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => new Set<Color>()));
  const crateAt = new Set(dyn.crates.map((c) => key(c.x, c.y)));
  for (const lamp of world.lamps) {
    {
      const d = DIRS[lamp.dir];
      let color = lamp.color;
      let x = lamp.x + d.x;
      let y = lamp.y + d.y;
      while (inBounds(x, y)) {
        const t = world.terrain[y][x];
        if (t.kind === "wall" || t.kind === "lamp") break;
        if (t.kind === "glass") color = t.color!; // recolour first...
        light[y][x].add(color);
        if (crateAt.has(key(x, y))) break; // ...then a crate stops the beam
        x += d.x;
        y += d.y;
      }
    }
  }
  return light;
}

function computeDoors(world: World, light: Set<Color>[][]): Record<string, boolean> {
  const open: Record<string, boolean> = Object.create(null);
  for (const d of world.doors) {
    const s = world.sensorPos[d.sensor];
    open[d.id] = light[s.y][s.x].has(d.color);
  }
  return open;
}

function letters(set: Set<Color>): string {
  return [...set]
    .map((c) => COLOR_LETTER[c])
    .sort()
    .join("");
}

function observe(world: World, dyn: Dynamic): Observation {
  const light = computeLight(world, dyn);
  const doors = computeDoors(world, light);
  return {
    player: { x: dyn.player.x, y: dyn.player.y },
    crates: dyn.crates.map((c) => ({ id: c.id, x: c.x, y: c.y, lit: light[c.y][c.x].size > 0 })),
    light: light.map((row) => row.map(letters)),
    sensors: world.sensorIds.map((id) => {
      const p = world.sensorPos[id];
      return { id, light: letters(light[p.y][p.x]) };
    }),
    doors: world.doors.map((d) => ({ id: d.id, open: doors[d.id] })),
  };
}

function move(world: World, dyn: Dynamic, action: Action): Dynamic {
  const light = computeLight(world, dyn);
  const doors = computeDoors(world, light);
  const d = DIRS[action];
  const crateIdx = new Map(dyn.crates.map((c, i) => [key(c.x, c.y), i]));
  const solid = (x: number, y: number) => {
    if (!inBounds(x, y)) return true;
    const k = world.terrain[y][x].kind;
    return k === "wall" || k === "lamp";
  };
  const closedDoor = (x: number, y: number) => {
    const t = world.terrain[y][x];
    return t.kind === "door" && !doors[t.id!];
  };
  const enterable = (x: number, y: number) => !solid(x, y) && !closedDoor(x, y);
  const tx = dyn.player.x + d.x;
  const ty = dyn.player.y + d.y;
  const next: Dynamic = { player: { ...dyn.player }, crates: dyn.crates.map((c) => ({ ...c })) };
  if (solid(tx, ty)) return next;
  const ci = crateIdx.get(key(tx, ty));
  if (ci === undefined) {
    if (closedDoor(tx, ty)) return next;
    next.player = { x: tx, y: ty };
    return next;
  }
  if (light[ty][tx].size === 0) return next; // unlit crate blocks
  let cx = tx;
  let cy = ty;
  while (enterable(cx + d.x, cy + d.y) && !crateIdx.has(key(cx + d.x, cy + d.y))) {
    cx += d.x;
    cy += d.y;
  }
  if (cx === tx && cy === ty) return next; // zero-length slide: nothing moves
  next.crates[ci] = { ...next.crates[ci], x: cx, y: cy };
  // the player follows into the vacated cell unless it is a closed door (no entry)
  if (!closedDoor(tx, ty)) next.player = { x: tx, y: ty };
  return next;
}

/** Full deterministic simulation. Throws on invalid layout or action. */
export function simulate(layout: Layout, actions: Action[]): Trace {
  const err = validateLayout(layout);
  if (err) throw new Error(`invalid layout: ${err}`);
  const world = buildWorld(layout);
  let dyn: Dynamic = {
    player: { x: layout.player.x, y: layout.player.y },
    crates: layout.crates.map((c) => ({ id: c.id, x: c.x, y: c.y })),
  };
  const observations = [observe(world, dyn)];
  for (const a of actions) {
    if (!Object.hasOwn(DIRS, a)) throw new Error(`invalid action ${String(a)}`);
    dyn = move(world, dyn, a);
    observations.push(observe(world, dyn));
  }
  return { layout, actions: [...actions], observations };
}
