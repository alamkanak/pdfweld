import type { Config } from "tailwindcss";
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  safelist: [
    "bg-[#b8ce5d]",
    "bg-[#f2ca68]",
    "bg-[#eb957e]",
    "bg-[#82b5d6]",
    "bg-[#b79ad8]",
    "bg-[#29372f]",
    "bg-[#202123]",
  ],
  theme: {
    fontSize: {
      xs: ["12px", { lineHeight: "16px" }],
      sm: ["14px", { lineHeight: "20px" }],
      base: ["16px", { lineHeight: "24px" }],
      lg: ["20px", { lineHeight: "28px" }],
      xl: ["24px", { lineHeight: "32px" }],
      "2xl": ["32px", { lineHeight: "40px" }],
    },
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["Manrope", "system-ui", "sans-serif"],
      },
      colors: {
        studio: {
          950: "#18191b",
          900: "#202123",
          850: "#27282b",
          800: "#2d2e32",
          700: "#393b40",
          600: "#8b8e98",
          400: "#a4a6ae",
          200: "#dddfe5",
        },
        lime: { 300: "#d5ef9f", 400: "#bfe780", 500: "#a8d960" },
      },
      boxShadow: {
        panel: "0 16px 64px rgba(0,0,0,0.28)",
        paper: "0 12px 36px rgba(0,0,0,.26)",
      },
    },
  },
  plugins: [],
} satisfies Config;
