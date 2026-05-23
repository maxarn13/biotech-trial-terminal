// api.js — ClinicalTrials.gov API v2 client

const CT_BASE = "https://clinicaltrials.gov/api/v2";

// Ticker → canonical sponsor name(s) on CT.gov
const TICKER_TO_SPONSORS = {
  // ── CURRENT WATCHLIST ────────────────────────────────────────────────────
  PRAX: ["Praxis Precision Medicines"],
  DNLI: ["Denali Therapeutics"],
  ALEC: ["Alector"],
  PASG: ["Passage Bio"],
  BIIB: ["Biogen"],
  MRNA: ["ModernaTX, Inc.", "Moderna, Inc.", "Moderna"],
  SAGE: ["Sage Therapeutics"],
  RVMD: ["Revolution Medicines"],
  CADL: ["Candel Therapeutics"],
  IPHA: ["IO Biotech"],

  // ── MEGA-CAP PHARMA ───────────────────────────────────────────────────────
  REGN: ["Regeneron Pharmaceuticals", "Regeneron Pharmaceuticals Inc."],
  AMGN: ["Amgen", "Amgen Inc."],
  GILD: ["Gilead Sciences", "Gilead Sciences, Inc."],
  ABBV: ["AbbVie", "AbbVie Inc."],
  PFE:  ["Pfizer", "Pfizer Inc."],
  JNJ:  ["Janssen Research & Development, LLC", "Janssen Biotech, Inc.", "Johnson & Johnson"],
  NVO:  ["Novo Nordisk", "Novo Nordisk A/S"],
  LLY:  ["Eli Lilly and Company"],
  AZN:  ["AstraZeneca", "AstraZeneca AB"],
  BMY:  ["Bristol-Myers Squibb", "Bristol Myers Squibb"],
  MRK:  ["Merck Sharp & Dohme LLC", "Merck Sharp & Dohme Corp."],
  VRTX: ["Vertex Pharmaceuticals", "Vertex Pharmaceuticals Incorporated"],
  INCY: ["Incyte Corporation"],
  SNY:  ["Sanofi", "sanofi-aventis", "Sanofi Pasteur"],
  GSK:  ["GlaxoSmithKline", "GSK", "GlaxoSmithKline LLC"],
  NVS:  ["Novartis Pharmaceuticals Corporation", "Novartis"],
  TAK:  ["Takeda", "Takeda Development Center Americas, Inc.", "Takeda Pharmaceuticals"],
  RHHBY:["Hoffmann-La Roche", "F. Hoffmann-La Roche", "Genentech, Inc."],
  BAYRY:["Bayer", "Bayer AG", "Bayer HealthCare", "Bayer Healthcare LLC"],
  JAZZ: ["Jazz Pharmaceuticals", "Jazz Pharmaceuticals Ireland Limited"],
  UTHR: ["United Therapeutics"],
  RPRX: ["Royalty Pharma"],
  LNTH: ["Lantheus", "Lantheus Medical Imaging"],
  UCB:  ["UCB Pharma", "UCB Biopharma SRL", "UCB S.A."],
  ORION:["Orion Corporation"],

  // ── LARGE-CAP BIOTECH ─────────────────────────────────────────────────────
  ALNY: ["Alnylam Pharmaceuticals"],
  ALKS: ["Alkermes", "Alkermes, Inc.", "Alkermes Pharma Ireland Limited"],
  IONS: ["Ionis Pharmaceuticals", "Ionis Pharmaceuticals, Inc."],
  BGNE: ["BeiGene", "BeiGene, Ltd."],
  HALO: ["Halozyme Therapeutics"],
  ACAD: ["ACADIA Pharmaceuticals"],
  ARWR: ["Arrowhead Pharmaceuticals"],
  KYMR: ["Kymera Therapeutics"],
  IMVT: ["Immunovant", "Immunovant, Inc."],
  ROIV: ["Roivant Sciences"],
  ARVN: ["Arvinas"],
  NBIX: ["Neurocrine Biosciences"],
  RCUS: ["Arcus Biosciences"],
  ALLO: ["Allogene Therapeutics"],
  NRIX: ["Nurix Therapeutics"],
  YMAB: ["Y-mAbs Therapeutics"],
  XNCR: ["Xencor"],
  CLDX: ["Celldex Therapeutics"],
  TNGX: ["Tango Therapeutics"],
  MNKD: ["MannKind Corporation"],
  PTGX: ["Protagonist Therapeutics"],
  SANA: ["Sana Biotechnology"],
  MIRM: ["Mirum Pharmaceuticals"],
  LEGN: ["Legend Biotech", "Legend Biotech USA Inc."],
  ZYME: ["Zymeworks"],
  IMCR: ["Immunocore", "Immunocore Limited"],
  HOOK: ["Hookipa Pharma"],
  RLAY: ["Relay Therapeutics"],
  PMVP: ["PMV Pharmaceuticals"],
  VRDN: ["Viridian Therapeutics"],
  TARS: ["Tarsus Pharmaceuticals"],
  NUVL: ["Nuvalent", "Nuvalent, Inc."],
  ERAS: ["Erasca"],
  KRYS: ["Krystal Biotech"],
  GRTS: ["Gritstone Bio"],
  SNDX: ["Syndax Pharmaceuticals"],
  MGTX: ["MeiraGTx"],
  ADPT: ["Adaptive Biotechnologies"],
  TWST: ["Twist Bioscience"],
  NKTR: ["Nektar Therapeutics"],
  GMAB: ["Genmab", "Genmab A/S", "Genmab B.V."],
  GLPG: ["Galapagos", "Galapagos NV"],
  FATE: ["Fate Therapeutics", "Fate Therapeutics, Inc."],
  EXEL: ["Exelixis"],
  HZNP: ["Horizon Therapeutics", "Horizon Therapeutics USA Inc."],
  ITCI: ["Intra-Cellular Therapies"],

  // ── ONCOLOGY ──────────────────────────────────────────────────────────────
  KPTI: ["Karyopharm Therapeutics", "Karyopharm Therapeutics Inc."],
  MGNX: ["MacroGenics", "MacroGenics, Inc."],
  IMGN: ["ImmunoGen", "ImmunoGen, Inc."],
  AGEN: ["Agenus Inc.", "Agenus"],
  SMMT: ["Summit Therapeutics", "Summit Therapeutics Inc."],
  TGTX: ["TG Therapeutics", "TG Therapeutics, Inc."],
  GTHX: ["G1 Therapeutics", "G1 Therapeutics, Inc."],
  SYRS: ["Syros Pharmaceuticals"],
  IDYA: ["IDEAYA Biosciences"],
  RAPT: ["RAPT Therapeutics", "RAPT Therapeutics, Inc."],
  LYEL: ["Lyell Immunopharma"],
  ALXO: ["ALX Oncology"],
  STRO: ["Sutro Biopharma"],
  ORIC: ["Oric Pharmaceuticals"],
  IMTX: ["Immatics Biotechnologies GmbH", "Immatics US, Inc."],
  NBTX: ["Nanobiotix"],
  BCYC: ["Bicycle Therapeutics", "Bicycle Therapeutics Limited"],
  EPZM: ["Epizyme", "Epizyme, Inc."],
  ATRA: ["Atara Biotherapeutics"],
  MRUS: ["Merus", "Merus N.V."],
  PRME: ["Prime Medicine"],
  TYRA: ["Tyra Biosciences"],
  DAWN: ["Day One Biopharmaceuticals"],
  DCPH: ["Deciphera Pharmaceuticals"],
  SPPI: ["Spectrum Pharmaceuticals"],
  SGEN: ["Seagen", "Seagen Inc."],
  MERUS:["Merus N.V."],
  ONCT: ["Oncternal Therapeutics"],
  KRON: ["Kronos Bio"],
  RXRX: ["Recursion Pharmaceuticals"],
  AGIO: ["Agios Pharmaceuticals"],
  RVNC: ["Revance Therapeutics", "Revance Therapeutics, Inc."],
  ZNTL: ["Zentalis Pharmaceuticals"],
  XBIA: ["Xilio Therapeutics"],
  MDNA: ["Medicenna Therapeutics"],

  // ── NEUROLOGY / CNS ───────────────────────────────────────────────────────
  AXSM: ["Axsome Therapeutics"],
  LBPH: ["Longboard Pharmaceuticals"],
  MNMD: ["Mind Medicine Inc.", "MindMed", "Mind Medicine (MindMed) Inc."],
  OVID: ["Ovid Therapeutics"],
  RLMD: ["Relmada Therapeutics"],
  SAVA: ["Cassava Sciences"],
  VNDA: ["Vanda Pharmaceuticals"],
  CERE: ["Cerevel Therapeutics", "Cerevel Therapeutics, LLC"],
  BHVN: ["Biohaven", "Biohaven Pharmaceutical Holding Company Ltd.", "Biohaven Pharmaceuticals"],
  ACNB: ["Acnb Corporation"],
  PRAX2:["Praxis Precision Medicines"],  // alias
  INVA: ["Innoviva"],
  CABA: ["Cabaletta Bio"],
  FULC: ["Fulcrum Therapeutics", "Fulcrum Therapeutics, Inc."],

  // ── RARE DISEASE / GENETICS ───────────────────────────────────────────────
  ASND: ["Ascendis Pharma"],
  BBIO: ["BridgeBio Pharma", "BridgeBio Pharma, Inc."],
  BLUE: ["bluebird bio", "Bluebird Bio"],
  SRPT: ["Sarepta Therapeutics", "Sarepta Therapeutics Inc."],
  RARE: ["Ultragenyx Pharmaceutical", "Ultragenyx Pharmaceutical Inc."],
  FOLD: ["Amicus Therapeutics"],
  BEAM: ["Beam Therapeutics"],
  EDIT: ["Editas Medicine"],
  CRSP: ["CRISPR Therapeutics"],
  NTLA: ["Intellia Therapeutics"],
  NVAX: ["Novavax", "Novavax, Inc."],
  BNTX: ["BioNTech SE", "BioNTech"],
  QURE: ["uniQure", "uniQure N.V.", "uniQure biopharma B.V."],
  SLDB: ["Solid Biosciences"],
  TRDA: ["Entrada Therapeutics"],
  TVTX: ["Travere Therapeutics"],
  PLRX: ["Pliant Therapeutics"],
  PRTA: ["Prothena Corporation", "Prothena Biosciences Inc"],
  PTCT: ["PTC Therapeutics", "PTC Therapeutics, Inc."],
  RYTM: ["Rhythm Pharmaceuticals"],
  LRMR: ["Larimar Therapeutics"],
  PHAT: ["Pharvaris", "Pharvaris N.V.", "Pharvaris Netherlands B.V."],
  GERN: ["Geron Corporation"],
  AVEO: ["AVEO Pharmaceuticals"],
  CORT: ["Corcept Therapeutics"],
  LGND: ["Ligand Pharmaceuticals"],
  HIMS: ["Hims & Hers Health"],

  // ── IMMUNOLOGY / INFLAMMATION ─────────────────────────────────────────────
  ANAB: ["AnaptysBio"],
  APLS: ["Apellis Pharmaceuticals"],
  ARDX: ["Ardelyx", "Ardelyx, Inc."],
  ARQT: ["Arcutis Biotherapeutics", "Arcutis Biotherapeutics, Inc."],
  SELB: ["Selecta Biosciences"],
  SPRB: ["Spruce Biosciences"],
  IMVT2:["Immunovant"],

  // ── CARDIOLOGY / METABOLIC ────────────────────────────────────────────────
  ETNB: ["89bio", "89bio Ltd."],
  MDGL: ["Madrigal Pharmaceuticals"],
  VKTX: ["Viking Therapeutics"],
  VRNA: ["Verona Pharma", "Verona Pharma plc"],
  AMRN: ["Amarin Corporation", "Amarin Pharma Inc."],
  AKBA: ["Akebia Therapeutics"],
  LXRX: ["Lexicon Pharmaceuticals", "Lexicon Pharmaceuticals, Inc."],
  ESPR: ["Esperion Therapeutics"],

  // ── GENE / CELL THERAPY ───────────────────────────────────────────────────
  AUTL: ["Autolus Therapeutics", "Autolus Limited"],
  CLLS: ["Cellectis", "Cellectis S.A."],
  VERV: ["Verve Therapeutics"],
  RNA:  ["Avidity Biosciences"],
  GRPH: ["Graphite Bio"],
  ORCA: ["Orca Bio", "Orca Biosystems"],

  // ── VACCINES / INFECTIOUS DISEASE ─────────────────────────────────────────
  CVAC: ["CureVac", "CureVac AG", "CureVac SE"],
  VXRT: ["Vaxart", "Vaxart, Inc."],
  PCVX: ["Vaxcyte", "Vaxcyte, Inc."],
  GOVX: ["GeoVax Labs"],
  DYAI: ["Dyadic International"],

  // ── DIAGNOSTICS / TOOLS ───────────────────────────────────────────────────
  RGEN: ["Repligen Corporation"],
  NVCR: ["NovoCure", "NovoCure Ltd."],
  SDGR: ["Schrödinger", "Schrodinger"],
  NVTA: ["Invitae", "Invitae Corporation"],

  // ── OTHER BIOTECH / SPECIALTY PHARMA ─────────────────────────────────────
  KROS: ["Keros Therapeutics"],
  CRNX: ["Crinetics Pharmaceuticals"],
  RNA2: ["Avidity Biosciences"],
  NKTR2:["Nektar Therapeutics"],
  AGIO2:["Agios Pharmaceuticals"],
  RVNC2:["Revance Therapeutics"],
  DBTX: ["Dogness International"],
  CLVT: ["Clovis Oncology"],
  ACLS: ["Achaogen"],
  MGTX2:["MeiraGTx"],
  IMVT3:["Immunovant"],
  NBTX2:["Nanobiotix"],
  TBPH: ["Theravance Biopharma", "Theravance Biopharma US, Inc."],
  CPRX: ["Catalyst Biosciences"],
  FGEN: ["FibroGen", "FibroGen, Inc."],
  ANIK: ["Anika Therapeutics"],
  INFU: ["InfuSystem Holdings"],
  AXNX: ["Axonics"],
  NRXP: ["NRx Pharmaceuticals"],
  SPRY: ["Sprycel"],
  PRTK: ["Paratek Pharmaceuticals"],
  VNDA2:["Vanda Pharmaceuticals"],
  LBPS: ["Longboard Pharmaceuticals"],
  SPPI2:["Spectrum Pharmaceuticals"],
  TROX: ["Tronox"],
  IMGN2:["ImmunoGen"],
  CDEV: ["Centennial Resource Development"],
  MNKD2:["MannKind Corporation"],
  GNTX: ["Gentex Corporation"],
};

// Build reverse map: lowercase sponsor name → ticker
const SPONSOR_TO_TICKER = {};
Object.entries(TICKER_TO_SPONSORS).forEach(function(entry) {
  var tk = entry[0]; var sponsors = entry[1];
  sponsors.forEach(function(s) { SPONSOR_TO_TICKER[s.toLowerCase()] = tk; });
});

function getTicker(sponsorName) {
  if (!sponsorName) return null;
  var lo = sponsorName.toLowerCase();
  if (SPONSOR_TO_TICKER[lo]) return SPONSOR_TO_TICKER[lo];
  for (var sp in SPONSOR_TO_TICKER) {
    if (lo.includes(sp) || sp.includes(lo)) return SPONSOR_TO_TICKER[sp];
  }
  return null;
}

// Analyst overlay: financial assumptions not in CT.gov
const OVERLAY = {
  "NCT04747431": { ticker:"PASG", pos:0.32, peakSales:480,  catalystKind:"INTERIM",  enrolled:11,  target:18,  delta:"Cohort 3 dose escalation cleared by DSMB" },
  "NCT04408625": { ticker:"DNLI", pos:0.41, peakSales:1200, catalystKind:"TOPLINE",  enrolled:24,  target:32,  delta:"Sham-controlled extension added; SAP locked" },
  "NCT05053035": { ticker:"ALEC", pos:0.38, peakSales:1850, catalystKind:"PIVOTAL",  enrolled:103, target:110, delta:"Enrollment 94% complete; primary readout on track" },
  "NCT05262023": { ticker:"ALEC", pos:0.18, peakSales:2400, catalystKind:"TOPLINE",  enrolled:188, target:282, delta:"DMC interim futility passed (Oct '25)" },
  "NCT03767582": { ticker:"CADL", pos:0.34, peakSales:720,  catalystKind:"TOPLINE",  enrolled:78,  target:78,  delta:"Last patient last visit reached Q4 '25" },
  "NCT04097028": { ticker:"CADL", pos:0.22, peakSales:310,  catalystKind:"UPDATE",   enrolled:41,  target:52,  delta:"Multi-dose cohort enrollment open" },
  "NCT05379985": { ticker:"RVMD", pos:0.46, peakSales:4100, catalystKind:"INTERIM",  enrolled:312, target:460, delta:"Enrollment outpacing model by 14%" },
  "NCT05533387": { ticker:"RVMD", pos:0.55, peakSales:1900, catalystKind:"ASCO",     enrolled:92,  target:120, delta:"ASCO 2026 abstract accepted (LBA)" },
  "NCT05123482": { ticker:"IPHA", pos:0.12, peakSales:540,  catalystKind:"INTERIM",  enrolled:47,  target:90,  delta:"Enrollment trailing plan (~52%)" },
  "NCT05123495": { ticker:"PRAX", pos:0.40, peakSales:880,  catalystKind:"TOPLINE",  enrolled:64,  target:90,  delta:"Dose-titration amendment accepted" },
  "NCT04557410": { ticker:"PRAX", pos:0.52, peakSales:1700, catalystKind:"PIVOTAL",  enrolled:398, target:400, delta:"Top-line guidance reaffirmed to Q2 '26" },
  "NCT05028348": { ticker:"BIIB", pos:0.30, peakSales:3200, catalystKind:"TOPLINE",  enrolled:720, target:735, delta:"Dosing complete in 99% of treatment arm" },
  "NCT04895709": { ticker:"SAGE", pos:0.00, peakSales:0,    catalystKind:"READ",     enrolled:196, target:196, delta:"Missed primary; program discontinued" },
  "NCT05712135": { ticker:"MRNA", pos:0.48, peakSales:5200, catalystKind:"PIVOTAL",  enrolled:612, target:1089,delta:"Enrollment 56%; site activation ahead of plan" },
  "NCT05789888": { ticker:"MRNA", pos:0.20, peakSales:700,  catalystKind:"UPDATE",   enrolled:36,  target:84,  delta:"RP2D selected (Nov '25)" },
  "NCT06012381": { ticker:"DNLI", pos:0.58, peakSales:2100, catalystKind:"TOPLINE",  enrolled:54,  target:54,  delta:"BLA pre-submission meeting scheduled" },
  "NCT05900713": { ticker:"IPHA", pos:0.10, peakSales:410,  catalystKind:"UPDATE",   enrolled:22,  target:60,  delta:"Cohort 2 (PDAC) opened" },
  "NCT05445934": { ticker:"CADL", pos:0.24, peakSales:660,  catalystKind:"INTERIM",  enrolled:28,  target:60,  delta:"Two confirmed PRs reported (Nov '25)" },
  "NCT06091254": { ticker:"PASG", pos:0.18, peakSales:220,  catalystKind:"FPI",      enrolled:0,   target:6,   delta:"IND clearance Nov '25; FPI guided Q2 '26" },
  "NCT05712601": { ticker:"BIIB", pos:0.42, peakSales:600,  catalystKind:"READ",     enrolled:150, target:150, delta:"Event accrual on track" },
};

const STATUS_MAP = {
  RECRUITING:               "RECRUITING",
  ACTIVE_NOT_RECRUITING:    "ACTIVE_NE",
  NOT_YET_RECRUITING:       "NOT_YET",
  TERMINATED:               "TERMINATED",
  COMPLETED:                "COMPLETED",
  WITHDRAWN:                "TERMINATED",
  SUSPENDED:                "TERMINATED",
  ENROLLING_BY_INVITATION:  "RECRUITING",
  UNKNOWN_STATUS:           "RECRUITING",
};

function parsePhase(phases) {
  if (!phases || !phases.length) return "N/A";
  var nums = phases
    .filter(function(p) { return p !== "NA"; })
    .map(function(p) { return p === "EARLY_PHASE1" ? "early 1" : p.replace("PHASE", ""); });
  return nums.length ? nums.join("/") : "N/A";
}

function mapStudy(raw, forceTicker) {
  var ps = raw.protocolSection || {};
  var id = ps.identificationModule        || {};
  var st = ps.statusModule                || {};
  var sp = ps.sponsorCollaboratorsModule  || {};
  var de = ps.descriptionModule           || {};
  var co = ps.conditionsModule            || {};
  var di = ps.designModule                || {};
  var ai = ps.armsInterventionsModule     || {};
  var ou = ps.outcomesModule              || {};
  var lo = ps.contactsLocationsModule     || {};

  var nctId = id.nctId;
  var ov = OVERLAY[nctId] || {};

  var ivns = ai.interventions || [];
  var primaryTypes = new Set(["DRUG","BIOLOGICAL","GENETIC","COMBINATION_PRODUCT"]);
  var drug =
    ivns.filter(function(i) { return primaryTypes.has(i.type) && !/placebo|vehicle/i.test(i.name); }).map(function(i) { return i.name; })[0]
    || ivns.filter(function(i) { return !/placebo|vehicle/i.test(i.name); }).map(function(i) { return i.name; })[0]
    || (ivns[0] && ivns[0].name)
    || (id.briefTitle && id.briefTitle.split(/[:\-–]/)[0].trim())
    || "—";

  var sponsorName = (sp.leadSponsor && sp.leadSponsor.name) || "";
  var ticker = forceTicker || ov.ticker || getTicker(sponsorName) || null;

  var phase  = parsePhase(di.phases);
  var status = STATUS_MAP[st.overallStatus] || st.overallStatus || "UNKNOWN";

  var apiCondition = (co.conditions || [])[0] || "";
  var indication   = apiCondition.slice(0, 50) || "Unknown";

  var enrollInfo = di.enrollmentInfo || {};
  var enrollCount = enrollInfo.count != null ? enrollInfo.count : 0;
  var isActual    = enrollInfo.type === "ACTUAL";
  var target   = ov.target   != null ? ov.target   : enrollCount;
  var enrolled = ov.enrolled != null ? ov.enrolled : (isActual ? enrollCount : null);

  var sites      = (lo.locations || []).length || null;
  var startDate  = (st.startDateStruct && st.startDateStruct.date)            || "";
  var pcd        = (st.primaryCompletionDateStruct && st.primaryCompletionDateStruct.date)
                || (st.completionDateStruct && st.completionDateStruct.date) || "";
  var lastChange = (st.lastUpdatePostDateStruct && st.lastUpdatePostDateStruct.date) || "";
  var endpoint   = (ou.primaryOutcomes && ou.primaryOutcomes[0] && ou.primaryOutcomes[0].measure) || "";

  var catalystDate = pcd;
  var kind = ov.catalystKind || (phase === "3" ? "TOPLINE" : phase === "2" || phase === "2b" ? "INTERIM" : "UPDATE");
  var catalyst = catalystDate ? { date: catalystDate, kind: kind } : null;

  return {
    id: nctId, ticker: ticker, drug: drug, phase: phase, status: status, indication: indication,
    title:      id.briefTitle || id.officialTitle || "",
    enrolled: enrolled, target: target, sites: sites,
    start: startDate, pcd: pcd, endpoint: endpoint,
    sponsor:    sponsorName,
    lastChange: lastChange, catalyst: catalyst,
    pos:        ov.pos       != null ? ov.pos       : 0.25,
    peakSales:  ov.peakSales != null ? ov.peakSales : 300,
    delta: ov.delta || (de.briefSummary && de.briefSummary.slice(0, 200)) || "",
  };
}

// Build a CT.gov query string safely — avoids URLSearchParams object-literal issues with dotted keys
function buildQuery(pairs) {
  return pairs
    .filter(function(p) { return p[1] != null && p[1] !== ""; })
    .map(function(p) { return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]); })
    .join("&");
}

// ── SEC EDGAR ticker resolver ─────────────────────────────────────────────────
// SEC publishes a complete map of every public company: ticker → legal name.
// We load it once, lazily, and use it to resolve unknown tickers to a company
// name we can then search on CT.gov.

var _secCache = null;   // { "AXSM": "AXSOME THERAPEUTICS INC", ... }
var _secPromise = null; // singleton in-flight promise

async function loadSecTickers() {
  if (_secCache) return _secCache;
  if (!_secPromise) {
    _secPromise = fetch("https://www.sec.gov/files/company_tickers.json")
      .then(function(r) { return r.ok ? r.json() : {}; })
      .then(function(data) {
        _secCache = {};
        Object.values(data).forEach(function(c) {
          if (c.ticker) _secCache[c.ticker.toUpperCase()] = c.title || "";
        });
        return _secCache;
      })
      .catch(function() { _secCache = {}; return _secCache; });
  }
  return _secPromise;
}

// Convert an SEC legal name like "AXSOME THERAPEUTICS INC" into a CT.gov-friendly
// sponsor search term like "Axsome Therapeutics"
function secNameToSponsor(title) {
  if (!title) return null;
  var cleaned = title
    // strip trailing legal suffixes
    .replace(/[,\s]+(INC|CORP|LTD|LLC|PLC|CO|COMPANY|GROUP|HOLDINGS?|AG|SE|NV|BV|SA|SAS|GMBH|AB|ASA|OY|PTY|SRL|LP|LPA|L\.P\.?)\.?$/i, "")
    .replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  // Title-case: keep short words (≤3 chars that look like abbreviations) uppercase
  return cleaned.split(/\s+/).map(function(w) {
    if (/^[A-Z]{2,4}$/.test(w)) return w; // keep IO, mAb, etc.
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(" ");
}

// Given an unknown ticker, attempt to resolve it to a CT.gov sponsor search term.
// Returns null if resolution fails.
async function resolveUnknownTicker(ticker) {
  var sec = await loadSecTickers();
  var title = sec[ticker];
  if (!title) return null;
  var name = secNameToSponsor(title);
  // Cache the resolved name so subsequent calls skip the SEC fetch
  if (name) {
    TICKER_TO_SPONSORS[ticker] = [name];
    SPONSOR_TO_TICKER[name.toLowerCase()] = ticker;
  }
  return name;
}

// ── sponsor search helpers ────────────────────────────────────────────────────

// Run a single CT.gov sponsor query and return mapped studies
async function _sponsorQuery(sponsorTerm, ticker, pageSize, pageToken) {
  var pairs = [
    ["query.spons", sponsorTerm],
    ["filter.overallStatus", "RECRUITING,ACTIVE_NOT_RECRUITING,NOT_YET_RECRUITING"],
    ["pageSize", String(pageSize || 60)],
    ["format", "json"],
  ];
  if (pageToken) pairs.push(["pageToken", pageToken]);
  var res = await fetch(CT_BASE + "/studies?" + buildQuery(pairs));
  if (!res.ok) return { studies: [], nextPageToken: null };
  var data = await res.json();
  return {
    studies: (data.studies || []).map(function(s) { return mapStudy(s, ticker); }),
    nextPageToken: data.nextPageToken || null,
  };
}

// ── User-defined custom sponsors (localStorage) ───────────────────────────────
// When a ticker is not in any static map, the UI can ask the user for the
// company name once and save it here. Persists across sessions via localStorage.

var LS_CUSTOM_KEY = "btt_custom_sponsors";
var _customSponsors = (function() {
  try { return JSON.parse(localStorage.getItem(LS_CUSTOM_KEY) || "{}"); } catch(e) { return {}; }
})();

function saveCustomSponsor(ticker, name) {
  ticker = ticker.toUpperCase().trim();
  name   = name.trim();
  if (!ticker || !name) return;
  _customSponsors[ticker] = name;
  try { localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(_customSponsors)); } catch(e) {}
  // Hot-patch the runtime maps so subsequent fetches work immediately
  TICKER_TO_SPONSORS[ticker] = [name];
  SPONSOR_TO_TICKER[name.toLowerCase()] = ticker;
}

// Synchronous check — true when any map knows this ticker (no fetch needed)
function isKnownTicker(ticker) {
  return !!(
    TICKER_TO_SPONSORS[ticker] ||
    (window.EXTRA_COMPANIES && window.EXTRA_COMPANIES[ticker]) ||
    _customSponsors[ticker]
  );
}

// Resolve the canonical sponsor search term for a ticker.
// Priority: static map → EXTRA_COMPANIES → localStorage custom → SEC EDGAR.
async function resolveSponsors(ticker) {
  var known = TICKER_TO_SPONSORS[ticker];
  if (known && known.length) return known;

  // Local fallback from companies.js (window.EXTRA_COMPANIES)
  var extra = window.EXTRA_COMPANIES && window.EXTRA_COMPANIES[ticker];
  if (extra) {
    TICKER_TO_SPONSORS[ticker] = [extra];
    SPONSOR_TO_TICKER[extra.toLowerCase()] = ticker;
    return [extra];
  }

  // User-taught custom sponsors (localStorage)
  var custom = _customSponsors[ticker];
  if (custom) {
    TICKER_TO_SPONSORS[ticker] = [custom];
    SPONSOR_TO_TICKER[custom.toLowerCase()] = ticker;
    return [custom];
  }

  // Last resort: SEC EDGAR (blocked by CORS in most browser contexts but harmless to try)
  var fromSec = await resolveUnknownTicker(ticker);
  return fromSec ? [fromSec] : null;
}

// ── public fetch functions ────────────────────────────────────────────────────

// Fetch up to `pageSize` active trials for a single ticker (used for watchlist)
async function fetchTrialsBySponsor(ticker, pageSize) {
  pageSize = pageSize || 60;
  var sponsors;
  try { sponsors = await resolveSponsors(ticker); } catch (e) { sponsors = null; }
  if (!sponsors || !sponsors.length) return [];
  try {
    var r = await _sponsorQuery(sponsors[0], ticker, pageSize, null);
    return r.studies;
  } catch (e) { return []; }
}

// Fetch ALL trials for a single ticker — paginates until no nextPageToken.
// onProgress(partialArray) is called after each page for live count updates.
async function fetchAllTrialsBySponsor(ticker, onProgress) {
  var sponsors;
  try { sponsors = await resolveSponsors(ticker); } catch (e) { sponsors = null; }
  if (!sponsors || !sponsors.length) return [];

  var all = [];
  var seen = new Set();
  var pageToken = null;
  var sponsorTerm = sponsors[0];

  do {
    try {
      var r = await _sponsorQuery(sponsorTerm, ticker, 1000, pageToken);
      r.studies.forEach(function(s) {
        if (s.id && !seen.has(s.id)) { seen.add(s.id); all.push(s); }
      });
      if (onProgress) onProgress(all.slice());
      pageToken = r.nextPageToken;
    } catch (e) { break; }
  } while (pageToken);

  return all;
}

// Fetch trials for multiple tickers with concurrency limit of 3
async function fetchTrialsForWatchlist(tickers) {
  if (!tickers || !tickers.length) return [];
  var seen = new Set();
  var all = [];
  for (var i = 0; i < tickers.length; i += 3) {
    var chunk = tickers.slice(i, i + 3);
    var results = await Promise.allSettled(chunk.map(function(tk) { return fetchTrialsBySponsor(tk); }));
    results.forEach(function(r) {
      if (r.status === "fulfilled") {
        r.value.forEach(function(s) {
          if (s.id && !seen.has(s.id)) { seen.add(s.id); all.push(s); }
        });
      }
    });
  }
  return all;
}

// Fetch all competitors in an indication from CT.gov
async function fetchTrialsByIndication(condition, pageSize) {
  pageSize = pageSize || 100;
  var qs = buildQuery([
    ["query.cond", condition],
    ["filter.overallStatus", "RECRUITING,ACTIVE_NOT_RECRUITING,NOT_YET_RECRUITING"],
    ["pageSize", String(pageSize)],
    ["format", "json"],
  ]);
  var res = await fetch(CT_BASE + "/studies?" + qs);
  if (!res.ok) throw new Error("CT.gov " + res.status);
  return ((await res.json()).studies || []).map(function(s) { return mapStudy(s); });
}

// Fetch upcoming studies with PCDs in the next 12 months (broad, not watchlist-filtered)
async function fetchUpcomingCatalysts(pageSize) {
  pageSize = pageSize || 100;
  var now = new Date();
  var future = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  var fmt = function(d) { return d.toISOString().slice(0, 10); };
  var qs = buildQuery([
    ["filter.overallStatus", "RECRUITING,ACTIVE_NOT_RECRUITING"],
    ["filter.advanced", "AREA[PrimaryCompletionDate]RANGE[" + fmt(now) + "," + fmt(future) + "]"],
    ["pageSize", String(pageSize)],
    ["sort", "PrimaryCompletionDate"],
    ["format", "json"],
  ]);
  try {
    var res = await fetch(CT_BASE + "/studies?" + qs);
    if (!res.ok) return [];
    return ((await res.json()).studies || []).map(function(s) { return mapStudy(s); }).filter(function(t) { return !!t.pcd; });
  } catch (e) { return []; }
}

// Full-text search: handles ticker lookup, drug names, indications, trial IDs
async function searchStudies(query, opts) {
  var pageSize = (opts && opts.pageSize) || 10;
  var upperQ = query.trim().toUpperCase();
  var isNct = /^NCT\d+$/i.test(query.trim());

  // Resolve sponsors — includes SEC lookup for unknown tickers
  var resolvedSponsors = await resolveSponsors(upperQ);
  var isTicker = !!(resolvedSponsors && resolvedSponsors.length);

  var qs;
  if (isNct) {
    qs = buildQuery([["filter.ids", query.trim()], ["pageSize", "1"], ["format", "json"]]);
  } else if (isTicker) {
    qs = buildQuery([
      ["query.spons", resolvedSponsors[0]],
      ["filter.overallStatus", "RECRUITING,ACTIVE_NOT_RECRUITING,NOT_YET_RECRUITING"],
      ["pageSize", String(pageSize)],
      ["format", "json"],
    ]);
  } else {
    qs = buildQuery([
      ["query.term", query],
      ["filter.overallStatus", "RECRUITING,ACTIVE_NOT_RECRUITING,NOT_YET_RECRUITING"],
      ["pageSize", String(pageSize)],
      ["format", "json"],
    ]);
  }

  var res = await fetch(CT_BASE + "/studies?" + qs);
  if (!res.ok) throw new Error("CT.gov " + res.status);
  var data = await res.json();
  var forceTicker = isTicker ? upperQ : null;
  var studies = (data.studies || []).map(function(s) {
    var m = mapStudy(s, forceTicker);
    return { id: m.id, title: m.title, phase: m.phase, status: m.status, indication: m.indication, sponsor: m.sponsor, ticker: m.ticker, drug: m.drug };
  });
  return { studies: studies, total: data.totalCount || 0 };
}

// Fetch a single study by NCT ID
async function fetchStudy(nctId) {
  var res = await fetch(CT_BASE + "/studies/" + encodeURIComponent(nctId) + "?format=json");
  if (!res.ok) throw new Error("CT.gov " + res.status);
  return mapStudy(await res.json());
}

window.CTAPI = {
  TICKER_TO_SPONSORS: TICKER_TO_SPONSORS,
  SPONSOR_TO_TICKER: SPONSOR_TO_TICKER,
  OVERLAY: OVERLAY,
  getTicker: getTicker,
  mapStudy: mapStudy,
  loadSecTickers: loadSecTickers,
  resolveUnknownTicker: resolveUnknownTicker,
  saveCustomSponsor: saveCustomSponsor,
  isKnownTicker: isKnownTicker,
  fetchTrialsBySponsor: fetchTrialsBySponsor,
  fetchAllTrialsBySponsor: fetchAllTrialsBySponsor,
  fetchTrialsForWatchlist: fetchTrialsForWatchlist,
  fetchTrialsByIndication: fetchTrialsByIndication,
  fetchUpcomingCatalysts: fetchUpcomingCatalysts,
  searchStudies: searchStudies,
  fetchStudy: fetchStudy,
};
