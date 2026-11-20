/** Peças pequenas do Figma («Componentes»): selo, cartão, KPI, botão e tipo de falha. */
import { Icone, type NomeIcone } from "./Icone";
import { SimboloDaFalha } from "./Simbolos";
import { createContext, useCallback, useContext, useEffect, useId, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

export type TipoSelo = "neutro" | "estimado" | "aviso" | "erro" | "ok";

/** Selo em maiúsculas. Nunca depende só da cor: o texto diz o estado (ILUSTRATIVO, ESTIMADO, POR CALCULAR…). */
export function Selo({ tipo = "neutro", children }: { tipo?: TipoSelo; children: ReactNode }) {
  return <span className={`selo selo--${tipo}`}>{children}</span>;
}

export function Cartao({
  titulo,
  selo,
  destaque,
  children,
  className = "",
  rotulo,
}: {
  titulo?: ReactNode;
  selo?: ReactNode;
  destaque?: "erro" | "aviso" | "ok";
  children?: ReactNode;
  className?: string;
  rotulo?: string;
}) {
  return (
    <section className={`cartao ${destaque ? `cartao--${destaque}` : ""} ${className}`} aria-label={rotulo}>
      {(titulo || selo) && (
        <header className="cartao__cabecalho">
          {titulo && <h3 className="cartao__titulo">{titulo}</h3>}
          {selo}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ rotulo, valor, nota }: { rotulo: string; valor: ReactNode; nota?: ReactNode }) {
  return (
    <div className="kpi">
      <span className="kpi__rotulo">{rotulo}</span>
      <strong className="kpi__valor">{valor}</strong>
      {nota && <span className="kpi__nota">{nota}</span>}
    </div>
  );
}

type Variante = "primario" | "secundario" | "fantasma";

export function Botao({
  variante = "primario",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante }) {
  return <button type="button" className={`botao botao--${variante} ${className}`} {...props} />;
}

/**
 * Falha de rede e de dispositivo distinguem-se em cor, em ícone e em forma, e dizem o nome em texto, nunca só pela cor
 * (ADR-0033; regra 9 do Figma): o mesmo símbolo do marcador e da legenda.
 */
export function TipoFalha({ tipo }: { tipo: "rede" | "dispositivo" }) {
  return (
    <span className={`tipo-falha tipo-falha--${tipo}`}>
      <SimboloDaFalha tipo={tipo} />
      {tipo === "rede" ? "Falha de rede" : "Falha de dispositivo"}
    </span>
  );
}

/** Uma nota aberta (o «ⓘ») fecha com a tecla Esc, como as outras janelas da app (WCAG 1.4.13). */
export function useFecharComEscape(aberta: boolean, fechar: () => void) {
  useEffect(() => {
    if (!aberta) return;
    const tecla = (e: KeyboardEvent) => {
      // Um Esc que o pop-up ou a voz já trataram (preventDefault no document) não fecha também a nota: o 1.º fecha o pop-up.
      if (e.key === "Escape" && !e.defaultPrevented) fechar();
    };
    addEventListener("keydown", tecla);
    return () => removeEventListener("keydown", tecla);
  }, [aberta, fechar]);
}

/**
 * Pergunta do separador (ADR-0033, ponto 4): o título é a pergunta, sem fórmula por baixo. O «ⓘ» abre uma nota de
 * 40 palavras no máximo, com o que não cabe no painel. A nota é um texto, ou vários parágrafos, cada um com o
 * seu limite (ADR-0048, ponto 2: as notas que saíram da legenda).
 */
export function Pergunta({ titulo, info }: { titulo: string; info?: ReactNode | string[] }) {
  const [aberta, setAberta] = useState(false);
  useFecharComEscape(aberta, useCallback(() => setAberta(false), []));
  const id = useId();
  return (
    <header className="pergunta">
      <div className="pergunta__linha">
        <h2 className="pergunta__titulo">{titulo}</h2>
        {info && (
          <button
            type="button"
            className="botao-info"
            aria-expanded={aberta}
            aria-controls={id}
            aria-label="Sobre este separador"
            onClick={() => setAberta((a) => !a)}
          >
            ⓘ
          </button>
        )}
      </div>
      {info && aberta &&
        (Array.isArray(info) ? (
          <div id={id} className="pergunta__info" role="note">
            {info.map((t) => (
              <p key={t}>{t}</p>
            ))}
          </div>
        ) : (
          <p id={id} className="pergunta__info" role="note">
            {info}
          </p>
        ))}
    </header>
  );
}

/**
 * Caixa do mapa que abre e fecha (as Camadas e a Legenda): fechada por omissão, com um botão
 * `aria-expanded` que se usa com o rato, o Enter e o Espaço.
 */
/**
 * As ferramentas do mapa partilham um estado. Com `exclusivo` (o telemóvel), abrir uma fecha a outra; no ecrã largo podem
 * estar abertas ao mesmo tempo, empilhadas (ADR-0042, ponto 5).
 */
const Grupo = createContext<{ abertas: ReadonlySet<string>; alternar: (id: string) => void } | null>(null);

export function GrupoFerramentas({ children, exclusivo = true }: { children: ReactNode; exclusivo?: boolean }) {
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(new Set());
  const alternar = (id: string) =>
    setAbertas((a) => {
      if (a.has(id)) return new Set([...a].filter((x) => x !== id));
      return exclusivo ? new Set([id]) : new Set([...a, id]);
    });
  return <Grupo.Provider value={{ abertas, alternar }}>{children}</Grupo.Provider>;
}

/**
 * Ferramenta do mapa: um botão de ícone de 40 px que abre um painel ao lado, como nas ferramentas da referência.
 * Fechada por omissão; o rótulo é o nome acessível do botão e o título do painel.
 */
export function Recolhivel({
  classe,
  icone,
  rotulo,
  titulo,
  children,
}: {
  classe: string;
  icone: NomeIcone;
  rotulo: string;
  titulo?: ReactNode;
  children: ReactNode;
}) {
  const [sozinha, setSozinha] = useState(false);
  const id = useId();
  // Dentro de um GrupoFerramentas, o grupo decide se outra fecha ao abrir esta (ver GrupoFerramentas).
  const grupo = useContext(Grupo);
  const aberta = grupo ? grupo.abertas.has(id) : sozinha;
  const setAberta = (f: (a: boolean) => boolean) => (grupo ? grupo.alternar(id) : setSozinha(f));
  return (
    <section className={`recolhivel ${classe}`}>
      <button
        type="button"
        className="ferramenta"
        aria-label={rotulo}
        title={rotulo}
        aria-expanded={aberta}
        aria-controls={id}
        onClick={() => setAberta((a) => !a)}
      >
        <Icone nome={icone} />
      </button>
      {/* tabIndex: com o teclado também se chega ao fim de uma caixa que desliza, mesmo quando só tem texto. */}
      <div id={id} className="recolhivel__corpo sobreposto" hidden={!aberta} tabIndex={0} role="region" aria-label={rotulo}>
        <h3 className="titulo-grupo">{titulo ?? rotulo}</h3>
        {children}
      </div>
    </section>
  );
}
