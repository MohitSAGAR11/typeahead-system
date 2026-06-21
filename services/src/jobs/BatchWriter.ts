
import { searchQueryRepo } from '../repositories/SearchQueryRepository';
import { getCacheManager } from '../cache/CacheManager';
import { metrics } from '../utils/metrics';
interface BufferEntry {
  delta: number;
  queryText: string; 
}
export class BatchWriter {
  private buffer = new Map<string, BufferEntry>(); 
  private timer: NodeJS.Timeout | null = null;
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private isShuttingDown = false;
  private totalSubmissions = 0;
  private totalFlushes = 0;
  private totalWritesSaved = 0; 
  constructor(batchSize = 100, flushIntervalMs = 10000) {
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;
  }
  start(): void {
    this.timer = setInterval(() => this.flush('timer'), this.flushIntervalMs);
    console.log(
      `[BatchWriter] Started — batchSize=${this.batchSize}, interval=${this.flushIntervalMs}ms`
    );
  }
  stop(): void {
    this.isShuttingDown = true;
    if (this.timer) clearInterval(this.timer);
    return;
  }
  add(queryText: string): void {
    const key = queryText.toLowerCase();
    this.totalSubmissions++;
    const existing = this.buffer.get(key);
    if (existing) {
      existing.delta++;
    } else {
      this.buffer.set(key, { delta: 1, queryText });
    }
    searchQueryRepo.recordRecentEvent(queryText).catch((e) =>
      console.warn('[BatchWriter] Recent event write failed:', e.message)
    );
    if (this.buffer.size >= this.batchSize) {
      this.flush('size_threshold').catch((e) =>
        console.error('[BatchWriter] Flush error:', e)
      );
    }
  }
  async flush(reason: string): Promise<void> {
    if (this.buffer.size === 0) return;
    const snapshot = new Map(this.buffer);
    this.buffer.clear();
    const entries = Array.from(snapshot.entries()).map(([key, v]) => ({
      query: key,
      delta: v.delta,
    }));
    const individualWritesSaved = entries.reduce((s, e) => s + e.delta - 1, 0);
    this.totalWritesSaved += individualWritesSaved;
    this.totalFlushes++;
    console.log(
      `[BatchWriter] Flushing ${entries.length} unique queries ` +
        `(${entries.reduce((s, e) => s + e.delta, 0)} total submissions, ` +
        `saved ${individualWritesSaved} DB writes) — reason: ${reason}`
    );
    try {
      await searchQueryRepo.batchUpsert(entries);
      const cache = getCacheManager();
      const invalidations = entries.flatMap((e) => {
        const q = e.query;
        return Array.from({ length: q.length }, (_, i) => q.slice(0, i + 1));
      });
      const uniquePrefixes = [...new Set(invalidations)];
      await Promise.allSettled(uniquePrefixes.map((p) => cache.invalidate(p)));
      metrics.recordBatchFlush(entries.length, individualWritesSaved);
    } catch (err) {
      console.error('[BatchWriter] DB flush failed:', err);
      for (const e of entries) {
        const existing = this.buffer.get(e.query);
        if (existing) existing.delta += e.delta;
        else this.buffer.set(e.query, { delta: e.delta, queryText: e.query });
      }
    }
  }
  getStats() {
    return {
      bufferSize: this.buffer.size,
      pendingUpdates: Array.from(this.buffer.values()).reduce((s, e) => s + e.delta, 0),
      totalSubmissions: this.totalSubmissions,
      totalFlushes: this.totalFlushes,
      totalWritesSaved: this.totalWritesSaved,
      estimatedReduction: this.totalSubmissions > 0
        ? `${Math.round((this.totalWritesSaved / this.totalSubmissions) * 100)}%`
        : '0%',
    };
  }
  peekBuffer(): Array<{ query: string; delta: number }> {
    return Array.from(this.buffer.entries()).map(([q, v]) => ({
      query: q,
      delta: v.delta,
    }));
  }
}
export const batchWriter = new BatchWriter(
  parseInt(process.env.BATCH_SIZE ?? '100', 10),
  parseInt(process.env.BATCH_FLUSH_INTERVAL_MS ?? '10000', 10)
);
