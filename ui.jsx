/* ui.jsx — shared UI primitives */

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ────────────────────────── helpers ──────────────────────────

const fmtNum = (n, d = 0) => {
  if (n == null || isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
};
const fmtPct = (n, d = 1) => (n * 100).toFixed(d) + "%";
const fmtMoney = (n) => {
  if (!n) return "—";
  if (n >= 1000) return "$" + (n / 1000).toFixed(1) + "B";
  return "$" + n + "M";
};
const fmtDate = (s) => {
  if (!s) return "—";
  if (s.length === 7 || /Q\d/.test(s)) return s;
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toISOString().slice(0, 10);
};
const parseDate = (s) => {
  if (!s) return null;
  if (/Q\d/.test(s)) {
    const [y, q] = s.split("-");
    const m = { Q1: 1, Q2: 4, Q3: 7, Q4: 10 }[q];
    return new Date(parseInt(y), m - 1, 15);
  }
  if (/^\d{4}-\d{2}$/.test(s)) return new Date(s + "-15");
  return new Date(s);
};

// ────────────────────────── topbar ──────────────────────────

function TopBar() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return (
    <div className="topbar">
      <span className="brand">BTT · BIOTECH TRIAL TERMINAL</span>
      <span style={{ color: "var(--text-faint)" }}>v0.6.0</span>
      <span className="spacer"></span>
      <span className="clock">{time}</span>
    </div>
  );
}

// ────────────────────────── nav + search ──────────────────────────

function Nav({ tab, onTab, onSelectTrial, trials, addTrial, onSelectCompany }) {
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [sel, setSel] = useState(0);
  const [liveResults, setLiveResults] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);

  const tabs = [
    { id: "tracker",   label: "Trial Tracker", key: "F1" },
    { id: "calendar",  label: "Catalyst Cal",  key: "F2" },
    { id: "landscape", label: "Landscape",     key: "F3" },
    { id: "modeler",   label: "Scenario",      key: "F4" },
  ];

  // Local search: tickers from TICKER_TO_SPONSORS + loaded trials
  const results = useMemo(() => {
    if (!q.trim()) return null;
    const needle = q.toLowerCase().trim();
    const upperNeedle = needle.toUpperCase();

    // Match against TICKER_TO_SPONSORS keys and sponsor names
    const tickerMatches = Object.keys(window.CTAPI?.TICKER_TO_SPONSORS || {})
      .filter(tk => {
        if (tk.toLowerCase().includes(needle)) return true;
        const sponsors = window.CTAPI.TICKER_TO_SPONSORS[tk] || [];
        return sponsors.some(s => s.toLowerCase().includes(needle));
      })
      .slice(0, 5)
      .map(tk => ({ ticker: tk, sponsors: (window.CTAPI.TICKER_TO_SPONSORS[tk] || []).join(", ") }));

    // Match against loaded trials
    const localTrials = (trials || [])
      .filter(t =>
        (t.id || "").toLowerCase().includes(needle) ||
        (t.drug || "").toLowerCase().includes(needle) ||
        (t.indication || "").toLowerCase().includes(needle) ||
        (t.ticker || "").toLowerCase().includes(needle) ||
        (t.title || "").toLowerCase().includes(needle) ||
        (t.sponsor || "").toLowerCase().includes(needle))
      .slice(0, 8);

    return { tickers: tickerMatches, trials: localTrials };
  }, [q, trials]);

  // Live CT.gov search — debounced 400ms, ≥3 chars
  useEffect(() => {
    if (!q.trim() || q.trim().length < 3) { setLiveResults(null); return; }
    const timer = setTimeout(async () => {
      setLiveLoading(true);
      try {
        const { studies } = await window.CTAPI.searchStudies(q.trim(), { pageSize: 8 });
        setLiveResults(studies.filter(s => s.id && !(trials || []).find(t => t.id === s.id)));
      } catch (_) {
        setLiveResults(null);
      } finally {
        setLiveLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [q, trials]);

  // Flat list for keyboard navigation
  const flat = useMemo(() => {
    const local = results ? [
      ...results.tickers.map(t => ({ kind: "ticker", ...t })),
      ...results.trials.map(t  => ({ kind: "trial",  ...t })),
    ] : [];
    const live = (liveResults || []).map(r => ({ kind: "live", ...r }));
    return [...local, ...live];
  }, [results, liveResults]);

  const choose = (item) => {
    if (item.kind === "trial") onSelectTrial(item.id);
    else if (item.kind === "live" && addTrial) addTrial(item.id);
    else if (item.kind === "ticker" && onSelectCompany) onSelectCompany(item.ticker);
    setQ(""); setFocused(false); setSel(0); setLiveResults(null);
  };

  const onKey = (e) => {
    if (!flat.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, flat.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); if (flat[sel]) choose(flat[sel]); }
    if (e.key === "Escape")    { setQ(""); setFocused(false); setLiveResults(null); }
  };

  const showDropdown = focused && q.trim() && (
    (results && (results.tickers.length + results.trials.length > 0)) ||
    liveLoading || (liveResults && liveResults.length > 0)
  );

  return (
    <div className="nav">
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id}
                  className={"tab " + (tab === t.id ? "active" : "")}
                  onClick={() => onTab(t.id)}>
            {t.label}
            <span className="key">{t.key}</span>
          </button>
        ))}
      </div>
      <div className="search">
        <span style={{ color: "var(--text-faint)", marginRight: 8 }}>{">"}</span>
        <input
          value={q}
          onChange={e => { setQ(e.target.value); setSel(0); }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 180)}
          onKeyDown={onKey}
          placeholder="TICKER, DRUG, INDICATION, NCT ID… [/]"
        />
        <span className="cmd">/</span>
        {showDropdown && (
          <div className="autocomplete">
            {/* Ticker matches */}
            {results && results.tickers.length > 0 && <div className="ac-section">TICKERS</div>}
            {results && results.tickers.map((r, i) => (
              <div key={r.ticker}
                   className={"ac-row " + (sel === i ? "sel" : "")}
                   onMouseDown={() => choose({ kind: "ticker", ...r })}>
                <span className="tk">{r.ticker}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.sponsors}</span>
                <span className="ind" style={{ color: "var(--accent)", fontSize: 9 }}>VIEW →</span>
              </div>
            ))}
            {/* Local trial matches */}
            {results && results.trials.length > 0 && <div className="ac-section">LOADED TRIALS</div>}
            {results && results.trials.map((r, i) => {
              const idx = (results.tickers.length) + i;
              return (
                <div key={r.id}
                     className={"ac-row " + (sel === idx ? "sel" : "")}
                     onMouseDown={() => choose({ kind: "trial", ...r })}>
                  <span className="tk">{r.ticker || "—"}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ color: "var(--text)" }}>{r.drug}</span>
                    <span style={{ color: "var(--text-faint)", marginLeft: 6, fontSize: 9 }}>{r.id}</span>
                  </span>
                  <span className="ind">{r.indication}</span>
                </div>
              );
            })}
            {/* Live CT.gov search results */}
            {(liveLoading || (liveResults && liveResults.length > 0)) && (
              <>
                <div className="ac-section" style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>CT.GOV LIVE DATABASE</span>
                  {liveLoading && <span style={{ color: "var(--amber)", letterSpacing: 2 }}>···</span>}
                </div>
                {(liveResults || []).map((r, i) => {
                  const base = results ? (results.tickers.length + results.trials.length) : 0;
                  const idx = base + i;
                  return (
                    <div key={r.id}
                         className={"ac-row " + (sel === idx ? "sel" : "")}
                         onMouseDown={() => choose({ kind: "live", ...r })}>
                      <span className="tk" style={{ color: "var(--cyan)", fontSize: 9 }}>
                        {r.ticker || <span>P{r.phase}</span>}
                      </span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        <span style={{ color: "var(--text)" }}>{r.drug || r.title}</span>
                        <span style={{ color: "var(--text-faint)", marginLeft: 6, fontSize: 9 }}>{r.id}</span>
                      </span>
                      <span className="ind" style={{ color: "var(--cyan)", fontSize: 9 }}>+ ADD</span>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────── status bar ──────────────────────────

function StatusBar({ count, sel, apiStatus, watchlistCount }) {
  const statusEl = {
    loading: <><span className="loading">● SYNCING</span><span>CT.GOV · fetching {watchlistCount} companies</span></>,
    live:    <><span className="ok">● LIVE</span><span>CT.GOV · {count} trials · {watchlistCount} companies</span></>,
    error:   <><span className="err">● FALLBACK</span><span>CT.GOV · partial data</span></>,
  }[apiStatus] || null;

  return (
    <div className="statusbar">
      {statusEl}
      <span>{sel || "no selection"}</span>
      <span className="spacer"></span>
      <span>[/] search</span>
      <span>[F1–F4] tabs</span>
      <span>[ESC] close</span>
    </div>
  );
}

// ────────────────────────── panel wrapper ──────────────────────────

function Panel({ title, right, children, style, bodyStyle }) {
  return (
    <div className="panel" style={style}>
      <div className="panel-header">
        <span>{title}</span>
        {right ? <span className="ph-dim">{right}</span> : null}
      </div>
      <div className="panel-body" style={bodyStyle}>{children}</div>
    </div>
  );
}

// ────────────────────────── pills ──────────────────────────

function StatusPill({ status }) {
  const map = {
    RECRUITING:  { txt: "RECRUITING", c: window.STATUS_COLOR.RECRUITING },
    ACTIVE_NE:   { txt: "ACTIVE",     c: window.STATUS_COLOR.ACTIVE_NE },
    NOT_YET:     { txt: "PRE-LAUNCH", c: window.STATUS_COLOR.NOT_YET },
    TERMINATED:  { txt: "TERMINATED", c: window.STATUS_COLOR.TERMINATED },
    COMPLETED:   { txt: "COMPLETED",  c: window.STATUS_COLOR.COMPLETED },
  };
  const v = map[status] || { txt: status, c: "var(--text-dim)" };
  return <span className="pill" style={{ color: v.c }}>{v.txt}</span>;
}

function PhasePill({ phase }) {
  const c = window.PHASE_COLOR[phase] || "var(--text-dim)";
  return <span className="phase" style={{ color: c }}>P{phase}</span>;
}

// ────────────────────────── company drawer ──────────────────────────

function CompanyDrawer({ ticker, watchlist, addToWatchlist, onClose, onAnalyze }) {
  const [compTrials, setCompTrials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchedCount, setFetchedCount] = useState(0);
  const [fins, setFins] = useState(null);   // SEC financials

  useEffect(() => {
    setLoading(true);
    setCompTrials([]);
    setFetchedCount(0);
    setFins(null);
    let cancelled = false;
    window.CTAPI.fetchAllTrialsBySponsor(ticker, function(partial) {
      if (!cancelled) setFetchedCount(partial.length);
    }).then(function(t) {
      if (!cancelled) { setCompTrials(t); setLoading(false); }
    }).catch(function() {
      if (!cancelled) setLoading(false);
    });
    // Fetch SEC financials in parallel
    fetch('/api/sec/financials/' + encodeURIComponent(ticker))
      .then(function(r) { return r.ok ? r.json() : null; })
      .then(function(d) { if (!cancelled && d && !d.error) setFins(d); })
      .catch(function() {});
    return function() { cancelled = true; };
  }, [ticker]);

  const sponsors = (window.CTAPI.TICKER_TO_SPONSORS[ticker] || []).join(", ") || ticker;
  const inWl = (watchlist || []).includes(ticker);

  const byPhase = useMemo(function() {
    const map = {};
    compTrials.forEach(function(t) { map[t.phase] = (map[t.phase] || 0) + 1; });
    const order = ["1", "early 1", "1/2", "1b", "2", "2b", "2/3", "3", "N/A"];
    return Object.entries(map).sort(function(a, b) {
      const ai = order.indexOf(a[0]), bi = order.indexOf(b[0]);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }, [compTrials]);

  const byInd = useMemo(function() {
    const map = {};
    compTrials.forEach(function(t) {
      const ind = (t.indication || "Unknown").slice(0, 45);
      map[ind] = (map[ind] || 0) + 1;
    });
    return Object.entries(map).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 12);
  }, [compTrials]);

  const byStatus = useMemo(function() {
    const map = {};
    compTrials.forEach(function(t) { map[t.status] = (map[t.status] || 0) + 1; });
    return map;
  }, [compTrials]);

  const upcoming = useMemo(function() {
    const now = new Date();
    return compTrials
      .filter(function(t) { return t.pcd && parseDate(t.pcd) > now; })
      .sort(function(a, b) { return parseDate(a.pcd) - parseDate(b.pcd); })
      .slice(0, 6);
  }, [compTrials]);

  const phase3n = byPhase.filter(function(x) { return x[0] === "3"; }).reduce(function(s, x) { return s + x[1]; }, 0);
  const maxInd = byInd.length ? byInd[0][1] : 1;

  const phaseColor = function(ph) {
    return ({ "1":"var(--cyan)", "early 1":"var(--cyan)", "1/2":"var(--blue)", "1b":"var(--blue)",
              "2":"var(--accent)", "2b":"var(--amber)", "2/3":"var(--amber)", "3":"var(--green)",
              "N/A":"var(--text-faint)" })[ph] || "var(--text-dim)";
  };
  const kindColor = function(k) {
    return ({ PIVOTAL:"var(--red)", TOPLINE:"var(--accent)", INTERIM:"var(--amber)",
              UPDATE:"var(--blue)", ASCO:"var(--violet)" })[k] || "var(--accent)";
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose}></div>
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="nct" style={{ color: "var(--text-faint)", fontSize: 9, letterSpacing: 1.5 }}>
              COMPANY OVERVIEW · CT.GOV LIVE
            </div>
            <div className="drug" style={{ marginTop: 4 }}>
              <span className="ticker">{ticker}</span>
              <span style={{ color: "var(--text-dim)", fontSize: 11, marginLeft: 8 }}>
                {(sponsors.split(",")[0] || "").trim()}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            {!inWl && addToWatchlist && (
              <button onClick={function() { addToWatchlist(ticker); }} style={{
                background: "transparent", border: "1px solid var(--accent)",
                color: "var(--accent)", fontFamily: "var(--font-mono)", fontSize: 9,
                padding: "3px 10px", cursor: "pointer", letterSpacing: 1,
              }}>+ WATCHLIST</button>
            )}
            {inWl && (
              <span style={{ fontSize: 9, color: "var(--green)", letterSpacing: 1, padding: "3px 8px" }}>
                ● IN WATCHLIST
              </span>
            )}
            <button className="close" onClick={onClose}>ESC ✕</button>
          </div>
        </div>

        <div className="drawer-body">
          {loading && (
            <div style={{ padding: 32, textAlign: "center" }}>
              <div style={{ color: "var(--amber)", fontSize: 10, letterSpacing: 2, marginBottom: 8 }}>
                ● FETCHING ALL TRIALS…
              </div>
              {fetchedCount > 0 && (
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{fetchedCount}</div>
              )}
              {fetchedCount > 0 && (
                <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: 1.5 }}>RETRIEVED SO FAR</div>
              )}
            </div>
          )}
          {!loading && compTrials.length === 0 && (
            <div style={{ padding: 24, color: "var(--text-faint)", textAlign: "center", fontSize: 10 }}>
              No active trials found on CT.gov for this sponsor.
            </div>
          )}
          {!loading && compTrials.length > 0 && (
            <>
              {/* Summary stats */}
              <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: fins ? 0 : 14 }}>
                {[
                  { n: compTrials.length, label: "ACTIVE TRIALS", c: "var(--accent)" },
                  { n: phase3n, label: "PHASE 3", c: "var(--green)" },
                  { n: byInd.length, label: "INDICATIONS", c: "var(--blue)" },
                  { n: upcoming.length, label: "UPCOMING PCD", c: "var(--amber)" },
                ].map(function(s) { return (
                  <div key={s.label} style={{ flex: 1, textAlign: "center", padding: "8px 4px" }}>
                    <div style={{ fontSize: 26, fontWeight: 700, color: s.c, lineHeight: 1 }}>{s.n}</div>
                    <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 1.5, marginTop: 3 }}>{s.label}</div>
                  </div>
                ); })}
              </div>

              {/* SEC financials strip */}
              {fins && (
                <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)", marginBottom:14, background:"var(--panel-2)" }}>
                  {[
                    { label:"SHARES OUT", val: fins.shares_m != null ? fmtNum(fins.shares_m) + "M" : "—", c:"var(--text)" },
                    { label:"CASH",       val: fins.cash_m   != null ? fmtMoney(Math.round(fins.cash_m)) : "—", c:"var(--green)" },
                    { label:"DEBT",       val: fins.debt_m   != null ? fmtMoney(Math.round(fins.debt_m)) : "—", c: fins.debt_m > 0 ? "var(--red)" : "var(--text-faint)" },
                    { label:"NET CASH",   val: fins.net_cash_m != null ? (fins.net_cash_m >= 0 ? "+" : "") + fmtMoney(Math.round(fins.net_cash_m)) : "—",
                      c: fins.net_cash_m >= 0 ? "var(--green)" : "var(--red)" },
                  ].map(function(s) { return (
                    <div key={s.label} style={{ flex:1, textAlign:"center", padding:"6px 4px" }}>
                      <div style={{ fontSize:13, fontWeight:700, color:s.c, lineHeight:1 }}>{s.val}</div>
                      <div style={{ fontSize:8, color:"var(--text-faint)", letterSpacing:1.5, marginTop:3 }}>{s.label}</div>
                    </div>
                  ); })}
                  <div style={{ fontSize:7, color:"var(--text-faint)", alignSelf:"center", padding:"0 8px", letterSpacing:0.5 }}>
                    {fins.source}
                  </div>
                </div>
              )}

              {/* Phase breakdown */}
              <h4 style={{ margin: "0 0 8px", fontSize: 9, color: "var(--text-faint)", letterSpacing: 2 }}>PHASE BREAKDOWN</h4>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 14, height: 64 }}>
                {byPhase.map(function(entry) {
                  var ph = entry[0]; var n = entry[1];
                  var barH = Math.max(6, Math.round((n / compTrials.length) * 56));
                  return (
                    <div key={ph} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      <span style={{ fontSize: 9, color: phaseColor(ph), fontWeight: 700 }}>{n}</span>
                      <div style={{ width: 30, height: barH, background: phaseColor(ph), opacity: 0.75 }}></div>
                      <span style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 0.5 }}>P{ph}</span>
                    </div>
                  );
                })}
              </div>

              {/* Status breakdown */}
              <div style={{ display: "flex", gap: 12, marginBottom: 14, fontSize: 9, flexWrap: "wrap" }}>
                {Object.entries(byStatus).map(function(entry) {
                  var s = entry[0]; var n = entry[1];
                  var c = ({ RECRUITING:"var(--green)", ACTIVE_NE:"var(--accent)", NOT_YET:"var(--blue)",
                             TERMINATED:"var(--red)", COMPLETED:"var(--text-dim)" })[s] || "var(--text-faint)";
                  return (
                    <span key={s} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <span style={{ color: c }}>●</span>
                      <span style={{ color: "var(--text-faint)" }}>{s.replace("_", " ")}</span>
                      <span style={{ color: "var(--text)", fontWeight: 700 }}>{n}</span>
                    </span>
                  );
                })}
              </div>

              {/* Top indications */}
              <h4 style={{ margin: "0 0 8px", fontSize: 9, color: "var(--text-faint)", letterSpacing: 2 }}>TOP INDICATIONS</h4>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 14 }}>
                {byInd.map(function(entry) {
                  var ind = entry[0]; var n = entry[1];
                  return (
                    <div key={ind} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10 }}>
                      <span style={{ width: 150, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis",
                                     whiteSpace: "nowrap", flexShrink: 0, fontSize: 9 }}>{ind}</span>
                      <div style={{ flex: 1, height: 5, background: "var(--panel-3)" }}>
                        <div style={{ width: Math.round(n / maxInd * 100) + "%", height: "100%",
                                      background: "var(--accent)", opacity: 0.65 }}></div>
                      </div>
                      <span style={{ width: 22, textAlign: "right", color: "var(--accent)", fontWeight: 700, fontSize: 9 }}>{n}</span>
                    </div>
                  );
                })}
              </div>

              {/* Upcoming PCDs */}
              {upcoming.length > 0 && (
                <>
                  <h4 style={{ margin: "0 0 8px", fontSize: 9, color: "var(--text-faint)", letterSpacing: 2 }}>UPCOMING PRIMARY COMPLETIONS</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {upcoming.map(function(t) {
                      var c = kindColor(t.catalyst && t.catalyst.kind);
                      return (
                        <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px",
                                                  background: "var(--panel-2)", border: "1px solid var(--border)", fontSize: 10 }}>
                          <span style={{ color: c, fontSize: 8, letterSpacing: 1, minWidth: 48 }}>
                            {(t.catalyst && t.catalyst.kind) || "PCD"}
                          </span>
                          <span style={{ color: "var(--accent)", minWidth: 76, fontVariantNumeric: "tabular-nums" }}>
                            {fmtDate(t.pcd)}
                          </span>
                          <span style={{ color: "var(--text)" }}>{t.drug}</span>
                          <PhasePill phase={t.phase} />
                          <span style={{ color: "var(--text-faint)", fontSize: 9, overflow: "hidden",
                                          textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                            · {t.indication}
                          </span>
                          {onAnalyze && (
                            <span onClick={function() { onAnalyze(t.id); onClose(); }}
                                  style={{ fontSize:8, color:"var(--accent)", cursor:"pointer",
                                           letterSpacing:1, flexShrink:0, padding:"1px 6px",
                                           border:"1px solid var(--accent)" }}>
                              ▶
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ────────────────────────── trial drawer ──────────────────────────

function MonteSection({ trial }) {
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!window.MONTE) return;
    // Run off the render cycle so the drawer opens instantly
    const id = setTimeout(() => {
      try { setResult(window.MONTE.getAnalysis(trial)); }
      catch(e) { console.warn("monte failed", e); }
    }, 80);
    return () => clearTimeout(id);
  }, [trial.id]);

  if (!window.MONTE) return null;
  if (!result) return (
    <div style={{ padding: "10px 0", color: "var(--text-faint)", fontSize: 9, letterSpacing: 1.5 }}>
      ● RUNNING SIMULATION…
    </div>
  );

  const { mc, dcf, pos, expected_move, params } = result;
  const dist = mc.dist; // [fail, marginal, solid, blowout]
  const labels = ["FAIL", "MARGINAL", "SOLID", "BLOWOUT"];
  const colors = ["var(--red)", "var(--amber)", "var(--accent)", "var(--green)"];
  const moveSign = (m) => m >= 0 ? "+" + (m * 100).toFixed(0) + "%" : (m * 100).toFixed(0) + "%";
  const moveColor = (m) => m >= 0 ? "var(--green)" : "var(--red)";
  const hasOverlay = !!trial.pos;

  // Build Cohen's d range label for each bucket
  const d_thr = params.d_thr;
  const thr   = params.thresholds; // [marginal_d, solid_d, blowout_d]
  const dRanges = [
    "p>0.05 or d<" + d_thr.toFixed(2),
    "d " + d_thr.toFixed(2) + "–" + thr[1].toFixed(2),
    "d " + thr[1].toFixed(2) + "–" + thr[2].toFixed(2),
    "d ≥" + thr[2].toFixed(2),
  ];

  return (
    <>
      <h4 style={{ display: "flex", alignItems: "center", gap: 6 }}>
        Monte Carlo Simulation
        <span style={{ fontSize: 8, color: "var(--text-faint)", fontWeight: 400, letterSpacing: 1 }}>
          · 1 000 ITERATIONS · 2 SCENARIOS
        </span>
      </h4>

      {/* PoS + expected move hero row */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)", marginBottom: 10 }}>
        {[
          { label: "P(SUCCESS)",    val: fmtPct(pos, 1),
            c: pos > 0.55 ? "var(--green)" : pos > 0.35 ? "var(--amber)" : "var(--red)" },
          { label: "EXP. MOVE",     val: moveSign(expected_move), c: moveColor(expected_move) },
          { label: "RNPV",          val: fmtMoney(Math.round(dcf.rnpv)), c: "var(--accent)" },
          { label: "PEAK SALES",    val: fmtMoney(Math.round(dcf.peakSales)), c: "var(--text)" },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, textAlign: "center", padding: "8px 2px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: s.c, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 1.2, marginTop: 3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Outcome distribution bar */}
      <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 1.5, marginBottom: 5 }}>
        OUTCOME DISTRIBUTION
      </div>
      <div style={{ display: "flex", height: 18, borderRadius: 2, overflow: "hidden", marginBottom: 5 }}>
        {dist.map((p, i) => p > 0.002 ? (
          <div key={i} style={{ flex: p, background: colors[i], opacity: 0.80,
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 8, color: "#fff", fontWeight: 700, letterSpacing: 0.5,
                                minWidth: p > 0.06 ? 24 : 0, overflow: "hidden" }}>
            {p > 0.06 ? (p * 100).toFixed(0) + "%" : ""}
          </div>
        ) : null)}
      </div>
      {/* Outcome legend with d-range thresholds */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 12 }}>
        {dist.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 0,
                                 padding: "3px 6px", background: "var(--panel-2)",
                                 border: "1px solid var(--border)" }}>
            <span style={{ color: colors[i], fontSize: 8, width: 10 }}>■</span>
            <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 9,
                           width: 66, flexShrink: 0 }}>{labels[i]}</span>
            <span style={{ color: "var(--text)", fontWeight: 700, fontSize: 10,
                           width: 42, flexShrink: 0 }}>{(p * 100).toFixed(1)}%</span>
            <span style={{ color: "var(--text-dim)", fontSize: 8, flex: 1 }}>{dRanges[i]}</span>
            <span style={{ color: moveColor(mc.moves[i]), fontSize: 9,
                           fontWeight: 600, flexShrink: 0 }}>{moveSign(mc.moves[i])}</span>
          </div>
        ))}
      </div>

      {/* Simulation inputs */}
      <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 1.5, marginBottom: 5 }}>
        SIMULATION INPUTS
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2px 16px",
                    padding: "6px 8px", background: "var(--panel-2)",
                    border: "1px solid var(--border)", marginBottom: 12 }}>
        {[
          ["Phase",            params.phase.toUpperCase()],
          ["n per arm",        params.nPerArm],
          ["Patient σ",        params.sigma.toFixed(0) + " units"],
          ["Effect μ (d)",     params.d_mu.toFixed(3)],
          ["Effect σ (d)",     params.eff_unc.toFixed(3)],
          ["Min eff. d",       params.d_thr.toFixed(2)],
          ["α threshold",      "0.050"],
          ["Bayesian wt",      (params.effective_weight * 100).toFixed(0) + "%"],
          ["Phase prior PoS",  fmtPct(params.prior_pos, 0)],
          ["Market size",      fmtMoney(params.marketSize)],
          ["Ind. peak share",  fmtPct(params.peakShare, 0)],
          ["Drug modality",    params.modality ? params.modality.label : "Standard"],
          ["Modality mult",    params.modality ? params.modality.mult.toFixed(2) + "×" : "1.00×"],
          ["Pipeline trials",  params.nTrials + " loaded"],
          ["Conc. multiplier", params.concMult.toFixed(2) + "×"],
        ].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between",
                                 alignItems: "baseline", gap: 4 }}>
            <span style={{ color: "var(--text-faint)", fontSize: 8 }}>{k}</span>
            <span style={{ color: "var(--text)", fontSize: 9, fontWeight: 600,
                           fontVariantNumeric: "tabular-nums" }}>{v}</span>
          </div>
        ))}
      </div>

      {/* Scenario breakdown */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {[
          { label: "S1 FREQUENTIST", pos: mc.pos_s1 },
          { label: "S2 BAYESIAN",    pos: mc.pos_s2 },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, padding: "6px 8px", background: "var(--panel-2)",
                                       border: "1px solid var(--border)" }}>
            <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 1.2, marginBottom: 3 }}>{s.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700,
                          color: s.pos > 0.55 ? "var(--green)" : s.pos > 0.35 ? "var(--amber)" : "var(--red)" }}>
              {fmtPct(s.pos, 1)}
            </div>
          </div>
        ))}
        <div style={{ flex: 1, padding: "6px 8px", background: "var(--panel-2)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 1.2, marginBottom: 3 }}>PHASE PRIOR</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-dim)" }}>
            {fmtPct(result.params.prior_pos, 1)}
          </div>
        </div>
      </div>

      {/* DCF summary */}
      <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 1.5, marginBottom: 5 }}>
        RISK-ADJUSTED DCF
      </div>
      <dl className="kv" style={{ marginBottom: 8 }}>
        <dt>Market Size</dt><dd>{fmtMoney(dcf.marketSize)}</dd>
        <dt>Ind. share</dt><dd>{fmtPct(dcf.peakShare, 0)}</dd>
        <dt>Modality ×</dt><dd style={{ color: dcf.modalityMult > 1 ? "var(--green)" : dcf.modalityMult < 1 ? "var(--red)" : "var(--text-dim)" }}>{dcf.modalityMult != null ? dcf.modalityMult.toFixed(2) + "×" : "1.00×"}</dd>
        <dt>Eff. peak share</dt><dd style={{ fontWeight: 700 }}>{fmtPct(dcf.effectiveShare, 0)}</dd>
        <dt>Launch (est.)</dt><dd>{dcf.launchYear}</dd>
        <dt>Excl. Expiry</dt><dd>{dcf.patentExpiry}</dd>
        <dt>WACC</dt><dd>{fmtPct(dcf.wacc, 0)}</dd>
        <dt>NPV (unadjusted)</dt><dd>{fmtMoney(Math.round(dcf.npv))}</dd>
        <dt>RNPV (× PoS)</dt><dd style={{ color: "var(--accent)", fontWeight: 700 }}>{fmtMoney(Math.round(dcf.rnpv))}</dd>
      </dl>

      {hasOverlay && (
        <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 1, marginBottom: 4 }}>
          ★ Analyst PoS estimate blended in (60/40 model/analyst weight)
        </div>
      )}
      <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 1 }}>
        Model: phase-calibrated Monte Carlo · indicative only · not investment advice
      </div>
    </>
  );
}

function TrialDrawer({ trial, onClose, onAnalyze }) {
  if (!trial) return null;
  const pct = (trial.target && trial.enrolled != null) ? Math.min(1, trial.enrolled / trial.target) : 0;
  const enrollLabel = trial.enrolled != null
    ? `${trial.enrolled} / ${trial.target}  (${fmtPct(pct, 0)})`
    : `— / ${trial.target}  (target)`;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose}></div>
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="nct">
              <a href={"https://clinicaltrials.gov/study/" + trial.id}
                 target="_blank" rel="noopener"
                 style={{ color: "var(--accent)", textDecoration: "none" }}
                 onClick={e => e.stopPropagation()}>
                {trial.id} ↗
              </a>
              {" · "}{trial.sponsor}
            </div>
            <div className="drug">
              <span className="ticker">{trial.ticker || "—"}</span>{" · "}
              <span>{trial.drug}</span>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"flex-start" }}>
            {onAnalyze && (
              <button
                onClick={() => { onAnalyze(trial.id); onClose(); }}
                style={{
                  background:"var(--accent)", border:"none", color:"#000",
                  fontFamily:"var(--font-mono)", fontSize:9, fontWeight:700,
                  padding:"4px 12px", cursor:"pointer", letterSpacing:1.5,
                  whiteSpace:"nowrap",
                }}>
                ▶ SCENARIO
              </button>
            )}
            <button className="close" onClick={onClose}>ESC ✕</button>
          </div>
        </div>
        <div className="drawer-body">
          <dl className="kv">
            <dt>Indication</dt><dd>{trial.indication}</dd>
            <dt>Phase</dt><dd><PhasePill phase={trial.phase}/> {trial.title}</dd>
            <dt>Status</dt><dd><StatusPill status={trial.status}/> <span style={{color:"var(--text-faint)",marginLeft:8}}>updated {trial.lastChange || "—"}</span></dd>
            <dt>Sites</dt><dd>{trial.sites || "—"} active</dd>
            <dt>Started</dt><dd>{fmtDate(trial.start)}</dd>
            <dt>Primary Compl.</dt><dd style={{color:"var(--accent)"}}>{fmtDate(trial.pcd)}</dd>
            <dt>Endpoint</dt><dd style={{whiteSpace:"normal"}}>{trial.endpoint || "—"}</dd>
          </dl>

          <h4>Enrollment</h4>
          <div className="enroll-bar">
            <div className="fill" style={{ width: (pct * 100) + "%" }}></div>
            <div className="lbl">{enrollLabel}</div>
          </div>

          {trial.catalyst && (
            <>
              <h4>Next Catalyst</h4>
              <dl className="kv">
                <dt>Event</dt><dd>{trial.catalyst.kind}</dd>
                <dt>Date</dt><dd style={{color:"var(--accent)"}}>{fmtDate(trial.catalyst.date)}</dd>
              </dl>
            </>
          )}

          <MonteSection trial={trial} />

          {trial.delta && (
            <>
              <h4>Recent Activity</h4>
              <div style={{ padding: "6px 8px", background: "var(--panel-2)", border: "1px solid var(--border)", fontSize: 10.5, color: "var(--text)", lineHeight: 1.5, whiteSpace: "normal" }}>
                <div style={{ color: "var(--text-dim)", fontSize: 9, letterSpacing: 1, marginBottom: 4 }}>
                  {trial.lastChange || "—"} · DELTA
                </div>
                {trial.delta}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ────────────────────────── activity feed (legacy) ──────────────────────────

function ActivityFeed({ filterTicker, onSelectTicker }) {
  const items = filterTicker
    ? window.ACTIVITY.filter(a => a.ticker === filterTicker)
    : window.ACTIVITY;
  return (
    <div className="feed">
      {items.map((a, i) => (
        <div key={i} className="feed-row" onClick={() => onSelectTicker && onSelectTicker(a.ticker)}>
          <span className="t">{a.t}</span>
          <span className="tk">{a.ticker}</span>
          <span className="kind">{a.kind}</span>
          <span className="msg">{a.msg}</span>
          <span className={"dot " + a.impact}></span>
        </div>
      ))}
      {items.length === 0 && (
        <div style={{ padding: 12, color: "var(--text-faint)", fontSize: 10 }}>
          No activity for {filterTicker}.
        </div>
      )}
    </div>
  );
}

Object.assign(window, {
  fmtNum, fmtPct, fmtMoney, fmtDate, parseDate,
  TopBar, Nav, StatusBar, Panel,
  StatusPill, PhasePill,
  CompanyDrawer, TrialDrawer, ActivityFeed,
});
