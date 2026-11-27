import type { ReactNode } from "react";
import type { SportFrame } from "@/lib/sport-frames";

/**
 * A product card dressed as something from sport: a match ticket, a scoreboard
 * or a locker. Picture in the middle, text below; every frame has the same
 * measurements, so a mixed grid stays in line. Colours and hover motion are
 * `.as-sc` in globals.css, which also re-points the theme text colours, so the
 * content keeps using the normal token classes.
 */

/** The strip between the picture and the text. */
function Seam({ frame }: { frame: SportFrame }) {
  switch (frame) {
    case "plain":
      return null;
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
    case "locker":
      return (
        <>
          <i className="as-sc-vent" />
          <i className="as-sc-vent" />
          <i className="as-sc-vent" />
        </>
      );
  }
}

export function SportCard({ frame, media, className = "", children }: { frame: SportFrame; media: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`as-sc group ${className}`} data-frame={frame}>
      <div className="as-sc-head">
        <div className="as-sc-media">{media}</div>
        <div className="as-sc-seam" aria-hidden>
          <Seam frame={frame} />
        </div>
      </div>
      <div className="as-sc-body">
        {frame === "locker" && <i aria-hidden className="as-sc-handle" />}
        {children}
      </div>
    </div>
  );
}
