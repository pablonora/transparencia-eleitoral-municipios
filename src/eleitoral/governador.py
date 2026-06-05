"""Governador eleito por UF (TSE, eleição de 2022) e seu partido.

A votação por candidato de 2022 é um ZIP grande (~630 MB), com CSVs por-UF. Como
só precisamos do cargo Governador (27 unidades), lemos por HTTP Range apenas os
membros por-UF (reusando a infra do módulo `contas`), filtramos o cargo e
agregamos o vencedor do turno decisivo. Resultado (27 entradas) é cacheado em
data/interim — e, sendo 2022 uma eleição passada, NÃO muda mais.

Mostramos apenas o PARTIDO do eleito (factual). Não classificamos ideologia.
"""
from __future__ import annotations

import json
import re

from . import config
from .contas import _central_dir, _head, _ler_membro
from .provenance import Manifest, utc_now_iso

CARGO = "governador"
_RE_UF = re.compile(r"votacao_candidato_munzona_(\d{4})_([A-Z]{2})\.csv$")


def agregar(manifest: Manifest, *, offline: bool = False, ano: int = 2022) -> dict[str, dict]:
    """Retorna {SG_UF -> {governador, partido, turno}} (só o partido, sem ideologia)."""
    interim = config.INTERIM / f"governadores_{ano}.json"
    url = config.tse_votos_url(ano)
    if offline and interim.exists():
        cache = json.loads(interim.read_text(encoding="utf-8"))
        manifest.record(
            dataset_name=f"Votação por município e zona — governador {ano}",
            publisher="TSE — Portal de Dados Abertos", source_url=url,
            local_path=interim, downloaded_at=cache["_proc"].get("lido_em", utc_now_iso()),
            reference_period=str(ano), http_status=206, content_type="application/zip; range",
            notes=cache["_proc"].get("notes", ""))
        print(f"[governador] offline: {len(cache['ufs'])} UFs (cache)")
        return cache["ufs"]

    info = _head(url)
    print(f"[governador] votação {ano} ({info['size']/1e6:.0f} MB) — lendo membros por-UF por range")
    central = _central_dir(url, info["size"])
    membros = sorted(n for n in central if _RE_UF.search(n) and "brasil" not in n.lower())

    acc: dict[tuple, dict] = {}     # (uf, turno) -> {sq: {votos, nome, partido}}
    baixado = 0
    for nome in membros:
        off, comp, _crc = central[nome]
        reader, _sha = _ler_membro(url, off, comp)
        c = {n: i for i, n in enumerate(next(reader))}
        i_uf, i_turno, i_cargo, i_sq = c["SG_UF"], c["NR_TURNO"], c["DS_CARGO"], c["SQ_CANDIDATO"]
        i_nm = c.get("NM_URNA_CANDIDATO", c.get("NM_CANDIDATO"))
        i_part, i_qt = c.get("SG_PARTIDO"), c["QT_VOTOS_NOMINAIS"]
        for linha in reader:
            if linha[i_cargo].strip().lower() != CARGO:
                continue
            try:
                qt = int(linha[i_qt])
            except (ValueError, IndexError):
                qt = 0
            uf = linha[i_uf].strip()
            cand = acc.setdefault((uf, linha[i_turno].strip()), {}).setdefault(
                linha[i_sq], {"votos": 0, "nome": linha[i_nm].strip(),
                              "partido": (linha[i_part].strip() if i_part is not None else "")})
            cand["votos"] += qt
        baixado += comp
        print(f"[governador]   {nome.split('_')[-1]}: ok")

    por_uf: dict[str, dict] = {}
    for (uf, turno), cands in acc.items():
        por_uf.setdefault(uf, {})[turno] = cands
    out: dict[str, dict] = {}
    for uf, turnos in por_uf.items():
        turno = "2" if "2" in turnos else "1"
        ranked = sorted(turnos[turno].values(), key=lambda x: -x["votos"])
        if not ranked:
            continue
        v = ranked[0]
        out[uf] = {"governador": v["nome"], "partido": v["partido"], "turno": turno}

    notes = (f"Cargo Governador, eleição {ano}, lido por HTTP Range (membros por-UF; "
             f"_BRASIL excluído); {len(out)} UFs; bytes_trafegados={baixado}")
    proc = {"lido_em": utc_now_iso(), "url": url, "ano": ano, "notes": notes}
    interim.parent.mkdir(parents=True, exist_ok=True)
    interim.write_text(json.dumps({"_proc": proc, "ufs": out}, ensure_ascii=False, indent=2),
                       encoding="utf-8")
    manifest.record(
        dataset_name=f"Votação por município e zona — governador {ano}",
        publisher="TSE — Portal de Dados Abertos", source_url=url,
        local_path=interim, downloaded_at=proc["lido_em"], reference_period=str(ano),
        http_status=206, content_type="application/zip; range", notes=notes)
    print(f"[governador] {len(out)} UFs | {baixado/1e6:.0f} MB trafegados")
    return out
