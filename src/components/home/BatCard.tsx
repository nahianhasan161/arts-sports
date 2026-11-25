/**
 * A cricket bat drawn as the background of the home page promises strip. It lies flat from
 * `md` up (handle on the left, toe on the right) and stands upright on phones. Three pieces,
 * so the blade stretches with its content while the handle and the toe keep their size.
 * Decorative inline SVG (illustration colours, not theme colours); the text colours on the
 * wood come from `.as-bat` in globals.css.
 *
 * Everything is drawn lying flat, 120 units across the blade. `upright` swaps x and y.
 */
const HANDLE = 230;
const TOE = 64;
const OUTLINE = { fill: "none", stroke: "#8a5a1f", strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" as const };

type PieceProps = { length: number; upright: boolean; className: string; children: React.ReactNode };

function Piece({ length, upright, className, children }: PieceProps) {
  return (
    <svg viewBox={upright ? `0 0 120 ${length}` : `0 0 ${length} 120`} preserveAspectRatio="none" className={`block ${className}`} focusable="false">
      <g transform={upright ? "matrix(0 1 1 0 0 0)" : undefined}>{children}</g>
    </svg>
  );
}

/** Willow, lit from one long side, with a darker strip along the other for the bat's thickness. */
function Willow({ id, edge }: { id: string; edge: number }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="0" y1="4" x2="0" y2="116">
      <stop offset="0" stopColor="#f3dcae" />
      <stop offset=".12" stopColor="#f8e8c6" />
      <stop offset=".6" stopColor="#f0d6a3" />
      <stop offset={edge} stopColor="#e4c184" />
      <stop offset={edge + 0.01} stopColor="#bf8d49" />
      <stop offset="1" stopColor="#a87536" />
    </linearGradient>
  );
}

const GRAIN_LINE = { fill: "none", stroke: "#b9853f", strokeOpacity: 0.22, strokeWidth: 1, vectorEffect: "non-scaling-stroke" as const };
const GRAIN = [17, 30, 41, 55, 68, 79, 93, 103];

function Bat({ upright }: { upright: boolean }) {
  const id = upright ? "bat-u" : "bat-f";
  // Half the thickness of the grip. The upright blade is wide on screen, so its grip is drawn thinner.
  const g = upright ? 8.5 : 17;
  // Where the grip ends and the shoulders start, and where the shoulders reach full width.
  const [neck, full] = upright ? [120, 212] : [150, 206];
  // Where the thickness strip starts, as a share of the blade's width.
  const edge = upright ? 0.955 : 0.91;
  const [top, bottom] = [60 - g, 60 + g];
  const wrap = upright ? "flex-col md:hidden" : "hidden md:flex flex-row";
  const across = upright ? "w-full" : "h-full";
  const shoulderTop = `C${neck + 22} ${top} ${neck + 26} 4 ${full} 4`;
  const shoulderBottom = `C${neck + 26} 116 ${neck + 22} ${bottom} ${neck} ${bottom}`;

  return (
    <div className={`absolute inset-0 ${upright ? "flex" : ""} ${wrap} pointer-events-none drop-shadow-xl`} aria-hidden>
      <Piece length={HANDLE} upright={upright} className={`shrink-0 ${across} ${upright ? "h-[var(--bat-handle)]" : "w-[var(--bat-handle)]"}`}>
        <defs>
          <Willow id={`${id}-h`} edge={edge} />
          <linearGradient id={`${id}-grip`} gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={bottom}>
            <stop offset="0" stopColor="#b71c1c" />
            <stop offset=".3" stopColor="#e24a43" />
            <stop offset="1" stopColor="#861212" />
          </linearGradient>
          <clipPath id={`${id}-clip`}>
            <rect x="4" y={top} width={neck} height={g * 2} rx={upright ? 3 : 6} />
          </clipPath>
        </defs>
        <path d={`M${neck} ${top} ${shoulderTop} H${HANDLE} V116 H${full} ${shoulderBottom} Z`} fill={`url(#${id}-h)`} />
        <path d={`M${neck} ${top} ${shoulderTop} H${HANDLE} M${HANDLE} 116 H${full} ${shoulderBottom}`} {...OUTLINE} />
        {GRAIN.map((y) => (
          <path key={y} d={`M${full} ${y} H${HANDLE}`} {...GRAIN_LINE} />
        ))}
        {/* The handle spliced into the blade */}
        <path d={`M${neck + 2} ${top + 1} L${neck + 74} 60 L${neck + 2} ${bottom - 1} Z`} fill="#d9ad69" stroke="#a87536" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {/* Rubber grip */}
        <rect x="4" y={top} width={neck} height={g * 2} rx={upright ? 3 : 6} fill={`url(#${id}-grip)`} />
        <g clipPath={`url(#${id}-clip)`}>
          {Array.from({ length: 13 }, (_, i) => (
            <path key={i} d={`M${8 + i * 12} ${top} L${16 + i * 12} 60 L${8 + i * 12} ${bottom}`} fill="none" stroke="#6d0f0f" strokeOpacity=".65" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        <rect x="1" y={top - 2} width="10" height={g * 2 + 4} rx={upright ? 2 : 4} fill="#7f1414" />
        <rect x={neck - 3} y={top - 1} width="8" height={g * 2 + 2} rx="1.500" fill="#1d1d1f" />
      </Piece>

      <Piece length={100} upright={upright} className={`flex-1 min-w-0 min-h-0 ${across} ${upright ? "-my-px" : "-mx-px"}`}>
        <defs>
          <Willow id={`${id}-b`} edge={edge} />
        </defs>
        <rect x="0" y="4" width="100" height="112" fill={`url(#${id}-b)`} />
        {GRAIN.map((y, i) => (
          <path key={y} d={`M0 ${y} C30 ${y + (i % 2 ? 2 : -2)} 65 ${y + (i % 2 ? -2 : 2)} 100 ${y}`} {...GRAIN_LINE} />
        ))}
        <path d="M0 4 H100 M0 116 H100" {...OUTLINE} />
      </Piece>

      <Piece length={TOE} upright={upright} className={`shrink-0 ${across} ${upright ? "h-[var(--bat-toe)]" : "w-[var(--bat-toe)]"}`}>
        <defs>
          <Willow id={`${id}-t`} edge={edge} />
          <clipPath id={`${id}-toe`}>
            <path d="M0 4 H22 C52 4 62 28 62 60 C62 92 52 116 22 116 H0 Z" />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}-toe)`}>
          <rect x="0" y="4" width={TOE} height="112" fill={`url(#${id}-t)`} />
          <rect x="8" y="4" width="14" height="112" fill="#0f6b3c" />
          <rect x="26" y="4" width="5" height="112" fill="#c62828" />
        </g>
        <path d="M0 4 H22 C52 4 62 28 62 60 C62 92 52 116 22 116 H0" {...OUTLINE} />
      </Piece>
    </div>
  );
}

export function BatCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="as-bat relative max-w-[15.5rem] mx-auto md:max-w-none pt-[var(--bat-handle)] pb-[var(--bat-toe)] md:py-0 md:pl-[var(--bat-handle)] md:pr-[var(--bat-toe)]">
      <Bat upright />
      <Bat upright={false} />
      <div className="relative">{children}</div>
    </div>
  );
}
