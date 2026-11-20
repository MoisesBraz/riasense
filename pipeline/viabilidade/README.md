# viabilidade

Testes exploratórios de 17/11/2026 que justificaram a RiaSense (ver [docs/ideia-riasense.md](../../docs/ideia-riasense.md)). **Não fazem parte do pipeline**: servem de referência para as camadas.

Correr a partir desta pasta, com `RIASENSE_DATA_RAW` definido:

```bash
uv run --no-project --with duckdb --with numpy --with pandas --with scikit-learn --with lightgbm python extract.py   # escreve data/*.parquet (cerca de 54 MB, fora do git)
```

| Script | Pergunta | Resultado |
| --- | --- | --- |
| `extract.py`, `geo.py` | Extrai tabelas compactas e as posições dos sensores | `data/` |
| `seriesA.py` | ② Os sensores vizinhos estão correlacionados? E se deixarmos um de fora? | `out_A_corr_hourly.csv`, `out_A_loso.csv` |
| `nearB.py`, `xcorrB.py` | Dá para ligar um carro a um peão (quase-conflitos)? Não dá | `out_B.csv` |
| `gapsC.py`, `gapsC2.py` | ① Falhas inesperadas, de rede ou de dispositivo | `out_C_gaps.csv` (ignorar a coluna `kind`) |
| `task1.py` | ② Preencher a RSU0030 só com 29 h de treino | `out_T1_sim.csv`, `out_T1_resid.csv`, `out_fill_rsu0030.csv` |
| `task2.py` | ④ Os carros abrandam quando há peões? | `out_T2_speed.csv` |

Foram gerados com apoio de IA (ver `docs/uso-de-ia.md`). Rever antes de reaproveitar.

**Nota sobre os `gapsC*.py` e o `task1.py` (17/11):** o pipeline mudou alguns números destes scripts.

- **① (`riasense vigiar`):** a mediana da mesma hora, e não a média, e o limiar hora a hora. Dá 20 falhas inesperadas (7 de rede, num só incidente, e 13 de dispositivo; 38 depois do ADR-0025), e não as 96 (68 incidentes, 17 de rede) de `out_C_gaps.csv`. A falha da RSU0030 dura cerca de 135 h, e não 138 h, porque a janela comum termina a 10/11 às 11h00.
- **② (`riasense completar`):** os 5 vizinhos juntam-se pela mediana das razões e não pela razão entre somas (ADR-0012), sem tirar a SC0023 à mão. Os números de referência passam a ser os de `data/processed/avaliacao_completar.parquet`.

**Nota sobre o `task2.py` (17/11):** o script decide se uma passadeira abranda a partir do IC já arredondado a 2 casas (`"[-0.25,-0.00]"`). Como −0,0 < 0 é falso, a SC0011 saía como «não abranda». Com o valor exato, o limite superior do IC é −0,004 km/h: a SC0011 abranda, no limite. Por isso, o pipeline (`riasense proteger`) dá 19 de 24 passadeiras com abrandamento e 3 assinaladas (SC0013, SC0020 e SC0021), e não as 18 e 4 do `out_T2_speed.csv`.
