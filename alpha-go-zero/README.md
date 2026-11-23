# WeiQi Zero

A local Go workbench for playing against a policy-value network, generating self-play data, training candidates and evaluating frozen weights. No pretrained champion ships with this project. An initial champion is randomly initialized.

## Launch

On Windows, double-click `launch.cmd`. When the project virtual environment and built frontend are present, the launcher serves the workbench with Python directly. For a fresh installation, use Python 3.10+, Node.js 18+ and npm. A C++20 compiler enables the native rules backend. The Python implementation is available as a fallback.

```sh
node scripts/launch.mjs
```

Open [the local workbench](http://127.0.0.1:8765). Pass a port as the first argument to use another port. Set `ZERO_PYTHON` for the Node launcher to select a specific interpreter. For frontend development, run the API with `python -m zero serve --port 8765` and run `npm run dev` in `frontend/`. The Vite proxy reads `ZERO_API_PORT`.

| Workspace | Actions |
| --- | --- |
| Play | Select 9×9 or 19×19, color and opponent. Play, pass, undo, inspect visits, review moves and export SGF. Up to eight games remain in server memory. |
| Training | Configure sampling, search and learning. Inspect progress and loss, stop a job or resume from its checkpoint in a new run. |
| Models | Inspect model digests, architecture, training steps and promotion status. |
| Evaluation | Compare two frozen models with matching rules and board size, including models from different experiments. Download paired reports. |

## Run an experiment

Activate the project virtual environment first. On Windows you can also invoke `.venv\Scripts\python.exe` directly.

```sh
python -m zero config --preset quick9 --out experiment.json
python -m zero train --config experiment.json --rounds 1
python -m zero runs
python -m zero models
python -m zero stop TASK_ID
python -m zero train --resume TASK_ID --rounds 2
```

Use distinct experiment names for independent seeds. Resume an existing learner to retain momentum and progress. Repeating a seed with identical weights and search settings can reproduce archived games and yield no new update budget. The quick preset schedules one opening pair per round. Promotion requires at least 20 completed pairs and the statistical gate described in the [technical design](DOCS/technical-design.md).

| Preset | Board | Network | New simulations per move |
| --- | --- | --- | ---: |
| quick9 | 9 | 2 × 32 residual | 8 |
| baseline9 | 9 | 6 × 64 residual | 16 |
| engineering19 | 19 | 10 × 128 residual | 128 |
| reference19 | 19 | 20 × 256 residual | 1600 |
| research19 | 19 | 10 × 128 residual with auxiliary heads | 128 |
| transformer19 | 19 | 10 layers, width 384, 8 heads with auxiliary heads | 128 |

## Evaluation and distributed operation

```sh
python -m zero arena CANDIDATE_ID INCUMBENT_ID --preset engineering19 --pairs 40 --sims 256
python -m zero league MODEL_A MODEL_B MODEL_C --preset engineering19 --pairs 40
python -m zero gtp --model MODEL_ID --device cpu --sims 128
python -m zero benchmark --model MODEL_ID --katago ENGINE --weights WEIGHTS --gtp-config CONFIG --seconds 5 --pairs 40 --device cuda
```

For a timed benchmark, configure the external engine to use the same hardware. The report preserves actual move times, rules, weights and engine digests, game records and local network evaluations. Games exceeding the per-move budget by more than 10% plus 0.1 seconds are excluded from complete timed pairs.

Set `sampler` to `actors`, start a detached training job, then run `python -m zero actor TASK_ID --device cuda` for each sampling worker. All workers need the same code and a shared data directory supporting file locks and atomic renames. Synchronize clocks across hosts. Assign devices with `CUDA_VISIBLE_DEVICES`. For single-node Linux/NCCL training, set `learner_gpus` and a global batch divisible by that count. Set `arena_workers` for parallel independent opening pairs. Use `wall_minutes` for a graceful time-budget stop.

Set `WEIQI_ZERO_DATA` to change the data root. Runs contain checkpoints, logs and reports. Experiments contain the champion history, frozen weights, complete games and unfinished records. To use S3 snapshots, install `pip install -e ".[s3]"`. Upload verified objects before publishing the manifest, and restore into a new directory.

```sh
python -m zero snapshot --run TASK_ID --bucket BUCKET
python -m zero restore --manifest MANIFEST_SHA256 --bucket BUCKET --dest NEW_DATA_DIRECTORY
python -m zero rollback --experiment EXPERIMENT --model PREVIOUS_CHAMPION --expected CURRENT_CHAMPION
```

See the [development roadmap](DOCS/development-roadmap.md) and [acceptance checklist](DOCS/verification-plan.md) for current evidence and remaining work.
