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
# Anexo I-D = Despesa por NATUREZA. Usamos só para extrair a FOLHA DE PESSOAL
# (categoria "3.1 - Pessoal e Encargos Sociais", exceto intraorçamentárias, p/
# ser comparável à despesa total que também é "exceto intra"). Valor absoluto em R$.
ORCAMENTO_ANEXO_NATUREZA = "DCA-Anexo I-D"
ORCAMENTO_PESSOAL_COD = "DO3.1.00.00.00.00"   # Pessoal e Encargos Sociais (exceto intra)
ORCAMENTO_PESSOAL_COLUNA = "Despesas Empenhadas"
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

# TransfereGov — Transferências Especiais (emendas parlamentares individuais que
# vão DIRETO à conta do município, modalidade criada pela EC 105/2019, a "emenda
# Pix"). API REST pública, ABERTA (sem chave), baseada em PostgREST, com CORS
# liberado (a própria API reflete o Origin) — por isso pode ser consultada tanto
# no build (snapshot agregado) quanto AO VIVO pelo navegador (botão "tempo real"),
# filtrando por CNPJ do beneficiário. É o sistema operacional vivo: já traz o ano
# corrente. Recurso usado: plano_acao_especial.
#
# ENQUADRAMENTO/ressalva (NOTA_EMENDAS): cobre SÓ a modalidade transferência
# especial (RP6). NÃO inclui emendas de finalidade definida executadas por
# convênio/fundo-a-fundo (ex.: saúde via FNS), nem emendas de bancada, comissão
# ou relator. É um recorte bem definido — o dinheiro que cai direto no município.
#
# O beneficiário vem por NOME+UF (não por código IBGE): casamos com o nome oficial
# do IBGE (crosswalk) por igualdade normalizada; os poucos divergentes entram na
# tabela curada EMENDAS_APELIDOS (verificada à mão — NUNCA fuzzy, que fabricaria
# match errado). Quem não casar é logado e DESCARTADO (nunca chutado).
TRANSFEREGOV_ESPECIAIS_URL = "https://api.transferegov.dth.api.gov.br/transferenciasespeciais"
EMENDAS_PUBLISHER = "TransfereGov — Ministério da Gestão e da Inovação"
EMENDAS_DATASET = "TransfereGov — Transferências Especiais (plano_acao_especial)"
EMENDAS_ANO_MIN = 2020          # 1º ano da modalidade (EC 105/2019)
EMENDAS_PAGINA = 1000           # PostgREST: itens por página
EMENDAS_TOP_PARLAMENTARES = 6   # ranking exibido por município
EMENDAS_ULTIMAS = 6             # nº de emendas recentes no snapshot estático
# Áreas (código de função orçamentária → chave interna). Reaproveita as funções
# do orçamento e acrescenta as comuns em emendas. O que não estiver aqui = "outras".
EMENDAS_AREAS = {
    "10": "saude", "12": "educacao", "06": "seguranca", "08": "assistencia",
    "15": "urbanismo", "04": "administracao", "26": "transporte", "20": "agricultura",
    "18": "ambiente", "27": "desporto", "13": "cultura", "23": "turismo",
}
# Apelidos VERIFICADOS À MÃO (nome normalizado da TransfereGov, sem prefixo
# "MUNICIPIO DE"/sufixo "PREFEITURA", por UF) → código IBGE. São grafias antigas/
# divergentes e municípios renomeados; cada código foi conferido no crosswalk.
EMENDAS_APELIDOS = {
    ("BA", "LAGEDO DO TABOCAL"): "2919058",
    ("BA", "MUQUEM DO SAO FRANCISCO"): "2922250",
    ("GO", "BOM JESUS"): "5203500",                  # Bom Jesus de Goiás
    ("MG", "BARAO DO MONTE ALTO"): "3105509",
    ("MG", "DONA EUZEBIA"): "3122900",               # Dona Eusébia
    ("MG", "GOUVEA"): "3127602",                     # Gouveia
    ("MG", "QUELUZITA"): "3153806",                  # Queluzito
    ("PB", "TACIMA"): "2516409",                     # Campo de Santana (nome antigo)
    ("PE", "BELEM DE SAO FRANCISCO"): "2601607",
    ("PE", "IGUARACI"): "2606903",                   # Iguaracy
    ("PR", "BELA VISTA DO CAROBA"): "4102752",
    ("PR", "MUNHOZ DE MELLO"): "4116307",            # Munhoz de Melo
    ("PR", "PINHAL DO SAO BENTO"): "4119251",
    ("PR", "SANTA CRUZ DO MONTE CASTELO"): "4123303",
    ("RJ", "ARMACAO DE BUZIOS"): "3300233",          # Armação dos Búzios
    ("RN", "ASSU"): "2400208",                       # Açu
    ("RN", "BOA SAUDE"): "2405306",                  # Januário Cicco
    ("RN", "CAMPO GRANDE"): "2401305",               # Augusto Severo
    ("RN", "LAGOA DANTA"): "2406205",                # Lagoa d'Anta
    ("RS", "SANTANA DO LIVRAMENTO"): "4317103",      # Sant'Ana do Livramento
    ("SC", "BALNEARIO DE PICARRAS"): "4212809",      # Balneário Piçarras
    ("SC", "PRESIDENTE CASTELO BRANCO"): "4213906",  # Presidente Castello Branco
    ("SC", "SAO LOURENCO D OESTE"): "4216909",       # São Lourenço do Oeste
    ("SC", "SAO MIGUEL D OESTE"): "4217204",         # São Miguel do Oeste
    ("SE", "GRACCHO CARDOSO"): "2802601",            # Gracho Cardoso
    ("SP", "EMBU DAS ARTES"): "3515004",             # Embu
    ("SP", "ESTANCIA TURISTICA DE IBITINGA"): "3519600",  # Ibitinga
    ("SP", "ESTANCIA TURISTICA DE OLIMPIA"): "3533908",   # Olímpia
    ("SP", "FLORINEA"): "3516101",                   # Florínia
    ("SP", "JAHU"): "3525300",                       # Jaú
    ("SP", "MOGI MIRIM"): "3530805",                 # Moji Mirim
    ("SP", "SAO LUIZ DO PARAITINGA"): "3550001",     # São Luís do Paraitinga
    ("TO", "COUTO DE MAGALHAES"): "1706001",         # Couto Magalhães
    ("TO", "SAO VALERIO DA NATIVIDADE"): "1720499",  # São Valério
}
# Rótulo Câmara/Senado por parlamentar: a TransfereGov não traz a casa, então
# cruzamos o NOME do autor com as listas abertas da Câmara e do Senado, cobrindo
# as legislaturas que abrangem o período das emendas (56 = 2019–2023, 57 =
# 2023–2027). Match por nome normalizado; quem não bater fica sem rótulo (sem
# chute). Ambas as APIs são públicas e sem chave.
CAMARA_API = "https://dadosabertos.camara.leg.br/api/v2"
SENADO_API = "https://legis.senado.leg.br/dadosabertos"
CAMARA_DATASET = "Câmara dos Deputados — lista de deputados (dados abertos)"
SENADO_DATASET = "Senado Federal — lista de senadores por legislatura (dados abertos)"
EMENDAS_LEGISLATURAS = [56, 57]

# Ressalva colada ao dado de emendas (guardrail de linguagem).
NOTA_EMENDAS = (
    "Emendas parlamentares na modalidade TRANSFERÊNCIA ESPECIAL (a 'emenda Pix', "
    "EC 105/2019), que vão direto à conta do município, conforme a TransfereGov "
    "(Ministério da Gestão). NÃO inclui emendas executadas por convênio ou "
    "fundo-a-fundo (como saúde pelo Fundo Nacional de Saúde), nem emendas de "
    "bancada, comissão ou relator, nem emendas de deputado estadual — portanto não "
    "é o total de emendas do município. São valores autorizados/empenhados, não "
    "necessariamente já pagos, e não indicam, por si sós, irregularidade. Se uma "
    "emenda específica não aparecer, pode ser de outra modalidade, de deputado "
    "estadual, recente ou ainda não registrada na TransfereGov."
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
