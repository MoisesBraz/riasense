/**
 * Estado «offline» do Figma: a demo corre sem rede (art. 22.º, n.º 6). Diz de onde vêm os dados e as licenças,
 * incluindo a atribuição do mapa (ADR-0014). Se a API não responder, diz isso em vez de «tudo a funcionar».
 */
import { useSensores } from "../api/recursos";
import { API_URL, config } from "../config";
import { rotuloDia } from "../dominio/tempo";
import { AVISO_PRIVACIDADE } from "../dominio/voz";
import { Cartao, Selo } from "./Basicos";

export function DadosLocais() {
  const { resultado } = useSensores();
  const periodo = `${rotuloDia(config.periodo.inicio)} a ${rotuloDia(config.periodo.fim)}`;
  const apiOk = resultado.estado === "ok";
  return (
    <div className="dados-locais">
      <div className="estado__linha">
        <strong className="estado__titulo">Dados locais</strong>
        {/* Cinzento, como o indicador do cabeçalho (ADR-0048, ponto 3): «Offline» é o estado normal, não um êxito. */}
        <Selo tipo={apiOk ? "neutro" : "erro"}>{apiOk ? "Offline" : "API sem resposta"}</Selo>
      </div>
      <p className="nota">A demo corre sem rede (art. 22.º, n.º 6).</p>
      <Cartao destaque={apiOk ? "ok" : "erro"}>
        <strong className="dados-locais__titulo">
          {apiOk ? "Sem ligação à Internet, tudo a funcionar" : `A API não responde em ${API_URL}`}
        </strong>
        <p className="nota">
          Resultados pré-calculados em data/processed · {periodo} · mapa offline (PMTiles), sem azulejos externos.
        </p>
      </Cartao>
      <Cartao titulo="Fontes e licenças">
        <ul className="lista-simples">
          <li>Living Lab de Aveiro (ATCLL), {periodo}/2026</li>
          <li>Open-Meteo, CC BY 4.0 · cópia local</li>
          <li>© contribuidores do OpenStreetMap, ODbL · Protomaps</li>
          {/* ADR-0045: a vista aérea da zona da demo. */}
          <li>Ortofotos © Direção-Geral do Território, 2025 (CC BY 4.0) · vista aérea</li>
          {/* ADR-0050: as alturas dos edifícios da zona da demo. */}
          <li>Informação geográfica cedida pela Direção-Geral do Território: LiDAR 2024, CC BY 4.0 (alturas dos edifícios)</li>
        </ul>
        {/* ADR-0017 a ADR-0019 e ADR-0022 (e ADR-0048, ponto 2): os semáforos, as alturas e a iluminação vêm de fontes abertas. */}
        <p className="nota dados-locais__fontes-abertas">
          Dados recolhidos de fontes abertas, usados só para contexto e coerência. Carecem de validação junto das entidades
          responsáveis.
        </p>
        {/* A pergunta por voz (ADR-0054): o reconhecimento é do browser, com rede. */}
        <p className="nota dados-locais__voz">{AVISO_PRIVACIDADE}</p>
      </Cartao>
    </div>
  );
}
