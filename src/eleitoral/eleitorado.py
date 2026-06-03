"""Leitura do eleitorado do TSE (perfil_eleitorado_ATUAL).

O CSV nacional tem ~11 milhões de linhas (2,3 GB descompactado): cada linha é
uma combinação única de município × zona × gênero × faixa etária × ... com a
contagem QT_ELEITORES. O total do eleitorado de um município é a SOMA de
QT_ELEITORES de todas as suas linhas.

Para não gravar 2,3 GB em disco, lemos em STREAMING de dentro do ZIP.
Encoding Latin-1, ';'-delimitado, com aspas. A chave do município é o código
TSE (CD_MUNICIPIO).
"""
from __future__ import annotations

import csv
import io
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

from . import config


# Buckets demográficos (DS_FAIXA_ETARIA / DS_GRAU_INSTRUCAO do TSE).
_FAIXA_16_17 = {"16 anos", "17 anos"}
_FAIXA_70MAIS = {
    "70 a 74 anos", "75 a 79 anos", "80 a 84 anos", "85 a 89 anos",
    "90 a 94 anos", "95 a 99 anos", "100 anos ou mais",
}
_ESC_ATE_FUND = {
    "ANALFABETO", "LÊ E ESCREVE",
    "ENSINO FUNDAMENTAL COMPLETO", "ENSINO FUNDAMENTAL INCOMPLETO",
}


@dataclass
class EleitoradoMunicipio:
    cd_tse: str
    nome_tse: str
    uf: str = ""
    eleitores: int = 0
    # eleitores por faixa de obrigatoriedade (informativo)
    eleitores_obrigatorio: int = 0
    eleitores_facultativo: int = 0
    # perfil demográfico (contagens; viram % no indicators)
    e_16_17: int = 0          # jovens 16–17 (voto facultativo)
    e_70mais: int = 0         # 70+ (voto facultativo)
    e_feminino: int = 0
    e_superior: int = 0       # superior completo ou incompleto
    e_ate_fundamental: int = 0  # analfabeto, lê/escreve ou fundamental


@dataclass
class EleitoradoUF:
    dt_geracao: str = ""
    municipios: dict[str, EleitoradoMunicipio] = field(default_factory=dict)


def agregar_uf(zip_path: Path, uf: str | None = config.UF_SIGLA) -> EleitoradoUF:
    """Agrega o eleitorado por município. uf=None inclui o Brasil inteiro."""
    z = zipfile.ZipFile(zip_path)
    nome = [n for n in z.namelist() if n.lower().endswith(".csv")][0]

    out = EleitoradoUF()
    with z.open(nome, "r") as raw:
        texto = io.TextIOWrapper(raw, encoding="latin-1", newline="")
        leitor = csv.reader(texto, delimiter=";")
        header = next(leitor)
        col = {nome_col: i for i, nome_col in enumerate(header)}
        i_uf = col["SG_UF"]
        i_cd = col["CD_MUNICIPIO"]
        i_nm = col["NM_MUNICIPIO"]
        i_qt = col["QT_ELEITORES"]
        i_ob = col.get("TP_OBRIGATORIEDADE_VOTO")
        i_dt = col.get("DT_GERACAO")
        i_fa = col.get("DS_FAIXA_ETARIA")
        i_ge = col.get("DS_GENERO")
        i_gi = col.get("DS_GRAU_INSTRUCAO")

        for linha in leitor:
            sg = linha[i_uf]
            if uf is not None and sg != uf:
                continue
            if not out.dt_geracao and i_dt is not None:
                out.dt_geracao = linha[i_dt].strip()
            cd = linha[i_cd].strip()
            try:
                qt = int(linha[i_qt])
            except (ValueError, IndexError):
                qt = 0
            m = out.municipios.get(cd)
            if m is None:
                m = EleitoradoMunicipio(cd_tse=cd, nome_tse=linha[i_nm].strip(), uf=sg)
                out.municipios[cd] = m
            m.eleitores += qt
            if i_ob is not None:
                tp = linha[i_ob].strip().lower()
                if tp.startswith("obrigat"):
                    m.eleitores_obrigatorio += qt
                elif tp.startswith("facultat"):
                    m.eleitores_facultativo += qt
            if i_fa is not None:
                fa = linha[i_fa].strip()
                if fa in _FAIXA_16_17:
                    m.e_16_17 += qt
                elif fa in _FAIXA_70MAIS:
                    m.e_70mais += qt
            if i_ge is not None and linha[i_ge].strip().upper() == "FEMININO":
                m.e_feminino += qt
            if i_gi is not None:
                gi = linha[i_gi].strip().upper()
                if gi.startswith("SUPERIOR"):
                    m.e_superior += qt
                elif gi in _ESC_ATE_FUND:
                    m.e_ate_fundamental += qt

    if not out.municipios:
        raise ValueError(f"Nenhum eleitor encontrado para UF={uf!r} em {zip_path}.")
    return out
