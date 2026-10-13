// Curated historical facts. Run scripts/build-space-history.mjs to rebuild the workspace.
// Times are UTC calendar dates unless an explicit offset is present. Intervals are
// the named completed phase, never an inferred lifespan of an active spacecraft.
export const themes = {
  "early-spaceflight": ["Early spaceflight", "Satellites, human orbital flight, spacewalks and rendezvous."],
  "crewed-lunar": [
    "Crewed lunar exploration",
    "Apollo flight histories and the parallel Eagle / Columbia branches of Apollo 11.",
  ],
  "space-stations": ["Space stations", "Orbital laboratories, visiting crews and international assembly."],
  "robotic-moon": ["Robotic Moon", "Impactors, orbiters, landers, rovers and sample-return missions."],
  mars: ["Mars exploration", "Cruises, orbital insertion, landings and surface exploration across agencies."],
  "deep-space": ["Deep space", "Gravity assists, outer planets, comet rendezvous and asteroid samples."],
  "launch-commercial": [
    "Launch and commercial space",
    "Launch demonstrations, reusable spacecraft and commercial transport.",
  ],
  observatories: [
    "Observatories and solar science",
    "Space telescopes, solar exploration and completed science phases.",
  ],
};

export const missions = [];
const science = (slug) => `https://science.nasa.gov/mission/${slug}/`;
const nasa = (slug) => `https://www.nasa.gov/mission/${slug}/`;
const moon = "https://science.nasa.gov/moon/missions/";
const chronology = "https://nssdc.gsfc.nasa.gov/planetary/chronology.html";
// Event tuple: stable suffix, date, caption, optional source override.
function add(id, title, theme, agency, phase, summary, source, events, extra = {}) {
  missions.push({
    id,
    title,
    theme,
    agency,
    phase,
    summary,
    sources: Array.isArray(source) ? source : [source],
    events,
    ...extra,
  });
}

add(
  "sputnik-1",
  "Sputnik 1",
  "early-spaceflight",
  "USSR",
  "Orbital lifetime",
  "The first artificial Earth satellite opened the orbital era; its orbital lifetime extended beyond its radio transmissions.",
  [chronology, "https://www.nasa.gov/history/sputnik/sputorig.html"],
  [
    ["launch", "1957-10-04", "Launch: first artificial satellite"],
    ["reentry", "1958-01-04", "Atmospheric reentry"],
  ],
);
add(
  "sputnik-2",
  "Sputnik 2",
  "early-spaceflight",
  "USSR",
  "Orbital lifetime",
  "Laika flew aboard this early biological satellite. The interval describes the spacecraft in orbit, not the animal's survival.",
  [chronology, "https://www.nasa.gov/history/sputnik/chap11.html"],
  [
    ["launch", "1957-11-03", "Launch with Laika"],
    ["reentry", "1958-04-14", "Atmospheric reentry"],
  ],
);
add(
  "explorer-1",
  "Explorer 1",
  "early-spaceflight",
  "USA",
  "Orbital lifetime",
  "The first US satellite carried the radiation experiment associated with discovery of the Van Allen belts. Launch was February 1 in UTC, January 31 in Florida.",
  [chronology, science("explorer-1")],
  [
    ["launch", "1958-02-01", "Launch: first US satellite"],
    ["reentry", "1970-03-31", "Atmospheric reentry"],
  ],
);
add(
  "vostok-6",
  "Vostok 6",
  "early-spaceflight",
  "USSR",
  "Crewed flight",
  "Valentina Tereshkova became the first woman in space during a flight that overlapped Vostok 5.",
  [
    "https://starchild.gsfc.nasa.gov/docs/StarChild/whos_who_level2/tereshkova.html",
    "https://ntrs.nasa.gov/api/citations/19910009709/downloads/19910009709.pdf",
  ],
  [
    ["launch", "1963-06-16", "Tereshkova launches"],
    ["return", "1963-06-19", "Tereshkova returns"],
  ],
);
add(
  "voskhod-2",
  "Voskhod 2",
  "early-spaceflight",
  "USSR",
  "Crewed flight",
  "Alexei Leonov performed the first spacewalk; Pavel Belyayev commanded the flight.",
  [
    "https://www.nasa.gov/history/space-station-20th-spacewalking-history/",
    "https://ntrs.nasa.gov/api/citations/19910009709/downloads/19910009709.pdf",
  ],
  [
    ["launch", "1965-03-18", "Launch"],
    ["eva", "1965-03-18", "Leonov's first spacewalk"],
    ["return", "1965-03-19", "Crew returns"],
  ],
);
add(
  "gemini-4",
  "Gemini IV",
  "early-spaceflight",
  "USA",
  "Crewed flight",
  "James McDivitt and Edward White tested multi-day human flight; White performed the first US spacewalk.",
  nasa("gemini-iv"),
  [
    ["launch", "1965-06-03", "Launch"],
    ["eva", "1965-06-03", "White's spacewalk"],
    ["return", "1965-06-07", "Atlantic splashdown"],
  ],
);
add(
  "gemini-7",
  "Gemini VII",
  "early-spaceflight",
  "USA",
  "Crewed flight",
  "Frank Borman and James Lovell tested two-week endurance and served as the rendezvous target for Gemini VI-A.",
  nasa("gemini-vii"),
  [
    ["launch", "1965-12-04", "Launch"],
    ["rendezvous", "1965-12-15", "Rendezvous with Gemini VI-A"],
    ["return", "1965-12-18", "Atlantic splashdown"],
  ],
);
add(
  "gemini-8",
  "Gemini VIII",
  "early-spaceflight",
  "USA",
  "Crewed flight",
  "Neil Armstrong and David Scott achieved the first docking of two spacecraft, then made an emergency return after an attitude-control failure.",
  nasa("gemini-viii"),
  [
    ["launch", "1966-03-16", "Launch"],
    ["dock", "1966-03-16", "First docking with Agena"],
    ["return", "1966-03-17", "Emergency Pacific splashdown"],
  ],
);

const apollo = [
  [
    8,
    "1968-12-21",
    "1968-12-24",
    "1968-12-27",
    "First crewed lunar orbit",
    "The first human flight beyond Earth orbit tested navigation and life support around the Moon.",
  ],
  [
    10,
    "1969-05-18",
    "1969-05-22",
    "1969-05-26",
    "Lunar module descent rehearsal",
    "A lunar-orbit rehearsal tested the lander and rendezvous procedure without touching down.",
  ],
  [
    12,
    "1969-11-14",
    "1969-11-19",
    "1969-11-24",
    "Ocean of Storms landing",
    "A precision landing near Surveyor 3 enabled sampling and inspection of the earlier robotic lander.",
  ],
  [
    13,
    "1970-04-11",
    "1970-04-14",
    "1970-04-17",
    "Oxygen tank failure (UTC)",
    "The planned landing was cancelled after an oxygen-tank failure; the lunar module supported the crew's return.",
  ],
  [
    14,
    "1971-01-31",
    "1971-02-05",
    "1971-02-09",
    "Fra Mauro landing",
    "Alan Shepard and Edgar Mitchell explored the Fra Mauro formation while Stuart Roosa remained in orbit.",
  ],
  [
    15,
    "1971-07-26",
    "1971-07-30",
    "1971-08-07",
    "Hadley-Apennine landing",
    "The first Apollo mission with a lunar rover extended surface exploration and orbital science.",
  ],
  [
    16,
    "1972-04-16",
    "1972-04-21",
    "1972-04-27",
    "Descartes highlands landing (UTC)",
    "John Young and Charles Duke investigated highland geology with a lunar rover.",
  ],
  [
    17,
    "1972-12-07",
    "1972-12-11",
    "1972-12-19",
    "Taurus-Littrow landing",
    "The final Apollo landing paired extended field geology with orbital investigations.",
  ],
];
for (const [n, start, middle, end, event, summary] of apollo)
  add(`apollo-${n}`, `Apollo ${n}`, "crewed-lunar", "USA", "Crewed lunar flight", summary, nasa(`apollo-${n}`), [
    ["launch", start, "Launch"],
    ["milestone", middle, event],
    ["return", end, "Pacific splashdown"],
  ]);
add(
  "apollo-11",
  "Apollo 11",
  "crewed-lunar",
  "USA",
  "Crewed lunar flight",
  "The first crewed Moon landing. Eagle's surface excursion ran in parallel with Michael Collins's flight in Columbia.",
  [
    "https://www.nasa.gov/history/apollo-11-mission-overview/",
    "https://nssdc.gsfc.nasa.gov/nmc/spacecraft/display.action?id=1969-059A",
  ],
  [
    ["launch", "1969-07-16T13:32:00Z", "Saturn V launch"],
    ["lunar-orbit", "1969-07-19T17:21:50Z", "Lunar orbit insertion"],
    ["separate", "1969-07-20T17:44:00Z", "Eagle separates from Columbia"],
    ["landing", "1969-07-20T20:17:40Z", "Eagle lands on the Moon"],
    ["first-step", "1969-07-21T02:56:15Z", "Armstrong steps onto the Moon"],
    ["liftoff", "1969-07-21T17:54:01Z", "Eagle lifts off"],
    ["dock", "1969-07-21T21:34:00Z", "Eagle docks with Columbia"],
    ["depart", "1969-07-22T04:54:42Z", "Trans-Earth injection"],
    ["return", "1969-07-24T16:50:35Z", "Pacific splashdown"],
  ],
  { precision: "Mixed minute / second precision; see the source mission chronology." },
);

const salyutSource =
  "https://www.nasa.gov/missions/station/50-years-ago-launch-of-salyut-the-worlds-first-space-station/";
add(
  "salyut-1",
  "Salyut 1",
  "space-stations",
  "USSR",
  "Orbital lifetime",
  "The first space station hosted Soyuz 11; the crew died during their return to Earth.",
  salyutSource,
  [
    ["launch", "1971-04-19", "Station launch"],
    ["crew", "1971-06-07", "Soyuz 11 crew enters station"],
    ["reentry", "1971-10-11", "Controlled reentry"],
  ],
);
add(
  "skylab",
  "Skylab",
  "space-stations",
  "USA",
  "Orbital lifetime",
  "The US orbital workshop hosted three crews for solar, Earth and human-adaptation research; it remained in orbit after the last crew departed.",
  nasa("skylab"),
  [
    ["launch", "1973-05-14", "Station launch"],
    ["reentry", "1979-07-11", "Atmospheric reentry"],
  ],
);
for (const [n, start, end, text] of [
  [2, "1973-05-25", "1973-06-22", "The first crew repaired the damaged workshop and began its scientific program."],
  [
    3,
    "1973-07-28",
    "1973-09-25",
    "The second crew extended the station's medical, solar and Earth-observation investigations.",
  ],
  [4, "1973-11-16", "1974-02-08", "The final crew completed an 84-day flight and extensive science observations."],
])
  add(
    `skylab-${n}`,
    `Skylab ${n}`,
    "space-stations",
    "USA",
    "Crewed flight",
    text,
    "https://www.nasa.gov/history/navy-recovery-ships-for-human-spaceflight-missions/",
    [
      ["launch", start, "Crew launch"],
      ["return", end, "Pacific splashdown"],
    ],
  );
add(
  "mir",
  "Mir",
  "space-stations",
  "USSR / Russia",
  "Orbital lifetime",
  "A modular station supported long-duration crews and international visits. The core launched February 19 UTC, February 20 in Moscow.",
  [
    "https://www.nasa.gov/history/35-years-ago-launch-of-mir-space-stations-first-module/",
    "https://www.nasa.gov/history/20-years-ago-space-station-mir-reenters-earths-atmosphere/",
  ],
  [
    ["launch", "1986-02-19", "Core module launch (UTC)"],
    ["reentry", "2001-03-23", "Controlled reentry"],
  ],
);
add(
  "sts-71",
  "STS-71",
  "space-stations",
  "USA / Russia",
  "Shuttle flight",
  "Atlantis completed the first Shuttle docking with Mir and exchanged station crew members.",
  nasa("sts-71"),
  [
    ["launch", "1995-06-27", "Atlantis launches"],
    ["dock", "1995-06-29", "Atlantis docks with Mir"],
    ["return", "1995-07-07", "Atlantis lands"],
  ],
);
add(
  "sts-88",
  "STS-88",
  "space-stations",
  "International",
  "ISS assembly flight",
  "Endeavour carried Unity and joined it to the Russian-built Zarya module, assembling the first two ISS elements.",
  nasa("sts-88"),
  [
    ["launch", "1998-12-04", "Unity launches aboard Endeavour"],
    ["join", "1998-12-06", "Unity and Zarya joined"],
    ["return", "1998-12-15", "Endeavour lands"],
  ],
);
add(
  "iss-expedition-1",
  "ISS Expedition 1",
  "space-stations",
  "International",
  "Expedition aboard ISS",
  "William Shepherd, Yuri Gidzenko and Sergei Krikalev began the station's continuous human presence. This interval ends with their departure, not the station's lifetime.",
  "https://www.nasa.gov/mission/expedition-1/",
  [
    ["arrive", "2000-11-02", "First resident crew arrives"],
    ["depart", "2001-03-19", "Expedition 1 departs aboard Discovery"],
  ],
);

const lunarRows = [
  [
    "luna-1",
    "Luna 1",
    "USSR",
    "1959-01-02",
    "1959-01-04",
    "Lunar flyby",
    "An intended impact mission missed the Moon and reached heliocentric orbit.",
  ],
  [
    "luna-2",
    "Luna 2",
    "USSR",
    "1959-09-12",
    "1959-09-13",
    "Lunar impact",
    "The first human-made object to reach the lunar surface. The impact date is UTC; Moscow was already on September 14.",
  ],
  [
    "luna-3",
    "Luna 3",
    "USSR",
    "1959-10-04",
    "1959-10-06",
    "Lunar flyby",
    "A flyby carried the camera system that photographed the far side on the following day.",
  ],
  [
    "luna-9",
    "Luna 9",
    "USSR",
    "1966-01-31",
    "1966-02-03",
    "First survivable lunar landing",
    "The lander transmitted panoramas from the lunar surface.",
  ],
  [
    "luna-10",
    "Luna 10",
    "USSR",
    "1966-03-31",
    "1966-04-03",
    "Lunar orbit insertion",
    "The first artificial lunar satellite investigated the Moon from orbit.",
  ],
  [
    "surveyor-1",
    "Surveyor 1",
    "USA",
    "1966-05-30",
    "1966-06-02",
    "Lunar soft landing",
    "The first US soft landing tested a robotic approach to the lunar surface.",
  ],
  [
    "surveyor-3",
    "Surveyor 3",
    "USA",
    "1967-04-17",
    "1967-04-20",
    "Lunar soft landing",
    "Apollo 12 later visited this lander and returned parts for examination.",
  ],
  [
    "luna-16",
    "Luna 16",
    "USSR",
    "1970-09-12",
    "1970-09-20",
    "Lunar landing",
    "The mission collected soil for the first robotic lunar sample return.",
  ],
  [
    "kaguya",
    "Kaguya / SELENE",
    "Japan",
    "2007-09-14",
    "2007-10-03",
    "Lunar orbit insertion",
    "Japan's orbiter investigated lunar topography, gravity and composition.",
  ],
  [
    "change-1",
    "Chang'e 1",
    "China",
    "2007-10-24",
    "2007-11-05",
    "Lunar orbit insertion",
    "China's first lunar orbiter mapped and studied the Moon.",
  ],
  [
    "change-3",
    "Chang'e 3",
    "China",
    "2013-12-01",
    "2013-12-14",
    "Lunar landing",
    "The lander delivered the Yutu rover. Launch was December 1 UTC, December 2 in China.",
  ],
  [
    "change-4",
    "Chang'e 4",
    "China",
    "2018-12-07",
    "2019-01-03",
    "Far-side lunar landing",
    "The first soft landing on the lunar far side used the Queqiao relay satellite.",
  ],
];
for (const [id, title, agency, start, end, event, summary] of lunarRows)
  add(id, title, "robotic-moon", agency, "Flight to lunar encounter", summary, moon, [
    ["launch", start, "Launch"],
    ["arrival", end, event],
  ]);
add(
  "chandrayaan-3",
  "Chandrayaan-3",
  "robotic-moon",
  "India",
  "Flight to lunar landing",
  "India demonstrated lunar landing with Vikram and surface mobility with Pragyan.",
  "https://www.isro.gov.in/ISRO_EN/Chandrayaan3.html",
  [
    ["launch", "2023-07-14", "Launch"],
    ["orbit", "2023-08-05", "Lunar orbit insertion"],
    ["separate", "2023-08-17", "Lander separates from propulsion module"],
    ["arrival", "2023-08-23", "Vikram lands"],
  ],
);
add(
  "change-6",
  "Chang'e 6",
  "robotic-moon",
  "China",
  "Lunar sample-return flight",
  "A robotic mission returned the first collected samples from the Moon's far side.",
  [moon, "https://www.cnsa.gov.cn/english/n6465652/n6465653/c10573060/content.html"],
  [
    ["launch", "2024-05-03", "Launch"],
    ["arrival", "2024-06-01", "Far-side landing (UTC)"],
    ["return", "2024-06-25", "Sample capsule returns to Earth"],
  ],
);

const marsRows = [
  [
    "mariner-4",
    "Mariner 4",
    "USA",
    "1964-11-28",
    "1965-07-15",
    "Mars flyby (UTC)",
    "The flyby returned the first close-range spacecraft images of Mars.",
    science("mariner-4"),
  ],
  [
    "mariner-9",
    "Mariner 9",
    "USA",
    "1971-05-30",
    "1971-11-14",
    "Mars orbit insertion",
    "The first spacecraft to orbit another planet mapped Mars after a global dust storm.",
    science("mariner-9"),
  ],
  [
    "pathfinder",
    "Mars Pathfinder",
    "USA",
    "1996-12-04",
    "1997-07-04",
    "Mars landing",
    "The lander delivered Sojourner, the first rover to operate on Mars.",
    science("mars-pathfinder"),
  ],
  [
    "mars-express",
    "Mars Express",
    "Europe",
    "2003-06-02",
    "2003-12-25",
    "Mars orbit insertion",
    "Europe's first Mars orbiter carried instruments for atmosphere, surface and subsurface studies.",
    "https://www.esa.int/Science_Exploration/Space_Science/Mars_Express/The_mission",
  ],
  [
    "spirit",
    "Spirit",
    "USA",
    "2003-06-10",
    "2004-01-04",
    "Gusev crater landing (UTC)",
    "A Mars Exploration Rover investigated rocks and terrain at Gusev crater.",
    science("mer-spirit"),
  ],
  [
    "opportunity",
    "Opportunity",
    "USA",
    "2003-07-08",
    "2004-01-25",
    "Meridiani Planum landing (UTC)",
    "A Mars Exploration Rover explored sedimentary rocks and evidence of past water.",
    science("mer-opportunity"),
  ],
  [
    "mro",
    "Mars Reconnaissance Orbiter",
    "USA",
    "2005-08-12",
    "2006-03-10",
    "Mars orbit insertion",
    "High-resolution imaging, spectroscopy and relay communications support Mars exploration.",
    science("mars-reconnaissance-orbiter"),
  ],
  [
    "curiosity",
    "Curiosity",
    "USA",
    "2011-11-26",
    "2012-08-06",
    "Gale crater landing (UTC)",
    "A mobile laboratory investigates whether ancient Martian environments could have supported microbes.",
    science("msl-curiosity"),
  ],
  [
    "mom",
    "Mars Orbiter Mission",
    "India",
    "2013-11-05",
    "2014-09-24",
    "Mars orbit insertion",
    "India's first interplanetary mission demonstrated Mars-orbit operations and carried five science instruments.",
    "https://www.isro.gov.in/FAQ_MarsOrbiterMission.html",
  ],
  [
    "perseverance",
    "Perseverance",
    "USA",
    "2020-07-30",
    "2021-02-18",
    "Jezero crater landing",
    "The rover investigates ancient environments and collects samples for potential future return.",
    science("mars-2020-perseverance"),
  ],
];
for (const [id, title, agency, start, end, event, summary, source] of marsRows)
  add(id, title, "mars", agency, "Flight to Mars encounter", summary, source.replace(/\/+$/, "/"), [
    ["launch", start, "Launch"],
    ["arrival", end, event],
  ]);
for (const [n, start, orbit, land] of [
  [1, "1975-08-20", "1976-06-19", "1976-07-20"],
  [2, "1975-09-09", "1976-08-07", "1976-09-03"],
])
  add(
    `viking-${n}`,
    `Viking ${n}`,
    "mars",
    "USA",
    "Flight to Mars landing",
    "A combined orbiter and lander mission investigated the atmosphere, geology and surface chemistry of Mars.",
    science(`viking-${n}`),
    [
      ["launch", start, "Launch"],
      ["orbit", orbit, "Mars orbit insertion"],
      ["arrival", land, "Lander touchdown"],
    ],
  );

add(
  "mariner-2",
  "Mariner 2",
  "deep-space",
  "USA",
  "Flight through Venus encounter",
  "The first successful planetary flyby measured Venus's hot environment without an imaging camera.",
  science("mariner-2"),
  [
    ["launch", "1962-08-27", "Launch"],
    ["venus", "1962-12-14", "Venus flyby"],
    ["last-contact", "1963-01-03", "Last contact"],
  ],
);
add(
  "mariner-10",
  "Mariner 10",
  "deep-space",
  "USA",
  "Flight through Mercury encounters",
  "A Venus gravity assist sent the spacecraft toward three flybys of Mercury.",
  science("mariner-10"),
  [
    ["launch", "1973-11-03", "Launch"],
    ["venus", "1974-02-05", "Venus gravity assist"],
    ["mercury-1", "1974-03-29", "First Mercury flyby"],
    ["mercury-2", "1974-09-21", "Second Mercury flyby"],
    ["mercury-3", "1975-03-16", "Third Mercury flyby"],
  ],
);
add(
  "pioneer-10",
  "Pioneer 10",
  "deep-space",
  "USA",
  "Flight to Jupiter",
  "The first Jupiter flyby tested passage through the asteroid belt and returned close-range measurements.",
  [science("pioneer-10"), chronology],
  [
    ["launch", "1972-03-03", "Launch (UTC)"],
    ["asteroids", "1972-07-15", "Enters asteroid belt"],
    ["jupiter", "1973-12-04", "Jupiter flyby"],
  ],
);
add(
  "pioneer-11",
  "Pioneer 11",
  "deep-space",
  "USA",
  "Flight through giant-planet encounters",
  "A Jupiter gravity assist redirected Pioneer 11 toward the first Saturn flyby.",
  [science("pioneer-11"), chronology],
  [
    ["launch", "1973-04-06", "Launch"],
    ["jupiter", "1974-12-03", "Jupiter flyby"],
    ["saturn", "1979-09-01", "Saturn flyby"],
  ],
);
add(
  "voyager-1",
  "Voyager 1",
  "deep-space",
  "USA",
  "Planetary encounter phase",
  "The trajectory encountered Jupiter and Saturn before the later interstellar mission. This interval ends at Saturn, not at spacecraft retirement.",
  science("voyager/voyager-1"),
  [
    ["launch", "1977-09-05", "Launch"],
    ["jupiter", "1979-03-05", "Jupiter flyby"],
    ["saturn", "1980-11-12", "Saturn flyby"],
  ],
);
add(
  "voyager-2",
  "Voyager 2",
  "deep-space",
  "USA",
  "Grand-tour encounter phase",
  "The only spacecraft to encounter all four giant planets. The plotted phase ends at Neptune; the spacecraft continued outward.",
  science("voyager/voyager-2"),
  [
    ["launch", "1977-08-20", "Launch"],
    ["jupiter", "1979-07-09", "Jupiter flyby"],
    ["saturn", "1981-08-25", "Saturn flyby"],
    ["uranus", "1986-01-24", "Uranus flyby"],
    ["neptune", "1989-08-25", "Neptune flyby"],
  ],
);
add(
  "galileo",
  "Galileo",
  "deep-space",
  "USA",
  "Jupiter exploration flight",
  "An atmospheric probe and orbiter investigated Jupiter and its moons; the orbiter was deliberately sent into Jupiter at mission end.",
  science("galileo"),
  [
    ["launch", "1989-10-18", "Launch aboard Atlantis"],
    ["gaspra", "1991-10-29", "Gaspra asteroid flyby"],
    ["ida", "1993-08-28", "Ida asteroid flyby"],
    ["jupiter", "1995-12-07", "Jupiter arrival and probe entry"],
    ["end", "2003-09-21", "Orbiter enters Jupiter"],
  ],
);
add(
  "cassini",
  "Cassini-Huygens",
  "deep-space",
  "International",
  "Saturn exploration flight",
  "The NASA/ESA/ASI mission combined a long-lived Saturn orbiter with ESA's Huygens probe to Titan.",
  science("cassini"),
  [
    ["launch", "1997-10-15", "Launch"],
    ["saturn", "2004-07-01", "Saturn orbit insertion (UTC)"],
    ["release", "2004-12-25", "Huygens released"],
    ["titan", "2005-01-14", "Huygens lands on Titan"],
    ["end", "2017-09-15", "Cassini's final atmospheric entry"],
  ],
);
add(
  "rosetta",
  "Rosetta",
  "deep-space",
  "Europe",
  "Comet rendezvous flight",
  "Rosetta escorted comet 67P and deployed the Philae lander before the orbiter's controlled descent.",
  "https://www.esa.int/Science_Exploration/Space_Science/Rosetta",
  [
    ["launch", "2004-03-02", "Launch"],
    ["arrival", "2014-08-06", "Arrives at comet 67P"],
    ["philae", "2014-11-12", "Philae reaches the comet surface"],
    ["end", "2016-09-30", "Orbiter's controlled comet descent"],
  ],
);
add(
  "new-horizons",
  "New Horizons",
  "deep-space",
  "USA",
  "Flight through Arrokoth encounter",
  "Jupiter's gravity assist preceded the Pluto and Arrokoth flybys. The interval is a completed encounter phase, not a claim that the mission ended.",
  science("new-horizons"),
  [
    ["launch", "2006-01-19", "Launch"],
    ["jupiter", "2007-02-28", "Jupiter gravity assist"],
    ["pluto", "2015-07-14", "Pluto flyby"],
    ["arrokoth", "2019-01-01", "Arrokoth flyby"],
  ],
);
add(
  "hayabusa2",
  "Hayabusa2",
  "deep-space",
  "Japan",
  "Ryugu sample-return phase",
  "Japan's spacecraft studied Ryugu and returned a sample capsule, then continued into an extended mission. Earth return was December 5 UTC, December 6 in Japan.",
  [
    "https://www.isas.jaxa.jp/en/missions/spacecraft/current/hayabusa2.html",
    "https://global.jaxa.jp/press/2020/12/20201206-1_e.html",
  ],
  [
    ["launch", "2014-12-03", "Launch"],
    ["arrival", "2018-06-27", "Arrives at Ryugu"],
    ["return", "2020-12-05", "Sample capsule returns (UTC)"],
  ],
);
add(
  "osiris-rex",
  "OSIRIS-REx",
  "deep-space",
  "USA",
  "Bennu sample-return phase",
  "A sample collection from Bennu was returned to Earth; the spacecraft continued as OSIRIS-APEX after releasing its capsule.",
  science("osiris-rex"),
  [
    ["launch", "2016-09-08", "Launch"],
    ["arrival", "2018-12-03", "Arrives at Bennu"],
    ["sample", "2020-10-20", "Touch-and-go sampling"],
    ["return", "2023-09-24", "Sample capsule lands in Utah"],
  ],
);

add(
  "sts-1",
  "STS-1",
  "launch-commercial",
  "USA",
  "Shuttle orbital test flight",
  "Columbia's first flight demonstrated a winged, reusable orbital spacecraft with a runway landing.",
  nasa("sts-1"),
  [
    ["launch", "1981-04-12", "Columbia launches"],
    ["return", "1981-04-14", "Edwards runway landing"],
  ],
);
add(
  "sts-135",
  "STS-135",
  "launch-commercial",
  "USA",
  "Final Shuttle flight",
  "Atlantis delivered supplies to the International Space Station on the last Space Shuttle mission.",
  nasa("sts-135"),
  [
    ["launch", "2011-07-08", "Atlantis launches"],
    ["dock", "2011-07-10", "ISS docking"],
    ["return", "2011-07-21", "Final Shuttle landing"],
  ],
);
add(
  "dragon-c2",
  "Dragon C2+",
  "launch-commercial",
  "USA",
  "Commercial cargo demonstration",
  "SpaceX's Dragon became the first commercial spacecraft to be captured and berthed at the ISS. Capture and berthing are distinct from autonomous docking.",
  "https://www.nasa.gov/wp-content/uploads/2023/01/presrep2012.pdf",
  [
    ["launch", "2012-05-22", "Falcon 9 / Dragon launch"],
    ["capture", "2012-05-25", "ISS crew captures Dragon"],
    ["return", "2012-05-31", "Dragon splashdown"],
  ],
);
add(
  "demo-2",
  "Crew Dragon Demo-2",
  "launch-commercial",
  "USA",
  "Crewed demonstration flight",
  "Robert Behnken and Douglas Hurley tested commercial crew transport to the ISS.",
  "https://www.nasa.gov/nasas-spacex-demo-2-resources-archive/",
  [
    ["launch", "2020-05-30", "Crew Dragon launches"],
    ["dock", "2020-05-31", "ISS docking"],
    ["return", "2020-08-02", "Gulf of Mexico splashdown"],
  ],
);
add(
  "artemis-1",
  "Artemis I",
  "launch-commercial",
  "USA",
  "Uncrewed lunar test flight",
  "The first SLS flight sent Orion around the Moon to test integrated systems and high-speed reentry.",
  nasa("artemis-i"),
  [
    ["launch", "2022-11-16", "SLS maiden launch"],
    ["orbit", "2022-11-25", "Distant retrograde orbit insertion"],
    ["return", "2022-12-11", "Orion splashdown"],
  ],
);
add(
  "blue-ghost-1",
  "Blue Ghost Mission 1",
  "launch-commercial",
  "USA",
  "Flight to lunar landing",
  "Firefly's commercial lander delivered NASA instruments to Mare Crisium under the CLPS program.",
  "https://fireflyspace.com/missions/blue-ghost-mission-1/",
  [
    ["launch", "2025-01-15", "Launch"],
    ["arrival", "2025-03-02", "Mare Crisium landing"],
  ],
);

add(
  "kepler",
  "Kepler",
  "observatories",
  "USA",
  "Science mission through retirement",
  "Transit photometry surveyed exoplanets; the repurposed K2 campaign extended the spacecraft's observing life.",
  science("kepler"),
  [
    ["launch", "2009-03-07", "Launch (UTC)"],
    ["retire", "2018-10-30", "Mission retirement announced"],
  ],
);
add(
  "spitzer",
  "Spitzer",
  "observatories",
  "USA",
  "Infrared observatory operations",
  "Infrared observations continued in a warm mission after the cryogenic phase ended.",
  science("spitzer"),
  [
    ["launch", "2003-08-25", "Launch"],
    ["warm", "2009-05-15", "Liquid helium depleted"],
    ["end", "2020-01-30", "Science operations end"],
  ],
);
add(
  "herschel",
  "Herschel",
  "observatories",
  "Europe",
  "Cryogenic observatory operations",
  "A far-infrared and submillimetre observatory operated until its helium coolant was exhausted.",
  "https://www.esa.int/Science_Exploration/Space_Science/Herschel",
  [
    ["launch", "2009-05-14", "Launch with Planck"],
    ["end", "2013-04-29", "Helium exhaustion ends observations"],
  ],
);
add(
  "webb",
  "James Webb Space Telescope",
  "observatories",
  "International",
  "Launch and commissioning",
  "The NASA/ESA/CSA infrared observatory deployed en route to L2 and completed commissioning before its first full-colour science release.",
  "https://science.nasa.gov/mission/webb/",
  [
    ["launch", "2021-12-25", "Ariane 5 launch"],
    ["l2", "2022-01-24", "L2 orbit insertion"],
    ["science", "2022-07-12", "First full-colour science release"],
  ],
);
add(
  "parker",
  "Parker Solar Probe",
  "observatories",
  "USA",
  "Flight to record solar approach",
  "Repeated Venus gravity assists enabled increasingly close passages to the Sun. The named interval ends at the December 2024 encounter, not at mission retirement.",
  science("parker-solar-probe"),
  [
    ["launch", "2018-08-12", "Launch"],
    ["encounter", "2024-12-24", "Record close solar approach"],
  ],
);

export const standalone = [
  [
    "vanguard-1.launch",
    "Vanguard 1 launches",
    "1958-03-17",
    "early-spaceflight",
    "USA",
    "Solar-powered satellite for geodesy and atmospheric studies.",
    chronology,
  ],
  [
    "vostok-1.launch",
    "Yuri Gagarin's orbital flight",
    "1961-04-12",
    "early-spaceflight",
    "USSR",
    "Vostok 1 carried the first human into space and Earth orbit.",
    "https://www.nasa.gov/image-article/april-1961-first-human-entered-space/",
  ],
  [
    "freedom-7.launch",
    "Alan Shepard's suborbital flight",
    "1961-05-05",
    "early-spaceflight",
    "USA",
    "Mercury-Redstone 3 carried the first American into space.",
    nasa("mercury-redstone-3-freedom-7"),
  ],
  [
    "friendship-7.launch",
    "John Glenn orbits Earth",
    "1962-02-20",
    "early-spaceflight",
    "USA",
    "Mercury-Atlas 6 completed three orbits with John Glenn aboard.",
    "https://www.nasa.gov/image-article/friendship-7/",
  ],
  [
    "ariane-1.launch",
    "Ariane 1 maiden launch",
    "1979-12-24",
    "launch-commercial",
    "Europe",
    "Europe's Ariane launcher made its first flight from French Guiana.",
    "https://www.esa.int/Enabling_Support/Space_Transportation/Ariane/The_origins_of_Ariane",
  ],
  [
    "falcon-1.orbit",
    "Falcon 1 reaches orbit",
    "2008-09-28",
    "launch-commercial",
    "USA",
    "The fourth Falcon 1 flight successfully reached Earth orbit.",
    "https://www.nasa.gov/wp-content/uploads/2023/01/presrep2008.pdf",
  ],
  [
    "falcon-9.land",
    "Falcon 9 lands at Cape Canaveral",
    "2015-12-22",
    "launch-commercial",
    "USA",
    "An orbital-class Falcon 9 first stage landed at Cape Canaveral. The UTC date was December 22; Florida was still on December 21.",
    "https://blogs.nasa.gov/commercialcrew/2015/12/",
  ],
  [
    "zarya.launch",
    "Zarya begins ISS assembly",
    "1998-11-20",
    "space-stations",
    "International",
    "The first International Space Station module launched from Baikonur.",
    "https://www.nasa.gov/image-article/dec-6-1998-international-space-station-assembly-begins/",
  ],
  [
    "tianhe.launch",
    "Tianhe core module launches",
    "2021-04-29",
    "space-stations",
    "China",
    "The core module began construction of China's modular space station.",
    "https://english.cas.cn/Special_Reports/rd/2021/202210/t20221017_321657.shtml",
  ],
  [
    "hubble.launch",
    "Hubble launches aboard Discovery",
    "1990-04-24",
    "observatories",
    "International",
    "The NASA/ESA observatory was carried into orbit by STS-31.",
    "https://science.nasa.gov/mission/hubble/overview/hubble-timeline/",
  ],
  [
    "hubble.repair",
    "Hubble's first servicing mission launches",
    "1993-12-02",
    "observatories",
    "USA",
    "STS-61 carried optical correction instruments and other upgrades to Hubble.",
    nasa("sts-61"),
  ],
  [
    "chandra.launch",
    "Chandra launches aboard Columbia",
    "1999-07-23",
    "observatories",
    "USA",
    "STS-93 deployed the X-ray observatory for high-energy astronomy.",
    "https://www.nasa.gov/mission/sts-93/",
  ],
  [
    "xmm.launch",
    "XMM-Newton launches",
    "1999-12-10",
    "observatories",
    "Europe",
    "ESA's X-ray observatory launched on Ariane 5.",
    "https://www.esa.int/Science_Exploration/Space_Science/XMM-Newton_factsheet",
  ],
];

// Deliberate cross-mission relationships, never inferred historical causality.
export const connections = [
  ["gemini-8.dock", "apollo-10.milestone", "reference", "Earlier docking demonstration"],
  ["surveyor-3.arrival", "apollo-12.milestone", "reference", "Apollo 12 visited Surveyor 3"],
  ["zarya.launch", "sts-88.join", "rendezvous", "Zarya joined to Unity"],
  ["mir.phase", "sts-71.dock", "rendezvous", "Mir received Atlantis"],
  ["skylab.phase", "skylab-2.phase", "part-of", "Hosted first crew"],
  ["skylab.phase", "skylab-3.phase", "part-of", "Hosted second crew"],
  ["skylab.phase", "skylab-4.phase", "part-of", "Hosted third crew"],
  ["hubble.launch", "hubble.repair", "reference", "Servicing the same telescope"],
  ["sts-1.launch", "sts-135.return", "reference", "First and last Shuttle flights"],
  ["voyager-2.launch", "voyager-1.launch", "reference", "Twin Voyager spacecraft"],
  ["spirit.launch", "opportunity.launch", "reference", "Twin Mars Exploration Rovers"],
  ["viking-1.launch", "viking-2.launch", "reference", "Paired Viking missions"],
  ["dragon-c2.capture", "demo-2.dock", "reference", "Cargo and crew transport demonstrations"],
  ["sts-88.join", "iss-expedition-1.arrive", "reference", "Assembly before first residency"],
];

export const overviewIds = [
  "sputnik-1.launch",
  "explorer-1.launch",
  "vostok-1.launch",
  "vostok-6.launch",
  "voskhod-2.eva",
  "gemini-8.dock",
  "apollo-8.milestone",
  "apollo-11.launch",
  "apollo-11.landing",
  "apollo-11.return",
  "apollo-13.milestone",
  "apollo-17.milestone",
  "salyut-1.launch",
  "skylab.launch",
  "mir.launch",
  "sts-71.dock",
  "zarya.launch",
  "sts-88.join",
  "iss-expedition-1.arrive",
  "tianhe.launch",
  "luna-2.arrival",
  "luna-3.arrival",
  "luna-9.arrival",
  "surveyor-1.arrival",
  "change-1.arrival",
  "change-4.arrival",
  "chandrayaan-3.arrival",
  "change-6.return",
  "mariner-4.arrival",
  "mariner-9.arrival",
  "viking-1.arrival",
  "pathfinder.arrival",
  "mars-express.arrival",
  "curiosity.arrival",
  "mom.arrival",
  "perseverance.arrival",
  "mariner-2.venus",
  "pioneer-10.jupiter",
  "voyager-2.neptune",
  "galileo.jupiter",
  "cassini.titan",
  "rosetta.philae",
  "new-horizons.pluto",
  "hayabusa2.return",
  "osiris-rex.return",
  "ariane-1.launch",
  "sts-1.launch",
  "falcon-1.orbit",
  "dragon-c2.capture",
  "falcon-9.land",
  "demo-2.launch",
  "artemis-1.return",
  "blue-ghost-1.arrival",
  "hubble.launch",
  "chandra.launch",
  "kepler.launch",
  "webb.science",
  "parker.encounter",
];
