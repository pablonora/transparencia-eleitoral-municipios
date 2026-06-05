"""Configuração central do pipeline.

Tudo que é "parâmetro" (UF alvo, ano-base, limiar, URLs oficiais) vive aqui,
para que o restante do código não tenha valores mágicos espalhados.

Stdlib apenas — nenhuma dependência externa.
"""
from __future__ import annotations

from pathlib import Path

# ---------------------------------------------------------------------------
# Caminhos
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
RAW = DATA / "raw"
INTERIM = DATA / "interim"
PROCESSED = DATA / "processed"
MANIFEST = ROOT / "manifest" / "provenance.json"
DOCS_DATA = ROOT / "docs" / "data"

# ---------------------------------------------------------------------------
# Escopo
# ---------------------------------------------------------------------------
# UF_SIGLA = None  -> Brasil inteiro (todos os municípios)
# UF_SIGLA = "PI"  -> apenas o Piauí (com UF_CODIGO_IBGE correspondente)
UF_SIGLA = None
UF_CODIGO_IBGE = "22"  # usado apenas quando UF_SIGLA != None (filtro do IBGE)

# Sigla do "exterior" no TSE (eleitores fora do país): sem população IBGE,
# logo excluído do cruzamento município×população.
UF_EXTERIOR = "ZZ"

# Códigos IBGE das 27 UFs (para paginar consultas grandes do Censo por UF,
# respeitando o limite de células da API).
UF_CODIGOS_IBGE = [
    "11", "12", "13", "14", "15", "16", "17", "21", "22", "23", "24", "25",
    "26", "27", "28", "29", "31", "32", "33", "35", "41", "42", "43", "50",
    "51", "52", "53",
]


def escopo_slug() -> str:
    """Nome-base dos arquivos de saída: 'brasil' ou a sigla minúscula da UF."""
    return "brasil" if UF_SIGLA is None else UF_SIGLA.lower()


def ibge_localidades() -> str:
    """N6 (todos os municípios) ou N6 dentro de uma UF (N3)."""
    if UF_SIGLA is None:
        return "N6"
    return f"N6[N3[{UF_CODIGO_IBGE}]]"

# Limiar de destaque (outlier). O TSE pode instaurar revisão de eleitorado
# quando o eleitorado supera proporção elevada da população. Mantido
# CONFIGURÁVEL e SEMPRE acompanhado da nota explicativa na interface.
# Ver README (seção "Limiar e enquadramento legal").
LIMIAR_REVISAO = 0.80  # eleitorado > 80% da população estimada

# Nota neutra exibida em todo outlier (guardrail de linguagem).
NOTA_NEUTRA = (
    "Diferenças podem decorrer de domicílio eleitoral (≠ domicílio civil), "
    "migração com manutenção do título e do fato de a população do IBGE ser "
    "uma estimativa. Razão alta não indica irregularidade por si só."
)

# ---------------------------------------------------------------------------
# Fontes oficiais (URLs confirmadas no Portal de Dados Abertos do TSE e na
# API de Agregados do IBGE em 2026-06). O downloader resolve o restante.
# ---------------------------------------------------------------------------

# TSE — Eleitorado Atual (perfil por município; CSV nacional dentro do ZIP).
TSE_ELEITORADO_URL = (
    "https://cdn.tse.jus.br/estatistica/sead/odsele/"
    "perfil_eleitorado/perfil_eleitorado_ATUAL.zip"
)
TSE_ELEITORADO_DATASET = "Eleitorado Atual"

# TSE — Comparecimento e Abstenção (por eleição; CSVs por UF dentro do ZIP).
# Usamos o 1º turno (todos os municípios têm; o 2º só alguns).
TSE_COMPARECIMENTO_ANOS = [2022, 2024]
TSE_COMPARECIMENTO_TURNO = "1"
def tse_comparecimento_url(ano: int) -> str:
    return (
        "https://cdn.tse.jus.br/estatistica/sead/odsele/"
        f"perfil_comparecimento_abstencao/perfil_comparecimento_abstencao_{ano}.zip"
    )

# Série histórica do TAMANHO do eleitorado: usamos o eleitorado APTO (QT_APTOS) de
# cada eleição, do MESMO dataset de comparecimento (1º turno; arquivos ~100–200 MB/
# ano, por-UF). Anos com eleição disponíveis no Portal (gerais e municipais).
# Definição CONSISTENTE entre os pontos (apto a votar naquela eleição) — ver
# evo_nota no front. Os arquivos extras são baixados sob demanda (cache em raw).
TSE_ELEITORADO_SERIE_ANOS = [2014, 2016, 2018, 2020, 2022, 2024]
def tse_comparecimento_anos_todos() -> list[int]:
    """União dos anos de comparecimento exibidos + anos da série (sem repetição)."""
    return sorted(set(TSE_COMPARECIMENTO_ANOS) | set(TSE_ELEITORADO_SERIE_ANOS))

# TSE — Resultado da eleição (votação por candidato). Usado para a MARGEM de
# vitória do prefeito, cruzada de forma FACTUAL (não causal) com as
# transferências do MESMO ano. Eleição municipal 2024.
TSE_ELEICAO_ANO = 2024
def tse_votos_url(ano: int) -> str:
    return (
        "https://cdn.tse.jus.br/estatistica/sead/odsele/"
        f"votacao_candidato_munzona/votacao_candidato_munzona_{ano}.zip"
    )

# TSE — Detalhe da votação por município e zona: traz votos VÁLIDOS, BRANCOS e
# NULOS por município/cargo/turno (o que a votação por candidato não tem, pois
# branco/nulo não são candidatos). Arquivo pequeno (~1,5 MB). Usamos o cargo
# Prefeito, 1º turno (todos os municípios têm), para o bloco da eleição 2024.
def tse_detalhe_url(ano: int) -> str:
    return (
        "https://cdn.tse.jus.br/estatistica/sead/odsele/"
        f"detalhe_votacao_munzona/detalhe_votacao_munzona_{ano}.zip"
    )

# Nota: mostramos o PARTIDO do governante eleito (factual, do TSE). NÃO
# classificamos ideologia (esquerda/direita): não há fonte oficial por político,
# e o rótulo do partido frequentemente não corresponde ao posicionamento local —
# o que comprometeria a neutralidade do painel.

# TSE — Crosswalk OFICIAL TSE <-> IBGE (fonte autoritativa da correspondência).
TSE_CROSSWALK_URL = (
    "https://cdn.tse.jus.br/estatistica/sead/odsele/"
    "municipio_tse_ibge/municipio_tse_ibge.zip"
)
TSE_CROSSWALK_DATASET = "Códigos oficiais de UF e municípios segundo o TSE e o IBGE"

# TSE — Transferências do eleitorado (sinal mais forte que o ratio bruto).
# Usamos o ano mais recente fechado por padrão; configurável.
TSE_TRANSFERENCIA_ANO = 2025
TSE_TRANSFERENCIA_URL = (
    "https://cdn.tse.jus.br/estatistica/sead/odsele/"
    "perfil_eleitor_transferencia/"
    f"perfil_eleitorado_transferencia_{TSE_TRANSFERENCIA_ANO}.zip"
)
TSE_TRANSFERENCIA_DATASET = "Transferência do eleitorado"

# TSE — Prestação de contas eleitorais (receitas e despesas dos CANDIDATOS),
# eleição municipal 2024. ATENÇÃO: o ZIP oficial tem ~1,28 GB porque inclui os
# arquivos `_BRASIL.csv` (concatenação nacional, que ainda DOBRARIA a contagem,
# o mesmo gotcha de votos/comparecimento). Por isso NÃO baixamos o ZIP inteiro:
# o módulo `contas` lê por HTTP Range apenas os membros POR-UF que interessam —
# `receitas_candidatos_2024_{UF}.csv` (arrecadação) e
# `despesas_contratadas_candidatos_2024_{UF}.csv` (despesa declarada total) —
# e agrega em streaming. `despesas_pagas_*` é descartado (não traz o município),
# assim como `*_doador_originario_*` e os `_BRASIL.csv`.
#
# Enquadramento: são valores DECLARADOS na prestação de contas; não refletem
# julgamento/aprovação das contas pelo TSE nem indicam irregularidade.
TSE_CONTAS_ANO = 2024
TSE_CONTAS_URL = (
    "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/"
    f"prestacao_de_contas_eleitorais_candidatos_{TSE_CONTAS_ANO}.zip"
)
TSE_CONTAS_DATASET = "Prestação de contas eleitorais — candidatos"
# Membros por-UF que lemos (prefixos); o {UF} é cada sigla das 27 unidades.
TSE_CONTAS_MEMBROS = ("receitas_candidatos", "despesas_contratadas_candidatos")
# Nota colada ao dado de prestação de contas (guardrail de linguagem).
NOTA_CONTAS = (
    "Valores declarados na prestação de contas eleitorais de 2024 (candidatos). "
    "São o que cada campanha informou ao TSE — não refletem o julgamento das "
    "contas e não indicam, por si sós, irregularidade. Gasto maior não significa "
    "compra de votos: o voto é secreto."
)

# Tesouro Nacional — SICONFI (orçamento PÚBLICO municipal): receita e despesa por
# função (saúde, educação, segurança…) da PREFEITURA. Fonte DISTINTA da prestação
# de contas de campanha (TSE): dinheiro público ≠ dinheiro de campanha. Não
# misturar na interface.
#
# Declaração de Contas Anuais (DCA): Anexo I-E = Despesa por Função; Anexo I-C =
# Receita. API REST pública (sem autenticação), por ente (código IBGE de 7 díg),
# um anexo por requisição. Não há bulk estável (o FINBRA fica atrás de página
# JSF); seguimos o padrão sancionado de consultar por ente, com concorrência
# limitada + cache (≈22 min uma vez; reaproveitado por --offline).
SICONFI_DCA_URL = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/dca"
SICONFI_PUBLISHER = "Tesouro Nacional — SICONFI"
SICONFI_DATASET = "SICONFI — Declaração de Contas Anuais (DCA) dos municípios"
ORCAMENTO_ANO = 2024
ORCAMENTO_WORKERS = 12  # requisições concorrentes (educado, com retries)
# Funções orçamentárias que destacamos (código → chave interna). O total e as
# demais funções entram em "outras".
ORCAMENTO_FUNCOES = {
    "10": "saude",
    "12": "educacao",
    "06": "seguranca",
    "08": "assistencia",
    "15": "urbanismo",
    "04": "administracao",
    "26": "transporte",
    "09": "previdencia",
}
# Ressalva colada ao dado de orçamento público (guardrail de linguagem).
NOTA_ORCAMENTO = (
    "Orçamento público da PREFEITURA declarado ao SICONFI/Tesouro Nacional "
    f"(Declaração de Contas Anuais de {ORCAMENTO_ANO}). São despesas EMPENHADAS e "
    "receitas realizadas informadas pelo próprio município — a cobertura depende "
    "do envio de cada prefeitura e os valores não refletem julgamento de contas. "
    "Não confundir com gastos de campanha (TSE): aqui é dinheiro público. "
    "Segurança pública é majoritariamente função estadual — muitos municípios "
    "gastam pouco ou nada nessa função."
)

# Tesouro Nacional — SICONFI / RREO (Relatório Resumido de Execução Orçamentária),
# Anexo 14 = "Demonstrativo Simplificado do RREO". No 6º bimestre (fechamento do
# ano) ele traz, numa ÚNICA requisição por ente, os PERCENTUAIS de aplicação
# constitucional mínima:
#   • Saúde (ASPS): % das receitas de impostos aplicado em Ações e Serviços
#     Públicos de Saúde — piso municipal de 15% (EC 29/2000).
#   • Educação (MDE): % das receitas de impostos aplicado em Manutenção e
#     Desenvolvimento do Ensino — piso de 25% (art. 212 da Constituição).
# DIFERE do DCA (despesa por função): aqui é a aplicação mínima constitucional,
# calculada sobre a RECEITA DE IMPOSTOS+transferências (não sobre a despesa total).
# Mesmo padrão de consulta por ente (concorrência limitada + cache) do orçamento.
SICONFI_RREO_URL = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rreo"
SICONFI_RREO_ANEXO = "RREO-Anexo 14"
SICONFI_RREO_PERIODO = 6  # 6º bimestre = consolidado do ano
SICONFI_RREO_DATASET = "SICONFI — RREO Anexo 14 (Demonstrativo Simplificado)"
PISOS_ANO = 2024
PISOS_COLUNA = "% Aplicado Até o Bimestre"
# Coluna do MÍNIMO (15%/25%): usada para CALIBRAR a unidade do ente, porque a API
# devolve o percentual de forma inconsistente — uns em fração (0,15 / 0,14), outros
# em ponto percentual (15 / 24,11), e alguns entes lançam valor em R$ por engano.
PISOS_COLUNA_MIN = "% Mínimo a Aplicar no Exercício"
PISOS_COD_SAUDE = "AplicacaoTotalDasDespesasComAcoesEServicosPublicosDeSaude"
PISOS_COD_EDUCACAO = (
    "MinimoAnualDasReceitasDeImpostosNaManutencaoEDesenvolvimento"
    "DoEnsinoDemonstrativoSimplificado"
)
PISO_SAUDE_MIN = 15.0      # % mínimo (municípios, EC 29)
PISO_EDUCACAO_MIN = 25.0   # % mínimo (art. 212 CF)
PISOS_WORKERS = 12
# Ressalva colada ao dado de pisos constitucionais (guardrail de linguagem).
NOTA_PISO = (
    "Percentuais de aplicação constitucional em saúde (ASPS, piso de 15%) e "
    "educação (MDE, piso de 25%), calculados sobre a RECEITA DE IMPOSTOS e "
    "transferências — NÃO sobre a despesa total. Fonte: RREO Anexo 14 (6º "
    f"bimestre) no SICONFI/Tesouro Nacional, exercício {PISOS_ANO}. Valores "
    "declarados pelo próprio município; disponível apenas onde o ente enviou o "
    f"RREO de {PISOS_ANO} (cobertura parcial). Cumprir o piso é a regra — ficar "
    "abaixo pode ter justificativas e é avaliado no julgamento de contas, não aqui."
)

# IBGE — API de Agregados v3.
IBGE_API = "https://servicodados.ibge.gov.br/api/v3/agregados"

# Tabela 6579: estimativas anuais de população total (variável 9324).
# OBS: a 6579 NÃO cobre anos censitários (2007, 2010, 2022) — para 2022
# usamos o Censo (tabela 9514).
IBGE_ESTIMATIVA_AGREGADO = "6579"
IBGE_ESTIMATIVA_VARIAVEL = "9324"

# Censo 2022, tabela 9514: população por idade (variável 93).
# Classificação 287 = Idade; categorias usadas para derivar a parcela 0–15.
IBGE_CENSO_AGREGADO = "9514"
IBGE_CENSO_VARIAVEL = "93"
IBGE_CENSO_ANO = "2022"
IBGE_CENSO_ANO_INT = 2022  # mesmo ano, como int (p/ comparar com anos de eleição)
IBGE_CENSO_CLASSIF_IDADE = "287"
IBGE_CENSO_CAT_TOTAL = "100362"          # Total (todas as idades)
# Categorias que somadas dão a população de 0 a 15 anos (não votante):
IBGE_CENSO_CATS_0A15 = [
    "93070",  # 0 a 4 anos
    "93084",  # 5 a 9 anos
    "93085",  # 10 a 14 anos
    "6572",   # 15 anos
]
# Faixas para o 2º critério legal de revisão (Res. TSE 23.659/2021, art. 105):
# eleitorado > 2 × (população de 10–15 anos + população de 70+).
IBGE_CENSO_CATS_10A15 = ["93085", "6572"]            # 10–14 + 15 anos
IBGE_CENSO_CATS_70MAIS = [
    "93097", "93098", "49108", "49109", "60040", "60041", "6653",
]  # 70–74, 75–79, 80–84, 85–89, 90–94, 95–99, 100+
IBGE_CENSO_CLASSIF_SEXO = "2"
IBGE_CENSO_CAT_SEXO_TOTAL = "6794"
IBGE_CENSO_CLASSIF_DECL = "286"
IBGE_CENSO_CAT_DECL_TOTAL = "113635"

# Quantos anos de estimativa puxar (para crescimento populacional ano a ano).
# O pipeline descobre os períodos disponíveis e usa os N mais recentes.
IBGE_ANOS_ESTIMATIVA = 5

# Idade mínima de voto (apenas documentação/UI).
IDADE_VOTO_MINIMA = 16
