export interface Suggestion {
  query: string;
  count: number;
  score: number;
}
export interface SuggestResponse {
  source: 'cache' | 'database';
  node: string;
  latency: string;
  suggestions: Suggestion[];
}
export interface TrendingItem {
  query: string;
  score: number;
  total_count?: number;
  recent_count?: number;
}
export interface TrendingResponse {
  mode: 'basic' | 'enhanced';
  windowHours?: number;
  results: TrendingItem[];
}
export type RankingMode = 'basic' | 'enhanced';
