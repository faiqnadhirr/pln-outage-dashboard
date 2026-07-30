/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#141821", navy: "#1F2A44", slate: "#55627A",
        amber: "#C8862B", crit: "#B23A2E", ok: "#2E7D32",
        surface: "#F5F7FA", card: "#FFFFFF", line: "#E3E7ED", mut: "#7A8598"
      },
      fontFamily: {
        sans: ["Inter","system-ui","-apple-system","Segoe UI","Roboto","sans-serif"],
        mono: ["ui-monospace","SFMono-Regular","Menlo","monospace"]
      }
    }
  },
  plugins: []
};
