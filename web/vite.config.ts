/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // O teste da configuração lê config/riasense.yaml (fora de web/) para confirmar que o demo.json o espelha.
  server: { fs: { allow: [".", "../config"] } },
  // O MapLibre ocupa sozinho cerca de 1 MB; é o mapa da demo, não há o que dividir.
  build: { chunkSizeWarningLimit: 1600 },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/preparar.ts"],
    css: false,
  },
});
