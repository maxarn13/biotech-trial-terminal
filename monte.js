/* monte.js — Monte Carlo simulation engine (browser-side)
   Modeled after TENX.xlsx: two-scenario frequentist + Bayesian,
   outcome buckets, expected stock move, risk-adjusted DCF (RNPV).
*/

(function() {
"use strict";

// ── Box-Muller normal sampler ───────────────────────────────────────────────
function randn() {
  var u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ── Normal CDF approximation (Abramowitz & Stegun 26.2.17) ─────────────────
function normCDF(z) {
  var t = 1 / (1 + 0.2316419 * Math.abs(z));
  var poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
             t * (-1.821255978 + t * 1.330274429))));
  var p = 1 - 0.3989422803 * Math.exp(-0.5 * z * z) * poly;
  return z >= 0 ? p : 1 - p;
}

// ── Two-sample t-test p-value (two-sided) ──────────────────────────────────
function tTestPValue(meanA, meanB, sd, n) {
  var se = sd * Math.sqrt(2 / n);
  var t  = Math.abs(meanA - meanB) / se;
  // Welch df ≈ 2(n-1) for equal-n equal-variance
  var df = 2 * (n - 1);
  // Use normal approx for df>30 (always true for our n values)
  return 2 * (1 - normCDF(t));
}

// ── Phase-level defaults ────────────────────────────────────────────────────
// n_per_arm: typical enrollment per arm
// effect_unc: SD around treatment mean (Cohen's d units × 0.5 SD)
// d_threshold: min Cohen's d to call meaningful efficacy
// prior_pos: historical PoS by phase
// stock_moves: [fail, marginal, solid, blowout] as multipliers (e.g. -0.85 = -85%)
// outcome_thresholds: [marginal_d, solid_d, blowout_d]
var PHASE_DEFAULTS = {
  "1":      { n: 30,  eff_unc: 0.35, d_thr: 0.15, prior_pos: 0.65, moves: [-0.30, 0.25, 0.80, 2.50], thresholds: [0.15, 0.40, 0.70] },
  "early 1":{ n: 20,  eff_unc: 0.40, d_thr: 0.10, prior_pos: 0.70, moves: [-0.25, 0.20, 0.60, 2.00], thresholds: [0.10, 0.35, 0.65] },
  "1b":     { n: 40,  eff_unc: 0.35, d_thr: 0.15, prior_pos: 0.60, moves: [-0.30, 0.25, 0.80, 2.50], thresholds: [0.15, 0.40, 0.70] },
  "1/2":    { n: 60,  eff_unc: 0.30, d_thr: 0.20, prior_pos: 0.55, moves: [-0.40, 0.30, 1.00, 3.00], thresholds: [0.20, 0.45, 0.75] },
  "2":      { n: 115, eff_unc: 0.28, d_thr: 0.25, prior_pos: 0.40, moves: [-0.55, 0.50, 1.20, 3.50], thresholds: [0.25, 0.50, 0.80] },
  "2b":     { n: 150, eff_unc: 0.25, d_thr: 0.25, prior_pos: 0.38, moves: [-0.60, 0.55, 1.30, 4.00], thresholds: [0.25, 0.50, 0.80] },
  "2/3":    { n: 200, eff_unc: 0.22, d_thr: 0.25, prior_pos: 0.45, moves: [-0.65, 0.40, 1.50, 4.50], thresholds: [0.25, 0.55, 0.90] },
  "3":      { n: 300, eff_unc: 0.18, d_thr: 0.20, prior_pos: 0.58, moves: [-0.85, 0.30, 0.80, 2.50], thresholds: [0.20, 0.45, 0.75] },
  "N/A":    { n: 100, eff_unc: 0.30, d_thr: 0.20, prior_pos: 0.35, moves: [-0.40, 0.20, 0.60, 1.50], thresholds: [0.20, 0.45, 0.70] },
};
var PHASE_FALLBACK = PHASE_DEFAULTS["2"];

// ── Indication → market size ($M peak) ────────────────────────────────────
var INDICATION_MARKETS = [
  { keywords: ["alzheimer","dementia"],                 market: 15000 },
  { keywords: ["parkinson"],                            market:  8000 },
  { keywords: ["multiple sclerosis","ms "],             market: 22000 },
  { keywords: ["schizophrenia","psychosis"],            market:  7500 },
  { keywords: ["depression","mdd","bipolar"],           market: 12000 },
  { keywords: ["epilepsy","seizure"],                   market:  6000 },
  { keywords: ["autism","asd"],                         market:  4000 },
  { keywords: ["migraine","headache"],                  market:  7000 },
  { keywords: ["lung cancer","nsclc","sclc"],           market: 25000 },
  { keywords: ["breast cancer"],                        market: 20000 },
  { keywords: ["prostate cancer"],                      market: 15000 },
  { keywords: ["colorectal","colon cancer"],            market: 14000 },
  { keywords: ["leukemia","aml","cll","cml"],           market: 18000 },
  { keywords: ["lymphoma"],                             market: 16000 },
  { keywords: ["myeloma","multiple myeloma"],           market: 20000 },
  { keywords: ["melanoma"],                             market: 10000 },
  { keywords: ["bladder cancer"],                       market:  8000 },
  { keywords: ["renal","kidney cancer","rcc"],          market: 10000 },
  { keywords: ["pancreatic","pancreas cancer"],         market:  8000 },
  { keywords: ["ovarian cancer"],                       market:  7000 },
  { keywords: ["hepatocellular","liver cancer","hcc"],  market:  9000 },
  { keywords: ["glioblastoma","glioma","gbm"],          market:  4000 },
  { keywords: ["solid tumor","solid tumour"],           market: 12000 },
  { keywords: ["heart failure","hf"],                   market: 12000 },
  { keywords: ["pulmonary arterial hypertension","pah"],market:  6700 },
  { keywords: ["pulmonary hypertension"],               market:  5500 },
  { keywords: ["atrial fibrillation","afib"],           market: 12000 },
  { keywords: ["coronary","cad","acs","myocardial"],    market: 18000 },
  { keywords: ["stroke","tia"],                         market: 10000 },
  { keywords: ["hypertension"],                         market: 30000 },
  { keywords: ["hyperlipidemia","hypercholesterol","ldl"],market:18000 },
  { keywords: ["diabetes","t2d","type 2"],              market: 45000 },
  { keywords: ["obesity","weight loss"],                market: 30000 },
  { keywords: ["nash","nafld","masld"],                 market: 15000 },
  { keywords: ["chronic kidney","ckd","renal disease"], market: 12000 },
  { keywords: ["iga nephropathy"],                      market:  4000 },
  { keywords: ["lupus","sle"],                          market:  8000 },
  { keywords: ["rheumatoid","ra "],                     market: 25000 },
  { keywords: ["psoriasis"],                            market: 18000 },
  { keywords: ["atopic dermatitis","eczema"],           market: 14000 },
  { keywords: ["crohn","ulcerative colitis","ibd"],     market: 22000 },
  { keywords: ["hiv","aids"],                           market: 28000 },
  { keywords: ["hepatitis b","hbv"],                    market:  5000 },
  { keywords: ["hepatitis c","hcv"],                    market:  4000 },
  { keywords: ["covid","sars-cov","coronavirus"],       market:  8000 },
  { keywords: ["influenza","flu "],                     market:  5000 },
  { keywords: ["rsv"],                                  market:  4000 },
  { keywords: ["cystic fibrosis","cf "],                market: 10000 },
  { keywords: ["copd","emphysema"],                     market: 14000 },
  { keywords: ["asthma"],                               market: 20000 },
  { keywords: ["idiopathic pulmonary fibrosis","ipf"],  market:  5000 },
  { keywords: ["sickle cell"],                          market:  6000 },
  { keywords: ["hemophilia"],                           market:  8000 },
  { keywords: ["spinal muscular","sma"],                market:  7000 },
  { keywords: ["duchenne","dmd"],                       market:  4000 },
  { keywords: ["amyotrophic","als"],                    market:  3000 },
  { keywords: ["huntington"],                           market:  2500 },
  { keywords: ["fabry","gaucher","pompe"],              market:  3000 },
  { keywords: ["phenylketonuria","pku"],                market:  1000 },
  { keywords: ["macular","amd","geographic atrophy"],   market: 12000 },
  { keywords: ["glaucoma"],                             market:  6000 },
  { keywords: ["dry eye","keratoconus"],                market:  5000 },
  { keywords: ["acromegaly","cushing","thyroid"],       market:  3000 },
  { keywords: ["endometriosis"],                        market:  4000 },
  { keywords: ["uterine fibroid"],                      market:  3500 },
  { keywords: ["benign prostatic","bph"],               market:  4000 },
  { keywords: ["osteoporosis"],                         market: 10000 },
  { keywords: ["anemia"],                               market:  8000 },
  { keywords: ["sepsis","bacterial infection"],         market:  6000 },
  { keywords: ["wound","skin"],                         market:  4000 },
];

function lookupMarket(indication) {
  if (!indication) return 3000;
  var ind = indication.toLowerCase();
  for (var i = 0; i < INDICATION_MARKETS.length; i++) {
    var entry = INDICATION_MARKETS[i];
    for (var j = 0; j < entry.keywords.length; j++) {
      if (ind.indexOf(entry.keywords[j]) !== -1) return entry.market;
    }
  }
  return 3000; // generic small-market fallback
}

// ── Indication → realistic peak market share (fraction) ────────────────────
// Rare/orphan: high share (30-40%) — limited competition, captive patient pop
// Specialty: moderate (12-22%) — niche with pricing power
// Oncology: moderate (5-10%) — fragmented by line/biomarker, heavy competition
// Large primary-care: low (2-6%) — enormous market but generic/competitive pressure
var INDICATION_PEAK_SHARES = [
  // ── Rare / Orphan ──────────────────────────────────────────────────────────
  { keywords: ["cystic fibrosis","cf "],                share: 0.30 },
  { keywords: ["spinal muscular","sma"],                share: 0.35 },
  { keywords: ["duchenne","dmd"],                       share: 0.30 },
  { keywords: ["hemophilia"],                           share: 0.22 },
  { keywords: ["sickle cell"],                          share: 0.18 },
  { keywords: ["fabry","gaucher","pompe"],              share: 0.32 },
  { keywords: ["phenylketonuria","pku"],                share: 0.38 },
  { keywords: ["huntington"],                           share: 0.28 },
  { keywords: ["amyotrophic","als"],                    share: 0.20 },
  { keywords: ["iga nephropathy"],                      share: 0.22 },
  // ── Specialty / High-price ─────────────────────────────────────────────────
  { keywords: ["pulmonary arterial hypertension","pah"],share: 0.22 },
  { keywords: ["pulmonary hypertension"],               share: 0.18 },
  { keywords: ["idiopathic pulmonary fibrosis","ipf"],  share: 0.20 },
  { keywords: ["acromegaly","cushing","thyroid"],       share: 0.25 },
  { keywords: ["endometriosis"],                        share: 0.14 },
  { keywords: ["uterine fibroid"],                      share: 0.14 },
  { keywords: ["lupus","sle"],                          share: 0.13 },
  { keywords: ["anemia"],                               share: 0.12 },
  { keywords: ["sepsis","bacterial infection"],         share: 0.12 },
  // ── Ophthalmology ──────────────────────────────────────────────────────────
  { keywords: ["macular","amd","geographic atrophy"],   share: 0.15 },
  { keywords: ["glaucoma"],                             share: 0.09 },
  { keywords: ["dry eye","keratoconus"],                share: 0.09 },
  // ── Oncology — heavy competition, fragmented by biomarker/line ────────────
  { keywords: ["glioblastoma","glioma","gbm"],          share: 0.18 }, // small market, few options
  { keywords: ["leukemia","aml","cll","cml"],           share: 0.10 },
  { keywords: ["lymphoma"],                             share: 0.09 },
  { keywords: ["myeloma","multiple myeloma"],           share: 0.08 },
  { keywords: ["ovarian cancer"],                       share: 0.10 },
  { keywords: ["pancreatic","pancreas cancer"],         share: 0.10 },
  { keywords: ["hepatocellular","liver cancer","hcc"],  share: 0.10 },
  { keywords: ["melanoma"],                             share: 0.08 },
  { keywords: ["bladder cancer"],                       share: 0.09 },
  { keywords: ["renal","kidney cancer","rcc"],          share: 0.08 },
  { keywords: ["prostate cancer"],                      share: 0.06 },
  { keywords: ["lung cancer","nsclc","sclc"],           share: 0.05 },
  { keywords: ["breast cancer"],                        share: 0.05 },
  { keywords: ["colorectal","colon cancer"],            share: 0.05 },
  { keywords: ["solid tumor","solid tumour"],           share: 0.05 },
  // ── CNS / Neurology ────────────────────────────────────────────────────────
  { keywords: ["parkinson"],                            share: 0.12 },
  { keywords: ["epilepsy","seizure"],                   share: 0.11 },
  { keywords: ["migraine","headache"],                  share: 0.09 },
  { keywords: ["multiple sclerosis","ms "],             share: 0.08 },
  { keywords: ["autism","asd"],                         share: 0.08 },
  { keywords: ["schizophrenia","psychosis"],            share: 0.07 },
  { keywords: ["alzheimer","dementia"],                 share: 0.04 }, // huge market, uncertain approval
  { keywords: ["depression","mdd","bipolar"],           share: 0.05 },
  // ── Cardiovascular / Metabolic ─────────────────────────────────────────────
  { keywords: ["nash","nafld","masld"],                 share: 0.10 }, // emerging, early market
  { keywords: ["heart failure","hf"],                   share: 0.08 },
  { keywords: ["chronic kidney","ckd","renal disease"], share: 0.08 },
  { keywords: ["atrial fibrillation","afib"],           share: 0.07 },
  { keywords: ["coronary","cad","acs","myocardial"],    share: 0.05 },
  { keywords: ["stroke","tia"],                         share: 0.05 },
  { keywords: ["obesity","weight loss"],                share: 0.05 },
  { keywords: ["hyperlipidemia","hypercholesterol","ldl"],share: 0.04},
  { keywords: ["diabetes","t2d","type 2"],              share: 0.03 },
  { keywords: ["hypertension"],                         share: 0.02 }, // generic-dominated
  // ── Immunology / Inflammation ──────────────────────────────────────────────
  { keywords: ["psoriasis"],                            share: 0.08 },
  { keywords: ["atopic dermatitis","eczema"],           share: 0.08 },
  { keywords: ["crohn","ulcerative colitis","ibd"],     share: 0.07 },
  { keywords: ["rheumatoid","ra "],                     share: 0.05 }, // saturated market
  // ── Infectious Disease ─────────────────────────────────────────────────────
  { keywords: ["rsv"],                                  share: 0.16 }, // prophylaxis, captive neonates
  { keywords: ["hepatitis b","hbv"],                    share: 0.10 },
  { keywords: ["influenza","flu "],                     share: 0.09 },
  { keywords: ["hepatitis c","hcv"],                    share: 0.07 },
  { keywords: ["hiv","aids"],                           share: 0.05 },
  { keywords: ["covid","sars-cov","coronavirus"],       share: 0.05 },
  // ── Respiratory ────────────────────────────────────────────────────────────
  { keywords: ["copd","emphysema"],                     share: 0.06 },
  { keywords: ["asthma"],                               share: 0.05 },
  // ── Other ──────────────────────────────────────────────────────────────────
  { keywords: ["benign prostatic","bph"],               share: 0.09 },
  { keywords: ["osteoporosis"],                         share: 0.06 },
  { keywords: ["wound","skin"],                         share: 0.09 },
];

function lookupPeakShare(indication) {
  if (!indication) return 0.08;
  var ind = indication.toLowerCase();
  for (var i = 0; i < INDICATION_PEAK_SHARES.length; i++) {
    var entry = INDICATION_PEAK_SHARES[i];
    for (var j = 0; j < entry.keywords.length; j++) {
      if (ind.indexOf(entry.keywords[j]) !== -1) return entry.share;
    }
  }
  return 0.08; // generic fallback
}

// ── Drug modality → peak-sales multiplier ──────────────────────────────────
// Applied on top of the indication peak share.
// Searched in order: discounts first (categorical), then premiums high→low.
// Only the FIRST match fires, so order matters.
var DRUG_MODALITY_ADJUSTMENTS = [
  // ── Hard discounts (categorical, always take priority) ─────────────────────
  { keywords: ["biosimilar","reference product","follow-on biologic","similar biologic"],
    mult: 0.25, label: "Biosimilar" },
  { keywords: ["topical ","transdermal","dermal cream","ointment","topical gel"],
    mult: 0.70, label: "Topical" },
  { keywords: ["diagnostic","imaging agent","contrast agent","tracer"],
    mult: 0.45, label: "Diagnostic" },

  // ── Premium modalities ─────────────────────────────────────────────────────
  { keywords: ["crispr","cas9","base editing","prime editing","gene editing"],
    mult: 1.85, label: "CRISPR/Gene editing" },
  { keywords: ["gene therapy","aav ","aav-","adeno-associated virus","lentiviral","viral vector",
                "ex vivo gene","voretigene","zolgensma","roctavian"],
    mult: 1.70, label: "Gene therapy" },
  { keywords: ["car-t","car t","cart ","chimeric antigen receptor","t-cell therapy",
                "tcr-t ","tisagen","axicab","ciltacab","idecab","lisocab"],
    mult: 1.60, label: "CAR-T / Cell therapy" },
  { keywords: ["mrna ","mrna-","lipid nanoparticle","lnp-","lnp ","mrna vaccine"],
    mult: 1.35, label: "mRNA" },
  { keywords: ["radioligand","radiopharmaceutical","lutetium-177","lu-177",
                "actinium-225","ac-225","targeted alpha","targeted radiotherapy"],
    mult: 1.28, label: "Radioligand therapy" },
  { keywords: ["bispecific","bi-specific","bsab ","blinatumomab","mosunetuzumab",
                "teclistamab","elranatamab","talquetamab","epcoritamab"],
    mult: 1.25, label: "Bispecific Ab" },
  { keywords: ["antibody-drug conjugate","antibody drug conjugate"," adc ","adc-",
                "enhertu","kadcyla","padcev","polivy","trodelvy","blenrep"],
    mult: 1.25, label: "ADC" },
  { keywords: ["antisense oligonucleotide"," aso ","sirna","rnai ","rna interference",
                "oligonucleotide","patisiran","inclisiran","volanesorsen","inotersen"],
    mult: 1.20, label: "RNA therapy" },
  { keywords: ["proteolysis targeting","protac ","protein degrader","molecular glue"],
    mult: 1.18, label: "Protein degrader" },

  // ── Route / formulation premiums ──────────────────────────────────────────
  { keywords: ["once-weekly subcutaneous","weekly sc","weekly subq"],
    mult: 1.12, label: "Weekly SC" },
  { keywords: ["oral ","orally administered","once-daily oral","oral tablet",
                "oral capsule","taken orally","by mouth"," p.o."," po "],
    mult: 1.15, label: "Oral" },
  { keywords: ["subcutaneous","subq ","sc injection","self-inject"],
    mult: 1.05, label: "Subcutaneous" },

  // ── Combination discount (shared market with backbone) ────────────────────
  { keywords: ["in combination with","plus standard-of-care","added to background",
                "combination therapy","doublet","triplet regimen"],
    mult: 0.80, label: "Combination" },
];

function lookupDrugModality(drug, title) {
  var text = ((drug || "") + " " + (title || "")).toLowerCase();
  for (var i = 0; i < DRUG_MODALITY_ADJUSTMENTS.length; i++) {
    var entry = DRUG_MODALITY_ADJUSTMENTS[i];
    for (var j = 0; j < entry.keywords.length; j++) {
      if (text.indexOf(entry.keywords[j]) !== -1) {
        return { mult: entry.mult, label: entry.label };
      }
    }
  }
  return { mult: 1.00, label: "Standard" };
}

// ── Infer simulation params from a CT.gov trial object ─────────────────────
function inferFromTrial(trial) {
  var phase = (trial.phase || "2").toString().toLowerCase()
    .replace("phase ", "").replace("phase", "").trim();
  var cfg = PHASE_DEFAULTS[phase] || PHASE_FALLBACK;

  var indication = trial.indication || trial.title || "";
  var marketSize = lookupMarket(indication);
  var peakShare  = lookupPeakShare(indication);
  var modality   = lookupDrugModality(trial.drug, trial.title);

  // n_per_arm: use enrolled/2 if available and reasonable, else phase default
  var enrolled = trial.enrolled || trial.target;
  var nPerArm = (enrolled && enrolled > 0)
    ? Math.max(20, Math.round(enrolled / 2))
    : cfg.n;

  // sigma: patient SD — scale with n (larger trials tend to be noisy)
  var sigma = 50 + Math.min(40, nPerArm * 0.15);

  // placebo mean and treatment mean (Cohen's d units)
  // We model in effect-size space: placebo = 0, treatment mean drawn from N(d_mu, eff_unc)
  var d_mu = cfg.d_thr * 1.8; // expected treatment effect slightly above threshold

  // Bayesian prior: blend phase 2 signal with mechanistic confidence
  var phase2_d = d_mu;
  var mechanistic_confidence = 0.65;
  var prior_weight = (phase === "3" || phase === "2/3") ? 0.55 : 0.40;
  var effective_weight = prior_weight * mechanistic_confidence;

  // Overlay data: only use if genuinely custom (not the universal api.js defaults)
  // api.js assigns pos=0.25 and peakSales=300 to every non-OVERLAY trial, so
  // we ignore those sentinel values and let the Monte Carlo engine compute instead.
  var pos_overlay      = (trial.pos       != null && trial.pos       !== 0.25) ? trial.pos       : null;
  var peakSales_overlay = (trial.peakSales != null && trial.peakSales !== 300)  ? trial.peakSales : null;

  // ── Pipeline concentration: fewer trials → bigger stock moves ──────────────
  // Count how many loaded trials share this ticker
  var allTrials = window.TRIALS || [];
  var nTrials = trial.ticker
    ? allTrials.filter(function(t) { return t.ticker === trial.ticker; }).length
    : 0;
  // If we couldn't determine, assume a small/mid biotech (3 trials)
  if (nTrials < 1) nTrials = 3;

  // Concentration multiplier: captures what fraction of company value is this trial.
  // Extended scale handles mega-cap pharma (60-100+ trials) which previously showed
  // unrealistically large moves (a Pfizer Phase 3 failure ≠ −30% stock drop).
  var concMult;
  if      (nTrials <= 1)   concMult = 1.80;
  else if (nTrials <= 2)   concMult = 1.40;
  else if (nTrials <= 3)   concMult = 1.10;
  else if (nTrials <= 5)   concMult = 0.85;
  else if (nTrials <= 8)   concMult = 0.65;
  else if (nTrials <= 12)  concMult = 0.50;
  else if (nTrials <= 20)  concMult = 0.35;
  else if (nTrials <= 35)  concMult = 0.22;
  else if (nTrials <= 60)  concMult = 0.13;
  else if (nTrials <= 100) concMult = 0.07;
  else                     concMult = 0.04;

  // ── Competitive landscape: peak share as dominance / first-in-class proxy ──
  // Rare-disease / high-share drugs (30-40% share) command dominant positions →
  //   larger binary moves because there's minimal competitive offset.
  // Crowded mass-market drugs (2-5% share, 5th-in-class) have incremental value →
  //   dampened moves because the market is already partially served.
  // Power 0.35 keeps the adjustment modest; cap [0.55, 1.60] prevents extremes.
  var compMult = Math.min(1.60, Math.max(0.55, Math.pow(peakShare / 0.08, 0.35)));

  // ── PoS-based asymmetric scaling ─────────────────────────────────────────
  // The market prices in (prior_pos × drug_NPV). When data arrives:
  //
  //   Success: re-rates to full NPV → upside surprise ∝ (1 − pos) / pos
  //            → moves are LARGER when PoS was LOW (unexpected success)
  //
  //   Failure: loses the priced-in probability-weighted NPV → downside surprise ∝ pos
  //            → failure move is LARGER when PoS was HIGH (unexpected failure)
  //
  // Using power 0.55 to soften extremes at very low / very high PoS.
  // Normalized to 1.0 at PoS = 0.50 (the "neutral" prior).
  var posClamped       = Math.max(0.05, Math.min(0.95, cfg.prior_pos));
  var successPosMult   = Math.pow(0.5 / posClamped, 0.55);  // >1 when PoS<50%, <1 when PoS>50%
  var failPosMult      = Math.pow(posClamped / 0.5, 0.55);  // >1 when PoS>50%, <1 when PoS<50%

  // Combined base scale for move magnitudes.
  // Cap at 3.5 to prevent extreme stacking (e.g. single-asset rare-disease orphan).
  var baseScale = Math.min(concMult * compMult, 3.5);

  // Apply asymmetric PoS scaling: success and failure moves scale differently.
  // Cap failure at −90% (some residual cash/pipeline value always remains).
  var scaledMoves = cfg.moves.map(function(m, i) {
    var s = m * baseScale * (i === 0 ? failPosMult : successPosMult);
    return (i === 0) ? Math.max(-0.90, s) : s;
  });

  return {
    phase: phase,
    cfg: cfg,
    nPerArm: nPerArm,
    sigma: sigma,
    d_mu: d_mu,
    eff_unc: cfg.eff_unc,
    d_thr: cfg.d_thr,
    prior_pos: cfg.prior_pos,
    moves: scaledMoves,
    thresholds: cfg.thresholds,
    phase2_d: phase2_d,
    mech_conf: mechanistic_confidence,
    effective_weight: effective_weight,
    marketSize: marketSize,
    peakShare: peakShare,
    modality: modality,
    indication: indication,
    peakSales_overlay: peakSales_overlay,
    pos_overlay: pos_overlay,
    pcd: trial.pcd || null,
    nTrials: nTrials,
    concMult: concMult,
    compMult: compMult,
    successPosMult: successPosMult,
    failPosMult: failPosMult,
  };
}

// ── Core simulation: 1000 iterations, two scenarios ────────────────────────
function runMonteCarlo(params, N) {
  N = N || 1000;
  var cfg       = params.cfg;
  var n         = params.nPerArm;
  var sigma     = params.sigma;
  var d_mu      = params.d_mu;
  var eff_unc   = params.eff_unc;
  var d_thr     = params.d_thr;
  var thresholds= params.thresholds; // [marginal_d, solid_d, blowout_d]
  var moves     = params.moves;       // [fail, marginal, solid, blowout]
  var ew        = params.effective_weight;
  var ph2_d     = params.phase2_d;

  // Outcome counters [fail, marginal, solid, blowout] — two scenarios
  var counts1 = [0, 0, 0, 0];
  var counts2 = [0, 0, 0, 0];
  var retSum1 = 0, retSum2 = 0;

  for (var i = 0; i < N; i++) {
    // ─ Scenario 1: Frequentist t-test ──────────────────────────────────────
    // Draw true treatment effect (Cohen's d) from uncertainty distribution
    var true_d1 = d_mu + randn() * eff_unc;

    // Simulate sample means: placebo arm mean = 0, treatment arm mean = true_d1 * sigma
    var trt_mean1 = true_d1 * sigma + randn() * (sigma / Math.sqrt(n));
    var pbo_mean1 =                   randn() * (sigma / Math.sqrt(n));
    var obs_d1 = (trt_mean1 - pbo_mean1) / sigma;

    // Two-sided t-test (using normal approx)
    var se1 = Math.sqrt(2) / Math.sqrt(n);
    var z1  = obs_d1 / se1;
    var pval1 = 2 * (1 - normCDF(Math.abs(z1)));
    var success1 = (pval1 < 0.05) && (obs_d1 > d_thr);
    var bucket1 = success1 ? classifyOutcome(obs_d1, thresholds) : 0;

    counts1[bucket1]++;
    retSum1 += moves[bucket1];

    // ─ Scenario 2: Bayesian-updated posterior ──────────────────────────────
    // Posterior = weighted blend of phase-2 signal and mechanistic prior
    var true_d2 = d_mu + randn() * eff_unc;
    var posterior_d = ew * ph2_d + (1 - ew) * true_d2;
    // Add posterior uncertainty (shrinkage toward prior reduces variance)
    var posterior_sample = posterior_d + randn() * (eff_unc * (1 - ew * 0.5));

    var obs_d2 = posterior_sample + randn() * (sigma / Math.sqrt(n)) / sigma;
    var z2 = obs_d2 / se1;
    var pval2 = 2 * (1 - normCDF(Math.abs(z2)));
    var success2 = (pval2 < 0.05) && (obs_d2 > d_thr);
    var bucket2 = success2 ? classifyOutcome(obs_d2, thresholds) : 0;

    counts2[bucket2]++;
    retSum2 += moves[bucket2];
  }

  var pos1 = (counts1[1] + counts1[2] + counts1[3]) / N;
  var pos2 = (counts2[1] + counts2[2] + counts2[3]) / N;

  // Combined PoS: average of two scenarios, anchored to phase prior
  // Weight: 40% prior, 30% S1, 30% S2
  var pos_raw = 0.4 * params.prior_pos + 0.3 * pos1 + 0.3 * pos2;

  // If analyst overlay exists, blend it in (60% model, 40% analyst)
  var pos_final = params.pos_overlay
    ? 0.6 * pos_raw + 0.4 * params.pos_overlay
    : pos_raw;

  // Outcome distribution (use average of two scenarios for display)
  var dist = [0, 1, 2, 3].map(function(b) {
    return (counts1[b] + counts2[b]) / (2 * N);
  });

  // Expected stock move (probability-weighted)
  var expected_move = dist[0]*moves[0] + dist[1]*moves[1] + dist[2]*moves[2] + dist[3]*moves[3];

  return {
    pos_s1: pos1,
    pos_s2: pos2,
    pos: pos_final,
    dist: dist,          // [fail_pct, marginal_pct, solid_pct, blowout_pct]
    expected_move: expected_move,
    moves: moves,
    counts1: counts1,
    counts2: counts2,
    N: N,
  };
}

function classifyOutcome(d, thresholds) {
  // returns 1=marginal, 2=solid, 3=blowout
  if (d >= thresholds[2]) return 3;
  if (d >= thresholds[1]) return 2;
  return 1;
}

// ── DCF / RNPV ─────────────────────────────────────────────────────────────
function runDCF(params, pos) {
  var marketSize     = params.marketSize;        // $M addressable
  var peakShare      = params.peakShare || 0.08; // indication-calibrated peak share
  var modalityMult   = (params.modality && params.modality.mult) || 1.0;
  // Cap effective share at 75% (gene therapy in tiny orphan disease)
  var effectiveShare = Math.min(0.75, peakShare * modalityMult);
  var peakSales      = params.peakSales_overlay || marketSize * effectiveShare;
  var wacc        = 0.12;
  var tax         = 0.21;
  var cogs        = 0.20;                   // 20% COGS
  var opex        = 0.35;                   // 35% SGA+R&D on revenues

  // Infer launch year from PCD
  var now = new Date();
  var pcdYear = null;
  if (params.pcd) {
    var d = new Date(params.pcd);
    if (!isNaN(d)) pcdYear = d.getFullYear();
  }
  var launchYear = (pcdYear && pcdYear > now.getFullYear())
    ? pcdYear + 2   // 2yr approval lag
    : now.getFullYear() + 4;
  var patentExpiry = launchYear + 11;       // ~11yr exclusivity

  // Revenue ramp: 1.5% → 8% peak over 5 years, plateau, then decline
  var ramp = [0.015, 0.035, 0.055, 0.070, 0.080, 0.080, 0.080, 0.075, 0.065, 0.055, 0.040];
  var npv = 0;
  var terminalYear = patentExpiry;

  for (var yr = launchYear; yr <= terminalYear; yr++) {
    var idx = yr - launchYear;
    var share = idx < ramp.length ? ramp[idx] : ramp[ramp.length - 1];
    var revenue = marketSize * share;
    var ebit = revenue * (1 - cogs - opex);
    var fcf  = ebit * (1 - tax);
    var disc = Math.pow(1 + wacc, yr - now.getFullYear());
    npv += fcf / disc;
  }

  var rnpv = npv * pos;  // risk-adjusted NPV

  return {
    peakSales: peakSales,
    marketSize: marketSize,
    peakShare: peakShare,
    effectiveShare: effectiveShare,
    modalityMult: modalityMult,
    npv: npv,
    rnpv: rnpv,
    launchYear: launchYear,
    patentExpiry: patentExpiry,
    wacc: wacc,
  };
}

// ── Result cache ────────────────────────────────────────────────────────────
var _cache = {};

function getAnalysis(trial, customParams, forceRefresh) {
  var key = trial.id || trial.nct || JSON.stringify(trial).slice(0, 64);
  // Invalidate if trial count for this ticker has changed since last run
  // (happens when more companies are added to the watchlist)
  if (_cache[key] && !forceRefresh) {
    var allTrials = window.TRIALS || [];
    var currentN = trial.ticker
      ? allTrials.filter(function(t) { return t.ticker === trial.ticker; }).length
      : 0;
    if (currentN > 0 && _cache[key].params.nTrials !== currentN) {
      delete _cache[key]; // stale — re-run with fresh trial count
    }
  }
  if (_cache[key]) return _cache[key];

  var params = Object.assign(inferFromTrial(trial), customParams || {});
  var mc  = runMonteCarlo(params, 1000);
  var dcf = runDCF(params, mc.pos);

  var result = {
    params: params,
    mc: mc,
    dcf: dcf,
    pos: mc.pos,
    expected_move: mc.expected_move,
    peakSales: dcf.peakSales,
    rnpv: dcf.rnpv,
  };

  _cache[key] = result;
  return result;
}

function clearCache() { _cache = {}; }

// ── Export ──────────────────────────────────────────────────────────────────
window.MONTE = {
  getAnalysis: getAnalysis,
  runMonteCarlo: runMonteCarlo,
  runDCF: runDCF,
  inferFromTrial: inferFromTrial,
  lookupMarket: lookupMarket,
  clearCache: clearCache,
  PHASE_DEFAULTS: PHASE_DEFAULTS,
};

})();
