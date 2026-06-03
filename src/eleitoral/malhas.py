"""Malhas geográficas oficiais do IBGE (GeoJSON) para o mapa.

Baixa, da API de Malhas v4/v3 do IBGE:
  - a malha das 27 UFs (leve, ~250 KB) -> docs/data/malha/uf.json
  - a malha municipal de cada UF (~100–300 KB) -> docs/data/malha/mun_<cod>.json
    (carregada sob demanda pelo front quando o usuário clica num estado).

A geometria é dado de REFERÊNCIA (muda raríssimo), então pulamos o download se
o arquivo já existe — evita martelar o IBGE a cada execução do pipeline.
O `codarea` de cada feição é o código IBGE (UF de 2 dígitos ou município de 7),
que casa direto com os nossos dados. Stdlib apenas.
"""
from __future__ import annotations

import gzip
import urllib.request
from pathlib import Path

from . import config
from .provenance import Manifest, utc_now_iso

_PUB = "IBGE — API de Malhas"
_DEST = config.ROOT / "docs" / "data" / "malha"
_FMT = "application/vnd.geo+json"


def _baixar(url: str, dest: Path) -> tuple[int, str, bool]:
    """Baixa url->dest se ainda não existe. Retorna (status, ctype, baixou?)."""
    if dest.exists():
        return 200, _FMT, False
    dest.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(url), timeout=120) as resp:
        status, ctype = resp.status, resp.headers.get("Content-Type", "")
        body = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip" or body[:2] == b"\x1f\x8b":
            body = gzip.decompress(body)
    dest.write_bytes(body)
    return status, ctype, True


def baixar_malhas(manifest: Manifest, uf_codigos: list[str]) -> None:
    # malha das UFs
    uf_url = (
        f"https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR"
        f"?formato={_FMT}&intrarregiao=UF&qualidade=intermediaria"
    )
    dest = _DEST / "uf.json"
    status, ctype, _ = _baixar(uf_url, dest)
    manifest.record(
        dataset_name="IBGE Malha das UFs (GeoJSON)", publisher=_PUB,
        source_url=uf_url, local_path=dest, downloaded_at=utc_now_iso(),
        reference_period="2022", http_status=status, content_type=ctype,
        notes="malha intermediária das 27 UFs; codarea = código IBGE da UF",
    )

    # malha municipal por UF (qualidade mínima p/ peso leve)
    for cod in uf_codigos:
        url = (
            f"https://servicodados.ibge.gov.br/api/v3/malhas/estados/{cod}"
            f"?formato={_FMT}&intrarregiao=municipio&qualidade=minima"
        )
        dest = _DEST / f"mun_{cod}.json"
        status, ctype, _ = _baixar(url, dest)
        manifest.record(
            dataset_name=f"IBGE Malha municipal — UF {cod} (GeoJSON)", publisher=_PUB,
            source_url=url, local_path=dest, downloaded_at=utc_now_iso(),
            reference_period="2022", http_status=status, content_type=ctype,
            notes="malha municipal (qualidade mínima); codarea = código IBGE do município",
        )
