import type { CSSProperties } from "react";
import { Ball } from "./Ball";
import "./team-scene.css";

/**
 * Six mini cartoon players in one team kit, for the home page's team band.
 * They turn round one after another, so the name and number on the back of
 * some of them is always in view. Plain HTML and CSS like FootballScene; only
 * transforms are animated. The faces are made up, nobody in particular.
 */

type Hair = "short" | "quiff" | "curly" | "side" | "band" | "buzz";
type Beard = "none" | "stubble" | "full" | "goatee" | "moustache";
type Pose = "down" | "up" | "hips";

type Member = {
  name: string;
  number: string;
  /** Feet, in % of the scene's width. */
  x: number;
  y: number;
  size: number;
  delay: number;
  pose: Pose;
  skin: [light: string, base: string, shade: string, deep: string];
  hair: Hair;
  hairColor: [light: string, dark: string];
  beard: Beard;
  boot: string;
  captain?: boolean;
};

const WHEAT: Member["skin"] = ["#f0c29a", "#d89a6c", "#b4743f", "#8a5530"];
const TAN: Member["skin"] = ["#e0aa7c", "#c08253", "#97602f", "#6f4523"];
const BROWN: Member["skin"] = ["#c98d60", "#a56a40", "#7d4c2a", "#5a351c"];
const BLACK: Member["hairColor"] = ["#4b403b", "#15100e"];
const DARK: Member["hairColor"] = ["#6b4630", "#24150d"];

/* Back row first, so the rows in front are drawn over it. The 1-2-3 wedge keeps
   every shirt clear of the heads in front of it. Delays: 2 s apart, 12 s loop. */
const TEAM: Member[] = [
  { name: "KARIM", number: "4", x: 17, y: 41, size: 3.6, delay: 0, pose: "hips", skin: TAN, hair: "short", hairColor: BLACK, beard: "full", boot: "#f4f7f5" },
  { name: "SAKIB", number: "75", x: 50, y: 43, size: 3.6, delay: -6, pose: "up", skin: WHEAT, hair: "side", hairColor: DARK, beard: "none", boot: "#f2b705" },
  { name: "TAMIM", number: "28", x: 83, y: 41, size: 3.6, delay: -2, pose: "hips", skin: BROWN, hair: "buzz", hairColor: BLACK, beard: "goatee", boot: "#22c5a0" },
  { name: "MUSHFIQ", number: "7", x: 32, y: 21, size: 3.9, delay: -8, pose: "down", skin: BROWN, hair: "curly", hairColor: DARK, beard: "none", boot: "#e2665f" },
  { name: "SHANTO", number: "1", x: 68, y: 21, size: 3.9, delay: -4, pose: "down", skin: WHEAT, hair: "band", hairColor: BLACK, beard: "moustache", boot: "#f4f7f5" },
  { name: "RAHIM", number: "10", x: 50, y: 3, size: 4.1, delay: -10, pose: "up", skin: TAN, hair: "quiff", hairColor: BLACK, beard: "stubble", boot: "#f2b705", captain: true },
];

const FACE = "M17 50C17 24 30 13 50 13s33 11 33 37c0 18-2 31-8 42-6 10-15 17-25 17s-19-7-25-17c-6-11-8-24-8-42Z";

const CURLS: [number, number, number][] = [
  [19, 34, 7], [21, 23, 8], [28, 14, 8], [38, 8, 8.5], [50, 6, 9], [62, 8, 8.5], [72, 14, 8], [79, 23, 8], [81, 34, 7],
  [32, 24, 7], [42, 20, 7.5], [53, 19, 7.5], [64, 22, 7],
];

function FrontHair({ m, fill }: { m: Member; fill: string }) {
  const shine = { fill: "none", stroke: m.hairColor[0], strokeWidth: 1.8, strokeLinecap: "round" as const, opacity: 0.8 };
  switch (m.hair) {
    case "curly":
      return (
        <>
          {CURLS.map(([x, y, r]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={r} fill={m.hairColor[1]} />
          ))}
          {CURLS.map(([x, y, r]) => (
            <circle key={`${x}+${y}`} cx={x - 0.8} cy={y - 1.2} r={r * 0.72} fill={fill} />
          ))}
        </>
      );
    case "quiff":
      return (
        <>
          <path d="M16 54C12 36 16 22 23 15 32 2 60-3 76 6c10 8 12 28 8 48l-4-2c1-10-1-17-5-23-9-2-15-5-20-9-8 6-18 10-30 10-4 6-5 14-5 22Z" fill={fill} />
          <path d="M27 22C36 8 55 2 72 10M38 23C47 12 60 8 75 18" {...shine} />
        </>
      );
    case "side":
      return (
        <>
          <path d="M16 56C12 34 18 16 32 9c16-7 36-5 46 6 8 9 9 25 6 41l-4-2c0-9-1-15-4-21C62 33 46 30 36 20c-3 9-10 13-13 18-3 5-3 11-3 16Z" fill={fill} />
          <path d="M38 18C50 11 66 13 76 26M42 24c12 6 22 6 34 6" {...shine} />
        </>
      );
    case "band":
      return (
        <>
          <path d="M15 62C11 34 16 12 34 6c16-5 36-2 46 11 8 11 8 30 5 45l-5-2c1-12-1-20-5-27H25c-4 7-6 15-5 27Z" fill={fill} />
          <path d="M18 33C34 24 66 24 82 33v7C66 31 34 31 18 40Z" fill="#c89b3c" />
          <path d="M30 14C42 7 60 8 72 16" {...shine} />
        </>
      );
    case "buzz":
      return <path d="M17 50C14 28 24 8 50 8s36 20 33 42l-3-1c-1-9-3-15-7-19-14-4-32-4-46 0-4 4-6 10-7 19Z" fill={fill} opacity=".92" />;
    default:
      return (
        <>
          <path d="M16 56C12 32 20 8 50 7s38 25 34 49l-4-2c0-10-2-17-5-22-6-3-10-6-14-6-10 4-24 4-34 1-5 4-7 13-7 27Z" fill={fill} />
          <path d="M28 20C38 10 58 8 72 19" {...shine} />
        </>
      );
  }
}

function BeardShape({ m }: { m: Member }) {
  const [, dark] = m.hairColor;
  const around = "M17 56c0 16 3 28 8 37 6 10 15 17 25 17s19-7 25-17c5-9 8-21 8-37-3 11-6 18-11 21-6 3-13-2-22-2s-16 5-22 2c-5-3-8-10-11-21Z";
  const lip = "M33 80q3-8 11-8 4 0 6 2 2-2 6-2 8 0 11 8-6-4-11-4-4 0-6 1.5-2-1.5-6-1.5-5 0-11 4Z";
  switch (m.beard) {
    case "full":
      return <path d={around} fill={dark} opacity=".92" />;
    case "stubble":
      return <path d={around} fill={dark} opacity=".34" />;
    case "goatee":
      return (
        <>
          <path d={lip} fill={dark} opacity=".9" />
          <path d="M40 97q10-4 20 0 0 11-10 13-10-2-10-13Z" fill={dark} opacity=".9" />
        </>
      );
    case "moustache":
      return <path d={lip} fill={dark} opacity=".95" />;
    default:
      return null;
  }
}

function Head({ m }: { m: Member }) {
  const [light, base, shade, deep] = m.skin;
  const id = `tm-${m.number}`;
  const hair = `url(#${id}-h)`;
  const svg = { viewBox: "0 0 100 120", "aria-hidden": true, focusable: false } as const;
  return (
    <div className="tm-head">
      {/* Middle: ears and the widest outline, seen past the face as the head turns. */}
      <svg {...svg} className="tm-head-mid">
        <path d="M19 52c-8-6-14 0-12 9 1 9 7 15 13 14ZM81 52c8-6 14 0 12 9-1 9-7 15-13 14Z" fill={shade} />
        <path d={FACE} fill={shade} />
        <path d="M16 62C10 30 20 7 50 7s40 23 34 55Z" fill={m.hairColor[1]} />
      </svg>
      <i />
      <i className="tm-hind" />
      <svg {...svg} className="tm-head-back">
        <path d={FACE} fill={base} />
        <path d="M15 58C10 30 20 7 50 7s40 23 35 51c0 12-3 20-7 27-6-2-9-1-12 3-8-3-24-3-32 0-3-4-6-5-12-3-4-7-7-15-7-27Z" fill={m.hair === "buzz" ? m.hairColor[1] : `url(#${id}-h)`} />
        <path d="M30 26C38 16 56 14 68 24M26 40c10-10 34-14 48-2" fill="none" stroke={m.hairColor[0]} strokeWidth="1.8" strokeLinecap="round" opacity=".6" />
        {m.hair === "curly" && CURLS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y + 26} r={r * 0.8} fill={m.hairColor[0]} opacity=".5" />)}
        {m.hair === "band" && <path d="M14 34C34 42 66 42 86 34v8C66 50 34 50 14 42Z" fill="#c89b3c" />}
      </svg>
      <svg {...svg} className="tm-head-face">
        <defs>
          <radialGradient id={`${id}-s`} cx=".42" cy=".36" r=".72">
            <stop offset="0" stopColor={light} />
            <stop offset=".52" stopColor={base} />
            <stop offset="1" stopColor={shade} />
          </radialGradient>
          <linearGradient id={`${id}-h`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={m.hairColor[0]} />
            <stop offset=".6" stopColor={m.hairColor[1]} />
          </linearGradient>
        </defs>
        <path d={FACE} fill={`url(#${id}-s)`} />
        <circle cx="29" cy="74" r="8" fill="#d9604a" opacity=".16" />
        <circle cx="71" cy="74" r="8" fill="#d9604a" opacity=".16" />
        <BeardShape m={m} />
        {[34, 66].map((x) => (
          <g key={x} transform={`translate(${x} 57)`}>
            <ellipse rx="8.6" ry="9.2" fill="#fffdf8" />
            <circle cx={x < 50 ? 1 : -1} cy=".6" r="5.8" fill="#3d2415" />
            <circle cx={x < 50 ? 1 : -1} cy=".6" r="3" fill="#0d0806" />
            <circle cx={x < 50 ? 3 : 1} cy="-1.8" r="1.9" fill="#fff" />
            <path d="M-9-2Q0-13 9-2" fill="none" stroke="#1d110a" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        ))}
        <path d="M23 43q10-7 20-1M57 42q10-6 20 1" fill="none" stroke={m.hairColor[1]} strokeWidth="4" strokeLinecap="round" />
        <path d="M44 70q0 5 6 5t6-5" fill="none" stroke={deep} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M36 84Q50 88 64 84 62 97 50 97T36 84Z" fill="#7c2f2a" />
        <path d="M38 85Q50 89 62 85 61 90 50 90.5T38 85Z" fill="#fffdf8" />
        <FrontHair m={m} fill={hair} />
      </svg>
    </div>
  );
}

function Player({ m }: { m: Member }) {
  const style = { "--x": m.x, "--y": m.y, "--size": m.size, "--delay": `${m.delay}s`, "--skin": m.skin[1], "--skin-d": m.skin[2], "--hair": m.hairColor[1], "--boot": m.boot } as CSSProperties;
  return (
    <div className={`tm-player tm-${m.pose}${m.captain ? " tm-captain" : ""}`} style={style}>
      <span className="tm-shadow" />
      <div className="tm-figure">
        <span className="tm-leg tm-l"><i /></span>
        <span className="tm-leg tm-r"><i /></span>
        <span className="tm-neck" />
        <span className="tm-shorts"><i /></span>
        <span className="tm-shirt-mid" />
        <span className="tm-shirt tm-back">
          <em className={m.name.length > 6 ? "tm-long" : undefined}>{m.name}</em>
          <b>{m.number}</b>
        </span>
        <span className="tm-shirt tm-front">
          <em>ARTS FC</em>
          <b>{m.number}</b>
        </span>
        <span className="tm-arm tm-l"><i /></span>
        <span className="tm-arm tm-r"><i /></span>
        <Head m={m} />
      </div>
    </div>
  );
}

export function TeamScene() {
  return (
    <div className="tm-scene" aria-hidden>
      <div className="tm-stage">
        <div className="tm-ground" />
        {TEAM.map((m) => (
          <Player key={m.name} m={m} />
        ))}
        <span className="tm-ball">
          <Ball className="tm-ball-in" />
        </span>
      </div>
    </div>
  );
}
