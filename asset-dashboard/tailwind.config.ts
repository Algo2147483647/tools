import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["IBM Plex Sans", "Segoe UI", "PingFang SC", "Microsoft YaHei", "sans-serif"],
        mono: ["IBM Plex Mono", "Consolas", "SFMono-Regular", "monospace"]
      },
      colors: {
        studio: {
          bg: "#07090d",
          panel: "rgba(12, 15, 22, 0.86)",
          panelStrong: "rgba(16, 20, 30, 0.95)",
          line: "rgba(128, 148, 176, 0.18)",
          lineStrong: "rgba(148, 168, 196, 0.32)",
          text: "#eef3f8",
          muted: "#8794a8",
          soft: "#596579",
          green: "#47d39b",
          amber: "#e6b766",
          red: "#ff7373",
          blue: "#7ea8ff"
        }
      },
      boxShadow: {
        studio: "0 24px 70px rgba(0, 0, 0, 0.42)",
        insetLine: "inset 0 0 0 1px rgba(255, 255, 255, 0.05)"
      }
    }
  },
  plugins: []
};

export default config;
