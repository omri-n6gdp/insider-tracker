/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // core palette
        "surface": "#0a0b0d",
        "surface-1": "#111318",
        "surface-2": "#181c22",
        "surface-3": "#1e2430",
        "border": "#1e2836",
        "border-muted": "#141a22",
        // signals
        "mint": "#34d399",
        "mint-dim": "#1a6648",
        "coral": "#fb7185",
        "coral-dim": "#6b2030",
        "gold": "#f59e0b",
        "gold-dim": "#5c3a0a",
        // text
        "text-primary": "#e2e8f0",
        "text-secondary": "#94a3b8",
        "text-muted": "#475569",
        "text-faint": "#2a3444",
      },
      fontFamily: {
        "display": ["'Fraunces'", "Georgia", "serif"],
        "editorial": ["'Playfair Display'", "Georgia", "serif"],
        "mono": ["'IBM Plex Mono'", "Fira Code", "monospace"],
        "sans-refined": ["'DM Sans'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
