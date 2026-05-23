/* scenmodel.jsx — Scenario Modeler: Python Monte Carlo + DCF Engine */

const API = '';   // same-origin — served by scenario_api.py on port 5002

function ScenarioModeler({ trials, initialTrialId, onSelectTrial }) {
  // ── Trial selection ────────────────────────────────────────────────────────
  const allTrials = useMemo(() => trials || [], [trials]);
  const [trialId, setTrialId] = useState(initialTrialId || allTrials[0]?.id || null);
  const [trialSearch, setTrialSearch] = useState('');
  useEffect(() => { if (!trialId && allTrials.length > 0) setTrialId(allTrials[0].id); }, [allTrials.length]);
  useEffect(() => { if (initialTrialId) setTrialId(initialTrialId); }, [initialTrialId]);
  const trial = useMemo(() => allTrials.find(t => t.id === trialId), [allTrials, trialId]);

  // Filter trials by search query — matches ticker, sponsor, drug, indication, NCT ID
  const filteredTrials = useMemo(() => {
    const q = trialSearch.trim().toLowerCase();
    if (!q) return allTrials;
    return allTrials.filter(t => {
      const hay = [t.ticker, t.drug, t.indication, t.id, t.sponsor, t.title]
        .filter(Boolean).join(' ').toLowerCase();
      return q.split(/\s+/).every(w => hay.includes(w));
    });
  }, [allTrials, trialSearch]);

  // ── Input assumptions ──────────────────────────────────────────────────────
  const [pos,        setPos]        = useState(30);   // %
  const [peak,       setPeak]       = useState(500);  // $M
  const [wacc,       setWacc]       = useState(12);   // %
  const [cogs,       setCogs]       = useState(20);   // %
  const [opex,       setOpex]       = useState(30);   // %
  const [taxRate,    setTaxRate]    = useState(21);   // %
  const [rampYears,  setRampYears]  = useState(3);    // years
  const [launchYear, setLaunchYear] = useState(2028);
  const [patExpiry,  setPatExpiry]  = useState(2040);
  const [shares,     setShares]     = useState(80);   // M shares
  const [cash,       setCash]       = useState(null); // $M — from SEC
  const [debt,       setDebt]       = useState(null); // $M — from SEC
  const [finSrc,     setFinSrc]     = useState(null); // SEC attribution
  const [finLoad,    setFinLoad]    = useState(false);
  const [nSim,       setNSim]       = useState(10000);

  // ── API / Python state ─────────────────────────────────────────────────────
  const [pyRes,     setPyRes]     = useState(null);
  const [pyLoading, setPyLoading] = useState(false);
  const [pyError,   setPyError]   = useState(null);
  const [apiOk,     setApiOk]     = useState(null);   // null=unknown true/false

  // ── JS quick-sim state (legacy, for instant preview) ──────────────────────
  const [seed,    setSeed]   = useState(7);
  const [margin,  setMargin] = useState(72);   // op margin %  (approx 1-cogs-opex)
  const [royalty, setRoyalty]= useState(0);

  // Sync margin from cogs/opex
  useEffect(() => { setMargin(Math.max(5, 100 - cogs - opex)); }, [cogs, opex]);

  // ── Seed inputs from Monte Carlo engine when trial changes ─────────────────
  useEffect(() => {
    if (!trial) return;
    const m = window.MONTE ? window.MONTE.getAnalysis(trial) : null;
    setPos(m ? Math.round(m.pos * 100) : Math.round((trial.pos || 0.25) * 100));
    setPeak(m ? Math.round(m.peakSales) : (trial.peakSales || 300));
    const pcdYear = trial.pcd && trial.pcd.length >= 4 ? parseInt(String(trial.pcd).slice(0,4)) : 2027;
    setLaunchYear(pcdYear + 2);
    setPatExpiry(pcdYear + 14);
    setPyRes(null);
    setPyError(null);

    // ── Pull financials from SEC EDGAR (via Flask proxy) ────────────────────
    if (trial.ticker) {
      setFinLoad(true);
      setFinSrc(null);
      fetch(`${API}/api/sec/financials/${encodeURIComponent(trial.ticker)}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return;
          if (d.shares_m) setShares(d.shares_m);
          setCash(d.cash_m ?? null);
          setDebt(d.debt_m ?? null);
          if (d.source) setFinSrc(d.source);
        })
        .catch(() => {})
        .finally(() => setFinLoad(false));
    }
  }, [trial && trial.id]);

  // ── API health check ───────────────────────────────────────────────────────
  useEffect(() => {
    fetch(API + '/health', { signal: AbortSignal.timeout(2500) })
      .then(r => r.ok ? setApiOk(true) : setApiOk(false))
      .catch(() => setApiOk(false));
  }, []);

  // ── Run Python engine ──────────────────────────────────────────────────────
  const runPython = async () => {
    setPyLoading(true);
    setPyError(null);
    try {
      const body = {
        pos:           pos / 100,
        peak_sales:    peak,
        launch_year:   launchYear,
        patent_expiry: patExpiry,
        wacc:          wacc / 100,
        ramp_years:    rampYears,
        cogs_pct:      cogs / 100,
        opex_pct:      opex / 100,
        tax_rate:      taxRate / 100,
        n_sim:         nSim,
        current_year:  2026,
      };
      const resp = await fetch(API + '/api/scenario/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setPyRes(await resp.json());
      setApiOk(true);
    } catch (e) {
      setPyError(e.message);
      if (e.message.includes('fetch') || e.message.includes('network')) setApiOk(false);
    } finally {
      setPyLoading(false);
    }
  };

  // ── JS quick simulation (mulberry32 RNG, deterministic) ───────────────────
  const rng32 = (s) => () => {
    s |= 0; s = (s + 0x6D2B79F5)|0;
    let t = Math.imul(s ^ (s>>>15), 1|s);
    t = (t + Math.imul(t ^ (t>>>7), 61|t)) ^ t;
    return ((t ^ (t>>>14)) >>> 0) / 4294967296;
  };
  const jsSimulate = (overrides = {}) => {
    const p   = (overrides.pos ?? pos) / 100;
    const pk  = overrides.peak ?? peak;
    const dr  = (overrides.wacc ?? wacc) / 100;
    const mg  = (overrides.margin ?? margin) / 100;
    const rmp = overrides.rampYears ?? rampYears;
    const roy = (overrides.royalty ?? royalty) / 100;
    const ly  = overrides.launchYear ?? launchYear;
    const N   = Math.min(nSim, 3000);
    const ytl = ly - 2026;
    const loe = patExpiry - launchYear;
    let rState = seed * 1000 + Math.floor(p * 100);
    const npvs = [];
    for (let i = 0; i < N; i++) {
      const r = rng32(rState + i);
      const success = r() < p;
      let npv = 0;
      if (success) {
        const u1 = Math.max(1e-6, r()); const u2 = r();
        const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        const pkDraw = pk * Math.exp(0.5 * z - 0.125);
        for (let y = 1; y <= Math.max(1, loe); y++) {
          const t_ = y / rmp;
          let frac = t_ <= 1 ? 1/(1+Math.exp(-6*(t_-0.5))) : (y >= loe - 1 ? 0.45 : 1.0);
          const cf = pkDraw * frac * mg * (1 - roy);
          const yr = ytl + y - 1;
          npv += cf / Math.pow(1 + dr, Math.max(0.1, yr));
        }
      }
      npvs.push(npv);
    }
    npvs.sort((a,b) => a-b);
    const mean = npvs.reduce((s,v)=>s+v,0)/npvs.length;
    const med  = npvs[Math.floor(npvs.length * 0.50)];
    const p10  = npvs[Math.floor(npvs.length * 0.10)];
    const p90  = npvs[Math.floor(npvs.length * 0.90)];
    const pPos = npvs.filter(v => v > 0).length / npvs.length;
    return { npvs, mean, med, p10, p90, pPos };
  };
  const jsSim = useMemo(jsSimulate, [trialId, pos, peak, wacc, margin, rampYears, royalty, launchYear, patExpiry, nSim, seed]);

  if (!trial) {
    return (
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100%", color:"var(--text-faint)", fontSize:11, letterSpacing:2 }}>
        {allTrials.length === 0 ? "NO TRIALS LOADED" : "SELECT A TRIAL FROM THE WATCHLIST"}
      </div>
    );
  }

  return (
    <div style={{ display:"grid", gridTemplateColumns:"270px 1fr", height:"100%", minHeight:0, gap:4, padding:4 }}>
      {/* ── LEFT: inputs ─────────────────────────────────────────────────── */}
      <div style={{ display:"flex", flexDirection:"column", minHeight:0, overflow:"hidden" }}>
        {/* Scrollable inputs area */}
        <div style={{ flex:1, minHeight:0, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
        {/* Trial picker */}
        <div className="panel" style={{ flexShrink:0 }}>
          <div className="panel-header" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>TRIAL SELECTION</span>
            <span style={{ color:"var(--text-faint)", fontSize:9, fontWeight:400, letterSpacing:1 }}>
              {trialSearch ? `${filteredTrials.length} / ${allTrials.length}` : `${allTrials.length} trials`}
            </span>
          </div>
          <div style={{ padding:"4px 6px 6px" }}>
            {/* Search box */}
            <input
              type="text"
              value={trialSearch}
              onChange={e => setTrialSearch(e.target.value)}
              placeholder="ticker · NCT ID · drug · indication…"
              style={{
                width:"100%", boxSizing:"border-box",
                background:"var(--panel-3)", border:"1px solid var(--border)",
                color:"var(--text)", fontFamily:"var(--font-mono)", fontSize:10,
                padding:"4px 7px", letterSpacing:0.5, outline:"none",
              }}
            />
            {/* Scrollable results list */}
            <div style={{ maxHeight:170, overflowY:"auto", marginTop:4, display:"flex", flexDirection:"column", gap:1 }}>
              {filteredTrials.length === 0 ? (
                <div style={{ fontSize:9, color:"var(--text-faint)", textAlign:"center", padding:"10px 0", letterSpacing:1 }}>
                  NO MATCH
                </div>
              ) : filteredTrials.slice(0, 300).map(c => {
                const sel = c.id === trialId;
                return (
                  <div key={c.id}
                       onClick={() => { setTrialId(c.id); setTrialSearch(''); }}
                       style={{
                         display:"flex", alignItems:"center", gap:5, padding:"3px 6px",
                         cursor:"pointer", userSelect:"none",
                         background: sel ? "var(--accent)" : "transparent",
                         borderLeft: sel ? "2px solid var(--accent)" : "2px solid transparent",
                       }}
                       onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--panel-3)"; }}
                       onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ fontSize:9, fontWeight:700, letterSpacing:1, minWidth:30,
                                   color: sel ? "#000" : "var(--accent)" }}>
                      {c.ticker}
                    </span>
                    <PhasePill phase={c.phase} style={{ flexShrink:0 }} />
                    <span style={{ fontSize:9, flex:1, overflow:"hidden", textOverflow:"ellipsis",
                                   whiteSpace:"nowrap", color: sel ? "#000" : "var(--text)" }}>
                      {c.drug}
                    </span>
                    <span style={{ fontSize:8, color: sel ? "rgba(0,0,0,0.55)" : "var(--text-faint)",
                                   flexShrink:0, maxWidth:60, overflow:"hidden", textOverflow:"ellipsis",
                                   whiteSpace:"nowrap" }}>
                      {c.indication}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Selected trial card */}
            {trial && (
              <div onClick={() => onSelectTrial(trial.id)}
                   style={{ background:"var(--panel-2)", border:"1px solid var(--border)",
                            padding:"6px 8px", cursor:"pointer", marginTop:5 }}>
                <div style={{ fontSize:9, color:"var(--text-faint)", letterSpacing:0.5 }}>{trial.id}</div>
                <div style={{ color:"var(--text)", fontSize:12, fontWeight:600, margin:"2px 0" }}>
                  <span style={{ color:"var(--accent)" }}>{trial.ticker}</span> · {trial.drug}
                </div>
                <div style={{ fontSize:9, color:"var(--text-dim)" }}>
                  <PhasePill phase={trial.phase} /> {trial.indication}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Input assumptions panel */}
        <div className="panel" style={{ flexShrink:0 }}>
          <div className="panel-header">ASSUMPTIONS</div>
          <div style={{ padding:"6px 8px" }}>
            <ScenSection label="PROBABILITY" />
            <ScenSlider label="PoS — trial success" v={pos} setV={setPos} min={1} max={99} unit="%" />

            <ScenSection label="COMMERCIAL" />
            <ScenNumInput label="Peak Sales ($M)" v={peak} setV={setPeak} min={0} step={50} />
            <ScenSlider   label="Ramp to peak" v={rampYears} setV={setRampYears} min={1} max={10} unit=" yrs" />
            <ScenNumInput label="Launch Year" v={launchYear} setV={setLaunchYear} min={2025} max={2035} step={1} />
            <ScenNumInput label="Patent Expiry" v={patExpiry} setV={setPatExpiry} min={2030} max={2050} step={1} />

            <ScenSection label="COST STRUCTURE" />
            <ScenSlider label="COGS" v={cogs} setV={setCogs} min={5}  max={60} unit="%" />
            <ScenSlider label="OpEx / SGA" v={opex} setV={setOpex} min={5}  max={70} unit="%" />
            <div style={{ fontSize:9, color:"var(--text-faint)", letterSpacing:0.5, marginBottom:4, paddingLeft:2 }}>
              Op margin ≈ {Math.max(0, 100 - cogs - opex)}%
            </div>
            <ScenSlider label="Tax Rate" v={taxRate} setV={setTaxRate} min={5}  max={40} unit="%" />

            <ScenSection label="VALUATION" />
            <ScenSlider   label="WACC" v={wacc} setV={setWacc} min={6} max={25} unit="%" />
            <ScenNumInput label={finLoad ? "Shares Out (M) ⟳" : "Shares Out (M)"} v={shares} setV={v => { setShares(v); setFinSrc(null); }} min={1} step={5} />

            <ScenSection label="BALANCE SHEET  (SEC EDGAR)" />
            {finLoad && (
              <div style={{ fontSize:9, color:"var(--text-faint)", letterSpacing:1, padding:"4px 2px" }}>⟳ fetching from SEC…</div>
            )}
            {!finLoad && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"3px 8px", marginBottom:4 }}>
                <ScenNumInput label="Cash ($M)" v={cash ?? 0} setV={v => setCash(v)} min={0} step={50} />
                <ScenNumInput label="Debt ($M)" v={debt ?? 0} setV={v => setDebt(v)} min={0} step={50} />
              </div>
            )}
            {finSrc && !finLoad && (
              <div style={{ fontSize:8, color:"var(--text-faint)", letterSpacing:0.5, paddingLeft:2, marginBottom:4 }}>
                <span style={{ color:"var(--green)" }}>●</span> {finSrc}
              </div>
            )}
            {!finLoad && cash != null && debt != null && (
              <div style={{ fontSize:9, color:"var(--text-dim)", letterSpacing:0.5, paddingLeft:2, marginBottom:4 }}>
                Net cash: <span style={{ color: (cash-debt)>=0 ? "var(--green)" : "var(--red)", fontWeight:600 }}>
                  {(cash-debt)>=0 ? "+" : ""}{fmtMoney(Math.round(cash-debt))}
                </span>
              </div>
            )}

            <ScenSection label="SIMULATION" />
            <ScenSlider label="Runs" v={nSim} setV={setNSim} min={1000} max={20000} step={1000} />
          </div>
        </div>

        </div>{/* end scrollable inputs */}

        {/* Run button — pinned at bottom, always visible */}
        <div style={{ flexShrink:0, padding:"4px 0 0" }}>
          <button
            onClick={runPython}
            disabled={pyLoading}
            style={{
              width:"100%", padding:"11px 0", fontSize:11, letterSpacing:2,
              fontFamily:"var(--font-mono)", cursor: pyLoading ? "wait" : "pointer",
              background: pyLoading ? "var(--panel-3)" : "var(--accent)",
              color: pyLoading ? "var(--text-faint)" : "#000",
              border:"none", fontWeight:700, display:"block",
            }}>
            {pyLoading ? `⟳  RUNNING ${nSim.toLocaleString()} SIMULATIONS…` : "▶  RUN PYTHON ENGINE"}
          </button>
          <div style={{ marginTop:3, fontSize:9, letterSpacing:1, color:"var(--text-faint)", textAlign:"center" }}>
            {apiOk === true  && <span style={{ color:"var(--green)" }}>● NUMPY ENGINE READY</span>}
            {apiOk === false && <span style={{ color:"var(--red)" }}>● API OFFLINE · python scenario_api.py</span>}
            {apiOk === null  && <span style={{ color:"var(--text-faint)" }}>CHECKING ENGINE…</span>}
          </div>
          {pyError && <div style={{ marginTop:3, fontSize:9, color:"var(--red)", letterSpacing:0.5, padding:"0 4px" }}>{pyError}</div>}
        </div>
      </div>

      {/* ── RIGHT: results ────────────────────────────────────────────────── */}
      <div style={{ minHeight:0, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
        {pyRes ? (
          /* ── Python results ─────────────────────────────────────────── */
          <>
            <PyStatsBanner stats={pyRes.stats} baseRnpv={pyRes.base_rnpv} shares={shares} cash={cash} debt={debt} />
            <PyHistogramPanel hist={pyRes.histogram}  title={`DISTRIBUTION · NPV ($M) · ${nSim.toLocaleString()} RUNS · NUMPY`} />
            <PyHistogramPanel hist={pyRes.rnpv_hist}  title="DISTRIBUTION · RISK-ADJUSTED NPV ($M)" accent />
            <PyTornadoPanel   rows={pyRes.tornado} />
            <PyScenariosTable scenarios={pyRes.scenarios} />
            <PySensHeatmap    sens={pyRes.sens} />
          </>
        ) : (
          /* ── Quick JS preview while Python hasn't run ────────────────── */
          <>
            <div className="scen-stat">
              <StatCell label="MEAN NPV (JS)"  val={fmtMoney(Math.round(jsSim.mean))}  sub={`${(jsSim.mean/shares).toFixed(2)}/sh`}  color={jsSim.mean>=0?"var(--green)":"var(--red)"} />
              <StatCell label="MEDIAN"         val={fmtMoney(Math.round(jsSim.med))}   sub="P50 outcome"   color={jsSim.med>=0?"var(--green)":"var(--red)"} />
              <StatCell label="P10"            val={fmtMoney(Math.round(jsSim.p10))}   sub="downside"      color="var(--red)" />
              <StatCell label="P90"            val={fmtMoney(Math.round(jsSim.p90))}   sub="upside"        color="var(--green)" />
              <StatCell label="P(NPV > 0)"     val={fmtPct(jsSim.pPos, 0)}             sub="break-even prob" color="var(--accent)" />
            </div>
            <div className="scen-card">
              <div className="panel-header">DISTRIBUTION · NPV ($M) · QUICK JS SIM · {Math.min(nSim,3000).toLocaleString()} RUNS</div>
              <div className="panel-body" style={{ padding:10 }}>
                <Histogram values={jsSim.npvs} />
              </div>
            </div>
            <div style={{ padding:"20px", textAlign:"center", color:"var(--text-faint)", fontSize:10, letterSpacing:1.5, border:"1px solid var(--border)", background:"var(--panel-2)" }}>
              Click <span style={{ color:"var(--accent)" }}>▶ RUN PYTHON ENGINE</span> for full Monte Carlo:<br />
              mean / median / P10–P90 / RNPV / tornado / scenarios / sensitivity
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Input helpers ─────────────────────────────────────────────────────────────

function ScenSection({ label }) {
  return (
    <div style={{ fontSize:8, letterSpacing:2, color:"var(--accent)", margin:"8px 0 4px", borderBottom:"1px solid var(--border)", paddingBottom:2 }}>
      {label}
    </div>
  );
}
function ScenSlider({ label, v, setV, min, max, step=1, unit="" }) {
  return (
    <div className="scen-row">
      <label>{label}<b>{v}{unit}</b></label>
      <input type="range" min={min} max={max} step={step} value={v}
             onChange={e => setV(Number(e.target.value))} />
      <div className="ticks"><span>{min}{unit}</span><span>{max}{unit}</span></div>
    </div>
  );
}
function ScenNumInput({ label, v, setV, min, max, step=1 }) {
  return (
    <div className="scen-row num-input">
      <label style={{ marginBottom:0 }}>{label}</label>
      <input type="number" min={min} max={max} step={step} value={v}
             onChange={e => setV(Number(e.target.value))} />
    </div>
  );
}

function StatCell({ label, val, sub, color }) {
  return (
    <div className="cell">
      <div className="lbl">{label}</div>
      <div className="val" style={{ color: color || "var(--text)" }}>{val}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}

// ── Python Stats Banner ───────────────────────────────────────────────────────

function PyStatsBanner({ stats, baseRnpv, shares, cash, debt }) {
  const n = stats.npv;
  const r = stats.rnpv;
  const posColor = v => v >= 0 ? "var(--green)" : "var(--red)";

  // Per-share and EV calculations
  const sh = shares || 1;
  const rnpvPerSh   = r.ev / sh;
  const netCash     = (cash != null && debt != null) ? cash - debt : null;
  // Pipeline-only implied price = RNPV / shares
  // Adj. price target = (RNPV + net cash) / shares  (adds balance sheet)
  const adjTarget   = netCash != null ? (r.ev + netCash) / sh : null;
  // Enterprise Value implied by model = RNPV + Debt − Cash = RNPV − netCash
  const impliedEV   = netCash != null ? r.ev - netCash : null;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      {/* NPV row */}
      <div className="scen-stat">
        <StatCell label="MEAN NPV"    val={fmtMoney(Math.round(n.mean))}   sub={"σ " + fmtMoney(Math.round(n.std))}  color={posColor(n.mean)} />
        <StatCell label="MEDIAN NPV"  val={fmtMoney(Math.round(n.median))} sub="P50"                                 color={posColor(n.median)} />
        <StatCell label="P10 NPV"     val={fmtMoney(Math.round(n.p10))}    sub="downside 10th"                       color="var(--red)" />
        <StatCell label="P90 NPV"     val={fmtMoney(Math.round(n.p90))}    sub="upside 90th"                         color="var(--green)" />
        <StatCell label="P(NPV > 0)"  val={fmtPct(n.p_pos, 0)}             sub="break-even prob"                     color="var(--accent)" />
      </div>
      {/* RNPV row */}
      <div className="scen-stat" style={{ background:"color-mix(in srgb, var(--accent) 5%, var(--panel-2))", border:"1px solid color-mix(in srgb, var(--accent) 25%, var(--border))" }}>
        <StatCell label="EV · RNPV"       val={fmtMoney(Math.round(r.ev))}      sub={rnpvPerSh.toFixed(2) + "/sh (pipeline)"}  color={posColor(r.ev)} />
        <StatCell label="MEDIAN RNPV"     val={fmtMoney(Math.round(r.median))}  sub="P50 risk-adj."                            color={posColor(r.median)} />
        <StatCell label="P10 RNPV"        val={fmtMoney(Math.round(r.p10))}     sub="worst-case adj."                          color="var(--red)" />
        <StatCell label="P90 RNPV"        val={fmtMoney(Math.round(r.p90))}     sub="best-case adj."                           color="var(--green)" />
        <StatCell label="DET. BASE RNPV"  val={fmtMoney(Math.round(baseRnpv))}  sub="PoS × DCF"                                color="var(--amber)" />
      </div>
      {/* Per-share / EV row — only when balance sheet data available */}
      {(netCash != null) && (
        <div className="scen-stat" style={{ background:"color-mix(in srgb, var(--blue,#5599ff) 6%, var(--panel-2))", border:"1px solid color-mix(in srgb, var(--blue,#5599ff) 22%, var(--border))" }}>
          <StatCell label="SHARES OUT"
                    val={fmtNum(shares) + "M"}
                    sub="from SEC EDGAR"
                    color="var(--text)" />
          <StatCell label="CASH"
                    val={fmtMoney(Math.round(cash))}
                    sub="balance sheet"
                    color="var(--green)" />
          <StatCell label="TOTAL DEBT"
                    val={fmtMoney(Math.round(debt))}
                    sub="balance sheet"
                    color={debt > 0 ? "var(--red)" : "var(--text-faint)"} />
          <StatCell label="NET CASH"
                    val={(netCash >= 0 ? "+" : "") + fmtMoney(Math.round(netCash))}
                    sub="cash − debt"
                    color={netCash >= 0 ? "var(--green)" : "var(--red)"} />
          <StatCell label="ADJ. PRICE TGT"
                    val={"$" + adjTarget.toFixed(2)}
                    sub="(RNPV + net cash) / sh"
                    color="var(--accent)" />
        </div>
      )}
    </div>
  );
}

// ── Python Histogram ──────────────────────────────────────────────────────────

function PyHistogramPanel({ hist, title, accent }) {
  return (
    <div className="scen-card">
      <div className="panel-header">{title}</div>
      <div className="panel-body" style={{ padding:"10px 12px" }}>
        <PyHistogramSVG hist={hist} accent={accent} />
      </div>
    </div>
  );
}

function PyHistogramSVG({ hist, accent }) {
  const ref = useRef(null);
  const [w, setW] = useState(700);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => setW(Math.max(300, es[0].contentRect.width)));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);

  const { counts, edges, mean, median, p10, p90 } = hist;
  const H = 190, PAD_B = 26, PAD_T = 20;
  const plotH = H - PAD_B - PAD_T;
  const xMin = edges[0], xMax = edges[edges.length - 1];
  const range = xMax - xMin || 1;
  const toX = v => ((v - xMin) / range) * w;
  const maxCount = Math.max(1, ...counts);
  const toY = c => PAD_T + plotH * (1 - c / maxCount);

  const xP10  = toX(p10);
  const xP90  = toX(p90);
  const xMean = toX(mean);
  const xMed  = toX(median);
  const xZero = toX(0);

  // Axis ticks: 5 evenly spaced
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(t => ({
    x: t * w, val: Math.round(xMin + t * range)
  }));

  const barColor = (i) => {
    const mid = (edges[i] + edges[i+1]) / 2;
    if (accent) return mid >= 0 ? "var(--accent)" : "var(--text-faint)";
    return mid > 0 ? "var(--green)" : mid < 0 ? "var(--red)" : "var(--amber)";
  };

  return (
    <div ref={ref}>
      <svg width={w} height={H} style={{ display:"block", overflow:"visible" }}>
        {/* P10–P90 shaded region */}
        {xP10 >= 0 && xP90 <= w && (
          <rect x={Math.max(0,xP10)} y={PAD_T} width={Math.min(w,xP90)-Math.max(0,xP10)} height={plotH}
                fill="var(--accent)" opacity={0.06} />
        )}
        {/* Zero line */}
        {xZero > 0 && xZero < w && (
          <>
            <line x1={xZero} x2={xZero} y1={PAD_T} y2={H-PAD_B} stroke="var(--border-strong)" strokeDasharray="3 2" />
            <text x={xZero+3} y={PAD_T+9} fill="var(--text-faint)" fontSize="8" fontFamily="var(--font-mono)">$0</text>
          </>
        )}
        {/* Bars */}
        {counts.map((c, i) => {
          const x1 = toX(edges[i]);
          const x2 = toX(edges[i+1]);
          const bh = c === 0 ? 0 : Math.max(1, plotH * (c / maxCount));
          return <rect key={i} x={x1} y={H - PAD_B - bh} width={Math.max(1, x2-x1-0.5)} height={bh}
                       fill={barColor(i)} opacity={0.82} />;
        })}
        {/* Mean line */}
        {xMean > 0 && xMean < w && (
          <>
            <line x1={xMean} x2={xMean} y1={PAD_T} y2={H-PAD_B} stroke="var(--amber)" strokeWidth="1.5" />
            <text x={xMean+3} y={PAD_T+8} fill="var(--amber)" fontSize="8" fontFamily="var(--font-mono)">MEAN {fmtMoney(Math.round(mean))}</text>
          </>
        )}
        {/* Median line */}
        {xMed > 0 && xMed < w && (
          <>
            <line x1={xMed} x2={xMed} y1={PAD_T} y2={H-PAD_B} stroke="var(--blue,#5599ff)" strokeWidth="1" strokeDasharray="4 2" />
            <text x={xMed+3} y={PAD_T+18} fill="var(--blue,#5599ff)" fontSize="8" fontFamily="var(--font-mono)">MED {fmtMoney(Math.round(median))}</text>
          </>
        )}
        {/* P10 / P90 labels */}
        {xP10 > 0 && xP10 < w && <text x={xP10+2} y={H-PAD_B-4} fill="var(--red)" fontSize="7" fontFamily="var(--font-mono)">P10</text>}
        {xP90 > 0 && xP90 < w && <text x={xP90-18} y={H-PAD_B-4} fill="var(--green)" fontSize="7" fontFamily="var(--font-mono)">P90</text>}
        {/* X axis */}
        <line x1={0} x2={w} y1={H-PAD_B} y2={H-PAD_B} stroke="var(--border-strong)" />
        {ticks.map(({x, val}) => (
          <g key={x}>
            <line x1={x} x2={x} y1={H-PAD_B} y2={H-PAD_B+3} stroke="var(--border-strong)" />
            <text x={x} y={H-3} textAnchor="middle" fill="var(--text-faint)" fontSize="8" fontFamily="var(--font-mono)">
              ${val >= 1000 ? (val/1000).toFixed(1)+'B' : val+'M'}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ── Python Tornado ────────────────────────────────────────────────────────────

function PyTornadoPanel({ rows }) {
  if (!rows || !rows.length) return null;
  return (
    <div className="scen-card">
      <div className="panel-header">TORNADO · DRIVER SENSITIVITY (RISK-ADJUSTED NPV $M)</div>
      <div className="panel-body" style={{ padding:"10px 12px" }}>
        <PyTornadoSVG rows={rows} />
      </div>
    </div>
  );
}

function PyTornadoSVG({ rows }) {
  const ref = useRef(null);
  const [w, setW] = useState(700);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => setW(Math.max(300, es[0].contentRect.width)));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);

  const LABEL_W = 130;
  const VAL_W   = 80;
  const plotW   = Math.max(100, w - LABEL_W - VAL_W);
  const ROW_H   = 22;
  const H       = rows.length * ROW_H + 24;

  // X range: from global min to global max
  const allVals = rows.flatMap(r => [r.low, r.high, r.base]);
  const xMin = Math.min(...allVals) * 0.95;
  const xMax = Math.max(...allVals) * 1.05;
  const xRange = xMax - xMin || 1;
  const toX = v => LABEL_W + ((v - xMin) / xRange) * plotW;
  const xBase = toX(rows[0]?.base || 0);

  return (
    <div ref={ref}>
      <svg width={w} height={H} style={{ display:"block", overflow:"visible" }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map(t => {
          const x = LABEL_W + t * plotW;
          const val = xMin + t * xRange;
          return (
            <g key={t}>
              <line x1={x} x2={x} y1={0} y2={H-16} stroke="var(--border)" strokeDasharray="2 4" />
              <text x={x} y={H-4} textAnchor="middle" fill="var(--text-faint)" fontSize="8" fontFamily="var(--font-mono)">
                ${val >= 1000 ? (val/1000).toFixed(1)+'B' : Math.round(val)+'M'}
              </text>
            </g>
          );
        })}
        {/* Bars */}
        {rows.map((r, i) => {
          const y = i * ROW_H + 4;
          const x1 = toX(r.low);
          const x2 = toX(r.high);
          const bw = Math.max(2, x2 - x1);
          const opacity = 0.55 + 0.45 * (i === 0 ? 1 : (rows.length - i) / rows.length);
          return (
            <g key={r.label}>
              <text x={LABEL_W - 6} y={y + 12} textAnchor="end" fill="var(--text-dim)"
                    fontSize="9" fontFamily="var(--font-mono)">{r.label}</text>
              <rect x={x1} y={y+2} width={bw} height={ROW_H - 6}
                    fill="var(--accent)" opacity={opacity} rx="1" />
              {/* Low marker */}
              <text x={x1 - 2} y={y + 12} textAnchor="end" fill="var(--red)"
                    fontSize="8" fontFamily="var(--font-mono)">{fmtMoney(Math.round(r.low))}</text>
              {/* High marker */}
              <text x={x2 + 4} y={y + 12} fill="var(--green)"
                    fontSize="8" fontFamily="var(--font-mono)">{fmtMoney(Math.round(r.high))}</text>
            </g>
          );
        })}
        {/* Base line */}
        <line x1={xBase} x2={xBase} y1={0} y2={H-16} stroke="var(--amber)" strokeWidth="1.5" />
        <text x={xBase+3} y={10} fill="var(--amber)" fontSize="8" fontFamily="var(--font-mono)">BASE</text>
      </svg>
    </div>
  );
}

// ── Scenarios table ───────────────────────────────────────────────────────────

function PyScenariosTable({ scenarios }) {
  if (!scenarios) return null;
  const { bear, base, bull } = scenarios;
  const cols = [
    { key:"bear", label:"BEAR", color:"var(--red)",   data: bear },
    { key:"base", label:"BASE", color:"var(--amber)", data: base },
    { key:"bull", label:"BULL", color:"var(--green)", data: bull },
  ];
  const rows = [
    { label:"Peak Sales",   fmt: d => fmtMoney(d.peak_sales) },
    { label:"PoS",          fmt: d => fmtPct(d.pos, 0) },
    { label:"NPV (DCF)",    fmt: d => fmtMoney(Math.round(d.npv)) },
    { label:"RNPV (EV)",    fmt: d => fmtMoney(Math.round(d.rnpv)) },
  ];
  return (
    <div className="scen-card">
      <div className="panel-header">SCENARIOS · BEAR / BASE / BULL</div>
      <div className="panel-body" style={{ padding:"10px 12px" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontFamily:"var(--font-mono)", fontSize:11 }}>
          <thead>
            <tr>
              <th style={{ textAlign:"left", padding:"4px 8px", fontSize:9, color:"var(--text-faint)", letterSpacing:1.5, width:120 }}>METRIC</th>
              {cols.map(c => (
                <th key={c.key} style={{ textAlign:"center", padding:"4px 8px", color: c.color, fontSize:10, letterSpacing:2 }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderTop:"1px solid var(--border)" }}>
                <td style={{ padding:"6px 8px", color:"var(--text-faint)", fontSize:9, letterSpacing:1 }}>{row.label}</td>
                {cols.map(c => (
                  <td key={c.key} style={{ padding:"6px 8px", textAlign:"center", color: c.color, fontWeight:600 }}>
                    {row.fmt(c.data)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize:8, color:"var(--text-faint)", letterSpacing:1, marginTop:6, paddingLeft:8 }}>
          Bear: 50% peak / PoS −15pp · Base: as-entered · Bull: 180% peak / PoS +15pp
        </div>
      </div>
    </div>
  );
}

// ── Sensitivity heatmap ───────────────────────────────────────────────────────

function PySensHeatmap({ sens }) {
  if (!sens) return null;
  const { pos_vals, pk_mults, cells } = sens;
  const flat = cells.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const color = (v) => {
    if (hi === lo) return "var(--panel-3)";
    if (v < 0) {
      const a = Math.min(1, Math.abs(v) / Math.max(1, Math.abs(lo)));
      return `oklch(0.50 0.18 25 / ${0.25 + a * 0.70})`;
    }
    const a = Math.min(1, v / Math.max(1, hi));
    return `oklch(0.72 0.16 145 / ${0.25 + a * 0.70})`;
  };
  return (
    <div className="scen-card full">
      <div className="panel-header">SENSITIVITY · RNPV ($M) · POS × PEAK SALES MULTIPLIER</div>
      <div className="panel-body" style={{ padding:"10px 12px" }}>
        <div style={{ display:"grid", gridTemplateColumns:`80px repeat(${pk_mults.length}, 1fr)`, gap:2 }}>
          <div style={{ fontSize:8, color:"var(--text-faint)", letterSpacing:1, alignSelf:"end", paddingBottom:4 }}>PoS ↓ Peak →</div>
          {pk_mults.map(pm => (
            <div key={pm} style={{ fontSize:9, color:"var(--accent)", textAlign:"center", letterSpacing:1, paddingBottom:4 }}>
              ×{pm.toFixed(2)}
            </div>
          ))}
          {pos_vals.map((pv, i) => (
            <React.Fragment key={pv}>
              <div style={{ fontSize:9, color:"var(--text-faint)", letterSpacing:1, textAlign:"right", padding:"0 8px", alignSelf:"center" }}>
                {Math.round(pv * 100)}%
              </div>
              {cells[i].map((v, j) => (
                <div key={j} style={{
                  background: color(v), color:"var(--text)", padding:"5px 3px",
                  textAlign:"center", fontSize:10, fontFamily:"var(--font-mono)",
                  border:"1px solid var(--border)",
                }}>
                  {Math.round(v)}
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Legacy Histogram (JS quick-sim) ──────────────────────────────────────────

function Histogram({ values }) {
  const ref = useRef(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(es => setW(Math.max(200, es[0].contentRect.width)));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  const h = 180; const bins = 50;
  const sorted = [...values].sort((a,b) => a-b);
  const vmin = sorted[Math.floor(sorted.length*0.01)];
  const vmax = sorted[Math.floor(sorted.length*0.99)];
  const step = (vmax - vmin) / bins || 1;
  const counts = new Array(bins).fill(0);
  values.forEach(v => {
    const clamped = Math.max(vmin, Math.min(vmax, v));
    let idx = Math.floor((clamped - vmin) / step);
    if (idx === bins) idx = bins - 1;
    if (idx >= 0) counts[idx]++;
  });
  const scaled = counts.map(c => Math.sqrt(c));
  const cmax = Math.max(...scaled, 1);
  const xZ = ((0 - vmin) / (vmax - vmin)) * w;
  const mean   = values.reduce((s,v)=>s+v,0)/values.length;
  const median = sorted[Math.floor(sorted.length*0.5)];
  const xMean = Math.max(0,Math.min(w, ((mean - vmin)/(vmax-vmin))*w));
  const xMed  = Math.max(0,Math.min(w, ((median-vmin)/(vmax-vmin))*w));
  return (
    <div ref={ref}>
      <svg width={w} height={h} style={{ display:"block" }}>
        {xZ > 0 && xZ < w && <line x1={xZ} x2={xZ} y1={0} y2={h-20} stroke="var(--border-strong)" strokeDasharray="2 2" />}
        {scaled.map((c, i) => {
          const x = (i/bins)*w; const bw = w/bins-0.5;
          const binMid = vmin + (i+0.5)*step;
          const fill = binMid > 0 ? "var(--green)" : "var(--red)";
          const bh = c===0 ? 0 : Math.max(1, (c/cmax)*(h-40));
          return <rect key={i} x={x} y={h-20-bh} width={bw} height={bh} fill={fill} opacity={0.8} />;
        })}
        <line x1={xMean} x2={xMean} y1={4} y2={h-20} stroke="var(--amber)" strokeWidth="1.5" />
        <text x={xMean+3} y={12} fill="var(--amber)" fontSize="8" fontFamily="var(--font-mono)">MEAN {fmtMoney(Math.round(mean))}</text>
        <line x1={xMed} x2={xMed} y1={4} y2={h-20} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 2" />
        <line x1={0} x2={w} y1={h-20} y2={h-20} stroke="var(--border-strong)" />
        {[0,0.25,0.5,0.75,1].map(p => {
          const x = p*w; const val = vmin + p*(vmax-vmin);
          return (
            <g key={p}>
              <line x1={x} x2={x} y1={h-20} y2={h-16} stroke="var(--border-strong)" />
              <text x={x+1} y={h-5} fill="var(--text-faint)" fontSize="8" fontFamily="var(--font-mono)">${Math.round(val)}M</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

window.ScenarioModeler = ScenarioModeler;
