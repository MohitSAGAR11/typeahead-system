import { ConsistentHashRing } from '../hashing/ConsistentHashRing';
describe('ConsistentHashRing', () => {
  let ring: ConsistentHashRing;
  beforeEach(() => {
    ring = new ConsistentHashRing(150);
  });
  describe('addNode / getNodes', () => {
    it('starts empty', () => {
      expect(ring.getNodes()).toHaveLength(0);
    });
    it('adds nodes', () => {
      ring.addNode('Redis-A');
      ring.addNode('Redis-B');
      expect(ring.getNodes()).toHaveLength(2);
    });
    it('does not add duplicate nodes', () => {
      ring.addNode('Redis-A');
      ring.addNode('Redis-A');
      expect(ring.getNodes()).toHaveLength(1);
    });
  });
  describe('removeNode', () => {
    it('removes a node', () => {
      ring.addNode('Redis-A');
      ring.addNode('Redis-B');
      ring.removeNode('Redis-A');
      expect(ring.getNodes()).toHaveLength(1);
      expect(ring.getNodes()).not.toContain('Redis-A');
    });
    it('ignores removal of non-existent node', () => {
      ring.addNode('Redis-A');
      ring.removeNode('Redis-Z');
      expect(ring.getNodes()).toHaveLength(1);
    });
  });
  describe('getNode', () => {
    beforeEach(() => {
      ring.addNode('Redis-A');
      ring.addNode('Redis-B');
      ring.addNode('Redis-C');
    });
    it('always returns one of the added nodes', () => {
      const nodes = new Set(['Redis-A', 'Redis-B', 'Redis-C']);
      for (const key of ['react', 'python', 'java', 'iphone', 'typescript']) {
        expect(nodes.has(ring.getNode(key))).toBe(true);
      }
    });
    it('is deterministic for the same key', () => {
      const node1 = ring.getNode('react tutorial');
      const node2 = ring.getNode('react tutorial');
      expect(node1).toBe(node2);
    });
    it('distributes keys across nodes (not all on one)', () => {
      const distribution: Record<string, number> = { 'Redis-A': 0, 'Redis-B': 0, 'Redis-C': 0 };
      const keys = Array.from({ length: 300 }, (_, i) => `key-${i}`);
      for (const k of keys) distribution[ring.getNode(k)]++;
      for (const node of Object.keys(distribution)) {
        expect(distribution[node]).toBeGreaterThan(15); 
      }
    });
    it('throws when ring is empty', () => {
      const emptyRing = new ConsistentHashRing();
      expect(() => emptyRing.getNode('key')).toThrow();
    });
    it('remaps minimal keys when a node is added', () => {
      const keys = Array.from({ length: 200 }, (_, i) => `prefix-${i}`);
      const before = new Map(keys.map((k) => [k, ring.getNode(k)]));
      ring.addNode('Redis-D');
      let remapped = 0;
      for (const k of keys) {
        if (ring.getNode(k) !== before.get(k)) remapped++;
      }
      expect(remapped).toBeLessThan(keys.length * 0.5);
      console.log(`  Keys remapped on node addition: ${remapped}/${keys.length} (${Math.round(remapped/keys.length*100)}%)`);
    });
  });
  describe('distribution stats', () => {
    it('returns counts for all nodes', () => {
      ring.addNode('Redis-A');
      ring.addNode('Redis-B');
      ring.addNode('Redis-C');
      const dist = ring.getDistributionStats();
      expect(Object.keys(dist)).toHaveLength(3);
      const total = Object.values(dist).reduce((s, v) => s + v, 0);
      expect(total).toBe(150 * 3); 
    });
  });
  describe('visualize', () => {
    it('returns a non-empty string', () => {
      ring.addNode('Redis-A');
      ring.addNode('Redis-B');
      const viz = ring.visualize();
      expect(typeof viz).toBe('string');
      expect(viz.length).toBeGreaterThan(10);
    });
  });
});
