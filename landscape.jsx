/* landscape.jsx — Competitive Landscape */

function CompetitiveLandscape({ trials, view, onSelectTrial }) {
  // Derive indications from watchlist trials, sorted by trial count desc
  const watchlistIndications = useMemo(() => {
    const t = trials || [];
    const inds = [...new Set(t.map(x => x.indication).filter(Boolean))];
    inds.sort((a, b) => {
      const ca = t.filter(x => x.indication === a).length;
      const cb = t.filter(x => x.indication === b).length;
      return cb - ca;
    });
    return inds;
  }, [trials]);

  const [selInd,          setSelInd]          = useState("");
  const [competitorTrials, setCompetitorTrials] = useState([]);
  const [loadingInd,      setLoadingInd]      = useState(false);
  const [customInd,       setCustomInd]       = useState("");

  // Auto-select first indication when watchlist loads
  useEffect(() => {
    if (watchlistIndications.length > 0 && !watchlistIndications.includes(selInd)) {
      setSelInd(watchlistIndications[0]);
    }
  }, [watchlistIndications]);

  // Fetch competitors from CT.gov whenever indication changes
  useEffect(() => {
    if (!selInd) { setCompetitorTrials([]); return; }
    setLoadingInd(true);
    window.CTAPI.fetchTrialsByIndication(selInd, { pageSize: 100 })
      .then(fetched => { setCompetitorTrials(fetched); setLoadingInd(false); })
      .catch(() => {
        setCompetitorTrials((trials || []).filter(t => t.indication === selInd));
        setLoadingInd(false);
      });
  }, [selInd]);

  // Merge CT.gov results with any watchlist trials not already included
  const allTrialsForInd = useMemo(() => {
    const seen = new Set(competitorTrials.map(t => t.id));
    const wlExtra = (trials || []).filter(t => t.indication === selInd && !seen.has(t.id));
    return [...competitorTrials, ...wlExtra];
  }, [competitorTrials, trials, selInd]);

  const handleCustomSearch = () => {
    const q = customInd.trim();
    if (!q) return;
    setSelInd(q);
    setCustomInd("");
  };

  // Is the current selInd a custom (non-watchlist) query?
  const isCustom = selInd && !watchlistIndications.includes(selInd);

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      padding: 4, gap: 4,
      height: "100%", minHeight: 0,
    }}>

      {/* ── Top control bar ──────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        background: "var(--panel-2)", border: "1px solid var(--border)",
        padding: "5px 10px",
      }}>
        <span style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--text-faint)", flexShrink: 0 }}>
          INDICATION
        </span>

        {/* ── Dropdown ─────────────────────────────────────── */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <select
            value={selInd}
            onChange={e => setSelInd(e.target.value)}
            style={{
              appearance: "none", WebkitAppearance: "none",
              background: "var(--panel-3)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              fontFamily: "var(--font-mono)", fontSize: 10,
              padding: "3px 28px 3px 8px",
              outline: "none", cursor: "pointer",
              minWidth: 220,
            }}>
            {watchlistIndications.map(ind => (
              <option key={ind} value={ind} style={{ background: "var(--panel-3)", color: "var(--text)" }}>
                {ind}  ({(trials || []).filter(t => t.indication === ind).length})
              </option>
            ))}
            {/* Show custom entry in dropdown while it's active */}
            {isCustom && (
              <option value={selInd} style={{ background: "var(--panel-3)", color: "var(--accent)" }}>
                {selInd}  (custom)
              </option>
            )}
          </select>
          {/* Custom caret */}
          <span style={{
            position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)",
            color: "var(--text-faint)", fontSize: 8, pointerEvents: "none",
          }}>▼</span>
        </div>

        {/* ── Divider ──────────────────────────────────────── */}
        <span style={{ width: 1, height: 16, background: "var(--border)", flexShrink: 0 }} />

        {/* ── Custom-indication search ──────────────────── */}
        <input
          value={customInd}
          onChange={e => setCustomInd(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleCustomSearch(); }}
          placeholder="search any indication…"
          style={{
            background: "var(--panel-3)", border: "1px solid var(--border)",
            color: "var(--text)", fontFamily: "var(--font-mono)", fontSize: 9,
            padding: "3px 7px", outline: "none", width: 170,
          }}
        />
        <button
          onClick={handleCustomSearch}
          style={{
            background: "var(--accent)", color: "#000", border: "none",
            fontFamily: "var(--font-mono)", fontSize: 9,
            padding: "3px 10px", cursor: "pointer", fontWeight: 700, flexShrink: 0,
          }}>GO</button>

        {/* Clear custom */}
        {isCustom && (
          <span
            onClick={() => { setSelInd(watchlistIndications[0] || ""); }}
            style={{ fontSize: 9, color: "var(--accent)", cursor: "pointer", letterSpacing: 1 }}>
            ✕ CLEAR
          </span>
        )}

        <span style={{ flex: 1 }} />

        {/* ── Stats ────────────────────────────────────────── */}
        <span style={{
          fontSize: 9, letterSpacing: 1,
          color: loadingInd ? "var(--amber)" : "var(--text-faint)",
          flexShrink: 0,
        }}>
          {loadingInd
            ? "● FETCHING CT.GOV…"
            : allTrialsForInd.length + " PROGRAMS · " + new Set(allTrialsForInd.map(t => t.sponsor)).size + " SPONSORS"}
        </span>
      </div>

      {/* ── Pipeline panel (fills remaining height, scrolls inside) ── */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <Panel
          style={{ flex: 1, minHeight: 0 }}
          title={"PIPELINE · " + (selInd || "—")}
          right={
            <span style={{ fontSize: 9, color: "var(--text-faint)", letterSpacing: 1 }}>
              {view === "card" ? "CARD VIEW" : "TABLE VIEW"}
            </span>
          }>
          {view === "card"
            ? <PipelineCards trials={allTrialsForInd} onSelectTrial={onSelectTrial} />
            : <PipelineTable trials={allTrialsForInd} onSelectTrial={onSelectTrial} />
          }
        </Panel>
      </div>
    </div>
  );
}

// ── Card grid ────────────────────────────────────────────────────────────────

function PipelineCards({ trials, onSelectTrial }) {
  if (!trials.length) {
    return (
      <div style={{ padding: 20, color: "var(--text-faint)", fontSize: 10, letterSpacing: 1 }}>
        NO TRIALS IN INDICATION
      </div>
    );
  }
  return (
    <div className="pipe-grid">
      {trials.map(t => {
        const phaseIdx = { "1":1, "1/2":2, "1b":2, "early 1":1, "2":3, "2b":3, "3":4 }[t.phase] || 1;
        const m       = window.MONTE ? window.MONTE.getAnalysis(t) : null;
        const mPos    = m ? m.pos       : (t.pos       || 0.25);
        const mPeak   = m ? m.peakSales : (t.peakSales || 300);
        const posColor = mPos > 0.55 ? "var(--green)" : mPos > 0.35 ? "var(--amber)" : "var(--red)";
        return (
          <div key={t.id} className="pipe-card" onClick={() => onSelectTrial(t.id)}>
            <div className="head">
              <span className="tk">{t.ticker || t.sponsor?.split(" ")[0]?.slice(0, 5) || "—"}</span>
              <span className="drug">{t.drug}</span>
              <span className="right"><PhasePill phase={t.phase} /></span>
            </div>
            <div className="ind">{t.title}</div>
            <div className="pbar">
              {["PC","P1","P2","P3","FILE"].map((lbl, i) => (
                <div key={i} className={"seg " + (i < phaseIdx ? "on" : "")} title={lbl} />
              ))}
            </div>
            <div className="meta">
              <span><StatusPill status={t.status} /></span>
              <span>N <b>{t.enrolled != null ? `${t.enrolled}/${t.target}` : `—/${t.target}`}</b></span>
              <span>PCD <b style={{ color: "var(--accent)" }}>{fmtDate(t.pcd)}</b></span>
              <span>POS <b style={{ color: posColor }}>{fmtPct(mPos, 0)}</b></span>
              <span>PEAK <b>{fmtMoney(mPeak)}</b></span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Table view ───────────────────────────────────────────────────────────────

function PipelineTable({ trials, onSelectTrial }) {
  if (!trials.length) {
    return (
      <div style={{ padding: 20, color: "var(--text-faint)", fontSize: 10, letterSpacing: 1 }}>
        NO TRIALS IN INDICATION
      </div>
    );
  }

  return (
    <div>
      <table className="tbl">
        <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--panel-2)" }}>
          <tr>
            <th style={{ width: 60 }}>TK</th>
            <th style={{ width: 170 }}>DRUG / SPONSOR</th>
            <th style={{ width: 58 }}>PHASE</th>
            <th style={{ width: 100 }}>STATUS</th>
            <th>TITLE</th>
            <th className="num" style={{ width: 90 }}>N</th>
            <th style={{ width: 88 }}>PCD</th>
            <th className="num" style={{ width: 56 }}>POS</th>
            <th className="num" style={{ width: 66 }}>PEAK</th>
          </tr>
        </thead>
        <tbody>
          {trials.map(t => {
            const pct      = (t.target && t.enrolled != null) ? t.enrolled / t.target : 0;
            const m        = window.MONTE ? window.MONTE.getAnalysis(t) : null;
            const mPos     = m ? m.pos       : (t.pos       || 0.25);
            const mPeak    = m ? m.peakSales : (t.peakSales || 300);
            const posColor = mPos > 0.55 ? "var(--green)" : mPos > 0.35 ? "var(--amber)" : "var(--red)";
            return (
              <tr key={t.id} onClick={() => onSelectTrial(t.id)}>
                <td className="tk">
                  {t.ticker
                    ? t.ticker
                    : <span style={{ color: "var(--text-faint)", fontSize: 9 }}>
                        {t.sponsor?.split(" ")[0]?.slice(0, 6)}
                      </span>}
                </td>
                <td>
                  <div style={{ color: "var(--text)" }}>{t.drug}</div>
                  <div className="dim" style={{ fontSize: 9 }}>{t.sponsor}</div>
                </td>
                <td><PhasePill phase={t.phase} /></td>
                <td><StatusPill status={t.status} /></td>
                <td className="dim truncate" title={t.title}>{t.title}</td>
                <td className="num">
                  <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end" }}>
                    <div style={{ width: 32, height: 4, background: "var(--panel-3)", border: "1px solid var(--border)" }}>
                      <div style={{ width: Math.round(pct * 100) + "%", height: "100%",
                                    background: pct >= 1 ? "var(--green)" : "var(--accent)" }} />
                    </div>
                    <span>{t.enrolled != null ? `${t.enrolled}/${t.target}` : `—/${t.target}`}</span>
                  </div>
                </td>
                <td style={{ color: "var(--accent)" }}>{fmtDate(t.pcd)}</td>
                <td className="num" style={{ color: posColor }}>{fmtPct(mPos, 0)}</td>
                <td className="num">{fmtMoney(mPeak)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Phase lanes — below the scrollable table, sticky at nothing, just extra context */}
      <PhaseLanes trials={trials} onSelectTrial={onSelectTrial} />
    </div>
  );
}

// ── Phase-lane summary (below table) ────────────────────────────────────────

function PhaseLanes({ trials, onSelectTrial }) {
  const lanes = [
    { phases: ["1", "1/2", "1b", "early 1"], label: "PRECLIN / PHASE 1" },
    { phases: ["2", "2b"],                    label: "PHASE 2" },
    { phases: ["3"],                           label: "PHASE 3 / REG" },
  ];
  const hasAny = lanes.some(l => l.phases.some(p => trials.some(t => t.phase === p)));
  if (!hasAny) return null;

  return (
    <div style={{
      display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
      gap: 4, padding: 8, borderTop: "1px solid var(--border)",
    }}>
      {lanes.map(l => {
        const inLane = trials.filter(t => l.phases.includes(t.phase));
        return (
          <div key={l.label} style={{
            background: "var(--panel-2)", border: "1px solid var(--border)", padding: 6,
          }}>
            <div style={{ fontSize: 9, letterSpacing: 1.5, color: "var(--accent)", marginBottom: 6 }}>
              {l.label}
              <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>({inLane.length})</span>
            </div>
            {inLane.length === 0
              ? <div style={{ color: "var(--text-faint)", fontSize: 10, padding: 4 }}>—</div>
              : inLane.map(t => (
                  <div key={t.id}
                       onClick={() => onSelectTrial(t.id)}
                       style={{
                         display: "flex", gap: 6, padding: "3px 4px",
                         borderBottom: "1px solid var(--border)",
                         cursor: "pointer", fontSize: 10,
                       }}>
                    <span style={{ color: "var(--accent)", fontWeight: 600, minWidth: 36 }}>
                      {t.ticker || t.sponsor?.split(" ")[0]?.slice(0, 5)}
                    </span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {t.drug}
                    </span>
                    <span style={{ color: "var(--text-faint)", fontSize: 9, flexShrink: 0 }}>
                      {fmtDate(t.pcd)}
                    </span>
                  </div>
                ))
            }
          </div>
        );
      })}
    </div>
  );
}

window.CompetitiveLandscape = CompetitiveLandscape;
