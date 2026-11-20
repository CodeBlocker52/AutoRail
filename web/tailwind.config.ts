import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        "bg-alt": v("bg-alt"),
        surface: v("surface"),
        ink: v("ink"),
        text: v("text"),
        muted: v("muted"),
        line: v("line"),
        brand: { DEFAULT: v("brand"), hover: v("brand-hover"), soft: v("brand-soft"), line: v("brand-line") },
        danger: { DEFAULT: v("danger"), soft: v("danger-soft") },
        warning: v("warning"),
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: { card: "14px", btn: "8px" },
      boxShadow: { card: "0 1px 2px rgb(0 0 0 / .04)", lift: "0 8px 24px -12px rgb(22 22 15 / .18)" },
      letterSpacing: { eyebrow: "0.25em", nav: "0.18em" },
      fontSize: {
        hero: ["5.5rem", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "hero-sm": ["2.75rem", { lineHeight: "1.08", letterSpacing: "-0.015em" }],
      },
      maxWidth: { page: "1240px" },
    },
  },
  plugins: [],
};
export default config;
