// data.js — static seed data (watchlist, activity feed, color maps)

// Default watchlist — tickers only; full trial data comes from CT.gov
window.WATCHLIST = ["PASG", "DNLI", "ALEC", "PRAX", "CADL", "RVMD", "IPHA", "BIIB", "SAGE", "MRNA"];

window.ACTIVITY = [
  { t: "08:42", ticker: "PASG", kind: "STATUS",  msg: "PBFT02 — Cohort 3 dose escalation cleared by DSMB (Cohort 4 opens Q1)", impact: "POS" },
  { t: "08:31", ticker: "CADL", kind: "MILE",    msg: "CAN-2409 BR-PDAC — last patient last visit confirmed; topline guided to May", impact: "POS" },
  { t: "07:58", ticker: "RVMD", kind: "ENROLL",  msg: "RASolute 302 — 312/460 enrolled, +14% vs internal model", impact: "POS" },
  { t: "07:12", ticker: "ALEC", kind: "FILE",    msg: "INFRONT-3 — SAP amendment posted; primary analysis window unchanged", impact: "NEU" },
  { t: "06:40", ticker: "IPHA", kind: "ENROLL",  msg: "IPH-031 — site activation paused at 3 EU sites pending CTA refresh", impact: "NEG" },
  { t: "06:22", ticker: "DNLI", kind: "PUB",     msg: "DNL310 (Hunter) — Lancet Neurology paper accepted; pre-print live", impact: "POS" },
  { t: "23:14", ticker: "SAGE", kind: "STATUS",  msg: "DIMENSION terminated; SAGE-718 program discontinued", impact: "NEG" },
  { t: "22:08", ticker: "PRAX", kind: "GUID",    msg: "Essential1 topline reaffirmed for Q2 2026", impact: "NEU" },
  { t: "21:55", ticker: "MRNA", kind: "ENROLL",  msg: "INTerpath-001 — site activation in JP cleared (PMDA)", impact: "POS" },
  { t: "21:30", ticker: "BIIB", kind: "MILE",    msg: "CELIA — dosing complete in 99% of treatment arm", impact: "POS" },
];

window.PHASES = ["1", "1/2", "1b", "early 1", "2", "2b", "3"];

window.PHASE_COLOR = {
  "1":   "#60a5fa",
  "1/2": "#60a5fa",
  "1b":  "#60a5fa",
  "early 1": "#60a5fa",
  "2":   "#a78bfa",
  "2b":  "#a78bfa",
  "3":   "#fbbf24",
};

window.STATUS_COLOR = {
  "RECRUITING":  "#4ade80",
  "ACTIVE_NE":   "#fbbf24",
  "NOT_YET":     "#60a5fa",
  "TERMINATED":  "#f87171",
  "COMPLETED":   "#a3a3a3",
};
