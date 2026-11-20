/**
 * O contraste dos símbolos do estado do sensor (WCAG 1.4.11, ADR-0033): cada cor de estado tem pelo menos 3:1
 * contra o mapa, o cartão e a superfície, e o ícone sobre o fundo de estado também, nos dois temas.
 */
import { describe, expect, it } from "vitest";
// O vitest corre em Node, mas o projeto não instala os tipos do Node; o `css: false` do vitest esvazia o `?raw`, por isso lê-se o ficheiro.
// @ts-expect-error sem os tipos do Node
import { readFileSync } from "node:fs";

// Com `core.autocrlf=true` (Windows) o ficheiro vem com `\r\n`: normaliza-se para a procura à letra do bloco funcionar.
const css: string = readFileSync("src/styles/tokens.css", "utf8").replace(/\r\n/g, "\n");

/** As variáveis de cor de um tema: o bloco `:root, [data-theme="dark"]` (escuro) ou `[data-theme="light"]` (claro). */
function tema(nome: "dark" | "light"): Record<string, string> {
  const inicio = nome === "dark" ? css.indexOf(':root,\n[data-theme="dark"] {') : css.indexOf('[data-theme="light"] {');
  const bloco = css.slice(inicio, css.indexOf("}", inicio));
  return Object.fromEntries([...bloco.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const ESTADOS = ["--state-ok", "--state-warn", "--state-error", "--state-device"];
const FUNDOS = ["--map-bg", "--bg-card", "--superficie"];

describe.each(["dark", "light"] as const)("tema %s", (nome) => {
  const t = tema(nome);

  it.each(ESTADOS)("%s tem pelo menos 3:1 contra o mapa, o cartão e a superfície (WCAG 1.4.11)", (estado) => {
    for (const fundo of FUNDOS) expect(contraste(t[estado], t[fundo]), `${estado} contra ${fundo}`).toBeGreaterThanOrEqual(3);
  });

  it.each(ESTADOS)("o ícone sobre %s tem pelo menos 4,5:1", (estado) => {
    expect(contraste(t["--on-state"], t[estado]), `--on-state sobre ${estado}`).toBeGreaterThanOrEqual(4.5);
  });

  it("a falha de dispositivo é uma cor própria, diferente da de rede (o resto distingue-as: o ícone, a forma e o nome)", () => {
    expect(t["--state-device"]).toBeDefined();
    expect(t["--state-device"].toLowerCase()).not.toBe(t["--state-error"].toLowerCase());
  });
});

describe("a falha de dispositivo", () => {
  it("é laranja, com os candidatos do ADR-0042: #9a3c00 no claro e #ff9a3c no escuro", () => {
    expect(tema("light")["--state-device"].toLowerCase()).toBe("#9a3c00");
    expect(tema("dark")["--state-device"].toLowerCase()).toBe("#ff9a3c");
  });
});

/** O fundo do mapa segue a luminosidade da hora (ADR-0040): o dia é o `--map-*`, e o crepúsculo e a noite têm os seus. */
describe.each(["dark", "light"] as const)("o fundo do mapa por luminosidade, tema %s (ADR-0040)", (nome) => {
  const t = tema(nome);
  const PALETAS = [
    ["dia", ""],
    ["crepúsculo", "-crepusculo"],
    ["noite", "-noite"],
  ] as const;
  // Os estados, as ruas com sensor (`--accent-ink`) e os carros (`--text-primary`, ADR-0034) não mudam com a hora: medem-se nos 6 fundos.
  const CORES = ["--state-ok", "--state-warn", "--state-error", "--state-device", "--accent-ink", "--text-primary"];

  it.each(PALETAS)("a paleta de %s define o fundo, a água, os quarteirões, as ruas sem cobertura e os rótulos", (_luz, sufixo) => {
    for (const base of ["--map-bg", "--map-water", "--map-block", "--map-road-nocoverage", "--map-label"]) {
      if (base === "--map-road-nocoverage" && sufixo === "") continue; // o dia usa `--nocoverage-line`, derivado
      if (base === "--map-label" && sufixo === "") continue;
      expect(t[`${base}${sufixo}`], `${base}${sufixo}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it.each(PALETAS)("os estados, as ruas com sensor e os carros têm pelo menos 3:1 contra o fundo, a água e os quarteirões de %s (WCAG 1.4.11)", (_luz, sufixo) => {
    for (const cor of CORES)
      for (const fundo of ["--map-bg", "--map-water", "--map-block"])
        expect(contraste(t[cor], t[`${fundo}${sufixo}`]), `${cor} contra ${fundo}${sufixo}`).toBeGreaterThanOrEqual(3);
  });

  it.each(PALETAS)("as ruas sem cobertura têm 3:1 e os rótulos 4,5:1 contra o fundo de %s", (_luz, sufixo) => {
    const rua = sufixo ? t[`--map-road-nocoverage${sufixo}`] : t["--nocoverage-line"];
    const rotulo = sufixo ? t[`--map-label${sufixo}`] : t["--nocoverage-label"];
    expect(contraste(rua, t[`--map-bg${sufixo}`]), "rua sem cobertura").toBeGreaterThanOrEqual(3);
    expect(contraste(rotulo, t[`--map-bg${sufixo}`]), "rótulo").toBeGreaterThanOrEqual(4.5);
  });

  it("no tema claro, a noite fica num cinzento médio de luminância pelo menos 0,43 (ADR-0040)", () => {
    if (nome === "light") expect(luminancia(t["--map-bg-noite"])).toBeGreaterThanOrEqual(0.43);
  });

  it("a noite é mais escura do que o dia, e o crepúsculo fica entre os dois (o tema escuro, mais azulada)", () => {
    const [dia, crep, noite] = ["", "-crepusculo", "-noite"].map((sufixo) => luminancia(t[`--map-bg${sufixo}`]));
    expect(noite).toBeLessThan(crep);
    expect(crep).toBeLessThan(dia);
    if (nome === "dark") {
      const azul = (hex: string) => parseInt(hex.slice(5, 7), 16) - parseInt(hex.slice(1, 3), 16);
      expect(azul(t["--map-bg-noite"])).toBeGreaterThan(azul(t["--map-bg"]));
    }
  });
});

/** A atribuição do OpenStreetMap é texto sobre o mapa: 4,5:1 contra os 6 fundos (WCAG 1.4.3). */
describe.each(["dark", "light"] as const)("a atribuição do mapa, tema %s", (nome) => {
  const t = tema(nome);
  it.each([["dia", ""], ["crepúsculo", "-crepusculo"], ["noite", "-noite"]] as const)("tem pelo menos 4,5:1 contra o fundo, a água e os quarteirões de %s", (_luz, sufixo) => {
    for (const fundo of ["--map-bg", "--map-water", "--map-block"])
      expect(contraste(t["--text-primary"], t[`${fundo}${sufixo}`]), `--text-primary contra ${fundo}${sufixo}`).toBeGreaterThanOrEqual(4.5);
  });

  it("o CSS usa essa cor na atribuição (a secundária ficava a 3,93:1 de noite, no tema claro)", () => {
    const css = (readFileSync("src/styles/app.css", "utf8") as string).replace(/\s+/g, " ");
    expect(css).toMatch(/\.maplibregl-ctrl-attrib \{[^}]*color: var\(--text-primary\);/);
    if (nome === "light") expect(contraste(t["--text-secondary"], t["--map-bg-noite"])).toBeLessThan(4.5); // o problema de antes
  });
});

/** A passadeira desenhada no mapa (ADR-0038): as listas brancas lêem-se contra o asfalto, nos 2 temas × 3 paletas (ADR-0040). */
describe.each(["dark", "light"] as const)("a passadeira desenhada, tema %s (ADR-0038)", (nome) => {
  const t = tema(nome);

  it("o asfalto e as listas são cores próprias, e as listas têm pelo menos 3:1 contra o asfalto (WCAG 1.4.11)", () => {
    expect(t["--crosswalk-asfalto"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(t["--crosswalk-lista"]).toMatch(/^#[0-9a-f]{6}$/i);
    expect(contraste(t["--crosswalk-lista"], t["--crosswalk-asfalto"])).toBeGreaterThanOrEqual(3);
  });

  it.each([["dia", ""], ["crepúsculo", "-crepusculo"], ["noite", "-noite"]] as const)(
    "o asfalto destaca-se do fundo do mapa de %s (as ruas do mapa são linhas mais estreitas: sem asfalto próprio as listas perdiam-se)",
    (_luz, sufixo) => {
      expect(contraste(t["--crosswalk-asfalto"], t[`--map-bg${sufixo}`])).toBeGreaterThanOrEqual(1.5);
    },
  );
});

/** O anel de excesso de velocidade (ADR-0039): vermelho néon, com pelo menos 3:1 contra o mapa, e diferente das falhas. */
describe.each(["dark", "light"] as const)("o anel de excesso, tema %s (ADR-0039)", (nome) => {
  const t = tema(nome);

  it.each([["dia", ""], ["crepúsculo", "-crepusculo"], ["noite", "-noite"]] as const)(
    "tem pelo menos 3:1 contra o fundo, a água e os quarteirões de %s (WCAG 1.4.11; 2 temas × 3 paletas do ADR-0040)",
    (_luz, sufixo) => {
      for (const fundo of ["--map-bg", "--map-water", "--map-block"])
        expect(contraste(t["--speed-excess"], t[`${fundo}${sufixo}`]), `--speed-excess contra ${fundo}${sufixo}`).toBeGreaterThanOrEqual(3);
    },
  );

  it("é uma cor própria, diferente da falha de rede e da de dispositivo, e mais saturada do que a da falha", () => {
    expect(t["--speed-excess"].toLowerCase()).not.toBe(t["--state-error"].toLowerCase());
    expect(t["--speed-excess"].toLowerCase()).not.toBe(t["--state-device"].toLowerCase());
    const saturacao = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
      return max === 0 ? 0 : (max - min) / max;
    };
    expect(saturacao(t["--speed-excess"])).toBeGreaterThan(saturacao(t["--state-error"]));
  });
});
