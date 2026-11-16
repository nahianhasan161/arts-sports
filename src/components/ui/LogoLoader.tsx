/**
 * Loading state: the Arts Sports logo fills up with rippling water.
 * The logo file is used as a CSS mask, so only its shape shows the water.
 */
const LOGO = "/main-logo-arts-sports.webp";

const mask: React.CSSProperties = {
  WebkitMaskImage: `url("${LOGO}")`,
  maskImage: `url("${LOGO}")`,
  WebkitMaskSize: "contain",
  maskSize: "contain",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
  WebkitMaskPosition: "center",
  maskPosition: "center",
};

// One wave period, tiled twice so translating by -50% loops seamlessly.
const WAVE =
  "M0 10 Q 25 0 50 10 T 100 10 T 150 10 T 200 10 V 40 H 0 Z";

export default function LogoLoader({ label = "Loading", className = "min-h-[60vh]" }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex ${className} w-full flex-col items-center justify-center gap-4 bg-surface px-4`}
    >
      <div className="relative aspect-[220/36] w-56 sm:w-72" style={mask}>
        {/* empty glass: faint logo outline */}
        <div className="absolute inset-0 bg-on-surface/10" />

        {/* water body rising from the bottom */}
        <div className="logo-water absolute inset-x-0 bottom-0">
          <svg
            className="logo-wave logo-wave-back absolute -top-[10px] left-0 h-[14px] w-[200%]"
            viewBox="0 0 200 20"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d={WAVE} fill="#38bdf8" opacity="0.6" />
          </svg>
          <svg
            className="logo-wave absolute -top-[8px] left-0 h-[12px] w-[200%]"
            viewBox="0 0 200 20"
            preserveAspectRatio="none"
            aria-hidden
          >
            <path d={WAVE} fill="#0ea5e9" />
          </svg>
          <div className="absolute inset-0 bg-gradient-to-b from-sky-500 to-blue-700" />
          <span className="logo-bubble left-[20%]" />
          <span className="logo-bubble left-[55%] [animation-delay:0.6s]" />
          <span className="logo-bubble left-[80%] [animation-delay:1.2s]" />
        </div>
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}
