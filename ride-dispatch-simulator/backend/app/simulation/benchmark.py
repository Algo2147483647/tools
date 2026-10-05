"""Replay one seeded scenario for every registered backend policy."""
import math

from app.dispatch import registry
from .engine import SimulationEngine


def run_benchmark(options: dict, on_result=None) -> list[dict]:
    duration = options.get("duration", 1800)
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or not 0 < duration <= 86400:
        raise ValueError("Benchmark duration must be between 0 and 86,400 simulation seconds.")
    config = options.get("config", {})
    results, algorithms = [], registry.list_algorithms()
    for algorithm in algorithms:
        engine = SimulationEngine({**config, "algorithm": algorithm["id"]})
        engine.set_running(True)
        engine.step(duration)
        engine.set_running(False)
        engine._update_metrics()
        result = {"algorithm": algorithm["id"], "name": algorithm["name"], "metrics": dict(engine.metrics),
                  "duration": duration, "seed": engine.config["seed"]}
        results.append(result)
        if on_result:
            on_result(result, len(results), len(algorithms))
    return results
