# Development roadmap

Status for this independent checkout. The November 23 design assumed 3–5 contributors and 4–8 development GPUs. Schedule estimates describe planning assumptions. Historical reports of 32 tests and a two-game run refer to another checkout.

| Stage | Planning window | Implementation and outstanding evidence |
| --- | --- | --- |
| P0 · Rules and protocol | Weeks 1–2 | C++ and Python rules, exact superko, area scoring, 17 planes and SGF. Native compilation recorded. Fixed positions and randomized rule comparisons remain open. |
| P1 · 9×9 learning loop | Weeks 3–5 | Search, self-play, training, checkpoints and paired promotion implemented. End-to-end recovery and repeatable multi-seed learning gains remain open. |
| P2 · Local workbench | Overlaps P1 | Four workspaces, task control, resume and launcher implemented. Windows service startup and frontend build recorded. Browser and cross-platform acceptance remain open. |
| G1 · Integrated acceptance | Before scale-up | Next stage. Record reproducible results for rules, data quality, job lifecycle and the user interface. |
| P3 · 19×19 baseline | Weeks 6–9 | Size-specific networks, shared inference and data metrics implemented. Measure a recoverable 19×19 run, throughput and cost over 24–72 hours. |
| P4 · Continuous training | Weeks 10–14 | Actors, leases, single-node DDP, snapshots, independent evaluation workers, leagues and rollback implemented. Validate failure handling and seven days of operation. Cross-host learner orchestration remains future work. |
| P5 · Research | Week 15 onward | Auxiliary heads, Transformer, Gumbel root and timed KataGo matches available as experimental paths. Equal-cost ablations, external matches and robustness evidence remain open. |

## Immediate decision

Execute G1-01 through G1-04 in the [acceptance checklist](verification-plan.md). Close critical correctness or recovery defects before allocating resources to P3. Record implementation, verification and playing strength separately.

## Later milestones

Profile search and rules before adding incremental strings or undo stacks. Compare batch sizes and measure sample age, reuse, throughput and memory. Reassign failed actors, interrupt uploads, restore snapshots, and compare single-GPU and DDP recovery. Validate expected-champion publication and historical league statistics. Use frozen configurations, independent seeds and held-out opponents for research comparisons. Retain failed runs and stop at the configured budget.
