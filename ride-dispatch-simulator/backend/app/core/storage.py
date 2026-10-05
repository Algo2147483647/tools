"""Atomic JSON checkpoints, kept outside source and never loaded with pickle."""

import json
import logging
from pathlib import Path
import os

log = logging.getLogger(__name__)


class CheckpointStore:
    def __init__(self, root: Path):
        self.root = root
        (root / "simulations").mkdir(parents=True, exist_ok=True)
        (root / "benchmarks").mkdir(parents=True, exist_ok=True)

    def save(self, category: str, identifier: str, record: dict) -> None:
        destination = self.root / category / f"{identifier}.json"
        temporary = destination.with_suffix(".json.tmp")
        encoded = json.dumps(record, separators=(",", ":"), allow_nan=False)
        with temporary.open("w", encoding="utf-8") as handle:
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)

    def load_all(self, category: str) -> list[dict]:
        records = []
        for path in sorted((self.root / category).glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                records.append(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                log.exception("Skipping corrupt checkpoint %s", path)
        return records

    def delete(self, category: str, identifier: str) -> None:
        (self.root / category / f"{identifier}.json").unlink(missing_ok=True)
