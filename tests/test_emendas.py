"""Emendas (TransfereGov — transferências especiais): normalização de nome,
resolução nome+UF → IBGE (com apelidos curados) e área principal.

Garante o invariante crítico do join: beneficiário que não é município ou que
não casa retorna None (descarte seguro) — NUNCA um match fabricado.
"""
import unittest

from eleitoral import config, emendas


class TestNormalizar(unittest.TestCase):
    def test_acentos_pontuacao(self):
        self.assertEqual(emendas.normalizar("São Miguel d'Oeste"), "SAO MIGUEL D OESTE")
        self.assertEqual(emendas.normalizar("MOGI-MIRIM"), "MOGI MIRIM")
        self.assertEqual(emendas.normalizar("  Açu  "), "ACU")


class TestResolverIbge(unittest.TestCase):
    # índice mínimo: um município oficial + os apelidos reais do config
    IDX = {("PI", "TERESINA"): "2211001", **config.EMENDAS_APELIDOS}

    def test_match_exato(self):
        self.assertEqual(emendas.resolver_ibge("MUNICIPIO DE TERESINA", "PI", self.IDX),
                         "2211001")

    def test_prefixo_e_sufixo(self):
        # "MULUNGU PREFEITURA MUNICIPAL" deve cair em MULUNGU (sufixo removido)
        idx = {("CE", "MULUNGU"): "2308609"}
        self.assertEqual(
            emendas.resolver_ibge("MUNICIPIO DE MULUNGU PREFEITURA MUNICIPAL", "CE", idx),
            "2308609")

    def test_apelido_renomeado(self):
        # Campo Grande/RN é o antigo Augusto Severo (2401305) na tabela curada
        self.assertEqual(emendas.resolver_ibge("MUNICIPIO DE CAMPO GRANDE", "RN", self.IDX),
                         "2401305")

    def test_estado_nao_e_municipio(self):
        self.assertIsNone(emendas.resolver_ibge("ESTADO DO PIAUI", "PI", self.IDX))

    def test_sem_correspondencia_descarta(self):
        # município inexistente no índice → None (nunca chuta)
        self.assertIsNone(
            emendas.resolver_ibge("MUNICIPIO DE LUGAR NENHUM", "PI", self.IDX))

    def test_uf_errada_nao_casa(self):
        # mesmo nome, UF diferente → não casa (evita colisão entre UFs)
        self.assertIsNone(emendas.resolver_ibge("MUNICIPIO DE TERESINA", "SP", self.IDX))


class TestAreaPrincipal(unittest.TestCase):
    def test_primeira_funcao(self):
        chave, rotulo = emendas._area_principal("10-Saúde / 302-Assistência Hospitalar")
        self.assertEqual(chave, "saude")
        self.assertEqual(rotulo, "Saúde")

    def test_funcao_nao_mapeada_vira_outras(self):
        chave, _ = emendas._area_principal("99-Função Estranha / 001-Sub")
        self.assertEqual(chave, "outras")

    def test_vazio(self):
        self.assertEqual(emendas._area_principal("")[0], "outras")


if __name__ == "__main__":
    unittest.main()
