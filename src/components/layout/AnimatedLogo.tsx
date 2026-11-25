"use client";

import { useEffect, useState } from "react";
import { DOT, LETTERS, STRIPES, TAGLINE } from "./logo-paths";
import "./animated-logo.css";

/** One loop: the 4.4 s lap (`--lap` in the CSS) and a second as the plain logo. */
const LOOP_MS = 5400;

/** When the ball lands on a letter, as a share of the lap (see `as-logo-x`). */
const HITS: Record<string, number> = { a: 0.17, t: 0.26, s2: 0.36, o: 0.45, rt: 0.53, s3: 0.61 };
/** The ball only passes over the p, which takes its colour without a hop. */
const PASSES: Record<string, number> = { p: 0.405 };

/** Each lap is played with the next ball. Drawn around 0,0 with radius 17. */
const BALLS = [
  {
    color: "#22a45d",
    art: (
      <>
        <circle r="16" fill="#fff" stroke="#14181d" strokeWidth="2" />
        <path d="M0-7L6.7-2.2L4.1 5.7H-4.1L-6.7-2.2Z" fill="#14181d" />
        <path d="M0-7V-15M6.7-2.2L14.5-5M4.1 5.7L9 12.5M-4.1 5.7L-9 12.5M-6.7-2.2L-14.5-5" stroke="#14181d" strokeWidth="2.4" />
      </>
    ),
  },
  {
    color: "#c22a3a",
    art: (
      <>
        <circle r="17" fill="#c22a3a" />
        <path d="M-4-16.5Q4 0-4 16.5M4-16.5Q12 0 4 16.5" fill="none" stroke="#f6e2bd" strokeWidth="2.4" strokeDasharray="3 2" />
      </>
    ),
  },
  {
    color: "#e8792b",
    art: (
      <>
        <circle r="16" fill="#e8792b" stroke="#3a1804" strokeWidth="2" />
        <path d="M-16 0H16M0-16V16M-11-11.5Q-2 0-11 11.5M11-11.5Q2 0 11 11.5" fill="none" stroke="#3a1804" strokeWidth="2.2" />
      </>
    ),
  },
  {
    color: "#b9d21f",
    art: (
      <>
        <circle r="16.5" fill="#cbe236" stroke="#8ba510" strokeWidth="1" />
        <path d="M-9-14Q3 0-9 14M9-14Q-3 0 9 14" fill="none" stroke="#fff" strokeWidth="2.8" />
      </>
    ),
  },
];

/**
 * The logo, where the dot of the mark is a ball: it is kicked out, bounces over
 * the letters and drops back into its place. At rest it is the plain logo.
 * Loops, with the next ball each time; never with reduced motion.
 */
export function AnimatedLogo({ className }: { className?: string }) {
  const [lap, setLap] = useState(0);

  useEffect(() => {
    const loop = window.setInterval(() => {
      if (document.hidden || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      setLap((n) => n + 1);
    }, LOOP_MS);
    return () => window.clearInterval(loop);
  }, []);

  const ball = BALLS[lap % BALLS.length];

  return (
    <svg
      viewBox="0 0 578 144"
      role="img"
      aria-label="arts sports"
      className={`as-logo ${className ?? ""}`}
      style={{ "--logo-ball": ball.color } as React.CSSProperties}
    >
      {/* The key restarts every CSS animation for a new lap. */}
      <g key={lap} fill="currentColor" fillRule="evenodd">
        {STRIPES.map((d, i) => (
          <path key={d} className="as-logo-stripe" d={d} style={{ "--i": i } as React.CSSProperties} />
        ))}
        {LETTERS.map(({ id, ink, body }) => (
          <g
            key={id}
            className={id in HITS ? "as-logo-hit" : undefined}
            style={{ "--at": HITS[id] ?? PASSES[id] ?? 0 } as React.CSSProperties}
          >
            {body && <path className="as-logo-body" d={body} />}
            <path d={ink} />
          </g>
        ))}
        <path d={TAGLINE} />
        <g className="as-logo-ripple" transform={`translate(${DOT.x} ${DOT.y + DOT.r})`}>
          <ellipse rx="24" ry="5" />
        </g>
        <g className="as-logo-x" style={{ transform: `translateX(${DOT.x}px)` }}>
          <g className="as-logo-y" style={{ transform: `translateY(${DOT.y}px)` }}>
            <g className="as-logo-size">
              <circle r={DOT.r} />
              <g className="as-logo-ball">
                <g transform={`scale(${DOT.r / 17})`}>{ball.art}</g>
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
