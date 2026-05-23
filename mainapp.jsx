/* mainapp.jsx — main app glue */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "density": "regular",
  "calendarView": "timeline",
  "pipelineView": "table",
  "showTopbar": true
}/*EDITMODE-END*/;

const LS_WATCHLIST_KEY = "btt_watchlist_v2";

function loadWatchlist() {
  try {
    const stored = localStorage.getItem(LS_WATCHLIST_KEY);
    if (stored) return JSON.parse(stored);
  } catch (_) {}
  return window.WATCHLIST || [];
}

function saveWatchlist(list) {
  try { localStorage.setItem(LS_WATCHLIST_KEY, JSON.stringify(list)); } catch (_) {}
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [tab, setTab] = useState("tracker");
  const [selectedTrialId, setSelectedTrialId] = useState(null);
  const [selectedCompanyTicker, setSelectedCompanyTicker] = useState(null);
  const [scenarioTrialId, setScenarioTrialId] = useState(null); // dedicated: not cleared by drawer onClose

  // Watchlist: array of ticker strings
  const [watchlist, setWatchlist] = useState(() => loadWatchlist());

  // trials: live data from CT.gov for watchlist companies
  const [trials, setTrials] = useState([]);
  const [apiStatus, setApiStatus] = useState("loading");

  // All upcoming catalysts (broad, not watchlist-gated)
  const [allUpcoming, setAllUpcoming] = useState([]);

  // Live SEC 8-K activity feed for watchlist companies
  const [liveActivity,    setLiveActivity]    = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Load trials whenever watchlist changes (slight delay so Babel finishes parsing)
  useEffect(() => {
    if (!watchlist.length) { setTrials([]); setApiStatus("live"); return; }
    setApiStatus("loading");
    const t = setTimeout(() => {
      window.CTAPI.fetchTrialsForWatchlist(watchlist)
        .then(fetched => {
          setTrials(fetched);
          window.TRIALS = fetched;
          setApiStatus("live");
        })
        .catch(err => {
          console.warn("CT.gov fetch failed:", err.message);
          setApiStatus("error");
        });
    }, 500);
    return () => clearTimeout(t);
  }, [watchlist.join(",")]);

  // Pre-warm SEC EDGAR ticker cache in the background (non-blocking)
  useEffect(() => { window.CTAPI.loadSecTickers().catch(() => {}); }, []);

  // Fetch live 8-K alerts whenever watchlist changes
  useEffect(() => {
    if (!watchlist.length) { setLiveActivity([]); return; }
    setActivityLoading(true);
    fetch('/api/sec/watchlist-filings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: watchlist, days: 90 }),
    })
      .then(r => r.ok ? r.json() : [])
      .then(data => setLiveActivity(Array.isArray(data) ? data : []))
      .catch(() => setLiveActivity([]))
      .finally(() => setActivityLoading(false));
  }, [watchlist.join(',')]);

  // Load all upcoming catalysts once on mount
  useEffect(() => {
    window.CTAPI.fetchUpcomingCatalysts({ pageSize: 100 })
      .then(setAllUpcoming)
      .catch(() => {});
  }, []);

  // Persist watchlist changes
  useEffect(() => { saveWatchlist(watchlist); }, [watchlist]);

  const addToWatchlist = useCallback((ticker) => {
    const tk = ticker.toUpperCase().trim();
    if (!tk) return;
    setWatchlist(prev => prev.includes(tk) ? prev : [...prev, tk]);
  }, []);

  // Called after user saves a custom sponsor name — re-fetches the full watchlist
  // so the newly-mapped ticker resolves on the same page load.
  const refetchWatchlist = useCallback(() => {
    if (!watchlist.length) return;
    setApiStatus("loading");
    window.CTAPI.fetchTrialsForWatchlist(watchlist)
      .then(fetched => { setTrials(fetched); window.TRIALS = fetched; setApiStatus("live"); })
      .catch(() => setApiStatus("error"));
  }, [watchlist]);

  const removeFromWatchlist = useCallback((ticker) => {
    setWatchlist(prev => prev.filter(t => t !== ticker));
  }, []);

  const selectedTrial = useMemo(
    () => trials.find(x => x.id === selectedTrialId),
    [trials, selectedTrialId]
  );

  // Add a single trial by NCT ID (from search)
  const addTrial = useCallback(async (nctId) => {
    const existing = trials.find(t => t.id === nctId);
    if (existing) { setSelectedTrialId(nctId); return; }
    try {
      const study = await window.CTAPI.fetchStudy(nctId);
      setTrials(prev => {
        const updated = [...prev, study];
        window.TRIALS = updated;
        return updated;
      });
      setSelectedTrialId(nctId);
      // If we know the ticker, add to watchlist
      if (study.ticker && !watchlist.includes(study.ticker)) addToWatchlist(study.ticker);
    } catch (e) {
      console.warn("Failed to fetch trial:", nctId, e.message);
    }
  }, [trials, watchlist]);

  // theme + density
  useEffect(() => {
    document.documentElement.dataset.theme = t.theme;
    document.documentElement.dataset.density = t.density;
  }, [t.theme, t.density]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "F1") { e.preventDefault(); setTab("tracker"); }
      if (e.key === "F2") { e.preventDefault(); setTab("calendar"); }
      if (e.key === "F3") { e.preventDefault(); setTab("landscape"); }
      if (e.key === "F4") { e.preventDefault(); setTab("modeler"); }
      if (e.key === "Escape") { setSelectedTrialId(null); setSelectedCompanyTicker(null); }
      if (e.key === "/" && document.activeElement.tagName !== "INPUT") {
        e.preventDefault();
        const i = document.querySelector(".nav .search input");
        if (i) i.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onSelectTrial = (id) => setSelectedTrialId(id);

  // Navigate to Scenario tab with a specific trial pre-loaded.
  // Uses scenarioTrialId (not selectedTrialId) so drawer.onClose can't clobber it.
  const onAnalyzeTrial = useCallback((id) => {
    setScenarioTrialId(id);
    setTab("modeler");
  }, []);

  return (
    <div className="app">
      <TopBar />
      <Nav tab={tab} onTab={setTab} onSelectTrial={onSelectTrial}
           trials={trials} addTrial={addTrial}
           onSelectCompany={(tk) => { setSelectedCompanyTicker(tk); setSelectedTrialId(null); }} />
      <div className="main">
        {tab === "tracker" && (
          <TrialTracker
            trials={trials}
            watchlist={watchlist}
            addToWatchlist={addToWatchlist}
            removeFromWatchlist={removeFromWatchlist}
            onSelectTrial={onSelectTrial}
            selectedTrial={selectedTrialId}
            allUpcoming={allUpcoming}
            onRefetch={refetchWatchlist}
            liveActivity={liveActivity}
            activityLoading={activityLoading}
          />
        )}
        {tab === "calendar" && (
          <CatalystCalendar
            trials={trials}
            allUpcoming={allUpcoming}
            watchlist={watchlist}
            view={t.calendarView}
            onSelectTrial={onSelectTrial}
          />
        )}
        {tab === "landscape" && (
          <CompetitiveLandscape
            trials={trials}
            view={t.pipelineView}
            onSelectTrial={onSelectTrial}
          />
        )}
        {tab === "modeler" && (
          <ScenarioModeler
            trials={trials}
            initialTrialId={scenarioTrialId}
            onSelectTrial={onSelectTrial}
          />
        )}
      </div>
      <StatusBar
        count={trials.length}
        sel={selectedTrial ? selectedTrial.ticker + " " + selectedTrial.drug : null}
        apiStatus={apiStatus}
        watchlistCount={watchlist.length}
      />

      {selectedTrial && (
        <TrialDrawer
          trial={selectedTrial}
          onClose={() => setSelectedTrialId(null)}
          onAnalyze={onAnalyzeTrial}
        />
      )}

      {selectedCompanyTicker && (
        <CompanyDrawer
          ticker={selectedCompanyTicker}
          watchlist={watchlist}
          addToWatchlist={addToWatchlist}
          onClose={() => setSelectedCompanyTicker(null)}
          onAnalyze={onAnalyzeTrial}
        />
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="Display" />
        <TweakRadio label="Theme" value={t.theme}
                    options={["dark", "light"]}
                    onChange={(v) => setTweak("theme", v)} />
        <TweakRadio label="Density" value={t.density}
                    options={["compact", "regular", "comfy"]}
                    onChange={(v) => setTweak("density", v)} />

        <TweakSection label="Catalyst Calendar" />
        <TweakRadio label="View" value={t.calendarView}
                    options={["timeline", "gantt", "month"]}
                    onChange={(v) => setTweak("calendarView", v)} />

        <TweakSection label="Competitive Landscape" />
        <TweakRadio label="Layout" value={t.pipelineView}
                    options={["table", "card"]}
                    onChange={(v) => setTweak("pipelineView", v)} />

        <TweakSection label="Quick actions" />
        <TweakButton label="Reset watchlist"
                     onClick={() => { setWatchlist(window.WATCHLIST || []); }} />
        <TweakButton label="Clear filters"
                     onClick={() => { setTab("tracker"); setSelectedTrialId(null); }} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
