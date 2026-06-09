"""Emendas parlamentares FEDERAIS (todas as modalidades) por município, a partir
do download em massa do Portal da Transparência: "Emendas por Documentos de
Despesa" — um CSV por ano (execução: empenho/liquidação/pagamento por documento).

Os arquivos são baixados MANUALMENTE no navegador (o WAF da Amazon bloqueia
automação headless) e ficam em data/raw/portal/*.zip (fora do git). Aqui a gente
processa local e gera docs/data/emendas.json (que é versionado), com, por município:
  - agregados: total empenhado/pago, por modalidade, por função, top parlamentares
    (com casa Câmara/Senado);
  - lista de emendas com VALOR POR MÊS — base do filtro de período no front.

Atribuição: coluna "Código IBGE do município de aplicação do recurso" (direto, sem
name-matching). Linhas "Sem informação" são nacionais/multi e ficam de fora.

Fonte mais completa que a TransfereGov (que só tinha transferência especial) e
mais fresca por ano de execução. NÃO usa chave de API (o bulk é aberto).

Stdlib apenas.
"""
from __future__ import annotations

import csv
import io
import json
import zipfile
from collections import Counter
from pathlib import Path

from . import config, crosswalk
from .emendas import normalizar, carregar_casas
from .provenance import Manifest, utc_now_iso

csv.field_size_limit(10 * 1024 * 1024)

PORTAL_DIR = config.RAW / "portal"
# Colunas usadas (por NOME do cabeçalho — robusto a reordenação).
_COLS = {
    "ibge": "Código IBGE do município de aplicação do recurso",
    "emp": "Valor Empenhado",
    "pago": "Valor Pago",
    "data": "Data Documento",
    "autor": "Nome do Autor da Emenda",
    "tipo": "Tipo de Emenda",
    "cod": "Código da Emenda",
    "cod_funcao": "Código Função",
}


def _num(s: str) -> float:
    s = (s or "").strip().strip('"')
    if "," in s:                         # formato BR: 1.234,56
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _mes(data: str) -> str | None:
    """'03/06/2024' -> '2024-06'. None se inválida."""
    d = (data or "").strip().strip('"')
    if len(d) >= 10 and d[2] == "/" and d[5] == "/":
        return f"{d[6:10]}-{d[3:5]}"
    return None


def _modalidade(tipo: str) -> str:
    t = (tipo or "").lower()
    if "bancada" in t:
        return "Bancada"
    if "comiss" in t:
        return "Comissão"
    if "relator" in t:
        return "Relator"
    if "individual" in t:
        return "Individual"
    return tipo.strip() or "Outras"


def processar(mapa, casas: dict, *, anos=None) -> dict[str, dict]:
    """Lê data/raw/portal/{ano}_*.zip e agrega por código IBGE."""
    cods_validos = {m.cd_ibge for m in mapa.values()}
    zips = sorted(PORTAL_DIR.glob("*_EmendasParlamentaresPorDocumento.zip"))
    if anos:
        zips = [z for z in zips if any(z.name.startswith(str(a)) for a in anos)]
    if not zips:
        raise SystemExit(f"Nenhum zip em {PORTAL_DIR}. Baixe os arquivos de "
                         "'Emendas por Documentos de Despesa' do Portal e coloque ali.")

    # agg[cd][cod_emenda] = {autor, casa, modalidade, funcao, emp, pago, meses{}}
    agg: dict[str, dict] = {}
    motivos = Counter()
    n_rows = 0
    for zp in zips:
        z = zipfile.ZipFile(zp)
        nome = next(n for n in z.namelist() if n.lower().endswith(".csv"))
        with z.open(nome) as fb:
            r = csv.reader(io.TextIOWrapper(fb, encoding="latin-1"), delimiter=";")
            hdr = [h.strip().strip('"') for h in next(r)]
            ix = {k: hdr.index(v) for k, v in _COLS.items()}
            for row in r:
                n_rows += 1
                ibge = (row[ix["ibge"]] or "").strip().strip('"')
                if not (ibge.isdigit() and len(ibge) == 7 and ibge in cods_validos):
                    motivos["nao_municipal"] += 1
                    continue
                motivos["municipal"] += 1
                emp = _num(row[ix["emp"]])
                pago = _num(row[ix["pago"]])
                cod = (row[ix["cod"]] or "").strip().strip('"')
                mun = agg.setdefault(ibge, {})
                e = mun.get(cod)
                if e is None:
                    cod_f = (row[ix["cod_funcao"]] or "").strip().strip('"')
                    e = mun[cod] = {
                        "a": (row[ix["autor"]] or "—").strip().strip('"').title(),
                        "t": _modalidade(row[ix["tipo"]]),
                        "f": config.EMENDAS_AREAS.get(cod_f, "outras"),
                        "v": 0.0, "p": 0.0, "m": {},
                    }
                e["v"] += emp
                e["p"] += pago
                mes = _mes(row[ix["data"]])
                if mes and emp:
                    e["m"][mes] = round(e["m"].get(mes, 0.0) + emp, 2)
        print(f"[federal] {zp.name}: {n_rows} linhas acumuladas, "
              f"{len(agg)} municípios")

    return _finalizar(agg, casas, motivos, n_rows)


def _finalizar(agg, casas, motivos, n_rows) -> dict:
    r = lambda v: round(float(v or 0), 2)
    out = {}
    for cd, emendas in agg.items():
        total = pago = 0.0
        por_mod, por_func, por_parl = {}, {}, {}
        lista = []
        for cod, e in emendas.items():
            casa = casas.get(normalizar(e["a"]))
            total += e["v"]; pago += e["p"]
            por_mod[e["t"]] = por_mod.get(e["t"], 0.0) + e["v"]
            por_func[e["f"]] = por_func.get(e["f"], 0.0) + e["v"]
            por_parl[e["a"]] = por_parl.get(e["a"], 0.0) + e["v"]
            lista.append({"a": e["a"], "c": casa, "t": e["t"], "f": e["f"],
                          "v": r(e["v"]), "p": r(e["p"]),
                          "m": {k: r(v) for k, v in sorted(e["m"].items())}})
        lista.sort(key=lambda x: -x["v"])
        top = sorted(por_parl.items(), key=lambda x: -x[1])
        out[cd] = {
            "total": r(total), "pago": r(pago), "n": len(emendas),
            "por_modalidade": {k: r(v) for k, v in sorted(por_mod.items(), key=lambda x: -x[1])},
            "por_area": {k: r(v) for k, v in sorted(por_func.items(), key=lambda x: -x[1])},
            "top_parlamentares": [{"nome": nm, "casa": casas.get(normalizar(nm)), "valor": r(v)}
                                  for nm, v in top[:config.EMENDAS_TOP_PARLAMENTARES]],
            "n_parlamentares": len(por_parl),
            "emendas": lista,
        }
    print(f"[federal] {n_rows} linhas | atribuição: {dict(motivos)} | "
          f"{len(out)} municípios")
    return out


def gerar_snapshot(*, anos=None, offline: bool = False) -> None:
    """Gera o dado granular SOB DEMANDA, dividido por UF (carga leve por cidade):
      docs/data/emendas/{uf}.json  — {cd_ibge: {...granular...}} (filtro de período)
      docs/data/emendas_resumo.json — {cd_ibge: {total, n}} + meta (mapa/tabela)
    """
    mapa = crosswalk.carregar(config.RAW / "crosswalk" / "municipio_tse_ibge.zip",
                              uf=config.UF_SIGLA)
    cd2uf = {m.cd_ibge: m.sg_uf for m in mapa.values()}
    manifest = Manifest()
    casas = carregar_casas(manifest, offline=offline)
    municipios = processar(mapa, casas, anos=anos)
    agora = utc_now_iso()
    total = round(sum(m["total"] for m in municipios.values()), 2)
    zips = sorted(p.name for p in PORTAL_DIR.glob("*_EmendasParlamentaresPorDocumento.zip"))

    # 1) granular por UF
    por_uf: dict[str, dict] = {}
    for cd, m in municipios.items():
        por_uf.setdefault(cd2uf.get(cd, "XX"), {})[cd] = m
    dest = config.DOCS_DATA / "emendas"
    dest.mkdir(parents=True, exist_ok=True)
    maior = 0.0
    for uf, muns in por_uf.items():
        p = dest / f"{uf}.json"
        p.write_text(json.dumps({"gerado_em": agora, "municipios": muns},
                                ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        maior = max(maior, p.stat().st_size / 1048576)

    # 2) resumo leve (totais por município) — para o mapa e a coluna da tabela
    resumo = {cd: {"total": m["total"], "n": m["n"]} for cd, m in municipios.items()}
    (config.DOCS_DATA / "emendas_resumo.json").write_text(
        json.dumps({"gerado_em": agora,
                    "fonte": "Portal da Transparência — Emendas por Documentos de Despesa",
                    "arquivos": zips, "anos": sorted({z[:4] for z in zips}),
                    "n_municipios": len(municipios), "total": total,
                    "municipios": resumo}, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8")

    meta_path = config.DOCS_DATA / "meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["emendas_gerado_em"] = agora
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

    resumo_mb = (config.DOCS_DATA / "emendas_resumo.json").stat().st_size / 1048576
    print(f"[federal] {len(municipios)} municípios, R$ {total:,.0f} | "
          f"{len(por_uf)} arquivos por UF (maior {maior:.1f} MB) + "
          f"resumo {resumo_mb:.1f} MB (data {agora})")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="Emendas federais (Portal — bulk CSV).")
    ap.add_argument("--offline", action="store_true", help="reusa cache de casas")
    ap.add_argument("--anos", nargs="*", type=int, help="filtra anos (default: todos os zips)")
    args = ap.parse_args()
    gerar_snapshot(anos=args.anos, offline=args.offline)
