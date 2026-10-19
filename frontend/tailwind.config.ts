import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Pretendard", "-apple-system", "BlinkMacSystemFont", "Apple SD Gothic Neo", "Noto Sans KR", "Segoe UI", "sans-serif"],
      },
      colors: {
        ink: { 900: "#16181d", 700: "#3a3f4b", 500: "#6b7280", 300: "#c9ced6", 100: "#eef0f3", 50: "#f7f8fa" },
        brand: { 700: "#0f5e57", 600: "#127a71", 500: "#179487", 100: "#d9f2ef", 50: "#effaf8" },
      },
    },
  },
  plugins: [],
};
export default config;
