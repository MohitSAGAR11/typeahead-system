import { SuggestResponse, TrendingResponse, RankingMode } from '../types';
const BASE = '/api';
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
export const api = {
  suggest: (q: string, mode: RankingMode = 'basic') =>
    get<SuggestResponse>(`/suggest?q=${encodeURIComponent(q)}&mode=${mode}`),
  search: (query: string) =>
    post<{ message: string }>('/search', { query }),
  trending: (mode: RankingMode = 'enhanced') =>
    get<TrendingResponse>(`/trending?mode=${mode}`),
};
