"use client";

import { forwardRef, useId } from "react";
import type { Pattern, Sleeve } from "@/lib/custom-jersey/types";

/**
 * A 2D jersey drawn as SVG: three colours, one of the built-in patterns,
 * and the team name, player name, number and logo on top.
 *
 * It is a guide for the customer and the designer, not the print file.
 * When image-layer templates arrive (docs/3d-store-and-app.md, step W4),
 * they replace the drawing here; the props stay the same.
 *
 * Everything is inline (no external fonts or images other than a data: logo)
 * so the same SVG can be turned into a PNG with svgToPng() and stored with
 * the order: the designer sees exactly what the customer saw.
 */

export interface JerseyPreviewProps {
  pattern: Pattern;
  /** [body, pattern, trim and text] */
  colors: string[];
  side: "front" | "back";
  sleeve?: Sleeve;
  teamName?: string;
  name?: string;
  number?: string;
  /** data: URL, so it survives the PNG export. */
  logo?: string | null;
  className?: string;
}

const BODY = "M95 30 L70 40 L70 320 L230 320 L230 40 L205 30";
const SLEEVES: Record<Sleeve, [string, string]> = {
  short: ["M70 40 L50 46 L8 104 L44 128 L70 100 Z", "M230 40 L250 46 L292 104 L256 128 L230 100 Z"],
  full: ["M70 40 L50 46 L2 232 L36 242 L70 120 Z", "M230 40 L250 46 L298 232 L264 242 L230 120 Z"],
};
const CUFFS: Record<Sleeve, [string, string]> = {
  short: ["M8 104 L44 128", "M292 104 L256 128"],
  full: ["M2 232 L36 242", "M298 232 L264 242"],
};
const FONT = "Impact, 'Arial Narrow Bold', 'Arial Black', 'Noto Sans Bengali', sans-serif";

function PatternShapes({ pattern, color }: { pattern: Pattern; color: string }) {
  switch (pattern) {
    case "stripes":
      return (
        <g fill={color}>
          {[86, 118, 150, 182, 214].map((x) => (
            <rect key={x} x={x - 8} y={20} width={16} height={310} />
          ))}
        </g>
      );
    case "hoops":
      return (
        <g fill={color}>
          {[70, 114, 158, 202, 246, 290].map((y) => (
            <rect key={y} x={60} y={y} width={180} height={22} />
          ))}
        </g>
      );
    case "sash":
      return <polygon fill={color} points="60,36 112,24 244,300 244,330 196,330" />;
    case "halves":
      return <rect fill={color} x={150} y={20} width={90} height={310} />;
    case "chevron":
      return <polygon fill={color} points="60,96 150,160 240,96 240,128 150,192 60,128" />;
    case "side-panels":
      return (
        <g fill={color}>
          <rect x={70} y={40} width={20} height={280} />
          <rect x={210} y={40} width={20} height={280} />
        </g>
      );
    default:
      return null;
  }
}

export const JerseyPreview = forwardRef<SVGSVGElement, JerseyPreviewProps>(function JerseyPreview(
  { pattern, colors, side, sleeve = "short", teamName = "", name = "", number = "", logo, className },
  ref
) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [body = "#0b3d91", second = "#ffffff", trim = "#c89b3c"] = colors;
  const neck = side === "front" ? "Q150 78 95 30" : "Q150 44 95 30";
  const bodyPath = `${BODY} ${neck} Z`;
  const [leftSleeve, rightSleeve] = SLEEVES[sleeve];
  const sleeveFill = pattern === "sleeves" ? second : body;

  // Long text is squeezed to fit rather than cut off.
  const fit = (text: string, max: number) => (text.length > 8 ? { textLength: max, lengthAdjust: "spacingAndGlyphs" as const } : {});
  const upper = (s: string) => s.toUpperCase();

  return (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 340" className={className} role="img" aria-label={`Jersey ${side}`}>
      <defs>
        <clipPath id={`body-${id}`}>
          <path d={bodyPath} />
        </clipPath>
      </defs>

      <path d={leftSleeve} fill={sleeveFill} />
      <path d={rightSleeve} fill={sleeveFill} />
      <path d={bodyPath} fill={body} />
      <g clipPath={`url(#body-${id})`}>
        <PatternShapes pattern={pattern} color={second} />
      </g>

      {/* Trim: collar and cuffs */}
      <path d={`M205 30 ${neck}`} fill="none" stroke={trim} strokeWidth={7} strokeLinecap="round" />
      {CUFFS[sleeve].map((d) => (
        <path key={d} d={d} stroke={trim} strokeWidth={7} strokeLinecap="round" />
      ))}

      {/* Outline, so a white jersey is visible on a white page */}
      <g fill="none" stroke="#0f172a" strokeOpacity={0.35} strokeWidth={1.5} strokeLinejoin="round">
        <path d={leftSleeve} />
        <path d={rightSleeve} />
        <path d={bodyPath} />
      </g>

      <g fontFamily={FONT} fill={trim} stroke="#0f172a" strokeOpacity={0.25} strokeWidth={0.6} textAnchor="middle">
        {side === "front" ? (
          <>
            {logo && <image href={logo} x={176} y={84} width={36} height={36} preserveAspectRatio="xMidYMid meet" />}
            {teamName && (
              <text x={150} y={150} fontSize={22} {...fit(teamName, 130)}>
                {upper(teamName)}
              </text>
            )}
            {number && (
              <text x={150} y={215} fontSize={56}>
                {number}
              </text>
            )}
          </>
        ) : (
          <>
            {name && (
              <text x={150} y={92} fontSize={22} {...fit(name, 120)}>
                {upper(name)}
              </text>
            )}
            {number && (
              <text x={150} y={210} fontSize={110}>
                {number}
              </text>
            )}
          </>
        )}
      </g>
    </svg>
  );
});

/** Renders an SVG element to a PNG blob (for storing the preview with the order). */
export async function svgToPng(svg: SVGSVGElement, width = 600): Promise<Blob | null> {
  const box = svg.viewBox.baseVal;
  const height = Math.round((width * box.height) / box.width);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;

  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("preview image failed"));
      image.src = url;
    });
  } catch {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f6f7f9";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
