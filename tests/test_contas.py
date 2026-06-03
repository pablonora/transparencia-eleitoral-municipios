"""Prestação de contas: parsing BR, seleção de membros por-UF e agregação.

Fixam os gotchas conhecidos: valor em formato brasileiro (1.234,56), código do
município com zero à esquerda (SG_UE '06041' -> '6041') e exclusão dos arquivos
_BRASIL/pagas/doador (que dobrariam ou poluiriam a contagem).
"""
import csv
import io
import unittest

from eleitoral import contas


class TestParseValor(unittest.TestCase):
    def test_formato_brasileiro(self):
        self.assertEqual(contas.parse_valor("1.234.567,89"), 1234567.89)
        self.assertEqual(contas.parse_valor("913,04"), 913.04)
        self.assertEqual(contas.parse_valor("5000,00"), 5000.0)

    def test_vazio_e_lixo(self):
        self.assertEqual(contas.parse_valor(""), 0.0)
        self.assertEqual(contas.parse_valor('"  "'), 0.0)
        self.assertEqual(contas.parse_valor("#NULO#"), 0.0)


class TestCargoBucket(unittest.TestCase):
    def test_buckets(self):
        self.assertEqual(contas.cargo_bucket("Prefeito"), "prefeito")
        self.assertEqual(contas.cargo_bucket("Vereador"), "vereador")
        self.assertEqual(contas.cargo_bucket("Vice-Prefeito"), "outro")


class TestSelecaoMembros(unittest.TestCase):
    def test_so_por_uf_dos_prefixos_certos(self):
        nomes = [
            "receitas_candidatos_2024_AP.csv",
            "despesas_contratadas_candidatos_2024_AP.csv",
            "receitas_candidatos_2024_BRASIL.csv",          # exclui (concatenação)
            "despesas_contratadas_candidatos_2024_BRASIL.csv",
            "despesas_pagas_candidatos_2024_AP.csv",        # exclui (sem município)
            "receitas_candidatos_doador_originario_2024_AP.csv",  # exclui
            "leiame_receitas-candidatos.pdf",
        ]
        sel = contas.membros_por_uf(nomes, 2024)
        self.assertEqual(sorted(sel), [
            "despesas_contratadas_candidatos_2024_AP.csv",
            "receitas_candidatos_2024_AP.csv",
        ])

    def test_ano_diferente_ignorado(self):
        self.assertEqual(contas.membros_por_uf(["receitas_candidatos_2020_AP.csv"], 2024), [])


def _reader(texto):
    return csv.reader(io.StringIO(texto), delimiter=";")


class TestAgregacao(unittest.TestCase):
    REC = ("SG_UF;SG_UE;NM_UE;DS_CARGO;SQ_CANDIDATO;VR_RECEITA\n"
           "AP;06041;X;Prefeito;111;1.000,00\n"
           "AP;06041;X;Prefeito;111;500,00\n"      # mesmo candidato: soma, 1 só na contagem
           "AP;06041;X;Vereador;222;250,50\n")
    DES = ("SG_UF;SG_UE;NM_UE;DS_CARGO;SQ_CANDIDATO;VR_DESPESA_CONTRATADA\n"
           "AP;06041;X;Prefeito;111;800,00\n"
           "AP;06041;X;Vereador;222;200,00\n")

    def test_agrega_por_municipio_e_cargo(self):
        acc = {}
        contas._agregar_membro(_reader(self.REC), "receitas_candidatos", acc, None)
        contas._agregar_membro(_reader(self.DES), "despesas_contratadas_candidatos", acc, None)
        out = contas._finalizar(acc)
        self.assertIn("6041", out)              # zero à esquerda removido
        self.assertNotIn("06041", out)
        m = out["6041"]
        self.assertEqual(m["receita_total"], 1750.50)
        self.assertEqual(m["despesa_total"], 1000.00)
        self.assertEqual(m["receita_prefeito"], 1500.00)
        self.assertEqual(m["despesa_vereador"], 200.00)
        self.assertEqual(m["n_candidatos"], 2)        # 111 e 222
        self.assertEqual(m["n_cand_prefeito"], 1)     # só 111

    def test_filtro_por_uf(self):
        rec = ("SG_UF;SG_UE;NM_UE;DS_CARGO;SQ_CANDIDATO;VR_RECEITA\n"
               "AP;06041;X;Prefeito;111;100,00\n"
               "SP;71072;Y;Prefeito;222;999,00\n")
        acc = {}
        contas._agregar_membro(_reader(rec), "receitas_candidatos", acc, "AP")
        out = contas._finalizar(acc)
        self.assertEqual(set(out), {"6041"})          # SP descartado pelo filtro
        self.assertEqual(out["6041"]["receita_total"], 100.0)


if __name__ == "__main__":
    unittest.main()
