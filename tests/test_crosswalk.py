"""Testes do crosswalk oficial TSE<->IBGE.

Garante o que mais importa: o join nunca silencia um município sem par.
Usa o arquivo bruto real (pequeno, versionado) em data/raw/crosswalk.
"""
import unittest

from eleitoral import config, crosswalk


class TestCrosswalk(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.zip = config.RAW / "crosswalk" / "municipio_tse_ibge.zip"
        if not cls.zip.exists():
            raise unittest.SkipTest("crosswalk não baixado (rode o pipeline antes)")
        cls.mapa = crosswalk.carregar(cls.zip, uf="PI")

    def test_piaui_tem_224_municipios(self):
        self.assertEqual(len(self.mapa), 224)

    def test_codigo_ibge_tem_7_digitos_e_comeca_com_22(self):
        for m in self.mapa.values():
            self.assertEqual(len(m.cd_ibge), 7, m)
            self.assertTrue(m.cd_ibge.startswith("22"), m)

    def test_cobertura_completa_nao_levanta(self):
        crosswalk.validar_cobertura(set(self.mapa), self.mapa)  # não deve lançar

    def test_codigo_orfao_aborta_o_join(self):
        with self.assertRaises(AssertionError):
            crosswalk.validar_cobertura({"99999"}, self.mapa)


if __name__ == "__main__":
    unittest.main()
