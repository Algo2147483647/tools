export const subjects = {
  algebra: ["Arithmetic and algebra", "Mathematics"],
  geometry: ["Geometry and topology", "Mathematics"],
  analysis: ["Analysis and differential equations", "Mathematics"],
  probability: ["Probability and statistics", "Mathematics"],
  foundations: ["Logic and computation", "Mathematics"],
  motion: ["Mechanics and gravitation", "Physics"],
  fields: ["Optics and electromagnetic fields", "Physics"],
  heat: ["Heat and statistical physics", "Physics"],
  quantum: ["Quantum theory and information", "Physics"],
  matter: ["Particles, nuclei and materials", "Physics"],
  cosmos: ["Astronomy and cosmology", "Physics"],
};

export const sections = {
  ancient: "Ancient mathematics and medieval transmission",
  earlyModern: "Calculation, experiment and analytical mechanics",
  nineteenth: "Fields, structures, energy and rigorous analysis",
  foundations: "Relativity, quantum theory and mathematical foundations",
  contemporary: "Modern structures, experiments and computation",
};

// Original-language standardized spellings; aliases are search aids, not display replacements.
export const names = `
Θαλῆς|Thales|Ancient Greek
Ἱπποκράτης|Hippocrates of Chios|Ancient Greek
Εὔδοξος|Eudoxus|Ancient Greek
Ἀριστοτέλης|Aristotle|Ancient Greek
Εὐκλείδης|Euclid|Ancient Greek
Ἀρχιμήδης|Archimedes|Ancient Greek
Ἐρατοσθένης|Eratosthenes|Ancient Greek
Ἀπολλώνιος|Apollonius|Ancient Greek
Ἵππαρχος|Hipparchus|Ancient Greek
Κλαύδιος Πτολεμαῖος|Claudius Ptolemy|Ancient Greek
Διόφαντος|Diophantus|Ancient Greek
Πάππος|Pappus|Ancient Greek
劉徽|Liu Hui|Chinese; traditional characters
祖沖之|Zu Chongzhi|Chinese; traditional characters
秦九韶|Qin Jiushao|Chinese
李冶|Li Ye; Li Zhi|Chinese; the later name is used in the event
朱世傑|Zhu Shijie|Chinese; traditional characters
आर्यभट|Aryabhata|Sanskrit; standardized Devanagari spelling
ब्रह्मगुप्त|Brahmagupta|Sanskrit; standardized Devanagari spelling
भास्कराचार्य|Bhaskara II; Bhaskaracharya|Sanskrit; standardized Devanagari spelling
محمد بن موسى الخوارزمي|Al-Khwarizmi|Arabic scholarly name; not an inference about ethnicity
ثابت بن قرة|Thabit ibn Qurra|Arabic scholarly name
محمد بن جابر البتاني|Al-Battani|Arabic scholarly name
الحسن بن الهيثم|Ibn al-Haytham|Arabic scholarly name
ابن سهل|Ibn Sahl|Arabic scholarly name
عمر خیام|Omar Khayyam|Persian
غیاث‌الدین جمشید کاشانی|Jamshid al-Kashi|Persian
മാധവൻ|Madhava|Malayalam; standardized spelling
നീലകണ്ഠ സോമയാജി|Nilakantha Somayaji|Malayalam; standardized spelling
ജ്യേഷ്ഠദേവൻ|Jyesthadeva|Malayalam; standardized spelling
Mikołaj Kopernik|Nicolaus Copernicus|Polish personal name; major publication in Latin
François Viète|Francois Viete|French
René Descartes|Rene Descartes|French
Carl Friedrich Gauß|Carl Friedrich Gauss|German
Hans Christian Ørsted|Hans Christian Oersted|Danish
André-Marie Ampère|Andre-Marie Ampere|French
Évariste Galois|Evariste Galois|French
Николай Лобачевский|Nikolai Lobachevsky|Russian
Bolyai János|Janos Bolyai|Hungarian name order
関孝和|Seki Takakazu|Japanese
Андрей Марков|Andrey Markov|Russian
Александр Фридман|Alexander Friedmann|Russian
Андрей Колмогоров|Andrey Kolmogorov|Russian
Борис Подольский|Boris Podolsky|Russian personal-name form
ஸ்ரீனிவாச ராமானுஜன்|Srinivasa Ramanujan|Tamil; standardized spelling
সত্যেন্দ্রনাথ বসু|Satyendra Nath Bose|Bengali
சந்திரசேகர வெங்கட ராமன்|Chandrasekhara Venkata Raman|Tamil
Neumann János|John von Neumann|Hungarian personal name; also published under German and English forms
湯川秀樹|Hideki Yukawa|Japanese
伊藤清|Kiyosi Ito|Japanese
朝永振一郎|Sin-Itiro Tomonaga|Japanese
楊振寧|Chen Ning Yang|Chinese; traditional characters
李政道|Tsung-Dao Lee|Chinese
吳健雄|Chien-Shiung Wu|Chinese; traditional characters
عبد السلام|Abdus Salam|Urdu
Вадим Березинский|Vadim Berezinskii|Russian
崔琦|Daniel Tsui|Chinese
甲元真人|Mahito Kohmoto|Japanese
Григорий Перельман|Grigori Perelman|Russian
Андрей Гейм|Andre Geim|Russian personal name; international professional form differs
Константин Новосёлов|Konstantin Novoselov|Russian
陶哲軒|Terence Tao|Chinese family-name form; English professional name is also original to the author
張益唐|Yitang Zhang|Chinese; traditional characters
Марина Вязовська|Maryna Viazovska|Ukrainian
Данило Радченко|Danylo Radchenko|Ukrainian
Maria Skłodowska-Curie|Marie Curie|Polish personal-name form; French publications use Marie Curie
Wilhelm Conrad Röntgen|Wilhelm Conrad Rontgen|German
Erwin Schrödinger|Erwin Schrodinger|German
Kurt Gödel|Kurt Godel|German
Fritz Straßmann|Fritz Strassmann|German
`
  .trim()
  .split("\n")
  .map((line) => line.split("|"));

const nobel = (year, slug) => `https://www.nobelprize.org/prizes/physics/${year}/${slug}/facts/`;
export const sources = {
  brown: ["Original report of microscopic particle motion (1828)", "https://doi.org/10.1080/14786442808674769"],
  joule: [
    "APS historical account of work and heat",
    "https://www.aps.org/apsnews/2015/06/joule-mechanical-equivalent-heat",
  ],
  michelson: [
    "Nobel educational history of the ether experiment",
    "https://educationalgames.nobelprize.org/educational/physics/relativity/history-1.html",
  ],
  rontgen: ["Nobel biographical research summary", nobel(1901, "rontgen")],
  becquerel: ["Nobel biographical research summary", nobel(1903, "becquerel")],
  electron: ["AIP history of the electron", "https://history.aip.org/exhibits/electron/"],
  curie: ["AIP archival exhibition on radioactivity", "https://history.aip.org/exhibits/curie/"],
  brownian: ["Original 1905 paper on Brownian motion", "https://doi.org/10.1002/andp.19053220806"],
  relativity: ["AIP historical exhibition on relativity", "https://history.aip.org/exhibits/einstein/index_text.htm"],
  perrin: ["Nobel biographical research summary", nobel(1926, "perrin")],
  rutherford: ["Original 1911 scattering and atomic-structure paper", "https://doi.org/10.1080/14786440508637080"],
  superconductivity: [
    "AIP discovery history: superconductivity",
    "https://history.aip.org/exhibits/mod/superconductivity/superconductivity.pdf",
  ],
  noether: ["IAS archive: symmetry and conservation", "https://www.ias.edu/news/2023/honoring-legacy-emmy-noether"],
  eclipse: ["Original eclipse-expedition report", "https://doi.org/10.1098/rsta.1920.0009"],
  stern: ["Nobel biographical research summary", nobel(1943, "stern")],
  compton: ["Original 1923 scattering paper", "https://doi.org/10.1103/PhysRev.21.483"],
  diffraction: [
    "Nobel research summary on electron diffraction",
    "https://www.nobelprize.org/prizes/physics/1937/summary/",
  ],
  raman: ["Nobel biographical research summary", nobel(1930, "raman")],
  hubble: ["Original galaxy distance-velocity paper", "https://doi.org/10.1073/pnas.15.3.168"],
  neutron: ["Nobel biographical research summary", nobel(1935, "chadwick")],
  positron: ["Nobel biographical research summary", nobel(1936, "anderson")],
  epr: ["Original 1935 completeness paper", "https://doi.org/10.1103/PhysRev.47.777"],
  fission: ["AIP oral-history exhibition: nuclear discovery", "https://history.aip.org/exhibits/mod/"],
  "atomic-history": [
    "US Department of Energy: wartime history and consequences",
    "https://www.energy.gov/management/articles/manhattan-project",
  ],
  qed: ["Nobel research summary: quantum electrodynamics", "https://www.nobelprize.org/prizes/physics/1965/summary/"],
  gauge: ["Original non-Abelian gauge-theory paper", "https://doi.org/10.1103/PhysRev.96.191"],
  parity: ["Original paper questioning parity conservation", "https://doi.org/10.1103/PhysRev.104.254"],
  "parity-test": ["Original experimental parity-violation paper", "https://doi.org/10.1103/PhysRev.105.1413"],
  bcs: ["Original theory of superconductivity", "https://doi.org/10.1103/PhysRev.108.1175"],
  laser: ["AIP archival history of the first lasers", "https://history.aip.org/exhibits/laser/"],
  quarks: ["CERN historical account of the quark proposals", "https://cds.cern.ch/record/1998511"],
  higgs: [
    "CERN: theoretical mechanism and particle discovery",
    "https://home.web.cern.ch/science/physics/higgs-boson/how/",
  ],
  bell: [
    "Nobel scientific background on entanglement tests",
    "https://www.nobelprize.org/uploads/2022/10/popular-physicsprize2022.pdf",
  ],
  penrose: ["Original singularity-theorem paper", "https://doi.org/10.1103/PhysRevLett.14.57"],
  cmb: ["Nobel biographical research summary", nobel(1978, "wilson")],
  electroweak: [
    "Nobel research summary on electroweak unification",
    "https://www.nobelprize.org/prizes/physics/1979/summary/",
  ],
  pulsars: ["Original report of a rapidly pulsating radio source", "https://doi.org/10.1038/217709a0"],
  renormalization: [
    "Nobel research summary on electroweak renormalization",
    "https://www.nobelprize.org/prizes/physics/1999/summary/",
  ],
  wilson: ["Nobel biographical research summary", nobel(1982, "wilson")],
  topology: ["APS research collection: topological phases", "https://physics.aps.org/topological-phases"],
  qcd: ["Nobel research summary on asymptotic freedom", "https://www.nobelprize.org/prizes/physics/2004/summary/"],
  rsa: ["Original public-key cryptosystem paper", "https://doi.org/10.1145/359340.359342"],
  "quantum-computing": ["Original paper on simulating physics with computers", "https://doi.org/10.1007/BF02650179"],
  tknn: ["Original quantized Hall-conductance paper", "https://doi.org/10.1103/PhysRevLett.49.405"],
  fractional: [
    "Nobel research summary on fractional quantum Hall physics",
    "https://www.nobelprize.org/prizes/physics/1998/summary/",
  ],
  strings: ["Original anomaly-cancellation paper", "https://doi.org/10.1016/0370-2693(84)91565-X"],
  cooling: [
    "NIST account of laser cooling and trapping",
    "https://www.nist.gov/news-events/news/1997/10/nist-physicist-william-phillips-wins-1997-nobel-prize-physics",
  ],
  "high-tc": [
    "Nobel research summary on oxide superconductors",
    "https://www.nobelprize.org/prizes/physics/1987/summary/",
  ],
  witten: ["Original quantum-field theory and knot-invariant paper", "https://doi.org/10.1007/BF01217730"],
  mirror: ["Original mirror-symmetry calculation", "https://doi.org/10.1016/0550-3213(91)90292-6"],
  shor: ["Original extended quantum-algorithm paper", "https://arxiv.org/abs/quant-ph/9508027"],
  bec: [
    "Nobel scientific background on dilute-gas condensation",
    "https://www.nobelprize.org/uploads/2018/06/advanced-physicsprize2001.pdf",
  ],
  acceleration: [
    "Nobel scientific account of accelerating expansion",
    "https://www.nobelprize.org/prizes/physics/2011/summary/",
  ],
  neutrinos: ["Original atmospheric-neutrino oscillation paper", "https://arxiv.org/abs/hep-ex/9807003"],
  poincare: [
    "Clay Mathematics Institute: proof and verification history",
    "https://www.claymath.org/millennium/poincare-conjecture/",
  ],
  graphene: ["Original atomically thin carbon-film paper", "https://doi.org/10.1126/science.1102896"],
  "formal-four-color": [
    "Researcher's account of the formally checked proof",
    "https://www.microsoft.com/en-us/research/wp-content/uploads/2012/10/4colproof.pdf",
  ],
  "green-tao": ["Original arithmetic-progressions preprint", "https://arxiv.org/abs/math/0404188"],
  flyspeck: ["Project leader's retrospective on formal verification", "https://arxiv.org/abs/2402.08032"],
  loopholes: ["Original separated-spin Bell-test paper", "https://arxiv.org/abs/1508.05949"],
  ligo: ["LIGO: detection date and account", "https://www.ligo.caltech.edu/detection"],
  "gw-paper": ["Original gravitational-wave discovery paper", "https://arxiv.org/abs/1602.03837"],
  sphere8: ["Original eight-dimensional sphere-packing proof", "https://arxiv.org/abs/1603.04246"],
  sphere24: ["Original twenty-four-dimensional sphere-packing proof", "https://arxiv.org/abs/1603.06518"],
  gw170817: ["Original multimessenger observation paper", "https://arxiv.org/abs/1710.05833"],
  eht: ["Original M87 imaging results: first paper", "https://doi.org/10.3847/2041-8213/ab0ec7"],
  si: ["NIST: revised International System of Units", "https://www.nist.gov/si-redefinition"],
  monotile: ["Original aperiodic monotile preprint", "https://arxiv.org/abs/2303.10798"],
  "top-entanglement": ["ATLAS research record: top-quark entanglement", "https://cds.cern.ch/record/2880054"],
};

export function source(key) {
  const replacements = {
    "t:Pythagoras": ["MacTutor biographical study", "https://mathshistory.st-andrews.ac.uk/Biographies/Pythagoras/"],
    "b:Gilbert": [
      "Science History Institute: early magnetism",
      "https://www.sciencehistory.org/stories/magazine/laws-of-attraction/",
    ],
    "b:Romer": [
      "MacTutor: early theories and measurements of light",
      "https://mathshistory.st-andrews.ac.uk/HistTopics/Light_1/",
    ],
    "b:Oersted": ["NASA educational history of electromagnetism", "https://pwg.gsfc.nasa.gov/earthmag/oersted.htm"],
    "b:Hertz": [
      "MacTutor: electromagnetic and quantum theories of light",
      "https://mathshistory.st-andrews.ac.uk/HistTopics/Light_2/",
    ],
    "b:Bohr": ["MacTutor biographical study", "https://mathshistory.st-andrews.ac.uk/Biographies/Bohr_Niels/"],
    "b:De_Broglie": ["MacTutor biographical study", "https://mathshistory.st-andrews.ac.uk/Biographies/Broglie/"],
    "b:Yukawa": ["Nobel biographical research summary", nobel(1949, "yukawa")],
    "b:Yang": ["Nobel biographical research summary", nobel(1957, "yang")],
    "b:Lorenz": [
      "Original deterministic nonperiodic flow paper",
      "https://journals.ametsoc.org/doi/abs/10.1175/1520-0469%281963%29020%3C0130%3Adnf%3E2.0.CO%3B2",
    ],
    "b:Carnot": ["MacTutor biographical study", "https://mathshistory.st-andrews.ac.uk/Biographies/Carnot_Sadi/"],
    "b:Young": ["MacTutor biographical study", "https://mathshistory.st-andrews.ac.uk/Biographies/Young_Thomas/"],
    "b:Haken": [
      "MacTutor: computer-assisted four-color proof",
      "https://mathshistory.st-andrews.ac.uk/Biographies/Appel/",
    ],
    "b:Zhang": ["Original bounded-prime-gaps paper", "https://doi.org/10.4007/annals.2014.179.3.7"],
  };
  if (replacements[key]) return replacements[key];
  const [kind, slug] = key.split(":");
  if (kind === "b")
    return ["MacTutor biographical study", `https://mathshistory.st-andrews.ac.uk/Biographies/${slug}/`];
  if (kind === "t") return ["MacTutor historical topic", `https://mathshistory.st-andrews.ac.uk/HistTopics/${slug}/`];
  if (kind === "s" && sources[slug]) return sources[slug];
  throw new Error(`Unknown source ${key}`);
}

export function isoYear(year) {
  const astronomical = year < 0 ? year + 1 : year;
  return astronomical < 0 ? `-${String(-astronomical).padStart(6, "0")}` : String(astronomical).padStart(4, "0");
}
