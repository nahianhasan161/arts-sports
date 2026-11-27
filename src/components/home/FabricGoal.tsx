"use client";

import type { CSSProperties } from "react";
import { Ball } from "@/components/football/Ball";
import { formatMoney, localized } from "@/i18n";
import { useT } from "@/i18n/client";
import type { Fabric } from "@/lib/custom-jersey/types";
import "./fabric-goal.css";

/**
 * The fabrics of the order form as jerseys hung on the crossbar of a goal: each
 * shirt is drawn in the weave of its fabric (or filled with the shop's photo of
 * it), with the name and the price where a player's name and number go, and the
 * description on the label below. Looks and motion: fabric-goal.css.
 */

const SHIRT = "M70 8L40 18Q24 23 17 40L2 88Q1 92 5 94L33 104Q37 105 38 101L43 84V204Q43 210 49 210.500Q100 216 151 210.500Q157 210 157 204V84L162 101Q163 105 167 104L195 94Q199 92 198 88L183 40Q176 23 160 18L130 8Q100 22 70 8Z";
/* Dark enough for white letters. */
const COLOURS = ["#b5162b", "#1d4aa8", "#6a2490", "#0b6470", "#a3400a", "#26323f"];

type Weave = "mesh" | "interlock" | "pique" | "jacquard" | "hex" | "twill";

/** The weave to draw, read from the fabric's name; the shop adds fabrics itself. */
function weaveOf(f: Fabric): Weave {
  const name = `${f.slug} ${f.name_en}`.toLowerCase();
  if (/honey|comb|hex/.test(name)) return "hex";
  if (/mesh|net/.test(name)) return "mesh";
  if (/jac|premium/.test(name)) return "jacquard";
  if (/pique|polo|lacoste/.test(name)) return "pique";
  if (/inter|pp|rib|knit/.test(name)) return "interlock";
  return "twill";
}

/** One repeat of the weave: size, then the drawing. */
function Cloth({ weave, id }: { weave: Weave; id: string }) {
  const dark = "rgb(0 0 0 / 0.3)";
  const light = "rgb(255 255 255 / 0.2)";
  switch (weave) {
    case "mesh":
      return (
        <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse">
          <path d="M2.300 2.300h.01M6.800 6.800h.01" stroke="rgb(0 0 0 / 0.42)" strokeWidth="3.400" strokeLinecap="round" />
        </pattern>
      );
    case "interlock":
      return (
        <pattern id={id} width="8" height="7" patternUnits="userSpaceOnUse">
          <path d="M0 0l4 4 4-4" fill="none" stroke={light} strokeWidth="1.600" />
          <path d="M0 0v7" stroke={dark} strokeWidth="1.200" />
        </pattern>
      );
    case "pique":
      return (
        <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M1 1h3v3H1zM5 5h3v3H5z" fill={dark} />
          <path d="M1 4.500h3M5 .5h3" stroke={light} />
        </pattern>
      );
    case "jacquard":
      return (
        <pattern id={id} width="26" height="36" patternUnits="userSpaceOnUse">
          <path d="M13 1l12 17-12 17L1 18z" fill="rgb(255 255 255 / 0.13)" />
          <path d="M13 9l6.500 9-6.500 9-6.500-9z" fill={dark} />
        </pattern>
      );
    case "hex":
      return (
        <pattern id={id} width="14" height="24.200" patternUnits="userSpaceOnUse">
          <path d="M7 0v4l7 4v8l-7 4-7-4V8l7-4M7 20v4.200" fill="none" stroke={light} strokeWidth="1.600" />
        </pattern>
      );
    default:
      return (
        <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <path d="M1 0v6" stroke={light} strokeWidth="1.500" />
        </pattern>
      );
  }
}

function Shirt({ fabric, id, colour }: { fabric: Fabric; id: string; colour: string }) {
  return (
    <svg viewBox="0 0 200 216" className="as-fg-shirt" aria-hidden focusable="false">
      <defs>
        <Cloth weave={weaveOf(fabric)} id={`${id}-w`} />
        <clipPath id={`${id}-c`}>
          <path d={SHIRT} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-c)`}>
        <path d={SHIRT} fill={colour} />
        {fabric.image_url ? (
          <>
            <image href={fabric.image_url} width="200" height="216" preserveAspectRatio="xMidYMid slice" />
            <path d="M43 50h114v96H43z" fill="rgb(8 14 20 / 0.82)" />
          </>
        ) : (
          <path d={SHIRT} fill={`url(#${id}-w)`} />
        )}
        {/* Sleeve seams, folds, cuffs and hem */}
        <path d="M43 84Q42 48 58 13M157 84q1-36-15-71" fill="none" stroke="rgb(0 0 0 / 0.35)" strokeWidth="2" />
        <path d="M43 84Q58 150 52 212M157 84q-15 66-9 128" fill="none" stroke="rgb(0 0 0 / 0.16)" strokeWidth="9" />
        <path d="M0 87l39 13.500M200 87l-39 13.500M40 205q60 9 120 0" fill="none" stroke="#fff" strokeWidth="5" />
      </g>
      <path d="M70 8Q100 22 130 8Q100 33 70 8Z" fill="#0b1118" />
      <path d="M70 8Q100 36 130 8" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d={SHIRT} fill="none" stroke="rgb(0 0 0 / 0.45)" strokeWidth="1.500" />
    </svg>
  );
}

/** Hook over the crossbar and the shoulders of the hanger. */
function Hanger() {
  return (
    <svg viewBox="0 0 80 44" className="as-fg-hanger" aria-hidden focusable="false">
      <path d="M40 34V21q0-3 3-5 6-4 6-9 0-6-7.500-6T33 8" fill="none" stroke="#0b1118" strokeWidth="5" strokeLinecap="round" />
      <path d="M40 34V21q0-3 3-5 6-4 6-9 0-6-7.500-6T33 8" fill="none" stroke="#dfe5ea" strokeWidth="2.800" strokeLinecap="round" />
      <path d="M8 43Q38 37 40 30Q42 37 72 43" fill="none" stroke="#8a5a1f" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** What was left on the goal line after training. */
function Gear() {
  return (
    <div className="as-fg-gear" aria-hidden>
      <Ball className="as-fg-ball" />
      {/* Cones */}
      <svg viewBox="0 0 70 34" className="w-16" focusable="false">
        <path d="M2 32h30l-3-4H5zM10 28l5-22h4l5 22z" fill="#f26a1b" stroke="#7a2d04" strokeWidth="1.300" strokeLinejoin="round" />
        <path d="M12.200 19h9.600l1 4.500H11.200z" fill="#fff" />
        <path d="M38 32h30l-3-4H41zM46 28l5-22h4l5 22z" fill="#f26a1b" stroke="#7a2d04" strokeWidth="1.300" strokeLinejoin="round" />
        <path d="M48.200 19h9.600l1 4.500H47.200z" fill="#fff" />
      </svg>
      {/* Bat and cricket ball */}
      <svg viewBox="0 0 120 34" className="w-28" focusable="false">
        <path d="M4 20l31-3v8L4 25q-3-2.500 0-5z" fill="#1c2f6b" stroke="#0c1738" strokeWidth="1.200" />
        <path d="M35 16q4-3 12-3h44q7 0 7 8t-7 9H47q-8 0-12-4z" fill="#f0d6a3" stroke="#8a5a1f" strokeWidth="1.300" />
        <path d="M44 27.500h50" stroke="#bf8d49" strokeWidth="3" />
        <circle cx="110" cy="23" r="9" fill="#b51c2e" stroke="#5f0a16" strokeWidth="1.200" />
        <path d="M106 15.500q6 7 0 15" fill="none" stroke="#f6e2bd" strokeWidth="1.800" strokeDasharray="2 1.500" />
      </svg>
      {/* Shuttlecock */}
      <svg viewBox="0 0 40 34" className="w-9" focusable="false">
        <path d="M30 18.500L8 6 5 12l3 4-3 5 4 4-1 6 22-6z" fill="#fff" stroke="#5d6b78" strokeWidth="1.300" strokeLinejoin="round" />
        <path d="M8 16l22 4M9 25l21-3.500M17 11.500L16 29" fill="none" stroke="#5d6b78" />
        <path d="M30 17.500q8-1 8 4.200t-8 4.300z" fill="#f2c14e" stroke="#9a6b12" strokeWidth="1.200" />
      </svg>
      {/* Basketball */}
      <svg viewBox="0 0 40 40" className="w-10" focusable="false">
        <circle cx="20" cy="20" r="18" fill="#ef7d22" stroke="#6e3208" strokeWidth="1.800" />
        <path d="M20 2v36M2 20h36M8 7q10 13 0 26M32 7q-10 13 0 26" fill="none" stroke="#6e3208" strokeWidth="1.600" />
      </svg>
    </div>
  );
}

/** Shirts in a row from 768 px up; two on phones. */
function columns(count: number) {
  if (count <= 4) return count;
  return count === 5 || count === 6 || count === 9 ? 3 : 4;
}

export function FabricGoal({ fabrics }: { fabrics: (Fabric & { price: number })[] }) {
  const { t, locale } = useT();
  const cols = columns(fabrics.length);
  const layout = { "--cols": cols, "--rows": Math.ceil(fabrics.length / cols), "--rows-sm": Math.ceil(fabrics.length / 2) } as CSSProperties;
  return (
    <div className="as-fg">
      <ul style={layout}>
        {fabrics.map((f, i) => {
          const row = f as unknown as Record<string, unknown>;
          const name = localized(row, "name", locale);
          const price = formatMoney(f.price, locale);
          return (
            <li key={f.id}>
              <div className="as-fg-kit">
                <Hanger />
                <Shirt fabric={f} id={`fg${i}`} colour={COLOURS[i % COLOURS.length]} />
                <div className="as-fg-back">
                  <h3 data-long={name.length > 15 || undefined}>{name}</h3>
                  <p data-long={price.length > 5 || undefined}>{price}</p>
                  <small>{t("home.fabric.unit")}</small>
                </div>
              </div>
              <p className="as-fg-label">{localized(row, "description", locale)}</p>
            </li>
          );
        })}
      </ul>
      <Gear />
    </div>
  );
}
