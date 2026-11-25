import type { ReactNode } from "react";
import type { SportFrame } from "@/lib/sport-frames";

/**
 * A product card dressed as something from sport: a referee's card, a match
 * ticket, a tactics board, a scoreboard, a locker, a wicket, a cricket ball, a
 * badminton net or a basketball hoop. Picture in the middle, text below; every
 * frame has the same measurements, so a mixed grid stays in line. Colours and
 * hover motion are `.as-sc` in globals.css, which also re-points the theme text
 * colours, so the content keeps using the normal token classes.
 */

const CENTRE = "absolute left-1/2 -translate-x-1/2 pointer-events-none";

/** The piece that sticks out above the card. */
function Top({ frame }: { frame: SportFrame }) {
  if (frame === "tactics")
    return (
      <svg viewBox="0 0 56 20" className={`${CENTRE} -top-2.5 w-14 h-5 z-10`} focusable="false">
        <path d="M20 8a8 7 0 0 1 16 0" fill="none" stroke="#8b949e" strokeWidth="3" />
        <rect x="4" y="7" width="48" height="11" rx="3" fill="#c9d1d9" stroke="#8b949e" />
        <path d="M8 10h40" stroke="#fff" strokeWidth="1.500" strokeLinecap="round" />
      </svg>
    );
  if (frame === "wicket")
    return (
      <svg viewBox="0 0 48 30" className={`${CENTRE} -top-4 w-12 h-[30px] -z-10 overflow-visible`} focusable="false">
        <path d="M8 6v24M24 6v24M40 6v24" stroke="#b07a35" strokeWidth="6" strokeLinecap="round" />
        <path d="M7 7v23M23 7v23M39 7v23" stroke="#eccb93" strokeWidth="2" strokeLinecap="round" />
        <g className="as-sc-bail-l"><path d="M8 2.500h14" stroke="#8a5a1f" strokeWidth="3.500" strokeLinecap="round" /></g>
        <g className="as-sc-bail-r"><path d="M26 2.500h14" stroke="#8a5a1f" strokeWidth="3.500" strokeLinecap="round" /></g>
      </svg>
    );
  return null;
}

/** The strip between the picture and the text. */
function Seam({ frame }: { frame: SportFrame }) {
  switch (frame) {
    case "yellow":
    case "red":
      return (
        <>
          <i className="as-sc-rule" />
          <svg viewBox="0 0 32 22" className="as-sc-move w-7 h-5 shrink-0" focusable="false">
            <path d="M2 6h17a7.500 7.500 0 1 1-7.500 7.500V11H2z" fill="currentColor" stroke="currentColor" strokeWidth="1.500" strokeLinejoin="round" />
            <circle cx="19" cy="13.500" r="3.200" fill="var(--sc)" />
            <path d="M12 3.200V.8M16 3.200l1-2.400M8 3.200L7 .8" stroke="currentColor" strokeWidth="1.500" strokeLinecap="round" />
          </svg>
          <i className="as-sc-rule" />
        </>
      );
    case "ticket":
      return <i className="as-sc-barcode" />;
    case "scoreboard":
      return (
        <>
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} className="as-sc-lamp" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </>
      );
    case "tactics":
      return (
        <>
          <i className="as-sc-rule" />
          <i className="as-sc-spot" />
          <i className="as-sc-rule" />
        </>
      );
    case "locker":
      return (
        <>
          <i className="as-sc-vent" />
          <i className="as-sc-vent" />
          <i className="as-sc-vent" />
        </>
      );
    case "wicket":
      return <i className="as-sc-crease" />;
    case "ball":
      return <i className="as-sc-stitch" />;
    case "net":
    case "netblue":
      return (
        <>
          <i className="as-sc-mesh" />
          <svg viewBox="0 0 24 24" className="as-sc-move absolute left-2 -top-3 w-5 h-5" focusable="false">
            <path d="M8.500 15L4 3h16l-4.500 12z" fill="#fff" stroke="#5d6b78" strokeWidth="1.300" strokeLinejoin="round" />
            <path d="M9.500 3l1 12M14.500 3l-1 12M6 8.500h12" stroke="#5d6b78" />
            <path d="M8 15h8v2a4 4 0 0 1-8 0z" fill="#d9a520" stroke="#5d6b78" strokeWidth="1.200" />
          </svg>
        </>
      );
    case "hoop":
      return (
        <svg viewBox="0 0 48 30" className={`${CENTRE} -top-2 w-12 h-[30px] overflow-visible`} focusable="false">
          <g className="as-sc-move">
            <circle cx="24" cy="0" r="8" fill="#e8681a" stroke="#5a2406" strokeWidth="1.300" />
            <path d="M24-8V8M16 0h16M18.500-5.500q5 5.500 0 11M29.500-5.500q-5 5.500 0 11" fill="none" stroke="#5a2406" />
          </g>
          <path d="M8 11l5 15h22l5-15M13 11l6 15M19 11l10 15M29 11L19 26M35 11l-6 15M40 11L13 22M8 11l27 11" fill="none" stroke="#fff" strokeWidth="1.300" />
          <path d="M6 10h36" stroke="#c2340f" strokeWidth="3.500" strokeLinecap="round" />
        </svg>
      );
  }
}

/** Faint drawing behind the text. */
function Back({ frame }: { frame: SportFrame }) {
  if (frame === "tactics")
    return (
      <svg viewBox="0 0 90 60" className="as-sc-back" focusable="false">
        <path d="M8 14l10 10M18 14L8 24" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="74" cy="46" r="6" fill="none" stroke="#fff" strokeWidth="3" />
        <path className="as-sc-run" d="M24 22c20 2 12 26 40 24" fill="none" stroke="#ffe066" strokeWidth="2.500" strokeDasharray="5 5" />
      </svg>
    );
  if (frame === "locker") return <i className="as-sc-handle" />;
  return null;
}

export function SportCard({ frame, media, className = "", children }: { frame: SportFrame; media: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`as-sc group ${className}`} data-frame={frame}>
      <span aria-hidden className="contents">
        <Top frame={frame} />
      </span>
      <div className="as-sc-head">
        <div className="as-sc-media">{media}</div>
        <div className="as-sc-seam" aria-hidden>
          <Seam frame={frame} />
        </div>
      </div>
      <div className="as-sc-body">
        <span aria-hidden className="contents">
          <Back frame={frame} />
        </span>
        {children}
      </div>
    </div>
  );
}
