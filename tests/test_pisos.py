"""Pisos constitucionais (SICONFI/RREO Anexo 14): parsing + normalização dos %.

A API devolve o percentual de forma INCONSISTENTE entre entes: uns em fração
(mínimo 0,15 / aplicado 0,14), outros em ponto percentual (15 / 24,11) e alguns
lançam valor em R$ por engano. Fixamos a calibração pelo mínimo + plausibilidade.
"""
import unittest

from eleitoral import config, pisos


class TestNormalizarPct(unittest.TestCase):
    def test_fracao_calibrada_pelo_minimo(self):
        # Itabaiana-SE: mínimo 0,15 (fração) e aplicado 0,14 -> 14,0%
        self.assertEqual(pisos.normalizar_pct(0.14, 0.15), 14.0)
        self.assertEqual(pisos.normalizar_pct(0.27, 0.25), 27.0)

    def test_percentual_calibrado_pelo_minimo(self):
        # São Paulo: mínimo 25 (ponto percentual) e aplicado 24,11 -> 24,11
        self.assertEqual(pisos.normalizar_pct(24.11, 25), 24.11)
        self.assertEqual(pisos.normalizar_pct(15.0, 15), 15.0)

    def test_fallback_sem_minimo(self):
        self.assertEqual(pisos.normalizar_pct(0.14, None), 14.0)   # fração
        self.assertEqual(pisos.normalizar_pct(24.11, None), 24.11)  # já em pp

    def test_lixo_descartado(self):
        self.assertIsNone(pisos.normalizar_pct(50653366.82, 39898885.9))  # R$ no lugar de %
        self.assertIsNone(pisos.normalizar_pct(124.95, 15))               # > 100 pp
        self.assertIsNone(pisos.normalizar_pct(None, 15))                 # sem valor


class TestParsePisos(unittest.TestCase):
    def _itens(self, ap_s, min_s, ap_e, min_e):
        C = config
        return [
            {"cod_conta": C.PISOS_COD_SAUDE, "coluna": C.PISOS_COLUNA, "valor": ap_s},
            {"cod_conta": C.PISOS_COD_SAUDE, "coluna": C.PISOS_COLUNA_MIN, "valor": min_s},
            {"cod_conta": C.PISOS_COD_EDUCACAO, "coluna": C.PISOS_COLUNA, "valor": ap_e},
            {"cod_conta": C.PISOS_COD_EDUCACAO, "coluna": C.PISOS_COLUNA_MIN, "valor": min_e},
            {"cod_conta": "Outra", "coluna": C.PISOS_COLUNA, "valor": 99.9},  # ignora
        ]

    def test_fracao(self):
        p = pisos.parse_pisos(self._itens(0.14, 0.15, 0.27, 0.25))
        self.assertEqual(p, {"saude_pct": 14.0, "educacao_pct": 27.0})

    def test_percentual(self):
        p = pisos.parse_pisos(self._itens(24.11, 15, 26.05, 25))
        self.assertEqual(p, {"saude_pct": 24.11, "educacao_pct": 26.05})

    def test_lixo_some(self):
        # saúde lixo (R$), educação ok -> só educação sai
        p = pisos.parse_pisos(self._itens(50653366.82, 15, 26.05, 25))
        self.assertEqual(p, {"educacao_pct": 26.05})

    def test_sem_dados(self):
        self.assertEqual(pisos.parse_pisos([]), {})


if __name__ == "__main__":
    unittest.main()
