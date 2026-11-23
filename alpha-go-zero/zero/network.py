import numpy as np
import torch
from torch import nn
from torch.nn import functional as F


class Residual(nn.Module):
    def __init__(self, width):
        super().__init__()
        self.path = nn.Sequential(nn.Conv2d(width,width,3,padding=1,bias=False),
                                  nn.BatchNorm2d(width), nn.ReLU(),
                                  nn.Conv2d(width,width,3,padding=1,bias=False), nn.BatchNorm2d(width))

    def forward(self, x):
        return F.relu(x+self.path(x))


class PolicyValue(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.config = config
        n, w = config.size, config.width
        self.stem = nn.Sequential(nn.Conv2d(17,w,3,padding=1,bias=False),nn.BatchNorm2d(w),nn.ReLU())
        if config.arch == "resnet":
            self.trunk = nn.Sequential(*(Residual(w) for _ in range(config.blocks)))
        else:
            self.position = nn.Parameter(torch.randn(1,n*n,w)*0.02)
            self.trunk = nn.Sequential(*(nn.TransformerEncoderLayer(
                w, config.heads, 4*w, dropout=0, activation="gelu", batch_first=True,
                norm_first=True) for _ in range(config.blocks)), nn.LayerNorm(w))
        self.policy = nn.Sequential(nn.Conv2d(w,2,1,bias=False),nn.BatchNorm2d(2),
                                    nn.ReLU(),nn.Flatten(),nn.Linear(2*n*n,n*n+1))
        self.value = nn.Sequential(nn.Conv2d(w,1,1,bias=False),nn.BatchNorm2d(1),nn.ReLU(),
                                   nn.Flatten(),nn.Linear(n*n,w*2),nn.ReLU(),nn.Linear(w*2,1),nn.Tanh())
        if config.auxiliary:
            self.owner = nn.Conv2d(w,1,1)
            self.score = nn.Linear(w,1)

    def forward(self, x):
        y = self.stem(x)
        if self.config.arch == "resnet":
            y = self.trunk(y)
        else:
            tokens = self.trunk(y.flatten(2).transpose(1,2) + self.position)
            y = tokens.transpose(1,2).reshape_as(y)
        p, v = self.policy(y), self.value(y).flatten()
        if self.config.auxiliary:
            return p, v, self.owner(y).squeeze(1).tanh(), self.score(y.mean((2,3))).flatten()
        return p, v, None, None


class Evaluator:
    def __init__(self, model, device):
        self.model = model.to(device).eval()
        self.device = device
        self.positions = self.batches = 0

    @torch.inference_mode()
    def __call__(self, boards):
        features = np.stack([board.features() for board in boards])
        x = torch.as_tensor(features, dtype=torch.float32, device=self.device)
        logits, values, _, _ = self.model(x)
        logits = logits.float().cpu().numpy()
        values = values.float().cpu().numpy()
        if not (np.isfinite(logits).all() and np.isfinite(values).all()):
            raise FloatingPointError("网络推理出现非有限值")
        self.positions += len(boards)
        self.batches += 1
        return zip(logits, values, strict=True)
