
import * as crypto from 'crypto';
export interface RingNode {
  nodeId: string;       
  virtualId: string;    
  position: number;     
}
export class ConsistentHashRing {
  private ring: RingNode[] = [];           
  private nodeSet = new Set<string>();
  private readonly virtualNodes: number;
  constructor(virtualNodes = 150) {
    this.virtualNodes = virtualNodes;
  }
  private hash(key: string): number {
    let hash = 2166136261; 
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
  addNode(nodeId: string): void {
    if (this.nodeSet.has(nodeId)) return;
    this.nodeSet.add(nodeId);
    for (let i = 0; i < this.virtualNodes; i++) {
      const virtualId = `${nodeId}#${i}`;
      const position = this.hash(virtualId);
      this.ring.push({ nodeId, virtualId, position });
    }
    this.ring.sort((a, b) => a.position - b.position);
  }
  removeNode(nodeId: string): void {
    if (!this.nodeSet.has(nodeId)) return;
    this.nodeSet.delete(nodeId);
    this.ring = this.ring.filter(n => n.nodeId !== nodeId);
  }
  getNode(key: string): string {
    if (this.ring.length === 0) throw new Error('Hash ring is empty');
    const keyHash = this.hash(key);
    let lo = 0;
    let hi = this.ring.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.ring[mid].position < keyHash) lo = mid + 1;
      else hi = mid;
    }
    const idx = lo % this.ring.length;
    return this.ring[idx].nodeId;
  }
  getNodes(): string[] {
    return Array.from(this.nodeSet);
  }
  visualize(segments = 36): string {
    if (this.ring.length === 0) return 'Ring is empty';
    const maxHash = 4294967295; 
    const step = Math.floor(maxHash / segments);
    const lines: string[] = ['', '  ── Consistent Hash Ring ──', ''];
    const seen = new Set<string>();
    for (let s = 0; s < segments; s++) {
      const pos = s * step;
      let lo = 0;
      let hi = this.ring.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (this.ring[mid].position < pos) lo = mid + 1;
        else hi = mid;
      }
      const idx = lo % this.ring.length;
      const node = this.ring[idx];
      const pct = Math.round((pos / maxHash) * 100);
      const key = `${pct}%`;
      if (!seen.has(key)) {
        seen.add(key);
        const bar = '─'.repeat(Math.max(0, 8 - String(pct).length));
        lines.push(`  ${String(pct).padStart(3)}% ${bar}→ ${node.nodeId}  [vnode: ${node.virtualId}]`);
      }
    }
    lines.push('');
    lines.push(`  Physical nodes (${this.nodeSet.size}): ${Array.from(this.nodeSet).join(', ')}`);
    lines.push(`  Virtual nodes per physical: ${this.virtualNodes}`);
    lines.push(`  Total ring entries: ${this.ring.length}`);
    lines.push('');
    return lines.join('\n');
  }
  getDistributionStats(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const node of this.nodeSet) counts[node] = 0;
    for (const entry of this.ring) counts[entry.nodeId]++;
    return counts;
  }
}
