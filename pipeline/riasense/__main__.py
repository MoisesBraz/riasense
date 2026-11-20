"""Comando do pipeline: `riasense <subcomando>` ou `python -m riasense <subcomando>`."""

import argparse
import sys

from riasense import (agora, anepc, avenida, carros, completar, config, exportar, ingerir, luminosidade, meteo, osm, prever, proteger,
                      proximo, risco, sensores, validacao, vigiar, zonas)

# Passos do pipeline pela ordem em que correm (ADR-0003: tudo offline, resultados em Parquet).
SUBCOMANDOS = {
    "ingerir": "lê os CSV de RIASENSE_DATA_RAW e escreve tabelas limpas",
    "sensores": "posições, vizinhos e segmentos junto às passadeiras",
    "meteo": "descarrega a chuva e a temperatura horárias (Open-Meteo, CC BY 4.0; precisa de rede)",
    "luminosidade": "dia, crepúsculo ou noite em cada hora, pela posição do sol (ADR-0018; sem rede)",
    "osm": "atributos das passadeiras pelo OpenStreetMap, com o semáforo (ADR-0019; ODbL; precisa de rede)",
    "vigiar": "falhas inesperadas, de rede ou de dispositivo",
    "agora": "taxas do painel «agora»: a base da ① por hora, sem os silêncios longos (ADR-0032)",
    "completar": "sensores virtuais: razão nas passadeiras e nas zonas, ridge nos segmentos (ADR-0005 e ADR-0046)",
    "proximo": "onde pôr o próximo sensor: os locais que os vizinhos explicam pior (ADR-0015)",
    "prever": "daqui a 3 e 6 h, só se ganhar à referência e à persistência (ADR-0027)",
    "validar": "② e ③ em 4 janelas, com outros modelos e as variáveis retiradas (ADR-0031; não muda o produto)",
    "proteger": "abrandamento junto às passadeiras (ADR-0006)",
    "risco": "mapa de risco potencial por passadeira e hora (ADR-0013)",
    "carros": "passagens e velocidade por segmento e hora, só câmara ou radar, e a geometria (ADR-0034)",
    "avenida": "a via, as faixas, os passeios e os lugares do corredor da demo, acertados pelas passadeiras (ADR-0044; depois do ingerir e do vigiar)",
    "zonas": "visitas medidas por zona turística e hora, pela hora de entrada, para o mapa de calor (ADR-0047)",
    "anepc": "coerência temporal do risco potencial com os atropelamentos da ANEPC de 2016 a 2020 (ADR-0036; precisa de rede se faltarem os CSV)",
    "exportar": "converte os Parquet de data/processed em NGSI-LD (ADR-0008)",
}


def main(argv: list[str] | None = None) -> int:
    # No Windows, com a saída redirigida para um ficheiro, o Python usa a cp1252, e o «→» das mensagens dá erro.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="riasense", description="Pipeline da RiaSense.")
    sub = parser.add_subparsers(dest="subcomando", required=True, metavar="subcomando")
    for nome, ajuda in SUBCOMANDOS.items():
        sub.add_parser(nome, help=ajuda)
    args = parser.parse_args(argv)

    try:
        cfg = config.carregar()
    except config.ConfigInvalida as e:
        print(f"erro: {e}", file=sys.stderr)
        return 1

    if args.subcomando == "ingerir":
        return ingerir.correr(cfg)
    if args.subcomando == "sensores":
        return sensores.correr(cfg)
    if args.subcomando == "meteo":
        return meteo.correr(cfg)
    if args.subcomando == "luminosidade":
        return luminosidade.correr(cfg)
    if args.subcomando == "osm":
        return osm.correr(cfg)
    if args.subcomando == "prever":
        return prever.correr(cfg)
    if args.subcomando == "validar":
        return validacao.correr(cfg)
    if args.subcomando == "proteger":
        return proteger.correr(cfg)
    if args.subcomando == "risco":
        return risco.correr(cfg)
    if args.subcomando == "vigiar":
        return vigiar.correr(cfg)
    if args.subcomando == "agora":
        return agora.correr(cfg)
    if args.subcomando == "completar":
        return completar.correr(cfg)
    if args.subcomando == "proximo":
        return proximo.correr(cfg)
    if args.subcomando == "carros":
        return carros.correr(cfg)
    if args.subcomando == "avenida":
        return avenida.correr(cfg)
    if args.subcomando == "zonas":
        return zonas.correr(cfg)
    if args.subcomando == "anepc":
        return anepc.correr(cfg)
    if args.subcomando == "exportar":
        return exportar.correr(cfg)

    print(f"riasense {args.subcomando}: por implementar", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
