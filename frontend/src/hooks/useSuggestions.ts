import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Suggestion, RankingMode } from '../types';
import { useDebounce } from './useDebounce';
interface UseSuggestionsResult {
  suggestions: Suggestion[];
  loading: boolean;
  error: string | null;
  source: string;
  node: string;
  latency: string;
}
export function useSuggestions(query: string, mode: RankingMode = 'basic'): UseSuggestionsResult {
  const debouncedQuery = useDebounce(query, 300);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [node, setNode] = useState('');
  const [latency, setLatency] = useState('');
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setSuggestions([]);
      setSource('');
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.suggest(debouncedQuery, mode)
      .then((res) => {
        if (cancelled) return;
        setSuggestions(res.suggestions);
        setSource(res.source);
        setNode(res.node);
        setLatency(res.latency);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e.message);
        setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [debouncedQuery, mode]);
  return { suggestions, loading, error, source, node, latency };
}
