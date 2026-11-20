/**
 * Os estados do Figma (painel de 392 px): a carregar, vazio, erro, «por calcular» e sem cobertura.
 * O «estimado» vive nos cartões da ② e o «offline» no painel «Dados locais».
 * Regra comum: sem dados reais, mostra-se o estado e o porquê, nunca um valor de exemplo.
 */
import type { ReactNode } from "react";
import type { Resultado } from "../api/cliente";
import { API_URL } from "../config";
import { Botao, Cartao, Selo } from "./Basicos";

function ACarregar({ titulo }: { titulo?: string }) {
  return (
    <div className="estado estado--a-carregar" aria-busy="true" role="status">
      <div className="estado__linha">
        <span className="estado__titulo">{titulo ?? "A ler os resultados…"}</span>
        <Selo>A carregar</Selo>
      </div>
      <div className="esqueleto">
        <span className="esqueleto__barra esqueleto__barra--curta" />
        <span className="esqueleto__barra" />
        <span className="esqueleto__barra" />
        <span className="esqueleto__barra esqueleto__barra--media" />
      </div>
    </div>
  );
}

/** Vazio: «ok» quando a ausência é boa notícia (sem falhas), «info» quando só não há dados para o que se pediu. */
export function Vazio({ titulo, children, acao, icone = "info" }: { titulo: string; children?: ReactNode; acao?: ReactNode; icone?: "ok" | "info" }) {
  return (
    <div className="estado estado--vazio" role="status">
      <svg className={`estado__icone estado__icone--${icone}`} viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
        <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="2" />
        {icone === "ok" ? (
          <path d="m12 20.5 5.5 5.5L28 15" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M20 18v10M20 12.5v.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        )}
      </svg>
      <strong className="estado__titulo">{titulo}</strong>
      {children && <p className="estado__texto">{children}</p>}
      {acao}
    </div>
  );
}

function Erro({ resultado, onTentar }: { resultado: Extract<Resultado<unknown>, { estado: "erro" }>; onTentar: () => void }) {
  const semLigacao = resultado.tipo === "sem-ligacao";
  return (
    <div className="estado estado--erro" role="alert">
      <div className="estado__linha">
        <strong className="estado__titulo">Não foi possível ler os resultados</strong>
        <Selo tipo="erro">Erro</Selo>
      </div>
      <Cartao destaque="erro">
        <p className="estado__subtitulo">
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10 5.5v5.5M10 13.6v.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          {semLigacao ? "Sem ligação à API" : "A API respondeu com erro"}
        </p>
        <p className="estado__texto">
          {resultado.mensagem}{" "}
          {semLigacao
            ? "Arranca-a com «docker compose up api» (ou «uv run uvicorn app:app --app-dir api»); o mapa continua a funcionar sem rede."
            : `Confirma a pasta RIASENSE_DATA_PROCESSED e a API em ${API_URL}/docs.`}
        </p>
        <Botao onClick={onTentar}>Tentar de novo</Botao>
      </Cartao>
    </div>
  );
}

/** 503 da API: o Parquet da camada ainda não existe. Diz o que falta, sem números de exemplo. */
export function PorCalcular({ titulo, motivo, children }: { titulo: string; motivo?: string; children?: ReactNode }) {
  return (
    <Cartao titulo={titulo} selo={<Selo tipo="aviso">Por calcular</Selo>} className="estado estado--por-calcular">
      {children}
      {motivo && <p className="nota">API: {motivo}.</p>}
    </Cartao>
  );
}

/**
 * Desenha o resultado de um pedido: os estados comuns tratam-se aqui, e `children` só recebe dados reais.
 * `vazio` aparece quando a API responde bem mas não há linhas para o que se pediu.
 */
export function ComResultado<T>({
  resultado,
  recarregar,
  titulo,
  vazio,
  children,
}: {
  resultado: Resultado<T>;
  recarregar: () => void;
  titulo: string;
  vazio?: ReactNode;
  children: (dados: T[]) => ReactNode;
}) {
  switch (resultado.estado) {
    case "a-carregar":
      return <ACarregar />;
    case "erro":
      return <Erro resultado={resultado} onTentar={recarregar} />;
    case "por-calcular":
      return <PorCalcular titulo={titulo} motivo={resultado.motivo} />;
    case "ok":
      return resultado.dados.length === 0 && vazio ? <>{vazio}</> : <>{children(resultado.dados)}</>;
  }
}

/** Rua sem sensor clicada no mapa (ADR-0007): não se estima onde nunca houve sensor. */
export function SemCobertura({ nome, onFechar, onProximo }: { nome: string | null; onFechar: () => void; onProximo: () => void }) {
  return (
    <Cartao
      titulo="Rua selecionada"
      selo={<Selo>Sem cobertura</Selo>}
      className="estado estado--sem-cobertura"
      rotulo="Rua sem cobertura"
    >
      <p className="nota">{nome ?? "Rua sem nome no OpenStreetMap"}</p>
      <svg className="sem-cobertura__amostra" viewBox="0 0 320 48" aria-hidden="true">
        <path d="M0 40 L110 26 L230 22 L320 6" />
        <text x="150" y="44">sem cobertura</text>
      </svg>
      <p className="estado__texto">
        Não há sensor nesta rua. Não estimamos peões onde nunca houve sensor: não haveria forma de validar.
      </p>
      <div className="acoes">
        <Botao variante="fantasma" onClick={onProximo}>
          Onde pôr o próximo sensor →
        </Botao>
        <Botao variante="secundario" onClick={onFechar}>
          Fechar
        </Botao>
      </div>
    </Cartao>
  );
}
