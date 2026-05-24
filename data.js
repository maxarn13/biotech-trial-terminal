// data.js — static seed data (watchlist, color maps)

// Default watchlist — tickers only; full trial data comes from CT.gov
window.WATCHLIST = ["PASG", "DNLI", "ALEC", "PRAX", "CADL", "RVMD", "IPHA", "BIIB", "SAGE", "MRNA"];

// Tickers that are no longer publicly traded (acquired, merged, or bankrupt).
// Used by the UI to show a DELISTED badge where the ticker appears.
window.DELISTED_TICKERS = new Set([
  "HZNP",  // Horizon Therapeutics — acquired by Amgen, 2023
  "IMGN",  // ImmunoGen — acquired by AbbVie, 2024
  "SGEN",  // Seagen — acquired by Pfizer, 2023
  "EPZM",  // Epizyme — acquired by Ipsen, 2022
  "MIRA",  // Mirati Therapeutics — acquired by BMS, 2024
  "CERE",  // Cerevel Therapeutics — acquired by AbbVie, 2024
  "KDNY",  // Chinook Therapeutics — acquired by Novartis, 2023
  "KRTX",  // Karuna Therapeutics — acquired by BMS, 2024
  "PRVB",  // Provention Bio — acquired by Sanofi, 2023
  "IMGO",  // Imago BioSciences — acquired by Merck, 2023
  "ISEE",  // Iveric Bio — acquired by Astellas, 2023
  "ALPN",  // Alpine Immune Sciences — acquired by Vertex, 2024
  "SAGE",  // Sage Therapeutics — acquired by Biogen, 2023
  "RDUS",  // Radius Health — went private, 2022
  "ACHC",  // Achaogen — bankruptcy, 2019
  "CLVT",  // Clovis Oncology — bankruptcy, 2022
  "GRPH",  // Graphite Bio — acquired by Kamau Therapeutics, 2023
  "AVEO",  // AVEO Pharmaceuticals — acquired by LG Chem, 2022
  "JNCE",  // Jounce Therapeutics — merged with Redx Pharma, 2024
  "IMAB",  // I-Mab — delisted from NASDAQ, 2024
]);

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
