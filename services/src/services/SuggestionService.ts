
import { getCacheManager } from '../cache/CacheManager';
import { searchQueryRepo } from '../repositories/SearchQueryRepository';
import { SuggestResponse, RankingMode } from '../types';
import { metrics } from '../utils/metrics';
export class SuggestionService {
  private cache = getCacheManager();
  async suggest(
    prefix: string,
    rankingMode: RankingMode = 'basic',
    limit = 10
  ): Promise<SuggestResponse> {
    const start = Date.now();
    const normalised = prefix.toLowerCase().trim();
    if (!normalised) {
      return {
        source: 'cache',
        node: 'none',
        latency: '0ms',
        suggestions: [],
      };
    }
    const { entry, nodeId, hit } = await this.cache.get(normalised);
    if (hit && entry) {
      const latency = Date.now() - start;
      metrics.recordLatency(latency);
      return {
        source: 'cache',
        node: nodeId,
        latency: `${latency}ms`,
        suggestions: entry.suggestions,
      };
    }
    let suggestions;
    if (rankingMode === 'enhanced') {
      const windowHours = parseInt(process.env.TRENDING_WINDOW_HOURS ?? '24', 10);
      suggestions = await searchQueryRepo.getSuggestionsEnhanced(normalised, limit, windowHours);
    } else {
      suggestions = await searchQueryRepo.getSuggestions(normalised, limit);
    }
    await this.cache.set(normalised, suggestions);
    const latency = Date.now() - start;
    metrics.recordLatency(latency);
    return {
      source: 'database',
      node: nodeId,
      latency: `${latency}ms`,
      suggestions,
    };
  }
}
export const suggestionService = new SuggestionService();
