import type { Config } from "tailwindcss";

// Explores.Berlin design tokens (see DESIGN.md).
// Names are collision-safe: they never override the default palette
// (e.g. `brand` aliases rose-500 so existing `rose-*` classes keep working).
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          DEFAULT: "#fcfaee", // page canvas
          card: "#fffdf4", // card / picker fill
        },
        bone: "#ffffff",
        ink: "#18181b", // primary text
        pit: "#0a0a0a", // deepest dark frame
        fog: "#71717a", // secondary text (zinc-500)
        ash: "#a1a1aa", // tertiary text on dark (zinc-400)
        coal: {
          800: "#27272a",
          900: "#18181b",
        },
        brand: "#f43f5e", // primary action (== rose-500)
        neon: "#39FF14", // selection / active state
        signal: "#38BDF8", // info CTA (== sky-400)
        deepsky: "#0284C7", // selected marker (== sky-600)
        price: "#b92626", // headings + prices
        ticker: "#dc2626", // pixel ticker text (== red-600)
        tickershadow: "#FACC15", // ticker hard shadow (== yellow-400)
        royal: "#9333ea", // selected card (== purple-600)
        cyber: "#4deeea", // neon accents on dark
        marker: {
          default: "#6B7280",
          bar: "#EC4899",
          restaurant: "#8B5CF6",
          cafe: "#06B6D4",
          beer: "#F59E0B",
          event: "#EF4444",
          doner: "#84CC16",
          club: "#D946EF",
        },
      },
      fontFamily: {
        goldman: ["Goldman", "ui-sans-serif", "system-ui", "sans-serif"],
        pixel: ["var(--font-pixel)", "monospace"],
      },
      boxShadow: {
        punch: "4px 4px 0px 0px rgba(0,0,0,1)",
        "punch-sm": "2px 2px 0px 0px rgba(255,255,255,0.2)",
        "punch-royal": "2px 2px 0px 0px rgba(147,51,234,0.5)",
      },
    },
  },
  plugins: [],
};
export default config;
