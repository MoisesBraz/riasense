#!/usr/bin/env bash
# Descarrega o mapa offline da demo (ADR-0014): extrato PMTiles da Protomaps para o município de Aveiro e glifos.
#
# Precisa de rede UMA vez. O resultado fica versionado em web/public/ e a demo nunca corre este script.
# Não instala nada no sistema: o CLI oficial `pmtiles` (protomaps/go-pmtiles) vai para uma pasta temporária.
#
# Uso (a partir da raiz do repositório):
#   web/scripts/descarregar-mapa.sh
#   BUILD=20261116 MAXZOOM=14 PASTA_TEMP=/tmp/mapa web/scripts/descarregar-mapa.sh
#
# Limite: o .pmtiles fica com cerca de 25 MB no máximo. Se passar, reduz-se a BBOX ou o MAXZOOM;
# acima do MAXZOOM o MapLibre amplia os vetores (overzoom).
set -euo pipefail

PMTILES_VERSAO="${PMTILES_VERSAO:-1.31.2}"
# Build diário da Protomaps (esquema v4). Lista dos disponíveis: https://build-metadata.protomaps.dev/builds.json
BUILD="${BUILD:-20261116}"
# Município de Aveiro, de São Jacinto a Requeixo e de Esgueira a Nariz (oeste, sul, leste, norte).
BBOX="${BBOX:--8.77,40.54,-8.52,40.73}"
MAXZOOM="${MAXZOOM:-15}"
# Commit fixo de protomaps/basemaps-assets, para os glifos serem sempre os mesmos.
ASSETS_COMMIT="${ASSETS_COMMIT:-028c18f713baecad011301ff7a69acc39bcc2ae7}"
# Só os intervalos de glifos que os nomes de Aveiro usam: latim básico e latim-1 (á, ã, ç, õ…),
# latim estendido A e pontuação geral (travessões, aspas curvas).
FONTES=("Noto Sans Regular" "Noto Sans Medium" "Noto Sans Italic")
INTERVALOS=("0-255" "256-511" "8192-8447")
LIMITE_MB=25

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
PUBLICO="$RAIZ/web/public"
PASTA_TEMP="${PASTA_TEMP:-$(mktemp -d)}"
mkdir -p "$PASTA_TEMP"

cli_pmtiles() {
  local so arq ficheiro url
  so="$(uname -s)"
  arq="$(uname -m)"
  [ "$arq" = "aarch64" ] && arq="arm64"
  case "$so" in
    Darwin) ficheiro="go-pmtiles-${PMTILES_VERSAO}_Darwin_${arq}.zip" ;;
    Linux) ficheiro="go-pmtiles_${PMTILES_VERSAO}_Linux_${arq}.tar.gz" ;;
    *) echo "Sistema não suportado: $so" >&2; exit 1 ;;
  esac
  url="https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSAO}/${ficheiro}"
  mkdir -p "$PASTA_TEMP/cli"
  if [ ! -x "$PASTA_TEMP/cli/pmtiles" ]; then
    curl -fsSL -o "$PASTA_TEMP/$ficheiro" "$url"
    case "$ficheiro" in
      *.zip) unzip -q -o "$PASTA_TEMP/$ficheiro" -d "$PASTA_TEMP/cli" ;;
      *) tar -xzf "$PASTA_TEMP/$ficheiro" -C "$PASTA_TEMP/cli" ;;
    esac
  fi
  echo "$PASTA_TEMP/cli/pmtiles"
}

extrair_tiles() {
  local pmtiles="$1" destino="$PUBLICO/tiles/aveiro.pmtiles" mb
  mkdir -p "$PUBLICO/tiles"
  "$pmtiles" extract "https://build.protomaps.com/${BUILD}.pmtiles" "$destino" \
    --bbox="$BBOX" --maxzoom="$MAXZOOM"
  mb=$(( $(wc -c < "$destino") / 1024 / 1024 ))
  echo "aveiro.pmtiles: ${mb} MB (build ${BUILD}, maxzoom ${MAXZOOM}, bbox ${BBOX})"
  if [ "$mb" -gt "$LIMITE_MB" ]; then
    echo "Passa dos ${LIMITE_MB} MB: reduz a BBOX ou o MAXZOOM (ADR-0014)." >&2
    exit 1
  fi
}

descarregar_glifos() {
  local fonte intervalo pasta url
  for fonte in "${FONTES[@]}"; do
    pasta="$PUBLICO/fonts/$fonte"
    mkdir -p "$pasta"
    for intervalo in "${INTERVALOS[@]}"; do
      url="https://raw.githubusercontent.com/protomaps/basemaps-assets/${ASSETS_COMMIT}/fonts/${fonte// /%20}/${intervalo}.pbf"
      curl -fsSL -o "$pasta/${intervalo}.pbf" "$url"
    done
  done
  curl -fsSL -o "$PUBLICO/fonts/OFL.txt" \
    "https://raw.githubusercontent.com/protomaps/basemaps-assets/${ASSETS_COMMIT}/fonts/OFL.txt"
  echo "Glifos: ${#FONTES[@]} fontes × ${#INTERVALOS[@]} intervalos em web/public/fonts/"
}

extrair_tiles "$(cli_pmtiles)"
descarregar_glifos
