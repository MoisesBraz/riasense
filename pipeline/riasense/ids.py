"""Identificadores NGSI-LD: os dados usam o URN completo (ADR-0008) e o config/riasense.yaml usa a forma curta."""

PREFIXO = "urn:ngsi-ld:"


def urn(identificador: str) -> str:
    """Aceita `SmartCrosswalk:0019` ou `urn:ngsi-ld:SmartCrosswalk:0019` e devolve sempre o URN completo."""
    identificador = identificador.strip()
    if not identificador or identificador.count(":") < 1:
        raise ValueError(f"identificador inválido: {identificador!r} (esperado Tipo:NNNN ou {PREFIXO}Tipo:NNNN)")
    return identificador if identificador.startswith(PREFIXO) else PREFIXO + identificador
