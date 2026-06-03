"""Cálculo dos indicadores por município.

Indicadores:
  - razao_total      = eleitores / população total estimada (IBGE 6579)  [headline]
  - razao_16mais     = eleitores / população 16+ estimada (denominador honesto)
  - crescimento_pop  = variação % da população entre os dois anos de estimativa
  - transferencias   = volume de transferências de domicílio eleitoral (ano)

A parcela 16+ vem do Censo 2022 (âncora) e é aplicada à estimativa do ano da
razão (extrapolação) — SEMPRE rotulada como tal na saída.

O join é estritamente por código (TSE -> IBGE via crosswalk oficial).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass

from . import config
from .crosswalk import Municipio


@dataclass
class Indicador:
    cd_tse: str
    cd_ibge: str
    nome: str
    uf: str

    eleitores: int
    eleitores_obrigatorio: int
    eleitores_facultativo: int

    ano_pop: str
    pop_total_estimada: int
    razao_total: float | None

    share_16mais_censo2022: float | None
    pop_16mais_estimada: int | None
    razao_16mais: float | None

    ano_pop_anterior: str | None
    pop_total_anterior: int | None
    crescimento_pop_pct: float | None

    transferencias_ano: int | None
    transferencias_qtd: int | None

    # Perfil demográfico do eleitorado (% do eleitorado do município)
    pct_16_17: float | None
    pct_70mais: float | None
    pct_feminino: float | None
    pct_superior: float | None
    pct_ate_fundamental: float | None

    # Marcadores NEUTROS e independentes (o usuário filtra por eles).
    # Nenhum deles, isoladamente, indica irregularidade — ver NOTA_NEUTRA.
    mais_eleitores_que_pop: bool   # razão > 100% (mais eleitores que habitantes estimados)
    acima_limiar_tse: bool         # razão > limiar de revisão (referência ao TSE)
    outlier_uf: bool               # foge da distribuição da PRÓPRIA UF (> Q3 + 1,5·IQR na UF)
    outlier_nacional: bool         # foge da distribuição NACIONAL (> Q3 + 1,5·IQR no Brasil)


def _div(a, b):
    return (a / b) if (a is not None and b) else None


def _limiar_estatistico(valores: list[float]) -> float | None:
    """Q3 + 1,5·IQR sobre a distribuição das razões (regra de Tukey)."""
    xs = sorted(v for v in valores if v is not None)
    if len(xs) < 4:
        return None
    n = len(xs)
    q1 = xs[n // 4]
    q3 = xs[(3 * n) // 4]
    return q3 + 1.5 * (q3 - q1)


def calcular(
    eleitorado: dict,            # cd_tse -> EleitoradoMunicipio
    mapa: dict[str, Municipio],  # cd_tse -> Municipio
    estimativas: dict,           # cd_ibge -> {ano -> pop}
    anos_estimativa: list[str],  # ordenado asc
    censo: dict,                 # cd_ibge -> {share_16mais, ...}
    transferencias: dict | None = None,  # cd_tse -> qtd
) -> tuple[list[Indicador], dict[str, float], float | None]:
    """Retorna (indicadores ordenados, {uf -> limiar}, limiar_nacional).

    Calculamos DOIS limiares de Tukey (Q3 + 1,5·IQR):
      - por UF: "atípico para o próprio estado" (padrão é fortemente regional);
      - nacional: "atípico para o Brasil" (leitura intuitiva: maior razão →
        mais provável de marcar).
    Os dois são apresentados lado a lado para o leitor comparar.
    """
    ano_atual = anos_estimativa[-1]
    ano_anterior = anos_estimativa[-2] if len(anos_estimativa) >= 2 else None
    transferencias = transferencias or {}

    # 1ª passada: calcula razões (precisamos da distribuição p/ o limiar estatístico)
    parciais = []
    for cd_tse, e in eleitorado.items():
        mun = mapa[cd_tse]                      # garantido pelo crosswalk validado
        cd_ibge = mun.cd_ibge
        pop = estimativas.get(cd_ibge, {})
        pop_total = pop.get(ano_atual)
        pop_ant = pop.get(ano_anterior) if ano_anterior else None
        share = (censo.get(cd_ibge) or {}).get("share_16mais")
        pop_16 = int(round(pop_total * share)) if (pop_total and share) else None
        parciais.append(dict(
            cd_tse=cd_tse, mun=mun, cd_ibge=cd_ibge, e=e,
            pop_total=pop_total, pop_ant=pop_ant, share=share, pop_16=pop_16,
            razao_total=_div(e.eleitores, pop_total),
            razao_16=_div(e.eleitores, pop_16),
            cresc=(_div((pop_total - pop_ant), pop_ant) if (pop_total and pop_ant) else None),
        ))

    # limiar de Tukey por UF e nacional
    razoes_por_uf: dict[str, list] = {}
    for p in parciais:
        razoes_por_uf.setdefault(p["mun"].sg_uf, []).append(p["razao_total"])
    limiar_por_uf = {
        uf: _limiar_estatistico(rs) for uf, rs in razoes_por_uf.items()
    }
    limiar_nacional = _limiar_estatistico([p["razao_total"] for p in parciais])

    out: list[Indicador] = []
    for p in parciais:
        rt = p["razao_total"]
        limiar_uf = limiar_por_uf.get(p["mun"].sg_uf)
        out.append(Indicador(
            cd_tse=p["cd_tse"], cd_ibge=p["cd_ibge"],
            nome=p["mun"].nome_ibge or p["e"].nome_tse, uf=p["mun"].sg_uf,
            eleitores=p["e"].eleitores,
            eleitores_obrigatorio=p["e"].eleitores_obrigatorio,
            eleitores_facultativo=p["e"].eleitores_facultativo,
            ano_pop=ano_atual, pop_total_estimada=p["pop_total"], razao_total=rt,
            share_16mais_censo2022=p["share"], pop_16mais_estimada=p["pop_16"],
            razao_16mais=p["razao_16"],
            ano_pop_anterior=ano_anterior, pop_total_anterior=p["pop_ant"],
            crescimento_pop_pct=(p["cresc"] * 100 if p["cresc"] is not None else None),
            transferencias_ano=(config.TSE_TRANSFERENCIA_ANO if p["cd_tse"] in transferencias else None),
            transferencias_qtd=transferencias.get(p["cd_tse"]),
            pct_16_17=_div(p["e"].e_16_17, p["e"].eleitores),
            pct_70mais=_div(p["e"].e_70mais, p["e"].eleitores),
            pct_feminino=_div(p["e"].e_feminino, p["e"].eleitores),
            pct_superior=_div(p["e"].e_superior, p["e"].eleitores),
            pct_ate_fundamental=_div(p["e"].e_ate_fundamental, p["e"].eleitores),
            mais_eleitores_que_pop=bool(rt is not None and rt > 1.0),
            acima_limiar_tse=bool(rt is not None and rt > config.LIMIAR_REVISAO),
            outlier_uf=bool(rt is not None and limiar_uf is not None and rt > limiar_uf),
            outlier_nacional=bool(rt is not None and limiar_nacional is not None and rt > limiar_nacional),
        ))

    out.sort(key=lambda x: (x.razao_total is None, -(x.razao_total or 0)))
    return out, limiar_por_uf, limiar_nacional


def para_dict(ind: Indicador) -> dict:
    d = asdict(ind)
    # arredonda razões/percentuais para a UI
    for k in ("razao_total", "razao_16mais", "share_16mais_censo2022",
              "pct_16_17", "pct_70mais", "pct_feminino", "pct_superior",
              "pct_ate_fundamental"):
        if d[k] is not None:
            d[k] = round(d[k], 4)
    if d["crescimento_pop_pct"] is not None:
        d["crescimento_pop_pct"] = round(d["crescimento_pop_pct"], 2)
    return d
