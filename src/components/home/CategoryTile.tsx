import type { ReactNode } from "react";
import { HoverLink as Link } from "@/components/ui/HoverLink";
import { Ball } from "@/components/football/Ball";
import "./category-tiles.css";

/**
 * A home page category, each one a different thing from sport: the fourth
 * official's substitution board, a goal, a running track and a kit bag. The
 * photo is in the middle, the words below it. Looks and hover motion are in
 * category-tiles.css; colours are the same in light and dark.
 */

export type CategoryObject = "board" | "goal" | "track" | "bag";

/** What sticks out above the tile. */
function Top({ kind }: { kind: CategoryObject }) {
  if (kind === "board")
    return (
      <svg viewBox="0 0 80 26" className="as-ct-top w-20" focusable="false">
        <path d="M12 26V14Q12 5 21 5h38q9 0 9 9v12" fill="none" stroke="#0b0e12" strokeWidth="8" />
        <path d="M12 26V14Q12 5 21 5h38q9 0 9 9v12" fill="none" stroke="#8b949e" strokeWidth="5" />
        <path d="M26 5h28" stroke="#1c2229" strokeWidth="8" strokeLinecap="round" />
      </svg>
    );
  if (kind === "bag")
    return (
      <svg viewBox="0 0 150 40" className="as-ct-top w-[150px]" focusable="false">
        {/* Shuttlecock, ball and racket grip looking out of the bag. */}
        <g className="as-ct-peek">
          <path d="M28 40L16 12l8 3 5-5 6 5 8-3-7 28z" fill="#fff" stroke="#5d6b78" strokeWidth="1.300" strokeLinejoin="round" />
          <path d="M24 15l5 25M35 15l-4 25M20 24h20" fill="none" stroke="#5d6b78" />
        </g>
        <g className="as-ct-peek as-ct-peek-2">
          <circle cx="120" cy="26" r="15" fill="#b51c2e" stroke="#5f0a16" strokeWidth="1.300" />
          <path d="M112 13q12 13 2 27" fill="none" stroke="#f6e2bd" strokeWidth="2.500" strokeDasharray="2 2" />
        </g>
        <path d="M48 40V22Q48 7 75 7t27 15v18" fill="none" stroke="#0a1f4a" strokeWidth="9" />
        <path d="M48 40V22Q48 7 75 7t27 15v18" fill="none" stroke="#f5b81c" strokeWidth="6" />
        <path d="M64 8.500Q75 6 86 8.500" fill="none" stroke="#12264f" strokeWidth="9" strokeLinecap="round" />
      </svg>
    );
  return null;
}

/** On top of the photo. */
function Over({ kind }: { kind: CategoryObject }) {
  if (kind !== "goal") return null;
  return (
    <>
      <i className="as-ct-net" />
      <Ball className="as-ct-ball" />
    </>
  );
}

/** The strip between the photo and the words. */
function Seam({ kind }: { kind: CategoryObject }) {
  switch (kind) {
    case "board":
      return (
        <>
          <b className="as-ct-led as-ct-out">8</b>
          <svg viewBox="0 0 30 24" className="w-6 h-5" focusable="false">
            <path d="M9 3v16M9 19l-5-5M9 19l5-5" fill="none" stroke="#ff4b3a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M21 21V5M21 5l-5 5M21 5l5 5" fill="none" stroke="#4be06d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <b className="as-ct-led as-ct-in">
            <span>
              <i>10</i>
              <i>7</i>
              <i>11</i>
              <i>10</i>
            </span>
          </b>
        </>
      );
    case "goal":
      return <i className="as-ct-line" />;
    case "track":
      return (
        <>
          <i>1</i>
          <i>2</i>
          <svg viewBox="0 0 48 54" className="as-ct-watch" focusable="false">
            <path d="M24 10V4M18 3.500h12M39 14l4-4" stroke="#20262d" strokeWidth="6" strokeLinecap="round" />
            <path d="M24 10V4M18 3.500h12M39 14l4-4" stroke="#f5b81c" strokeWidth="3.500" strokeLinecap="round" />
            <circle cx="24" cy="31" r="20" fill="#f5b81c" stroke="#20262d" strokeWidth="2" />
            <circle cx="24" cy="31" r="15" fill="#fff" stroke="#20262d" strokeWidth="1.500" />
            <path d="M24 18.500v3M24 40.500v3M11.500 31h3M33.500 31h3" stroke="#20262d" strokeWidth="2" strokeLinecap="round" />
            <path className="as-ct-hand" d="M24 31V21" stroke="#d3122a" strokeWidth="2.500" strokeLinecap="round" />
            <circle cx="24" cy="31" r="2.200" fill="#20262d" />
          </svg>
          <i>3</i>
          <i>4</i>
        </>
      );
    case "bag":
      return (
        <>
          <i className="as-ct-zip" />
          <svg viewBox="0 0 22 30" className="as-ct-pull" focusable="false">
            <rect x="4" y="2" width="14" height="11" rx="3" fill="#dfe5ea" stroke="#39424c" strokeWidth="1.500" />
            <rect x="7.500" y="11" width="7" height="17" rx="3" fill="#f5b81c" stroke="#39424c" strokeWidth="1.500" />
          </svg>
        </>
      );
  }
}

export function CategoryTile({ kind, href, image, title, sub, action }: { kind: CategoryObject; href: string; image: string; title: string; sub: string; action: ReactNode }) {
  return (
    <Link href={href} className="as-ct" data-kind={kind}>
      <span aria-hidden className="contents">
        <Top kind={kind} />
      </span>
      <span className="as-ct-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} srcSet={`${image.replace(".webp", "-480.webp")} 480w, ${image} 800w`} sizes="(max-width: 1024px) 46vw, 290px" alt="" width={800} height={1000} loading="lazy" decoding="async" />
        <span aria-hidden className="contents">
          <Over kind={kind} />
        </span>
      </span>
      <span className="as-ct-seam" aria-hidden>
        <Seam kind={kind} />
      </span>
      <span className="as-ct-body">
        <span className="font-display uppercase font-bold text-lg sm:text-2xl leading-tight">{title}</span>
        <span className="text-xs text-white/90 leading-snug">{sub}</span>
        <span className="mt-auto pt-2.5">{action}</span>
      </span>
    </Link>
  );
}
