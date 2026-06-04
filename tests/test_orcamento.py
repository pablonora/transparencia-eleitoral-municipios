"""Orçamento (SICONFI): parsing da DCA — despesa por função e receita.

Fixa: total = "Despesas Exceto Intraorçamentárias"; funções são linhas "NN - "
(2 dígitos), subfunções "NN.SSS - " são ignoradas; receita = linha
"TOTAL DAS RECEITAS" com deduções subtraídas.
"""
import unittest

from eleitoral import orcamento


class TestParseDespesaFuncao(unittest.TestCase):
    ITEMS = [
        {"coluna": "Despesas Empenhadas", "cod_conta": "TotalDespesas",
         "conta": "Despesas Exceto Intraorçamentárias", "valor": 1000.0},
        {"coluna": "Despesas Empenhadas", "cod_conta": "TotalDespesas",
         "conta": "10 - Saúde", "valor": 400.0},
        {"coluna": "Despesas Empenhadas", "cod_conta": "TotalDespesas",
         "conta": "12 - Educação", "valor": 350.0},
        {"coluna": "Despesas Empenhadas", "cod_conta": "TotalDespesas",
         "conta": "10.301 - Atenção Básica", "valor": 200.0},  # subfunção: ignora
        {"coluna": "Despesas Liquidadas", "cod_conta": "TotalDespesas",
         "conta": "10 - Saúde", "valor": 999.0},                # outra coluna: ignora
    ]

    def test_total_e_funcoes(self):
        total, funcs = orcamento.parse_despesa_funcao(self.ITEMS)
        self.assertEqual(total, 1000.0)
        self.assertEqual(funcs, {"10": 400.0, "12": 350.0})   # sem subfunção/outra coluna


class TestParseReceita(unittest.TestCase):
    def test_bruta_e_liquida(self):
        items = [
            {"cod_conta": "TotalReceitas", "conta": "TOTAL DAS RECEITAS (III)",
             "coluna": "Receitas Brutas Realizadas", "valor": 5000.0},
            {"cod_conta": "TotalReceitas", "conta": "TOTAL DAS RECEITAS (III)",
             "coluna": "Deduções - FUNDEB", "valor": 300.0},
            {"cod_conta": "TotalReceitas", "conta": "TOTAL DAS RECEITAS (III)",
             "coluna": "Outras Deduções da Receita", "valor": 200.0},
        ]
        bruta, liquida = orcamento.parse_receita(items)
        self.assertEqual(bruta, 5000.0)
        self.assertEqual(liquida, 4500.0)            # 5000 − 300 − 200

    def test_sem_receita(self):
        bruta, liquida = orcamento.parse_receita([])
        self.assertIsNone(bruta)
        self.assertIsNone(liquida)


if __name__ == "__main__":
    unittest.main()
