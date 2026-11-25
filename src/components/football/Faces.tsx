import type { ReactNode } from "react";

/**
 * Cartoon heads for the hero's mini footballers: small inline SVGs, shaded
 * with gradients only (no filters, so they stay cheap to draw). Each head is
 * three flat layers the CSS puts at different depths, so they shift against
 * each other as it turns. viewBox 0 0 100 120 for every layer.
 */

export type Look = "ten" | "seven" | "eleven";

/**
 * Pictures of the heads (transparent WebP, 500 x 600, chin at y = 558; the `-300` files are the same at 300 x 360). A look
 * left out of this map uses the drawing below, so `{}` brings the drawn heads
 * back. These were cut from a picture the owner supplied: replace them with
 * licensed art before launch.
 */
const HEAD_IMAGE: Partial<Record<Look, string>> = {
  ten: "/images/players/ten-300.webp",
  seven: "/images/players/seven-300.webp",
  eleven: "/images/players/eleven-300.webp",
};

type Tone = { skin: string; light: string; shade: string; deep: string; hair: string; hairLight: string; hairDark: string; lip: string };
const TONE: Record<Look, Tone> = {
  ten: { skin: "#eeb88f", light: "#fcdcbd", shade: "#cf8b60", deep: "#a86540", hair: "#3a2417", hairLight: "#6b452c", hairDark: "#20130b", lip: "#c4706a" },
  seven: { skin: "#dfa277", light: "#f4c9a2", shade: "#b87449", deep: "#8d5331", hair: "#1c1613", hairLight: "#4a3e37", hairDark: "#0c0908", lip: "#bb685c" },
  eleven: { skin: "#c98d60", light: "#e8b78a", shade: "#9b6139", deep: "#744527", hair: "#b58747", hairLight: "#e0bd7c", hairDark: "#6d4a22", lip: "#b46258" },
};

const FACE: Record<Look, string> = {
  ten: "M18 46C18 22 31 13 50 13s32 9 32 33c0 20-2 33-7 44-5 11-14 19-25 19s-20-8-25-19c-5-11-7-24-7-44Z",
  seven: "M19 46C19 22 32 13 50 13s31 9 31 33c0 16 0 29-3 40-2 8-8 14-14 19-4 4-9 6-14 6s-10-2-14-6c-6-5-12-11-14-19-3-11-3-24-3-40Z",
  eleven: "M18 46C18 22 31 13 50 13s32 9 32 33c0 19-2 33-7 45-5 12-13 20-25 20s-20-8-25-20c-5-12-7-26-7-45Z",
};

function Layer({ className, children }: { className: string; children: ReactNode }) {
  return (
    <svg viewBox="0 0 100 120" className={`fb-layer ${className}`} aria-hidden focusable="false">
      {children}
    </svg>
  );
}

function Skin({ look }: { look: Look }) {
  const c = TONE[look];
  const id = (n: string) => `fb-${look}-${n}`;
  const ear = "M19 52c-7-5-12 0-11 8 1 9 6 15 12 15Z";
  return (
    <>
      <defs>
        <radialGradient id={id("skin")} cx=".42" cy=".34" r=".72">
          <stop offset="0" stopColor={c.light} />
          <stop offset=".5" stopColor={c.skin} />
          <stop offset=".85" stopColor={c.shade} />
          <stop offset="1" stopColor={c.deep} />
        </radialGradient>
        <linearGradient id={id("hair")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c.hairLight} />
          <stop offset=".45" stopColor={c.hair} />
          <stop offset="1" stopColor={c.hairDark} />
        </linearGradient>
        <radialGradient id={id("soft")}>
          <stop offset="0" stopColor={c.deep} stopOpacity=".55" />
          <stop offset="1" stopColor={c.deep} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("glow")}>
          <stop offset="0" stopColor="#fff3e2" stopOpacity=".7" />
          <stop offset="1" stopColor="#fff3e2" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("blush")}>
          <stop offset="0" stopColor="#d9604a" stopOpacity=".3" />
          <stop offset="1" stopColor="#d9604a" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[undefined, "matrix(-1 0 0 1 100 0)"].map((t) => (
        <g key={t ?? "l"} transform={t}>
          <path d={ear} fill={c.skin} stroke={c.shade} strokeWidth="1" />
          <path d="M16 56c-4-2-6 1-5 6 1 4 2 6 5 8" fill="none" stroke={c.deep} strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
        </g>
      ))}
      <path d={FACE[look]} fill={`url(#${id("skin")})`} />
      <ellipse cx="42" cy="34" rx="20" ry="10" fill={`url(#${id("glow")})`} opacity=".7" />
    </>
  );
}

function Eye({ x, y, look }: { x: number; y: number; look: Look }) {
  const c = TONE[look];
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse rx="11" ry="7.5" cy="-1" fill={`url(#fb-${look}-soft)`} />
      <path d="M-7 .6Q0-5.6 7 .6 0 4.8-7 .6Z" fill="#fdfaf5" />
      <circle cy="-.3" r="3.1" fill={look === "eleven" ? "#5a4020" : "#4a2d18"} />
      <circle cy="-.3" r="1.6" fill="#0d0806" />
      <circle cx="1" cy="-1.4" r=".9" fill="#fff" />
      <path d="M-7.6 .9Q0-6.6 7.6 .9" fill="none" stroke="#1d110a" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M-6 2.8Q0 6 6 2.8" fill="none" stroke={c.deep} strokeWidth=".9" strokeLinecap="round" opacity=".7" />
    </g>
  );
}

function Nose({ look }: { look: Look }) {
  const c = TONE[look];
  const w = look === "seven" ? 7.5 : look === "ten" ? 8 : 9;
  return (
    <>
      <ellipse cx="50" cy="70" rx={w + 4} ry="6" fill={`url(#fb-${look}-soft)`} />
      <path d="M46 50Q44 60 43 66" fill="none" stroke={c.deep} strokeWidth="1.6" strokeLinecap="round" opacity=".5" />
      <ellipse cx="50" cy="58" rx="2.4" ry="9" fill={`url(#fb-${look}-glow)`} />
      <ellipse cx="50" cy="67" rx="5" ry="4" fill={`url(#fb-${look}-glow)`} opacity=".7" />
      <path d={`M${50 - w} 68q-1 4 3 4 3-1 ${w - 3} 1.5 3-2.5 ${w - 3}-1.5 4 0 3-4`} fill="none" stroke={c.deep} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

/** Open smile with teeth: half-width w, depth d. */
function Smile({ y, w, d, lip }: { y: number; w: number; d: number; lip: string }) {
  const x0 = 50 - w;
  return (
    <>
      <path d={`M${x0} ${y}Q50 ${y + 5} ${50 + w} ${y}Q${50 + w - 3} ${y + d + 3} 50 ${y + d + 4}Q${x0 + 3} ${y + d + 3} ${x0} ${y}Z`} fill={lip} />
      <path d={`M${x0 + 1.5} ${y + 1}Q50 ${y + 5.5} ${50 + w - 1.5} ${y + 1}Q${50 + w - 4} ${y + d} 50 ${y + d + 1}Q${x0 + 4} ${y + d} ${x0 + 1.5} ${y + 1}Z`} fill="#fffdf8" />
      <path d={[-2, -1, 0, 1, 2].map((i) => `M${50 + i * (w / 3.2)} ${y + 4}v${d - 4}`).join("")} stroke="#d9cfc4" strokeWidth=".6" opacity=".8" />
      <path d={`M${x0 - 1.5} ${y - 0.5}Q50 ${y + 5} ${50 + w + 1.5} ${y - 0.5}`} fill="none" stroke="#6d2f2a" strokeWidth="1.5" strokeLinecap="round" />
    </>
  );
}

function Brows({ look, y, thick, lift }: { look: Look; y: number; thick: number; lift: number }) {
  const d = `M24 ${y + 2}Q32 ${y - lift - 2} 45 ${y}L44.5 ${y + thick}Q33 ${y - lift + thick - 1} 24 ${y + 2}Z`;
  const fill = look === "ten" ? "#42281a" : "#1a110c";
  return (
    <>
      <path d={d} fill={fill} />
      <path d={d} fill={fill} transform="matrix(-1 0 0 1 100 0)" />
    </>
  );
}

function Features({ look }: { look: Look }) {
  const c = TONE[look];
  const folds = (
    <path d="M37 72q-6 5-7 11M63 72q6 5 7 11" fill="none" stroke={c.deep} strokeWidth="1.5" strokeLinecap="round" opacity=".5" />
  );
  const cheeks = (
    <>
      <circle cx="30" cy="69" r="10" fill={`url(#fb-${look}-blush)`} />
      <circle cx="70" cy="69" r="10" fill={`url(#fb-${look}-blush)`} />
    </>
  );
  if (look === "ten") {
    return (
      <>
        {cheeks}
        <defs>
          <linearGradient id="fb-beard" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#4d2c1a" />
            <stop offset=".45" stopColor="#8a4c28" />
            <stop offset="1" stopColor="#5f3219" />
          </linearGradient>
        </defs>
        <path d="M18.5 55c0 14 2 25 6.5 35 5 11 14 19 25 19s20-8 25-19c4.5-10 6.5-21 6.5-35-3 9-5 16-9 20-4 3-9 2-14 0-3-1.5-5-1.5-8.5-1.5s-5.5 0-8.5 1.5c-5 2-10 3-14 0-4-4-6-11-9-20Z" fill="url(#fb-beard)" />
        <path d="M25 80l3 9M30 88l4 9M37 95l3 7M75 80l-3 9M70 88l-4 9M63 95l-3 7M46 98l1 7M54 98l-1 7M34 79l-2 6M66 79l2 6" stroke="#b77444" strokeWidth="1" strokeLinecap="round" opacity=".75" />
        <path d="M34 85Q50 72 66 85L62 79Q50 73 38 79Z" fill="#5a321d" opacity=".5" />
        <Smile y={82} w={12} d={5} lip={c.lip} />
        <Eye x={35} y={54} look={look} />
        <Eye x={65} y={54} look={look} />
        <Brows look={look} y={45} thick={3.2} lift={2} />
        <Nose look={look} />
      </>
    );
  }
  if (look === "seven") {
    return (
      <>
        {cheeks}
        {/* Shadow under the cheekbones gives the long square jaw. */}
        <ellipse cx="29" cy="82" rx="6" ry="13" fill="url(#fb-seven-soft)" />
        <ellipse cx="71" cy="82" rx="6" ry="13" fill="url(#fb-seven-soft)" />
        <path d="M24 78c2 14 9 24 17 29 5 3 13 3 18 0 8-5 15-15 17-29 0 0-6 22-26 22S24 78 24 78Z" fill="#3b2a22" opacity=".13" />
        {folds}
        <Smile y={81} w={16} d={8} lip={c.lip} />
        <path d="M43 99q7 3 14 0" fill="none" stroke={c.deep} strokeWidth="1.5" strokeLinecap="round" opacity=".6" />
        <ellipse cx="50" cy="104" rx="6" ry="3" fill="url(#fb-seven-glow)" opacity=".6" />
        <Eye x={35} y={54} look={look} />
        <Eye x={65} y={54} look={look} />
        <Brows look={look} y={45.5} thick={3} lift={4.5} />
        <Nose look={look} />
      </>
    );
  }
  return (
    <>
      {cheeks}
      <path d="M18.5 58c0 13 2 23 6.5 33 5 12 13 20 25 20s20-8 25-20c4.5-10 6.5-20 6.5-33-3 12-5 20-9 25-5 6-11 7-22 7s-17-1-22-7c-4-5-7-13-10-25Z" fill="#2a1a10" opacity=".55" />
      <path d="M33 84q1-9 10-10 4-1 7 .5 3-1.5 7-.5 9 1 10 10-5-6-10-6.5-4-.5-7 .5-3-1-7-.5-5 .5-10 6.5Z" fill="#2a1a10" opacity=".8" />
      <path d="M43 98q7-2 14 0 1 8-7 11-8-3-7-11Z" fill="#23150c" opacity=".7" />
      {folds}
      <Smile y={82} w={14.5} d={7.5} lip={c.lip} />
      <Eye x={35} y={55} look={look} />
      <Eye x={65} y={55} look={look} />
      <Brows look={look} y={46} thick={3.6} lift={3.5} />
      <path d="M71.5 42l-1.5 6" stroke={c.skin} strokeWidth="1.3" />
      <Nose look={look} />
    </>
  );
}

/** Tight golden curls: rows of circles, darker at the roots. */
const CURLS: [number, number, number][] = [
  [20, 30, 6], [23, 21, 6.5], [29, 13, 7], [37, 7, 7], [46, 3.5, 7], [56, 3.5, 7], [65, 7, 7], [72, 13, 7], [77, 21, 6.5], [80, 30, 6],
  [28, 26, 6], [34, 19, 6.5], [42, 14, 6.5], [51, 12, 6.5], [60, 14, 6.5], [67, 19, 6.5], [72, 26, 6],
  [36, 27, 5.5], [44, 23, 5.5], [52, 22, 5.5], [60, 24, 5.5], [66, 28, 5],
];

function FrontHair({ look }: { look: Look }) {
  const c = TONE[look];
  const hair = `url(#fb-${look}-hair)`;
  if (look === "ten") {
    return (
      <>
        <path d="M17 60C13 38 14 20 24 12 33 4 66 2 76 11c11 9 11 27 7 49l-3-2c0-10-1-18-4-25-2-3-5-5-9-5-11 1-23 1-34 0-4 0-7 2-9 5-3 7-4 15-4 25Z" fill={hair} />
        <path d="M30 14C40 7 58 6 70 12M27 20c12-8 32-9 46-3M29 25c12-5 28-6 41-2" fill="none" stroke={c.hairLight} strokeWidth="1.5" strokeLinecap="round" opacity=".8" />
        <path d="M19 48l1 10M81 48l-1 10" stroke="#5c3520" strokeWidth="3" strokeLinecap="round" />
      </>
    );
  }
  if (look === "seven") {
    return (
      <>
        <path d="M18 56C14 34 17 16 28 9 40 0 66-1 76 10c9 9 9 25 6 46l-3-1c1-9 0-17-3-23-2-4-4-6-8-8-8 2-15 1-22-2-6 4-12 6-18 7-4 5-6 13-6 26Z" fill={hair} />
        <path d="M33 23C40 10 58 4 72 12M40 22C47 11 60 8 74 17M48 21c7-7 16-8 26 0" fill="none" stroke={c.hairLight} strokeWidth="1.7" strokeLinecap="round" opacity=".85" />
        <path d="M31 25Q29 16 33 10" fill="none" stroke={c.light} strokeWidth="1.1" strokeLinecap="round" opacity=".55" />
      </>
    );
  }
  return (
    <>
      <path d="M18 58C15 42 17 28 24 24h52c7 4 9 18 6 34l-3-1c0-10-1-18-5-25H26c-4 7-5 15-5 25Z" fill="#3a2616" opacity=".8" />
      {CURLS.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r={r + 0.7} fill={c.hairDark} />
      ))}
      {CURLS.map(([x, y, r]) => (
        <circle key={`${x}-${y}`} cx={x - 0.5} cy={y - 0.9} r={r - 0.8} fill={c.hair} />
      ))}
      <path d={CURLS.map(([x, y, r]) => `M${x - r * 0.6} ${y}a${r * 0.550} ${r * 0.550} 0 1 1 ${r * 0.7} ${r * 0.350}`).join("")} fill="none" stroke={c.hairLight} strokeWidth="1.3" strokeLinecap="round" />
    </>
  );
}

export function Head({ look }: { look: Look }) {
  const image = HEAD_IMAGE[look];
  if (image) {
    return (
      <div className="fb-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="" width={500} height={600} decoding="async" fetchPriority="low" className="fb-layer" />
      </div>
    );
  }
  return (
    <div className="fb-head">
      <Layer className="fb-layer-back">
        <Skin look={look} />
        {look !== "ten" && <circle cx="14.5" cy="73" r="1.9" fill={look === "seven" ? "#e9f6ff" : "#ffe08a"} stroke="#8d7a4a" strokeWidth=".5" />}
      </Layer>
      <Layer className="fb-layer-face">
        <Features look={look} />
      </Layer>
      <Layer className="fb-layer-hair">
        <FrontHair look={look} />
      </Layer>
    </div>
  );
}
