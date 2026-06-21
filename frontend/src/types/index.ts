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
export interface CacheDebugInfo {
  prefix: string;
  node: string;
  cacheHit: boolean;
  latencyMs: number;
  mode: string;
  cachedSuggestions: number;
  expiresIn: string | null;
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
export interface Stats {
  cacheHitRate: string;
  cacheMissRate: string;
  cacheHits: number;
  cacheMisses: number;
  dbReads: number;
  dbWrites: number;
  avgLatency: string;
  p95Latency: string;
  batchFlushCount: number;
  estimatedWritesSaved: number;
  uptime: string;
  batch: {
    bufferSize: number;
    pendingUpdates: number;
    totalSubmissions: number;
    totalFlushes: number;
    totalWritesSaved: number;
    estimatedReduction: string;
  };
}
export type RankingMode = 'basic' | 'enhanced';
