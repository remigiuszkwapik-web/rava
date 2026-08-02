import { defineConfig } from "vite";

// Relative base so the built app works both at a domain root and under a
// GitHub Pages project path (e.g. https://user.github.io/rava/).
export default defineConfig({
  base: "./",
  build: {
    target: "es2021",
    outDir: "dist",
  },
});
