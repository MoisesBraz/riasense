# O painel «agora» corre sobre um simulador com dados fictícios, porque o IT recusou o acesso em tempo real

Status: proposto (17/11/2026). Substitui em parte o ADR-0030 (ponto 1: sem autorização, o painel entra na demo, mas com a fonte simulada; ponto 8: a falha da RSU0030 também se mostra no simulador, com dados fictícios). Complementa o ADR-0029 (a reprodução da semana real). Revisto a 18/11 (#115): no ① Vigiar, o «agora» passa a ser um modo do mapa (ponto 7), e o alerta chega cerca de 8 s depois de se carregar no botão (ponto 3). Alterado a 20/11 pelo Moisés: o botão do modo passa a «Simular falha» e o de dentro a «Cortar a RSU0030» (pontos 3 e 7).

## Contexto

- A 17/11, às 21h36, o mentor CMA/IT recusou o acesso em tempo real (#19, pergunta 16): «Não podemos facultar esse acesso, visto que nem todos o teem. No entanto, podem iterar sobre os dados que teem.» Pelo ADR-0030, o painel com dados reais fica no roadmap.
- A reprodução da semana real (ADR-0029) mostra o que aconteceu, acelerado. Não mostra o que a RiaSense faria ligada ao Living Lab: um ecrã que recebe dados sem parar e avisa quando um sensor deixa de comunicar. Esse aviso é a falta que o mentor descreveu: «Não temos uma maneira/alerta para quando há uma ausência de dados» (#19).
- O PO decidiu mostrá-lo com uma simulação de dados fictícios, sempre identificada como tal (Q1 a Q4, 17/11).

## Decisão

1. **Um simulador é a fonte do painel «agora».** É uma das fontes do adaptador do ADR-0030 (ponto 4). O resto do painel segue o ADR-0030:
   - a regra «sem comunicação», por passadeira e por RSU (ponto 3);
   - a leitura só em memória (ponto 5);
   - o interruptor (ponto 6);
   - a demo offline intacta (ponto 7).

   Com autorização do IT, troca-se só a fonte pelo Context Broker. A escolha fica em `agora.fonte` (`simulador` ou `context_broker`).
2. **Dados fictícios.** Os eventos de cada passadeira e dos segmentos junto a elas sorteiam-se por um processo de Poisson. A taxa é a do perfil horário desse sensor na semana de 3 a 10/11, à hora simulada (dia útil ou fim de semana). Nunca se copiam linhas dos CSV. A semente é fixa (`agora.simulador.semente`), para a demo correr sempre igual.
3. **Velocidade e botões.**
   - A velocidade é ×60 por omissão, ou seja, 1 minuto simulado por segundo. O ritmo real (×1) fica disponível (`agora.simulador.velocidade`).
   - O relógio mostra só «hora simulada» (por exemplo, «hora simulada 19h50»), sem data. Nunca mostra uma data da semana de 3 a 10/11, para não se confundir com a falha real. Começa num dia útil às 19h50 (`agora.simulador.inicio`).
   - O botão **«Cortar a RSU0030»** (até 20/11, «simular a falha da RSU0030»; mudou por decisão do Moisés, para não se confundir com o «Simular falha» do ponto 7, que só abre o modo) deixa sem comunicação as passadeiras e os segmentos ligados a essa RSU. O painel mostra o «último dado há X min» a subir, e o alerta «sem comunicação» aparece quando o silêncio passa o limite da regra: por RSU, o limite depende da hora (cerca de 7,6 min às 19h50 e cerca de 13 min às 20h), ou seja, o alerta chega cerca de 8 s depois de se carregar no botão, e cerca de 13 s se se carregar às 20h, a ×60.
   - O botão **«repor»** volta ao normal.
4. **Só a ①.** O sensor virtual ao vivo (②) fica de fora: aparece na reprodução da semana real (ADR-0029).
5. **Sempre identificado.** A etiqueta «Simulação com dados fictícios, gerados a partir da semana de 3 a 10/11 — não são dados reais» está sempre visível no painel. **A etiqueta vem dos dados:** cada resposta da API leva `fonte: "simulador"`, e a web mostra a etiqueta dentro da moldura do painel sempre que a fonte é essa. Um teste garante-o. Nenhum número da simulação entra no relatório, no pitch ou na wiki como resultado.
6. **Corre na API, só em memória**, e nada se grava em disco. Vem desligado por omissão (`agora.ativo: false`) e liga-se na demo. A reprodução (▶) e os resultados pré-calculados não mudam.
7. **No ① Vigiar, o «agora» é um modo do mapa** (alterado a 18/11, nota 12910 do !99 e #115). O botão «Simular falha» (até 20/11, «Agora · simulação»; mudou a pedido do João, para dizer ao que vem) abre um modo, e não uma caixa com listas: uma faixa no topo, no lugar dos 3 chips, com o cartão «Agora», a etiqueta da simulação, a hora simulada (×60), «Cortar a RSU0030», «Repor» e ✕. O simulador pinta os marcadores com o estado simulado, segundo o ponto 1 do ADR-0033: a comunicar a verde, sem comunicação a âmbar e falha a vermelho. As passadeiras de uma RSU sem comunicação mostram o alerta da RSU, e a RSU sem comunicação leva o rótulo «sem comunicação» e só passa a vermelho quando cumpre o critério da falha inesperada (ADR-0025). Os avisos aparecem no canto, e clicar num aviso abre o detalhe. **A hora é a simulada:** a barra da hora e a fita saem enquanto o modo está aberto, e fechar o modo volta à semana gravada. **O modo existe só no ① Vigiar:** mudar de separador fecha-o (a faixa e os marcadores simulados não passam ao ② nem ao ④, ADR-0033, ponto 2). O simulador só arranca quando o modo abre (relógio às 19h50), e não quando a app abre. **A etiqueta do ponto 5 continua sempre visível e vem dos dados, também dentro da faixa.** Os pontos 1 a 6 mantêm-se.

## Consequências

- O júri vê, em 20 segundos, a falta que o mentor descreveu e como a RiaSense a resolve ao vivo, sem dados reais e sem mudar nenhum número.
- **Prazo:** o Programador faz o simulador (#87) depois da validação dos modelos (#85), até quinta, 19/11, às 20h. Se não ficar pronto, a demo usa só a reprodução da semana real.
- **Risco:** o júri pode confundir a simulação com dados reais. Por isso há a etiqueta, e no pitch diz-se «isto é uma simulação de como funcionaria ao vivo».
- **Fora de âmbito:** a ② ao vivo, o estacionamento, as zonas turísticas e os segmentos que não estão junto às passadeiras.
- O ADR-0030 passa a dizer, na linha de estado, que a autorização foi recusada e que a fonte da demo é este simulador.
