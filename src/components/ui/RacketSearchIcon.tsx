/** The search icon: a magnifying glass made of a badminton racket. The strings take `currentColor`. */
export function RacketSearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      <g transform="rotate(-45 16 16)">
        <path d="M16 18.500v5" stroke="#b9c3cc" strokeWidth="1.800" />
        <path d="M16 23v8.500" stroke="#23282e" strokeWidth="3.800" strokeLinecap="round" />
        <path d="M14.300 25.500l3.400-1M14.300 28l3.400-1M14.300 30.500l3.400-1" stroke="#ffcf33" strokeWidth="0.900" />
        <ellipse cx="16" cy="9" rx="8.200" ry="9.700" fill="currentColor" fillOpacity="0.14" />
        <path d="M10.500 2.500v13M13.250 0v18M16-.500v19M18.750 0v18M21.500 2.500v13M9 4h14M8 7.300h16M8 10.600h16M9 13.900h14" stroke="currentColor" strokeWidth="0.700" strokeOpacity="0.85" />
        <ellipse cx="16" cy="9" rx="8.200" ry="9.700" fill="none" stroke="#14181d" strokeOpacity="0.45" strokeWidth="3.200" />
        <ellipse cx="16" cy="9" rx="8.200" ry="9.700" fill="none" stroke="#ffcf33" strokeWidth="2.200" />
        <path d="M12.500 17.600Q16 20.500 19.500 17.600" fill="none" stroke="#c8102e" strokeWidth="1.800" strokeLinecap="round" />
      </g>
    </svg>
  );
}
