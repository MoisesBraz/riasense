/**
 * A pergunta por voz (ADR-0054): um botão do mapa, não um chat. Ouve com o `SpeechRecognition` do browser (pt-PT), reconhece a rua
 * sem modelo de linguagem e a resposta é o mapa: voa até à rua, realça-a e abre o pop-up do troço, o mesmo do clique (ADR-0039).
 * A frase diz-se com o `speechSynthesis` e fica numa região `aria-live`. Sem reconhecimento, sem rede ou com o microfone recusado,
 * o 🎙 sai e fica a caixa de texto, com as mesmas sugestões e a mesma resposta. Nos modos «agora» e «Ao vivo», a voz fica
 * desligada: é sobre a semana gravada.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useCarros, useFalhas, useSegmentosCarros } from "../api/recursos";
import type { Resultado } from "../api/cliente";
import { config } from "../config";
import { HORA_MS } from "../dominio/tempo";
import { falhaNaHora } from "../dominio/vigiar";
import { AVISO_PRIVACIDADE, fraseDaRua, NAO_PERCEBI, reconhecerRua, resumirRua, vozDesligadaNoModo, type ResumoRua, type RuaVoz } from "../dominio/voz";
import { useEstadoDemo } from "../estado/estado";
import { Icone } from "./Icone";

const DIA_MS = 24 * HORA_MS;
const CHAVE_AVISO = "riasense.voz.aviso";
/** As sugestões prontas: as 3 primeiras ruas de `voz.ruas`. */
const SUGESTOES = config.voz.ruas.slice(0, 3).map((r) => `Como está a ${r.nome}?`);

const dados = <T,>(r: Resultado<T>): T[] | null => (r.estado === "ok" ? r.dados : null);

/** A rua da pergunta, à hora do cursor: o resumo medido e a frase; null enquanto os dados carregam. */
function useRespostaRua(nome: string | null, hora: number): { rua: RuaVoz; resumo: ResumoRua; frase: string } | null {
  const rua = config.voz.ruas.find((r) => r.nome === nome) ?? null;
  const agora = useCarros(hora).resultado;
  const ontem = useCarros(hora - DIA_MS).resultado;
  const falhas = dados(useFalhas().resultado);
  return useMemo(() => {
    if (!rua || agora.estado === "a-carregar" || ontem.estado === "a-carregar") return null;
    // Um segmento da rua em falha (①) à hora do cursor não conta: nada se estima (ADR-0034, ponto 5).
    const emFalha = new Set(rua.segmentos.filter((s) => falhas && falhaNaHora(falhas, s, hora)));
    const resumo = resumirRua(rua, dados(agora) ?? [], dados(ontem), emFalha);
    return { rua, resumo, frase: fraseDaRua(rua.nome, resumo) };
  }, [rua, agora, ontem, falhas, hora]);
}

// ── O reconhecimento e a síntese do browser (Web Speech API) ──

interface Reconhecedor {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}
type ClasseReconhecedor = new () => Reconhecedor;

/** A classe do reconhecimento de fala, ou null (Firefox, Safari sem suporte). */
function classeReconhecimento(): ClasseReconhecedor | null {
  const w = window as unknown as { SpeechRecognition?: ClasseReconhecedor; webkitSpeechRecognition?: ClasseReconhecedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const comSintese = () => typeof speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";

function lerAviso(): boolean {
  try {
    return localStorage.getItem(CHAVE_AVISO) === "1";
  } catch {
    return false;
  }
}
function guardarAviso() {
  try {
    localStorage.setItem(CHAVE_AVISO, "1");
  } catch {
    /* sem armazenamento: o aviso volta a aparecer, não faz mal */
  }
}

/** Erros do reconhecimento que tiram o 🎙 até recarregar: fica a caixa de texto. */
const ERROS_SEM_VOZ = new Set(["not-allowed", "service-not-allowed", "network", "audio-capture", "language-not-supported"]);

/** `modo`: o nome do modo «agora» ou «Ao vivo» que desliga a voz, ou null. */
export function useVoz(modo: "agora" | "Ao vivo" | null = null) {
  const { despachar } = useEstadoDemo();
  const segmentosCarros = useSegmentosCarros();
  const Classe = useMemo(classeReconhecimento, []);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [recusada, setRecusada] = useState(false);
  const [aberta, setAberta] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [texto, setTexto] = useState("");
  const [naoPercebi, setNaoPercebi] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [aviso, setAviso] = useState(false);
  const [lendo, setLendo] = useState(false);
  const rec = useRef<Reconhecedor | null>(null);
  const comVoz = Classe !== null && online && !recusada;
  const desligada = modo !== null;

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  // A leitura em voz alta pode sempre ser interrompida (WCAG 1.4.2): ⏹, Esc, o 🎙, uma pergunta nova, fechar, mudar de separador ou de modo.
  // Só a leitura atual desliga o ⏹: o Chromium manda o `error` («interrupted») da leitura cancelada depois de a nova começar
  // (cerca de 19 ms), e sem isto a resposta a uma sugestão, depois de «Não percebi.», lia-se sem o ⏹.
  const leituraAtual = useRef<SpeechSynthesisUtterance | null>(null);
  const pararLeitura = useCallback(() => {
    leituraAtual.current = null;
    if (comSintese()) speechSynthesis.cancel();
    setLendo(false);
  }, []);
  const falar = useCallback((texto: string) => {
    if (!comSintese()) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(texto);
    u.lang = "pt-PT";
    leituraAtual.current = u;
    u.onend = u.onerror = () => {
      if (leituraAtual.current !== u) return;
      leituraAtual.current = null;
      setLendo(false);
    };
    setLendo(true);
    speechSynthesis.speak(u);
  }, []);

  const responder = useCallback(
    (pergunta: string) => {
      pararLeitura();
      const rua = reconhecerRua(pergunta, config.voz.ruas);
      if (rua) {
        setNaoPercebi(false);
        setAberta(false);
        setTexto("");
        // O pop-up abre no 1.º troço medido da rua (com câmara ou radar), como se o troço tivesse sido clicado.
        const segmento = rua.segmentos.find((id) => segmentosCarros.some((s) => s.id === id)) ?? rua.segmentos[0];
        despachar({ tipo: "rua-voz", nome: rua.nome, segmento });
      } else {
        setNaoPercebi(true);
        setAberta(true);
        setMensagem(`${NAO_PERCEBI} ${SUGESTOES.join(" ")}`);
        falar("Não percebi.");
      }
    },
    [despachar, segmentosCarros, falar, pararLeitura],
  );

  // O aviso de privacidade aparece na 1.ª pergunta por voz, e não volta (nem nesta sessão, nem nas seguintes).
  const mostrarAviso = useCallback(() => {
    const visto = lerAviso();
    setAviso(!visto);
    if (!visto) guardarAviso();
  }, []);

  const cancelar = useCallback(() => {
    pararLeitura();
    rec.current?.abort();
    rec.current = null;
    setOuvindo(false);
    setAberta(false);
    setNaoPercebi(false);
    setTexto("");
  }, [pararLeitura]);

  const ouvir = useCallback(() => {
    if (desligada) return;
    pararLeitura();
    setAberta(true);
    setNaoPercebi(false);
    if (!comVoz || !Classe) return;
    mostrarAviso();
    rec.current?.abort();
    const r = new Classe();
    r.lang = "pt-PT";
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let dito = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        dito += e.results[i][0].transcript;
        final ||= e.results[i].isFinal;
      }
      setTexto(dito);
      if (final) responder(dito);
    };
    r.onerror = (e) => {
      if (ERROS_SEM_VOZ.has(e.error)) setRecusada(true);
    };
    r.onend = () => {
      setOuvindo(false);
      if (rec.current === r) rec.current = null;
    };
    rec.current = r;
    setTexto("");
    setOuvindo(true);
    try {
      r.start();
    } catch {
      setOuvindo(false);
      setRecusada(true);
    }
  }, [Classe, comVoz, desligada, mostrarAviso, responder, pararLeitura]);

  // Ao entrar no modo «agora» ou «Ao vivo», a pergunta aberta cancela-se.
  useEffect(() => {
    if (desligada) cancelar();
  }, [desligada, cancelar]);

  // `V` (fora dos campos de texto, e não nos modos «agora» e «Ao vivo») abre a pergunta; Esc cancela-a.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const aEscrever = alvo?.closest?.("input, textarea, select, [contenteditable='true']");
      if ((e.key === "v" || e.key === "V") && !desligada && !e.ctrlKey && !e.metaKey && !e.altKey && !aEscrever) {
        e.preventDefault();
        ouvir();
      } else if (e.key === "Escape" && (aberta || ouvindo)) {
        e.preventDefault();
        cancelar();
      } else if (e.key === "Escape" && lendo) {
        e.preventDefault();
        pararLeitura();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [ouvir, cancelar, pararLeitura, aberta, ouvindo, lendo, desligada]);

  return { comVoz, desligada, modo, aberta, ouvindo, lendo, texto, naoPercebi, mensagem, setMensagem, aviso, ouvir, cancelar, responder, falar, pararLeitura };
}

export type Voz = ReturnType<typeof useVoz>;

/** O botão nos controlos do mapa: o 🎙 com voz; sem voz, abre a caixa de texto. */
export function BotaoVoz({ voz }: { voz: Voz }) {
  const rotulo = voz.modo ? vozDesligadaNoModo(voz.modo) : voz.comVoz ? "Perguntar por voz (V)" : "Perguntar sobre uma rua (V)";
  return (
    <button
      type="button"
      className={`ferramenta botao-voz ${voz.ouvindo ? "botao-voz--a-ouvir" : ""}`}
      aria-label={rotulo}
      title={rotulo}
      aria-pressed={voz.ouvindo}
      disabled={voz.desligada}
      onClick={() => (voz.ouvindo ? voz.cancelar() : voz.ouvir())}
    >
      <Icone nome={voz.comVoz ? "microfone" : "pergunta"} />
    </button>
  );
}

/** A faixa por cima do mapa: o texto ouvido ao vivo, ou a caixa de texto, e as sugestões. E a região que lê a resposta. */
export function FaixaVoz({ voz }: { voz: Voz }) {
  const { estado, despachar } = useEstadoDemo();
  const resposta = useRespostaRua(estado.ruaVoz?.nome ?? null, estado.hora);
  const dita = useRef(0);
  const { setMensagem, falar, pararLeitura } = voz;
  // A resposta diz-se uma vez por pergunta, quando os números chegam; mudar a hora não volta a falar.
  useEffect(() => {
    const n = estado.ruaVoz?.n ?? 0;
    if (!resposta || n === 0 || dita.current === n) return;
    dita.current = n;
    setMensagem(resposta.frase);
    falar(resposta.frase);
  }, [resposta, estado.ruaVoz, setMensagem, falar]);
  // Fechar a faixa ou o pop-up (ruaVoz passa a null) e mudar de separador param a leitura. Sem rua, a contagem recomeça
  // em 1 (estado.tsx), por isso a próxima pergunta volta a dizer-se.
  const semRua = !estado.ruaVoz;
  useEffect(() => {
    if (!semRua) return;
    dita.current = 0;
    pararLeitura();
  }, [semRua, pararLeitura]);
  useEffect(() => pararLeitura, [estado.separador, pararLeitura]);
  const botaoParar = voz.lendo && (
    <button type="button" className="botao-icone faixa-voz__parar" aria-label="Parar leitura" title="Parar leitura (Esc)" onClick={pararLeitura}>
      <span aria-hidden="true">⏹</span>
    </button>
  );

  const [escrito, setEscrito] = useState("");
  const entrada = useRef<HTMLInputElement>(null);
  const comCaixa = voz.aberta && !voz.ouvindo;
  useEffect(() => {
    if (comCaixa && !voz.comVoz) entrada.current?.focus();
  }, [comCaixa, voz.comVoz]);
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (escrito.trim()) voz.responder(escrito);
  };
  const perguntar = (s: string) => {
    setEscrito("");
    voz.responder(s);
  };

  return (
    <>
      <p className="so-leitor" aria-live="polite">
        {voz.mensagem}
      </p>
      {/* A frase escrita da resposta, a mesma que se diz (com a ressalva do radar); os números do troço estão no pop-up. */}
      {!voz.aberta && !voz.desligada && estado.ruaVoz && resposta && (
        <div className="faixa-voz" role="region" aria-label="Resposta sobre uma rua">
          <div className="faixa-voz__linha">
            <p className="faixa-voz__texto">{resposta.frase}</p>
            {botaoParar}
            <button type="button" className="botao-icone faixa-voz__fechar" aria-label="Fechar a resposta" onClick={() => despachar({ tipo: "popup", sensor: null })}>
              <Icone nome="fechar" />
            </button>
          </div>
        </div>
      )}
      {voz.aberta && !voz.desligada && (
        <div className="faixa-voz faixa-voz--pergunta" role="region" aria-label="Pergunta sobre uma rua">
          {voz.aviso && <p className="faixa-voz__aviso">{AVISO_PRIVACIDADE}</p>}
          <div className="faixa-voz__linha">
            {voz.ouvindo ? (
              <p className="faixa-voz__texto">
                <Icone nome="microfone" />
                <span>{voz.texto ? `«${voz.texto}…»` : "A ouvir… pergunte, por exemplo, «Como está a Av. 25 de Abril?»"}</span>
              </p>
            ) : (
              <form className="faixa-voz__form" onSubmit={enviar}>
                <input
                  ref={entrada}
                  className="faixa-voz__entrada"
                  type="text"
                  value={escrito}
                  onChange={(e) => setEscrito(e.target.value)}
                  placeholder="Pergunte sobre uma rua…"
                  aria-label="Pergunta sobre uma rua"
                />
                <button type="submit" className="botao faixa-voz__enviar">
                  Perguntar
                </button>
              </form>
            )}
            {botaoParar}
            <button
              type="button"
              className="botao-icone faixa-voz__fechar"
              aria-label="Fechar a pergunta"
              onClick={() => {
                voz.cancelar();
                if (estado.ruaVoz) despachar({ tipo: "popup", sensor: null });
              }}
            >
              <Icone nome="fechar" />
            </button>
          </div>
          {voz.naoPercebi && <p className="faixa-voz__erro">{NAO_PERCEBI}</p>}
          <ul className="faixa-voz__chips" aria-label="Sugestões">
            {SUGESTOES.map((s) => (
              <li key={s}>
                <button type="button" className="chip-voz" onClick={() => perguntar(s)}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
