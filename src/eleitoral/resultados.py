"""Resultado da eleição para PREFEITO por município (TSE).

Extrai, por município, o vencedor e a MARGEM de vitória (1º − 2º colocado) no
turno que decidiu a eleição (2º turno onde houve; senão 1º). Serve para um
cruzamento FACTUAL com a entrada líquida de eleitores — nunca causal: o voto é
secreto, não se sabe em quem os eleitores transferidos votaram.

Fonte: "Votação nominal por município e zona" (votacao_candidato_munzona_{ano}).
CSVs por UF; encoding Latin-1. Códigos com zero à esquerda são normalizados.
"""
from __future__ import annotations

import csv
import io
import zipfile
from pathlib import Path

from . import config

CARGO_PREFEITO = "prefeito"


def agregar_prefeito(zip_path: Path, uf: str | None = config.UF_SIGLA) -> dict[str, dict]:
    """Retorna {cd_tse -> {vencedor, votos_venc, votos_2o, margem, total, turno, n_cand}}."""
    z = zipfile.ZipFile(zip_path)
    # ignora o arquivo BRASIL (concatenação) para não duplicar
    csvs = [n for n in z.namelist() if n.lower().endswith(".csv") and "brasil" not in n.lower()]

    # acumula votos por (município, turno, candidato)
    acc: dict[tuple, dict] = {}
    for nome in csvs:
        with z.open(nome, "r") as raw:
            texto = io.TextIOWrapper(raw, encoding="latin-1", newline="")
            leitor = csv.reader(texto, delimiter=";")
            header = next(leitor)
            c = {n: i for i, n in enumerate(header)}
            i_turno, i_uf, i_cd = c["NR_TURNO"], c["SG_UF"], c["CD_MUNICIPIO"]
            i_cargo, i_sq = c["DS_CARGO"], c["SQ_CANDIDATO"]
            i_nm = c.get("NM_URNA_CANDIDATO", c.get("NM_CANDIDATO"))
            i_qt = c["QT_VOTOS_NOMINAIS"]
            for linha in leitor:
                if linha[i_cargo].strip().lower() != CARGO_PREFEITO:
                    continue
                if uf is not None and linha[i_uf] != uf:
                    continue
                try:
                    qt = int(linha[i_qt])
                except (ValueError, IndexError):
                    qt = 0
                cd = linha[i_cd].strip().lstrip("0")
                key = (cd, linha[i_turno].strip())
                cands = acc.setdefault(key, {})
                cand = cands.setdefault(linha[i_sq], {"votos": 0, "nome": linha[i_nm].strip()})
                cand["votos"] += qt

    # escolhe o turno decisivo e calcula a margem
    por_cd: dict[str, dict] = {}
    for (cd, turno), cands in acc.items():
        por_cd.setdefault(cd, {})[turno] = cands

    out: dict[str, dict] = {}
    for cd, turnos in por_cd.items():
        turno = "2" if "2" in turnos else "1"
        ranked = sorted(turnos[turno].values(), key=lambda x: -x["votos"])
        if not ranked:
            continue
        venc = ranked[0]
        segundo = ranked[1] if len(ranked) > 1 else {"votos": 0}
        out[cd] = {
            "vencedor": venc["nome"],
            "votos_venc": venc["votos"],
            "votos_2o": segundo["votos"],
            "margem": venc["votos"] - segundo["votos"],
            "total": sum(x["votos"] for x in ranked),
            "turno": turno,
            "n_cand": len(ranked),
        }
    return out


def agregar_brancos_nulos(zip_path: Path, uf: str | None = config.UF_SIGLA,
                          turno: str = "1") -> dict[str, dict]:
    """Votos válidos, brancos e nulos do PREFEITO por município (1º turno).

    Fonte: "Detalhe da votação por município e zona". Branco/nulo não são
    candidatos, então não estão na votação nominal — vêm daqui. Soma as zonas
    (e, se houver, voto em trânsito) de cada município. Ignora o arquivo BRASIL.
    Retorna {cd_tse(sem zero) -> {comparecimento, validos, brancos, nulos}}.
    """
    z = zipfile.ZipFile(zip_path)
    csvs = [n for n in z.namelist() if n.lower().endswith(".csv") and "brasil" not in n.lower()]
    acc: dict[str, dict] = {}
    for nome in csvs:
        with z.open(nome, "r") as raw:
            leitor = csv.reader(io.TextIOWrapper(raw, encoding="latin-1", newline=""), delimiter=";")
            c = {n: i for i, n in enumerate(next(leitor))}
            i_turno, i_cd = c["NR_TURNO"], c["CD_MUNICIPIO"]
            i_uf = c.get("SG_UF")  # opcional (só usado ao filtrar por UF)
            i_cargo = c["DS_CARGO"]
            i_comp, i_val = c["QT_COMPARECIMENTO"], c["QT_TOTAL_VOTOS_VALIDOS"]
            i_br, i_nul = c["QT_VOTOS_BRANCOS"], c["QT_TOTAL_VOTOS_NULOS"]
            for linha in leitor:
                if linha[i_cargo].strip().lower() != CARGO_PREFEITO:
                    continue
                if linha[i_turno].strip() != turno:
                    continue
                if uf is not None and i_uf is not None and linha[i_uf] != uf:
                    continue
                cd = linha[i_cd].strip().lstrip("0")
                d = acc.setdefault(cd, {"comparecimento": 0, "validos": 0, "brancos": 0, "nulos": 0})
                def _i(j):
                    try:
                        return int(linha[j])
                    except (ValueError, IndexError):
                        return 0
                d["comparecimento"] += _i(i_comp)
                d["validos"] += _i(i_val)
                d["brancos"] += _i(i_br)
                d["nulos"] += _i(i_nul)
    return acc
