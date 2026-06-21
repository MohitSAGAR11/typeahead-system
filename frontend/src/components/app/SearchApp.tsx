import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '../../services/api';
import { useSuggestions } from '../../hooks/useSuggestions';
import { RankingMode, TrendingItem, Stats } from '../../types';
export default function SearchApp() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [rankingMode, setRankingMode] = useState<RankingMode>('enhanced');
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [ringViz, setRingViz] = useState('');
  const [searchMsg, setSearchMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'trending' | 'debug' | 'stats'>('trending');
  const inputRef = useRef<HTMLInputElement>(null);
  const { suggestions, loading, error, source, node, latency } = useSuggestions(query, rankingMode);
  const loadTrending = useCallback(() => {
    api.trending(rankingMode).then((r) => setTrending(r.results)).catch(() => {});
  }, [rankingMode]);
  useEffect(() => { loadTrending(); }, [loadTrending]);
  useEffect(() => {
    const load = () => api.stats().then(setStats).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    api.cacheRing().then((r) => setRingViz(r.visualization)).catch(() => {});
  }, []);
  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) return;
    setShowDropdown(false);
    setQuery(q);
    try {
      const res = await api.search(q);
      setSearchMsg(res.message);
      setSubmitted(q);
      setTimeout(() => setSearchMsg(''), 3000);
      setTimeout(() => loadTrending(), 500);
    } catch {
      setSearchMsg('Search failed');
    }
  }, [loadTrending]);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || suggestions.length === 0) {
      if (e.key === 'Enter') handleSearch(query);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0) handleSearch(suggestions[activeIdx].query);
      else handleSearch(query);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIdx(-1);
    }
  };
  return (
    <div className="app-shell">
      {}
      <main className="app-main" id="main-content">
        <div className="search-section">
          <div className="search-logo-container">
            <div className="app-logo">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <polygon points="11,2 20,18 2,18" stroke="var(--color-plum-voltage)" strokeWidth="1.5" fill="none" />
                <polygon points="11,6 16.5,16 5.5,16" stroke="var(--color-plum-voltage)" strokeWidth="1" fill="none" opacity="0.4" />
              </svg>
              <span className="app-logo-text">TypeAhead</span>
              <span className="app-logo-badge">Distributed</span>
            </div>
          </div>
          <p className="eyebrow eyebrow--center">DISTRIBUTED TYPEAHEAD ENGINE</p>
          <h1 className="search-headline">
            Search anything.
          </h1>
          <p className="search-subline">
            Powered by consistent hashing · {rankingMode === 'enhanced' ? 'time-decayed ranking' : 'frequency ranking'} · batch writes
          </p>
          {}
          <div className="search-ranking-toggle">
            <div className="ranking-toggle" role="group" aria-label="Ranking mode">
              <span className="ranking-label">Ranking</span>
              {(['basic', 'enhanced'] as RankingMode[]).map((m) => (
                <button
                  key={m}
                  id={`ranking-btn-${m}`}
                  className={`ranking-btn ${rankingMode === m ? 'ranking-btn--active' : ''}`}
                  onClick={() => setRankingMode(m)}
                  aria-pressed={rankingMode === m}
                >
                  {m === 'basic' ? 'Basic' : 'Enhanced'}
                </button>
              ))}
            </div>
          </div>
          {}
          <div className="search-wrapper" role="search">
            <div className="search-box" id="search-box">
              <svg className="search-icon-svg" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <circle cx="7.5" cy="7.5" r="5.5" stroke="var(--color-smoke)" strokeWidth="1.5"/>
                <line x1="11.5" y1="11.5" x2="16" y2="16" stroke="var(--color-smoke)" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <input
                ref={inputRef}
                id="search-input"
                className="search-input"
                type="search"
                placeholder="Start typing..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowDropdown(true);
                  setActiveIdx(-1);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                onKeyDown={handleKeyDown}
                autoComplete="off"
                aria-label="Search query"
                aria-autocomplete="list"
                aria-expanded={showDropdown && suggestions.length > 0}
                aria-controls="search-dropdown"
              />
              {loading && (
                <span className="search-spinner" role="status" aria-label="Loading suggestions">
                  <span className="search-spinner-ring" />
                </span>
              )}
              <button
                id="search-submit-btn"
                className="search-btn"
                onClick={() => handleSearch(query)}
                aria-label="Submit search"
              >
                Search
              </button>
            </div>
            {}
            {showDropdown && suggestions.length > 0 && (
              <ul
                id="search-dropdown"
                className="search-dropdown"
                role="listbox"
                aria-label="Search suggestions"
              >
                {suggestions.map((s, i) => (
                  <li
                    key={s.query}
                    id={`suggestion-${i}`}
                    className={`dropdown-item ${i === activeIdx ? 'dropdown-item--active' : ''}`}
                    role="option"
                    aria-selected={i === activeIdx}
                    onMouseDown={() => handleSearch(s.query)}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    <span className="dropdown-query">{s.query}</span>
                    <span className="dropdown-meta">
                      <span className="dropdown-count">{s.count.toLocaleString()}</span>
                      {rankingMode === 'enhanced' && (
                        <span className="dropdown-score">score {Math.round(s.score).toLocaleString()}</span>
                      )}
                    </span>
                  </li>
                ))}
                <li className="dropdown-footer" role="presentation">
                  <span className={`src-badge src-badge--${source}`}>
                    {source === 'cache' ? '⚡ cache' : '⬡ database'}
                  </span>
                  <span className="node-badge">{node}</span>
                  <span className="lat-badge">{latency}</span>
                </li>
              </ul>
            )}
            {showDropdown && !loading && query.trim() && suggestions.length === 0 && !error && (
              <div className="dropdown-empty" role="status">
                No suggestions for "{query}"
              </div>
            )}
            {error && (
              <div className="search-error" role="alert">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="7" y1="4" x2="7" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  <circle cx="7" cy="10" r="0.75" fill="currentColor"/>
                </svg>
                {error} — is the backend running?
              </div>
            )}
          </div>
          {}
          {searchMsg && (
            <div className="search-toast" role="status" aria-live="polite">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="var(--color-lichen)" strokeWidth="1.5"/>
                <polyline points="4,7 6,9 10,5" stroke="var(--color-lichen)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {searchMsg} — <strong>"{submitted}"</strong>
            </div>
          )}
        </div>
        {}
        <div className="panels-area">
          {}
          <div className="tabs" role="tablist" aria-label="Data panels">
            {(['trending', 'debug', 'stats'] as const).map((t) => (
              <button
                key={t}
                id={`tab-${t}`}
                className={`tab ${activeTab === t ? 'tab--active' : ''}`}
                role="tab"
                aria-selected={activeTab === t}
                aria-controls={`panel-${t}`}
                onClick={() => setActiveTab(t)}
              >
                {t === 'trending' ? 'Trending' : t === 'debug' ? 'Cache Debug' : 'Stats'}
              </button>
            ))}
          </div>
          {}
          {activeTab === 'trending' && (
            <div id="panel-trending" className="panel" role="tabpanel" aria-labelledby="tab-trending">
              <div className="panel-header">
                <h2 className="panel-title">Trending Searches</h2>
                <span className="panel-badge">{rankingMode}</span>
                <button
                  id="refresh-trending-btn"
                  className="panel-refresh-btn"
                  onClick={loadTrending}
                  aria-label="Refresh trending"
                >
                  ↻
                </button>
              </div>
              {trending.length === 0 ? (
                <p className="panel-empty">No trending data yet. Submit some searches!</p>
              ) : (
                <ol className="trending-list" aria-label="Trending searches list">
                  {trending.map((t, i) => (
                    <li
                      key={t.query}
                      id={`trending-${i}`}
                      className="trending-item"
                      onClick={() => {
                        setQuery(t.query);
                        inputRef.current?.focus();
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className="trend-rank">#{i + 1}</span>
                      <span className="trend-query">{t.query}</span>
                      <div className="trend-meta">
                        <span className="trend-score">{Math.round(t.score).toLocaleString()}</span>
                        {t.recent_count !== undefined && t.recent_count > 0 && (
                          <span className="trend-recent">+{t.recent_count} recent</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {}
          {activeTab === 'debug' && (
            <div id="panel-debug" className="panel" role="tabpanel" aria-labelledby="tab-debug">
              <div className="panel-header">
                <h2 className="panel-title">Cache Ring</h2>
                <span className="panel-badge">consistent hashing</span>
              </div>
              <pre className="ring-viz" aria-label="Cache ring visualization">{ringViz || 'Loading...'}</pre>
              <CacheDebugPanel currentQuery={query} />
            </div>
          )}
          {}
          {activeTab === 'stats' && stats && (
            <div id="panel-stats" className="panel" role="tabpanel" aria-labelledby="tab-stats">
              <div className="panel-header">
                <h2 className="panel-title">Performance Metrics</h2>
                <span className="panel-badge">live · 5s refresh</span>
              </div>
              <div className="stats-grid">
                <StatCard label="Cache Hit Rate" value={stats.cacheHitRate} accent="plum" />
                <StatCard label="Avg Latency" value={stats.avgLatency} accent="lichen" />
                <StatCard label="P95 Latency" value={stats.p95Latency} accent="lichen" />
                <StatCard label="DB Reads" value={stats.dbReads.toString()} accent="amber" />
                <StatCard label="DB Writes" value={stats.dbWrites.toString()} accent="amber" />
                <StatCard label="Writes Saved" value={stats.estimatedWritesSaved.toString()} accent="plum" />
                <StatCard label="Batch Flushes" value={stats.batchFlushCount.toString()} accent="smoke" />
                <StatCard label="Uptime" value={stats.uptime} accent="smoke" />
              </div>
              <div className="batch-detail">
                <h3 className="batch-title">Batch Writer Buffer</h3>
                <div className="batch-row">
                  <span>Buffered queries</span>
                  <strong>{stats.batch.bufferSize}</strong>
                </div>
                <div className="batch-row">
                  <span>Pending count delta</span>
                  <strong>{stats.batch.pendingUpdates}</strong>
                </div>
                <div className="batch-row">
                  <span>Total submissions</span>
                  <strong>{stats.batch.totalSubmissions}</strong>
                </div>
                <div className="batch-row">
                  <span>Write reduction</span>
                  <strong className="batch-reduction">{stats.batch.estimatedReduction}</strong>
                </div>
                <button
                  id="flush-now-btn"
                  className="flush-btn"
                  onClick={() => api.batchFlush().then(loadTrending)}
                >
                  Flush Now
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
function CacheDebugPanel({ currentQuery }: { currentQuery: string }) {
  const [debugQuery, setDebugQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const check = async (q: string) => {
    if (!q.trim()) return;
    try {
      const r = await api.cacheDebug(q);
      setResult(r);
    } catch {
      setResult({ error: 'Backend not reachable' });
    }
  };
  useEffect(() => {
    if (currentQuery.trim()) {
      setDebugQuery(currentQuery);
      check(currentQuery);
    }
  }, [currentQuery]);
  return (
    <div className="cache-debug">
      <h3 className="cache-debug-title">Cache Lookup Inspector</h3>
      <div className="cache-debug-input">
        <input
          id="cache-debug-input"
          value={debugQuery}
          onChange={(e) => setDebugQuery(e.target.value)}
          placeholder="Enter a prefix..."
          onKeyDown={(e) => e.key === 'Enter' && check(debugQuery)}
          aria-label="Cache debug prefix"
        />
        <button id="cache-debug-check-btn" onClick={() => check(debugQuery)}>Check</button>
      </div>
      {result && (
        <div className={`cache-result cache-result--${result.cacheHit ? 'hit' : 'miss'}`}>
          <div className="cache-result-row">
            <span>Status</span>
            <strong>{result.cacheHit ? '⚡ HIT' : '⬡ MISS'}</strong>
          </div>
          <div className="cache-result-row">
            <span>Node</span>
            <strong>{result.node}</strong>
          </div>
          <div className="cache-result-row">
            <span>Latency</span>
            <strong>{result.latencyMs}ms</strong>
          </div>
          {result.expiresIn && (
            <div className="cache-result-row">
              <span>Expires in</span>
              <strong>{result.expiresIn}</strong>
            </div>
          )}
          {result.cachedSuggestions !== undefined && (
            <div className="cache-result-row">
              <span>Cached suggestions</span>
              <strong>{result.cachedSuggestions}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={`stat-card stat-card--${accent}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
