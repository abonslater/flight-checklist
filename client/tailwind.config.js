/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg: "#0b1220",
          panel: "#131c2e",
          edge: "#1f2c44",
          accent: "#2dd4bf",
        },
      },
    },
  },
  plugins: [],
};
