import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3141"
    }
  },
  build: {
    outDir: "../../dist/client",
    emptyOutDir: true
  }
});
