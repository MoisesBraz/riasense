/** Os estados: 503 → «por calcular» (sem números), erro com «Tentar de novo», vazio, e a carregar. */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { EstadoDemoProvider } from "../estado/estado";
import { PainelCompletar } from "../paineis/PainelCompletar";
import { PainelPrever } from "../paineis/PainelPrever";
import { PainelRisco } from "../paineis/PainelRisco";
import { PainelVigiar } from "../paineis/PainelVigiar";
import { falsificarApi, naoExiste, ok, porCalcular } from "../test/apiFalsa";

const comEstado = (filhos: ReactNode) => render(<EstadoDemoProvider>{filhos}</EstadoDemoProvider>);
// O ① Vigiar só tem barra lateral depois de um clique: nos estados, abre-se a lista de todas as falhas.
const comVigiarAberto = () =>
  render(
    <EstadoDemoProvider inicial={{ filtroVigiar: "todas" }}>
      <PainelVigiar />
    </EstadoDemoProvider>,
  );

describe("estados dos painéis", () => {
  it("mostra «a carregar» enquanto a API não responde", () => {
    falsificarApi();
    comVigiarAberto();
    expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("A ler os resultados…")).toBeInTheDocument();
  });

  it("503 da API → «por calcular» com o motivo, e nenhum valor de previsão", async () => {
    falsificarApi({ "/prever/previsoes": porCalcular("previsoes.parquet ainda não existe: corre `riasense prever`") });
    comEstado(<PainelPrever />);
    expect(await screen.findByRole("heading", { name: "Previsão daqui a 3 h" })).toBeInTheDocument();
    expect(screen.getAllByText("Por calcular").length).toBeGreaterThan(0);
    expect(screen.getByText(/previsoes\.parquet ainda não existe/)).toBeInTheDocument();
    expect(screen.queryByText("Referência")).not.toBeInTheDocument();
    expect(screen.queryByText(/Próxima hora ·/)).not.toBeInTheDocument();
  });

  it("um endpoint que a API ainda não tem (404) também fica «por calcular»", async () => {
    falsificarApi({ "/completar/avaliacao": naoExiste, "/completar/proximo-sensor": naoExiste });
    comEstado(<PainelCompletar />);
    await userEvent.click(await screen.findByRole("button", { name: "Onde pôr o próximo sensor" }));
    expect(await screen.findByRole("heading", { name: "Onde pôr o próximo sensor" })).toBeInTheDocument();
    expect(screen.getByText(/a API ainda não serve \/completar\/proximo-sensor/)).toBeInTheDocument();
  });

  it("o mapa de risco potencial por calcular diz «não mede acidentes» e mostra as componentes sem níveis", async () => {
    falsificarApi({ "/proteger/risco-potencial": porCalcular("risco_potencial.parquet ainda não existe: corre `riasense proteger`") });
    comEstado(<PainelRisco />);
    expect(await screen.findByRole("heading", { name: "Risco potencial por calcular" })).toBeInTheDocument();
    expect(screen.getByText("Risco potencial · não mede acidentes")).toBeInTheDocument();
    for (const c of ["Exposição", "Comportamento", "Previsão", "Confiança do dado"]) expect(screen.getByText(c)).toBeInTheDocument();
    expect(document.querySelector(".degrau")).toBeNull();
  });

  it("sem ligação à API → erro, e «Tentar de novo» volta a pedir", async () => {
    const fetchFalso = falsificarApi({ "/vigiar/falhas": "sem-ligacao" });
    comVigiarAberto();
    expect(await screen.findByText("Não foi possível ler os resultados")).toBeInTheDocument();
    expect(screen.getByText("Sem ligação à API")).toBeInTheDocument();
    const pedidosAntes = fetchFalso.mock.calls.length;

    falsificarApi({ "/vigiar/falhas": ok([]) });
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(await screen.findByText("Sem falhas inesperadas")).toBeInTheDocument();
    expect(pedidosAntes).toBeGreaterThan(0);
  });

  it("erro HTTP da API → erro com o código", async () => {
    falsificarApi({ "/vigiar/falhas": { status: 500, corpo: { detail: "x" } } });
    comVigiarAberto();
    expect(await screen.findByText("A API respondeu com erro")).toBeInTheDocument();
    expect(screen.getByText(/A API respondeu 500/)).toBeInTheDocument();
  });

  it("resposta sem linhas → estado vazio", async () => {
    falsificarApi({ "/vigiar/falhas": ok([]) });
    comVigiarAberto();
    expect(await screen.findByText("Sem falhas inesperadas")).toBeInTheDocument();
    expect(screen.getByText(/O sossego noturno não conta como falha/)).toBeInTheDocument();
  });

  it("previsões fora do período de teste → vazio que leva à primeira hora com previsão", async () => {
    falsificarApi();
    comEstado(<PainelPrever />);
    expect(await screen.findByText("Sem previsão para qua 04/11 · 23h")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /ir para dom 08\/11 · 08h/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Daqui a 3 h · 11h" })).toBeInTheDocument());
    // A lista: as passadeiras com previsão para essa hora (na amostra, só a SC0013), com o valor previsto.
    const lista = screen.getByRole("list", { name: "Passadeiras com mais travessias previstas" });
    expect(lista).toHaveTextContent("SC0013≈ 28");
  });
});
