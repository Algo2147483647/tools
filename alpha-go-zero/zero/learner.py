import math
import torch
from torch.nn import functional as F


def lr_for(cfg, step):
    if cfg.warmup and step < cfg.warmup:
        return cfg.lr*(step+1)/cfg.warmup
    if cfg.decay_steps:
        phase = min(1,max(0,step-cfg.warmup)/cfg.decay_steps)
        return cfg.lr*(0.1+0.9*(1+math.cos(math.pi*phase))/2)
    return cfg.lr


def objective(model, data, device, amp):
    x, pi, legal, z, owner, margin = (
        torch.as_tensor(col,device=device,dtype=torch.float32) for col in data)
    with torch.autocast(device_type=device,enabled=amp,dtype=torch.bfloat16):
        logits, value, ownership, score = model(x)
    logits = logits.float().masked_fill(~legal.bool(),-1e9)
    policy = -(pi*logits.log_softmax(1)).sum(1).mean()
    val = F.mse_loss(value.float(),z)
    penalty = sum(w.float().square().sum() for w in model.parameters() if w.ndim > 1)*1e-4
    loss = policy+val+penalty
    metrics = {"policy":policy,"value":val,"l2":penalty}
    if ownership is not None:
        own = F.mse_loss(ownership.float(),owner)
        difference = F.smooth_l1_loss(score.float(),margin)
        loss = loss+0.25*own+0.1*difference
        metrics.update(ownership=own,score=difference)
    metrics["loss"] = loss
    if not torch.isfinite(loss):
        raise FloatingPointError("Non-finite loss")
    return loss,metrics


def update(model, optimizer, data, cfg, step):
    model.train()
    rate = lr_for(cfg,step)
    for group in optimizer.param_groups:
        group["lr"] = rate
    optimizer.zero_grad(set_to_none=True)
    loss, metrics = objective(model,data,cfg.device,cfg.amp)
    loss.backward()
    norm = torch.nn.utils.clip_grad_norm_(model.parameters(),5,error_if_nonfinite=True)
    optimizer.step()
    return dict(lr=rate,grad=float(norm),**{k:float(v.detach()) for k,v in metrics.items()})
