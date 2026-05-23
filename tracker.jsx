/* tracker.jsx — Trial Tracker (home view) */

function TrialTracker({ trials, watchlist, addToWatchlist, removeFromWatchlist, onSelectTrial, selectedTrial, allUpcoming, onRefetch, liveActivity, activityLoading }) {
  const [sortKey, setSortKey] = useState("pcd");
  const [sortDir, setSortDir] = useState("asc");
  const [phaseFilter, setPhaseFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);
  const [tickerFilter, setTickerFilter] = useState(null);

  // Pre-compute Monte Carlo results for all watchlist trials once — keyed by NCT ID.
  // Running this in useMemo (not inline in the map) means clicks never block on simulation.
  const monteMap = useMemo(() => {
    if (!window.MONTE || !trials || !trials.length) return {};
    const map = {};
    trials.forEach(t => {
      try { map[t.id] = window.MONTE.getAnalysis(t); } catch (_) {}
    });
    return map;
  }, [trials]);

  const filtered = useMemo(() => {
    let t = trials || [];
    if (tickerFilter) t = t.filter(x => x.ticker === tickerFilter);
    if (phaseFilter)  t = t.filter(x => x.phase === phaseFilter);
    if (statusFilter) t = t.filter(x => x.status === statusFilter);
    t = [...t].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return t;
  }, [trials, tickerFilter, phaseFilter, statusFilter, sortKey, sortDir]);

  const onSort = (k) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };
  const arrow = (k) => sortKey === k ? <span className="sort">{sortDir === "asc" ? "▲" : "▼"}</span> : null;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "200px 1fr 300px",
      gridTemplateRows: "1fr 200px 200px",
      gap: 4,
      padding: 4,
      height: "100%",
      minHeight: 0,
    }}>
      {/* Watchlist — spans all rows */}
      <div style={{ gridRow: "1 / span 3", height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <WatchlistPanel
          watchlist={watchlist}
          trials={trials}
          selected={tickerFilter}
          onSelect={tk => setTickerFilter(prev => prev === tk ? null : tk)}
          onAdd={addToWatchlist}
          onRemove={removeFromWatchlist}
          onRefetch={onRefetch}
        />
      </div>

      {/* Trials table — spans rows 1-2 */}
      <div style={{ gridRow: "1 / span 2", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Panel
          style={{ flex: 1, minHeight: 0 }}
          title={"TRIALS · " + filtered.length + (tickerFilter ? " · " + tickerFilter : " · WATCHLIST")}
          right={
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {tickerFilter && (
                <span style={{ color: "var(--accent)", fontSize: 9, cursor: "pointer", marginRight: 4 }}
                      onClick={() => setTickerFilter(null)}>CLEAR ✕</span>
              )}
              <FilterChips label="P" value={phaseFilter} setValue={setPhaseFilter}
                options={["1", "1/2", "1b", "2", "2b", "3"]} />
              <FilterChips label="ST" value={statusFilter} setValue={setStatusFilter}
                options={["RECRUITING","ACTIVE_NE","NOT_YET","TERMINATED"]}
                labels={{RECRUITING:"REC",ACTIVE_NE:"ACT",NOT_YET:"PRE",TERMINATED:"TRM"}} />
            </span>
          }>
          <table className="tbl">
            <thead>
              <tr>
                <th onClick={() => onSort("ticker")} style={{ width: 52 }}>TK {arrow("ticker")}</th>
                <th onClick={() => onSort("drug")} style={{ width: 150 }}>DRUG {arrow("drug")}</th>
                <th onClick={() => onSort("phase")} style={{ width: 50 }}>PH {arrow("phase")}</th>
                <th onClick={() => onSort("indication")} style={{ width: 130 }}>INDICATION {arrow("indication")}</th>
                <th onClick={() => onSort("status")} style={{ width: 100 }}>STATUS {arrow("status")}</th>
                <th onClick={() => onSort("enrolled")} className="num" style={{ width: 90 }}>N {arrow("enrolled")}</th>
                <th onClick={() => onSort("pcd")} style={{ width: 90 }}>PCD {arrow("pcd")}</th>
                <th onClick={() => onSort("pos")} className="num" style={{ width: 50 }}>POS {arrow("pos")}</th>
                <th onClick={() => onSort("peakSales")} className="num" style={{ width: 70 }}>PEAK {arrow("peakSales")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const pct = (t.target && t.enrolled != null) ? t.enrolled / t.target : 0;
                const enrollDisplay = t.enrolled != null ? `${t.enrolled}/${t.target}` : `—/${t.target}`;
                const m     = monteMap[t.id];
                const mPos  = m ? m.pos       : (t.pos      || 0.25);
                const mPeak = m ? m.peakSales  : (t.peakSales || 300);
                const posColor = mPos > 0.55 ? "var(--green)" : mPos > 0.35 ? "var(--amber)" : "var(--red)";
                return (
                  <tr key={t.id}
                      className={selectedTrial === t.id ? "sel" : ""}
                      onClick={() => onSelectTrial(t.id)}>
                    <td className="tk">{t.ticker || "—"}</td>
                    <td title={t.title}>
                      <span style={{ color: "var(--text)" }}>{t.drug}</span>
                      <div className="dim" style={{ fontSize: 9, letterSpacing: 0.5 }}>{t.id}</div>
                    </td>
                    <td><PhasePill phase={t.phase} /></td>
                    <td className="dim" style={{ fontSize: 10 }}>{t.indication}</td>
                    <td><StatusPill status={t.status} /></td>
                    <td className="num">
                      <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                        <div style={{ width: 28, height: 3, background: "var(--panel-3)", border: "1px solid var(--border)" }}>
                          <div style={{ width: Math.round(pct * 100) + "%", height: "100%", background: pct >= 1 ? "var(--green)" : "var(--accent)" }}></div>
                        </div>
                        <span>{enrollDisplay}</span>
                      </div>
                    </td>
                    <td style={{ color: "var(--accent)" }}>{fmtDate(t.pcd)}</td>
                    <td className="num" style={{ color: posColor }}>{fmtPct(mPos, 0)}</td>
                    <td className="num">{fmtMoney(mPeak)}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 20, textAlign: "center", color: "var(--text-faint)" }}>
                  {trials.length === 0 ? "LOADING FROM CT.GOV…" : "NO TRIALS MATCH FILTERS"}
                </td></tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      {/* Alerts — row 1, right column */}
      <div style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Panel style={{ flex: 1, minHeight: 0 }} title="ALERTS · SEC 8-K · 90D"
               right={activityLoading
                 ? <span style={{ color:"var(--amber)" }}>⟳ FETCHING…</span>
                 : <span style={{ color:"var(--green)" }}>● LIVE</span>}>
          <WatchlistAlerts
            trials={trials} watchlist={watchlist}
            tickerFilter={tickerFilter} onSelectTicker={setTickerFilter}
            liveActivity={liveActivity} loading={activityLoading}
          />
        </Panel>
      </div>

      {/* Watchlist catalysts — row 2, right column */}
      <div style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Panel style={{ flex: 1, minHeight: 0 }} title="NEXT CATALYSTS · WATCHLIST" right={tickerFilter || "ALL"}>
          <UpcomingPanel trials={trials} tickerFilter={tickerFilter} onSelectTrial={onSelectTrial} label="watchlist" />
        </Panel>
      </div>

      {/* All upcoming catalysts — row 3, center + right */}
      <div style={{ gridColumn: "2 / span 2", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Panel style={{ flex: 1, minHeight: 0 }} title="ALL UPCOMING CATALYSTS · CT.GOV" right={allUpcoming.length + " programs"}>
          <AllUpcomingTable trials={allUpcoming} onSelectTrial={onSelectTrial} watchlist={watchlist} />
        </Panel>
      </div>
    </div>
  );
}

// ── Watchlist panel ──────────────────────────────────────────────────────────

function WatchlistPanel({ watchlist, trials, selected, onSelect, onAdd, onRemove, onRefetch }) {
  const [inputVal, setInputVal]     = useState("");
  const [err, setErr]               = useState("");
  // When a ticker has no known mapping, we ask the user for the company name
  const [pendingTicker, setPendingTicker] = useState(null);
  const [pendingName, setPendingName]     = useState("");

  const handleAdd = () => {
    const tk = inputVal.trim().toUpperCase();
    if (!tk) return;
    if (watchlist.includes(tk)) { setErr("already in watchlist"); return; }
    onAdd(tk);
    setInputVal("");
    setErr("");
    if (!window.CTAPI.isKnownTicker(tk)) {
      setPendingTicker(tk);
      setPendingName("");
    }
  };

  const handleSaveName = () => {
    const name = pendingName.trim();
    if (!pendingTicker || !name) { setPendingTicker(null); return; }
    window.CTAPI.saveCustomSponsor(pendingTicker, name);
    setPendingTicker(null);
    setPendingName("");
    if (onRefetch) onRefetch();   // re-run fetchTrialsForWatchlist with the new mapping
  };

  return (
    <Panel
      title={"WATCHLIST · " + watchlist.length}
      style={{ flex: 1, minHeight: 0 }}
      bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
      right={selected
        ? <span
            onClick={() => onSelect(selected)}
            style={{ color: "var(--accent)", cursor: "pointer", letterSpacing: 1, fontSize: 9, userSelect: "none" }}>
            CLEAR ✕
          </span>
        : <span style={{ color: "var(--text-faint)", fontSize: 8, letterSpacing: 0.5, userSelect: "none" }}>
            click row to filter
          </span>
      }
    >
      <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "4px 0" }}>
        {watchlist.map(tk => {
          const tkTrials = (trials || []).filter(t => t.ticker === tk);
          const hasUpcoming = tkTrials.some(t => t.catalyst && parseDate(t.catalyst.date) > new Date());
          return (
            <div key={tk}
                 onClick={() => onSelect(tk)}
                 style={{
                   display: "grid", gridTemplateColumns: "1fr auto auto",
                   alignItems: "center", gap: 6,
                   padding: "5px 8px",
                   borderBottom: "1px solid var(--border)",
                   background: selected === tk ? "var(--panel-3)" : "transparent",
                   cursor: "pointer",
                   borderLeft: selected === tk ? "2px solid var(--accent)" : "2px solid transparent",
                 }}>
              <div>
                <span className="tk" style={{ color: selected === tk ? "var(--accent)" : "var(--text)", fontWeight: 600, fontSize: 11 }}>{tk}</span>
                {hasUpcoming && <span style={{ marginLeft: 6, fontSize: 8, color: "var(--green)", letterSpacing: 1 }}>●</span>}
                <div style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: 0.5 }}>
                  {tkTrials.length} trial{tkTrials.length !== 1 ? "s" : ""}
                </div>
              </div>
              <span style={{ fontSize: 9, color: "var(--text-faint)" }}>{tkTrials.length > 0 ? fmtDate(tkTrials.sort((a,b) => (a.pcd||"").localeCompare(b.pcd||""))[0]?.pcd) : "—"}</span>
              <span onClick={e => { e.stopPropagation(); onRemove(tk); }}
                    style={{ color: "var(--text-faint)", fontSize: 10, cursor: "pointer", padding: "0 4px" }}
                    title="Remove">✕</span>
            </div>
          );
        })}
        {watchlist.length === 0 && (
          <div style={{ padding: "12px 8px", color: "var(--text-faint)", fontSize: 10 }}>Add tickers below</div>
        )}
      </div>

      {/* Company name prompt for tickers not in any map */}
      {pendingTicker && (
        <div style={{ flexShrink: 0, padding: "6px 8px", borderTop: "1px solid var(--border)", background: "color-mix(in srgb, var(--amber) 8%, var(--panel-2))" }}>
          <div style={{ fontSize: 9, color: "var(--amber)", marginBottom: 4, letterSpacing: 0.5, fontWeight: 600 }}>
            ⚠ {pendingTicker} NOT IN DATABASE
          </div>
          <div style={{ fontSize: 9, color: "var(--text-dim)", marginBottom: 4 }}>Enter CT.gov sponsor name:</div>
          <div style={{ display: "flex", gap: 4 }}>
            <input
              autoFocus
              value={pendingName}
              onChange={e => setPendingName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") handleSaveName(); if (e.key === "Escape") setPendingTicker(null); }}
              placeholder="e.g. Vera Therapeutics"
              style={{
                flex: 1, background: "var(--bg)", border: "1px solid var(--amber)",
                color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 10,
                padding: "3px 6px", outline: "none",
              }}
            />
            <button onClick={handleSaveName} style={{
              background: "var(--amber)", color: "#000", border: "none",
              fontFamily: "var(--font-mono)", fontSize: 9, padding: "3px 8px", cursor: "pointer", fontWeight: 700,
            }}>SAVE</button>
            <button onClick={() => setPendingTicker(null)} style={{
              background: "transparent", color: "var(--text-faint)", border: "1px solid var(--border)",
              fontFamily: "var(--font-mono)", fontSize: 9, padding: "3px 6px", cursor: "pointer",
            }}>✕</button>
          </div>
          <div style={{ fontSize: 8, color: "var(--text-faint)", marginTop: 3 }}>
            Saved permanently for this browser.
          </div>
        </div>
      )}

      <div style={{ flexShrink: 0, padding: "6px 8px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 4 }}>
          <input
            value={inputVal}
            onChange={e => { setInputVal(e.target.value.toUpperCase()); setErr(""); }}
            onKeyDown={e => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setInputVal(""); }}
            placeholder="ADD TICKER…"
            style={{
              flex: 1, background: "var(--panel-3)", border: "1px solid var(--border)",
              color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 10,
              padding: "3px 6px", outline: "none",
            }}
          />
          <button onClick={handleAdd} style={{
            background: "var(--accent)", color: "#000", border: "none",
            fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 8px", cursor: "pointer",
          }}>+</button>
        </div>
        {err && <div style={{ fontSize: 9, color: "var(--red)", marginTop: 3 }}>{err}</div>}
      </div>
    </Panel>
  );
}

// ── Alerts ───────────────────────────────────────────────────────────────────

function WatchlistAlerts({ trials, watchlist, tickerFilter, onSelectTicker, liveActivity, loading }) {
  const items = useMemo(() => {
    const wlSet = new Set(tickerFilter ? [tickerFilter] : watchlist);

    // Live SEC 8-K filings (primary source)
    const secItems = (liveActivity || [])
      .filter(a => wlSet.has(a.ticker))
      .map(a => ({
        dateStr: a.date,                                // "2025-03-14"
        t:       a.date ? a.date.slice(5) : '—',       // "03-14"
        ticker:  a.ticker,
        kind:    a.kind,
        msg:     a.msg,
        impact:  a.impact,
        url:     a.url,
      }));

    // CT.gov record updates as a supplemental fallback
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const ctItems = (trials || [])
      .filter(t => wlSet.has(t.ticker) && t.lastChange && new Date(t.lastChange) > cutoff)
      .sort((a, b) => (b.lastChange || '').localeCompare(a.lastChange || ''))
      .slice(0, 4)
      .map(t => ({
        dateStr: t.lastChange || '',
        t:       t.lastChange ? t.lastChange.slice(5) : '—',
        ticker:  t.ticker,
        kind:    'CT.GOV',
        msg:     t.drug + ' — CT.gov record updated',
        impact:  'NEU',
        url:     'https://clinicaltrials.gov/study/' + t.id,
      }));

    // Merge, deduplicate by date+ticker, sort newest first
    const all = [...secItems, ...ctItems]
      .sort((a, b) => b.dateStr.localeCompare(a.dateStr))
      .slice(0, 20);
    return all;
  }, [liveActivity, trials, watchlist, tickerFilter]);

  // Kind → colour
  const kindColor = k => ({
    UPDATE:     'var(--accent)',
    DISCLOSURE: 'var(--blue,#5599ff)',
    AGREEMENT:  'var(--green)',
    EARNINGS:   'var(--amber)',
    LEADERSHIP: 'var(--text-dim)',
    TERMINATION:'var(--red)',
    'M&A':      'var(--green)',
    DELISTING:  'var(--red)',
    GOVERNANCE: 'var(--text-dim)',
    VOTE:       'var(--text-dim)',
    'CT.GOV':   'var(--text-faint)',
    FILING:     'var(--text-faint)',
  })[k] || 'var(--accent)';

  if (loading && !items.length) {
    return (
      <div style={{ padding: '16px 12px', color: 'var(--text-faint)', fontSize: 10, letterSpacing: 1 }}>
        ⟳ FETCHING SEC FILINGS…
      </div>
    );
  }

  return (
    <div style={{ padding: 0 }}>
      {items.map((a, i) => (
        <div key={i}
             style={{
               display: 'grid', gridTemplateColumns: '38px 36px 52px 1fr',
               gap: 4, padding: '4px 8px',
               borderBottom: '1px solid var(--border)',
               fontSize: 10, alignItems: 'start',
             }}>
          {/* Date */}
          <span style={{ color: 'var(--text-faint)', fontSize: 9, paddingTop: 1 }}>{a.t}</span>
          {/* Ticker */}
          <span onClick={() => onSelectTicker(a.ticker)}
                style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 10, cursor: 'pointer' }}>
            {a.ticker}
          </span>
          {/* Kind badge */}
          <span style={{ color: kindColor(a.kind), fontSize: 8, letterSpacing: 0.5,
                         paddingTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {a.kind}
          </span>
          {/* Message + SEC link */}
          <span style={{ color: 'var(--text-dim)', lineHeight: 1.4 }}>
            {a.msg}
            {a.url && (
              <a href={a.url} target="_blank" rel="noopener"
                 onClick={e => e.stopPropagation()}
                 style={{ color: 'var(--text-faint)', fontSize: 8, marginLeft: 5,
                          textDecoration: 'none', letterSpacing: 0.5 }}>
                SEC ↗
              </a>
            )}
          </span>
        </div>
      ))}
      {!loading && items.length === 0 && (
        <div style={{ padding: 12, color: 'var(--text-faint)', fontSize: 10 }}>
          No SEC filings in the last 90 days.
        </div>
      )}
    </div>
  );
}

// ── Watchlist upcoming catalysts ──────────────────────────────────────────────

function UpcomingPanel({ trials, onSelectTrial, tickerFilter }) {
  const now = new Date();
  const items = useMemo(() => {
    let list = (trials || [])
      .filter(t => t.catalyst && parseDate(t.catalyst.date) > now)
      .filter(t => !tickerFilter || t.ticker === tickerFilter)
      .sort((a, b) => parseDate(a.catalyst.date) - parseDate(b.catalyst.date));
    return list.slice(0, 5);
  }, [trials, tickerFilter]);

  return (
    <div style={{ padding: 0 }}>
      {items.map(t => {
        const d = parseDate(t.catalyst.date);
        const daysOut = Math.round((d - now) / (1000 * 60 * 60 * 24));
        const c = ({ PIVOTAL:"var(--red)", TOPLINE:"var(--accent)", INTERIM:"var(--amber)", UPDATE:"var(--blue)", ASCO:"var(--violet)", READ:"var(--text-dim)", FPI:"var(--cyan)" })[t.catalyst.kind] || "var(--accent)";
        return (
          <div key={t.id} onClick={() => onSelectTrial(t.id)}
               style={{ display: "grid", gridTemplateColumns: "40px 1fr 60px", gap: 8, padding: "5px 8px", borderBottom: "1px solid var(--border)", cursor: "pointer", fontSize: 10, alignItems: "center" }}>
            <div style={{ color: daysOut < 90 ? "var(--accent)" : "var(--text-dim)", textAlign: "right" }}>
              <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1 }}>{daysOut < 0 ? 0 : daysOut}</div>
              <div style={{ fontSize: 8, color: "var(--text-faint)", letterSpacing: 1 }}>DAYS</div>
            </div>
            <div>
              <div><span className="tk" style={{ color: "var(--accent)", fontWeight: 600 }}>{t.ticker || "—"}</span> <span style={{ color: "var(--text)" }}>{t.drug}</span></div>
              <div style={{ color: c, fontSize: 9 }}>{t.catalyst.kind} · {t.indication}</div>
            </div>
            <div style={{ textAlign: "right", color: "var(--text-dim)", fontSize: 9 }}>{fmtDate(t.catalyst.date)}</div>
          </div>
        );
      })}
      {items.length === 0 && (
        <div style={{ padding: 10, color: "var(--text-faint)", fontSize: 10 }}>No upcoming catalysts.</div>
      )}
    </div>
  );
}

// ── All upcoming catalysts (from CT.gov broad fetch) ──────────────────────────

function AllUpcomingTable({ trials, onSelectTrial, watchlist }) {
  const now = new Date();
  const wlSet = new Set(watchlist || []);
  const items = useMemo(() => {
    return (trials || [])
      .filter(t => t.pcd && parseDate(t.pcd) > now)
      .sort((a, b) => (a.pcd || "").localeCompare(b.pcd || ""))
      .slice(0, 50);
  }, [trials]);

  if (!items.length) return (
    <div style={{ padding: 12, color: "var(--text-faint)", fontSize: 10 }}>Loading upcoming catalysts from CT.gov…</div>
  );

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 50 }}>TK</th>
            <th style={{ width: 150 }}>DRUG</th>
            <th style={{ width: 50 }}>PH</th>
            <th>INDICATION</th>
            <th style={{ width: 110 }}>STATUS</th>
            <th style={{ width: 90 }}>PCD</th>
            <th style={{ width: 60 }}>NCT ID</th>
          </tr>
        </thead>
        <tbody>
          {items.map(t => (
            <tr key={t.id}
                onClick={() => onSelectTrial(t.id)}
                style={{ opacity: wlSet.has(t.ticker) ? 1 : 0.7 }}>
              <td className="tk" style={{ color: wlSet.has(t.ticker) ? "var(--accent)" : "var(--text-dim)" }}>
                {t.ticker || <span style={{ color: "var(--text-faint)", fontSize: 9 }}>{t.sponsor?.split(" ")[0]?.slice(0,6)}</span>}
                {wlSet.has(t.ticker) && <span style={{ marginLeft: 3, fontSize: 8, color: "var(--green)" }}>●</span>}
              </td>
              <td style={{ color: "var(--text)" }}>{t.drug}</td>
              <td><PhasePill phase={t.phase} /></td>
              <td className="dim" style={{ fontSize: 10 }}>{t.indication}</td>
              <td><StatusPill status={t.status} /></td>
              <td style={{ color: "var(--accent)" }}>{fmtDate(t.pcd)}</td>
              <td className="dim" style={{ fontSize: 9 }}>{t.id}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Filter chips ──────────────────────────────────────────────────────────────

function FilterChips({ label, value, setValue, options, labels }) {
  return (
    <span style={{ display: "flex", gap: 2, alignItems: "center" }}>
      <span style={{ color: "var(--text-faint)", fontSize: 9, marginRight: 2 }}>{label}</span>
      {options.map(o => (
        <button key={o}
                onClick={() => setValue(value === o ? null : o)}
                style={{
                  background: value === o ? "var(--accent)" : "transparent",
                  color: value === o ? "#000" : "var(--text-dim)",
                  border: "1px solid " + (value === o ? "var(--accent)" : "var(--border)"),
                  fontSize: 9, padding: "1px 5px", cursor: "pointer",
                  fontFamily: "var(--font-mono)", letterSpacing: 0.5
                }}>
          {labels ? labels[o] : o}
        </button>
      ))}
    </span>
  );
}

window.TrialTracker = TrialTracker;
