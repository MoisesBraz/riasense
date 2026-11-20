/**
 * Os ícones da RiaSense: uma só família. Grelha de 24, traço de 1,6 com pontas redondas, sem preenchimento,
 * desenhados a 20 px (ou 16 px nos sítios pequenos). Nenhum outro ícone (glifos ▶ ✕ +, outras grelhas) entra na app.
 */
import type { ReactElement } from "react";

const TRACOS = {
  camadas: "M12 3l9 5-9 5-9-5z M3 13l9 5 9-5",
  legenda: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01",
  mais: "M12 5v14 M5 12h14",
  menos: "M5 12h14",
  fechar: "M6 6l12 12 M18 6L6 18",
  reproduzir: "M8 5v14l11-7z",
  pausa: "M8 5v14 M16 5v14",
  seta: "M6 9l6 6 6-6",
  // A bússola (ADR-0042): a agulha a apontar para o norte, com a metade de baixo curta.
  norte: "M12 3l4.5 11h-9z M12 14v7",
  info: "M12 8h.01 M11 12h1v5h1",
  sol: "M12 3v2 M12 19v2 M3 12h2 M19 12h2 M5.6 5.6l1.4 1.4 M17 17l1.4 1.4 M5.6 18.4L7 17 M17 7l1.4-1.4",
  lua: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  // O crepúsculo (ADR-0040): meio sol sobre o horizonte, com os raios.
  crepusculo: "M3 18h18 M7 18a5 5 0 0 1 10 0 M12 8v2 M5.2 11.2l1.4 1.4 M18.8 11.2l-1.4 1.4",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  painel: "M4 5h16v14H4z M15 5v14",
  alerta: "M12 4l9 16H3z M12 10v4 M12 17h.01",
  agora: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  // A pergunta por voz (ADR-0054): o microfone; sem voz, o balão da pergunta escrita.
  microfone: "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M5.5 11a6.5 6.5 0 0 0 13 0 M12 17.5V21",
  pergunta: "M4 5h16v11H10l-4 4v-4H4z M8 9.5h8 M8 12.5h5",
  // Os tipos de sensor no mapa: peão, edifício, antena.
  passadeira: "M12 4.5h.01 M12 8v6 M12 14l-3 6 M12 14l3 6 M7.5 11h9",
  zona: "M4 20h16 M6 20v-9 M18 20v-9 M3 11l9-7 9 7 M10 20v-5h4v5",
  rsu: "M12 11v9 M8 20h8 M8.5 7.5a5 5 0 0 1 7 0 M5.5 4.5a9 9 0 0 1 13 0 M12 11h.01",
  // Os tipos sem marcador no mapa: o segmento (dois nós ligados por um traço curto, para não se confundir com a linha
  // cinzenta do «Sem cobertura») e o estacionamento («P»).
  segmento: "M4 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M16 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M7.4 16.6l9.2-9.2",
  estacionamento: "M9 20V4h4.5a4.5 4.5 0 0 1 0 9H9",
  // Os estados da falha (ADR-0033): o sinal cortado (arcos com um traço diagonal) e o aparelho com aviso.
  "sinal-cortado": "M4.5 10a10.5 10.5 0 0 1 15 0 M8 13.5a5.5 5.5 0 0 1 8 0 M12 17.5h.01 M4 4l16 16",
  "aparelho-aviso": "M7 3h10a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 17 21H7a1.5 1.5 0 0 1-1.5-1.5v-15A1.5 1.5 0 0 1 7 3z M12 8v5 M12 16.5h.01",
} as const;

export type NomeIcone = keyof typeof TRACOS;

/** Círculos que o traço sozinho não desenha (o centro do sol, o «i» da informação). */
const EXTRA: Partial<Record<NomeIcone, ReactElement>> = {
  sol: <circle cx="12" cy="12" r="4" />,
  info: <circle cx="12" cy="12" r="9" />,
};

export function Icone({ nome, tamanho = 20, className = "" }: { nome: NomeIcone; tamanho?: 16 | 20; className?: string }) {
  return (
    <svg className={`icone ${className}`} viewBox="0 0 24 24" width={tamanho} height={tamanho} aria-hidden="true" focusable="false">
      <path d={TRACOS[nome]} />
      {EXTRA[nome]}
    </svg>
  );
}

/** O mesmo ícone em nós DOM, para os marcadores do MapLibre (que não são React). */
export function elementoIcone(nome: NomeIcone, tamanho = 16): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(tamanho));
  svg.setAttribute("height", String(tamanho));
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icone");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", TRACOS[nome]);
  svg.appendChild(p);
  return svg;
}
