# Biotech Trial Terminal (BTT)

A full-stack clinical trial tracker and NPV scenario modeler for biotech investors. Pulls live data from ClinicalTrials.gov and SEC EDGAR — no paid data subscriptions or API keys required.

![BTT Screenshot](https://github.com/maxarn13/biotech-trial-terminal/raw/main/preview.png)

---

## Features

### Trial Tracker
- Live trial data fetched directly from ClinicalTrials.gov for any watchlist company
- Sortable/filterable table by phase, status, and ticker
- Probability of success (PoS) and peak sales estimates per trial
- Enrollment progress bars and primary completion date (PCD) tracking

### SEC 8-K Alerts
- Real-time 8-K filing feed for watchlist companies (90-day window)
- Filing types labelled: EARNINGS, AGREEMENT, DISCLOSURE, LEADERSHIP, TERMINATION, etc.
- Direct links to EDGAR filing pages
- 30-minute server-side cache to stay within SEC rate limits

### Catalyst Calendar
- Timeline, Gantt, and month views of upcoming PCDs
- Filters to watchlist companies or all CT.gov trials

### Competitive Landscape
- Indication dropdown pulls all competitors for any indication from CT.gov
- Scrollable pipeline table with sticky header
- Phase lane summary (Phase 1 / 2 / 3) below the table
- Card view alternative

### Scenario Modeler
- **Python engine**: 10,000-path Monte Carlo DCF (NumPy vectorised)
  - Log-normal peak sales, Beta-distributed PoS, Gaussian WACC and cost structure
  - Tornado sensitivity chart, bear/base/bull scenarios, PoS × peak sales grid
- **Balance sheet integration**: shares outstanding, cash, and debt auto-pulled from SEC EDGAR XBRL
- Adjusted price target = (pipeline RNPV + net cash) ÷ shares outstanding
- Pre-seeded from the browser simulation when you open a trial

### Browser-Side Simulation
- 1,000-path two-scenario frequentist + Bayesian clinical outcome simulator (JavaScript)
- Powers instant PoS estimates on tracker cards, landscape, and calendar
- Indication market size and peak share lookup tables (60+ indications)
- Drug modality multipliers (CAR-T, gene therapy, ADC, mRNA, CRISPR, etc.)
- Pipeline concentration adjustment (single-asset binary risk vs. diversified pharma)

### Company Drawer
- SEC EDGAR financials strip (shares, cash, debt, net cash) per company
- Upcoming catalyst list with direct link to Scenario Modeler

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (Babel standalone, no build step) |
| Styling | Plain CSS variables, JetBrains Mono + Inter |
| Simulation | JavaScript (browser) + Python / NumPy (server) |
| Backend | Flask (single server — static files + API) |
| Data | ClinicalTrials.gov API v2, SEC EDGAR XBRL (no API key needed) |

---

## Getting Started

### Requirements
- Python 3.9+
- pip

### Install dependencies

```bash
pip install flask numpy
```

### Run

```bash
python scenario_api.py
```

Then open **http://localhost:5002** in your browser.

That's it — no build step, no webpack, no Node required.

---

## Project Structure

```
├── index.html          # Entry point — loads all scripts
├── scenario_api.py     # Flask server: static files + Monte Carlo + SEC API
├── styles.css          # All styles (CSS variables, dark/light theme)
│
├── data.js             # Default watchlist and colour maps
├── companies.js        # Ticker → sponsor name mappings
├── api.js              # ClinicalTrials.gov API client
├── monte.js            # Browser-side Monte Carlo engine
│
├── mainapp.jsx         # Root React component and app state
├── ui.jsx              # Shared components (Nav, drawers, pills, panels)
├── tracker.jsx         # Trial Tracker tab
├── calendar.jsx        # Catalyst Calendar tab
├── landscape.jsx       # Competitive Landscape tab
├── scenmodel.jsx       # Scenario Modeler tab
└── tweaks-panel.jsx    # Settings panel (theme, density, view toggles)
```

---

## Data Sources

| Source | What it provides | Auth |
|---|---|---|
| [ClinicalTrials.gov API v2](https://clinicaltrials.gov/data-api/api) | Trial metadata, status, enrollment, PCDs | None |
| [SEC EDGAR XBRL](https://data.sec.gov/api/xbrl/companyfacts/) | Shares outstanding, cash, debt | None (User-Agent header required) |
| [SEC EDGAR Submissions](https://data.sec.gov/submissions/) | 8-K filings feed | None |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `F1` | Trial Tracker |
| `F2` | Catalyst Calendar |
| `F3` | Competitive Landscape |
| `F4` | Scenario Modeler |
| `/` | Focus search bar |
| `Esc` | Close drawer / clear selection |

---

## License

MIT
