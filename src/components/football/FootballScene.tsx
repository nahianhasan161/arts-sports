import type { CSSProperties } from "react";
import { Ball } from "./Ball";
import { Head, type Look } from "./Faces";
import "./football-scene.css";

/**
 * Three mini cartoon footballers passing a ball around, for the home hero.
 * Plain HTML and CSS: no images, no canvas, no script. Only transforms are
 * animated. The players are caricatures (Faces.tsx): no names, crests, makers'
 * marks or sponsors.
 */

function Player({ look, number, x, y, size, dir, delay }: { look: Look; number: string; x: number; y: number; size: number; dir: 1 | -1; delay: number }) {
  const style = { "--x": x, "--y": y, "--size": size, "--dir": dir, "--delay": `${delay}s` } as CSSProperties;
  return (
    <div className={`fb-player fb-${look}`} style={style}>
      <span className="fb-shadow" />
      <div className="fb-figure">
        <span className="fb-leg fb-leg-stand" />
        <span className="fb-leg fb-leg-kick" />
        <span className="fb-arm fb-arm-l" />
        <span className="fb-arm fb-arm-r" />
        <span className="fb-neck" />
        <span className="fb-shorts" />
        <span className="fb-torso">
          <b>{number}</b>
        </span>
        <Head look={look} />
      </div>
    </div>
  );
}

/** Stadium behind the hero: crowd, floodlights and the pitch in perspective. */
export function Stadium() {
  return (
    <div className="fb-stadium" aria-hidden>
      <div className="fb-crowd" />
      <div className="fb-light fb-light-l" />
      <div className="fb-light fb-light-r" />
      <div className="fb-boards" />
      <div className="fb-grass">
        <div className="fb-turf" />
      </div>
    </div>
  );
}

export function FootballScene({ className = "" }: { className?: string }) {
  return (
    <div className={`fb-scene ${className}`} aria-hidden>
      <div className="fb-stage">
        <div className="fb-goal" />
        {/* Same 6 s loop for everyone; the delays put each kick on the ball's beat. */}
        <Player look="seven" number="7" x={50} y={17} size={3.3} dir={1} delay={-4.2} />
        <Player look="ten" number="10" x={17} y={6} size={4} dir={1} delay={0} />
        <Player look="eleven" number="10" x={83} y={6} size={4} dir={-1} delay={-2.4} />
        <div className="fb-ball-path">
          <span className="fb-ball-shadow" />
          <div className="fb-ball-arc">
            <Ball className="fb-ball" />
          </div>
        </div>
      </div>
    </div>
  );
}
