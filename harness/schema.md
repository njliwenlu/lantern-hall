INTERFACE OF THE UNKNOWN ENGINE (schema only — behaviour is NOT described)

Grid: 7 x 7 cells. x = column 0..6 (increasing to the east), y = row 0..6 (increasing to the south).
Colour palette: "white", "red", "green", "blue". In observations colours are written as
letters w, r, g, b; a cell's light string lists the letters present, sorted alphabetically
(for example "", "r", "bw").

LAYOUT (input to reset). All coordinates are integers 0..6.
{
  "walls":   [ {"x":int,"y":int} ],
  "lamps":   [ {"x":int,"y":int,"color":Colour,"dir":"N"|"S"|"E"|"W"} ],   // dir = the direction the lamp faces
  "glass":   [ {"x":int,"y":int,"color":Colour} ],
  "sensors": [ {"id":string,"x":int,"y":int} ],
  "doors":   [ {"id":string,"x":int,"y":int,"color":Colour,"sensor":sensorId} ], // linked sensor
  "player":  {"x":int,"y":int},
  "crates":  [ {"id":string,"x":int,"y":int} ]
}
Validity (layouts violating these are rejected with an error message):
 - every coordinate inside the grid; ids are unique non-empty strings;
 - at most one of wall/lamp/glass/sensor/door per cell;
 - exactly one player; player and crates never share a cell and never sit on a wall or lamp;
 - sensors and doors are linked one-to-one (every sensor is named by exactly one door).
 Connectivity is not required. Floor is every cell not listed.

ACTIONS: "N", "S", "E", "W" — directional commands given to the player
(N = toward y-1, S = toward y+1, E = toward x+1, W = toward x-1). There are no other actions.

OBSERVATION (returned after reset and after every action; it always describes the state
after that action has been fully processed):
{
  "player":  {"x":int,"y":int},
  "crates":  [ {"id":string,"x":int,"y":int,"lit":bool} ],   // same order as the layout
  "light":   [ [string x7] x7 ],                             // light[y][x] = colour letters on that cell
  "sensors": [ {"id":string,"light":string} ],              // same order as the layout
  "doors":   [ {"id":string,"open":bool} ]                    // same order as the layout
}
Field names such as "lit", "open", "light" name concepts; they do not specify any rule.

RECONSTRUCTION CONTRACT
Your reconstruction is plain JavaScript (ES2020, no imports, no Date, no Math.random, no I/O)
that defines a global function:
    function simulate(layout, actions) -> Observation[]
returning actions.length + 1 observations: index 0 after reset, index i after actions[i-1].
It runs in an isolated interpreter with time and memory limits. It is compared against the
original engine field by field (positions, lit flags, every light cell, sensor light, door state).
Your code will only be evaluated on valid layouts.
