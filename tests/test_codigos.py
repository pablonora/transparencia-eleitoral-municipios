"""Regressão: códigos de município com zero à esquerda devem casar o join.

Comparecimento e Transferência zero-preenchem o CD_MUNICIPIO ('06041'); o
eleitorado/crosswalk usam sem zero ('6041'). Se não normalizar, ~520 municípios
pequenos somem silenciosamente do cruzamento. Estes testes fixam a normalização.
"""
import io
import unittest
import zipfile

from eleitoral import comparecimento, resultados, transferencia


def _zip(nome_csv, texto):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr(nome_csv, texto.encode("latin-1"))
    buf.seek(0)
    return buf


class TestNormalizacaoCodigo(unittest.TestCase):
    def test_comparecimento_tira_zero_a_esquerda(self):
        csv = (
            "NR_TURNO;SG_UF;CD_MUNICIPIO;QT_APTOS;QT_COMPARECIMENTO;QT_ABSTENCAO\n"
            "1;AP;06041;100;80;20\n"
            "2;AP;06041;100;50;50\n"   # 2º turno deve ser ignorado
        )
        r = comparecimento.agregar(_zip("comp_AP.csv", csv), turno="1", uf=None)
        self.assertIn("6041", r)          # normalizado, sem zero à esquerda
        self.assertNotIn("06041", r)
        self.assertEqual(r["6041"]["aptos"], 100)
        self.assertEqual(r["6041"]["abstencao"], 20)

    def test_ignora_arquivo_brasil(self):
        # o zip real tem 27 UFs + 1 BRASIL; somar o BRASIL dobraria tudo.
        linha = "1;AP;06041;100;80;20\n"
        head = "NR_TURNO;SG_UF;CD_MUNICIPIO;QT_APTOS;QT_COMPARECIMENTO;QT_ABSTENCAO\n"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("perfil_2024_AP.csv", (head + linha).encode("latin-1"))
            z.writestr("perfil_2024_BRASIL.csv", (head + linha).encode("latin-1"))
        buf.seek(0)
        r = comparecimento.agregar(buf, turno="1", uf=None)
        self.assertEqual(r["6041"]["aptos"], 100)   # contado UMA vez, não 200

    def test_transferencia_tira_zero_a_esquerda(self):
        csv = (
            "SG_UF_ORIGEM;CD_MUNICIPIO_ORIGEM;SG_UF_DESTINO;CD_MUNICIPIO_DESTINO;QT_TRANSFERENCIA\n"
            "SP;01007;AP;06041;7\n"
        )
        r = transferencia.agregar_uf(_zip("transf.csv", csv), uf=None)
        self.assertIn("6041", r)
        self.assertEqual(r["6041"]["entradas"], 7)
        self.assertIn("1007", r)          # origem também normalizada
        self.assertEqual(r["1007"]["saidas"], 7)


class TestResultadosPrefeito(unittest.TestCase):
    HEAD = ("NR_TURNO;SG_UF;CD_MUNICIPIO;DS_CARGO;SQ_CANDIDATO;"
            "NM_URNA_CANDIDATO;QT_VOTOS_NOMINAIS\n")

    def test_margem_e_codigo_normalizado(self):
        csv = self.HEAD + (
            "1;AP;06041;Prefeito;111;ANA;100\n"
            "1;AP;06041;Prefeito;111;ANA;50\n"      # 2ª zona: soma 150
            "1;AP;06041;Prefeito;222;BIA;90\n"
            "1;AP;06041;Vereador;333;CICO;9999\n"    # cargo diferente: ignora
        )
        r = resultados.agregar_prefeito(_zip("votos_AP.csv", csv), uf=None)
        self.assertIn("6041", r)                     # zero à esquerda removido
        e = r["6041"]
        self.assertEqual(e["vencedor"], "ANA")
        self.assertEqual(e["votos_venc"], 150)
        self.assertEqual(e["margem"], 60)            # 150 − 90
        self.assertEqual(e["turno"], "1")

    def test_usa_turno_decisivo(self):
        csv = self.HEAD + (
            "1;SP;71072;Prefeito;1;A;1000\n"
            "1;SP;71072;Prefeito;2;B;900\n"
            "1;SP;71072;Prefeito;3;C;300\n"          # 3 candidatos no 1º turno
            "2;SP;71072;Prefeito;1;A;1100\n"          # 2º turno decide
            "2;SP;71072;Prefeito;2;B;1050\n"
        )
        r = resultados.agregar_prefeito(_zip("votos_SP.csv", csv), uf=None)
        e = r["71072"]
        self.assertEqual(e["turno"], "2")
        self.assertEqual(e["margem"], 50)            # 1100 − 1050 (2º turno)
        self.assertEqual(e["n_cand"], 2)             # turno decisivo (2º)
        self.assertEqual(e["n_cand_1t"], 3)          # concorrência real (1º turno)


class TestBrancosNulos(unittest.TestCase):
    HEAD = ("NR_TURNO;SG_UF;CD_MUNICIPIO;NM_MUNICIPIO;DS_CARGO;QT_COMPARECIMENTO;"
            "QT_TOTAL_VOTOS_VALIDOS;QT_VOTOS_BRANCOS;QT_TOTAL_VOTOS_NULOS\n")

    def test_soma_zonas_prefeito_1turno(self):
        csv = self.HEAD + (
            "1;AP;06041;X;Prefeito;100;80;5;15\n"
            "1;AP;06041;X;Prefeito;100;90;4;6\n"      # 2ª zona: soma
            "1;AP;06041;X;Vereador;100;70;10;20\n"    # cargo diferente: ignora
            "2;AP;06041;X;Prefeito;999;999;9;9\n"     # 2º turno: ignora (turno=1)
        )
        r = resultados.agregar_brancos_nulos(_zip("det_AP.csv", csv), uf=None, turno="1")
        self.assertIn("6041", r)                      # zero à esquerda removido
        e = r["6041"]
        self.assertEqual(e["comparecimento"], 200)
        self.assertEqual(e["validos"], 170)
        self.assertEqual(e["brancos"], 9)             # 5 + 4
        self.assertEqual(e["nulos"], 21)              # 15 + 6
        self.assertEqual(e["validos"] + e["brancos"] + e["nulos"], e["comparecimento"])

    def test_ignora_arquivo_brasil(self):
        linha = "1;AP;06041;X;Prefeito;100;80;5;15\n"
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as z:
            z.writestr("detalhe_2024_AP.csv", (self.HEAD + linha).encode("latin-1"))
            z.writestr("detalhe_2024_BRASIL.csv", (self.HEAD + linha).encode("latin-1"))
        buf.seek(0)
        r = resultados.agregar_brancos_nulos(buf, uf=None, turno="1")
        self.assertEqual(r["6041"]["comparecimento"], 100)   # contado UMA vez


if __name__ == "__main__":
    unittest.main()
