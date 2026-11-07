// Editorial labels for browsing; the model's original purpose remains alongside the replay.
const TITLES: Record<string, string> = {
  beam1: "How do beams travel and mix?", crate1: "What happens when crates meet a beam?",
  door1: "How does a sensor open a door?", glass2: "What do two glass filters do?",
  move1: "What blocks movement?", sensor2: "How do mixed colors affect a sensor?",
  pushLit: "Can a crate move after leaving the light?", pushDark: "Can a dark crate be pushed?",
  litCrateDarkPlayer: "Light on the crate", darkCrateLitPlayer: "Light on the visitor",
  static2: "How do objects affect light?", doorTiming: "When does a door open?",
  doorLight: "Does a closed door block light?", slideGlass: "Does glass stop a sliding crate?",
  chainLit: "Can one lit crate push another?", doorClose: "What happens when a door closes on an object?",
  slideDoor: "Does a closed door stop a sliding crate?", colorMatch: "Which colors open a door?",
  colorMatch2: "Can white or filtered light open a door?", slideOpen: "Can a crate slide across an open door?",
  slideCrate: "What stops a crate near another crate?", doorOnCrate: "Can a crate leave a door that closed?",
  rgbMix: "Can red, green and blue open a white door?", slideTiming: "Can a crate open a door while sliding?",
  pushToLamp: "What happens when a crate reaches a lamp?", whiteGlassRed: "What does white glass do to red light?",
  edge1: "What happens at beam and board edges?", edge2: "What happens where beams and objects meet?",
  crateOnClosedDoor: "Can a lit crate leave a closed door?", combo1: "Can a sliding crate open a blue door?",
  crateOnGlassPush: "Can a crate be pushed off glass?", pushOpens: "Can the visitor enter a newly opened door?",
  darkOnDoor: "Can a dark crate leave a closed door?", cx1: "Can filtered light power a crate slide?",
  cx2: "How does moving a crate change a door?", cx3: "How do glass, doors and edge pushes interact?",
};
export const experimentTitle = (id: string, runId = "run-01", purpose?: string) =>
  (runId === "run-01" ? TITLES[id] : purpose?.trim())
  || id.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]/g, " ");
