"""Emendas parlamentares (transferências especiais) por município.

Fonte: TransfereGov — recurso `plano_acao_especial` (API REST pública PostgREST,
sem chave). Modalidade TRANSFERÊNCIA ESPECIAL (RP6, EC 105/2019): emendas
individuais que caem direto na conta do município. NÃO cobre emendas executadas
por convênio/fundo-a-fundo, nem bancada/comissão/relator (ver config.NOTA_EMENDAS).

Chave de saída = código IBGE de 7 dígitos (igual ao resto do pipeline). A API
identifica o beneficiário por NOME+UF (e CNPJ); resolvemos o IBGE por igualdade
normalizada contra o nome oficial do IBGE (crosswalk), com a tabela curada
config.EMENDAS_APELIDOS para os divergentes. Beneficiário-município que não casa
é LOGADO e descartado — nunca chutado (um match errado fabricaria dado falso).

Cada município recebe também o CNPJ do beneficiário: é a chave EXATA com que o
front consulta a mesma API AO VIVO (botão "tempo real"), sem depender deste
snapshot. Assim o estático sempre aparece e o ao vivo é um bônus por cima.

Stdlib apenas (urllib, json, re, unicodedata).
"""
from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from pathlib import Path

from . import config, crosswalk
from .crosswalk import Municipio
from .provenance import Manifest, utc_now_iso

# A TransfereGov fica atrás do Cloudflare, que rejeita (403) User-Agents não
# convencionais com URL no meio. Usamos um UA de navegador padrão — é o que o
# Cloudflare aceita; o mesmo que o front (botão "tempo real") enviará.
_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
# prefixo "MUNICIPIO DE/DO/DA…" e sufixo " PREFEITURA [MUNICIPAL]" do nome do ente
_PREF = re.compile(r"^(MUNICIPIO|PREFEITURA(\sMUNICIPAL)?)(\sDE|\sDO|\sDA|\sDOS|\sDAS)?\s")
_SUF = re.compile(r"\sPREFEITURA(\sMUNICIPAL)?$")
_AREA = re.compile(r"(\d{2})\s*-\s*([^/,]+)")   # "10-Saúde / 302-... , 15-Urbanismo"


def normalizar(s: str) -> str:
    """Maiúsculas, sem acento, sem pontuação — base do casamento de nomes."""
    s = (s or "").upper().strip()
    s = "".join(c for c in unicodedata.normalize("NFD", s)
                if unicodedata.category(c) != "Mn")
    s = s.replace("'", " ").replace(":", " ").replace("-", " ")
    s = re.sub(r"[^A-Z0-9 ]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def indice_ibge(mapa: dict[str, Municipio]) -> dict[tuple[str, str], str]:
    """{(UF, nome_normalizado): cd_ibge} a partir do crosswalk + apelidos curados."""
    idx: dict[tuple[str, str], str] = {}
    for m in mapa.values():
        idx[(m.sg_uf, normalizar(m.nome_ibge))] = m.cd_ibge
    idx.update(config.EMENDAS_APELIDOS)   # apelidos vencem/empatam (já verificados)
    return idx


def resolver_ibge(nome: str, uf: str, idx: dict[tuple[str, str], str]) -> str | None:
    """Nome bruto do beneficiário + UF → código IBGE, ou None se não for município
    OU não casar (descarte seguro)."""
    nn = normalizar(nome)
    if not nn.startswith(("MUNICIPIO", "PREFEITURA")):
        return None  # estado, fundo, consórcio, OSC… — fora da agregação municipal
    base = _SUF.sub("", _PREF.sub("", nn)).strip()
    return idx.get((uf, base))


def _area_principal(desc: str) -> tuple[str, str]:
    """1ª função listada em codigo_descricao_areas… → (chave_interna, rótulo)."""
    m = _AREA.search(desc or "")
    if not m:
        return "outras", "Outras"
    cod, rotulo = m.group(1), m.group(2).strip()
    return config.EMENDAS_AREAS.get(cod, "outras"), rotulo


def _get_json(url: str, timeout: int = 60, tentativas: int = 4) -> dict | list:
    req = urllib.request.Request(url, headers={"User-Agent": _UA,
                                               "Accept": "application/json"})
    erro = None
    for _ in range(tentativas):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001 (rede/JSON truncado: tentar de novo)
            erro = e
    raise RuntimeError(f"falha em {url}: {erro}")


def _casas_camara() -> set[str]:
    """Nomes (normalizados) de deputados federais das legislaturas configuradas."""
    nomes: set[str] = set()
    for leg in config.EMENDAS_LEGISLATURAS:
        pagina = 1
        while True:
            url = (f"{config.CAMARA_API}/deputados?idLegislatura={leg}"
                   f"&ordem=ASC&ordenarPor=nome&itens=100&pagina={pagina}")
            dados = _get_json(url).get("dados", [])
            if not dados:
                break
            nomes.update(normalizar(d.get("nome") or "") for d in dados)
            pagina += 1
    return nomes


def _casas_senado() -> set[str]:
    """Nomes (normalizados) de senadores das legislaturas configuradas."""
    nomes: set[str] = set()
    for leg in config.EMENDAS_LEGISLATURAS:
        d = _get_json(f"{config.SENADO_API}/senador/lista/legislatura/{leg}.json")
        parl = (d.get("ListaParlamentarLegislatura", {})
                 .get("Parlamentares", {}).get("Parlamentar", []))
        if isinstance(parl, dict):
            parl = [parl]
        for p in parl:
            ident = p.get("IdentificacaoParlamentar", {})
            nomes.add(normalizar(ident.get("NomeParlamentar") or ""))
    return nomes


def carregar_casas(manifest: Manifest, *, offline: bool = False) -> dict[str, str]:
    """{nome_normalizado -> 'Câmara'|'Senado'}. Nome em ambas as casas (ou em
    nenhuma) fica de fora — rótulo só quando inequívoco."""
    interim = config.INTERIM / "parlamentares_casa.json"
    if offline and interim.exists():
        cache = json.loads(interim.read_text(encoding="utf-8"))
        _record_casas(manifest, interim, cache.get("_proc", {}))
        return cache["casas"]
    print("[emendas] casas: cruzando autores com Câmara e Senado…")
    dep, sen = _casas_camara(), _casas_senado()
    casas: dict[str, str] = {}
    for nome in dep - sen:
        casas[nome] = "Câmara"
    for nome in sen - dep:
        casas[nome] = "Senado"
    casas.pop("", None)
    proc = {"lido_em": utc_now_iso(), "n_camara": len(dep), "n_senado": len(sen),
            "n_rotulados": len(casas), "legislaturas": config.EMENDAS_LEGISLATURAS}
    interim.parent.mkdir(parents=True, exist_ok=True)
    interim.write_text(json.dumps({"_proc": proc, "casas": casas},
                                  ensure_ascii=False, indent=2), encoding="utf-8")
    _record_casas(manifest, interim, proc)
    print(f"[emendas] casas: {len(dep)} deputados, {len(sen)} senadores → "
          f"{len(casas)} nomes rotulados")
    return casas


def _record_casas(manifest: Manifest, interim: Path, proc: dict) -> None:
    legs = ",".join(str(x) for x in proc.get("legislaturas", config.EMENDAS_LEGISLATURAS))
    for ds, url in ((config.CAMARA_DATASET, f"{config.CAMARA_API}/deputados"),
                    (config.SENADO_DATASET, f"{config.SENADO_API}/senador/lista/legislatura")):
        manifest.record(
            dataset_name=ds, publisher=ds.split(" — ")[0], source_url=url,
            local_path=interim, downloaded_at=proc.get("lido_em", utc_now_iso()),
            reference_period=f"legislaturas {legs}", http_status=200,
            content_type="application/json",
            notes="lista de parlamentares para rotular a casa (Câmara/Senado) do autor da emenda")


def _get_pagina(offset: int, *, ano_min: int) -> list[dict]:
    sel = ("id_plano_acao,codigo_plano_acao,ano_plano_acao,situacao_plano_acao,"
           "cnpj_beneficiario_plano_acao,nome_beneficiario_plano_acao,"
           "uf_beneficiario_plano_acao,nome_parlamentar_emenda_plano_acao,"
           "ano_emenda_parlamentar_plano_acao,valor_custeio_plano_acao,"
           "valor_investimento_plano_acao,"
           "codigo_descricao_areas_politicas_publicas_plano_acao")
    url = (f"{config.TRANSFEREGOV_ESPECIAIS_URL}/plano_acao_especial"
           f"?ano_plano_acao=gte.{ano_min}&select={sel}"
           f"&order=id_plano_acao.asc&limit={config.EMENDAS_PAGINA}&offset={offset}")
    return _get_json(url, timeout=120)


def _crawl(ano_min: int) -> list[dict]:
    """Baixa todos os planos (>= ano_min), paginando o PostgREST."""
    planos, offset = [], 0
    while True:
        pag = _get_pagina(offset, ano_min=ano_min)
        if not pag:
            break
        planos.extend(pag)
        offset += config.EMENDAS_PAGINA
        if offset % 10000 == 0:
            print(f"[emendas]   {offset} planos lidos…")
    return planos


def _r(v) -> float:
    return round(float(v or 0), 2)


def agregar(manifest: Manifest, mapa: dict[str, Municipio], *,
            offline: bool = False, ano_min: int = config.EMENDAS_ANO_MIN
            ) -> dict[str, dict]:
    """Retorna {cd_ibge -> {total, custeio, investimento, n, cnpj, por_ano,
    por_parlamentar, por_area, ultimas}}.

    online: percorre a API e grava data/interim/emendas_especiais.json.
    offline: reaproveita esse cache.
    """
    interim = config.INTERIM / "emendas_especiais.json"
    if offline and interim.exists():
        cache = json.loads(interim.read_text(encoding="utf-8"))
        prov = cache.get("_proc", {})
        manifest.record(
            dataset_name=config.EMENDAS_DATASET, publisher=config.EMENDAS_PUBLISHER,
            source_url=config.TRANSFEREGOV_ESPECIAIS_URL, local_path=interim,
            downloaded_at=prov.get("lido_em", utc_now_iso()),
            reference_period=f"{ano_min}-", http_status=200,
            content_type="application/json", notes=prov.get("notes", ""))
        carregar_casas(manifest, offline=True)  # provenance Câmara/Senado (rótulo já está no cache)
        print(f"[emendas] offline: {len(cache['municipios'])} municípios (cache)")
        return cache["municipios"]

    casas = carregar_casas(manifest, offline=offline)
    idx = indice_ibge(mapa)
    print(f"[emendas] TransfereGov — transferências especiais (>= {ano_min})…")
    planos = _crawl(ano_min)

    # acumuladores por município
    agg: dict[str, dict] = {}
    nao_casou: dict[tuple[str, str], int] = {}   # (uf, nome) -> nº planos perdidos
    n_estado = 0
    for p in planos:
        nome = p.get("nome_beneficiario_plano_acao") or ""
        uf = p.get("uf_beneficiario_plano_acao") or ""
        nn = normalizar(nome)
        if not nn.startswith(("MUNICIPIO", "PREFEITURA")):
            n_estado += 1
            continue
        cd = resolver_ibge(nome, uf, idx)
        if not cd:
            nao_casou[(uf, nome)] = nao_casou.get((uf, nome), 0) + 1
            continue
        valor = float(p.get("valor_custeio_plano_acao") or 0) + \
            float(p.get("valor_investimento_plano_acao") or 0)
        a = agg.setdefault(cd, {
            "cnpj": (p.get("cnpj_beneficiario_plano_acao") or "").strip(),
            "total": 0.0, "custeio": 0.0, "investimento": 0.0, "n": 0,
            "por_ano": {}, "por_parlamentar": {}, "por_area": {}, "_planos": [],
        })
        a["total"] += valor
        a["custeio"] += float(p.get("valor_custeio_plano_acao") or 0)
        a["investimento"] += float(p.get("valor_investimento_plano_acao") or 0)
        a["n"] += 1
        ano = str(p.get("ano_plano_acao") or "")
        a["por_ano"][ano] = a["por_ano"].get(ano, 0.0) + valor
        parl = (p.get("nome_parlamentar_emenda_plano_acao") or "—").strip()
        a["por_parlamentar"][parl] = a["por_parlamentar"].get(parl, 0.0) + valor
        chave_area, _ = _area_principal(
            p.get("codigo_descricao_areas_politicas_publicas_plano_acao"))
        a["por_area"][chave_area] = a["por_area"].get(chave_area, 0.0) + valor
        a["_planos"].append(p)

    # finaliza: arredonda, ranqueia parlamentares, monta "ultimas"
    municipios: dict[str, dict] = {}
    for cd, a in agg.items():
        planos_mun = sorted(a.pop("_planos"),
                            key=lambda x: x.get("id_plano_acao") or 0, reverse=True)
        ultimas = []
        for p in planos_mun[:config.EMENDAS_ULTIMAS]:
            chave_area, rotulo = _area_principal(
                p.get("codigo_descricao_areas_politicas_publicas_plano_acao"))
            parl = (p.get("nome_parlamentar_emenda_plano_acao") or "—").strip()
            ultimas.append({
                "ano": p.get("ano_plano_acao"),
                "parlamentar": parl, "casa": casas.get(normalizar(parl)),
                "valor": _r(float(p.get("valor_custeio_plano_acao") or 0)
                            + float(p.get("valor_investimento_plano_acao") or 0)),
                "area": rotulo, "area_chave": chave_area,
                "situacao": (p.get("situacao_plano_acao") or "").strip(),
            })
        top_parl = sorted(a["por_parlamentar"].items(), key=lambda x: -x[1])
        municipios[cd] = {
            "cnpj": a["cnpj"],
            "total": _r(a["total"]), "custeio": _r(a["custeio"]),
            "investimento": _r(a["investimento"]), "n": a["n"],
            "por_ano": {k: _r(v) for k, v in sorted(a["por_ano"].items())},
            "por_area": {k: _r(v) for k, v in
                         sorted(a["por_area"].items(), key=lambda x: -x[1])},
            "top_parlamentares": [{"nome": nm, "casa": casas.get(normalizar(nm)),
                                   "valor": _r(v)}
                                  for nm, v in top_parl[:config.EMENDAS_TOP_PARLAMENTARES]],
            "n_parlamentares": len(a["por_parlamentar"]),
            "ultimas": ultimas,
        }

    perdidos = sum(nao_casou.values())
    if nao_casou:
        print(f"[emendas] AVISO: {len(nao_casou)} beneficiário(s)-município sem "
              f"correspondência IBGE ({perdidos} planos descartados). Top:")
        for (uf, nm), c in sorted(nao_casou.items(), key=lambda x: -x[1])[:15]:
            print(f"[emendas]    {uf} | {nm!r} ({c})")

    notes = (f"plano_acao_especial (transferências especiais, RP6), planos a partir "
             f"de {ano_min}; {len(planos)} planos lidos, {n_estado} de governo "
             f"estadual (excluídos), {len(municipios)} municípios casados, "
             f"{perdidos} planos sem correspondência IBGE descartados.")
    proc = {"lido_em": utc_now_iso(), "url": config.TRANSFEREGOV_ESPECIAIS_URL,
            "ano_min": ano_min, "n_planos": len(planos),
            "n_municipios": len(municipios), "n_perdidos": perdidos, "notes": notes}
    interim.parent.mkdir(parents=True, exist_ok=True)
    interim.write_text(json.dumps({"_proc": proc, "municipios": municipios},
                                  ensure_ascii=False, indent=2), encoding="utf-8")
    manifest.record(
        dataset_name=config.EMENDAS_DATASET, publisher=config.EMENDAS_PUBLISHER,
        source_url=config.TRANSFEREGOV_ESPECIAIS_URL, local_path=interim,
        downloaded_at=proc["lido_em"], reference_period=f"{ano_min}-",
        http_status=200, content_type="application/json", notes=notes)
    print(f"[emendas] {len(municipios)} municípios com emendas | "
          f"{perdidos} planos descartados (sem IBGE)")
    return municipios


def escrever_snapshot(municipios: dict, *, gerado_em: str) -> Path:
    """Grava docs/data/emendas.json — o arquivo de CARGA SOB DEMANDA do front.

    Fica FORA do brasil.json (que voltou a ser leve): o navegador só baixa este
    arquivo quando o usuário abre o card de uma cidade ou usa a coluna de emendas.
    """
    total = round(sum((v.get("total") or 0) for v in municipios.values()), 2)
    payload = {
        "gerado_em": gerado_em,
        "ano_min": config.EMENDAS_ANO_MIN,
        "live_url": config.TRANSFEREGOV_ESPECIAIS_URL,
        "n_municipios": len(municipios),
        "total": total,
        "municipios": municipios,
    }
    path = config.DOCS_DATA / "emendas.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                    encoding="utf-8")
    return path


def atualizar_snapshot(*, offline: bool = False) -> None:
    """Atualização LEVE (workflow semanal): refaz só as emendas e reescreve o
    docs/data/emendas.json — SEM tocar no brasil.json (que continua mensal e não
    re-baixa à toa). Atualiza `emendas_gerado_em` no meta.json, que é como o front
    versiona o cache do emendas.json. Pré-requisito: o build completo já rodou.
    """
    cw = config.RAW / "crosswalk" / "municipio_tse_ibge.zip"
    mapa = crosswalk.carregar(cw, uf=config.UF_SIGLA)
    municipios = agregar(Manifest(), mapa, offline=offline)  # Manifest descartável
    agora = utc_now_iso()
    path = escrever_snapshot(municipios, gerado_em=agora)

    meta_path = config.DOCS_DATA / "meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["emendas_gerado_em"] = agora   # o front versiona o emendas.json por aqui
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2),
                             encoding="utf-8")
    total = round(sum((v.get("total") or 0) for v in municipios.values()), 2)
    print(f"[emendas] snapshot LEVE: {len(municipios)} municípios, R$ {total:,.0f} "
          f"→ {path.name} (data {agora}); brasil.json intacto")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(
        description="Atualização leve só das emendas (workflow semanal).")
    ap.add_argument("--offline", action="store_true",
                    help="reaproveita o cache em data/interim (sem rede)")
    atualizar_snapshot(offline=ap.parse_args().offline)
