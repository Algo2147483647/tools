# 弈零 · AlphaGo Zero 围棋研究台

本地围棋对弈和自我训练工程。可以执黑或执白与指定网络下棋，也可以从随机权重启动独立实验，保留完整自弈棋谱、训练检查点、冻结模型和成对比赛报告。9 路与 19 路有独立的模型规格和数据目录。

**交付状态（2026-11-24）**　已完成本机 Windows 原生扩展编译、Python 源码编译、前端类型检查、生产构建与服务启动。此次交付没有训练权重或实测棋力。集中验收、长时间运行和强公开模型对照仍待执行。用户原方案中的 32 项测试和旧运行统计属于另一份工程记录。

## 打开工作台

在 Windows 双击 `launch.cmd`，或在本目录运行下面的命令。首次安装需要 Python 3.10 或更新版本、Node.js 18 或更新版本、npm，以及依赖下载网络。Python 环境优先使用本目录的 `.venv`。安装时可编译 C++20 扩展，缺少编译器时使用 Python 规则实现。

```sh
node scripts/launch.mjs
```

打开 [本地工作台](http://127.0.0.1:8765)。启动器将 React 生产页面和 API 放在同一端口。已有服务时可直接打开页面。也可以用 `node scripts/launch.mjs 8877` 选择其他端口，或用 `ZERO_PYTHON` 指向已安装项目依赖的解释器。

工作台的四个入口：

| 入口 | 操作 |
| --- | --- |
| 对弈 | 选择棋盘、执子与模型，点击「开始对弈」。支持落点访问分布、停着、悔棋、逐手回看和 SGF 下载。未选择模型时，会标明随机初始化。 |
| 训练 | 选择预设、种子、采样和训练预算。可看阶段、损失曲线和日志，请求停止，从完整检查点新建续训任务。 |
| 模型 | 查看实验、网络结构、训练步、权重摘要、候选结果与当前冠军。初始冠军仍标为随机初始。 |
| 评估 | 选择同一尺寸和规则的两个冻结模型。支持跨实验、跨网络结构比较，展示完整开局对、成对下界和独立报告。 |

对局保存在服务内存中，最多保留八盘。刷新页面可回到该标签页的棋局。训练任务由独立进程执行，状态写入磁盘。关闭网页后可从任务记录继续查看。

## 训练与恢复

以下命令供后续实际运行使用。先激活项目虚拟环境，或将命令中的 `python` 替换为 Windows 的 `.venv\Scripts\python.exe` 或 Linux 的 `.venv/bin/python`。

```sh
python -m zero train --preset quick9 --experiment seed7 --seed 7 --rounds 1
python -m zero runs
python -m zero models
python -m zero stop TASK_ID
python -m zero train --resume TASK_ID --rounds 2
```

第一次使用新的实验名和网络规格时会冻结随机初始冠军。一个实验名对应同规格的一条冠军发布历史。做独立种子对照时，每个种子采用新的实验名。接着训练现有 learner 时请用「从检查点续训」。在同一实验从头重复相同的种子、轮次和权重可能命中已有棋谱，重复局面不会增加本轮训练额度。

| 预设 | 棋盘 | 主干 | 自弈新增模拟／手 | 用途 |
| --- | --- | --- | ---: | --- |
| quick9 | 9 | 2 × 32 残差 | 8 | CPU 调试与本地操作 |
| baseline9 | 9 | 6 × 64 残差 | 16 | 小盘学习曲线 |
| engineering19 | 19 | 10 × 128 残差 | 128 | 大盘资源校准 |
| reference19 | 19 | 20 × 256 残差 | 1600 | 经典方法对照 |
| research19 | 19 | 10 × 128 残差，归属与分差辅助头 | 128 | 辅助损失消融 |
| transformer19 | 19 | 10 层、384 维、8 头 Transformer，含辅助头 | 128 | 主干对比 |

`reference19` 使用本工程固定的 TT 规则、合法动作策略损失、访问统计与成对晋级协议，与原论文的完全复现仍有差异。各预设可通过工作台或 `--config experiment.json` 配置。`python -m zero config --preset research19` 可以导出完整 JSON。默认 `quick9` 每轮只安排一对评估局，适合调试，晋级需要满足正式门槛。

训练采用 SGD 与动量，可配置预热、余弦衰减和 CUDA BF16。每轮实际更新数取配置上限与新增训练局面所支持上限的较小值。达到 `wall_minutes` 用时预算时申请有序停止，0 表示不限。检查点保留 learner、优化器、CPU/CUDA 与 NumPy 随机状态、训练步、阶段、回放清单和采样游标。每个自弈批次、阶段边界、每 32 个更新以及有序停止时提交。意外退出后从最后一次完整提交继续，进行中的搜索或比赛可能重算。在中途检查点续训时，当前未完成的一轮计入请求轮数。

## 数据、搜索与比赛

规则为 Tromp–Taylor、位置超级劫、白贴 7.5 目，连续两次停着结束。合法性按完整局面历史判断。多子自杀受位置超级劫约束。输入为八帧双方棋子和行棋颜色共 17 个平面。盘面、策略、合法掩码及归属标签一起进行 D4 变换。[规则原文](https://tromp.github.io/go.html)

PUCT 的边值按父节点视角保存，每手增加指定的模拟次数。对弈双方使用不同模型时搜索树独立。训练根节点加入 Dirichlet 噪声，棋谱目标使用累计访问比例。多盘自弈可让不同棋盘的叶子共用一批网络推理。研究配置可将 `selfplay_search` 设置为 `gumbel_root`，在根节点做 Gumbel 候选采样与逐轮减半，内部继续使用 PUCT。该分支逐手建立新根，学习目标为干净先验与补全 Q 值的改进策略，归档同时保留实际访问次数。两种采样方法仍以相同的无噪声 PUCT 协议比赛。[Gumbel 策略参考](https://github.com/google-deepmind/mctx/blob/main/mctx/_src/policies.py)

完整对局重放通过后写入 NPZ、SGF 和来源清单。达到看门狗手数的对局进入 `unfinished/`，不会产生终局训练标签。训练／验证按整盘内容标识固定分组。训练窗口可以截取最老一盘的末段。回放读取会核对分片 SHA-256，发现校验和不符会中止并隔离损坏的分片。

内部比赛对同一六手开局交换颜色。晋级要求全部比赛完成、至少 20 对、成对得分率达到 55%，且成对得分的单侧 Hoeffding 95% 下界严格高于 50%。发布时核对预期冠军摘要。独立评估只写报告。研究分支在等资源、多种子和独立比赛上的收益仍待测量。[辅助训练研究](https://arxiv.org/abs/1902.10565)

```sh
python -m zero arena CANDIDATE_ID INCUMBENT_ID --preset engineering19 --pairs 40 --sims 256
python -m zero league MODEL_A MODEL_B MODEL_C --preset engineering19 --pairs 40 --sims 256
python -m zero gtp --model MODEL_ID --device cpu --sims 128
python -m zero benchmark --model MODEL_ID --katago PATH_TO_KATAGO --weights KATAGO_WEIGHTS --gtp-config GTP_CFG --seconds 5 --pairs 40 --device cuda
```

外部基准使用本机指定的 KataGo 可执行文件、配置和权重，记录三者摘要、版本、规则、实际逐手耗时、己方网络调用量和棋谱。运行前应在 KataGo 配置中指定与己方相同的计算设备，保留其实际设备日志。双方各获得相同的每手时间预算。本工具对超过预算 10% 加 0.1 秒的对局标记超时并排除出完整开局对统计；报告同时保留实际盘面结果。跨引擎报告独立保存在 `data/benchmarks/`。[KataGo GTP 接口](https://github.com/lightvector/KataGo/blob/master/docs/GTP_Extensions.md)

历史联赛对选定的冻结模型做全循环比赛，分对手保存报告及所有比较的校正下界。设置 `arena_workers` 可在本机建立独立评估进程池，每个开局对的两盘棋交给同一进程。CUDA 进程轮流使用可见设备。相同 GPU 上同时运行多个网络副本会增加显存占用。联赛与独立比赛都不会更改冠军指针。

## 采样节点、多卡训练与归档

`sampler=local` 在本进程完成多盘采样。`sampler=actors` 由训练进程生成分组租约，需要启动一个或多个采样节点。各进程须指向同一个支持跨进程文件锁和原子改名的数据目录。跨机部署还要求共享文件系统具备这些语义，节点时钟同步，且各节点运行同一版代码。GPU 分配由部署者通过 `CUDA_VISIBLE_DEVICES` 指定。

```sh
python -m zero train --config experiment.json --rounds 10 --detach
python -m zero actor TASK_ID --device cuda
```

actor 固定模型与种子领取一批对局，工作期间续租。租约到期可重新领取，只有持有有效令牌的节点能提交结果。归档内容标识和采样批次身份共同控制重试与新增统计。CPU actor 可与 GPU learner 配合使用。将 `learner_gpus` 设为大于 1 的值，可启用单机 Linux/NCCL 同步 DDP。全局批次须能被卡数整除。各卡分摊全局批次，共享 BatchNorm 统计，由 rank 0 发布检查点。DDP 不自动跨主机调度。

安装 `pip install -e ".[s3]"` 后，可以把一次任务及其所属实验的冻结版本和分片快照写入指定 S3 桶。先校验数据对象，最后发布内容寻址清单，恢复到全新目录。凭据使用运行环境的 AWS 配置。主训练路径仍以本地或共享文件系统读写。

```sh
python -m zero snapshot --run TASK_ID --bucket BUCKET
python -m zero restore --manifest MANIFEST_SHA256 --bucket BUCKET --dest NEW_DATA_DIRECTORY
python -m zero rollback --experiment EXPERIMENT --model PREVIOUS_CHAMPION --expected CURRENT_CHAMPION
```

## 目录与验证

| 路径 | 内容 |
| --- | --- |
| `cpp/`、`zero/game.py` | C++20 / pybind11 规则内核、Python 规则路径、特征和 SGF |
| `zero/network.py`、`zero/mcts.py`、`zero/gumbel.py` | 网络、批量叶推理、搜索与策略目标 |
| `zero/selfplay.py`、`zero/pipeline.py`、`zero/arena.py` | 数据、训练恢复和成对评估 |
| `frontend/`、`zero/api.py` | React / TypeScript 工作台和本地 API |
| `data/runs/<id>/` | 任务配置、环境、日志、检查点和比赛报告 |
| `data/experiments/<实验名>-<规格摘要>/` | 冠军指针、冻结权重、完整与截断棋谱 |
| `DOCS/` | [原始技术方案](DOCS/technical-design.md)、[本目录开发阶段表](DOCS/development-roadmap.md)、[待执行验收清单](DOCS/verification-plan.md) |

可用 `WEIQI_ZERO_DATA` 指定数据根目录。开发模式可运行 `python -m zero serve --port 8765`，再进入 `frontend/` 运行 `npm run dev`。Vite 将 `/api` 请求转发到 `ZERO_API_PORT` 指定的后端端口，默认 8765。
