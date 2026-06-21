
const MAX_LATENCY_SAMPLES = 10000;
class Metrics {
  private cacheHits = 0;
  private cacheMisses = 0;
  private dbReads = 0;
  private dbWrites = 0;
  private latencies: number[] = [];
  private batchFlushes = 0;
  private batchWritesSaved = 0;
  private readonly startTime = Date.now();
  recordCacheHit() { this.cacheHits++; }
  recordCacheMiss() { this.cacheMisses++; }
  recordDbRead() { this.dbReads++; }
  recordDbWrite() { this.dbWrites++; }
  recordLatency(ms: number) {
    this.latencies.push(ms);
    if (this.latencies.length > MAX_LATENCY_SAMPLES) {
      this.latencies.splice(0, this.latencies.length - MAX_LATENCY_SAMPLES);
    }
  }
  recordBatchFlush(uniqueQueries: number, writesSaved: number) {
    this.batchFlushes++;
    this.batchWritesSaved += writesSaved;
  }
  private percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }
  getSnapshot() {
    const total = this.cacheHits + this.cacheMisses;
    const hitRate = total > 0 ? ((this.cacheHits / total) * 100).toFixed(1) + '%' : '0%';
    const missRate = total > 0 ? ((this.cacheMisses / total) * 100).toFixed(1) + '%' : '0%';
    const avg = this.latencies.length > 0
      ? (this.latencies.reduce((s, v) => s + v, 0) / this.latencies.length).toFixed(1)
      : '0';
    const p95 = this.percentile(this.latencies, 95).toFixed(1);
    const uptimeMs = Date.now() - this.startTime;
    const uptime = `${Math.floor(uptimeMs / 60000)}m ${Math.floor((uptimeMs % 60000) / 1000)}s`;
    return {
      cacheHitRate: hitRate,
      cacheMissRate: missRate,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      dbReads: this.dbReads,
      dbWrites: this.dbWrites,
      avgLatency: `${avg}ms`,
      p95Latency: `${p95}ms`,
      batchFlushCount: this.batchFlushes,
      estimatedWritesSaved: this.batchWritesSaved,
      uptime,
    };
  }
}
export const metrics = new Metrics();
