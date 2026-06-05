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


def normalizar_pct(aplicado, minimo=None) -> float | None:
    """Normaliza o % aplicado para PONTO PERCENTUAL (ex.: 14.0), lidando com a
    inconsistência da API do SICONFI:

    - alguns entes reportam em FRAÇÃO (mínimo 0,15 e aplicado 0,14 = 14%);
    - outros em PONTO PERCENTUAL (mínimo 15 e aplicado 24,11);
    - alguns lançam VALOR EM R$ por engano na coluna de % (lixo, ex.: 50 milhões).

    Calibra a unidade pelo MÍNIMO conhecido (15%/25%, que vem como 0,15 ou 15);
    sem o mínimo, cai num palpite pelo próprio aplicado (< 1,5 → fração). Aplica
    plausibilidade: descarta (None) o que sai fora de 0–100 pontos percentuais.
    """
    if not isinstance(aplicado, (int, float)):
        return None
    if isinstance(minimo, (int, float)) and minimo > 0:
        fracao = minimo < 1.5           # mínimo 0,15/0,25 → ente reporta em fração
    else:
        fracao = aplicado < 1.5         # fallback (sem o mínimo)
    pct = round(aplicado * 100 if fracao else aplicado, 2)
    if pct < 0 or pct > 100:            # fora da faixa plausível → lixo
        return None
    return pct


def parse_pisos(items: list[dict]) -> dict:
    """{saude_pct, educacao_pct} do RREO Anexo 14, já normalizados em ponto percentual.

    Lê, por função (saúde ASPS / educação MDE), o '% Aplicado' E o '% Mínimo'
    (este calibra a unidade); ignora o resto do demonstrativo. Valores implausíveis
    são descartados (ver normalizar_pct).
    """
    raw: dict[str, dict] = {}
    for i in items:
        cod = i.get("cod_conta")
        if cod not in (config.PISOS_COD_SAUDE, config.PISOS_COD_EDUCACAO):
            continue
        col = i.get("coluna")
        d = raw.setdefault(cod, {})
        if col == config.PISOS_COLUNA:
            d["ap"] = i.get("valor")
        elif col == config.PISOS_COLUNA_MIN:
            d["min"] = i.get("valor")
    out: dict = {}
    s = raw.get(config.PISOS_COD_SAUDE)
    if s and "ap" in s:
        v = normalizar_pct(s.get("ap"), s.get("min"))
        if v is not None:
            out["saude_pct"] = v
    e = raw.get(config.PISOS_COD_EDUCACAO)
    if e and "ap" in e:
        v = normalizar_pct(e.get("ap"), e.get("min"))
        if v is not None:
            out["educacao_pct"] = v
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
