/* calendar.jsx — Catalyst Calendar */

function CatalystCalendar({ trials, allUpcoming, watchlist, view, onSelectTrial }) {
  const [scope, setScope] = useState("watchlist"); // "watchlist" | "all"

  // Watchlist events: trials with catalyst dates
  const watchlistEvents = useMemo(() => {
    const wlSet = new Set(watchlist || []);
    return (trials || [])
      .filter(t => t.catalyst)
      .map(t => ({
        ...t.catalyst,
        ticker: t.ticker, drug: t.drug, phase: t.phase, indication: t.indication,
        pos: t.pos, peakSales: t.peakSales, id: t.id, sponsor: t.sponsor,
      }))
      .sort((a, b) => parseDate(a.date) - parseDate(b.date));
  }, [trials, watchlist]);

  // All events: merge watchlist + allUpcoming (deduped)
  const allEvents = useMemo(() => {
    const wlIds = new Set((trials || []).map(t => t.id));
    const upcomingMapped = (allUpcoming || [])
      .filter(t => t.catalyst && !wlIds.has(t.id))
      .map(t => ({
        ...t.catalyst,
        ticker: t.ticker, drug: t.drug, phase: t.phase, indication: t.indication,
        pos: t.pos, peakSales: t.peakSales, id: t.id, sponsor: t.sponsor,
      }));
    return [...watchlistEvents, ...upcomingMapped]
      .sort((a, b) => parseDate(a.date) - parseDate(b.date));
  }, [watchlistEvents, allUpcoming, trials]);

  const events = scope === "all" ? allEvents : watchlistEvents;
  const wlSet = new Set(watchlist || []);

  const monthsBetween = (start, end) => {
    const arr = [];
    let d = new Date(start.getFullYear(), start.getMonth(), 1);
    while (d <= end) { arr.push(new Date(d)); d.setMonth(d.getMonth() + 1); }
    return arr;
  };

  const now = new Date();
  const maxDate = events.length
    ? new Date(Math.max(...events.map(e => parseDate(e.date)?.getTime() || 0)))
    : new Date(now.getFullYear() + 1, 11, 1);
  const months = monthsBetween(
    new Date(now.getFullYear(), now.getMonth(), 1),
    new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 1),
  );

  return (
    <div style={{ display: "grid", gridTemplateRows: "auto 1fr", padding: 4, gap: 4, height: "100%", minHeight: 0 }}>
      <div className="lscape-bar" style={{ borderRadius: 0, border: "1px solid var(--border)" }}>
        <span className="lbl">SCOPE</span>
        <span className={"chip " + (scope === "watchlist" ? "active" : "")} onClick={() => setScope("watchlist")}>
          WATCHLIST
          <span style={{ marginLeft: 4, color: scope === "watchlist" ? "rgba(0,0,0,0.55)" : "var(--text-faint)" }}>
            {watchlistEvents.length}
          </span>
        </span>
        <span className={"chip " + (scope === "all" ? "active" : "")} onClick={() => setScope("all")}>
          ALL CT.GOV
          <span style={{ marginLeft: 4, color: scope === "all" ? "rgba(0,0,0,0.55)" : "var(--text-faint)" }}>
            {allEvents.length}
          </span>
        </span>
        <span style={{ width: 1, height: 14, background: "var(--border)", margin: "0 8px" }} />
        {[...new Set(events.map(e => e.kind))].filter(Boolean).map(k => (
          <span key={k} className="chip" style={{ borderColor: "var(--border)" }}>
            {k}
            <span style={{ marginLeft: 4, color: "var(--text-faint)" }}>{events.filter(e => e.kind === k).length}</span>
          </span>
        ))}
        <span style={{ flex: 1 }} />
        <span style={{ color: "var(--text-faint)", fontSize: 9, letterSpacing: 1, marginRight: 12 }}>
          {events.length} events · {months.length} months
        </span>
        <Legend />
      </div>

      <div style={{ minHeight: 0, overflow: "hidden" }}>
        <Panel
          title={"CATALYST CALENDAR · " + view.toUpperCase() + " · " + (scope === "all" ? "ALL PROGRAMS" : "WATCHLIST")}
          right={events.length + " events"}>
          {view === "timeline" && <TimelineView events={events} months={months} onSelectTrial={onSelectTrial} wlSet={wlSet} />}
          {view === "gantt"    && <GanttView trials={scope === "watchlist" ? (trials||[]) : [...(trials||[]), ...(allUpcoming||[])]} events={events} months={months} onSelectTrial={onSelectTrial} />}
          {view === "month"    && <MonthGridView events={events} months={months} onSelectTrial={onSelectTrial} wlSet={wlSet} />}
        </Panel>
      </div>
    </div>
  );
}

function Legend() {
  const items = [
    { l: "PIVOTAL", c: "var(--red)" },
    { l: "TOPLINE", c: "var(--accent)" },
    { l: "INTERIM", c: "var(--amber)" },
    { l: "UPDATE",  c: "var(--blue)" },
    { l: "ASCO",    c: "var(--violet)" },
  ];
  return (
    <span style={{ display: "flex", gap: 8, fontSize: 9, color: "var(--text-faint)", letterSpacing: 1 }}>
      {items.map(i => (
        <span key={i.l}>
          <span style={{ background: i.c, width: 8, height: 8, display: "inline-block", marginRight: 4, verticalAlign: "middle" }}></span>
          {i.l}
        </span>
      ))}
    </span>
  );
}

function TimelineView({ events, months, onSelectTrial, wlSet }) {
  return (
    <div className="cal-timeline">
      {months.map(m => {
        const m0 = new Date(m.getFullYear(), m.getMonth(), 1);
        const m1 = new Date(m.getFullYear(), m.getMonth() + 1, 1);
        const inMonth = events.filter(e => { const d = parseDate(e.date); return d >= m0 && d < m1; });
        return (
          <div key={m.toISOString()} className="month">
            <div className="m-lbl">
              <span>{m.toLocaleString("en", { month: "short" }).toUpperCase()}</span>
              <span className="y">{m.getFullYear()}</span>
              <span style={{ color: inMonth.length ? "var(--text-dim)" : "var(--text-faint)", fontSize: 9, marginTop: 4 }}>
                {inMonth.length} event{inMonth.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="events">
              {inMonth.map(e => {
                const c = ({ PIVOTAL:"var(--red)", TOPLINE:"var(--accent)", INTERIM:"var(--amber)", UPDATE:"var(--blue)", ASCO:"var(--violet)", READ:"var(--text-dim)", FPI:"var(--cyan)" })[e.kind] || "var(--accent)";
                const isWl = e.ticker && wlSet.has(e.ticker);
                return (
                  <div key={e.id} className="cal-event"
                       style={{ borderLeftColor: c, opacity: isWl ? 1 : 0.55 }}
                       onClick={() => onSelectTrial(e.id)}>
                    <span className="d">{fmtDate(e.date).slice(5)}</span>
                    <span className="tk" style={{ color: isWl ? "var(--accent)" : "var(--text-dim)" }}>
                      {e.ticker || e.sponsor?.split(" ")[0]?.slice(0,5) || "—"}
                      {isWl && <span style={{ marginLeft: 3, fontSize: 8, color: "var(--green)" }}>●</span>}
                    </span>
                    <span style={{ color: c, fontSize: 9, letterSpacing: 1 }}>{e.kind}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      <span style={{ color: "var(--text)" }}>{e.drug}</span>
                      <span style={{ color: "var(--text-faint)", marginLeft: 6 }}>· {e.indication}</span>
                    </span>
                    <span className="pos">POS {fmtPct(e.pos, 0)}</span>
                  </div>
                );
              })}
              {inMonth.length === 0 && <div style={{ color: "var(--text-faint)", fontSize: 9, padding: "4px 6px" }}>—</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GanttView({ trials, events, months, onSelectTrial }) {
  const rows = useMemo(() => {
    const eventIds = new Set(events.map(e => e.id));
    const map = new Map();
    (trials || []).forEach(t => { if (t.catalyst && eventIds.has(t.id)) map.set(t.id, t); });
    return Array.from(map.values()).sort((a, b) => parseDate(a.catalyst.date) - parseDate(b.catalyst.date));
  }, [trials, events]);

  if (!months.length) return null;
  const start = months[0];
  const end = new Date(months[months.length - 1].getFullYear(), months[months.length - 1].getMonth() + 1, 1);
  const totalMs = end - start;
  const pct = d => ((d - start) / totalMs) * 100;
  const monthW = 56;
  const trackWidth = months.length * monthW;
  const now = new Date();

  return (
    <div className="gantt">
      <div style={{ display: "grid", gridTemplateColumns: `220px ${trackWidth}px`, borderBottom: "1px solid var(--border)" }}>
        <div style={{ background: "var(--panel-2)", borderRight: "1px solid var(--border)", padding: "4px 8px", fontSize: 9, color: "var(--text-faint)", letterSpacing: 1.5 }}>TRIAL / DRUG</div>
        <div style={{ display: "flex", background: "var(--panel-2)" }}>
          {months.map(m => (
            <div key={m.toISOString()} style={{ width: monthW, padding: "4px 6px", fontSize: 9, color: m.getMonth() === 0 ? "var(--accent)" : "var(--text-faint)", letterSpacing: 1, borderLeft: "1px solid var(--border)" }}>
              {m.toLocaleString("en", { month: "short" }).slice(0, 3).toUpperCase()}
              {m.getMonth() === 0 && <span style={{ marginLeft: 4 }}>'{String(m.getFullYear()).slice(2)}</span>}
            </div>
          ))}
        </div>
      </div>
      <div>
        {rows.map(t => {
          const s  = parseDate(t.start);
          const ed = parseDate(t.pcd);
          const cd = parseDate(t.catalyst.date);
          if (!s || !ed) return null;
          const sPct = Math.max(0, pct(s));
          const ePct = Math.min(100, pct(ed));
          const cPct = pct(cd);
          const c = ({ PIVOTAL:"var(--red)", TOPLINE:"var(--accent)", INTERIM:"var(--amber)", UPDATE:"var(--blue)", ASCO:"var(--violet)" })[t.catalyst.kind] || "var(--accent)";
          return (
            <div key={t.id} className="gantt-row" style={{ gridTemplateColumns: `220px ${trackWidth}px` }}>
              <div className="lbl" onClick={() => onSelectTrial(t.id)} style={{ cursor: "pointer" }}>
                <span className="tk">{t.ticker || "—"}</span>
                <PhasePill phase={t.phase} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span style={{ color: "var(--text)" }}>{t.drug}</span>
                </span>
              </div>
              <div className="track">
                <div className="bar" onClick={() => onSelectTrial(t.id)} style={{ left: sPct + "%", width: (ePct - sPct) + "%" }}>{t.indication}</div>
                <div className={"mark " + t.catalyst.kind} onClick={() => onSelectTrial(t.id)}
                     title={`${t.catalyst.kind} · ${fmtDate(t.catalyst.date)}`}
                     style={{ left: cPct + "%", background: c }}></div>
              </div>
            </div>
          );
        })}
        <div className="gantt-now" style={{ position: "absolute", left: `calc(220px + ${(pct(now) / 100) * trackWidth}px)`, top: 26, bottom: 0 }}></div>
      </div>
    </div>
  );
}

function MonthGridView({ events, months, onSelectTrial, wlSet }) {
  const dow = ["S", "M", "T", "W", "T", "F", "S"];
  return (
    <div className="month-grid">
      {months.map(m => {
        const m0 = new Date(m.getFullYear(), m.getMonth(), 1);
        const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
        const startDow = m0.getDay();
        const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
        const inMonth = events.filter(e => {
          const d = parseDate(e.date);
          return d && d.getFullYear() === m.getFullYear() && d.getMonth() === m.getMonth();
        });
        return (
          <div key={m.toISOString()} className="mg-month">
            <div className="mg-month-head">
              <span>{m.toLocaleString("en", { month: "long" }).toUpperCase()}</span>
              <span className="y">{m.getFullYear()}</span>
            </div>
            <div className="mg-grid">
              {dow.map((d, i) => (
                <div key={i} style={{ padding: "2px 3px", fontSize: 8, letterSpacing: 1, color: "var(--text-faint)", textAlign: "center", borderBottom: "1px solid var(--border)" }}>{d}</div>
              ))}
              {Array.from({ length: totalCells }).map((_, i) => {
                const dayN = i - startDow + 1;
                if (dayN < 1 || dayN > daysInMonth) return <div key={i} className="mg-cell empty"></div>;
                const evs = inMonth.filter(e => parseDate(e.date)?.getDate() === dayN);
                return (
                  <div key={i} className="mg-cell">
                    <div className="d">{dayN}</div>
                    {evs.map(e => {
                      const isWl = e.ticker && wlSet.has(e.ticker);
                      return (
                        <span key={e.id} className={"ev " + e.kind}
                              style={{ opacity: isWl ? 1 : 0.5 }}
                              title={`${e.ticker || e.sponsor} ${e.drug} · ${e.kind}`}
                              onClick={() => onSelectTrial(e.id)}>
                          {(e.ticker || e.sponsor?.split(" ")[0]?.slice(0,4) || "?")}{" "}{e.kind.slice(0, 3)}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

window.CatalystCalendar = CatalystCalendar;
