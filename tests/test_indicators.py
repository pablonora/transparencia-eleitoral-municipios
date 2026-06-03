"""Testes dos indicadores (unitários, sem rede)."""
import unittest

from eleitoral import indicators
from eleitoral.crosswalk import Municipio
from eleitoral.eleitorado import EleitoradoMunicipio


def _mun(cd_tse, cd_ibge, nome):
    return Municipio(cd_tse=cd_tse, cd_ibge=cd_ibge, sg_uf="PI",
                     nome_tse=nome, nome_ibge=nome)


class TestIndicadores(unittest.TestCase):
    def setUp(self):
        # 5 municípios com razões 0.5, 0.6, 0.7, 0.9 e 3.0
        self.ele = {}
        self.mapa = {}
        self.est = {}
        self.censo = {}
        dados = [("A", "2200001", 50), ("B", "2200002", 60), ("C", "2200003", 70),
                 ("D", "2200004", 90), ("E", "2200005", 300)]
        for cd_tse, cd_ibge, ele in dados:
            self.ele[cd_tse] = EleitoradoMunicipio(cd_tse=cd_tse, nome_tse=cd_tse, eleitores=ele)
            self.mapa[cd_tse] = _mun(cd_tse, cd_ibge, cd_tse)
            self.est[cd_ibge] = {"2024": 95, "2025": 100}
            self.censo[cd_ibge] = {"share_16mais": 0.8}
        self.inds, self.limiares_uf, self.limiar_nacional = indicators.calcular(
            self.ele, self.mapa, self.est, ["2024", "2025"], self.censo,
            transferencias={"E": 42},
        )
        self.limiar = self.limiares_uf["PI"]  # todos os municípios de teste são PI
        self.by = {i.cd_tse: i for i in self.inds}

    def test_razao_total(self):
        self.assertAlmostEqual(self.by["A"].razao_total, 0.5)
        self.assertAlmostEqual(self.by["E"].razao_total, 3.0)

    def test_razao_16mais_usa_share_do_censo(self):
        # 50 / (100 * 0.8) = 0.625
        self.assertAlmostEqual(self.by["A"].razao_16mais, 0.625)

    def test_crescimento_populacional(self):
        # (100-95)/95 = 5.263%
        self.assertAlmostEqual(self.by["A"].crescimento_pop_pct, 5.2631, places=3)

    def test_flag_mais_eleitores_que_pop(self):
        self.assertTrue(self.by["E"].mais_eleitores_que_pop)
        self.assertFalse(self.by["A"].mais_eleitores_que_pop)

    def test_flag_limiar_tse_80pct(self):
        self.assertTrue(self.by["D"].acima_limiar_tse)   # 0.9 > 0.8
        self.assertFalse(self.by["C"].acima_limiar_tse)  # 0.7

    def test_outlier_uf_tukey(self):
        # Q1=0.6, Q3=0.9, IQR=0.3 -> limiar = 0.9 + 1.5*0.3 = 1.35
        self.assertAlmostEqual(self.limiar, 1.35, places=6)
        self.assertTrue(self.by["E"].outlier_uf)   # 3.0 > 1.35
        self.assertFalse(self.by["D"].outlier_uf)  # 0.9 < 1.35

    def test_outlier_nacional(self):
        # todos os municípios de teste são PI -> limiar nacional == limiar PI
        self.assertAlmostEqual(self.limiar_nacional, 1.35, places=6)
        self.assertTrue(self.by["E"].outlier_nacional)
        self.assertFalse(self.by["D"].outlier_nacional)

    def test_transferencias_propagadas(self):
        self.assertEqual(self.by["E"].transferencias_qtd, 42)
        self.assertIsNone(self.by["A"].transferencias_qtd)

    def test_ordenacao_por_razao_desc(self):
        self.assertEqual(self.inds[0].cd_tse, "E")


if __name__ == "__main__":
    unittest.main()
