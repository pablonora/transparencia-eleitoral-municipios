"""Crosswalk OFICIAL TSE <-> IBGE.

Um erro de correspondência fabrica outliers falsos, então este módulo é
deliberadamente rígido: o join SÓ acontece por código, nunca por nome, e o
build FALHA se algum município do eleitorado ficar sem par no IBGE.

Fonte: dataset oficial do TSE "Códigos oficiais de UF e municípios segundo o
TSE e o IBGE" (municipio_tse_ibge.csv), CSV ';'-delimitado, encoding Latin-1.
"""
from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass
from pathlib import Path

from . import config


@dataclass(frozen=True)
class Municipio:
    cd_tse: str       # código TSE (string, preserva zeros à esquerda)
    cd_ibge: str      # código IBGE de 7 dígitos
    sg_uf: str
    nome_tse: str
    nome_ibge: str


def _abrir_csv(zip_path: Path) -> list[dict]:
    z = zipfile.ZipFile(zip_path)
    nome = [n for n in z.namelist() if n.lower().endswith(".csv")][0]
    texto = z.read(nome).decode("latin-1")
    leitor = csv.DictReader(io.StringIO(texto), delimiter=";")
    return list(leitor)


def carregar(zip_path: Path, uf: str | None = config.UF_SIGLA) -> dict[str, Municipio]:
    """Retorna {cd_tse -> Municipio}, filtrado por UF se informado."""
    mapa: dict[str, Municipio] = {}
    for linha in _abrir_csv(zip_path):
        sg = (linha.get("SG_UF") or "").strip()
        if uf and sg != uf:
            continue
        cd_tse = (linha.get("CD_MUNICIPIO_TSE") or "").strip()
        cd_ibge = (linha.get("CD_MUNICIPIO_IBGE") or "").strip()
        if not cd_tse or not cd_ibge:
            continue
        mapa[cd_tse] = Municipio(
            cd_tse=cd_tse,
            cd_ibge=cd_ibge,
            sg_uf=sg,
            nome_tse=(linha.get("NM_MUNICIPIO_TSE") or "").strip(),
            nome_ibge=(linha.get("NM_MUNICIPIO_IBGE") or "").strip(),
        )
    if not mapa:
        raise ValueError(
            f"Crosswalk vazio para UF={uf!r}. Verifique o arquivo {zip_path}."
        )
    return mapa


def validar_cobertura(
    cods_tse_eleitorado: set[str], mapa: dict[str, Municipio]
) -> None:
    """Garante que TODO município do eleitorado tem par IBGE. Senão, levanta erro."""
    faltando = sorted(c for c in cods_tse_eleitorado if c not in mapa)
    if faltando:
        raise AssertionError(
            "Crosswalk incompleto: %d código(s) TSE do eleitorado sem "
            "correspondência IBGE: %s. O join foi abortado para não fabricar "
            "outliers falsos." % (len(faltando), faltando[:20])
        )
