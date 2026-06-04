"""Pisos constitucionais (SICONFI/RREO Anexo 14): parsing dos % de aplicação.

Fixa: lê só as linhas-chave (saúde ASPS / educação MDE) na coluna
"% Aplicado Até o Bimestre"; ignora outras colunas/contas; arredonda; e descarta
valores não numéricos.
"""
import unittest

from eleitoral import config, pisos


class TestParsePisos(unittest.TestCase):
    def _itens(self):
        return [
            {"coluna": config.PISOS_COLUNA, "cod_conta": config.PISOS_COD_SAUDE,
             "valor": 24.114},
            {"coluna": config.PISOS_COLUNA, "cod_conta": config.PISOS_COD_EDUCACAO,
             "valor": 26.05},
            # mesma conta, outra coluna (mínimo a aplicar): deve ser ignorada
            {"coluna": "% Mínimo a Aplicar no Exercício",
             "cod_conta": config.PISOS_COD_SAUDE, "valor": 15},
            # linha qualquer: ignora
            {"coluna": config.PISOS_COLUNA, "cod_conta": "OutraContaQualquer",
             "valor": 99.9},
        ]

    def test_extrai_saude_e_educacao(self):
        p = pisos.parse_pisos(self._itens())
        self.assertEqual(p["saude_pct"], 24.11)     # arredonda 24.114 -> 24.11
        self.assertEqual(p["educacao_pct"], 26.05)

    def test_sem_dados(self):
        self.assertEqual(pisos.parse_pisos([]), {})

    def test_ignora_valor_nao_numerico(self):
        itens = [{"coluna": config.PISOS_COLUNA, "cod_conta": config.PISOS_COD_SAUDE,
                  "valor": None}]
        self.assertEqual(pisos.parse_pisos(itens), {})


if __name__ == "__main__":
    unittest.main()
