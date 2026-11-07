import { memo, useMemo } from "react";
import type { Action, Layout, Observation } from "../engine/types.ts";

export const LIGHT_HEX: Record<string, string> = {
  w: "#ffd98a",
  r: "#ff5b4d",
  g: "#46e08a",
  b: "#5aa2ff",
};
export const COLOR_HEX: Record<string, string> = {
  white: LIGHT_HEX.w,
  red: LIGHT_HEX.r,
  green: LIGHT_HEX.g,
  blue: LIGHT_HEX.b,
};

const C = 100; // cell size in viewBox units
const DV: Record<Action, [number, number]> = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };

export interface BoardProps {
  layout: Layout;
  obs: Observation | null;
  /** cells to outline as disagreeing ("x,y") */
  diffCells?: Set<string>;
  onCellClick?: (x: number, y: number) => void;
  hoverable?: boolean;
  title?: string;
  className?: string;
  dim?: boolean;
}

function BoardImpl({ layout, obs, diffCells, onCellClick, title, className, dim }: BoardProps) {
  const light = obs?.light;
  const doorOpen = useMemo(() => new Map(obs?.doors.map((d) => [d.id, d.open]) ?? []), [obs]);
  const sensorLight = useMemo(() => new Map(obs?.sensors.map((s) => [s.id, s.light]) ?? []), [obs]);

  // Use the reported cells as truth. Lamp alignment supplies only a drawing axis;
  // neighbouring parallel beams must never create an invented perpendicular ray.
  const bands = useMemo(() => {
    const out: { key: string; x: number; y: number; c: string; h: boolean; v: boolean; off: number }[] = [];
    if (!light) return out;
    const aligned = (x: number, y: number, horizontal: boolean) => layout.lamps.some((l) => {
      const [dx, dy] = DV[l.dir];
      return horizontal ? dy === 0 && l.y === y && (x - l.x) * dx > 0
        : dx === 0 && l.x === x && (y - l.y) * dy > 0;
    });
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const s = light[y]?.[x] ?? "";
        const letters = s.split("").filter((ch) => LIGHT_HEX[ch]);
        letters.forEach((c, i) => {
          const h = aligned(x, y, true);
          const v = aligned(x, y, false);
          out.push({ key: `${x},${y},${c}`, x, y, c, h, v, off: (i - (letters.length - 1) / 2) * 13 });
        });
      }
    return out;
  }, [light, layout]);

  const cells = [];
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++)
      cells.push(
        <rect
          key={`f${x},${y}`}
          x={x * C + 2}
          y={y * C + 2}
          width={C - 4}
          height={C - 4}
          rx={6}
          className="lh-floor"
          fill={(x + y) % 2 ? "url(#floorA)" : "url(#floorB)"}
        />,
      );

  return (
    <svg
      viewBox={`-14 -14 ${7 * C + 28} ${7 * C + 28}`}
      className={`lh-board ${dim ? "is-dim" : ""} ${className ?? ""}`}
      role="img"
      aria-label={title ?? "7 by 7 exhibit room"}
    >
      <defs>
        <linearGradient id="floorA" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1b22" />
          <stop offset="1" stopColor="#121319" />
        </linearGradient>
        <linearGradient id="floorB" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#17181f" />
          <stop offset="1" stopColor="#101117" />
        </linearGradient>
        <linearGradient id="stone" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3a40" />
          <stop offset="1" stopColor="#24232a" />
        </linearGradient>
        <linearGradient id="crate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7a5236" />
          <stop offset="1" stopColor="#4c3020" />
        </linearGradient>
        <radialGradient id="brass" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#f3d18a" />
          <stop offset="0.55" stopColor="#a8783a" />
          <stop offset="1" stopColor="#4a3218" />
        </radialGradient>
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <filter id="softglow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>

      <rect x={-14} y={-14} width={7 * C + 28} height={7 * C + 28} rx={18} className="lh-frame" />
      <g>{cells}</g>

      {/* light: blurred halo + crisp core per reported colour */}
      <g className="lh-light" style={{ mixBlendMode: "screen" }}>
        {bands.map((b) => {
          const col = LIGHT_HEX[b.c];
          const strip = (w: number, k: string) => {
            const cx = b.x * C + C / 2;
            const cy = b.y * C + C / 2;
            const els = [];
            if (b.h) els.push(<rect key={`${k}h`} x={b.x * C - 1} y={cy - w / 2 + b.off} width={C + 2} height={w} fill={col} />);
            if (b.v) els.push(<rect key={`${k}v`} x={cx - w / 2 + b.off} y={b.y * C - 1} width={w} height={C + 2} fill={col} />);
            if (!b.h && !b.v) els.push(<circle key={`${k}d`} cx={cx + b.off} cy={cy} r={w + 2} fill={col} />);
            return els;
          };
          return (
            <g key={b.key} className="lh-beam">
              <g filter="url(#glow)" opacity={0.8}>{strip(16, "halo")}</g>
              <g opacity={0.95}>{strip(4, "core")}</g>
            </g>
          );
        })}
      </g>

      {/* terrain */}
      {layout.walls.map((w) => (
        <g key={`w${w.x},${w.y}`}>
          <rect x={w.x * C + 3} y={w.y * C + 3} width={C - 6} height={C - 6} rx={5} fill="url(#stone)" />
          <rect x={w.x * C + 3} y={w.y * C + 3} width={C - 6} height={10} rx={4} fill="#4d4b52" opacity={0.6} />
          <path d={`M${w.x * C + 12} ${w.y * C + 48} h${C - 24} M${w.x * C + 50} ${w.y * C + 14} v34 M${w.x * C + 30} ${w.y * C + 48} v38 M${w.x * C + 70} ${w.y * C + 48} v38`} stroke="#18171c" strokeWidth={2} opacity={0.7} />
        </g>
      ))}
      {layout.glass.map((g) => (
        <g key={`g${g.x},${g.y}`} className="lh-glass">
          <rect x={g.x * C + 10} y={g.y * C + 10} width={C - 20} height={C - 20} rx={4} fill={COLOR_HEX[g.color]} opacity={0.22} />
          <rect x={g.x * C + 10} y={g.y * C + 10} width={C - 20} height={C - 20} rx={4} fill="none" stroke={COLOR_HEX[g.color]} strokeWidth={2.5} opacity={0.85} />
          <path d={`M${g.x * C + 22} ${g.y * C + 70} L${g.x * C + 70} ${g.y * C + 22}`} stroke="#fff" strokeWidth={3} opacity={0.25} />
          <path d={`M${g.x * C + 36} ${g.y * C + 78} L${g.x * C + 78} ${g.y * C + 36}`} stroke="#fff" strokeWidth={1.5} opacity={0.18} />
        </g>
      ))}
      {layout.sensors.map((s) => {
        const sl = sensorLight.get(s.id) ?? "";
        const door = layout.doors.find((d) => d.sensor === s.id);
        return (
          <g key={`s${s.id}`}>
            <circle cx={s.x * C + 50} cy={s.y * C + 50} r={30} fill="#0c0d11" stroke="#6d6a62" strokeWidth={3} />
            <circle cx={s.x * C + 50} cy={s.y * C + 50} r={22} fill="none" stroke={door ? COLOR_HEX[door.color] : "#888"} strokeWidth={2} strokeDasharray="4 5" opacity={0.75} />
            {sl.split("").map((c, i, arr) => (
              <circle key={c} cx={s.x * C + 50 + (i - (arr.length - 1) / 2) * 10} cy={s.y * C + 50} r={8} fill={LIGHT_HEX[c]} className="lh-pulse" />
            ))}
            <text x={s.x * C + 50} y={s.y * C + 94} className="lh-tag">{s.id}</text>
          </g>
        );
      })}
      {layout.doors.map((d) => {
        const open = doorOpen.get(d.id) ?? false;
        const col = COLOR_HEX[d.color];
        const x0 = d.x * C;
        const y0 = d.y * C;
        return (
          <g key={`d${d.id}`} className={`lh-door ${open ? "is-open" : ""}`}>
            <rect x={x0 + 6} y={y0 + 6} width={C - 12} height={C - 12} rx={4} fill="none" stroke={col} strokeWidth={3} opacity={open ? 0.45 : 0.95} />
            {open ? (
              <>
                <rect x={x0 + 8} y={y0 + 8} width={10} height={C - 16} fill={col} opacity={0.55} />
                <rect x={x0 + C - 18} y={y0 + 8} width={10} height={C - 16} fill={col} opacity={0.55} />
              </>
            ) : (
              [0, 1, 2, 3].map((i) => <rect key={i} x={x0 + 18 + i * 18} y={y0 + 10} width={8} height={C - 20} rx={2} fill={col} opacity={0.9} />)
            )}
            <text x={x0 + 50} y={y0 + 94} className="lh-tag">{d.id}</text>
          </g>
        );
      })}
      {layout.lamps.map((l) => {
        const col = COLOR_HEX[l.color];
        const cx = l.x * C + 50;
        const cy = l.y * C + 50;
        const rot = { N: -90, E: 0, S: 90, W: 180 }[l.dir];
        return (
          <g key={`l${l.x},${l.y}`}>
            <circle cx={cx} cy={cy} r={34} fill={col} opacity={0.35} filter="url(#glow)" />
            <g transform={`rotate(${rot} ${cx} ${cy})`}>
              <path d={`M${cx + 18} ${cy - 16} L${cx + 46} ${cy - 24} L${cx + 46} ${cy + 24} L${cx + 18} ${cy + 16} Z`} fill="url(#brass)" stroke="#2a1d0e" strokeWidth={1.5} />
              <rect x={cx + 42} y={cy - 22} width={5} height={44} fill={col} />
            </g>
            <circle cx={cx} cy={cy} r={26} fill="url(#brass)" stroke="#2a1d0e" strokeWidth={2} />
            <circle cx={cx} cy={cy} r={12} fill={col} />
            <circle cx={cx} cy={cy} r={12} fill={col} filter="url(#softglow)" />
          </g>
        );
      })}

      {/* occupants */}
      {obs?.crates.map((c) => (
        <g key={`c${c.id}`} className="lh-move" style={{ transform: `translate(${c.x * C}px, ${c.y * C}px)` }}>
          {c.lit && <rect x={8} y={8} width={C - 16} height={C - 16} rx={10} fill="#ffcf7a" opacity={0.55} filter="url(#glow)" />}
          <rect x={14} y={14} width={C - 28} height={C - 28} rx={7} fill="url(#crate)" stroke={c.lit ? "#ffd58a" : "#2b1a10"} strokeWidth={c.lit ? 3.5 : 2} />
          <path d="M20 20 L80 80 M80 20 L20 80" stroke="#2b1a10" strokeWidth={4} opacity={0.55} />
          <rect x={14} y={14} width={C - 28} height={C - 28} rx={7} fill="none" stroke="#a37350" strokeWidth={1} opacity={0.6} />
          <text x={50} y={58} className="lh-crate-tag">{c.id}</text>
        </g>
      ))}
      {obs && (
        <g className="lh-move" style={{ transform: `translate(${obs.player.x * C}px, ${obs.player.y * C}px)` }}>
          <circle cx={50} cy={50} r={30} fill="#f4ecd8" opacity={0.18} filter="url(#glow)" />
          <circle cx={50} cy={50} r={22} fill="#efe6d2" stroke="#1b1712" strokeWidth={3} />
          <circle cx={50} cy={50} r={8} fill="#1b1712" />
        </g>
      )}

      {diffCells &&
        [...diffCells].map((k) => {
          const [x, y] = k.split(",").map(Number);
          return <rect key={`x${k}`} x={x * C + 4} y={y * C + 4} width={C - 8} height={C - 8} rx={8} className="lh-diff" />;
        })}

      {onCellClick &&
        Array.from({ length: 49 }, (_, i) => {
          const x = i % 7;
          const y = Math.floor(i / 7);
          return (
            <rect
              key={`h${i}`}
              x={x * C}
              y={y * C}
              width={C}
              height={C}
              className="lh-hit"
              onClick={() => onCellClick(x, y)}
              role="button"
              aria-label={`cell ${x},${y}`}
            />
          );
        })}
    </svg>
  );
}

export const Board = memo(BoardImpl);

/** Cells whose full-state content differs between two observations. */
export function diffCellsOf(a: Observation | null | undefined, b: unknown): Set<string> {
  const s = new Set<string>();
  if (!a) return s;
  const o = (b ?? {}) as Partial<Observation>;
  for (let y = 0; y < 7; y++)
    for (let x = 0; x < 7; x++) {
      const e = a.light[y][x];
      const v = (o.light?.[y]?.[x] ?? null) as string | null;
      if (typeof v !== "string" || v.split("").sort().join("") !== e) s.add(`${x},${y}`);
    }
  if (!o.player || o.player.x !== a.player.x || o.player.y !== a.player.y) {
    s.add(`${a.player.x},${a.player.y}`);
    if (o.player && Number.isInteger(o.player.x)) s.add(`${o.player.x},${o.player.y}`);
  }
  a.crates.forEach((c) => {
    const r = o.crates?.find((z) => z?.id === c.id);
    if (!r || r.x !== c.x || r.y !== c.y || Boolean(r.lit) !== c.lit) {
      s.add(`${c.x},${c.y}`);
      if (r && Number.isInteger(r.x)) s.add(`${r.x},${r.y}`);
    }
  });
  return s;
}
