import { Request, Response } from 'express';
import { getCacheManager } from '../cache/CacheManager';
export async function cacheDebug(req: Request, res: Response): Promise<void> {
  try {
    const prefix = (req.query.prefix as string) ?? '';
    if (!prefix) {
      res.status(400).json({ error: 'prefix query parameter is required' });
      return;
    }
    const cache = getCacheManager();
    const start = Date.now();
    const { entry, nodeId, hit } = await cache.get(prefix);
    const latencyMs = Date.now() - start;
    res.json({
      prefix,
      node: nodeId,
      cacheHit: hit,
      latencyMs,
      mode: cache.getMode(),
      cachedSuggestions: hit && entry ? entry.suggestions.length : 0,
      expiresIn: hit && entry ? Math.max(0, Math.round((entry.expiryTime - Date.now()) / 1000)) + 's' : null,
    });
  } catch (err: any) {
    console.error('[CacheDebugController]', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
export async function cacheRing(req: Request, res: Response): Promise<void> {
  const cache = getCacheManager();
  res.json({
    visualization: cache.visualizeRing(),
    distribution: cache.getDistribution(),
    mode: cache.getMode(),
    nodes: cache.getNodeIds(),
  });
}
