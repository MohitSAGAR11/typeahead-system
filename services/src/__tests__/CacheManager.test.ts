import { CacheManager } from '../cache/CacheManager';
import { Suggestion } from '../types';
jest.mock('../utils/metrics', () => ({
  metrics: { recordCacheHit: jest.fn(), recordCacheMiss: jest.fn() },
}));
const mockSuggestions: Suggestion[] = [
  { query: 'react', count: 5000, score: 5000 },
  { query: 'react tutorial', count: 3000, score: 3000 },
];
describe('CacheManager (simulated mode)', () => {
  let cache: CacheManager;
  beforeEach(() => {
    cache = new CacheManager('simulated', 300);
  });
  it('returns a miss for a new key', async () => {
    const result = await cache.get('react');
    expect(result.hit).toBe(false);
    expect(result.entry).toBeNull();
  });
  it('returns a hit after setting', async () => {
    await cache.set('react', mockSuggestions);
    const result = await cache.get('react');
    expect(result.hit).toBe(true);
    expect(result.entry?.suggestions).toEqual(mockSuggestions);
  });
  it('normalises to lowercase', async () => {
    await cache.set('React', mockSuggestions);
    const result = await cache.get('REACT');
    expect(result.hit).toBe(true);
  });
  it('returns the responsible node name', async () => {
    const { nodeId } = await cache.get('react');
    expect(['Redis-A', 'Redis-B', 'Redis-C']).toContain(nodeId);
  });
  it('is deterministic — same prefix always maps to same node', async () => {
    const r1 = await cache.get('python');
    const r2 = await cache.get('python');
    expect(r1.nodeId).toBe(r2.nodeId);
  });
  it('invalidate removes a key', async () => {
    await cache.set('java', mockSuggestions);
    await cache.invalidate('java');
    const result = await cache.get('java');
    expect(result.hit).toBe(false);
  });
  it('different prefixes may map to different nodes', async () => {
    const nodes = new Set<string>();
    for (const prefix of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
      const { nodeId } = await cache.get(prefix);
      nodes.add(nodeId);
    }
    expect(nodes.size).toBeGreaterThan(1);
  });
  it('respects TTL — expired entries return miss', async () => {
    const shortCache = new CacheManager('simulated', 0);
    await shortCache.set('expired', mockSuggestions);
    await new Promise(r => setTimeout(r, 5));
    const result = await shortCache.get('expired');
    expect(result.hit).toBe(false);
  });
});
