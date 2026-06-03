"""Registro de procedência (manifest).

Para CADA arquivo baixado de fonte oficial gravamos: URL de origem, nome do
dataset, data/hora do download, hash SHA-256 e tamanho. Isso torna o pipeline
auditável: a partir dos mesmos bytes brutos, qualquer pessoa chega aos mesmos
números, e cada número exibido na interface aponta para um destes registros.

Stdlib apenas.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from . import config

SCHEMA_VERSION = "1.0"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class Manifest:
    """Acumula registros e grava manifest/provenance.json."""

    def __init__(self) -> None:
        self.sources: list[dict] = []

    def record(
        self,
        *,
        dataset_name: str,
        publisher: str,
        source_url: str,
        local_path: Path,
        downloaded_at: str,
        reference_period: str | None = None,
        http_status: int | None = None,
        content_type: str | None = None,
        notes: str = "",
    ) -> dict:
        rel = local_path.relative_to(config.ROOT).as_posix()
        entry = {
            "dataset_name": dataset_name,
            "publisher": publisher,
            "source_url": source_url,
            "local_path": rel,
            "downloaded_at": downloaded_at,
            "sha256": sha256_of(local_path),
            "byte_size": local_path.stat().st_size,
            "http_status": http_status,
            "content_type": content_type,
            "reference_period": reference_period,
            "notes": notes,
        }
        self.sources.append(entry)
        return entry

    def write(self, generated_at: str | None = None) -> None:
        config.MANIFEST.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "schema_version": SCHEMA_VERSION,
            "generated_at": generated_at or utc_now_iso(),
            "sources": self.sources,
        }
        config.MANIFEST.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    @staticmethod
    def load() -> dict:
        if not config.MANIFEST.exists():
            return {"schema_version": SCHEMA_VERSION, "sources": []}
        return json.loads(config.MANIFEST.read_text(encoding="utf-8"))
