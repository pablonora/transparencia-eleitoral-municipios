# Eleitorado × População — painel de transparência (Brasil)

Ferramenta aberta que cruza, por município, o **eleitorado registrado (TSE)**
com a **população estimada (IBGE)**, destacando municípios cuja razão
eleitores/população é anormalmente alta — para ajudar jornalistas e cidadãos a
**priorizar escrutínio**.

> **Isto NÃO é um detector de fraude.** Mais eleitores que habitantes é um
> fenômeno **comum e majoritariamente legítimo**: o domicílio eleitoral não é o
> mesmo que o domicílio civil, há migração com manutenção do título, e a
> população do IBGE é uma **estimativa**. O painel apenas sinaliza anomalias e
> sempre apresenta as explicações oficiais ao lado.

O site é estático (HTML/JS), publicável no **GitHub Pages**. Todo o
processamento acontece **fora** do Pages, num pipeline Python reprodutível; o
navegador só lê JSONs prontos.

---

## O que o painel mostra

Por município:

| Indicador | Definição | Fonte |
|---|---|---|
| **Razão total** | eleitores ÷ população **total** estimada | TSE (eleitorado) ÷ IBGE 6579 |
| **Razão 16+** | eleitores ÷ população **em idade de votar** (16+) estimada | TSE ÷ (IBGE Censo 2022 × 6579) |
| **Crescimento pop. %** | variação da população entre os dois anos de estimativa | IBGE 6579 |
| **Transferências** | entradas (e saldo) de domicílio eleitoral no ano | TSE — Transferência do eleitorado |
| **Perfil demográfico** | % do eleitorado por faixa (16–17, 70+), gênero e escolaridade | TSE — Eleitorado Atual |
| **Comparecimento / abstenção** | % que compareceu e que se absteve (1º turno), 2022 e 2024 | TSE — Comparecimento e Abstenção |
| **Razão na época da eleição** | eleitorado apto ÷ população **do mesmo ano** (2022 via Censo; 2024 via estimativa) | TSE (aptos) ÷ IBGE |
| **Gastos e arrecadação de campanha** | receita declarada e despesa contratada das campanhas de candidatos (total e por cargo), 2024 | TSE — Prestação de contas eleitorais |

> A **razão na época** é year-matched (mais precisa que a "atual" para o contexto
> eleitoral): usa o eleitorado apto daquele pleito (`QT_APTOS`) e a população do
> mesmo ano. A de **2022 é a mais rigorosa de todas** — eleitorado e **Censo**
> (contagem, não estimativa), ambos de 2022, sem extrapolação. A razão "atual"
> (manchete) segue sendo o eleitorado mais recente ÷ estimativa mais recente.

> **Atenção ao cruzar abstenção com a razão.** Ao contrário do que a intuição
> sugere, municípios de razão alta têm abstenção **um pouco menor** (são, em
> geral, pequenos do interior, com comparecimento tradicionalmente alto). Por
> isso a abstenção é apresentada como indicador próprio, sem afirmar correlação
> com a razão. Comparecimento é de uma **eleição específica** (2022 geral / 2024
> municipal — esta sem o DF), diferente do eleitorado “atual”.

Há ainda um **mapa coroplético interativo**. Conforme se dá zoom, os municípios
dos estados visíveis carregam sob demanda e, bem de perto, os nomes das cidades
aparecem. Geometria oficial da **API de Malhas do IBGE** (registrada no manifest
como as demais fontes). O mapa permite:

- **Colorir por vários indicadores** — razão, razão 16+, % de eleitorado 70+,
  % com até o ensino fundamental, saldo de transferências, crescimento
  populacional (recolore UFs e municípios).
- **Escala divergente no 100%** para a razão (frio abaixo, quente acima): os
  municípios com mais eleitores que habitantes saltam em vermelho.
- **Realçar** só os municípios >100% ou só os atípicos (apaga o resto).
- **Popup rico** por município, com botão que abre o perfil completo.

### Recursos de engajamento (front-end, sem novos dados)

- **Encontre sua cidade** — busca (tolerante a acentos) que abre um *perfil
  compartilhável*: razão, posição no ranking nacional e na UF, comparação com a
  mediana do estado e do país, perfil demográfico e transferências. Link
  profundo `?cidade=<código IBGE>` abre direto naquele município.
- **📍 Mostrar minha cidade** — opção de geolocalização que abre o perfil do
  município do usuário. A coordenada é resolvida por *ponto-em-polígono* contra a
  malha do IBGE **inteiramente no navegador** — nada é enviado a terceiros.
- **Rankings por vários ângulos** — abas: maior razão, maior entrada líquida de
  eleitores (transferências), eleitorado mais idoso/jovem, menor escolaridade,
  maior % de voto facultativo.
- **Destaques automáticos** — manchetes rotativas geradas dos dados.
- **Comparar duas cidades** — indicadores lado a lado.
- **Tema claro/escuro** — alternador 🌙/☀️ que respeita a preferência do sistema e
  é lembrado (localStorage). O escuro é o padrão; o claro re-afina mapa, escalas e
  caixas de alerta à mão (via variáveis de CSS).

### Quatro marcadores neutros (o usuário filtra)

Em vez de um rótulo único de "outlier" (que seria alarmista), o painel usa
flags independentes e rotuladas:

- **Mais eleitores que habitantes (> 100%)** — o marcador mais intuitivo.
- **Acima do limiar de 80%** — referência ao patamar de revisão de eleitorado
  do TSE *(configurável em `config.py`; ver "Enquadramento" abaixo)*.
- **Atípico (estatístico, nacional)** — foge da distribuição do **Brasil**
  (Tukey: razão acima de Q3 + 1,5·IQR calculado sobre todos os municípios).
  É o **marcador estatístico principal**.

**E o "por UF"?** O pipeline também calcula um outlier relativo à distribuição
da **própria UF**, mas ele é **contexto secundário**: aparece apenas no detalhe
da linha (ao expandir um município), não como cartão/chip/badge. Optamos por não
destacá-lo porque (a) ele "avalia na curva" — pode esconder padrões regionais
inteiros, indo contra o objetivo de priorizar escrutínio; e (b) é
estatisticamente frágil em UFs pequenas (o DF tem 1 município; RR/AP/AC têm
15–22, com quartis ruidosos). Fica disponível como nuance, sem confundir a
leitura principal.

> Por que os dois recortes discordam: Itapiranga (AM, razão 0,89) é atípico
> **para o Amazonas** (limiar 0,89) mas normal no país (limiar nacional ≈ 1,18);
> Avelinópolis (GO, razão 1,50) é atípico **no país** mas rotina em Goiás
> (limiar 1,54). Por isso o nacional é o destaque e o da UF fica no detalhe.

> **Números nacionais (eleitorado atual × estimativa 2025):** 5.571 municípios em
> 27 UFs. Destes, **739** têm mais eleitores que habitantes estimados (>100%) e
> **3.212** estão acima de 80% — ou seja, o limiar de 80% sozinho marca ~58% do
> país e discrimina pouco. O marcador estatístico principal — **atípico
> nacional** — aponta **185 municípios** (limiar nacional ≈ 1,18); o recorte
> secundário por UF aponta 170. No Piauí a mediana municipal já é ≈ 0,95. Esse é
> o tipo de nuance que o painel existe para deixar explícito.

---

## Metodologia

### Razão 16+ (denominador honesto) e a extrapolação

As estimativas anuais do IBGE (tabela 6579) trazem **apenas a população total**
e **não cobrem anos censitários** (logo, não há 2022). O recorte por idade só
existe, no nível municipal, no **Censo 2022** (tabela 9514).

Por isso, calculamos a parcela em idade de votar assim:

1. Do **Censo 2022**, por município: `pop_0_15 = (0–4) + (5–9) + (10–14) + (15 anos)`
   e `pop_16+ = total − pop_0_15` → daí a **proporção 16+**.
2. Aplicamos essa proporção de 2022 à **estimativa populacional do ano** para
   obter a população 16+ **estimada**.

Isto é uma **extrapolação** e está **sempre rotulado** como tal na interface e
no `meta.json`: assume que a estrutura etária do município se manteve igual à de
2022. É a melhor aproximação possível com dados oficiais até o próximo recorte
etário municipal.

> **Cuidado ao ler a razão 16+.** Como o denominador é menor (só ~80% da
> população tem idade de votar), a razão 16+ é **quase sempre maior** que a total
> e **passar de 100% é esperado por construção**: a mediana nacional da razão 16+
> é ≈1,05 e **64%** dos municípios ficam acima de 100% — contra 13% na razão
> total. Ou seja, "razão 16+ > 100%" sozinho **não é anomalia**; a **razão total**
> é a referência mais sólida. A interface deixa esse alerta explícito.

### Crosswalk (correspondência de códigos)

TSE e IBGE usam **códigos de município diferentes**. Um erro de correspondência
fabrica outliers falsos, então:

- usamos o **crosswalk oficial do próprio TSE** ("Códigos oficiais de UF e
  municípios segundo o TSE e o IBGE");
- o join acontece **somente por código** (nunca por nome);
- o build **falha** se algum município do eleitorado ficar sem par no IBGE
  (`crosswalk.validar_cobertura`).

**Exterior.** O eleitorado do TSE inclui ~917 mil eleitores no exterior
(SG_UF = `ZZ`), distribuídos em 186 "municípios" eleitorais sem população do
IBGE. Eles são **excluídos** do cruzamento município×população e o build
**registra explicitamente** quantos foram removidos (sem truncar em silêncio).

### Enquadramento e limiar legal

O limiar de 80% (`LIMIAR_REVISAO` em `config.py`) corresponde a **apenas um** dos
**três critérios cumulativos** da **Resolução TSE nº 23.659/2021 (art. 105)** para
a revisão de eleitorado de ofício:
1. transferências no ano ≥ 10% acima do ano anterior;
2. eleitorado superior ao **dobro** da população de 10–15 anos somada à de 70+;
3. eleitorado superior a **80%** da população projetada pelo IBGE.

Os três precisam ocorrer **juntos** — e ainda assim a revisão é discricionária. O
próprio TSE afirma que *“a desproporção entre o número de eleitores e a população,
por si só, não enseja a revisão”*.

O painel **calcula os três critérios** e marca quem atende a todos (aba “Atende aos
3 critérios” e bloco no perfil). Com os dados atuais, **apenas 7 de 5.570
municípios** atendem aos três — o que reforça que razão alta, isolada, quase nunca
chega perto do enquadramento legal. (Critério 1 compara transferências 2025 × 2024;
2024 foi ano eleitoral, então é um comparativo conservador.)

---

## Procedência e reprodutibilidade

- Baixamos **apenas de endpoints oficiais** (TSE/IBGE) e guardamos os bytes
  originais em `data/raw`.
- Para cada arquivo, `manifest/provenance.json` registra **URL, dataset,
  data/hora do download, SHA-256 e tamanho**.
- Cada número exibido no site carrega **fonte + data de extração** (via
  `docs/data/meta.json`).
- Mesmos brutos → mesmos números.

**Brutos grandes:** os ZIPs do TSE (dezenas de MB) **não** são versionados (para
manter o repositório leve no GitHub); são reproduzíveis via os hashes do
manifest. Os brutos pequenos (crosswalk e respostas do IBGE) **são** versionados,
para reproduzir os números mesmo sem rede.

---

## Como rodar

Requisitos: **Python 3.10+** e nada mais (pipeline usa só a biblioteca padrão).

```bash
# 1) baixar tudo, calcular e gerar os JSONs
PYTHONPATH=src python -m eleitoral.build

# (reaproveitando brutos já baixados)
PYTHONPATH=src python -m eleitoral.build --offline

# 2) testes
PYTHONPATH=src python -m unittest discover -s tests -v

# 3) ver o site localmente
cd docs && python -m http.server 8099   # abra http://localhost:8099
```

Saídas: `docs/data/brasil.json`, `docs/data/meta.json`, `manifest/provenance.json`.

> Escopo configurável em `src/eleitoral/config.py`: `UF_SIGLA = None` processa o
> Brasil inteiro; `UF_SIGLA = "PI"` (com `UF_CODIGO_IBGE`) processa uma única UF
> e gera `docs/data/pi.json`.

### Publicação (GitHub Pages, sem backend)

O workflow `.github/workflows/atualizar-dados.yml` tem duas partes **separadas**:
um job `deploy` que publica `docs/` no Pages a cada push ao `main` (usando os
dados **já versionados**, sem baixar nada — a página nunca cai por instabilidade
das fontes) e um job `atualizar-dados` que, mensalmente, baixa TSE/IBGE,
recalcula e commita os JSONs de volta (tolerando falha de rede). Configure
**Settings → Pages → Source: GitHub Actions**.

---

## Estrutura

```
src/eleitoral/      pipeline (download, crosswalk, eleitorado, ibge,
                    transferencia, resultados, contas, indicators, build,
                    provenance, config)
data/raw/           brutos originais (TSE/IBGE) — imutáveis
manifest/           provenance.json (URL + SHA-256 por arquivo)
docs/               site estático (index.html, app.js, style.css) + data/*.json
tests/              testes (crosswalk e indicadores)
```

## Fontes

- **TSE — Portal de Dados Abertos** (CC-BY): Eleitorado Atual; Transferência do
  eleitorado; Códigos oficiais TSE/IBGE.
- **IBGE — API de Agregados v3**: tabela 6579 (estimativas); tabela 9514
  (Censo 2022, população por idade).
- **IBGE — API de Malhas**: malha das UFs e malhas municipais (GeoJSON) para o
  mapa (`docs/data/malha/`).
- **TSE — Votação nominal por município e zona (2024)**: margem de vitória do
  prefeito (turno decisivo).
- **TSE — Prestação de contas eleitorais — candidatos (2024)**: receitas
  (arrecadação) e despesas contratadas (gasto) das campanhas, agregadas por
  município. O ZIP oficial tem ~1,28 GB, quase tudo nos arquivos `_BRASIL.csv`
  (concatenação nacional que, somada, **dobraria** cada município). Em vez de
  baixá-lo inteiro, `contas.py` lê por **HTTP Range** apenas os arquivos por-UF
  (`receitas_candidatos_2024_{UF}` e `despesas_contratadas_candidatos_2024_{UF}`)
  e os agrega em streaming — ~470 MB trafegados. (`despesas_pagas` não traz o
  município e doadores não entram.)

### Gastos de campanha: o que fazemos e o que NÃO fazemos

Mostramos, por município, **quanto as campanhas arrecadaram e gastaram** em 2024
(total, por cargo e por eleitor). São valores **declarados** na prestação de
contas — **não** refletem o julgamento das contas pelo TSE e **não** indicam, por
si sós, irregularidade. **Gasto maior não significa compra de votos**: o voto é
secreto. O ranking é normalizado **por eleitor** (não absoluto, que só refletiria
o tamanho da cidade) e vem sempre com a ressalva. É a mesma postura factual e
não-causal dos votos — a ferramenta sinaliza, não acusa.

### Votos × transferências: o que fazemos e o que NÃO fazemos

Mostramos, por município, o **vencedor e a margem de vitória** do prefeito em
2024 e, ao lado, a **entrada líquida de eleitores** (transferências) de 2024.
Marcamos quando a entrada líquida **superou a margem** — uma comparação de dois
números, FACTUAL.

**Não inferimos impacto eleitoral.** O voto é secreto: não existe dado de em
quem os eleitores transferidos votaram. Por isso **nunca** afirmamos que a
entrada de eleitores decidiu uma eleição — apenas sinalizamos onde a magnitude
merece contexto, sempre com a ressalva explícita. Isso é deliberado: a
ferramenta sinaliza, não acusa.

## Escopo

Cobertura atual: **Brasil inteiro** (5.571 municípios, 27 UFs), com mapa
coroplético municipal já implementado. A primeira iteração foi validada no Piauí
e depois generalizada. Próximo passo possível: crescimento do eleitorado ano a
ano (snapshots anuais do TSE).

## Licença

Código sob **MIT**; dados derivados sob **CC-BY 4.0**. Ver [LICENSE](LICENSE).
