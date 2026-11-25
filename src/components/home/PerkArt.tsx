/**
 * Small drawings for the home page promises: two umpire signals that show the number (1, 6), then a sport each. Decorative inline SVG
 * (illustration colours, not theme colours). Each has one part that moves when the
 * card (a `group`) is hovered.
 */
const MOVE = "[transform-box:fill-box] origin-center transition-transform duration-300 ease-out motion-reduce:transform-none";

type ArtProps = { className?: string };

const INK = "#26324a";
const SKIN = "#d79b66";

/** The umpire from the waist up, centred on x = 0. Drawn after the arms so the coat covers the shoulders. */
function Umpire({ x }: { x: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <path d="M-14 64v-13q0-10 9-12h10q9 2 9 12v13z" fill="#fff" stroke={INK} strokeWidth="1.600" strokeLinejoin="round" />
      <path d="M-5 38.500L0 46l5-7.500z" fill="#8fc3ee" stroke={INK} strokeWidth="1.200" strokeLinejoin="round" />
      <path d="M-1.600 43.500h3.200L2.400 53 0 55.500-2.400 53z" fill="#d32f2f" />
      <path d="M0 55.500V64" stroke={INK} strokeWidth="1.200" />
      <path d="M-3.500 33h7v5.500L0 42l-3.500-3.500z" fill="#b97c49" />
      <circle cx="-8.600" cy="27" r="2" fill={SKIN} stroke={INK} />
      <circle cx="8.600" cy="27" r="2" fill={SKIN} stroke={INK} />
      <path d="M-8.500 21h17v7q0 8.500-8.500 8.500T-8.500 28z" fill={SKIN} stroke={INK} strokeWidth="1.400" />
      <circle cx="-3.400" cy="26" r="1.200" fill={INK} />
      <circle cx="3.400" cy="26" r="1.200" fill={INK} />
      <path d="M-4.500 31.400q2.200-2.600 4.500-1 2.300-1.600 4.500 1-2.400.9-4.500-.1-2.100 1-4.500.1z" fill="#2b1c12" />
      <path d="M-8 20.500q0-10 8-10t8 10z" fill="#fff" stroke={INK} strokeWidth="1.500" />
      <path d="M-8.200 17.200q8.200 2.600 16.400 0l.3 3.600h-17z" fill="#0f6b3c" />
      <path d="M-14 21.500q0-2 3-2 11 2.600 22 0 3 0 3 2 0 2.500-14 2.500t-14-2.500z" fill="#fff" stroke={INK} strokeWidth="1.500" strokeLinejoin="round" />
    </g>
  );
}

/**
 * Raised arm with the index finger up. The index is on the thumb side, with the other three
 * fingers curled beside it: a finger drawn in the middle of the fist would be a rude sign.
 */
function RaisedArm({ from, to, hand }: { from: [number, number]; to: [number, number]; hand: string }) {
  const sleeve = `M${from[0]} ${from[1]}L${to[0]} ${to[1]}`;
  return (
    <g fill="none" strokeLinecap="round">
      <g transform={hand}>
        <path d="M-5.500-9.500q0-2.500 2.500-2.500h3.300v-9.300a2.500 2.500 0 0 1 5 0V-5q0 5-5.300 5t-5.500-5z" fill={SKIN} stroke={INK} strokeWidth="1.400" strokeLinejoin="round" />
        <path d="M-5.200-9h5.300M-5.200-6h4.600" stroke={INK} />
        <path d="M4.800-5.500q-1 2-5.300 0" stroke={INK} strokeWidth="1.200" />
      </g>
      <path d={sleeve} stroke={INK} strokeWidth="10.500" />
      <path d={sleeve} stroke="#fff" strokeWidth="7.600" />
    </g>
  );
}

/** Umpire giving "out": one finger, for "from 1 piece". */
export function UmpireOutArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <g className={`${MOVE} group-hover:-translate-y-1`}>
        <RaisedArm from={[28, 47]} to={[12, 28]} hand="translate(11.5 25.5)" />
      </g>
      <Umpire x={40} />
    </svg>
  );
}

/** Umpire signalling a six: both arms up, for "4–6 days". */
export function UmpireSixArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <g className={`${MOVE} group-hover:-translate-y-1`}>
        <RaisedArm from={[21, 47]} to={[9, 28]} hand="translate(8.5 25.5)" />
        <RaisedArm from={[43, 47]} to={[55, 28]} hand="translate(55.5 25.5) scale(-1 1)" />
      </g>
      <Umpire x={32} />
    </svg>
  );
}

export function BadmintonArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <g className={`${MOVE} group-hover:rotate-12`}>
        <g transform="rotate(-38 32 32)">
          <ellipse cx="32" cy="16" rx="13" ry="16" fill="#fff" fillOpacity=".75" />
          <path d="M24 4v24M28 1v30M32 0v32M36 1v30M40 4v24M21 8h22M19 13h26M19 18h26M21 24h22" stroke="#7c8a99" strokeWidth=".9" />
          <ellipse cx="32" cy="16" rx="13" ry="16" fill="none" stroke="#d32f2f" strokeWidth="3" />
          <path d="M32 32v16" stroke="#76828f" strokeWidth="3" />
          <path d="M28.500 34.500L32 31l3.500 3.500z" fill="#d32f2f" />
          <rect x="29" y="46" width="6" height="18" rx="2.500" fill="#0f6b3c" />
          <path d="M29 51l6-2M29 55.500l6-2M29 60l6-2" stroke="#0a4326" strokeWidth="1.200" />
        </g>
      </g>
      <g className={`${MOVE} group-hover:translate-x-1 group-hover:-translate-y-2`}>
        <g transform="rotate(35 50 22)">
          <path d="M42 9h16l-4.500 17h-7z" fill="#fff" stroke="#5b6876" strokeWidth="1.400" strokeLinejoin="round" />
          <path d="M47 9l1.500 17M53 9l-1.500 17M43.600 15h12.800M45 20h10" stroke="#5b6876" strokeWidth="1" />
          <path d="M46 26h8v2.500q0 5-4 5t-4-5z" fill="#f2c14e" stroke="#9a6b12" strokeWidth="1.200" />
        </g>
      </g>
    </svg>
  );
}

export function BasketballArt({ className }: ArtProps) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <rect x="5" y="3" width="54" height="36" rx="3" fill="#fff" stroke="#3a4252" strokeWidth="2" />
      <rect x="21" y="14" width="22" height="17" fill="none" stroke="#d32f2f" strokeWidth="2" />
      <path d="M19 38l4 22M27 39l1 23M37 39l-1 23M45 38l-4 22M20 44l8 8 8-11 8 10M22 54l6-4 8 5 7-5" fill="none" stroke="#7c8a99" strokeWidth="1.500" strokeLinecap="round" />
      <g className={`${MOVE} group-hover:translate-y-2 group-hover:rotate-45`}>
        <circle cx="32" cy="23" r="11.500" fill="#ef7d22" stroke="#6e3208" strokeWidth="1.600" />
        <path d="M32 11.500v23M20.500 23h23M24 15q6 8 0 16M40 15q-6 8 0 16" fill="none" stroke="#6e3208" strokeWidth="1.500" />
      </g>
      <path d="M17 37.500h30" stroke="#e0521a" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
