"""Leitura de config/riasense.yaml: os parâmetros vivem lá e não no código (convenções do README)."""

import os
from pathlib import Path

import yaml
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

RAIZ = Path(__file__).resolve().parents[2]
CAMINHO_PADRAO = RAIZ / "config" / "riasense.yaml"

# Campos de que o código depende; um campo em falta tem de parar a corrida logo à leitura.
OBRIGATORIOS = [
    "cidade",
    "fuso_horario",
    "periodo_dados.inicio",
    "periodo_dados.fim",
    "unidades_velocidade",
    "demo.zona",
    "demo.rsu",
    "demo.passadeiras",
    "demo.incidente.rsu",
    "demo.incidente.inicio",
    "ingerir.velocidade_invalida",
    "ingerir.duracao_max_s",
    "ingerir.travessia_max_s",
    "vigiar.tipos_sensor",
    "vigiar.falha_min_horas",
    "vigiar.esperado_min_eventos_hora",
    "vigiar.silencio_longo_h",
    "vigiar.total_esperado_min",
    "vigiar.agrupar_inicio_min",
    "vigiar.usar_meteo",
    "vigiar.chuva_min_mm",
    "completar.vizinhos_mesmo_tipo",
    "completar.razao_max",
    "completar.intervalo",
    "completar.completaveis",
    "completar.piso_eventos_h",
    "completar.ativo_min_eventos_h",
    "completar.horas_noite",
    "completar.referencia",
    "completar.semente",
    "completar.comparacao.ridge_alphas_log10",
    "completar.comparacao.lightgbm",
    "completar.avaliacao.simulacao_treino_h",
    "completar.avaliacao.deixar_um_de_fora_corte",
    "completar.degradacao_max",
    "completar.degradacao_antes",
    "completar.degradacao_depois",
    "completar.subida_min",
    "prever.horizontes_h",
    "prever.horizontes_avaliacao_h",
    "prever.referencia",
    "prever.teste_inicio",
    "prever.intervalo.nivel",
    "prever.intervalo.calibracao_h",
    "prever.segmento_min_veiculos_hora",
    "prever.meteo_variaveis",
    "prever.meteo_melhoria_min",
    "prever.antecipacao_atraso_max_h",
    "prever.lightgbm.seed",
    "proteger.raio_segmentos_m",
    "proteger.intervalo_min",
    "proteger.min_veiculos_intervalo",
    "proteger.por_travessias",
    "proteger.nivel_ic",
    "proteger.lags_newey_west",
    "proteger.quantil_movimentado",
    "proteger.quantil_calmo",
    "proteger.quantil_assinalar",
    "proteger.usar_meteo",
    "luminosidade.latitude",
    "luminosidade.longitude",
    "luminosidade.crepusculo_graus",
    "luminosidade.minuto_da_hora",
    "risco_potencial.pesos",
    "risco_potencial.sensibilidade",
    "avenida.faixa_estacionamento_m",
    "avenida.passeio_m",
    "avenida.largura_faixa_min_m",
    "avenida.largura_faixa_max_m",
    "avenida.raio_corredor_m",
    "avenida.raio_juncao_m",
    "avenida.folga_passadeira_m",
    "avenida.folga_estacionamento_m",
    "avenida.desvio_lugar_max_m",
    "avenida.passo_m",
    "avenida.rsu_estacionamento",
    "avenida.passadeiras_fora",
    "avenida.cadeias",
    "avenida.juncoes",
    "fontes_externas.meteo",
    "fontes_externas.osm",
    "fontes_externas.anepc.commit",
    "fontes_externas.anepc.url",
    "fontes_externas.anepc.ficheiros",
    "validacao_anepc.natureza",
    "validacao_anepc.ambitos",
    "validacao_anepc.ambito_leitura",
    "validacao_anepc.bootstrap.n",
    "validacao_anepc.bootstrap.semente",
    "validacao_anepc.bootstrap.nivel",
    "validacao_anepc.coerente_spearman_min",
]


class ConfigInvalida(ValueError):
    pass


def carregar(caminho: str | Path | None = None) -> dict:
    """Lê o YAML (RIASENSE_CONFIG ou config/riasense.yaml) e verifica os campos obrigatórios."""
    caminho = Path(caminho or os.environ.get("RIASENSE_CONFIG") or CAMINHO_PADRAO)
    if not caminho.is_file():
        raise ConfigInvalida(f"{caminho}: ficheiro de configuração não encontrado")
    try:
        cfg = yaml.safe_load(caminho.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise ConfigInvalida(f"{caminho}: YAML inválido: {e}") from e
    if not isinstance(cfg, dict):
        raise ConfigInvalida(f"{caminho}: o ficheiro tem de ser um mapa YAML")
    em_falta = [campo for campo in OBRIGATORIOS if not _tem(cfg, campo)]
    if em_falta:
        raise ConfigInvalida(f"{caminho}: faltam os campos {', '.join(em_falta)}")
    erros = _validar(cfg)
    if erros:
        raise ConfigInvalida(f"{caminho}: {'; '.join(erros)}")
    return cfg


def _validar(cfg: dict) -> list[str]:
    """Campos que o código não usa como parâmetro, mas que não podem enganar quem replica."""
    erros = []
    if cfg["unidades_velocidade"] != "m/s":
        erros.append(f"unidades_velocidade: «{cfg['unidades_velocidade']}» não é suportado; só «m/s» (o código não converte)")
    try:
        ZoneInfo(str(cfg["fuso_horario"]))
    except (ZoneInfoNotFoundError, ValueError):
        erros.append(f"fuso_horario: «{cfg['fuso_horario']}» não é um nome de fuso (por exemplo, Europe/Lisbon)")
    return erros


def _tem(cfg: dict, campo: str) -> bool:
    no = cfg
    for parte in campo.split("."):
        if not isinstance(no, dict) or no.get(parte) is None:
            return False
        no = no[parte]
    return True
