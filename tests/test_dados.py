"""Validação dos DADOS gerados (docs/data/brasil.json) — invariantes que pegam
regressões a cada build, sem rede.

Roda contra o JSON versionado (ou recém-gerado pelo pipeline no CI). Se o arquivo
não existir (checkout parcial), os testes são pulados. Tudo determinístico/offline
— a conferência ao vivo contra TSE/SICONFI fica como auditoria manual.

Nasceu do bug dos pisos (2026-06-05): a API do SICONFI devolvia o % aplicado ora
em fração, ora em ponto percentual, ora em R$ — e um 14% virou "0,1%". Estes
invariantes (faixas plausíveis + coerência interna) impedem que algo assim passe.
"""
import json
import unittest

from eleitoral import config

_PATH = config.DOCS_DATA / f"{config.escopo_slug()}.json"
_META = config.DOCS_DATA / "meta.json"


def _frac_ok(v):
    return v is None or (0.0 <= v <= 1.0)


@unittest.skipUnless(_PATH.exists(), f"{_PATH} ausente (rode o pipeline)")
class TestDadosBrasil(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = json.loads(_PATH.read_text(encoding="utf-8"))
        cls.M = cls.d["municipios"]

    def _viol(self, pred, rotulo):
        """Lista (nome, uf, detalhe) dos municípios que violam pred(m)->detalhe|None."""
        out = []
        for m in self.M:
            det = pred(m)
            if det is not None:
                out.append((m.get("nome"), m.get("uf"), det))
        self.assertEqual(out, [], f"{rotulo}: {len(out)} violações; ex {out[:5]}")

    # --- estrutura ---
    def test_estrutura_e_contagens(self):
        M = self.M
        self.assertEqual(len(M), self.d["resumo"]["n_municipios"])
        cds = [m["cd_ibge"] for m in M]
        self.assertEqual(len(set(cds)), len(cds), "cd_ibge duplicado")
        tses = [m["cd_tse"] for m in M]
        self.assertEqual(len(set(tses)), len(tses), "cd_tse duplicado")
        self.assertEqual(len({m["uf"] for m in M}), 27, "esperado 27 UFs")

    # --- razões coerentes com os insumos ---
    def test_razao_total(self):
        self._viol(lambda m: round(m["eleitores"] / m["pop_total_estimada"], 4)
                   if m["eleitores"] and m["pop_total_estimada"] and abs(m["eleitores"] / m["pop_total_estimada"] - (m["razao_total"] or 0)) > 0.01 else None,
                   "razao_total != eleitores/pop")

    def test_razao_16mais(self):
        self._viol(lambda m: m.get("razao_16mais")
                   if m.get("pop_16mais_estimada") and m.get("razao_16mais") and abs(m["eleitores"] / m["pop_16mais_estimada"] - m["razao_16mais"]) > 0.01 else None,
                   "razao_16mais incoerente")

    def test_eleitores_soma(self):
        self._viol(lambda m: m["eleitores"]
                   if m.get("eleitores_obrigatorio") is not None and abs(m["eleitores"] - (m["eleitores_obrigatorio"] + m["eleitores_facultativo"])) > 1 else None,
                   "eleitores != obrigatorio + facultativo")

    # --- frações em [0,1] ---
    def test_fracoes_demograficas(self):
        keys = ["pct_16_17", "pct_70mais", "pct_feminino", "pct_superior",
                "pct_ate_fundamental", "share_16mais_censo2022"]
        self._viol(lambda m: [k for k in keys if not _frac_ok(m.get(k))] or None,
                   "fração demográfica fora de [0,1]")

    def test_comparecimento(self):
        def pred(m):
            bad = []
            for y, c in (m.get("comparecimento") or {}).items():
                if not _frac_ok(c.get("abst_pct")) or not _frac_ok(c.get("comp_pct")):
                    bad.append(f"{y}:frac")
                if c.get("comp_pct") is not None and c.get("abst_pct") is not None and abs(c["comp_pct"] + c["abst_pct"] - 1) > 0.02:
                    bad.append(f"{y}:soma")
            return bad or None
        self._viol(pred, "comparecimento incoerente")

    # --- eleição 2024 ---
    def test_eleicao2024(self):
        def pred(m):
            e = m.get("eleicao2024")
            if not e:
                return None
            bad = []
            if e.get("votos_venc") is not None and e.get("votos_2o") is not None and e["votos_venc"] < e["votos_2o"]:
                bad.append("venc<2o")
            if e.get("margem") is not None and e.get("votos_venc") is not None and abs(e["margem"] - (e["votos_venc"] - e["votos_2o"])) > 1:
                bad.append("margem")
            for k in ("pct_brancos", "pct_nulos", "pct_brancos_nulos"):
                if not _frac_ok(e.get(k)):
                    bad.append(k)
            return bad or None
        self._viol(pred, "eleicao2024 incoerente")

    # --- orçamento ---
    def test_orcamento(self):
        def pred(m):
            o = m.get("orcamento")
            if not o:
                return None
            bad = []
            if o.get("despesa") is not None and o["despesa"] <= 0:
                bad.append("despesa<=0")
            for f in ("saude", "educacao", "seguranca", "assistencia", "urbanismo", "pessoal"):
                v = o.get(f)
                if v is not None and o.get("despesa") and v > o["despesa"] * 1.05:
                    bad.append(f"{f}>despesa")
            return bad or None
        self._viol(pred, "orçamento incoerente")

    # --- séries ---
    def test_series(self):
        def pred(m):
            bad = []
            for p in (m.get("eleitorado_serie") or []):
                if not p.get("aptos") or p["aptos"] <= 0:
                    bad.append("aptos<=0")
            for p in (m.get("abstencao_serie") or []):
                if not _frac_ok(p.get("abst_pct")):
                    bad.append("abst_serie frac")
            return bad or None
        self._viol(pred, "série incoerente")

    # --- flags derivadas coerentes ---
    def test_flags_derivadas(self):
        self._viol(lambda m: "crit3" if m.get("revisao") and m["revisao"].get("crit3_acima_80") != m.get("acima_limiar_tse") else None,
                   "crit3 != acima_limiar_tse")
        self._viol(lambda m: "mais_el" if m.get("mais_eleitores_que_pop") != ((m.get("razao_total") or 0) > 1) else None,
                   "mais_eleitores_que_pop != (razão>1)")
        n100 = sum(1 for m in self.M if m.get("mais_eleitores_que_pop"))
        self.assertEqual(n100, self.d["resumo"]["n_mais_eleitores_que_pop"], "contagem >100% diverge do resumo")

    # --- guardrails ---
    def test_governadores_so_partido(self):
        permitido = {"governador", "partido", "turno"}
        for uf, g in (self.d.get("governadores") or {}).items():
            extra = set(g) - permitido
            self.assertEqual(extra, set(), f"governador {uf} com campo inesperado: {extra}")

    @unittest.skipUnless(_META.exists(), "meta.json ausente")
    def test_meta_ressalvas(self):
        meta = json.loads(_META.read_text(encoding="utf-8"))
        for n in ("nota_neutra", "nota_contas", "nota_orcamento"):
            self.assertTrue(meta.get(n), f"ressalva ausente no meta: {n}")


if __name__ == "__main__":
    unittest.main()
