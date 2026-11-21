
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages repository deployment path
  base: "/claude-unlimited/",

  plugins: [react()],

  build: {
    outDir: "dist",
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
