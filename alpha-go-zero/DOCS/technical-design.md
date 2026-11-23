# AlphaGo Zero technical design

The original design baseline is dated 2026-11-23. Its historical results belong to a separate implementation. The [roadmap](development-roadmap.md) tracks this checkout.

## Objectives and architecture

Start from random weights, generate training examples from the system's own games and evaluate frozen candidates independently. Keep classical residual-network experiments separate from research changes. The long-term target is statistically supported 19×19 performance against strong public engines under matched hardware and time controls.

The controller schedules champion self-play. Independent trees request batched network inference. Completed games go through replay validation before entering an immutable archive and a bounded training window. The learner freezes candidates for paired evaluation. The registry publishes an eligible candidate only if the expected champion still matches.

## Rules and observations

Use Tromp–Taylor area scoring with 7.5 white komi. After placing a stone, remove opposing strings without liberties, then friendly strings without liberties. Positional superko compares exact board colorings over the entire game. Passing is always permitted before termination. Two consecutive passes end the game. Empty regions touching exactly one color belong to that color. A move watchdog produces an unfinished record without outcome, score or ownership labels. [Original rules](https://tromp.github.io/go.html)

The observation contains eight board frames for each player's stones and one color plane. Legal moves use the full history even when it extends beyond the observation. All D4 transforms apply consistently to spatial features, targets and masks. Pass retains its action index.

## Networks and search

The reference backbone uses a convolutional stem, residual blocks and separate policy and scalar value heads. Policy has N²+1 outputs. Value uses the current player's perspective. Research options include ownership and normalized score-margin prediction, plus a Transformer over intersections with learned position embeddings. Compare variants at equal resource budgets. [Auxiliary training research](https://arxiv.org/abs/1902.10565)

PUCT selects a legal edge by maximizing Q + cP√(1+ΣN)/(1+N). Backpropagation reverses the value sign each ply. Each move receives a fresh simulation budget and can inherit clean subtree statistics. Training mixes 25% Dirichlet noise into root priors, using alpha 0.12 on 9×9 and 0.03 on 19×19. Store the normalized cumulative visits as the policy target independently of move temperature. Evaluation uses maximum visits without training noise.

The experimental Gumbel root uses sequential halving over sampled candidates, PUCT below the root and a fresh tree per move. Store the improved policy separately from raw visits. Interior search differs from full Gumbel MuZero. [Reference implementation](https://github.com/google-deepmind/mctx/blob/main/mctx/_src/policies.py)

## Data and learning

Freeze the model digest, rules, seed and search configuration per game. Save features, player, legal mask, action, visits, budget, policy target and search value. Replay before committing compressed NPZ, SGF and provenance metadata. Only completed games supply outcome and auxiliary labels. Split training and validation by whole game, deduplicate by content and verify checksums on replay. Evaluation games stay outside the training archive.

Train with masked policy cross-entropy, squared value error and explicit matrix-weight L2 regularization. Optional heads use ownership error and a score loss. SGD uses momentum 0.9, finite-number checks and gradient clipping at 5. Optional warmup, cosine decay and CUDA BF16 are configurable. Limit updates by newly collected training positions and the configured reuse ratio. Monitor sample age, gradient norm, losses and validation separately from playing strength.

A checkpoint contains learner and optimizer states, random generator states, configuration, step, sampling cursor and replay identifiers. Commit at phase boundaries, sampling batches, every 32 updates and graceful stop. Resume into a new run directory. Interrupted searches or matches may be repeated. A resumed partial round counts toward the requested number of rounds.

## Evaluation and publication

Use six-move random openings with exchanged colors. An opening pair is the statistical unit. Require all scheduled games to finish, at least 40 games, paired score ≥55%, and a one-sided lower bound strictly above 50%. With k pairs, the bound is max(0, mean − √(log(20)/(2k))). Keep rejected candidates. Independent matches and leagues produce reports without publication. Historical leagues additionally record a multiple-comparison adjusted bound. Independent confirmation remains necessary after repeated candidate selection.

Benchmark external engines under matching rules, hardware and wall-clock budgets. Freeze engine binaries, weights and configurations. Report incomplete games and overruns. Report tactical and adversarial robustness separately. [KataGo protocol](https://github.com/lightvector/KataGo/blob/master/docs/GTP_Extensions.md) · [Robustness research](https://arxiv.org/abs/2406.12843)

## Scaling and cost

Actors renew leases, pin a model per group and submit only with a valid token. Reassign expired leases and use content identifiers on retries. Multi-GPU learning uses synchronous DDP with split global batches and synchronized batch normalization. Single-node evaluation workers keep both colors of an opening pair together. S3 snapshot manifests become visible after object verification. Keep release history and an explicit rollback path.

For G games averaging L moves, S added simulations per move, fresh evaluation fraction ρ and measured throughput F, estimate self-play GPU hours as G × L × S × ρ / (3600 × F). One million games, 250 moves, 800 simulations, ρ=0.7 and F=10,000 imply roughly 3,889 inference GPU hours before training and evaluation. This is an illustrative estimate. Measure end-to-end throughput, queueing, memory, complete-game rate, sample reuse and actual resource cost over 24–72 hours before scaling.

## Operations and research

The local workbench exposes play, training, model history and evaluation through FastAPI and React. The rules/search owner maintains legality and native performance. The learner owner manages sampling, optimization and ablations. Platform work covers storage, monitoring and recovery. Independent evaluation owns release evidence.

Investigate auxiliary targets, search budgets, target pruning, global attention, Gumbel search and historical opponents through attributable changes. Preserve failed experiments, use independent seeds, and keep final evaluation separate from development. Advance through the [acceptance checklist](verification-plan.md) before committing large compute budgets.
