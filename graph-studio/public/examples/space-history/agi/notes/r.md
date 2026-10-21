# Reinforcement learning search and self-play

This strand studies decisions whose consequences unfold over time. Dynamic programming supplies recursions; temporal-difference learning estimates value from experience; Q-learning and policy gradients provide different optimization routes. Partial observability and temporal abstraction address hidden state and reusable skills.

Self-play runs from Samuel and TD-Gammon to AlphaGo and its successors. DQN learns visual features together with values. AlphaGo combines learned evaluation with explicit search, AlphaZero reuses the method across games, and MuZero learns decision-relevant dynamics. The timeline distinguishes a common algorithm trained separately from one policy spanning tasks.

Dyna and world-model methods reconnect planning with learned experience. Later language-model reinforcement learning borrows optimization machinery, but its rewards, action spaces and verification differ from games. A strong result under fixed rules does not establish reliable learning in arbitrary real environments.

[Dynamic programming organizes sequential decisions](https://press.princeton.edu/books/paperback/9780691146683/dynamic-programming) · [Temporal-difference learning updates predictions](https://doi.org/10.1007/BF00115009) · [DQN demonstrates one learning method across Atari games](https://doi.org/10.1038/nature14236) · [AlphaZero applies a common method to three games](https://arxiv.org/abs/1712.01815) · [MuZero learns dynamics useful for search](https://arxiv.org/abs/1911.08265)

## Events in this strand

- **1950 — Chess becomes heuristic search**. Method. [Source](https://doi.org/10.1080/14786445008521796).
- **1957 — Dynamic programming organizes sequential decisions**. Theory. [Source](https://press.princeton.edu/books/paperback/9780691146683/dynamic-programming).
- **1959 — Samuel demonstrates learning through checkers**. System. [Source](https://doi.org/10.1147/rd.33.0210).
- **1973 — Partially observable decisions use belief states**. Theory. [Source](https://doi.org/10.1287/opre.21.5.1071).
- **1988 — Temporal-difference learning updates predictions**. Method. [Source](https://doi.org/10.1007/BF00115009).
- **1989 — Q-learning estimates action values**. Method. [Source](https://www.cs.rhul.ac.uk/~chrisw/new_thesis.pdf).
- **1990 — Dyna combines acting learning and planning**. Method. [Source](https://mlanthology.org/icml/1990/sutton1990icml-integrated/).
- **1992 — REINFORCE estimates policy gradients**. Method. [Source](https://doi.org/10.1007/BF00992696).
- **1992 — TD-Gammon learns evaluation through self-play**. System. [Source](https://research.ibm.com/publications/practical-issues-in-temporal-difference-learning).
- **1999 — Options formalize temporal abstraction**. Method. [Source](https://doi.org/10.1016/S0004-3702(99)00052-1).
- **2006 — UCT allocates Monte Carlo search effort**. Method. [Source](https://doi.org/10.1007/11871842_29).
- **2013 — DQN connects pixel inputs to learned decisions**. Method. [Source](https://arxiv.org/abs/1312.5602).
- **2015-02-25 — DQN demonstrates one learning method across Atari games**. System. [Source](https://doi.org/10.1038/nature14236).
- **2016-01-27 — AlphaGo combines policy value and tree search**. System. [Source](https://doi.org/10.1038/nature16961).
- **2017 — PPO simplifies practical policy optimization**. Method. [Source](https://arxiv.org/abs/1707.06347).
- **2017-10-18 — AlphaGo Zero learns Go from self-play**. System. [Source](https://doi.org/10.1038/nature24270).
- **2017-12-05 — AlphaZero applies a common method to three games**. System. [Source](https://arxiv.org/abs/1712.01815).
- **2019 — AlphaStar reaches strong real-time strategy performance**. System. [Source](https://doi.org/10.1038/s41586-019-1724-z).
- **2019 — MuZero learns dynamics useful for search**. System. [Source](https://arxiv.org/abs/1911.08265).
- **2021 — Decision Transformer casts control as sequence modeling**. Method. [Source](https://arxiv.org/abs/2106.01345).

[Historical overview](../OVERVIEW.md) · [Complete timeline](../agi-history.json) · [All events](../CATALOG.md)

## Duration bars in this strand

- **1988 to 1999 — Reinforcement learning and temporal abstraction**. Research phase. The period links foundational updates to planning, self-play and hierarchical action over more than a decade of development.
- **1989 to 1997-05-11 — IBM chess research through the Deep Blue victory**. Research program. The victory becomes the endpoint of a sustained engineering program rather than an isolated event, clarifying the role of search, domain knowledge and computing resources.
- **2013 to 2017-12-05 — Deep reinforcement learning and self-play**. Research phase. Successive systems reveal how data, search, learned evaluation and known environment rules jointly support performance.

[Interval accounts and boundary conventions](../PERIODS.md).
