"use client";

import { useEffect, useState } from "react";

/** Counts down to a campaign's real end time. Hidden once the time has passed. */
export function Countdown({ endsAt }: { endsAt: string }) {
  const end = new Date(endsAt).getTime();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setLeft(Math.max(0, end - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [end]);

  if (left === null || left <= 0) return null;
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  const m = Math.floor((left % 3600000) / 60000);
  const s = Math.floor((left % 60000) / 1000);
  const parts: [number, string][] = [[d, "d"], [h, "h"], [m, "m"], [s, "s"]];
  return (
    <div className="mt-3 inline-flex items-center gap-2 bg-primary text-white rounded-lg px-3 py-1.5" role="timer" aria-label="Time left">
      <span className="text-[10px] font-display uppercase tracking-widest opacity-80">Ends in</span>
      {parts.map(([n, u]) => (
        <span key={u} className="font-display font-bold text-sm tabular-nums">
          {String(n).padStart(2, "0")}
          <span className="text-[10px] opacity-70 ml-0.5">{u}</span>
        </span>
      ))}
    </div>
  );
}
