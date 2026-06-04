"""Orçamento público municipal (Tesouro Nacional / SICONFI) — receita e despesa
por função (saúde, educação, segurança…).

Fonte: Declaração de Contas Anuais (DCA), API REST do SICONFI.
- Anexo I-E = Despesa por Função (despesas EMPENHADAS).
- Anexo I-C = Receita (Receitas Brutas Realizadas e deduções).
Chave = código IBGE de 7 dígitos (o mesmo do município no resto do pipeline; NÃO
é código TSE, então aqui NÃO se faz lstrip de zero).

A API é por ente, um anexo por requisição (não há bulk estável). Buscamos em
paralelo com concorrência limitada (educado) + retries, e persistimos o resultado
agregado (pequeno) em data/interim para o modo --offline.

ENQUADRAMENTO: dinheiro PÚBLICO da prefeitura — distinto de gasto de campanha
(TSE). Valores declarados, cobertura depende do envio de cada município, e
segurança pública é majoritariamente função estadual (muitos municípios gastam
pouco/nada). Ver config.NOTA_ORCAMENTO.

Stdlib apenas (urllib, json, concurrent.futures).
"""
from __future__ import annotations

import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import config
from .provenance import Manifest, utc_now_iso

_UA = "eleitoral-transparencia/0.1 (+https://github.com; pesquisa jornalística)"
_RE_FUNCAO = re.compile(r"^(\d{2}) - ")


def _get(url: str, tentativas: int = 3, timeout: int = 60) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    erro = None
    for n in range(tentativas):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001 (rede/JSON; tentamos de novo)
            erro = e
    raise RuntimeError(f"falha em {url}: {erro}")


def parse_despesa_funcao(items: list[dict]) -> tuple[float | None, dict[str, float]]:
    """(despesa_total, {cod_funcao: valor}) do Anexo I-E (Despesas Empenhadas).

    Total = "Despesas Exceto Intraorçamentárias" (soma das funções, sem o
    intraorçamentário que duplicaria). Funções = linhas "NN - Nome" (2 dígitos);
    subfunções "NN.SSS - ..." são ignoradas.
    """
    total = None
    funcs: dict[str, float] = {}
    for i in items:
        if i.get("coluna") != "Despesas Empenhadas":
            continue
        conta = (i.get("conta") or "").strip()
        if i.get("cod_conta") != "TotalDespesas":
            continue
        if "Exceto" in conta:
            total = i.get("valor")
            continue
        m = _RE_FUNCAO.match(conta)
        if m and i.get("valor") is not None:
            funcs[m.group(1)] = i.get("valor")
    return total, funcs


def parse_receita(items: list[dict]) -> tuple[float | None, float | None]:
    """(receita_bruta, receita_liquida) do Anexo I-C (linha TOTAL DAS RECEITAS)."""
    bruta = ded_fundeb = ded_outras = None
    for i in items:
        conta = (i.get("conta") or "").upper()
        if i.get("cod_conta") == "TotalReceitas" or "TOTAL DAS RECEITAS" in conta:
            col = i.get("coluna")
            if col == "Receitas Brutas Realizadas":
                bruta = i.get("valor")
            elif col == "Deduções - FUNDEB":
                ded_fundeb = i.get("valor")
            elif col == "Outras Deduções da Receita":
                ded_outras = i.get("valor")
    liquida = None
    if bruta is not None:
        liquida = bruta - (ded_fundeb or 0) - (ded_outras or 0)
    return bruta, liquida


def _r(v):
    return round(v, 2) if isinstance(v, (int, float)) else None


def _municipio(cod: str, ano: int) -> dict | None:
    base = config.SICONFI_DCA_URL
    try:
        ie = _get(f"{base}?an_exercicio={ano}&no_anexo=DCA-Anexo+I-E&id_ente={cod}")["items"]
        ic = _get(f"{base}?an_exercicio={ano}&no_anexo=DCA-Anexo+I-C&id_ente={cod}")["items"]
    except Exception:
        return None
    total, funcs = parse_despesa_funcao(ie)
    bruta, liquida = parse_receita(ic)
    if total is None and bruta is None and not funcs:
        return None
    out = {"despesa": _r(total), "receita": _r(bruta), "receita_liquida": _r(liquida)}
    soma = 0.0
    for codf, chave in config.ORCAMENTO_FUNCOES.items():
        v = funcs.get(codf)
        if v:
            out[chave] = _r(v)
            soma += v
    if total:
        out["outras"] = _r(max(0.0, total - soma))
    return {k: v for k, v in out.items() if v is not None}


def agregar(manifest: Manifest, cods: list[str], *, offline: bool = False,
            ano: int = config.ORCAMENTO_ANO) -> dict[str, dict]:
    """Retorna {cod_ibge -> {receita, despesa, saude, educacao, ...}}.

    online: consulta a API por ente (concorrência limitada) e grava
    data/interim/orcamento_{ano}.json. offline: reaproveita esse cache.
    """
    interim = config.INTERIM / f"orcamento_{ano}.json"
    if offline and interim.exists():
        cache = json.loads(interim.read_text(encoding="utf-8"))
        prov = cache.get("_proc", {})
        manifest.record(
            dataset_name=config.SICONFI_DATASET, publisher=config.SICONFI_PUBLISHER,
            source_url=config.SICONFI_DCA_URL, local_path=interim,
            downloaded_at=prov.get("lido_em", utc_now_iso()), reference_period=str(ano),
            http_status=200, content_type="application/json", notes=prov.get("notes", ""))
        print(f"[orcamento] offline: {len(cache['municipios'])} municípios (cache)")
        return cache["municipios"]

    cods = list(dict.fromkeys(cods))  # únicos, ordem preservada
    print(f"[orcamento] SICONFI DCA {ano}: consultando {len(cods)} municípios "
          f"(2 anexos, {config.ORCAMENTO_WORKERS} conexões)…")
    municipios: dict[str, dict] = {}
    feito = 0
    with ThreadPoolExecutor(max_workers=config.ORCAMENTO_WORKERS) as ex:
        for cod, d in zip(cods, ex.map(lambda c: _municipio(c, ano), cods)):
            feito += 1
            if d:
                municipios[cod] = d
            if feito % 500 == 0:
                print(f"[orcamento]   {feito}/{len(cods)} (com dados: {len(municipios)})")

    notes = (f"DCA Anexo I-E (despesa por função) + I-C (receita), exercício {ano}; "
             f"API por ente; {len(municipios)}/{len(cods)} com dados.")
    proc = {"lido_em": utc_now_iso(), "url": config.SICONFI_DCA_URL, "ano": ano,
            "n_consultados": len(cods), "n_com_dados": len(municipios), "notes": notes}
    interim.parent.mkdir(parents=True, exist_ok=True)
    interim.write_text(json.dumps({"_proc": proc, "municipios": municipios},
                                  ensure_ascii=False, indent=2), encoding="utf-8")
    manifest.record(
        dataset_name=config.SICONFI_DATASET, publisher=config.SICONFI_PUBLISHER,
        source_url=config.SICONFI_DCA_URL, local_path=interim,
        downloaded_at=proc["lido_em"], reference_period=str(ano),
        http_status=200, content_type="application/json", notes=notes)
    print(f"[orcamento] {len(municipios)}/{len(cods)} municípios com dados de orçamento")
    return municipios
