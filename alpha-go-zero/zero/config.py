from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

from .game import RULES


class Network(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    size: Literal[9, 19] = 9
    rules: Literal["TT-PSK-7.5-v1"] = RULES
    arch: Literal["resnet", "transformer"] = "resnet"
    blocks: int = Field(2, ge=1, le=64)
    width: int = Field(32, ge=8, le=1024)
    heads: int = Field(8, ge=1, le=32)
    auxiliary: bool = False

    @model_validator(mode="after")
    def valid_heads(self):
        if self.arch == "transformer" and self.width % self.heads:
            raise ValueError("Transformer width must be divisible by the attention head count")
        return self


class Config(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)
    experiment: str = Field("quick9", pattern=r"^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$")
    net: Network = Network()
    seed: int = Field(7, ge=0, le=2**31-1)
    device: Literal["cpu", "cuda", "mps"] = "cpu"
    sims: int = Field(8, ge=1, le=32768)
    games: int = Field(4, ge=1, le=100000)
    lanes: int = Field(4, ge=1, le=256)
    steps: int = Field(8, ge=1, le=1000000)
    batch: int = Field(16, ge=1, le=8192)
    pairs: int = Field(1, ge=1, le=5000)
    window: int = Field(20000, ge=1, le=10000000)
    lr: float = Field(0.02, gt=0, le=1)
    warmup: int = Field(0, ge=0)
    decay_steps: int = Field(0, ge=0)
    reuse_limit: float = Field(4.0, gt=0, le=100)
    c_puct: float = Field(1.5, gt=0, le=20)
    max_moves: int = Field(0, ge=0, le=10000)
    amp: bool = False
    sampler: Literal["local", "actors"] = "local"
    learner_gpus: int = Field(1, ge=1, le=64)
    arena_workers: int = Field(1, ge=1, le=32)
    selfplay_search: Literal["puct","gumbel_root"] = "puct"
    wall_minutes: float = Field(0, ge=0, le=525600)

    @property
    def cap(self):
        return self.max_moves or 4*self.net.size**2

    @model_validator(mode="after")
    def device_precision(self):
        if self.amp and self.device != "cuda":
            raise ValueError("Configured BF16 mixed precision requires CUDA")
        if self.learner_gpus > 1 and (self.device != "cuda" or self.batch % self.learner_gpus):
            raise ValueError("DDP requires CUDA，and the global batch must be divisible by the GPU count")
        return self


def preset(name):
    if name == "quick9":
        return Config()
    if name == "baseline9":
        return Config(experiment=name, net=Network(blocks=6,width=64), sims=16, batch=32)
    if name in ("engineering19", "reference19", "research19", "transformer19"):
        reference, research = name == "reference19", name in ("research19","transformer19")
        transformer = name == "transformer19"
        net = Network(size=19, blocks=20 if reference else 10,
                      width=384 if transformer else (256 if reference else 128),
                      arch="transformer" if transformer else "resnet", auxiliary=research)
        return Config(experiment=name, net=net, device="cuda", sims=1600 if reference else 128,
                      batch=128, lanes=16, games=32, steps=128, pairs=40,
                      window=100000, warmup=100, decay_steps=100000)
    raise ValueError("Unknown preset")


PRESETS = ("quick9","baseline9","engineering19","reference19","research19","transformer19")
