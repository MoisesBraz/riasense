/**
 * A demo: mapa da zona à esquerda e painel do separador à direita (desktop), ou mapa em cima e painel em coluna
 * (móvel). O mapa é um só para os 4 separadores, por isso a zona e o enquadramento nunca mudam ao trocar.
 */
import { useCallback, useEffect, useState } from "react";
import { useAgoraDisponivel } from "./api/agora";
import { useAoVivo } from "./api/aoVivo";
import { BarraHora } from "./componentes/BarraHora";
import { BarraSuperior } from "./componentes/BarraSuperior";
import { GrupoFerramentas, Selo } from "./componentes/Basicos";
import { Camadas } from "./componentes/Camadas";
import { Icone } from "./componentes/Icone";
import { SemCobertura } from "./componentes/Estados";
import { Legenda } from "./componentes/Legenda";
import { BotaoVoz, FaixaVoz, useVoz } from "./componentes/PerguntaVoz";
import { MapaDaDemo } from "./componentes/mapa/MapaDaDemo";
import { config } from "./config";
import { rotuloHoras, HORA_MS } from "./dominio/tempo";
import { camadaLigada, EstadoDemoProvider, useEstadoDemo } from "./estado/estado";
import { useTema } from "./estado/tema";
import { useEcraLargo } from "./estado/useEcraLargo";
import { AvisosAgora, PainelAgora } from "./paineis/PainelAgora";
import { AgoraProvider } from "./estado/agora";
import { AvisoAoVivo, EtiquetaAoVivo, EtiquetaSemanaGravada, PainelAoVivo } from "./paineis/PainelAoVivo";
import { etiquetaSemanaGravada, horaDaSemanaGravada } from "./dominio/aoVivo";
import { horasEntre } from "./dominio/tempo";
import { PainelCompletar } from "./paineis/PainelCompletar";
import { PainelPrever } from "./paineis/PainelPrever";
import { PainelProteger } from "./paineis/PainelProteger";
import { ChipsVigiar, PainelVigiar } from "./paineis/PainelVigiar";

/** Aviso fixo no topo do mapa: o que o mapa mostra, quando não é só o estado dos sensores. */
function ChipDoMapa() {
  const { estado } = useEstadoDemo();
  if (estado.separador === "prever") {
    return (
      // O pop-up preso abre por baixo deste selo, e não por cima dele.
      <div className="chip-mapa sobreposto" data-tapa-mapa="pop-up">
        <Selo>Previsão</Selo>
        <span>Daqui a {config.prever.horizonteH} h · {rotuloHoras(estado.hora + config.prever.horizonteH * HORA_MS)}</span>
      </div>
    );
  }
  if (estado.separador === "proteger" && estado.vistaProteger === "risco") {
    return (
      <div className="chip-mapa sobreposto" data-tapa-mapa="pop-up">
        <Selo>Risco potencial</Selo>
        <span>Não mede acidentes</span>
      </div>
    );
  }
  return null;
}

function PainelAtivo() {
  const { estado, despachar } = useEstadoDemo();
  const paineis = {
    vigiar: PainelVigiar,
    completar: PainelCompletar,
    prever: PainelPrever,
    proteger: PainelProteger,
  };
  const Painel = paineis[estado.separador];
  return (
    <aside id="painel" className="painel" role="tabpanel" aria-labelledby={`separador-${estado.separador}`} tabIndex={0}>
      {estado.rua && (
        <SemCobertura
          nome={estado.rua.nome}
          onFechar={() => despachar({ tipo: "rua", rua: null })}
          onProximo={() => despachar({ tipo: "separador", separador: "completar" })}
        />
      )}
      <Painel />
    </aside>
  );
}

function Demo() {
  const { tema, alternar } = useTema();
  const largo = useEcraLargo();
  // A bússola (ADR-0042, ponto 4) desenha-se pelo Mapa, que sabe o rumo, mas fica aqui, por cima das camadas.
  const [alvoBussola, setAlvoBussola] = useState<HTMLDivElement | null>(null);
  const { estado, despachar } = useEstadoDemo();
  // O painel «agora» (ADR-0030, ADR-0032) só aparece se a API o servir (agora.ativo); a demo fica igual sem ele.
  const agoraDisponivel = useAgoraDisponivel();
  const [agoraAberto, setAgoraAberto] = useState(false);
  // O modo «Ao vivo» (ADR-0049): o Living Lab de agora, por trás do botão na janela do indicador. A hora da semana fica onde
  // estava, e «Voltar aos dados da semana» volta a ela.
  const [aoVivo, setAoVivo] = useState(false);
  const [avisoAoVivo, setAvisoAoVivo] = useState<string | null>(null);
  const leituraAoVivo = useAoVivo(aoVivo);
  const entrarAoVivo = () => {
    setAgoraAberto(false);
    despachar({ tipo: "popup", sensor: null });
    despachar({ tipo: "filtro-vigiar", filtro: null });
    despachar({ tipo: "rua", rua: null });
    setAvisoAoVivo(null);
    setAoVivo(true);
  };
  const sairAoVivo = useCallback((aviso: string | null = null) => {
    setAoVivo(false);
    setAvisoAoVivo(aviso);
  }, []);
  const fecharAviso = useCallback(() => setAvisoAoVivo(null), []);
  // Se a ligação cair, ou não chegar a abrir, sai-se sozinho e diz-se porquê (ADR-0049, ponto 5).
  useEffect(() => {
    if (!aoVivo) return;
    if (leituraAoVivo.estado === "ligação perdida" || leituraAoVivo.estado === "desligado") sairAoVivo("Ligação perdida: voltou-se aos dados da semana.");
    else if (leituraAoVivo.estado === "sem rede") sairAoVivo("Sem rede: não foi possível ligar ao Living Lab.");
  }, [aoVivo, leituraAoVivo.estado, sairAoVivo]);
  // ADR-0055, ponto 4: mudar de separador já não sai do «Ao vivo». No ① e no ④, o mapa é o ao vivo; na ② e na ③, que precisam
  // de horas de histórico, o mapa e o painel são os da semana gravada, à mesma hora e dia da semana de agora, com a etiqueta.
  const semanaNoVivo = aoVivo && (estado.separador === "completar" || estado.separador === "prever");
  const mapaVivo = aoVivo && !semanaNoVivo;
  useEffect(() => {
    if (!semanaNoVivo) return;
    const hora = horaDaSemanaGravada(new Date(), horasEntre(config.periodo.inicio, config.periodo.fim));
    if (hora !== null) despachar({ tipo: "hora", hora });
  }, [semanaNoVivo, despachar]);
  // O modo «agora» é do ① Vigiar: abri-lo leva ao Vigiar e fecha o detalhe aberto (que era da semana gravada).
  const alternarAgora = () => {
    if (!agoraAberto) {
      setAoVivo(false);
      despachar({ tipo: "separador", separador: "vigiar" });
      despachar({ tipo: "popup", sensor: null });
    }
    setAgoraAberto((a) => !a);
  };
  // Só existe no ① Vigiar: mudar de separador fecha-o (ADR-0032), e o simulado não passa ao ② nem ao ④ (ADR-0033, ponto 2).
  useEffect(() => {
    if (estado.separador !== "vigiar") setAgoraAberto(false);
  }, [estado.separador]);
  const emAgora = agoraDisponivel && agoraAberto && estado.separador === "vigiar";
  // A pergunta por voz (ADR-0054) é sobre a semana gravada: nos modos «agora» e «Ao vivo», fica desligada.
  const voz = useVoz(aoVivo ? "Ao vivo" : emAgora ? "agora" : null);
  // ① Vigiar: mapa primeiro; a barra lateral só existe depois de clicar num sensor, na RSU ou num chip.
  // ② a ④: o ✕ do cabeçalho fecha o painel, e o mapa ocupa a largura toda; o botão do mapa e mudar de separador reabrem-no.
  const painelFechado = estado.separador !== "vigiar" && estado.painelFechado;
  const semPainel = mapaVivo || painelFechado || (estado.separador === "vigiar" && !estado.filtroVigiar && !estado.rua);
  useEffect(() => {
    // O Esc do sensor trata-o o MapaDaDemo (devolve o foco ao marcador e marca o evento); aqui fecha a lista de um chip.
    const fechar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !estado.popup && estado.filtroVigiar) despachar({ tipo: "filtro-vigiar", filtro: null });
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [estado.popup, estado.filtroVigiar, despachar]);
  return (
    <div className="app">
      <BarraSuperior
        tema={tema}
        onAlternarTema={alternar}
        agora={agoraDisponivel ? { aberto: agoraAberto, onAlternar: alternarAgora } : undefined}
        aoVivo={{ ativo: aoVivo, onEntrar: entrarAoVivo, onSair: () => sairAoVivo() }}
      />
      <AgoraProvider ativo={emAgora} onFechar={() => setAgoraAberto(false)}>
        <main className={`corpo ${semPainel ? "corpo--sem-painel" : ""}`}>
          <section className={`area-mapa ${emAgora ? "area-mapa--agora" : ""} ${aoVivo ? "area-mapa--ao-vivo" : ""}`} aria-label="Mapa da zona">
            <MapaDaDemo tema={tema} aoVivo={mapaVivo ? leituraAoVivo : null} alvoBussola={alvoBussola} />
            {/* As Camadas à esquerda e a Legenda à direita, acima do «+» (ADR-0058); o grupo decide se abrir uma fecha a outra. */}
            <GrupoFerramentas exclusivo={!largo}>
              <div className="controlos-mapa">
                {largo && !mapaVivo && <div ref={setAlvoBussola} className="bussola-alvo" />}
                {/* No mapa ao vivo, as Camadas são as que se calculam com as deteções de agora (ADR-0055, ponto 3). */}
                <Camadas aoVivo={mapaVivo} />
                {/* A pergunta por voz (ADR-0054): ao lado das Camadas e da Legenda; desligada, e a dizer porquê, no «agora» e no «Ao vivo». */}
                <BotaoVoz voz={voz} />
                {painelFechado && !mapaVivo && (
                  <button
                    type="button"
                    className="ferramenta ferramenta--painel"
                    aria-label="Abrir o painel"
                    title="Abrir o painel"
                    onClick={() => despachar({ tipo: "painel", aberto: true })}
                  >
                    <Icone nome="painel" />
                  </button>
                )}
              </div>
              <div className="controlos-direita">
                <Legenda
                  separador={estado.separador}
                  vista={estado.vistaProteger}
                  proximo={estado.proximo}
                  aoVivo={mapaVivo}
                  calor={
                    estado.separador === "proteger" && estado.vistaProteger === "risco"
                      ? undefined
                      : { peoes: camadaLigada(estado, "calorPeoes"), veiculos: camadaLigada(estado, "calorVeiculos") }
                  }
                />
              </div>
            </GrupoFerramentas>
            <FaixaVoz voz={voz} />
            {/* No modo «agora», a faixa do simulador fica no lugar dos chips, e a hora é a simulada (sem cursor nem fita). */}
            {semanaNoVivo ? (
              <EtiquetaSemanaGravada texto={etiquetaSemanaGravada(estado.hora)} />
            ) : aoVivo ? (
              <EtiquetaAoVivo />
            ) : emAgora ? (
              <PainelAgora />
            ) : estado.separador === "vigiar" ? (
              // Com o pop-up de um sensor aberto, os cartões saem: o foco é esse sensor.
              !estado.popup && <ChipsVigiar />
            ) : (
              <ChipDoMapa />
            )}
            {aoVivo ? (
              <PainelAoVivo leitura={leituraAoVivo} onVoltar={() => sairAoVivo()} />
            ) : emAgora ? (
              <AvisosAgora />
            ) : (
              <BarraHora />
            )}
            {!aoVivo && avisoAoVivo && <AvisoAoVivo texto={avisoAoVivo} onFechar={fecharAviso} />}
          </section>
          {!semPainel && <PainelAtivo />}
        </main>
      </AgoraProvider>
    </div>
  );
}

export function App() {
  return (
    <EstadoDemoProvider>
      <Demo />
    </EstadoDemoProvider>
  );
}
