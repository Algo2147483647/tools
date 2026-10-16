// Labels distinguish actual mathematical use, experimental tests and editorial comparisons.
export const bridges = `
eudoxus|archimedes-circle|Exhaustion and bounding methods provide a geometrical background
euclid|archimedes-statics|Deductive geometry is applied to idealized equilibrium
archimedes-circle|liu-hui|Compare independent polygonal approximation traditions; no direct transmission asserted
apollonius|kepler-orbits|Conic geometry later describes planetary trajectories
ptolemy|al-battani|Astronomical models and tables are revised within later observational work
aryabhata|nilakantha|Later Indian astronomy revises an inherited mathematical tradition
khwarizmi-algebra|latin-translations|A specific translation carries algebraic methods to Latin readers
ibn-haytham|kepler-orbits|Optical and astronomical mathematization are related contexts, not identical theories
khayyam|descartes|Compare geometric solution methods with later algebraic treatment of curves
qin|zhu|Polynomial algorithms develop within a continuing Chinese mathematical tradition
madhava|jyesthadeva|Later exposition is evidence for the earlier series tradition
oresme|galileo-motion|Compare geometrical treatment of varying motion; direct dependence is not established here
cardano|bombelli|Radical formulas motivate systematic arithmetic with complex quantities
kepler-orbits|newton-principia|Orbital regularities become targets for dynamical explanation
kepler-harmonic|newton-principia|The period-distance relation is explained through gravitation
galileo-motion|newton-principia|Quantitative motion studies form part of the mechanical background
newton-fluxions|newton-principia|Methods of changing quantities support the development of dynamics
leibniz-calculus|bernoulli-brachistochrone|Differential methods are applied to an optimization problem
huygens-light|young-interference|A wave account is extended through superposition and interference
pascal-fermat|bernoulli-large|Finite chance problems lead toward a theorem about repeated trials
bernoulli-brachistochrone|lagrange-variation|Optimization of curves becomes a general analytic method
lagrange-variation|lagrange-mechanics|Variational methods organize constrained mechanics
dalembert-wave|fourier-memoir|Physical differential equations motivate debates over function expansions
fourier-memoir|fourier-book|A submitted theory develops into a published treatise
fourier-book|dirichlet-series|Physical expansions lead to explicit convergence conditions
fourier-book|lebesgue|Later integration theory strengthens tools for limiting processes
gauss-orbits|laplace-probability|Error analysis and astronomical inference share probabilistic methods
green|maxwell-field|Potential theory supplies mathematical tools for field descriptions
faraday-induction|maxwell-field|Experimental induction becomes part of a mathematical field theory
maxwell-field|hertz-waves|Laboratory electromagnetic waves test a central field-theory implication
maxwell-field|einstein-relativity|Electrodynamics helps motivate a reformulation of inertial kinematics
gauss-number|dirichlet-primes|Analytic tools extend the study of arithmetic progressions
riemann-complex|riemann-zeta|Complex-function methods enter the study of primes
riemann-zeta|prime-number-theorem|Properties of the zeta function support prime-density proofs
lobachevsky|riemann-geometry|Alternative geometries form a background to a broader study of spaces
riemann-geometry|general-relativity|Metric and curvature geometry supplies the language of gravitation
hamilton-mechanics|matrix-mechanics|Classical dynamical variables are transformed into a noncommutative formalism
cayley-matrices|matrix-mechanics|An existing algebraic language is recognized in quantum transition calculations
fredholm|von-neumann-quantum|Operator methods contribute to the mathematical structure of quantum theory
banach|von-neumann-quantum|Abstract function-space methods form a shared analytical setting
carnot|clausius-thermo|Heat-engine reasoning is reworked after energy conservation
joule|clausius-thermo|Work-heat measurements constrain the new thermodynamic account
maxwell-distribution|boltzmann-h|Statistical gas models develop into a kinetic evolution theory
clausius-entropy|boltzmann-entropy|A thermodynamic quantity receives a statistical interpretation
boltzmann-entropy|gibbs-statistical|Statistical reasoning is generalized through ensembles
gibbs-statistical|shannon|Compare structurally related entropy formulas; the modeled quantities differ
stokes|einstein-brownian|Viscous mobility enters the quantitative analysis of particle fluctuations
einstein-brownian|perrin|Particle measurements test quantitative molecular predictions
markov|kolmogorov|Dependent random processes receive a broader measure-theoretic framework
lebesgue|kolmogorov|Measure theory supplies the mathematical language of probability axioms
kolmogorov|ito|Measure-theoretic probability supports stochastic calculus
planck|einstein-light|Quantized energy exchange is extended to a light-quantum hypothesis
einstein-light|compton|Scattering evidence strengthens the momentum-carrying quantum account
bose|bec|Quantum-statistical predictions are realized in dilute atomic gases
de-broglie|matter-diffraction|Electron-diffraction experiments test the matter-wave proposal
de-broglie|schrodinger|Matter-wave ideas help motivate a wave equation for quantum states
matrix-mechanics|von-neumann-quantum|Matrix and wave formulations are organized within a common mathematical framework
schrodinger|born-rule|A wave amplitude receives a probabilistic interpretation
pauli|fermi-dirac|The exclusion principle constrains statistical state counting
einstein-relativity|minkowski|Relativistic kinematics receives a four-dimensional geometric formulation
general-relativity|noether-symmetry|Problems in gravitational invariance motivate a general variational theorem
lagrange-mechanics|noether-symmetry|Variational mechanics provides the theorem's mathematical setting
general-relativity|eclipse|Astronomical observations test gravitational light deflection
general-relativity|friedmann|The field equations admit evolving cosmological solutions
friedmann|lemaitre|Related evolving models connect with observations; no simple sole-priority claim
lemaitre|hub-related|Theory and observations converge on cosmic expansion
schwarzschild|singularity|A special solution is complemented by a general geometric theorem
singularity|hawking|Classical gravitational limits motivate quantum questions about black holes
cantor-diagonal|godel|Compare diagonal constructions in different formal settings
godel|church-turing|Limits on formal proof are followed by precise limits on computation
boole|shannon|Symbolic and information methods enter the mathematics of communication
rutherford-nucleus|bohr|A concentrated nucleus is combined with quantized atomic states
neutron|fission-observation|Neutron irradiation enables new nuclear-reaction investigations
fission-observation|fission-explanation|Chemical findings receive a physical interpretation as nuclear splitting
fission-explanation|manhattan-impact|Nuclear research is mobilized for wartime weapons with catastrophic consequences
parity-proposal|parity-test|The proposed symmetry test is carried out experimentally
superconductivity|bcs|A microscopic many-body theory explains conventional superconductivity
yang-mills|electroweak|Non-Abelian gauge structures enter electroweak models
yang-mills|qcd|Non-Abelian gauge structures describe strong interactions
yang-mills|donaldson|Gauge-field equations become tools for four-manifold geometry
symmetry-breaking|standard-renormalization|Broken gauge models become controlled quantum theories
symmetry-breaking|higgs-observation|A predicted sector is tested by particle discovery decades later
quarks|qcd|Constituent classification becomes part of a dynamical gauge theory
epr|bell|Questions about correlations become experimentally testable inequalities
bell|aspect|Photon experiments test bounds on local hidden-variable models
aspect|bell-loopholes|Later tests close major experimental loopholes together
bell-loopholes|top-entanglement|Compare entanglement evidence in very different experimental regimes
riemann-geometry|atiyah-singer|Differential geometry meets operator analysis in a global theorem
atiyah-singer|donaldson|Analysis and topology meet again through gauge-theoretic methods
quantum-hall|tknn|A precise measured conductance receives a topological explanation
tknn|jones-witten|Topology and quantum theory interact in distinct mathematical settings
grothendieck|mirror-symmetry|Algebraic-geometric questions meet string-theoretic calculations
string-anomalies|mirror-symmetry|String-theory structures lead to mathematical predictions
feynman-simulation|shor|A computational research program develops a concrete quantum algorithm
rsa|shor|Efficient quantum factoring changes the assumptions of widely used cryptography
four-color|formal-four-color|A computer-assisted theorem receives formal proof verification
formal-four-color|flyspeck|Formal verification scales to another major geometric proof
fermat-margin|wiles|A long-standing claim is finally proved through modern modularity methods
general-relativity|gw-detection|Relativistic wave predictions meet direct detector evidence
gw-detection|gw-announcement|Detection precedes public announcement and research publication
gw-announcement|multimessenger|Gravitational-wave astronomy gains an electromagnetic counterpart
sphere-eight|sphere-twentyfour|The analytic sphere-packing method is extended collaboratively
quantum-hall|si-redefinition|Quantum electrical standards support realization of constant-based units
laser-cooling|bec|Ultracold experimental methods enable dilute-gas condensation
`
  .trim()
  .split("\n")
  .map((line) => line.split("|"));

export const intersections = new Set([
  "archimedes-statics",
  "archimedes-buoyancy",
  "eratosthenes",
  "ptolemy",
  "aryabhata",
  "nilakantha",
  "ibn-haytham",
  "oresme",
  "kepler-orbits",
  "newton-principia",
  "bernoulli-brachistochrone",
  "lagrange-mechanics",
  "dalembert-wave",
  "fourier-memoir",
  "fourier-book",
  "green",
  "hamilton-mechanics",
  "maxwell-field",
  "maxwell-distribution",
  "boltzmann-entropy",
  "gibbs-statistical",
  "einstein-brownian",
  "minkowski",
  "general-relativity",
  "noether-symmetry",
  "matrix-mechanics",
  "schrodinger",
  "born-rule",
  "von-neumann-quantum",
  "yang-mills",
  "lorenz",
  "singularity",
  "renormalization-group",
  "bkt",
  "tknn",
  "donaldson",
  "jones-witten",
  "mirror-symmetry",
  "feynman-simulation",
  "shor",
  "bell",
]);
