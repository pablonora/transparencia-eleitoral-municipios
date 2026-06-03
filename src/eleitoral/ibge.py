"""População do IBGE via API de Agregados v3.

Duas fontes complementares:

1. Tabela 6579 — estimativa anual da população TOTAL por município. NÃO cobre
   anos censitários (ex.: 2022). Usada para a razão "headline" e para o
   crescimento populacional ano a ano.

2. Tabela 9514 (Censo 2022) — população por idade. Usada como ÂNCORA para a
   parcela em idade de votar (16+): calculamos, por município,
   pop_0_15 = (0–4) + (5–9) + (10–14) + (15 anos) e
   pop_16+ = total − pop_0_15. A proporção 16+ de 2022 é depois aplicada às
   estimativas anuais (extrapolação rotulada) — ver indicators.py.

Salvamos a resposta JSON bruta em data/raw/ibge e registramos no manifest.
Stdlib apenas.
"""
from __future__ import annotations

import gzip
import json
import urllib.request
from pathlib import Path

from . import config
from .provenance import Manifest, utc_now_iso

# A API do IBGE rejeita/degrada respostas para User-Agents com parênteses e
# URL (parece filtro de WAF); o UA padrão do urllib funciona. Por isso NÃO
# enviamos cabeçalho User-Agent customizado aqui.
_PUB = "IBGE — API de Agregados v3"


def _fetch(url: str, timeout: int = 120) -> tuple[bytes, int, str]:
    """GET que devolve o corpo JÁ em texto JSON (descomprime gzip se vier)."""
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        status = resp.status
        ctype = resp.headers.get("Content-Type", "")
        body = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip" or body[:2] == b"\x1f\x8b":
            body = gzip.decompress(body)
    return body, status, ctype


def _get_json(url: str, dest: Path, manifest: Manifest, dataset: str, ref: str):
    dest.parent.mkdir(parents=True, exist_ok=True)
    body, status, ctype = _fetch(url)
    dest.write_bytes(body)  # bruto = JSON decodificado que de fato usamos
    manifest.record(
        dataset_name=dataset, publisher=_PUB, source_url=url, local_path=dest,
        downloaded_at=utc_now_iso(), reference_period=ref,
        http_status=status, content_type=ctype,
    )
    return json.loads(body.decode("utf-8"))


def periodos_estimativa() -> list[str]:
    url = f"{config.IBGE_API}/{config.IBGE_ESTIMATIVA_AGREGADO}/periodos"
    body, _, _ = _fetch(url, timeout=60)
    data = json.loads(body.decode("utf-8"))
    return sorted(p["id"] for p in data)


def estimativas_populacao(manifest: Manifest, anos: list[str]) -> tuple[dict, list[str]]:
    """Retorna ({cd_ibge -> {ano -> pop_int}}, anos_usados)."""
    periodo = ",".join(anos)
    loc = config.ibge_localidades()
    url = (
        f"{config.IBGE_API}/{config.IBGE_ESTIMATIVA_AGREGADO}"
        f"/periodos/{periodo}/variaveis/{config.IBGE_ESTIMATIVA_VARIAVEL}"
        f"?localidades={loc}"
    )
    dest = config.RAW / "ibge" / f"estimativa_6579_{anos[0]}-{anos[-1]}_{config.escopo_slug()}.json"
    data = _get_json(url, dest, manifest, "IBGE Estimativas (tabela 6579)", f"{anos[0]}-{anos[-1]}")

    series = data[0]["resultados"][0]["series"]
    out: dict[str, dict[str, int]] = {}
    for s in series:
        cd = s["localidade"]["id"]
        out[cd] = {ano: _int(v) for ano, v in s["serie"].items() if v not in ("-", "...", "")}
    return out, anos


def censo_idade(manifest: Manifest) -> dict:
    """Retorna {cd_ibge -> {total, pop_0_15, pop_16mais, share_16mais, pop_10_15, pop_70mais}}."""
    cats = ([config.IBGE_CENSO_CAT_TOTAL] + config.IBGE_CENSO_CATS_0A15
            + config.IBGE_CENSO_CATS_70MAIS)
    classif = (
        f"{config.IBGE_CENSO_CLASSIF_IDADE}[{','.join(cats)}]"
        f"|{config.IBGE_CENSO_CLASSIF_SEXO}[{config.IBGE_CENSO_CAT_SEXO_TOTAL}]"
        f"|{config.IBGE_CENSO_CLASSIF_DECL}[{config.IBGE_CENSO_CAT_DECL_TOTAL}]"
    )
    # Com 12 faixas etárias × 5.570 municípios a consulta nacional estoura o
    # limite da API (HTTP 500). Paginamos por UF e juntamos os resultados.
    codes = config.UF_CODIGOS_IBGE if config.UF_SIGLA is None else [config.UF_CODIGO_IBGE]

    cats_0a15 = set(config.IBGE_CENSO_CATS_0A15)
    cats_10a15 = set(config.IBGE_CENSO_CATS_10A15)
    cats_70 = set(config.IBGE_CENSO_CATS_70MAIS)
    acc: dict[str, dict] = {}
    respostas = []
    for code in codes:
        url = (
            f"{config.IBGE_API}/{config.IBGE_CENSO_AGREGADO}"
            f"/periodos/{config.IBGE_CENSO_ANO}/variaveis/{config.IBGE_CENSO_VARIAVEL}"
            f"?localidades=N6[N3[{code}]]&classificacao={classif}"
        )
        body, _, _ = _fetch(url)
        data = json.loads(body.decode("utf-8"))
        respostas.append(data)
        for resultado in data[0]["resultados"]:
            cat_idade = None
            for c in resultado["classificacoes"]:
                if c["id"] == config.IBGE_CENSO_CLASSIF_IDADE:
                    cat_idade = next(iter(c["categoria"].keys()))
            if cat_idade is None:
                continue
            for s in resultado["series"]:
                cd = s["localidade"]["id"]
                val = _int(next(iter(s["serie"].values())))
                d = acc.setdefault(cd, {"total": 0, "pop_0_15": 0, "pop_10_15": 0, "pop_70mais": 0})
                if cat_idade == config.IBGE_CENSO_CAT_TOTAL:
                    d["total"] = val
                if cat_idade in cats_0a15:
                    d["pop_0_15"] += val
                if cat_idade in cats_10a15:
                    d["pop_10_15"] += val
                if cat_idade in cats_70:
                    d["pop_70mais"] += val

    # bruto combinado (uma resposta por UF) + 1 registro no manifest
    dest = config.RAW / "ibge" / f"censo2022_9514_idade_{config.escopo_slug()}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(json.dumps(respostas, ensure_ascii=False).encode("utf-8"))
    manifest.record(
        dataset_name="IBGE Censo 2022 — população por idade (tabela 9514)", publisher=_PUB,
        source_url=f"{config.IBGE_API}/{config.IBGE_CENSO_AGREGADO}/periodos/{config.IBGE_CENSO_ANO}"
                   f"/variaveis/{config.IBGE_CENSO_VARIAVEL} (por UF; classificacao={classif})",
        local_path=dest, downloaded_at=utc_now_iso(), reference_period=config.IBGE_CENSO_ANO,
        http_status=200, content_type="application/json",
    )

    out: dict[str, dict] = {}
    for cd, d in acc.items():
        total = d["total"]
        p016 = d["pop_0_15"]
        p16 = total - p016
        out[cd] = {
            "total": total,
            "pop_0_15": p016,
            "pop_16mais": p16,
            "share_16mais": (p16 / total) if total else None,
            "pop_10_15": d["pop_10_15"],
            "pop_70mais": d["pop_70mais"],
        }
    return out


def _int(v) -> int:
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return 0
