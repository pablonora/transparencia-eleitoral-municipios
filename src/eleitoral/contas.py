"""Prestação de contas eleitorais por município (TSE) — receitas e despesas.

Cada linha é uma receita (VR_RECEITA) ou despesa contratada
(VR_DESPESA_CONTRATADA) de um candidato. `SG_UE` é o código TSE da unidade
eleitoral — na eleição municipal, o próprio município — então agregamos por
`SG_UE.lstrip("0")` (mesmo gotcha de zero à esquerda do resto do pipeline).

CUSTO: o ZIP oficial tem ~1,28 GB, quase tudo nos arquivos `_BRASIL.csv`
(concatenação nacional que, se somada, DOBRARIA cada município). Em vez de baixar
o ZIP inteiro, lemos por HTTP Range apenas os membros POR-UF que interessam e os
inflamos em streaming — só ~490 MB trafegados, em pedaços pequenos (robusto na
CI), e nada de bruto gigante em disco. O resultado agregado (pequeno) é
persistido em data/interim para o modo --offline.

ENQUADRAMENTO: são valores DECLARADOS; não refletem o julgamento das contas pelo
TSE nem indicam irregularidade. Cruzamento sempre FACTUAL, nunca causal.

Stdlib apenas (urllib, zipfile-by-hand, zlib, csv).
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import struct
import urllib.request
import zlib
from pathlib import Path

from . import config
from .provenance import Manifest, utc_now_iso

_UA = "eleitoral-transparencia/0.1 (+https://github.com; pesquisa jornalística)"

# colunas de valor por tipo de membro
_VALCOL = {
    "receitas_candidatos": "VR_RECEITA",
    "despesas_contratadas_candidatos": "VR_DESPESA_CONTRATADA",
}
# nome do membro: <prefixo>_<ano>_<UF>.csv, UF = 2 letras (exclui _BRASIL)
_RE_MEMBRO = re.compile(r"^(?P<pref>[a-z_]+)_(?P<ano>\d{4})_(?P<uf>[A-Z]{2})\.csv$")


def parse_valor(s: str) -> float:
    """'1.234.567,89' -> 1234567.89 ; '' / lixo -> 0.0 (formato BR)."""
    s = (s or "").strip().strip('"')
    if not s:
        return 0.0
    try:
        return float(s.replace(".", "").replace(",", "."))
    except ValueError:
        return 0.0


def cargo_bucket(ds_cargo: str) -> str:
    """Normaliza DS_CARGO para 'prefeito' | 'vereador' | 'outro'."""
    c = (ds_cargo or "").strip().lower()
    if c == "prefeito":
        return "prefeito"
    if c == "vereador":
        return "vereador"
    return "outro"


def membros_por_uf(nomes: list[str], ano: int) -> list[str]:
    """Filtra os membros POR-UF dos prefixos desejados (exclui _BRASIL etc.)."""
    out = []
    for n in nomes:
        m = _RE_MEMBRO.match(n)
        if not m or int(m.group("ano")) != ano:
            continue
        if m.group("pref") in _VALCOL:
            out.append(n)
    return out


# ---------------------------------------------------------------------------
# Leitura do ZIP remoto por HTTP Range (sem baixar o arquivo inteiro)
# ---------------------------------------------------------------------------

def _rng(url: str, a: int, b: int) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": _UA, "Range": f"bytes={a}-{b}"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def _head(url: str) -> dict:
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return {
            "size": int(r.headers.get("Content-Length", 0)),
            "etag": r.headers.get("ETag", ""),
            "last_modified": r.headers.get("Last-Modified", ""),
        }


def _central_dir(url: str, size: int) -> dict[str, tuple[int, int, int]]:
    """{nome -> (offset_local, comp_size, crc32)} lendo o diretório central."""
    tail = _rng(url, max(0, size - 600_000), size - 1)
    i = tail.rfind(b"PK\x05\x06")
    if i < 0:
        raise RuntimeError("EOCD não encontrado (zip > 4GB usaria ZIP64; não esperado aqui)")
    _, _, _, _, _, cd_sz, cd_off, _ = struct.unpack("<IHHHHIIH", tail[i:i + 22])
    cd = _rng(url, cd_off, cd_off + cd_sz - 1)
    ent: dict[str, tuple[int, int, int]] = {}
    p = 0
    while cd[p:p + 4] == b"PK\x01\x02":
        crc, comp = struct.unpack("<II", cd[p + 16:p + 24])
        fn = struct.unpack("<H", cd[p + 28:p + 30])[0]
        ex = struct.unpack("<H", cd[p + 30:p + 32])[0]
        cm = struct.unpack("<H", cd[p + 32:p + 34])[0]
        lho = struct.unpack("<I", cd[p + 42:p + 46])[0]
        name = cd[p + 46:p + 46 + fn].decode("latin-1")
        ent[name] = (lho, comp, crc)
        p += 46 + fn + ex + cm
    return ent


class _InflateReader(io.RawIOBase):
    """File-like que infla, em streaming, os bytes deflate de um membro do zip.

    Lê o corpo de UMA resposta HTTP Range em pedaços e os descomprime sob demanda
    (memória baixa, mesmo nos membros de ~430 MB). Atualiza um SHA-256 com os
    bytes COMPRIMIDOS lidos — a procedência do que efetivamente baixamos.
    """

    def __init__(self, resp, sha):
        self._resp = resp
        self._dec = zlib.decompressobj(-15)
        self._sha = sha
        self._buf = b""
        self._eof = False

    def readable(self) -> bool:
        return True

    def _fill(self) -> None:
        while not self._buf and not self._eof:
            chunk = self._resp.read(262_144)
            if not chunk:
                self._buf += self._dec.flush()
                self._eof = True
                break
            self._sha.update(chunk)
            self._buf += self._dec.decompress(chunk)

    def readinto(self, b) -> int:
        self._fill()
        n = min(len(b), len(self._buf))
        b[:n] = self._buf[:n]
        self._buf = self._buf[n:]
        return n


def _ler_membro(url: str, offset: int, comp: int):
    """Abre o membro (range único) e devolve (csv.reader, sha) em streaming."""
    lh = _rng(url, offset, offset + 30)
    nl, el = struct.unpack("<HH", lh[26:30])
    start = offset + 30 + nl + el
    req = urllib.request.Request(
        url, headers={"User-Agent": _UA, "Range": f"bytes={start}-{start + comp - 1}"})
    resp = urllib.request.urlopen(req, timeout=300)
    sha = hashlib.sha256()
    stream = io.TextIOWrapper(
        io.BufferedReader(_InflateReader(resp, sha)), encoding="latin-1", newline="")
    return csv.reader(stream, delimiter=";"), sha


# ---------------------------------------------------------------------------
# Agregação
# ---------------------------------------------------------------------------

def _novo() -> dict:
    return {"receita": 0.0, "despesa": 0.0,
            "receita_prefeito": 0.0, "despesa_prefeito": 0.0,
            "receita_vereador": 0.0, "despesa_vereador": 0.0,
            "_cands": set(), "_cands_pref": set()}


def _agregar_membro(reader, prefixo: str, acc: dict[str, dict],
                    uf: str | None) -> int:
    valcol = _VALCOL[prefixo]
    campo = "receita" if prefixo.startswith("receitas") else "despesa"
    header = next(reader)
    col = {c: i for i, c in enumerate(header)}
    i_ue, i_uf = col["SG_UE"], col["SG_UF"]
    i_cargo, i_sq, i_val = col["DS_CARGO"], col["SQ_CANDIDATO"], col[valcol]
    n = 0
    for linha in reader:
        if len(linha) <= i_val:
            continue
        if uf is not None and linha[i_uf] != uf:
            continue
        cd = linha[i_ue].strip().lstrip("0")
        if not cd:
            continue
        v = parse_valor(linha[i_val])
        b = cargo_bucket(linha[i_cargo])
        d = acc.get(cd)
        if d is None:
            d = acc[cd] = _novo()
        d[campo] += v
        if b in ("prefeito", "vereador"):
            d[f"{campo}_{b}"] += v
        sq = linha[i_sq].strip()
        if sq:
            d["_cands"].add(sq)
            if b == "prefeito":
                d["_cands_pref"].add(sq)
        n += 1
    return n


def _finalizar(acc: dict[str, dict]) -> dict[str, dict]:
    out = {}
    for cd, d in acc.items():
        out[cd] = {
            "receita_total": round(d["receita"], 2),
            "despesa_total": round(d["despesa"], 2),
            "receita_prefeito": round(d["receita_prefeito"], 2),
            "despesa_prefeito": round(d["despesa_prefeito"], 2),
            "receita_vereador": round(d["receita_vereador"], 2),
            "despesa_vereador": round(d["despesa_vereador"], 2),
            "n_candidatos": len(d["_cands"]),
            "n_cand_prefeito": len(d["_cands_pref"]),
        }
    return out


def agregar(manifest: Manifest, *, uf: str | None = config.UF_SIGLA,
            offline: bool = False, ano: int = config.TSE_CONTAS_ANO) -> dict[str, dict]:
    """Retorna {cd_tse(sem zero) -> {receita_total, despesa_total, por cargo, n}}.

    online: lê os membros por-UF do zip oficial por range e agrega em streaming,
    persistindo o resultado (pequeno) em data/interim/contas_{ano}.json.
    offline: reaproveita esse interim (não trafega nada).
    """
    interim = config.INTERIM / f"contas_{ano}.json"
    url = config.TSE_CONTAS_URL

    if offline and interim.exists():
        cache = json.loads(interim.read_text(encoding="utf-8"))
        prov = cache["_proc"]
        manifest.record(
            dataset_name=config.TSE_CONTAS_DATASET,
            publisher="TSE — Portal de Dados Abertos", source_url=url,
            local_path=interim, downloaded_at=prov.get("lido_em", utc_now_iso()),
            reference_period=str(ano), http_status=206,
            content_type="application/zip; range",
            notes=prov.get("notes", ""))
        print(f"[contas] offline: {len(cache['municipios'])} municípios (cache)")
        return {cd: v for cd, v in cache["municipios"].items()}

    info = _head(url)
    print(f"[contas] zip oficial {info['size']/1e6:.0f} MB — lendo só membros por-UF por range")
    central = _central_dir(url, info["size"])
    membros = membros_por_uf(list(central), ano)
    if uf is not None:
        membros = [m for m in membros if m.endswith(f"_{uf}.csv")]
    membros.sort()

    acc: dict[str, dict] = {}
    hashes = []
    baixado = 0
    for nome in membros:
        pref = _RE_MEMBRO.match(nome).group("pref")
        offset, comp, _crc = central[nome]
        reader, sha = _ler_membro(url, offset, comp)
        n = _agregar_membro(reader, pref, acc, uf)
        hashes.append({"membro": nome, "bytes_zip": comp, "sha256": sha.hexdigest()})
        baixado += comp
        print(f"[contas]   {nome}: {n} linhas ({comp/1e6:.1f} MB zip)")

    municipios = _finalizar(acc)
    notes = (f"Subconjunto por-UF (receitas + despesas_contratadas) lido por HTTP "
             f"Range do zip oficial; _BRASIL/pagas/doador excluídos. "
             f"ETag={info['etag']} Last-Modified={info['last_modified']} "
             f"membros={len(membros)} bytes_trafegados={baixado}")
    proc = {"lido_em": utc_now_iso(), "url": url, "etag": info["etag"],
            "last_modified": info["last_modified"], "zip_bytes": info["size"],
            "bytes_trafegados": baixado, "membros": hashes, "notes": notes}
    interim.parent.mkdir(parents=True, exist_ok=True)
    interim.write_text(json.dumps({"_proc": proc, "municipios": municipios},
                                  ensure_ascii=False, indent=2), encoding="utf-8")
    manifest.record(
        dataset_name=config.TSE_CONTAS_DATASET,
        publisher="TSE — Portal de Dados Abertos", source_url=url,
        local_path=interim, downloaded_at=proc["lido_em"], reference_period=str(ano),
        http_status=206, content_type="application/zip; range", notes=notes)
    print(f"[contas] {len(municipios)} municípios | {baixado/1e6:.0f} MB trafegados "
          f"(de {info['size']/1e6:.0f} MB)")
    return municipios
