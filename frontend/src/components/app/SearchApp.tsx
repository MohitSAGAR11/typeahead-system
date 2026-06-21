import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import { useSuggestions } from '../../hooks/useSuggestions';
import { useStats } from '../../hooks/useStats';
import { RankingMode, TrendingItem } from '../../types';

export default function SearchApp() {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [rankingMode, setRankingMode] = useState<RankingMode>('enhanced');
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [searchMsg, setSearchMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const { suggestions, loading, error } = useSuggestions(query, rankingMode);
  const stats = useStats(5000);

  const loadTrending = useCallback(() => {
    api.trending(rankingMode).then((r) => setTrending(r.results)).catch(() => {});
  }, [rankingMode]);

  useEffect(() => {
    loadTrending();
  }, [loadTrending]);

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
      setSubmitted(q);
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
      handleSearch(activeIdx >= 0 ? suggestions[activeIdx].query : query);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIdx(-1);
    }
  };

  return (
    <div className="app-shell">
      {stats && (
        <div className="metrics-bar" aria-label="Live system metrics">
          <div className="metrics-bar-inner">
            <span className="metrics-pill metrics-pill--green">
              <span className="metrics-dot" />
              <span className="metrics-label">Cache Hit</span>
              <span className="metrics-value">{stats.cacheHitRate}</span>
            </span>
            <span className="metrics-divider" />
            <span className="metrics-pill">
              <span className="metrics-label">Avg Latency</span>
              <span className="metrics-value metrics-value--amber">{stats.avgLatency}</span>
            </span>
            <span className="metrics-divider" />
            <span className="metrics-pill">
              <span className="metrics-label">P95</span>
              <span className="metrics-value metrics-value--amber">{stats.p95Latency}</span>
            </span>
            <span className="metrics-divider" />
            <span className="metrics-pill">
              <span className="metrics-label">Writes Saved</span>
              <span className="metrics-value metrics-value--plum">{stats.estimatedWritesSaved.toLocaleString()}</span>
            </span>
            <span className="metrics-divider" />
            <span className="metrics-pill">
              <span className="metrics-label">Uptime</span>
              <span className="metrics-value">{stats.uptime}</span>
            </span>
          </div>
        </div>
      )}
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

          <p className="eyebrow eyebrow--center">Distributed Typeahead Engine</p>
          <h1 className="search-headline">Search anything.</h1>
          <p className="search-subline">
            {rankingMode === 'enhanced' ? 'Time-decayed ranking' : 'Frequency ranking'} for fast suggestions.
          </p>

          <div className="search-ranking-toggle">
            <div className="ranking-toggle" role="group" aria-label="Ranking mode">
              <span className="ranking-label">Ranking</span>
              {(['basic', 'enhanced'] as RankingMode[]).map((mode) => (
                <button
                  key={mode}
                  id={`ranking-btn-${mode}`}
                  className={`ranking-btn ${rankingMode === mode ? 'ranking-btn--active' : ''}`}
                  onClick={() => setRankingMode(mode)}
                  aria-pressed={rankingMode === mode}
                >
                  {mode === 'basic' ? 'Basic' : 'Enhanced'}
                </button>
              ))}
            </div>
          </div>

          <div className="search-wrapper" role="search">
            <div className="search-box" id="search-box">
              <svg className="search-icon-svg" width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <circle cx="7.5" cy="7.5" r="5.5" stroke="var(--color-smoke)" strokeWidth="1.5" />
                <line x1="11.5" y1="11.5" x2="16" y2="16" stroke="var(--color-smoke)" strokeWidth="1.5" strokeLinecap="round" />
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

            {showDropdown && suggestions.length > 0 && (
              <ul
                id="search-dropdown"
                className="search-dropdown"
                role="listbox"
                aria-label="Search suggestions"
              >
                {suggestions.map((suggestion, index) => (
                  <li
                    key={suggestion.query}
                    id={`suggestion-${index}`}
                    className={`dropdown-item ${index === activeIdx ? 'dropdown-item--active' : ''}`}
                    role="option"
                    aria-selected={index === activeIdx}
                    onMouseDown={() => handleSearch(suggestion.query)}
                    onMouseEnter={() => setActiveIdx(index)}
                  >
                    <span className="dropdown-query">{suggestion.query}</span>
                    <span className="dropdown-meta">
                      <span className="dropdown-count">{suggestion.count.toLocaleString()}</span>
                      {rankingMode === 'enhanced' && (
                        <span className="dropdown-score">score {Math.round(suggestion.score).toLocaleString()}</span>
                      )}
                    </span>
                  </li>
                ))}
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
                  <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                  <line x1="7" y1="4" x2="7" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="7" cy="10" r="0.75" fill="currentColor" />
                </svg>
                {error} - is the backend running?
              </div>
            )}
          </div>

          {searchMsg && (
            <div className="search-toast" role="status" aria-live="polite">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="var(--color-lichen)" strokeWidth="1.5" />
                <polyline points="4,7 6,9 10,5" stroke="var(--color-lichen)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {searchMsg} - <strong>"{submitted}"</strong>
            </div>
          )}
        </div>

        <div className="panels-area">
          <div id="panel-trending" className="panel" aria-labelledby="trending-title">
            <div className="panel-header">
              <h2 id="trending-title" className="panel-title">Trending Searches</h2>
              <span className="panel-badge">{rankingMode}</span>
              <button
                id="refresh-trending-btn"
                className="panel-refresh-btn"
                onClick={loadTrending}
                aria-label="Refresh trending"
              >
                Refresh
              </button>
            </div>

            {trending.length === 0 ? (
              <p className="panel-empty">No trending data yet. Submit some searches.</p>
            ) : (
              <ol className="trending-list" aria-label="Trending searches list">
                {trending.map((item, index) => (
                  <li
                    key={item.query}
                    id={`trending-${index}`}
                    className="trending-item"
                    onClick={() => {
                      setQuery(item.query);
                      inputRef.current?.focus();
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className="trend-rank">#{index + 1}</span>
                    <span className="trend-query">{item.query}</span>
                    <div className="trend-meta">
                      <span className="trend-score">{Math.round(item.score).toLocaleString()}</span>
                      {item.recent_count !== undefined && item.recent_count > 0 && (
                        <span className="trend-recent">+{item.recent_count} recent</span>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
