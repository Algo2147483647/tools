from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=True)

    @model_validator(mode="before")
    @classmethod
    def reject_explicit_nulls(cls, values):
        if isinstance(values, dict) and any(value is None for value in values.values()):
            raise ValueError("Command fields cannot be null; omit unchanged fields instead")
        return values


class ScoreWeightsPatch(Command):
    distance: float = Field(default=0.45, ge=0, le=10)
    wait: float = Field(default=0.25, ge=0, le=10)
    idle: float = Field(default=0.12, ge=0, le=10)
    balance: float = Field(default=0.10, ge=0, le=10)
    fairness: float = Field(default=0.08, ge=0, le=10)


class ConfigPatch(Command):
    seed: int = Field(default=71429, ge=0, le=2**32 - 1, strict=True)
    supply: int = Field(default=200, ge=50, le=1000, strict=True)
    demand: float = Field(default=1.0, ge=0.5, le=5.0)
    algorithm: str = Field(default="nearest", min_length=1, max_length=64)
    batchInterval: float = Field(default=5.0, ge=1, le=30)
    weights: ScoreWeightsPatch = Field(default_factory=ScoreWeightsPatch)
    startHour: float = Field(default=8.0, ge=0, lt=24)
    reposition: bool = Field(default=True, strict=True)
    simulationSpeed: Literal[1, 2, 5, 10] = 1
    secondsPerRealSecond: float = Field(default=10.0, ge=0.1, le=60)
    supplyDistribution: Literal["uniform", "demand_weighted", "random_cluster"] = "uniform"

    @field_validator("algorithm")
    @classmethod
    def registered_algorithm(cls, value):
        from app.dispatch.registry import registry
        if value not in {item["id"] for item in registry.list_algorithms()}:
            raise ValueError(f"Unknown dispatch algorithm: {value}")
        return value

    @field_validator("simulationSpeed", mode="before")
    @classmethod
    def numeric_speed(cls, value):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("Simulation speed must be a numeric multiplier")
        return value


class CreateSimulation(Command):
    config: ConfigPatch = Field(default_factory=ConfigPatch)


class SeekTime(Command):
    hour: float = Field(ge=0, lt=24)


class CreateBenchmark(Command):
    config: ConfigPatch = Field(default_factory=ConfigPatch)
    duration: float = Field(default=1800, ge=1, le=14400)
