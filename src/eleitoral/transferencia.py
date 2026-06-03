"""Transferências de domicílio eleitoral (TSE).

Cada linha é um fluxo origem -> destino com QT_TRANSFERENCIA. O sinal mais
informativo para um município é o volume de ENTRADAS (pessoas que passaram a
ter domicílio eleitoral ali), com o SALDO (entradas − saídas) como contexto.

Picos de transferência costumam explicar — de forma legítima — razões
eleitores/população elevadas, então este indicador acompanha os ratios em vez
de competir com eles.

Streaming do ZIP; encoding Latin-1; chave = código TSE do município.
"""
from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path

from . import config


def agregar_uf(zip_path: Path, uf: str | None = config.UF_SIGLA) -> dict[str, dict]:
    """Retorna {cd_tse -> {'entradas':int,'saidas':int,'saldo':int}}.

    uf=None agrega o Brasil inteiro (cada município contabilizado pelo seu código TSE).
    """
    z = zipfile.ZipFile(zip_path)
    nome = [n for n in z.namelist() if n.lower().endswith(".csv")][0]

    entradas: dict[str, int] = {}
    saidas: dict[str, int] = {}
    with z.open(nome, "r") as raw:
        texto = io.TextIOWrapper(raw, encoding="latin-1", newline="")
        leitor = csv.reader(texto, delimiter=";")
        header = next(leitor)
        col = {c: i for i, c in enumerate(header)}
        i_uo, i_co = col["SG_UF_ORIGEM"], col["CD_MUNICIPIO_ORIGEM"]
        i_ud, i_cd = col["SG_UF_DESTINO"], col["CD_MUNICIPIO_DESTINO"]
        i_qt = col["QT_TRANSFERENCIA"]
        for linha in leitor:
            try:
                qt = int(linha[i_qt])
            except (ValueError, IndexError):
                continue
            # códigos zero-preenchidos neste dataset ('06041'); normalizamos para
            # casar com o eleitorado ('6041').
            if uf is None or linha[i_ud] == uf:
                cd = linha[i_cd].strip().lstrip("0")
                entradas[cd] = entradas.get(cd, 0) + qt
            if uf is None or linha[i_uo] == uf:
                cd = linha[i_co].strip().lstrip("0")
                saidas[cd] = saidas.get(cd, 0) + qt

    cods = set(entradas) | set(saidas)
    return {
        cd: {
            "entradas": entradas.get(cd, 0),
            "saidas": saidas.get(cd, 0),
            "saldo": entradas.get(cd, 0) - saidas.get(cd, 0),
        }
        for cd in cods
    }
