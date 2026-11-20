/** Barra superior: marca, os 4 separadores, a zona da demo, o estado dos dados e o tema (o tema só aqui, ADR-0048). */
import { Icone } from "./Icone";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useFecharComEscape } from "./Basicos";
import { useAoVivoDisponivel } from "../api/aoVivo";
import { useSensores } from "../api/recursos";
import { config } from "../config";
import { SEPARADORES, useEstadoDemo, type Separador } from "../estado/estado";
import { useAlturaCss } from "../estado/useAlturaCss";
import type { Tema } from "../estado/tema";
import { DadosLocais } from "./DadosLocais";

function Marca() {
  return (
    <span className="marca">
      {/* O «R» azul feito de ruas: a mesma geometria do favicon (web/public/favicon.svg). */}
      <svg className="marca__icone" viewBox="0 0 626 626" width="28" height="28" aria-hidden="true">
        <rect className="marca__fundo" width="626" height="626" rx="41" />
        <rect className="marca__rua" x="119.2" width="61.1" height="626" />
        <polygon className="marca__rua" points="168.8,313 254.4,313 567.9,626 482.3,626" />
        <path className="marca__bojo" d="M0 313H418.7A93.9 93.75 0 0 0 418.7 125.5H180.3" fill="none" strokeWidth="61.5" />
      </svg>
      <span className="marca__nome">RiaSense</span>
    </span>
  );
}

function Separadores() {
  const { estado, despachar } = useEstadoDemo();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // Sair do ① Vigiar pela barra fecha o pop-up (a folha, no telemóvel); o «Ver a estimativa →» leva-o ao ② (ADR-0033).
  const mudar = (separador: Separador) => {
    if (estado.separador === "vigiar" && separador !== "vigiar") despachar({ tipo: "popup", sensor: null });
    despachar({ tipo: "separador", separador });
  };

  // Setas esquerda e direita mudam de separador (padrão WAI-ARIA dos separadores).
  function teclas(e: KeyboardEvent, i: number) {
    const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!passo) return;
    const j = (i + passo + SEPARADORES.length) % SEPARADORES.length;
    mudar(SEPARADORES[j].id);
    refs.current[j]?.focus();
  }

  return (
    <div className="separadores" role="tablist" aria-label="Camadas da RiaSense">
      {SEPARADORES.map((s, i) => {
        const ativo = estado.separador === s.id;
        return (
          <button
            key={s.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`separador-${s.id}`}
            aria-selected={ativo}
            aria-controls="painel"
            tabIndex={ativo ? 0 : -1}
            className="separador"
            onClick={() => mudar(s.id as Separador)}
            onKeyDown={(e) => teclas(e, i)}
          >
            <span className="separador__numero" aria-hidden="true">
              {i + 1}
            </span>
            {s.rotulo}
          </button>
        );
      })}
    </div>
  );
}

function EstadoDosDados({ onAbrir, aoVivo }: { onAbrir: () => void; aoVivo: boolean }) {
  const { resultado } = useSensores();
  // No modo «Ao vivo» (ADR-0049, ponto 3): «Ao vivo», com um ponto azul a pulsar (nem verde nem vermelho, que são estados).
  const texto = aoVivo
    ? "Ao vivo"
    : resultado.estado === "ok"
      ? "Offline"
      : resultado.estado === "a-carregar"
        ? "A ligar à API…"
        : resultado.estado === "erro"
          ? "API sem resposta"
          : "Dados por calcular";
  // ADR-0048, ponto 3: o estado normal é um ponto cinzento com «Offline» à vista (a demo corre sem rede, e o verde lia-se
  // como «ligado»). A carregar e «por calcular» ficam a cinzento com o seu texto; só o erro fica a vermelho.
  const tom = aoVivo ? "ao-vivo" : resultado.estado === "erro" ? "erro" : resultado.estado === "ok" ? "offline" : "neutro";
  return (
    <button
      type="button"
      className={`estado-dados estado-dados--${tom}`}
      onClick={onAbrir}
      aria-haspopup="dialog"
      title={
        aoVivo ? "Ao vivo · dados públicos do Aveiro Living Lab" : resultado.estado === "ok" ? "Dados locais · offline: a demo corre sem rede" : undefined
      }
    >
      <span className="estado-dados__ponto" aria-hidden="true" />
      {texto}
    </button>
  );
}

function BotaoTema({ tema, onAlternar }: { tema: Tema; onAlternar: () => void }) {
  const proximo = tema === "escuro" ? "claro" : "escuro";
  return (
    <button
      type="button"
      className="botao-icone barra-superior__tema"
      onClick={onAlternar}
      aria-label={`Mudar para o tema ${proximo}`}
      title={`Tema ${proximo}`}
    >
      <Icone nome={tema === "escuro" ? "lua" : "sol"} />
    </button>
  );
}

/** Abre o modo «agora» (ADR-0032, ponto 7): «Simular falha». Só existe quando a API o serve; a etiqueta da simulação está no modo. */
function BotaoAgora({ aberto, onAlternar }: { aberto: boolean; onAlternar: () => void }) {
  return (
    <button type="button" className="botao botao--secundario botao-agora" aria-pressed={aberto} onClick={onAlternar}>
      Simular falha
    </button>
  );
}

/**
 * O botão do «Ao vivo» (ADR-0049, ponto 3), na janela do indicador: só liga com rede (a API pergunta quando a janela abre).
 * No modo, a mesma janela tem o «Voltar aos dados da semana».
 */
function BotaoAoVivo({ ativo, onEntrar, onSair }: { ativo: boolean; onEntrar: () => void; onSair: () => void }) {
  const rede = useAoVivoDisponivel(!ativo);
  // O botão aparece sempre (só `ao_vivo.ativo: false`, em caso de avaria, o esconde); a ligação só abre com o clique.
  if (!ativo && rede === "desligado") return null;
  if (ativo)
    return (
      <button type="button" className="botao botao--secundario" onClick={onSair}>
        Voltar aos dados da semana
      </button>
    );
  return (
    <div className="ao-vivo-entrada">
      <button type="button" className="botao botao--secundario" disabled={rede !== "com rede"} onClick={onEntrar}>
        <span className="ao-vivo-entrada__ponto" aria-hidden="true" />
        Ver ao vivo (Living Lab)
      </button>
      <p className="nota" role="status">
        {rede === "a perguntar"
          ? "A ver se há rede…"
          : rede === "sem rede"
            ? "Sem rede: o «Ao vivo» precisa da Internet. A demo continua com os dados da semana."
            : "Dados públicos do Living Lab, não validados; nada se grava."}
      </p>
    </div>
  );
}

/** Onde o cabeçalho recolhe numa faixa (ADR-0059): a mesma consulta do CSS. */
const FAIXA_RECOLHIDA = "(min-width: 760px) and (max-width: 1399px)";

export function BarraSuperior({
  tema,
  onAlternarTema,
  agora,
  aoVivo,
}: {
  tema: Tema;
  onAlternarTema: () => void;
  agora?: { aberto: boolean; onAlternar: () => void };
  aoVivo?: { ativo: boolean; onEntrar: () => void; onSair: () => void };
}) {
  const [aberto, setAberto] = useState(false);
  useFecharComEscape(aberto, useCallback(() => setAberto(false), []));
  // A altura do cabeçalho numa variável CSS: a folha do detalhe começa por baixo dele.
  const cabecalho = useAlturaCss<HTMLElement>("--altura-cabecalho");
  // ADR-0059: entre 760 e 1399 px o cabeçalho recolhe numa faixa (CSS). O rato e o Tab expandem-no pelo :hover e pelo
  // :focus-within; num ecrã táctil, um toque na faixa expande-o e um toque fora recolhe-o. O Esc recolhe-o sem tirar o rato
  // nem o foco (WCAG 1.4.13): fica recolhido até o rato sair ou o foco sair do cabeçalho.
  const [expandido, setExpandido] = useState(false);
  const [fechado, setFechado] = useState(false);
  useEffect(() => {
    if (!expandido) return;
    const fora = (e: PointerEvent) => {
      if (!cabecalho.current?.contains(e.target as Node)) setExpandido(false);
    };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [expandido, cabecalho]);
  // O Esc ouve-se na `window`, como o `useFecharComEscape`: com o rato por cima, o foco não está no cabeçalho, e os ouvintes do
  // `document` (o pop-up, a voz) correm antes. Um Esc que já trataram (`defaultPrevented`) não recolhe também o cabeçalho.
  // Fora da faixa (ADR-0059, ponto 4) o cabeçalho fica como está, e o Esc não lhe mexe no foco.
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => {
      const h = cabecalho.current;
      if (e.key !== "Escape" || e.defaultPrevented || aberto || !h) return;
      if (typeof matchMedia === "function" && !matchMedia(FAIXA_RECOLHIDA).matches) return;
      const dentro = h.contains(document.activeElement);
      if (!expandido && !dentro && !h.matches(":hover")) return;
      setExpandido(false);
      setFechado(true);
      // Recolhido, só o separador ativo fica à vista: o foco passa para ele, para não ficar num botão escondido.
      if (dentro) h.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    };
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [aberto, expandido, cabecalho]);
  // Com a janela «Dados locais» aberta, o cabeçalho fica expandido: recolhido, o `overflow: hidden` escondia-a.
  return (
    <header
      className={`barra-superior ${expandido || aberto ? "barra-superior--expandida" : ""} ${fechado && !aberto ? "barra-superior--fechada" : ""}`}
      ref={cabecalho}
      onPointerDown={(e) => {
        if (e.pointerType === "touch") {
          setExpandido(true);
          setFechado(false);
        }
      }}
      onPointerLeave={() => setFechado(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFechado(false);
      }}
    >
      <Marca />
      <Separadores />
      <div className="barra-superior__direita">
        {agora && <BotaoAgora aberto={agora.aberto} onAlternar={agora.onAlternar} />}
        <EstadoDosDados onAbrir={() => setAberto((a) => !a)} aoVivo={aoVivo?.ativo ?? false} />
      </div>
      {/* O tema só no cabeçalho (ADR-0048, ponto 4): também no telemóvel, ao lado do ☰. */}
      <BotaoTema tema={tema} onAlternar={onAlternarTema} />
      <button
        type="button"
        className="botao-icone barra-superior__menu"
        aria-label="Menu: zona e dados locais"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
      >
        <Icone nome="menu" />
      </button>
      {aberto && (
        <div className="popover" role="dialog" aria-label="Dados locais">
          <p className="popover__zona">Zona · {config.zona.nome}</p>
          {/* A 390 px a barra da direita sai: o «agora» abre-se daqui. */}
          {agora && (
            <BotaoAgora
              aberto={agora.aberto}
              onAlternar={() => {
                setAberto(false);
                agora.onAlternar();
              }}
            />
          )}
          {aoVivo && (
            <BotaoAoVivo
              ativo={aoVivo.ativo}
              onEntrar={() => {
                setAberto(false);
                aoVivo.onEntrar();
              }}
              onSair={() => {
                setAberto(false);
                aoVivo.onSair();
              }}
            />
          )}
          <DadosLocais />
          <div className="acoes">
            <button type="button" className="botao botao--secundario" onClick={() => setAberto(false)}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
