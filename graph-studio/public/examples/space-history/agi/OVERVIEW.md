# The historical development of AGI research

General machine intelligence is a research objective, not a single algorithm. Its history depends on what researchers choose to generalize: a problem-solving procedure, a learned representation, a policy, a cognitive architecture, or the ability to acquire unfamiliar skills. Keeping these targets separate explains why apparently rival approaches repeatedly reconnect.

The timeline covers technical results, prototypes, theories, institutions, evaluations and critiques. These event types have different evidential roles. A theorem establishes a conditional mathematical result; a benchmark establishes performance under a protocol; a prototype establishes a working combination; a founding statement establishes an intention. None can simply substitute for the others.

The canvas combines 231 point milestones with 25 duration bars. Five bars describe research programs or bounded development efforts; twenty show overlapping research phases. The [period guide](./PERIODS.md) explains each interval and its boundaries. A phase ending at a selected milestone does not imply that the field stopped there. The recent phase endpoints are the historical evidence cutoff, not forecasts or declared completion dates.

## 1666 to 1950: reasoning becomes a possible object of computation

Leibniz's combinatorial project is an intellectual antecedent, not an early implementation of AI. Boole and Frege subsequently make logical structure more explicit. In the twentieth century, Church and Turing give effective computation precise formulations while Godel and computability theory establish limits. These limits make the question sharper: which reasoning processes can be represented, learned and executed with available resources?

A separate but intersecting development studies adaptive systems. Formal neurons suggest computation by networks; Hebbian ideas link learning to connection changes. Cybernetics emphasizes feedback, while information theory formalizes communication and prediction without claiming to solve meaning. Turing's 1948 report and 1950 paper connect learning machines to questions of intelligent behavior. The foundations therefore contain both symbolic and adaptive traditions from the outset.

[Turing defines universal computation](https://doi.org/10.1112/plms/s2-42.1.230) · [Formal neurons connect networks and logic](https://doi.org/10.1007/BF02478259) · [Turing proposes the imitation game](https://doi.org/10.1093/mind/LIX.236.433)

## 1955 to 1973: the general program meets restricted worlds

The Dartmouth proposal places language, abstraction, neural networks and self-improvement on one agenda. Logic Theorist and GPS turn parts of this agenda into heuristic symbolic search. McCarthy's common-sense program imagines a system that can accept knowledge and reason beyond a fixed set of instructions. Lisp, resolution and Prolog provide ways to implement symbolic manipulation and inference.

Parallel projects learn from experience. Samuel's checkers program adapts its evaluation, the perceptron learns a classifier, and ADALINE connects learning to numerical error correction. Meanwhile, Shakey and STRIPS connect reasoning to action, and SHRDLU demonstrates language linked to a small world. The key limitation is not that these systems do nothing useful; it is that task representations, knowledge, rules or environments are carefully supplied.

The frame problem exposes difficulties in representing ordinary action. ALPAC and Lighthill question progress in particular institutional settings. These episodes help explain the first downturns in enthusiasm, but they should not be drawn as one worldwide date at which AI ceased. Neural-network limitations, translation policy and combinatorial planning are different problems with different histories.

[The Dartmouth AI proposal is submitted](https://www-formal.stanford.edu/jmc/history/dartmouth/dartmouth.html) · [General Problem Solver separates goals and operators](https://bitsavers.trailing-edge.com/pdf/rand/ipl/P-1584_Report_On_A_General_Problem-Solving_Program_Feb59.pdf) · [STRIPS formalizes action planning](https://doi.org/10.1016/0004-3702(71)90010-5) · [The Lighthill report criticizes AI generalization](https://www.chilton-computing.org.uk/inf/literature/reports/lighthill_report/p001.htm)

## 1974 to 1993: knowledge engineering grows while alternatives mature

Expert systems improve performance by concentrating on what specialists know. DENDRAL, MYCIN and R1 show the value of domain constraints and rules. Frames, default reasoning and Cyc attempt to supply missing background structure. Operational experience also reveals how costly it is to elicit, revise and maintain that knowledge. The later contraction of specialized AI businesses belongs to this history, but it does not erase their contributions or explain every research funding change.

Connectionism develops in parallel. Reverse differentiation has a numerical history before its widespread neural use. Hopfield and Boltzmann networks connect learning to energy-based models. The 1986 backpropagation work helps make learned internal representations compelling, and early convolutional systems demonstrate practical recognition. ACT and Soar, meanwhile, continue to seek integrated cognition rather than isolated predictors.

Probability and decision theory gain practical influence through Bayesian networks, hidden Markov models, temporal-difference learning and Q-learning. Brooks challenges the assumption that all intelligent behavior must pass through a complete centralized representation. Arguments about systematicity, the Chinese Room and symbol grounding sharpen different questions: compositional competence, semantic understanding and connection to the world. These critiques do not all make the same claim.

[R1's maintainers report the cost of sustained expertise](https://doi.org/10.1609/aimag.v5i3.445) · [Backpropagation popularizes learned internal representations](https://doi.org/10.1038/323533a0) · [Soar presents an architecture for general intelligence](https://doi.org/10.1016/0004-3702(87)90050-6) · [Bayesian networks organize uncertain reasoning](https://doi.org/10.1016/C2009-0-27609-4) · [The symbol grounding problem is formulated](https://doi.org/10.1016/0167-2789(90)90087-6)

## 1994 to 2012: specialized success and explicit AGI programs coexist

Statistical learning develops methods with clearer assumptions and strong task performance. Support-vector machines, neural language models and practical convolutional networks make useful prediction a central research activity. Deep Blue and Watson demonstrate impressive specialist or domain-bounded competence. Their importance is real without treating either as a whole general mind.

Research explicitly addressing generality persists. NARS starts from limited resources and revisable knowledge; AIXI combines ideal induction and decision theory; cognitive architectures integrate functions; the AGI volume and conference provide a shared forum. These projects differ substantially in what they consider the essential problem. An ideal mathematical agent, a cognitive simulation and a resource-bounded reasoning engine cannot be ranked on a single ordinary benchmark without additional assumptions.

Other necessary ingredients mature: LSTM improves temporal learning, evolutionary methods search structures, hierarchical RL represents skills, and robotics combines perception with action. ImageNet and programmable GPUs then change the experimental scale. AlexNet's success reflects a convergence of algorithmic choices, training infrastructure and data, not an isolated invention that rendered all previous research irrelevant.

[NARS starts from insufficient knowledge and resources](https://www.cis.temple.edu/~pwang/Publication/thesis.pdf) · [AIXI joins universal induction and sequential decision](https://arxiv.org/abs/cs/0004001) · [The first AGI conference opens](https://agi-conf.org/2008/) · [ImageNet supplies large-scale visual training data](https://www.image-net.org/static_files/papers/imagenet_cvpr09.pdf) · [AlexNet transforms large-scale visual recognition](https://papers.nips.cc/paper/4824-imagenet-classification-with-deep-convolutional-neural-networks)

## 2013 to 2017: representation learning meets search and control

Deep networks become reusable components across recognition, generation and decision making. DQN connects learned visual features to action values. AlphaGo combines policies, value estimates and tree search; AlphaGo Zero removes human game demonstrations under known rules; AlphaZero reuses a method across several games. These advances demonstrate different degrees of generality, and separately trained game models should not be confused with one lifelong learner.

Sequence-to-sequence learning and attention make language generation more flexible. Residual connections improve trainability. The Transformer then provides a parallelizable architecture that later spans language and other modalities. Meta-learning and continual-learning research address a different issue from raw task accuracy: how experience changes an agent's ability to learn without destroying old capabilities.

Safety research also becomes more technical. Reward design, side effects and distribution shifts are framed as experimental problems. Human preference learning offers an alternative to hand-written rewards. These developments later become tightly connected to instruction-following models rather than remaining a separate philosophical discussion.

[DQN demonstrates one learning method across Atari games](https://doi.org/10.1038/nature14236) · [AlphaGo combines policy value and tree search](https://doi.org/10.1038/nature16961) · [AlphaZero applies a common method to three games](https://arxiv.org/abs/1712.01815) · [The Transformer organizes sequences through attention](https://arxiv.org/abs/1706.03762) · [Human preferences become a learned reward signal](https://arxiv.org/abs/1706.03741)

## 2018 to 2022: pretrained models become broad interfaces

GPT, BERT and ULMFiT demonstrate several routes to language transfer. GPT-2 and GPT-3 move more task specification into the context supplied at inference time. Scaling studies quantify relationships among data, model size and computation, while Chinchilla revises the allocation of those resources. A predictable change in language loss is not identical to a predictable change in every downstream skill.

The term foundation model captures the ability to adapt a broad pretrained base. CLIP connects visual recognition to language; code models connect text to executable artifacts; retrieval adds a knowledge source outside the weights. Gato tests one shared policy across very different task and output types. These are substantive steps toward broader systems, while ARC asks whether stored competence is being mistaken for efficient acquisition of unfamiliar skills.

Instruction tuning and preference-based post-training make models more useful to people. Chain-of-thought prompting and ReAct introduce intermediate computation and interactive tool loops. ChatGPT's public release makes these systems widely accessible. In parallel, Dreamer, joint-embedding proposals and robotic policies develop ways to connect prediction to the physical or simulated world. Language-centered and embodied programs now share more components without becoming identical.

[GPT-3 demonstrates broad in-context few-shot learning](https://arxiv.org/abs/2005.14165) · [Chinchilla revises compute-optimal training allocations](https://arxiv.org/abs/2203.15556) · [Gato uses shared weights across diverse modalities and tasks](https://arxiv.org/abs/2205.06175) · [ARC evaluates skill-acquisition efficiency](https://arxiv.org/abs/1911.01547) · [ReAct interleaves reasoning and environmental action](https://arxiv.org/abs/2210.03629) · [ChatGPT brings conversational models to public use](https://openai.com/index/chatgpt/)

## 2023 to 2025: the unit of capability becomes the whole system

Multimodal models and broader open-weight access enlarge the research ecosystem. Agent systems add retrieval, tools, memory, skill libraries and iterative planning around a base model. Repository repair, desktop tasks and human-calibrated task horizons expose failure modes that short question-answer benchmarks miss. The capability of a complete agent depends on its model, interface, memory, permissions, evaluator and computational budget.

Reasoning improves through search, process feedback, reinforcement learning, verifier-guided refinement and greater inference computation. AlphaGeometry and AlphaProof show the continued value of symbolic deduction and formal checking. FunSearch and AlphaEvolve connect generated programs with executable evaluation. These systems are important convergences: explicit search and validation return inside neural systems rather than simply disappearing.

Robotics and world models also diversify. Vision-language-action policies connect pretrained representations with control; shared robot datasets broaden experience; video prediction and interactive generation investigate different ways to model environments. None of these requires assuming that visually plausible generation is a faithful physical simulator. Alignment experiments simultaneously examine hidden objectives, evaluation awareness and consequential agent behavior.

[SWE-bench evaluates repository-level software repair](https://arxiv.org/abs/2310.06770) · [METR measures autonomous task time horizons](https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/) · [DeepSeek-R1 studies reinforcement learning for reasoning](https://arxiv.org/abs/2501.12948) · [AlphaGeometry combines learned proposals and symbolic deduction](https://doi.org/10.1038/s41586-023-06747-5) · [AlphaEvolve combines language models and evolutionary evaluation](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/) · [V-JEPA 2 links video prediction and planning](https://arxiv.org/abs/2506.09985)

## 2026 snapshot: learning efficiency, verification and research automation

The selected 2026 entries extend the history rather than claim a final destination. Research-level mathematical agents and First Proof make expert scrutiny especially visible. Formalization connects generated mathematical artifacts to machine checking. ARC-AGI-3 makes exploration and rule discovery interactive; its later Astra report shows why the harness and retained state must be included in a capability comparison.

Research-automation measurements distinguish collaboration, AI-led work under supervision and fully autonomous successor creation. Reports of unintended agent actions make another distinction unavoidable: completing a task and completing it under the intended constraints are different success criteria. Provider reports are attributed accounts with bounded evidence. The timeline therefore ends with documented advances and open questions, not an invented consensus date for AGI.

[First Proof exposes research-level verification demands](https://openai.com/index/first-proof-submissions/) · [ARC-AGI-3 introduces interactive adaptation environments](https://arcprize.org/blog/arc-agi-3-launch) · [ARC Prize reports strong harness-dependent Astra results](https://arcprize.org/blog/astra) · [AI-led research and development is measured separately](https://www.anthropic.com/institute/measuring-pace-of-ai-development) · [Unintended agent actions become a documented research object](https://www.anthropic.com/research/investigating-unintended-model-actions)

## What remains open across the entire history

| Question | What historical progress establishes | What still needs separate evidence |
| --- | --- | --- |
| Breadth | Shared representations and models cover many tasks | Reliable competence on unfamiliar tasks and distributions |
| Learning efficiency | Meta-learning, priors and in-context adaptation reduce examples in selected settings | Broad adaptation under explicit experience and compute budgets |
| Memory | Recurrent state, external stores and skill libraries preserve information | Reliable continual learning without catastrophic interference |
| Reasoning | Search, learned proposals and checkers solve difficult problems | Valid long arguments when no convenient verifier or answer exists |
| World models | Prediction and simulation support control | Causal consistency and transfer under physical intervention |
| Autonomy | Agents execute longer tool-mediated workflows | Robust recovery, constraint adherence and appropriate escalation |
| Self-improvement | AI assists code, algorithms and portions of research | Sustained, independently evaluated autonomous creation of better successors |
| Alignment | Preference learning and oversight shape behavior | Reliable behavior under novel incentives and consequential deployment |

These are overlapping questions, not a checklist whose completion automatically defines intelligence. Different AGI definitions assign them different weights. The value of the historical map is to show the evidence and connections behind those choices.

[Open the timeline](./agi-history.json) · [All events](./CATALOG.md) · [Sources](./SOURCES.md)
