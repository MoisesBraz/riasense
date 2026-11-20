# Pergunta-se por voz como está o trânsito numa rua, e a resposta aparece no mapa, no pop-up do troço, só com dados medidos

Status: aceite pelo Moisés (19/11/2026), #173. Entra antes do fecho do código (20/11/2026, 13h30); o merge é do PO. Complementa o ADR-0033, o ADR-0034 e o ADR-0039 (a voz abre o mesmo pop-up do troço que o clique já abre, ADR-0039 ponto 4, com a ressalva do radar), o ADR-0044, o ADR-0032 e o ADR-0049 (nos modos «agora» e «Ao vivo», a voz fica desligada), o ADR-0048 (o aviso de privacidade fica também nos «Dados locais»), o ADR-0014 (sem rede, a demo é igual) e o ADR-0005, o ADR-0010 e o ADR-0007 (a referência e o «risco potencial»).

## Contexto

- O júri olha para o mapa e lê pouco (ADR-0033). Uma pergunta dita em voz alta, «Como está a Av. 25 de Abril?», mostra numa frase o que a camada «Trânsito» já tem: as passagens, a velocidade e a % acima do limite por segmento e hora (`segmentos_hora.parquet`, `/mapa/carros`).
- **Os segmentos não têm nome de rua.** O `segmentos_carros.geojson` só traz o `id` e o `sensor`, e o `RoadSegment.csv` não está ao alcance da web. Os sensores (SC00NN, RSU0030) têm nome na API.
- O browser já reconhece e diz fala em pt-PT (Web Speech API), sem dependências novas. Mas o reconhecimento só existe no Chrome e no Edge, envia o áudio para os servidores do browser (Google ou Microsoft) e precisa de rede.

## Decisão

1. **A voz é um botão do mapa, não um chat.** O microfone fica nos controlos do mapa, ao lado de «Camadas» e «Legenda» (a 390 px também: fica na coluna dos controlos, com 44 × 44 px, porque não há barra de baixo; decisão do Moisés, 19/11, #196). Enquanto ouve, o botão pulsa (parado com `prefers-reduced-motion`) e o texto ouvido aparece numa faixa por cima do mapa.
2. **A resposta é o mapa:** o mapa voa até à rua, realça os seus segmentos e abre o **mesmo pop-up do troço que o clique já abre** (ADR-0039, ponto 4; ADR-0044), no 1.º troço medido da rua: os veículos medidos nessa hora, o sensor, o limite da via e a % acima dele nesse troço. Uma frase curta, escrita por cima do mapa e dita com `speechSynthesis`, dá os veículos/h da rua, **somados nos dois sentidos, e di-lo**: em cada sentido, a média dos troços medidos nesse sentido, porque troços seguidos contam o mesmo carro (na Av. de Oita há 3 pares de sentidos opostos e na Av. da Universidade 6 dos 7 troços seguem no mesmo sentido), e depois a soma dos dois sentidos (por exemplo, «Av. 25 de Abril: 538 veículos por hora, nos dois sentidos», um troço por sentido). Com um só sentido medido, a frase diz «num só sentido»; nunca a média, porque o pop-up mostra um só sentido e o júri via dois números para a mesma avenida; decisão do Moisés, 19/11, #196), o sensor e a comparação com a **referência**, «mesma hora, dia anterior»: «mais / menos / igual ao de ontem a esta hora». Quando uma passadeira da rua tem risco, diz-se «risco potencial» (ADR-0007), nunca «risco».
3. **A ressalva do radar é obrigatória:** quando o troço é medido pelo radar (a Av. 25 de Abril, 10084 e 11168), a frase escrita e a falada levam «o radar e a câmara medem velocidades diferentes: o excesso não é comparável entre sensores». A % acima do limite só se diz por troço e com o sensor, no pop-up; nunca «a rua X tem Y % de excesso».
4. **A intenção reconhece-se sem modelo de linguagem:** palavras-chave e uma lista curta de ruas da zona da demo, com os seus segmentos, em `config/riasense.yaml` (`voz.ruas`, por exemplo «25 de abril» → 10084, 11168). Os nomes dos sensores (por exemplo, «como está a SC0019?») **não entram agora** e ficam no roadmap (decisão do Moisés, 19/11, #196: já não entram ideias novas). Se a pergunta não se reconhecer, responde-se «Não percebi. Experimente:» com as sugestões. Nada se estima: uma rua em falha diz «sem dados medidos a esta hora» (ADR-0034, ponto 5).
5. **Nunca parte a demo.** Sem `SpeechRecognition`, sem rede ou com o microfone recusado, o botão do microfone esconde-se e fica uma caixa de texto com as mesmas sugestões, que dá a mesma resposta no mapa. Há 3 sugestões prontas em chips.
6. **Só sobre a semana gravada:** nos modos «agora» (ADR-0032) e «Ao vivo» (ADR-0049), o botão do microfone, a tecla `V` e a caixa de texto ficam desligados, e o botão diz porquê.
7. **Acessibilidade:** a resposta está numa região `aria-live="polite"`, tudo se usa pelo teclado, há uma tecla de atalho (`V`, fora dos campos de texto) e a cor nunca é a única pista (o segmento realçado leva também contorno e o nome).

## Porquê, e as alternativas rejeitadas

- **Chat com um modelo de linguagem (LLM):** precisa de rede e de uma chave, pode inventar números que não foram medidos (contra o ADR-0007 e a regra da referência) e não cabe no prazo.
- **Assistente externo (Alexa, Google Assistant):** tira a resposta do mapa, depende de contas e de rede, e o júri não a vê no ecrã.
- **Reconhecimento offline no browser (Vosk, Whisper em WASM):** modelos de dezenas a centenas de MB e uma dependência nova; fica no roadmap se a voz sem rede for precisa.

## Consequências

- **Privacidade:** o áudio vai para a nuvem do browser. A app diz-o na primeira utilização e na janela «Dados locais», junto das fontes (ADR-0048): «a voz é reconhecida pelo browser, na Internet». Não guarda áudio nem texto.
- Só funciona por voz no Chrome e no Edge, com rede; no resto, fica a caixa de texto. A demo offline (ADR-0014) fica igual.
- Os nomes das ruas são escritos à mão para a zona da demo; tirá-los do OpenStreetMap fica no roadmap.
- Perguntar por um sensor pelo nome (SC00NN, RSU0030, 10084) fica no roadmap (decisão do Moisés, 19/11: já não entram ideias novas).
