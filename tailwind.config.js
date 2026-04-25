/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ["'Lora'", "Georgia", "serif"],
        sans: ["'Inter'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      colors: {
        // Paleta Solon — quente, papel, tinta
        parchment: {
          50: "#fdfaf4",
          100: "#f9f1e0",
          200: "#f2e4c4",
          300: "#e8d0a0",
          400: "#d9b87a",
          500: "#c9a05a",
        },
        ink: {
          50:  "#f5f4f2",
          100: "#e8e6e1",
          200: "#d1cdc5",
          300: "#b0a99e",
          400: "#8a8177",
          500: "#6b6259",
          600: "#524a42",
          700: "#3d3630",
          800: "#2a2420",
          900: "#1a1612",
          950: "#0e0c09",
        },
        accent: {
          DEFAULT: "#7c5c3e",
          light: "#a07850",
          dark: "#5a3f28",
        },
      },
      typography: {
        solon: {
          css: {
            "--tw-prose-body": "#2a2420",
            "--tw-prose-headings": "#1a1612",
            "--tw-prose-lead": "#524a42",
            "--tw-prose-links": "#7c5c3e",
            "--tw-prose-bold": "#1a1612",
            "--tw-prose-counters": "#8a8177",
            "--tw-prose-bullets": "#8a8177",
            "--tw-prose-hr": "#d1cdc5",
            "--tw-prose-quotes": "#3d3630",
            "--tw-prose-quote-borders": "#a07850",
          },
        },
      },
    },
  },
  plugins: [],
};
