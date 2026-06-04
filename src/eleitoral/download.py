"""Baixa os arquivos brutos das fontes oficiais e grava o manifest.

Regra de ouro: só baixamos de endpoints oficiais (TSE/IBGE) e guardamos os
bytes ORIGINAIS, sem edição, em data/raw. A normalização vem depois, sempre
de forma reprodutível a partir desses brutos.

Stdlib apenas (urllib).
"""
from __future__ import annotations

import time
import urllib.error
import urllib.request
from pathlib import Path

from . import config
from .provenance import Manifest, utc_now_iso

_UA = "eleitoral-transparencia/0.1 (+https://github.com; pesquisa jornalística)"


def _download(url: str, dest: Path, timeout: int = 120, tentativas: int = 4) -> tuple[int, str]:
    """Baixa url -> dest com retentativas. Retorna (status, content_type).

    O CDN do TSE às vezes recusa/atrasa conexões (especialmente de fora do
    Brasil, como nos runners do GitHub). Em vez de derrubar tudo no primeiro
    timeout, tentamos algumas vezes com backoff exponencial.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    ultimo_erro: Exception | None = None
    for n in range(1, tentativas + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                status = resp.status
                ctype = resp.headers.get("Content-Type", "")
                tmp = dest.with_suffix(dest.suffix + ".part")
                with open(tmp, "wb") as fh:
                    while True:
                        chunk = resp.read(1024 * 256)
                        if not chunk:
                            break
                        fh.write(chunk)
                tmp.replace(dest)
            return status, ctype
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            ultimo_erro = e
            if n < tentativas:
                espera = min(30, 3 * 2 ** (n - 1))   # 3s, 6s, 12s, ...
                print(f"[retry] {dest.name}: tentativa {n}/{tentativas} falhou "
                      f"({e}); aguardando {espera}s")
                time.sleep(espera)
    raise RuntimeError(f"Falha ao baixar {url} após {tentativas} tentativas") from ultimo_erro


def baixar_tudo(manifest: Manifest, *, pular_existentes: bool = False) -> dict[str, Path]:
    """Baixa todas as fontes. Retorna dict lógico -> caminho local.

    pular_existentes=True reaproveita arquivos já presentes (útil em dev para
    não rebaixar o ZIP de 85 MB); o manifest é regravado de qualquer forma.
    """
    paths: dict[str, Path] = {}

    jobs = [
        # chave            url                              destino                                       dataset                              publisher        ref
        ("eleitorado",     config.TSE_ELEITORADO_URL,       config.RAW / "tse" / "perfil_eleitorado_ATUAL.zip",
         config.TSE_ELEITORADO_DATASET, "TSE — Portal de Dados Abertos", "atual"),
        ("crosswalk",      config.TSE_CROSSWALK_URL,        config.RAW / "crosswalk" / "municipio_tse_ibge.zip",
         config.TSE_CROSSWALK_DATASET, "TSE — Portal de Dados Abertos", "atual"),
        ("transferencia",  config.TSE_TRANSFERENCIA_URL,    config.RAW / "tse" / f"perfil_eleitorado_transferencia_{config.TSE_TRANSFERENCIA_ANO}.zip",
         config.TSE_TRANSFERENCIA_DATASET, "TSE — Portal de Dados Abertos", str(config.TSE_TRANSFERENCIA_ANO)),
    ]
    # comparecimento: anos de exibição (2022/2024) + anos extras da série histórica
    # do eleitorado (2014–2024). Arquivos por-UF; baixados sob demanda (cache em raw).
    for ano in config.tse_comparecimento_anos_todos():
        jobs.append((
            f"comparecimento_{ano}", config.tse_comparecimento_url(ano),
            config.RAW / "tse" / f"perfil_comparecimento_abstencao_{ano}.zip",
            f"Comparecimento e Abstenção - {ano}", "TSE — Portal de Dados Abertos", str(ano),
        ))
    # resultado da eleição (margem do prefeito) + transferências do mesmo ano
    _ae = config.TSE_ELEICAO_ANO
    jobs.append((
        "votos_eleicao", config.tse_votos_url(_ae),
        config.RAW / "tse" / f"votacao_candidato_munzona_{_ae}.zip",
        f"Votação nominal por município e zona - {_ae}", "TSE — Portal de Dados Abertos", str(_ae),
    ))
    jobs.append((
        "detalhe_votacao", config.tse_detalhe_url(_ae),
        config.RAW / "tse" / f"detalhe_votacao_munzona_{_ae}.zip",
        f"Detalhe da votação por município e zona - {_ae}", "TSE — Portal de Dados Abertos", str(_ae),
    ))
    jobs.append((
        "transferencia_eleicao",
        f"https://cdn.tse.jus.br/estatistica/sead/odsele/perfil_eleitor_transferencia/perfil_eleitorado_transferencia_{_ae}.zip",
        config.RAW / "tse" / f"perfil_eleitorado_transferencia_{_ae}.zip",
        "Transferência do eleitorado", "TSE — Portal de Dados Abertos", str(_ae),
    ))

    for chave, url, dest, dataset, publisher, ref in jobs:
        if pular_existentes and dest.exists():
            print(f"[skip] {chave}: já existe {dest.name}")
            status, ctype = 200, "application/zip"
        else:
            print(f"[get ] {chave}: {url}")
            status, ctype = _download(url, dest)
        manifest.record(
            dataset_name=dataset, publisher=publisher, source_url=url,
            local_path=dest, downloaded_at=utc_now_iso(),
            reference_period=ref, http_status=status, content_type=ctype,
        )
        paths[chave] = dest

    return paths


if __name__ == "__main__":  # smoke manual
    m = Manifest()
    p = baixar_tudo(m, pular_existentes=True)
    m.write()
    for k, v in p.items():
        print(k, "->", v)
    print("manifest:", config.MANIFEST)
