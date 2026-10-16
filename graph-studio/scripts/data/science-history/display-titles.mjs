// Concise canvas labels; the full historical heading remains in each node's fullTitle field.
export const displayTitles = Object.fromEntries(
  `
old-babylonian|Old Babylonian problem solving
plimpton|Plimpton 322: right-triangle numbers
moscow-papyrus|The Moscow mathematical papyrus
rhind-papyrus|The Rhind mathematical papyrus
thales|Θαλῆς: early geometrical traditions
pythagorean|Pythagorean ratios and geometry
hippocrates|Ἱπποκράτης: quadrature of lunes
eudoxus|Εὔδοξος: proportion and exhaustion
aristotle|Ἀριστοτέλης: motion and natural philosophy
euclid|Εὐκλείδης: deductive geometry
archimedes-statics|Ἀρχιμήδης: equilibrium and levers
archimedes-circle|Ἀρχιμήδης: bounds for the circle ratio
archimedes-buoyancy|Ἀρχιμήδης: floating bodies
eratosthenes|Ἐρατοσθένης: measuring Earth
apollonius|Ἀπολλώνιος: conic sections
hipparchus|Ἵππαρχος: quantitative astronomy
nine-chapters|The Nine Chapters: a mathematical synthesis
ptolemy|Κλαύδιος Πτολεμαῖος: planetary models
diophantus|Διόφαντος: arithmetic equations
liu-hui|劉徽: commentary on the Nine Chapters
pappus|Πάππος: the Mathematical Collection
zu-pi|祖沖之: precise bounds for the circle ratio
aryabhata|आर्यभट: mathematics and astronomy
brahmagupta|ब्रह्मगुप्त: zero and signed quantities
khwarizmi-algebra|محمد بن موسى الخوارزمي: algebra
khwarizmi-numerals|محمد بن موسى الخوارزمي: positional arithmetic
thabit|ثابت بن قرة: geometry and translation
al-battani|محمد بن جابر البتاني: astronomical tables
ibn-haytham|الحسن بن الهيثم: mathematical optics
khayyam|عمر خیام: geometric solutions of cubics
bhaskara|भास्कराचार्य: mathematical astronomy
latin-translations|Arabic algebra enters Latin translation
fibonacci|Leonardo Pisano: a book of calculation
qin|秦九韶: equations and congruences
li-ye|李冶: the celestial-element method
zhu|朱世傑: four unknowns and elimination
oresme|Nicole Oresme: geometry of varying motion
madhava|മാധവൻ: infinite-series methods
kashi|غیاث‌الدین جمشید کاشانی: circle computation
nilakantha|നീലകണ്ഠ സോമയാജി: revised planetary models
jyesthadeva|ജ്യേഷ്ഠദേവൻ: explanations of Kerala methods
copernicus|Mikołaj Kopernik: a heliocentric system
cardano|Cubic and quartic formulas in print
bombelli|Rafael Bombelli: complex arithmetic
viete|François Viète: symbolic algebra
gilbert|William Gilbert: experimental magnetism
kepler-orbits|Johannes Kepler: elliptical orbits
galileo-telescope|Galileo Galilei: telescopic discoveries
napier|John Napier: logarithms
kepler-harmonic|Johannes Kepler: the third orbital law
snell|Willebrord Snell: a refraction relation
harriot|Thomas Harriot: posthumous algebra
galileo-dialogue|Galileo Galilei: debating world systems
cavalieri|Bonaventura Cavalieri: indivisibles
descartes|René Descartes: equations and geometry
fermat-margin|Pierre de Fermat: the marginal conjecture
galileo-motion|Galileo Galilei: mathematical motion
torricelli|Evangelista Torricelli: atmospheric pressure
pascal-fermat|Blaise Pascal and Pierre de Fermat: chance
huygens-probability|Christiaan Huygens: a treatise on chance
boyle|Robert Boyle: pressure and volume
hooke-cells|Robert Hooke: microscopic observations
newton-fluxions|Isaac Newton: early fluxions manuscripts
newton-light|Isaac Newton: light and color
roemer|Ole Rømer: a finite speed of light
leibniz-calculus|Gottfried Wilhelm Leibniz: calculus in print
newton-principia|Isaac Newton: motion and gravitation
huygens-light|Christiaan Huygens: wavefront optics
bernoulli-brachistochrone|Johann Bernoulli: the fastest-descent problem
seki|関孝和: polynomial elimination
bernoulli-large|Jakob Bernoulli: the law of large numbers
taylor|Brook Taylor: expansion by derivatives
euler-graphs|Leonhard Euler: the bridges problem
euler-mechanics|Leonhard Euler: analytical mechanics
bernoulli-gases|Daniel Bernoulli: a kinetic gas model
dalembert|Jean le Rond d'Alembert: dynamics
dalembert-wave|The vibrating-string equation
euler-analysis|Leonhard Euler: analysis of functions
bayes|Thomas Bayes: inverse probability
lagrange-variation|Joseph-Louis Lagrange: variations
coulomb|Charles-Augustin de Coulomb: electrical force
lagrange-mechanics|Joseph-Louis Lagrange: analytical mechanics
gauss-algebra|Carl Friedrich Gauß: polynomial roots
gauss-number|Carl Friedrich Gauß: number theory
young-interference|Thomas Young: light interference
fourier-memoir|Joseph Fourier: the submitted heat memoir
gauss-orbits|Carl Friedrich Gauß: orbital estimation
laplace-probability|Pierre-Simon Laplace: probability theory
fresnel|Augustin-Jean Fresnel: diffraction
oersted|Hans Christian Ørsted: current and magnetism
ampere|André-Marie Ampère: forces between currents
cauchy-analysis|Augustin-Louis Cauchy: rigorous analysis
fourier-book|Joseph Fourier: the heat treatise
abel-quintic|Niels Henrik Abel: the limit of radicals
carnot|Sadi Carnot: the ideal heat engine
ohm|Georg Simon Ohm: electrical resistance
brownian|Robert Brown: microscopic fluctuations
green|George Green: potential theory
lobachevsky|Николай Лобачевский: alternative geometry
galois|Évariste Galois: equations and permutations
faraday-induction|Michael Faraday: electromagnetic induction
bolyai|Bolyai János: non-Euclidean geometry
hamilton-mechanics|William Rowan Hamilton: dynamics
dirichlet-series|Fourier-series convergence conditions
gauss-weber|An electromagnetic telegraph
dirichlet-primes|Primes in arithmetic progressions
hamilton-quaternions|William Rowan Hamilton: quaternions
joule|James Prescott Joule: work and heat
grassmann|Hermann Grassmann: an algebra of extension
neptune|Neptune: prediction meets observation
helmholtz-energy|Hermann von Helmholtz: energy conservation
boole|George Boole: algebraic logic
kelvin-scale|William Thomson: absolute temperature
clausius-thermo|Rudolf Clausius: thermodynamic laws
riemann-complex|Bernhard Riemann: complex functions
stokes|George Gabriel Stokes: viscous flow
riemann-geometry|Bernhard Riemann: metric geometry
cayley-matrices|Arthur Cayley: matrix algebra
riemann-zeta|Bernhard Riemann: zeta and the primes
maxwell-distribution|James Clerk Maxwell: molecular velocities
maxwell-field|James Clerk Maxwell: electromagnetic fields
clausius-entropy|Rudolf Clausius: entropy
boltzmann-h|Ludwig Boltzmann: kinetic irreversibility
dedekind-real|Richard Dedekind: constructing real numbers
cantor-uncountable|Georg Cantor: uncountable infinity
gibbs-equilibrium|Josiah Willard Gibbs: phase equilibrium
boltzmann-entropy|Ludwig Boltzmann: statistical entropy
frege|Gottlob Frege: a quantified logic
michelson-morley|Interferometry tests ether drift
hertz-waves|Heinrich Hertz: electromagnetic waves
peano|Giuseppe Peano: axioms of arithmetic
poincare-chaos|Henri Poincaré: complex celestial dynamics
cantor-diagonal|Georg Cantor: the diagonal argument
noether-rings-precursor|David Hilbert: abstract invariant theory
rontgen|Wilhelm Conrad Röntgen: X-rays
becquerel|Henri Becquerel: uranium radiation
prime-number-theorem|The prime number theorem is proved
electron|J. J. Thomson: the electron
curies|Polonium and radium are identified
hilbert-problems|David Hilbert: a mathematical research agenda
planck|Max Planck: energy elements
russell|Bertrand Russell: a set-theoretic paradox
lebesgue|Henri Lebesgue: measure and integration
gibbs-statistical|Josiah Willard Gibbs: statistical ensembles
einstein-light|Albert Einstein: light quanta
einstein-brownian|Albert Einstein: Brownian motion
einstein-relativity|Albert Einstein: special relativity
einstein-mass-energy|Albert Einstein: mass and energy
markov|Андрей Марков: dependent random sequences
fredholm|Ivar Fredholm: integral equations
minkowski|Hermann Minkowski: spacetime geometry
zermelo|Ernst Zermelo: axiomatic set theory
perrin|Jean Perrin: experimental molecular evidence
rutherford-nucleus|Ernest Rutherford: the nuclear atom
superconductivity|Heike Kamerlingh Onnes: superconductivity
noether-rings|Emmy Noether: structural ideal theory
bohr|Niels Bohr: quantized atomic states
ramanujan|ஸ்ரீனிவாச ராமானுஜன் writes to G. H. Hardy
general-relativity|Albert Einstein: general relativity
schwarzschild|Karl Schwarzschild: an exact solution
noether-symmetry|Emmy Noether: symmetry and conservation
eclipse|The eclipse test of light deflection
banach|Stefan Banach: complete normed spaces
friedmann|Александр Фридман: evolving universes
stern-gerlach|Otto Stern and Walther Gerlach: beam splitting
compton|Arthur H. Compton: X-ray scattering
bose|সত্যেন্দ্রনাথ বসু: quantum counting
de-broglie|Louis de Broglie: matter waves
pauli|Wolfgang Pauli: the exclusion principle
matrix-mechanics|Matrix mechanics takes shape
schrodinger|Erwin Schrödinger: wave mechanics
born-rule|Max Born: probability amplitudes
fermi-dirac|Quantum statistics with exclusion
uncertainty|Werner Heisenberg: uncertainty
matter-diffraction|Electron diffraction tests matter waves
lemaitre|Georges Lemaître: expansion and observations
dirac-electron|Paul Dirac: the relativistic electron
raman|Shifted light scattering in liquids
hub-related|Edwin Hubble: distance and recession
godel|Kurt Gödel: incompleteness
von-neumann-quantum|Neumann János: quantum theory in Hilbert space
neutron|James Chadwick: the neutron
positron|Carl D. Anderson: the positron
kolmogorov|Андрей Колмогоров: axioms of probability
epr|The completeness of quantum theory debated
yukawa|湯川秀樹: a nuclear-force carrier
church-turing|Effective computation and its limits
ito|伊藤清: stochastic integration
fission-observation|Barium reveals a nuclear puzzle
fission-explanation|Lise Meitner and Otto Frisch: fission explained
manhattan-impact|Nuclear weapons and their human consequences
qed|Renormalized quantum electrodynamics
shannon|Claude Shannon: information theory
distribution|Laurent Schwartz: generalized functions
game-theory|John Nash: equilibrium in finite games
yang-mills|楊振寧 and Robert Mills: non-Abelian fields
parity-proposal|李政道 and 楊振寧 question parity
parity-test|吳健雄 and collaborators: parity violation
bcs|A microscopic theory of superconductivity
grothendieck|Alexandre Grothendieck: homological methods
laser|Theodore Maiman: the ruby laser
lorenz|Edward Lorenz: deterministic chaos
atiyah-singer|Michael Atiyah and Isadore Singer: the index
quarks|Quark and ace models are proposed
symmetry-breaking|Gauge symmetry breaking: three groups
bell|John Bell: testable inequalities
singularity|Roger Penrose: a singularity theorem
cmb|Cosmic microwave background radiation
electroweak|An electroweak model for leptons
pulsars|Jocelyn Bell Burnell: pulsar signals
standard-renormalization|Broken gauge theories become renormalizable
renormalization-group|Kenneth Wilson: critical phenomena
bkt|A transition driven by vortex topology
qcd|Asymptotic freedom and strong interactions
hawking|Stephen Hawking: black-hole radiation
four-color|A computer-assisted four-color proof
rsa|Number theory enables public-key encryption
quantum-hall|Klaus von Klitzing: quantum Hall plateaus
feynman-simulation|Richard Feynman: quantum simulation
aspect|Alain Aspect: changing-analyzer Bell tests
tknn|Topology explains quantized conductance
fractional-hall|Horst Störmer and 崔琦: fractional Hall states
donaldson|Simon Donaldson: gauge theory and topology
string-anomalies|Anomaly cancellation in superstring theory
laser-cooling|Optical molasses cools atomic motion
high-tc|High-temperature superconductivity
jones-witten|Edward Witten: knots and quantum fields
mirror-symmetry|Mirror symmetry predicts curve counts
shor|Peter Shor: quantum factoring
wiles|The repaired modularity proof is published
bec|Condensation in ultracold atomic gases
acceleration|Supernovae reveal accelerating expansion
neutrino-oscillation|Atmospheric neutrinos change flavor
perelman|Григорий Перельман: Ricci-flow preprints
graphene|Atomically thin graphene is isolated
formal-four-color|Georges Gonthier: formal four-color proof
green-tao|Ben Green and 陶哲軒: progressions in primes
higgs-observation|ATLAS and CMS: a Higgs-compatible boson
zhang-gaps|張益唐: bounded gaps between primes
flyspeck|Flyspeck completes formal verification
bell-loopholes|Loophole-free Bell experiments
gw-detection|LIGO detects gravitational waves
gw-announcement|Gravitational-wave discovery is announced
sphere-eight|Марина Вязовська: sphere packing in 8D
sphere-twentyfour|Sphere packing in 24D is solved
multimessenger|A merger observed through waves and light
black-hole-image|The first black-hole shadow image
si-redefinition|SI units are redefined by constants
einstein-tile|An aperiodic monotile is exhibited
top-entanglement|ATLAS: entanglement of top quarks
`
    .trim()
    .split("\n")
    .map((line) => line.split("|")),
);
