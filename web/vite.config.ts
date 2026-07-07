import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5179,
    proxy: {
      "/api": "http://localhost:3021",
      "/uploads": "http://localhost:3021",
      "/socket.io": { target: "http://localhost:3021", ws: true },
    },
  },
});
