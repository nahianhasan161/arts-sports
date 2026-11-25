"use client";

import { Ball } from "@/components/football/Ball";
import { useT } from "@/i18n/client";
import type { MessageKey } from "@/i18n";
import "./steps-pitch.css";

/**
 * The four steps of a custom order as one move on a pitch: the ball is passed
 * from step to step and into the goal, and the jersey goes from a chalk sketch
 * to a finished kit. Upright on phones. Positions and motion: steps-pitch.css.
 */

const SHIRT = "M33 12L14 20 2 42l16 10 7-8v48q25 4 50 0V44l7 8 16-10-12-22-19-8q-17 14-34 0z";
const SHIRT_RIGHT = "M50 19q8 0 17-7l19 8 12 22-16 10-7-8v48q-12 2-25 2z";
const SASH = "M25 78L67.500 12 75 15.500V30L34 93.200l-9-1.200z";
const NAVY = "#1b2750";
const GOLD = "#e3b64e";

function Shirt({ step, number }: { step: number; number: string }) {
  return (
    <svg viewBox="-4 0 108 104" className="as-sp-shirt" focusable="false">
      {step <= 2 && <path d={SHIRT} fill="rgb(255 255 255 / 0.1)" stroke="#fff" strokeWidth="2.200" strokeDasharray="5 4" strokeLinejoin="round" />}
      {step === 2 && (
        <>
          <path d={SHIRT_RIGHT} fill={NAVY} />
          <path d="M50 39.200L67.500 12 75 15.500V30L50 68.500z" fill={GOLD} />
          <path d={SHIRT_RIGHT} fill="none" stroke="#fff" strokeWidth="2.200" strokeLinejoin="round" />
        </>
      )}
      {step >= 3 && (
        <>
          <path d={SHIRT} fill={NAVY} />
          <path d={SASH} fill={GOLD} />
          {step === 4 && <path d="M3.500 43.500l15 8.600M96.500 43.500l-15 8.600M25.500 89q24.500 4 49 0" fill="none" stroke={GOLD} strokeWidth="4.500" />}
          <path d={SHIRT} fill="none" stroke="#fff" strokeWidth="2.200" strokeLinejoin="round" />
          <path d="M33 12q17 14 34 0" fill="none" stroke="#fff" strokeWidth="4.500" strokeLinecap="round" />
        </>
      )}
      <text x="50" y="68" textAnchor="middle" className="as-sp-num" fill={step === 1 ? "none" : "#fff"} stroke={step === 1 ? "#fff" : NAVY} strokeWidth={step === 1 ? 1.4 : 5} strokeLinejoin="round" paintOrder="stroke">
        {number}
      </text>
    </svg>
  );
}

/** What each step is about, at the corner of the shirt. */
function Prop({ step }: { step: number }) {
  switch (step) {
    case 1: // pencil
      return (
        <svg viewBox="0 0 40 40" focusable="false">
          <path d="M6 34l2.500-9L28 5.500q2-2 4 0l2.500 2.500q2 2 0 4L15 31.500z" fill="#f5b81c" stroke="#10241a" strokeWidth="2" strokeLinejoin="round" />
          <path d="M6 34l2.500-9 6.500 6.500z" fill="#fbe6c4" stroke="#10241a" strokeWidth="2" strokeLinejoin="round" />
          <path d="M25 8.500l6.500 6.500 3-3q2-2 0-4L32 5.500q-2-2-4 0z" fill="#e5484d" stroke="#10241a" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case 2: // price tag
      return (
        <svg viewBox="0 0 40 40" focusable="false">
          <path d="M5 8q0-3 3-3h12l15 15q2 2 0 4L24 35q-2 2-4 0L5 20z" fill="#fff" stroke="#10241a" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="11.500" cy="11.500" r="2.600" fill="#10241a" />
          <text x="21" y="28" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0b5332">৳</text>
        </svg>
      );
    case 3: // the toss coin
      return (
        <svg viewBox="0 0 40 40" className="as-sp-coin" focusable="false">
          <circle cx="20" cy="20" r="17" fill="#f5c542" stroke="#6b4705" strokeWidth="2" />
          <circle cx="20" cy="20" r="12.500" fill="#e2a51f" stroke="#8a5f0c" strokeWidth="1.400" />
          <text x="20" y="26.500" textAnchor="middle" fontSize="18" fontWeight="700" fill="#4a3000">৳</text>
        </svg>
      );
    default: // parcel
      return (
        <svg viewBox="0 0 40 40" focusable="false">
          <path d="M4 12L20 5l16 7v18l-16 7-16-7z" fill="#d9a066" stroke="#10241a" strokeWidth="2" strokeLinejoin="round" />
          <path d="M4 12l16 7v18L4 30z" fill="#c2884d" />
          <path d="M4 12l16 7 16-7M20 19v18" fill="none" stroke="#10241a" strokeWidth="2" strokeLinejoin="round" />
          <path d="M12 8.500l16 7v6" fill="none" stroke="#fff" strokeWidth="3.500" />
        </svg>
      );
  }
}

export function StepsPitch({ steps, percent }: { steps: MessageKey[]; percent: number }) {
  const { t, locale } = useT();
  const num = (n: number) => new Intl.NumberFormat(locale === "bn" ? "bn-BD" : "en-IN").format(n);
  return (
    <div className="as-sp">
      <span aria-hidden className="contents">
        <i className="as-sp-lines" />
        <i className="as-sp-box as-sp-box-own" />
        <i className="as-sp-box" />
        <i className="as-sp-goal">
          <i />
        </i>
      </span>
      <div className="as-sp-field">
        <ol>
          {steps.map((key, i) => (
            <li key={key} data-step={i + 1}>
              <svg className="as-sp-pass" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden focusable="false">
                <path d="M0 0L100 100" vectorEffect="non-scaling-stroke" />
              </svg>
              <span className="as-sp-kit" aria-hidden>
                <span className="as-sp-hop">
                  <Shirt step={i + 1} number={num(i + 1)} />
                  <span className="as-sp-prop">
                    <Prop step={i + 1} />
                  </span>
                </span>
              </span>
              <p>{t(key, { percent: num(percent) })}</p>
            </li>
          ))}
        </ol>
        <span className="as-sp-ball" aria-hidden>
          <Ball />
        </span>
      </div>
      <b className="as-sp-cheer" aria-hidden>
        {t("home.how.goal")}
      </b>
    </div>
  );
}
