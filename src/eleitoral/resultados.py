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
