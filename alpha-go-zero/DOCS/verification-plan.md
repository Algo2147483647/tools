# Integrated acceptance checklist

These checks are pending. Build and startup evidence alone does not establish rules correctness, recoverability or playing strength.

| Gate | Procedure | Evidence required |
| --- | --- | --- |
| G1-01 · Installation and rules | Install in clean Windows and Linux environments. Launch with default and custom ports. Compare native and Python rules on capture, suicide, ko, triple ko, neutral areas, two passes and komi. Replay seeded random games. | Toolchain, active backend, launch records, move-by-move agreement on legality, board, player and final ownership. |
| G1-02 · Lifecycle | Stop during sampling, learning and evaluation. Restart the service and resume into a new run. Interrupt publication between the match report and champion update. | Source files preserved, continuous steps and optimizer state, reproducible recovery boundary, idempotent publication and exclusive task ownership. |
| G1-03 · Data and learning loop | Check value signs, visit inheritance, legal masks, noise isolation, D4 transforms and normalized targets. Replay NPZ and SGF. Resubmit duplicates, truncate a game and corrupt a copy. Run one complete 9×9 iteration from random weights. | Matching replay, no duplicate update credit, no outcome labels on unfinished games, corruption isolated, frozen candidate, paired report and independently recomputed gate. |
| G1-04 · Workbench | Exercise both colors and sizes, AI replies, review, undo, pass, SGF, refresh, stop, resume and report download. Inspect desktop and narrow layouts, keyboard controls, labels and error states. | Reproducible observations for each platform, screen size and failure path. |

For each check record date, operator, code digest, configuration, hardware, seed, data directory, artifacts, failures and limitations. Demonstrate learning separately with independent seeds and frozen opponents.

## Scale-up acceptance

1. Initialize 19×19 independently. Run a 24–72 hour benchmark and record end-to-end costs and completed games.
2. Exercise actor expiry, duplicate claims, stale submissions, storage exhaustion and interrupted snapshot uploads. Restore into a fresh directory and compare hashes.
3. Compare DDP against single-device updates with matched global batches. Check synchronized normalization, mixed precision, gradients, restoration and paired strength.
4. Operate for at least seven days with failure drills and budget stops. Compare pooled and serial evaluation schedules and verify league correction.
5. Freeze strong public opponents, rules, devices and time controls. Publish complete pairs, failures, actual move times and robustness results separately from headline strength.
