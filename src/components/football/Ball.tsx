import type { CSSProperties } from "react";

/** A football as a tiny inline SVG. Decorative; size it with className. */
export function Ball({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden focusable="false">
      <circle cx="50" cy="50" r="48" fill="#fff" stroke="#1b2a22" strokeWidth="3" />
      <path d="M50 33l16 12-6 19H40l-6-19z" fill="#1b2a22" />
      <path d="M50 33V14M66 45l19-6M60 64l11 16M40 64L29 80M34 45l-19-6" stroke="#1b2a22" strokeWidth="3.5" />
      <path d="M38 4q12-4 24 0l-12 11zM97 41q2 13-3 24L84 39zM82 84q-9 9-21 12l10-17zM18 84q9 9 21 12L29 79zM3 41q-2 13 3 24l10-26z" fill="#1b2a22" />
    </svg>
  );
}
