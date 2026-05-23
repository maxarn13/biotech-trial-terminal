#!/usr/bin/env python3
"""
BTT Full Server — serves static files + Monte Carlo NPV API on one port.
Port: 5002    Start: python scenario_api.py
Install deps: pip install flask numpy
"""

import os
import json
import urllib.request
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from flask import Flask, request, jsonify, send_from_directory
import numpy as np

BASE = os.path.dirname(os.path.abspath(__file__))
app  = Flask(__name__, static_folder=BASE, static_url_path='')

# ── Static file serving ──────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory(BASE, 'index.html')

@app.route('/<path:filename>')
def static_file(filename):
    # API routes are matched before this catch-all
    return send_from_directory(BASE, filename)

# ── Deterministic DCF (scalar) ───────────────────────────────────────────────

def _npv_scalar(ps, w, ry, pl, ytl, cg, op, tx):
    """DCF NPV ($M) — all args are plain Python numbers."""
    npv = 0.0
    ry  = max(1.0, float(ry))
    pl  = max(1,   int(round(float(pl))))
    for yr in range(pl):
        frac = min(1.0, (yr + 1) / ry)
        rev  = float(ps) * frac
        cf   = rev * (1.0 - float(cg) - float(op)) * (1.0 - float(tx))
        t    = float(ytl) + yr + 1
        npv += cf / (1.0 + float(w)) ** t
    return npv

# ── Vectorised DCF (NumPy arrays of shape (N,)) ──────────────────────────────

def _npv_vec(ps_s, w_s, ry_s, pl_base, ytl, cg_s, op_s, tx_s, pl_s):
    N   = len(ps_s)
    npv = np.zeros(N)
    for yr in range(int(round(pl_base)) + 6):
        ry_c = np.maximum(1.0, ry_s)
        frac = np.where(yr < ry_c, np.minimum(1.0, (yr + 1) / ry_c), 1.0)
        mask = yr < pl_s
        rev  = np.where(mask, ps_s * frac, 0.0)
        cf   = rev * (1.0 - cg_s - op_s) * (1.0 - tx_s)
        t    = float(ytl) + yr + 1
        npv += cf / (1.0 + w_s) ** t
    return npv

# ── Summary stats helper ──────────────────────────────────────────────────────

def _stats(arr):
    return {
        'mean':   round(float(np.mean(arr)),   1),
        'median': round(float(np.median(arr)), 1),
        'std':    round(float(np.std(arr)),    1),
        'p10':    round(float(np.percentile(arr, 10)), 1),
        'p25':    round(float(np.percentile(arr, 25)), 1),
        'p75':    round(float(np.percentile(arr, 75)), 1),
        'p90':    round(float(np.percentile(arr, 90)), 1),
        'p_pos':  round(float(np.mean(arr > 0)), 4),
    }

def _hist(arr, bins=60):
    p1  = float(np.percentile(arr, 1))
    p99 = float(np.percentile(arr, 99))
    if p99 <= p1:
        p99 = p1 + 1.0
    counts, edges = np.histogram(arr, bins=bins, range=(p1, p99))
    return {
        'counts': counts.tolist(),
        'edges':  [round(float(e), 1) for e in edges],
    }

# ── SEC EDGAR shares outstanding ─────────────────────────────────────────────
# Proxied server-side so we can set User-Agent and avoid browser CORS limits.
# Two-step: (1) company_tickers.json  →  CIK, (2) XBRL companyfacts  →  shares.

_SEC_UA       = 'BiotechTrialTerminal research@btt.local'  # SEC requires "AppName email" format
_cik_map      = {}   # ticker → zero-padded CIK string, loaded once
_fin_cache    = {}   # ticker → financials dict

def _load_cik_map():
    """Download SEC company_tickers.json once and cache in memory."""
    if _cik_map:
        return
    url = 'https://www.sec.gov/files/company_tickers.json'
    req = urllib.request.Request(url, headers={'User-Agent': _SEC_UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        raw = json.loads(r.read())
    for entry in raw.values():
        _cik_map[entry['ticker'].upper()] = str(entry['cik_str']).zfill(10)

def _latest_val(all_ns, ns_list, concept_list, unit='USD'):
    """Return the most-recent value (in millions) for the first matching concept."""
    for ns in ns_list:
        for concept in concept_list:
            entries = all_ns.get(ns, {}).get(concept, {}).get('units', {}).get(unit, [])
            if not entries:
                continue
            good_forms = ('10-K', '10-Q', '20-F', '40-F', '6-K')
            pool = [e for e in entries if e.get('form') in good_forms] or entries
            latest = max(pool, key=lambda e: e.get('end', ''))
            return round(latest['val'] / 1_000_000), latest.get('form','?'), latest.get('end','')
    return None, None, None

def _latest_shares(all_ns):
    """Return (shares_m, form, date) for the most-recent shares-outstanding entry."""
    for ns in ('us-gaap', 'dei'):
        for concept in ('EntityCommonStockSharesOutstanding', 'CommonStockSharesOutstanding'):
            entries = all_ns.get(ns, {}).get(concept, {}).get('units', {}).get('shares', [])
            if not entries:
                continue
            good_forms = ('10-K', '10-Q', '20-F', '40-F', '6-K')
            pool = [e for e in entries if e.get('form') in good_forms] or entries
            latest = max(pool, key=lambda e: e.get('end', ''))
            return round(latest['val'] / 1_000_000), latest.get('form','?'), latest.get('end','')
    return None, None, None

@app.route('/api/sec/financials/<ticker>', methods=['GET'])
def sec_financials(ticker):
    """
    Returns shares outstanding, cash, and total debt for a ticker.
    All monetary values in $M.  Cached per session.
    """
    ticker = ticker.upper().strip()
    if ticker in _fin_cache:
        return jsonify(_fin_cache[ticker])
    try:
        _load_cik_map()
        cik = _cik_map.get(ticker)
        if not cik:
            return jsonify({'error': 'ticker not in SEC EDGAR'}), 404

        url = 'https://data.sec.gov/api/xbrl/companyfacts/CIK' + cik + '.json'
        req = urllib.request.Request(url, headers={'User-Agent': _SEC_UA})
        with urllib.request.urlopen(req, timeout=20) as r:
            facts = json.loads(r.read())

        all_ns = facts.get('facts', {})
        ns = ['us-gaap', 'ifrs-full']   # IFRS filers use ifrs-full

        shares_m, sh_form, sh_date = _latest_shares(all_ns)

        # Cash — try most comprehensive concept first
        cash_m, c_form, c_date = _latest_val(all_ns, ns, [
            'CashCashEquivalentsAndShortTermInvestments',
            'CashAndCashEquivalentsAtCarryingValue',
            'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
        ])

        # Debt — long-term + current combined, fall back to individual components
        debt_m, d_form, d_date = _latest_val(all_ns, ns, [
            'DebtAndCapitalLeaseObligations',
            'LongTermDebtAndCapitalLeaseObligations',
            'LongTermDebt',
        ])
        # If only long-term found, try adding short-term
        if debt_m is not None:
            cur_m, _, _ = _latest_val(all_ns, ns, ['DebtCurrent', 'ShortTermBorrowings'])
            if cur_m:
                debt_m += cur_m

        # net_cash_m = cash − debt  (positive = net cash position; negative = net debt)
        # Treat missing debt as zero — many small biotechs carry no debt at all.
        net_cash_m = None
        if cash_m is not None or debt_m is not None:
            net_cash_m = (cash_m or 0) - (debt_m or 0)

        # Most recent filing date for attribution
        dates = [d for d in (sh_date, c_date, d_date) if d]
        source_date = max(dates) if dates else ''
        source_form = sh_form or c_form or d_form or '?'

        result = {
            'ticker':       ticker,
            'cik':          cik,
            'shares_m':     shares_m,
            'cash_m':       cash_m,
            'debt_m':       debt_m,
            'net_cash_m':   net_cash_m,
            'source':       'SEC EDGAR · ' + source_form + ' · ' + source_date,
        }
        _fin_cache[ticker] = result
        return jsonify(result)

    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── SEC 8-K filings feed ─────────────────────────────────────────────────────

_8K_ITEM_KIND = {
    '1.01': 'AGREEMENT',  '1.02': 'TERMINATION',
    '2.01': 'M&A',        '2.02': 'EARNINGS',
    '3.01': 'DELISTING',  '5.02': 'LEADERSHIP',
    '5.03': 'GOVERNANCE', '5.07': 'VOTE',
    '7.01': 'DISCLOSURE', '8.01': 'UPDATE',
}
_8K_ITEM_DESC = {
    '1.01': 'Entry into material agreement',
    '1.02': 'Termination of material agreement',
    '1.03': 'Bankruptcy or receivership',
    '2.01': 'Completion of acquisition or disposition',
    '2.02': 'Results of operations / earnings',
    '2.03': 'Loan or direct financial obligation',
    '3.01': 'Notice of delisting or transfer',
    '3.02': 'Unregistered equity sales',
    '3.03': 'Material modification to rights of security holders',
    '4.01': 'Auditor change',
    '4.02': 'Non-reliance on prior financial statements',
    '5.01': 'Change in control',
    '5.02': 'Officer / director departure or appointment',
    '5.03': 'Amendments to articles of incorporation or bylaws',
    '5.04': 'Material changes to fiscal year',
    '5.05': 'Material change in fiscal year end',
    '5.07': 'Shareholder vote results',
    '5.08': 'Exempt solicitation disclosure',
    '6.01': 'ABS informational and computational material',
    '7.01': 'Regulation FD disclosure',
    '8.01': 'Other material events',
    # 9.01 is always "Financial Statements and Exhibits" — boilerplate, suppressed
}
# Items that are always boilerplate — skip from message
_8K_SKIP_ITEMS = {'9.01', '9.02'}
_filings_cache  = {}          # ticker → {'ts': datetime, 'data': [...]}
_FILINGS_TTL    = timedelta(minutes=30)

def _fetch_ticker_filings(ticker, days=90):
    """Fetch recent 8-K filings for one ticker. Returns list of dicts."""
    cik = _cik_map.get(ticker)
    if not cik:
        return []
    url  = 'https://data.sec.gov/submissions/CIK' + cik + '.json'
    req  = urllib.request.Request(url, headers={'User-Agent': _SEC_UA})
    with urllib.request.urlopen(req, timeout=15) as r:
        sub = json.loads(r.read())

    recent  = sub.get('filings', {}).get('recent', {})
    forms   = recent.get('form',                   [])
    dates   = recent.get('filingDate',             [])
    items   = recent.get('items',                  [])
    descs   = recent.get('primaryDocDescription',  [])
    accnums = recent.get('accessionNumber',        [])
    cik_int = int(cik)

    cutoff = (datetime.now() - timedelta(days=days)).strftime('%Y-%m-%d')
    results = []
    for i, form in enumerate(forms):
        if form not in ('8-K', '8-K/A'):
            continue
        date = dates[i] if i < len(dates) else ''
        if date < cutoff:
            break   # submissions are newest-first; safe to stop
        raw_items  = items[i]   if i < len(items)   else ''
        raw_desc   = descs[i]   if i < len(descs)   else ''
        acc        = accnums[i] if i < len(accnums)  else ''
        acc_path   = acc.replace('-', '')
        filing_url = ('https://www.sec.gov/Archives/edgar/data/' +
                      str(cik_int) + '/' + acc_path + '/')

        # Determine display kind from first item code
        first_item = raw_items.split(',')[0].strip() if raw_items else ''
        kind = _8K_ITEM_KIND.get(first_item, 'FILING')

        # Build human-readable message (skip boilerplate exhibit items)
        item_descs = [_8K_ITEM_DESC.get(it.strip(), 'Item ' + it.strip())
                      for it in raw_items.split(',')
                      if it.strip() and it.strip() not in _8K_SKIP_ITEMS]
        if item_descs:
            msg = '; '.join(item_descs)
        elif raw_desc and raw_desc.lower() not in ('8-k', '8-k/a', ''):
            msg = raw_desc
        else:
            msg = form + ' filing'

        results.append({
            'ticker': ticker,
            'date':   date,
            'kind':   kind,
            'items':  raw_items,
            'msg':    msg,
            'impact': 'NEU',
            'url':    filing_url,
            'form':   form,
        })
    return results

@app.route('/api/sec/watchlist-filings', methods=['POST'])
def watchlist_filings():
    """
    POST { tickers: ["BIIB","PRAX",...], days: 90 }
    Returns up to 60 most-recent 8-K filings across all tickers, sorted newest-first.
    Results cached 30 minutes per ticker.
    """
    body    = request.json or {}
    tickers = [t.upper().strip() for t in body.get('tickers', [])[:25]]
    days    = int(body.get('days', 90))

    _load_cik_map()   # ensure CIK map is ready

    now = datetime.now()
    to_fetch = []
    cached   = []

    for tk in tickers:
        cached_entry = _filings_cache.get(tk)
        if cached_entry and (now - cached_entry['ts']) < _FILINGS_TTL:
            cached.extend(cached_entry['data'])
        else:
            to_fetch.append(tk)

    if to_fetch:
        def safe_fetch(tk):
            try:
                data = _fetch_ticker_filings(tk, days)
                _filings_cache[tk] = {'ts': now, 'data': data}
                return data
            except Exception as e:
                _filings_cache[tk] = {'ts': now, 'data': []}
                return []

        with ThreadPoolExecutor(max_workers=5) as ex:
            futures = [ex.submit(safe_fetch, tk) for tk in to_fetch]
            for f in futures:
                try:
                    cached.extend(f.result())
                except Exception:
                    pass

    cached.sort(key=lambda x: x['date'], reverse=True)
    return jsonify(cached[:60])


# ── Main route ───────────────────────────────────────────────────────────────

@app.route('/api/scenario/run', methods=['POST'])
def run():
    d = request.json or {}

    pos  = float(np.clip(d.get('pos',         0.30), 0.01, 0.99))
    ps   = float(d.get('peak_sales',  500.0))
    ly   = int(d.get('launch_year',   2028))
    pe   = int(d.get('patent_expiry', 2040))
    w    = float(np.clip(d.get('wacc',         0.12), 0.04, 0.40))
    ry   = float(d.get('ramp_years',  3.0))
    cg   = float(np.clip(d.get('cogs_pct',     0.20), 0.01, 0.70))
    op   = float(np.clip(d.get('opex_pct',     0.30), 0.01, 0.80))
    tx   = float(np.clip(d.get('tax_rate',     0.21), 0.05, 0.45))
    N    = int(np.clip(d.get('n_sim',       10000),  500, 50000))
    cy   = int(d.get('current_year',  2026))

    ytl = max(0, ly - cy)
    pl  = max(1, pe - ly)

    rng = np.random.default_rng()

    # ── Sample uncertainty distributions ─────────────────────────────────────
    # Peak sales: log-normal, 40% coefficient of variation
    cv   = 0.40
    mu_  = np.log(ps) - 0.5 * np.log(1 + cv**2)
    sg_  = np.sqrt(np.log(1 + cv**2))
    ps_s = rng.lognormal(mu_, sg_, N)

    # WACC: normal ±2pp (reflects macro rate uncertainty)
    w_s  = rng.normal(w,  0.020, N).clip(0.05, 0.40)

    # PoS: Beta distribution, concentration=20 (calibrated to phase-level uncertainty)
    a_, b_ = pos * 20.0, (1.0 - pos) * 20.0
    pos_s  = rng.beta(a_, b_, N).clip(0.01, 0.99)

    # Patent life: normal ±2yr
    pl_s = rng.normal(pl,  2.0, N).clip(1, 30).round()

    # Ramp years: normal ±0.5yr
    ry_s = rng.normal(ry, 0.5, N).clip(1, 14).round()

    # Cost structure: small gaussian noise
    cg_s = rng.normal(cg, 0.030, N).clip(0.01, 0.65)
    op_s = rng.normal(op, 0.050, N).clip(0.01, 0.75)
    tx_s = rng.normal(tx, 0.020, N).clip(0.05, 0.45)

    # ── Monte Carlo NPV ───────────────────────────────────────────────────────
    npvs  = _npv_vec(ps_s, w_s, ry_s, pl, ytl, cg_s, op_s, tx_s, pl_s)
    rnpvs = npvs * pos_s          # risk-adjusted: weight by sampled PoS

    # ── Stats ─────────────────────────────────────────────────────────────────
    st_npv  = _stats(npvs)
    st_rnpv = _stats(rnpvs)
    st_rnpv['ev'] = st_rnpv['mean']   # Expected value = mean of risk-adjusted NPV

    # ── Histograms ────────────────────────────────────────────────────────────
    hist_npv  = _hist(npvs)
    hist_rnpv = _hist(rnpvs)

    # Annotate histograms with key statistics for rendering
    for h, st in [(hist_npv, st_npv), (hist_rnpv, st_rnpv)]:
        h['mean']   = st['mean']
        h['median'] = st['median']
        h['p10']    = st['p10']
        h['p90']    = st['p90']

    # ── Tornado sensitivity ───────────────────────────────────────────────────
    base_rnpv = _npv_scalar(ps, w, ry, pl, ytl, cg, op, tx) * pos

    def _rnpv(**kw):
        return _npv_scalar(
            kw.get('ps', ps), kw.get('w', w), kw.get('ry', ry),
            kw.get('pl', pl), ytl,
            kw.get('cg', cg), kw.get('op', op), kw.get('tx', tx)
        ) * kw.get('pos', pos)

    tornado_spec = [
        ('Peak Sales ($M)',   'ps',  ps * 0.50,              ps * 1.65),
        ('WACC (%)',          'w',   w + 0.04,               w - 0.04),
        ('PoS (%)',           'pos', max(0.01, pos - 0.15),  min(0.99, pos + 0.15)),
        ('Patent Life (yr)',  'pl',  max(1, pl - 3),         pl + 3),
        ('Ramp Years',        'ry',  ry + 2,                 max(1, ry - 1)),
        ('COGS (%)',          'cg',  cg + 0.08,              cg - 0.08),
        ('OpEx / SGA (%)',    'op',  op + 0.10,              op - 0.10),
        ('Tax Rate (%)',      'tx',  tx + 0.06,              max(0.05, tx - 0.06)),
    ]

    tornado = []
    for label, key, lo_val, hi_val in tornado_spec:
        nlo = _rnpv(**{key: lo_val})
        nhi = _rnpv(**{key: hi_val})
        if nlo > nhi:
            nlo, nhi = nhi, nlo
        tornado.append({
            'label': label,
            'base':  round(base_rnpv, 1),
            'low':   round(nlo, 1),
            'high':  round(nhi, 1),
            'swing': round(nhi - nlo, 1),
        })
    tornado.sort(key=lambda x: x['swing'], reverse=True)

    # ── Scenarios (Bear / Base / Bull) ────────────────────────────────────────
    def _scen(ps_mult, pos_delta):
        ps2  = ps * ps_mult
        pos2 = float(np.clip(pos + pos_delta, 0.01, 0.99))
        n    = _npv_scalar(ps2, w, ry, pl, ytl, cg, op, tx)
        return {
            'peak_sales': round(ps2, 0),
            'npv':        round(n, 1),
            'rnpv':       round(n * pos2, 1),
            'pos':        round(pos2, 3),
        }

    scenarios = {
        'bear': _scen(0.50, -0.15),
        'base': _scen(1.00,  0.00),
        'bull': _scen(1.80, +0.15),
    }

    # ── Sensitivity grid (PoS × Peak multiplier) ──────────────────────────────
    pos_vals = [0.10, 0.25, 0.40, 0.55, 0.70, 0.85]
    pk_mults = [0.50, 0.75, 1.00, 1.25, 1.50, 2.00]
    sens = {
        'pos_vals': [round(p, 2) for p in pos_vals],
        'pk_mults': pk_mults,
        'cells': [
            [round(_npv_scalar(ps * pm, w, ry, pl, ytl, cg, op, tx) * pv, 0)
             for pm in pk_mults]
            for pv in pos_vals
        ],
    }

    return jsonify({
        'stats':      {'npv': st_npv, 'rnpv': st_rnpv},
        'histogram':  hist_npv,
        'rnpv_hist':  hist_rnpv,
        'tornado':    tornado,
        'scenarios':  scenarios,
        'sens':       sens,
        'base_rnpv':  round(base_rnpv, 1),
    })


@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'engine': 'numpy'})


if __name__ == '__main__':
    print('BTT  ·  http://localhost:5002')
    print('Static: all files in', BASE)
    print('API:    POST /api/scenario/run   GET /health')
    # Bind to '::' (IPv6 all-interfaces) — on Windows this covers IPv4 too
    # when the dual-stack socket option is enabled (default on Windows).
    # Fallback: if IPv6 not available, Flask will raise; swap to '0.0.0.0'.
    try:
        app.run(host='::', port=5002, debug=False, threaded=True)
    except OSError:
        app.run(host='0.0.0.0', port=5002, debug=False, threaded=True)
