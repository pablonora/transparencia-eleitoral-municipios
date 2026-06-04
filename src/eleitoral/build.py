"""Orquestra o pipeline ponta a ponta (Brasil) e gera os JSONs estáticos.

  raw (TSE/IBGE)  ->  crosswalk validado  ->  indicadores  ->  docs/data/*.json

Tudo reprodutível: mesmos brutos -> mesmos números. Cada número carrega, via
meta.json, a fonte e a data de extração.

Uso:
    python -m eleitoral.build              # baixa tudo e processa
    python -m eleitoral.build --offline    # usa brutos já em data/raw
"""
from __future__ import annotations

import argparse
import json

from . import (config, comparecimento, contas, crosswalk, eleitorado, governador,
               ibge, indicators, malhas, orcamento, resultados, transferencia)
from .download import baixar_tudo
from .provenance import Manifest, utc_now_iso


def main(offline: bool = False) -> None:
    manifest = Manifest()

    # 1) brutos --------------------------------------------------------------
    paths = baixar_tudo(manifest, pular_existentes=offline)

    # 2) crosswalk oficial ---------------------------------------------------
    mapa = crosswalk.carregar(paths["crosswalk"], uf=config.UF_SIGLA)
    print(f"[crosswalk] {len(mapa)} municípios em {config.UF_SIGLA}")

    # 3) eleitorado (streaming do CSV nacional) ------------------------------
    print("[eleitorado] agregando (pode levar ~1 min)...")
    el = eleitorado.agregar_uf(paths["eleitorado"], uf=config.UF_SIGLA)
    print(f"[eleitorado] {len(el.municipios)} municípios | geração {el.dt_geracao}")

    # Eleitores no EXTERIOR (SG_UF='ZZ') não têm município/população do IBGE.
    # Removemos do cruzamento e registramos explicitamente o que foi excluído.
    exterior = {cd: m for cd, m in el.municipios.items() if m.uf == config.UF_EXTERIOR}
    if exterior:
        n_ext = sum(m.eleitores for m in exterior.values())
        for cd in exterior:
            del el.municipios[cd]
        print(f"[exterior] excluídos {len(exterior)} 'municípios' do exterior "
              f"({n_ext:,} eleitores) — sem população IBGE correspondente")

    # join SÓ por código: aborta se faltar correspondência
    crosswalk.validar_cobertura(set(el.municipios), mapa)

    # 4) população IBGE ------------------------------------------------------
    todos_periodos = ibge.periodos_estimativa()
    anos = todos_periodos[-config.IBGE_ANOS_ESTIMATIVA:]
    print(f"[ibge] estimativas anos {anos}")
    estimativas, anos = ibge.estimativas_populacao(manifest, anos)
    censo = ibge.censo_idade(manifest)
    print(f"[ibge] censo 2022: {len(censo)} municípios")

    # 5) transferências ------------------------------------------------------
    print("[transf] agregando...")
    transf = transferencia.agregar_uf(paths["transferencia"], uf=config.UF_SIGLA)
    transf_entradas = {cd: v["entradas"] for cd, v in transf.items()}

    # 5b) comparecimento / abstenção por eleição -----------------------------
    comp_por_ano = {}
    for ano in config.TSE_COMPARECIMENTO_ANOS:
        print(f"[comparec] agregando {ano}...")
        comp_por_ano[ano] = comparecimento.agregar(paths[f"comparecimento_{ano}"], uf=config.UF_SIGLA)

    # 5c) eleição 2024 (margem do prefeito) × transferências do mesmo ano -----
    print(f"[eleicao] margem do prefeito {config.TSE_ELEICAO_ANO}...")
    prefeito = resultados.agregar_prefeito(paths["votos_eleicao"], uf=config.UF_SIGLA)
    transf_eleicao = transferencia.agregar_uf(paths["transferencia_eleicao"], uf=config.UF_SIGLA)
    # votos válidos/brancos/nulos do prefeito (1º turno) — fonte: detalhe da votação
    brancos_nulos = resultados.agregar_brancos_nulos(paths["detalhe_votacao"], uf=config.UF_SIGLA)
    # governador eleito por UF (2022) + espectro — só no escopo Brasil
    print("[governador] governador eleito por UF (2022)...")
    governadores = governador.agregar(manifest, offline=offline) if config.UF_SIGLA is None else {}

    # 5d) prestação de contas (receitas/despesas de campanha) por município ----
    print("[contas] prestação de contas eleitorais 2024...")
    contas_mun = contas.agregar(manifest, uf=config.UF_SIGLA, offline=offline)

    # 6) indicadores ---------------------------------------------------------
    inds, limiares_uf, limiar_nacional = indicators.calcular(
        eleitorado=el.municipios, mapa=mapa,
        estimativas=estimativas, anos_estimativa=anos,
        censo=censo, transferencias=transf_entradas,
    )

    # 6b) orçamento público municipal (SICONFI) — receita e despesa por função.
    # Fonte distinta da prestação de contas de campanha (dinheiro público).
    print("[orcamento] orçamento público municipal (SICONFI)...")
    orcamento_mun = orcamento.agregar(manifest, [ind.cd_ibge for ind in inds], offline=offline)

    registros = []
    for ind in inds:
        d = indicators.para_dict(ind)
        t = transf.get(ind.cd_tse, {})
        d["transferencias_saidas"] = t.get("saidas")
        d["transferencias_saldo"] = t.get("saldo")
        comp = {}
        for ano, mapa_comp in comp_por_ano.items():
            c = mapa_comp.get(ind.cd_tse.lstrip("0"))
            if c and c["aptos"]:
                # razão da ÉPOCA: eleitorado apto daquele ano ÷ população do mesmo
                # ano. Em 2022 usamos o CENSO (contagem exata); nos demais, a
                # estimativa do ano — tudo year-matched, mais preciso que o "atual".
                if ano == config.IBGE_CENSO_ANO_INT:
                    pop_ep = (censo.get(ind.cd_ibge) or {}).get("total")
                else:
                    pop_ep = (estimativas.get(ind.cd_ibge) or {}).get(str(ano))
                comp[str(ano)] = {
                    "aptos": c["aptos"],
                    "comparecimento": c["comparecimento"],
                    "abstencao": c["abstencao"],
                    "abst_pct": round(c["abstencao"] / c["aptos"], 4),
                    "comp_pct": round(c["comparecimento"] / c["aptos"], 4),
                    "abst_obr_pct": round(c["abst_obr"] / (c["comp_obr"] + c["abst_obr"]), 4) if (c["comp_obr"] + c["abst_obr"]) else None,
                    "pop_epoca": pop_ep,
                    "razao_epoca": round(c["aptos"] / pop_ep, 4) if pop_ep else None,
                    "razao_epoca_fonte": "Censo 2022" if ano == config.IBGE_CENSO_ANO_INT else f"estimativa {ano}",
                }
        d["comparecimento"] = comp
        # eleição 2024 (prefeito) — cruzamento FACTUAL com transferências do ano
        cd0 = ind.cd_tse.lstrip("0")
        p = prefeito.get(cd0)
        if p:
            saldo24 = (transf_eleicao.get(cd0) or {}).get("saldo")
            d["eleicao2024"] = {
                "cargo": "Prefeito", "turno": p["turno"], "vencedor": p["vencedor"],
                "partido": p.get("partido", ""),
                "espectro": config.espectro_partido(p.get("partido", "")),
                "votos_venc": p["votos_venc"], "votos_2o": p["votos_2o"],
                "margem": p["margem"], "total": p["total"],
                "n_cand": p["n_cand"], "n_cand_1t": p["n_cand_1t"],
                "transf_saldo": saldo24,
                "entrada_maior_que_margem": bool(
                    saldo24 is not None and saldo24 > 0
                    and p["margem"] is not None and p["margem"] >= 0
                    and saldo24 > p["margem"]),
            }
            # votos válidos/brancos/nulos do prefeito (1º turno)
            bn = brancos_nulos.get(cd0)
            if bn and bn["comparecimento"]:
                comp_pref = bn["comparecimento"]
                d["eleicao2024"].update({
                    "validos": bn["validos"], "brancos": bn["brancos"], "nulos": bn["nulos"],
                    "comparecimento_pref": comp_pref,
                    "pct_brancos": round(bn["brancos"] / comp_pref, 4),
                    "pct_nulos": round(bn["nulos"] / comp_pref, 4),
                    "pct_brancos_nulos": round((bn["brancos"] + bn["nulos"]) / comp_pref, 4),
                })

        # Três critérios CUMULATIVOS da revisão de eleitorado de ofício
        # (Res. TSE 23.659/2021, art. 105). Atender aos três é o conjunto
        # legalmente definido — e ainda assim a revisão é discricionária.
        e25 = (transf.get(cd0) or {}).get("entradas", 0)
        e24 = (transf_eleicao.get(cd0) or {}).get("entradas", 0)
        crit1 = bool(e25 > 0 and (e24 == 0 or e25 >= 1.1 * e24))     # +10% transf ano/ano
        cen = censo.get(ind.cd_ibge) or {}
        base2 = (cen.get("pop_10_15") or 0) + (cen.get("pop_70mais") or 0)
        crit2 = bool(base2 and ind.eleitores > 2 * base2)            # eleitorado > 2×(10–15 + 70+)
        crit3 = bool(ind.acima_limiar_tse)                           # eleitorado > 80% da pop.
        d["revisao"] = {
            "crit1_transferencias": crit1,
            "crit2_jovens_idosos": crit2,
            "crit3_acima_80": crit3,
            "atende_3": crit1 and crit2 and crit3,
        }

        # Prestação de contas eleitorais 2024 (valores DECLARADOS; não causal).
        c = contas_mun.get(cd0)
        if c:
            cc = dict(c)
            if ind.eleitores:
                cc["despesa_por_eleitor"] = round(c["despesa_total"] / ind.eleitores, 2)
                cc["receita_por_eleitor"] = round(c["receita_total"] / ind.eleitores, 2)
            d["contas"] = cc

        # Orçamento público municipal (SICONFI) — dinheiro público, NÃO campanha.
        o = orcamento_mun.get(ind.cd_ibge)
        if o:
            d["orcamento"] = o
        registros.append(d)

    # 7) saída ---------------------------------------------------------------
    config.DOCS_DATA.mkdir(parents=True, exist_ok=True)
    n_acima_100 = sum(1 for d in registros if d["mais_eleitores_que_pop"])
    n_acima_limiar = sum(1 for d in registros if d["acima_limiar_tse"])
    n_out_uf = sum(1 for d in registros if d["outlier_uf"])
    n_out_nac = sum(1 for d in registros if d["outlier_nacional"])
    n_revisao = sum(1 for d in registros if d.get("revisao", {}).get("atende_3"))
    n_contas = sum(1 for d in registros if d.get("contas"))
    despesa_nac = round(sum(d["contas"]["despesa_total"] for d in registros if d.get("contas")), 2)
    receita_nac = round(sum(d["contas"]["receita_total"] for d in registros if d.get("contas")), 2)
    n_orcamento = sum(1 for d in registros if d.get("orcamento"))
    orc_despesa_nac = round(sum(d["orcamento"].get("despesa") or 0 for d in registros if d.get("orcamento")), 2)
    orc_saude_nac = round(sum(d["orcamento"].get("saude") or 0 for d in registros if d.get("orcamento")), 2)
    orc_educ_nac = round(sum(d["orcamento"].get("educacao") or 0 for d in registros if d.get("orcamento")), 2)
    ano_pop = anos[-1]
    ufs = sorted({d["uf"] for d in registros})
    # sigla -> código IBGE da UF (dois primeiros dígitos do código municipal)
    uf_codigos = {}
    for cd_tse, mun in mapa.items():
        uf_codigos.setdefault(mun.sg_uf, mun.cd_ibge[:2])

    # malhas geográficas (UF + municipal por UF) para o mapa
    if config.UF_SIGLA is None:
        print("[malha] baixando/validando malhas do IBGE...")
        malhas.baixar_malhas(manifest, sorted(set(uf_codigos.values())))

    payload = {
        "uf": config.UF_SIGLA,            # None = Brasil
        "ufs": ufs,
        "uf_codigos": uf_codigos,
        "gerado_em": utc_now_iso(),
        "ano_eleitorado": el.dt_geracao,
        "ano_populacao": ano_pop,
        "limiar_revisao": config.LIMIAR_REVISAO,
        "limiar_estatistico_nacional": (round(limiar_nacional, 4) if limiar_nacional else None),
        "limiares_estatisticos_por_uf": {
            uf: round(v, 4) for uf, v in limiares_uf.items() if v is not None
        },
        "nota_neutra": config.NOTA_NEUTRA,
        "nota_contas": config.NOTA_CONTAS,
        "ano_contas": config.TSE_CONTAS_ANO,
        "nota_orcamento": config.NOTA_ORCAMENTO,
        "ano_orcamento": config.ORCAMENTO_ANO,
        "nota_politica": config.NOTA_POLITICA,
        "partido_fonte": config.PARTIDO_FONTE,
        "governadores": governadores,
        "resumo": {
            "n_municipios": len(registros),
            "n_mais_eleitores_que_pop": n_acima_100,
            "n_acima_limiar_tse": n_acima_limiar,
            "n_outlier_uf": n_out_uf,
            "n_outlier_nacional": n_out_nac,
            "n_revisao_3criterios": n_revisao,
            "n_com_contas": n_contas,
            "despesa_campanha_total": despesa_nac,
            "receita_campanha_total": receita_nac,
            "n_com_orcamento": n_orcamento,
            "orcamento_despesa_total": orc_despesa_nac,
            "orcamento_saude_total": orc_saude_nac,
            "orcamento_educacao_total": orc_educ_nac,
            "razao_total_max": max((d["razao_total"] or 0) for d in registros),
            "razao_total_mediana": _mediana([d["razao_total"] for d in registros]),
        },
        "municipios": registros,
    }
    saida = config.DOCS_DATA / f"{config.escopo_slug()}.json"
    saida.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    _escrever_meta(manifest, ano_pop, el.dt_geracao)
    manifest.write()

    print(f"[ok] {len(registros)} municípios em {len(ufs)} UF | >100%: {n_acima_100} | "
          f">{config.LIMIAR_REVISAO:.0%} (TSE): {n_acima_limiar} | "
          f"outlier UF: {n_out_uf} | outlier nac: {n_out_nac} | 3 critérios TSE: {n_revisao}")
    print(f"[ok] contas: {n_contas} municípios | despesa campanha R$ {despesa_nac:,.0f} | "
          f"receita R$ {receita_nac:,.0f}")
    print(f"[ok] orçamento: {n_orcamento} municípios | despesa pública R$ {orc_despesa_nac:,.0f} | "
          f"saúde R$ {orc_saude_nac:,.0f} | educação R$ {orc_educ_nac:,.0f}")
    print(f"[ok] docs/data/{config.escopo_slug()}.json + meta.json + manifest/provenance.json")


def _escrever_meta(manifest: Manifest, ano_pop: str, dt_eleitorado: str) -> None:
    fontes = [
        {
            "dataset": s["dataset_name"], "publisher": s["publisher"],
            "url": s["source_url"], "extraido_em": s["downloaded_at"],
            "periodo": s["reference_period"], "sha256": s["sha256"],
        }
        for s in manifest.sources
    ]
    meta = {
        "gerado_em": utc_now_iso(),
        "uf": config.UF_SIGLA,
        "indicadores": {
            "razao_total": {
                "definicao": "eleitores ÷ população total estimada",
                "fonte_numerador": "TSE — Eleitorado Atual",
                "fonte_denominador": f"IBGE — Estimativa de população (tabela 6579), {ano_pop}",
            },
            "razao_16mais": {
                "definicao": "eleitores ÷ população de 16 anos ou mais (estimada)",
                "metodo": (
                    "A proporção de pessoas com 16+ por município vem do Censo "
                    "2022 (tabela 9514). Como as estimativas anuais (6579) não "
                    "trazem recorte etário e não cobrem 2022, aplicamos essa "
                    f"proporção do Censo 2022 à estimativa de {ano_pop} para obter "
                    "a população 16+ ESTIMADA. É uma extrapolação: assume que a "
                    "estrutura etária do município se manteve igual à de 2022."
                ),
                "fonte_numerador": "TSE — Eleitorado Atual",
                "fonte_denominador": "IBGE — Censo 2022 (9514) × Estimativa (6579)",
            },
            "crescimento_pop_pct": {
                "definicao": "variação % da população estimada entre os dois anos mais recentes",
                "fonte": "IBGE — Estimativa de população (tabela 6579)",
            },
            "transferencias": {
                "definicao": "entradas de domicílio eleitoral no ano (e saldo entradas−saídas)",
                "fonte": f"TSE — Transferência do eleitorado ({config.TSE_TRANSFERENCIA_ANO})",
            },
            "contas_campanha": {
                "definicao": (
                    "soma das receitas declaradas (arrecadação) e das despesas "
                    "contratadas (gasto) das campanhas de candidatos do município, "
                    f"eleição municipal de {config.TSE_CONTAS_ANO}, por cargo."
                ),
                "metodo": (
                    "Agregado por SG_UE (código do município no TSE). Lidos por HTTP "
                    "Range apenas os arquivos por-UF de receitas e despesas "
                    "contratadas; os arquivos _BRASIL (concatenação) são excluídos "
                    "para não duplicar. 'despesas pagas' e 'doador originário' não "
                    "entram. Valores em reais correntes de 2024."
                ),
                "ressalva": config.NOTA_CONTAS,
                "fonte": f"TSE — Prestação de contas eleitorais ({config.TSE_CONTAS_ANO})",
            },
            "orcamento_municipal": {
                "definicao": (
                    "receita e despesa do GOVERNO municipal (a prefeitura), por "
                    "função (saúde, educação, segurança, etc.), exercício "
                    f"{config.ORCAMENTO_ANO}. Distinto de gasto de campanha."
                ),
                "metodo": (
                    "Declaração de Contas Anuais (DCA) no SICONFI/Tesouro Nacional: "
                    "Anexo I-E (despesas EMPENHADAS por função) e Anexo I-C (receita "
                    "realizada). Consulta por ente (código IBGE) na API pública. "
                    "Cobertura depende do envio de cada município."
                ),
                "ressalva": config.NOTA_ORCAMENTO,
                "fonte": f"{config.SICONFI_PUBLISHER} — DCA ({config.ORCAMENTO_ANO})",
            },
        },
        "limiar_revisao": config.LIMIAR_REVISAO,
        "nota_neutra": config.NOTA_NEUTRA,
        "nota_contas": config.NOTA_CONTAS,
        "nota_orcamento": config.NOTA_ORCAMENTO,
        "fontes": fontes,
    }
    (config.DOCS_DATA / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def _mediana(vals: list) -> float | None:
    xs = sorted(v for v in vals if v is not None)
    if not xs:
        return None
    n = len(xs)
    mid = n // 2
    return xs[mid] if n % 2 else round((xs[mid - 1] + xs[mid]) / 2, 4)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", action="store_true", help="usa brutos já baixados")
    args = ap.parse_args()
    main(offline=args.offline)
