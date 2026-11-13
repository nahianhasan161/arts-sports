import type { Config } from "tailwindcss";

const c = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

// Brand colours are CSS variables (see globals.css) so light and dark mode
// share the same class names.
const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: c("primary"), foreground: c("primary-foreground") },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        chart: {
          1: "var(--chart-1)",
          2: "var(--chart-2)",
          3: "var(--chart-3)",
          4: "var(--chart-4)",
          5: "var(--chart-5)",
        },
        "primary-container": c("primary-container"),
        "on-primary": c("on-primary"),
        "on-primary-container": c("on-primary-container"),
        "accent-gold": {
          DEFAULT: c("accent-gold"),
          soft: c("accent-gold-soft"),
        },
        "secondary-container": c("secondary-container"),
        "secondary-fixed": c("secondary-fixed"),
        "badge-discount": c("badge-discount"),
        "badge-new": c("badge-new"),
        // The admin sidebar keeps its own colours in both themes.
        rail: {
          DEFAULT: c("rail"),
          hover: c("rail-hover"),
          text: c("rail-text"),
          muted: c("rail-muted"),
        },
        surface: {
          DEFAULT: c("surface"),
          card: c("surface-card"),
          subtle: c("surface-subtle"),
          dim: c("surface-dim"),
          container: c("surface-container"),
          "container-low": c("surface-container-low"),
          "container-high": c("surface-container-high"),
          "container-highest": c("surface-container-highest"),
        },
        "border-light": c("border-light"),
        "text-muted": c("text-muted"),
        "bdt-symbol": c("bdt-symbol"),
        "on-surface": c("on-surface"),
        "on-surface-variant": c("on-surface-variant"),
      },
      fontFamily: {
        display: ["var(--font-oswald)", "sans-serif"],
        body: ["var(--font-plus-jakarta)", "sans-serif"],
      },
      maxWidth: {
        "container-max": "1280px",
      },
      spacing: {
        "space-2xs": "0.125rem",
        "space-xs": "0.25rem",
        "space-sm": "0.5rem",
        "space-md": "0.75rem",
        "space-base": "1rem",
        "space-lg": "1.5rem",
        "space-xl": "2rem",
        "space-2xl": "3rem",
        "space-3xl": "4.5rem",
      },
    },
  },
  plugins: [],
};

export default config;
