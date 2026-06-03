"""Comparecimento e abstenção por município (TSE), por eleição.

Cada ZIP traz um CSV por UF. Agregamos por município (código TSE), somando os
aptos, o comparecimento e a abstenção do turno escolhido (1º por padrão, que
cobre todos os municípios). Também separamos comparecimento/abstenção
facultativos e obrigatórios.

Cruzar abstenção com a razão eleitores/população é um sinal mais forte: título
registrado num município onde a pessoa não mora tende a virar abstenção.

Streaming do ZIP; encoding Latin-1; chave = código TSE do município.
"""
from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path

from . import config


def agregar(zip_path: Path, turno: str = config.TSE_COMPARECIMENTO_TURNO,
            uf: str | None = config.UF_SIGLA) -> dict[str, dict]:
    """Retorna {cd_tse -> {aptos, comparecimento, abstencao, fac/obr...}}."""
    z = zipfile.ZipFile(zip_path)
    # o zip traz 27 arquivos por UF + 1 agregado BRASIL; somar o BRASIL junto
    # conta cada município DUAS vezes (inflava aptos/comparecimento/abstenção ~2×).
    csvs = [n for n in z.namelist() if n.lower().endswith(".csv") and "brasil" not in n.lower()]

    out: dict[str, dict] = {}
    for nome in csvs:
        with z.open(nome, "r") as raw:
            texto = io.TextIOWrapper(raw, encoding="latin-1", newline="")
            leitor = csv.reader(texto, delimiter=";")
            header = next(leitor)
            col = {c: i for i, c in enumerate(header)}
            i_turno = col["NR_TURNO"]
            i_uf = col["SG_UF"]
            i_cd = col["CD_MUNICIPIO"]
            i_apt = col["QT_APTOS"]
            i_comp = col["QT_COMPARECIMENTO"]
            i_abst = col["QT_ABSTENCAO"]
            i_cf = col.get("QT_COMPAREC_FACULTATIVO")
            i_af = col.get("QT_ABST_FACULTATIVO")
            i_co = col.get("QT_COMPAREC_OBRIGATORIO")
            i_ao = col.get("QT_ABST_OBRIGATORIO")

            def _int(linha, idx):
                if idx is None:
                    return 0
                try:
                    return int(linha[idx])
                except (ValueError, IndexError):
                    return 0

            for linha in leitor:
                if linha[i_turno] != turno:
                    continue
                if uf is not None and linha[i_uf] != uf:
                    continue
                # este dataset zero-preenche o código (ex.: '06041'); o eleitorado
                # usa sem zero à esquerda ('6041'). Normalizamos para casar o join.
                cd = linha[i_cd].strip().lstrip("0")
                d = out.get(cd)
                if d is None:
                    d = out[cd] = {"aptos": 0, "comparecimento": 0, "abstencao": 0,
                                   "comp_fac": 0, "abst_fac": 0, "comp_obr": 0, "abst_obr": 0}
                d["aptos"] += _int(linha, i_apt)
                d["comparecimento"] += _int(linha, i_comp)
                d["abstencao"] += _int(linha, i_abst)
                d["comp_fac"] += _int(linha, i_cf)
                d["abst_fac"] += _int(linha, i_af)
                d["comp_obr"] += _int(linha, i_co)
                d["abst_obr"] += _int(linha, i_ao)

    return out
