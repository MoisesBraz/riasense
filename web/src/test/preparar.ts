import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { limparCache } from "../api/useRecurso";

// O jsdom não tem matchMedia: os testes correm como desktop (≥ 760 px) e tema escuro.
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (consulta: string) =>
    ({
      matches: consulta.includes("min-width"),
      media: consulta,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

afterEach(() => {
  cleanup();
  limparCache();
  vi.unstubAllGlobals();
});
