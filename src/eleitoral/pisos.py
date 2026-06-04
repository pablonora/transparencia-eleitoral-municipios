"""Pisos constitucionais de saúde e educação (Tesouro Nacional / SICONFI — RREO).

Fonte: RREO Anexo 14 ("Demonstrativo Simplificado do RREO"), 6º bimestre
(fechamento do ano). Numa única requisição por ente, traz os PERCENTUAIS de
aplicação constitucional mínima:
  • Saúde (ASPS): % das receitas de impostos aplicado — piso municipal 15% (EC 29).
  • Educação (MDE): % das receitas de impostos aplicado — piso 25% (art. 212 CF).

Chave = código IBGE de 7 dígitos (o mesmo do resto do pipeline; NÃO é código TSE,
então NÃO se faz lstrip de zero). A API é por ente; buscamos em paralelo com
concorrência limitada + retries e persistimos o agregado (pequeno) em
data/interim para o modo --offline.

ENQUADRAMENTO: estes percentuais são calculados sobre a RECEITA DE IMPOSTOS e
transferências (não sobre a despesa total). Valores declarados pelo município;
ficar abaixo do piso pode ter justificativas e é avaliado no julgamento de contas,
não aqui. Ver config.NOTA_PISO.

Stdlib apenas (urllib, json, concurrent.futures).
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from . import config
from .provenance import Manifest, utc_now_iso

_UA = "eleitoral-transparencia/0.1 (+https://github.com; pesquisa jornalística)"


def _get(url: str, tentativas: int = 3, timeout: int = 60) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    erro = None
    for _ in range(tentativas):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001 (rede/JSON; tentamos de novo)
            erro = e
    raise RuntimeError(f"falha em {url}: {erro}")


def parse_pisos(items: list[dict]) -> dict:
    """{saude_pct, educacao_pct} do RREO Anexo 14 (coluna '% Aplicado Até o Bimestre').

    Lê só as duas linhas-chave pelo cod_conta; ignora o resto do demonstrativo.
    """
    saude = educacao = None
    for i in items:
        if i.get("coluna") != config.PISOS_COLUNA:
            continue
        cod = i.get("cod_conta")
        if cod == config.PISOS_COD_SAUDE:
            saude = i.get("valor")
        elif cod == config.PISOS_COD_EDUCACAO:
            educacao = i.get("valor")
    out: dict = {}
    if isinstance(saude, (int, float)):
        out["saude_pct"] = round(float(saude), 2)
    if isinstance(educacao, (int, float)):
        out["educacao_pct"] = round(float(educacao), 2)
    return out


def _municipio(cod: str, ano: int) -> dict | None:
    params = urllib.parse.urlencode({
        "an_exercicio": ano,
        "nr_periodo": config.SICONFI_RREO_PERIODO,
        "co_tipo_demonstrativo": "RREO",
        "no_anexo": config.SICONFI_RREO_ANEXO,
        "id_ente": cod,
    })
    try:
        items = _get(f"{config.SICONFI_RREO_URL}?{params}").get("items", [])
    except Exception:
        return None
    p = parse_pisos(items)
    if not p:
        return None
    p["saude_min"] = config.PISO_SAUDE_MIN
    p["educacao_min"] = config.PISO_EDUCACAO_MIN
    return p


def agregar(manifest: Manifest, cods: list[str], *, offline: bool = False,
            ano: int = config.PISOS_ANO) -> dict[str, dict]:
    """Retorna {cod_ibge -> {saude_pct, educacao_pct, saude_min, educacao_min}}.

    online: consulta a API por ente (concorrência limitada) e grava
    data/interim/pisos_{ano}.json. offline: reaproveita esse cache.
    """
    interim = config.INTERIM / f"pisos_{ano}.json"
    if offline and interim.exists():
        cache = json.loads(interim.read_text(encoding="utf-8"))
        prov = cache.get("_proc", {})
        manifest.record(
            dataset_name=config.SICONFI_RREO_DATASET, publisher=config.SICONFI_PUBLISHER,
            source_url=config.SICONFI_RREO_URL, local_path=interim,
            downloaded_at=prov.get("lido_em", utc_now_iso()), reference_period=str(ano),
            http_status=200, content_type="application/json", notes=prov.get("notes", ""))
        print(f"[pisos] offline: {len(cache['municipios'])} municípios (cache)")
        return cache["municipios"]

    cods = list(dict.fromkeys(cods))  # únicos, ordem preservada
    print(f"[pisos] SICONFI RREO Anexo 14 {ano}: consultando {len(cods)} municípios "
          f"(1 requisição/ente, {config.PISOS_WORKERS} conexões)…")
    municipios: dict[str, dict] = {}
    feito = 0
    with ThreadPoolExecutor(max_workers=config.PISOS_WORKERS) as ex:
        for cod, d in zip(cods, ex.map(lambda c: _municipio(c, ano), cods)):
            feito += 1
            if d:
                municipios[cod] = d
            if feito % 500 == 0:
                print(f"[pisos]   {feito}/{len(cods)} (com dados: {len(municipios)})")

    notes = (f"RREO Anexo 14 (Demonstrativo Simplificado), 6º bimestre, exercício "
             f"{ano}; % aplicado em ASPS (saúde) e MDE (educação); API por ente; "
             f"{len(municipios)}/{len(cods)} com dados.")
    proc = {"lido_em": utc_now_iso(), "url": config.SICONFI_RREO_URL, "ano": ano,
            "n_consultados": len(cods), "n_com_dados": len(municipios), "notes": notes}
    interim.parent.mkdir(parents=True, exist_ok=True)
    interim.write_text(json.dumps({"_proc": proc, "municipios": municipios},
                                  ensure_ascii=False, indent=2), encoding="utf-8")
    manifest.record(
        dataset_name=config.SICONFI_RREO_DATASET, publisher=config.SICONFI_PUBLISHER,
        source_url=config.SICONFI_RREO_URL, local_path=interim,
        downloaded_at=proc["lido_em"], reference_period=str(ano),
        http_status=200, content_type="application/json", notes=notes)
    print(f"[pisos] {len(municipios)}/{len(cods)} municípios com pisos constitucionais")
    return municipios
