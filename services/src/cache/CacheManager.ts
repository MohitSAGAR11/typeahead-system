
import { CacheEntry, Suggestion } from '../types';
import { ConsistentHashRing } from '../hashing/ConsistentHashRing';
import { metrics } from '../utils/metrics';
class SimulatedNode {
  private store = new Map<string, CacheEntry>();
  get(key: string): CacheEntry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiryTime) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }
  set(key: string, entry: CacheEntry): void {
    this.store.set(key, entry);
  }
  delete(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  size(): number {
    return this.store.size;
  }
}
class RedisNode {
  private client: any; 
  private prefix: string;
  constructor(client: any, nodeId: string) {
    this.client = client;
    this.prefix = `node:${nodeId}:`;
  }
  async get(key: string): Promise<CacheEntry | null> {
    const raw = await this.client.get(`${this.prefix}${key}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CacheEntry;
    } catch {
      return null;
    }
  }
  async set(key: string, entry: CacheEntry, ttlSeconds: number): Promise<void> {
    await this.client.setEx(`${this.prefix}${key}`, ttlSeconds, JSON.stringify(entry));
  }
  async delete(key: string): Promise<void> {
    await this.client.del(`${this.prefix}${key}`);
  }
}
export type CacheMode = 'simulated' | 'redis';
const NODE_IDS = ['Redis-A', 'Redis-B', 'Redis-C'];
export class CacheManager {
  private ring: ConsistentHashRing;
  private simulatedNodes: Map<string, SimulatedNode> = new Map();
  private redisNodes: Map<string, RedisNode> = new Map();
  private mode: CacheMode;
  private ttlSeconds: number;
  constructor(mode: CacheMode = 'simulated', ttlSeconds = 300) {
    this.mode = mode;
    this.ttlSeconds = ttlSeconds;
    this.ring = new ConsistentHashRing(150);
    for (const id of NODE_IDS) {
      this.ring.addNode(id);
      if (mode === 'simulated') {
        this.simulatedNodes.set(id, new SimulatedNode());
      }
    }
  }
  async connectRedis(redisUrl: string): Promise<void> {
    const redis = await import('redis');
    const client = redis.createClient({ url: redisUrl });
    await client.connect();
    for (const id of NODE_IDS) {
      this.redisNodes.set(id, new RedisNode(client, id));
    }
    this.mode = 'redis';
    console.log(`[Cache] Connected to Redis at ${redisUrl}, mode=redis`);
  }
  getResponsibleNode(prefix: string): string {
    return this.ring.getNode(prefix.toLowerCase());
  }
  async get(prefix: string): Promise<{ entry: CacheEntry | null; nodeId: string; hit: boolean }> {
    const key = prefix.toLowerCase();
    const nodeId = this.ring.getNode(key);
    let entry: CacheEntry | null = null;
    if (this.mode === 'simulated') {
      entry = this.simulatedNodes.get(nodeId)!.get(key);
    } else {
      entry = await this.redisNodes.get(nodeId)!.get(key);
    }
    const hit = entry !== null;
    if (hit) metrics.recordCacheHit();
    else metrics.recordCacheMiss();
    return { entry, nodeId, hit };
  }
  async set(prefix: string, suggestions: Suggestion[]): Promise<void> {
    const key = prefix.toLowerCase();
    const nodeId = this.ring.getNode(key);
    const entry: CacheEntry = {
      suggestions,
      expiryTime: Date.now() + this.ttlSeconds * 1000,
    };
    if (this.mode === 'simulated') {
      this.simulatedNodes.get(nodeId)!.set(key, entry);
    } else {
      await this.redisNodes.get(nodeId)!.set(key, entry, this.ttlSeconds);
    }
  }
  async invalidate(prefix: string): Promise<void> {
    const key = prefix.toLowerCase();
    const nodeId = this.ring.getNode(key);
    if (this.mode === 'simulated') {
      this.simulatedNodes.get(nodeId)!.delete(key);
    } else {
      await this.redisNodes.get(nodeId)!.delete(key);
    }
  }
  async invalidateQueryPrefixes(query: string): Promise<void> {
    const q = query.toLowerCase();
    for (let i = 1; i <= q.length; i++) {
      await this.invalidate(q.slice(0, i));
    }
  }
  visualizeRing(): string {
    return this.ring.visualize(36);
  }
  getDistribution(): Record<string, number> {
    return this.ring.getDistributionStats();
  }
  getMode(): CacheMode {
    return this.mode;
  }
  getNodeIds(): string[] {
    return NODE_IDS;
  }
}
let _cacheManager: CacheManager | null = null;
export function getCacheManager(): CacheManager {
  if (!_cacheManager) {
    const mode = (process.env.CACHE_MODE as CacheMode) ?? 'simulated';
    const ttl = parseInt(process.env.CACHE_TTL_SECONDS ?? '300', 10);
    _cacheManager = new CacheManager(mode, ttl);
  }
  return _cacheManager;
}
