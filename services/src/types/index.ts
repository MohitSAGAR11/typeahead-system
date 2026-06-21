
export interface Suggestion {
  query: string;
  count: number;
  score: number; 
}
export interface SearchQuery {
  id: number;
  query: string;
  count: number;
  created_at: Date;
  updated_at: Date;
}
export interface RecentSearchEvent {
  id: number;
  query: string;
  timestamp: Date;
}
export interface CacheEntry {
  suggestions: Suggestion[];
  expiryTime: number; 
}
export interface CacheDebugInfo {
  prefix: string;
  node: string;
  cacheHit: boolean;
  latencyMs: number;
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
  total_count: number;
  recent_count: number;
}
export interface BatchEntry {
  query: string;
  delta: number;
}
export interface MetricsSnapshot {
  cacheHits: number;
  cacheMisses: number;
  dbReads: number;
  dbWrites: number;
  latencies: number[]; 
  batchFlushCount: number;
  batchWritesSaved: number; 
}
export interface StatsResponse {
  cacheHitRate: string;
  cacheMissRate: string;
  dbReads: number;
  dbWrites: number;
  avgLatency: string;
  p95Latency: string;
  batchFlushCount: number;
  estimatedWritesSaved: number;
  uptime: string;
}
export type RankingMode = 'basic' | 'enhanced';
