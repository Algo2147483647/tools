"""Explicit local-development defaults; no wildcard cross-origin access."""

from dataclasses import dataclass, field
from pathlib import Path
import os


@dataclass(frozen=True)
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv(
        "VECTOR_DATA_DIR", str(Path(__file__).resolve().parents[2] / "var")
    )).resolve())
    allowed_origins: tuple[str, ...] = field(default_factory=lambda: tuple(
        item.strip() for item in os.getenv(
            "VECTOR_ALLOWED_ORIGINS",
            "http://127.0.0.1:4186,http://localhost:4186,http://127.0.0.1:5173,http://localhost:5173",
        ).split(",") if item.strip() and item.strip() != "*"
    ))
    tick_interval: float = 0.1
    persistence_interval: float = 5.0
    max_sessions: int = field(default_factory=lambda: int(os.getenv("VECTOR_MAX_SESSIONS", "8")))
    max_benchmark_jobs: int = field(default_factory=lambda: int(os.getenv("VECTOR_MAX_BENCHMARKS", "2")))
    max_benchmark_records: int = 30
