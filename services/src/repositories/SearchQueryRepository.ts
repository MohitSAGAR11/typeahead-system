
import { query } from '../database/connection';
import { Suggestion, SearchQuery } from '../types';
import { metrics } from '../utils/metrics';
export class SearchQueryRepository {
  async getSuggestions(prefix: string, limit = 10): Promise<Suggestion[]> {
    const start = Date.now();
    metrics.recordDbRead();
    const sql = `
      SELECT query, count
      FROM search_queries
      WHERE LOWER(query) LIKE LOWER($1) || '%'
      ORDER BY count DESC
      LIMIT $2
    `;
    const rows = await query<{ query: string; count: string }>(sql, [prefix.toLowerCase(), limit]);
    metrics.recordLatency(Date.now() - start);
    return rows.map((r) => ({
      query: r.query,
      count: parseInt(r.count, 10),
      score: parseInt(r.count, 10),
    }));
  }
  async getSuggestionsEnhanced(
    prefix: string,
    limit = 10,
    windowHours = 24
  ): Promise<Suggestion[]> {
    const start = Date.now();
    metrics.recordDbRead();
    const sql = `
      WITH recent AS (
        SELECT LOWER(query) AS q, COUNT(*) AS recent_count
        FROM recent_search_events
        WHERE searched_at > NOW() - INTERVAL '${windowHours} hours'
          AND LOWER(query) LIKE LOWER($1) || '%'
        GROUP BY LOWER(query)
      )
      SELECT
        sq.query,
        sq.count,
        COALESCE(r.recent_count, 0)::BIGINT AS recent_count,
        (sq.count * 0.7 + COALESCE(r.recent_count, 0) * 0.3 * GREATEST(sq.count / NULLIF(r.recent_count, 0), 1))::NUMERIC AS score
      FROM search_queries sq
      LEFT JOIN recent r ON LOWER(sq.query) = r.q
      WHERE LOWER(sq.query) LIKE LOWER($1) || '%'
      ORDER BY score DESC
      LIMIT $2
    `;
    const rows = await query<{
      query: string;
      count: string;
      recent_count: string;
      score: string;
    }>(sql, [prefix.toLowerCase(), limit]);
    metrics.recordLatency(Date.now() - start);
    return rows.map((r) => ({
      query: r.query,
      count: parseInt(r.count, 10),
      score: parseFloat(r.score),
    }));
  }
  async upsertQuery(queryText: string, delta = 1): Promise<void> {
    metrics.recordDbWrite();
    const sql = `
      INSERT INTO search_queries (query, count)
      VALUES (LOWER($1), $2)
      ON CONFLICT (LOWER(query))
      DO UPDATE SET
        count = search_queries.count + EXCLUDED.count,
        updated_at = NOW()
    `;
    await query(sql, [queryText, delta]);
  }
  async batchUpsert(entries: Array<{ query: string; delta: number }>): Promise<void> {
    if (entries.length === 0) return;
    metrics.recordDbWrite(); 
    const values: any[] = [];
    const placeholders: string[] = [];
    entries.forEach((e, i) => {
      const base = i * 2;
      placeholders.push(`($${base + 1}, $${base + 2})`);
      values.push(e.query.toLowerCase(), e.delta);
    });
    const sql = `
      INSERT INTO search_queries (query, count)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (LOWER(query))
      DO UPDATE SET
        count = search_queries.count + EXCLUDED.count,
        updated_at = NOW()
    `;
    await query(sql, values);
  }
  async recordRecentEvent(queryText: string): Promise<void> {
    const sql = `INSERT INTO recent_search_events (query) VALUES (LOWER($1))`;
    await query(sql, [queryText]);
  }
  async getTrendingBasic(limit = 10): Promise<Array<{ query: string; score: number }>> {
    metrics.recordDbRead();
    const sql = `
      SELECT query, count AS score
      FROM search_queries
      ORDER BY count DESC
      LIMIT $1
    `;
    const rows = await query<{ query: string; score: string }>(sql, [limit]);
    return rows.map((r) => ({ query: r.query, score: parseFloat(r.score) }));
  }
  async getTrendingEnhanced(limit = 10, windowHours = 24): Promise<Array<{ query: string; score: number; total_count: number; recent_count: number }>> {
    metrics.recordDbRead();
    const sql = `
      WITH recent AS (
        SELECT LOWER(query) AS q, COUNT(*) AS recent_count
        FROM recent_search_events
        WHERE searched_at > NOW() - INTERVAL '${windowHours} hours'
        GROUP BY LOWER(query)
      )
      SELECT
        sq.query,
        sq.count::BIGINT AS total_count,
        COALESCE(r.recent_count, 0)::BIGINT AS recent_count,
        (sq.count * 0.7 + COALESCE(r.recent_count, 0) * 500)::NUMERIC AS score
      FROM search_queries sq
      LEFT JOIN recent r ON LOWER(sq.query) = r.q
      ORDER BY score DESC
      LIMIT $1
    `;
    const rows = await query<{
      query: string;
      total_count: string;
      recent_count: string;
      score: string;
    }>(sql, [limit]);
    return rows.map((r) => ({
      query: r.query,
      total_count: parseInt(r.total_count, 10),
      recent_count: parseInt(r.recent_count, 10),
      score: parseFloat(r.score),
    }));
  }
}
export const searchQueryRepo = new SearchQueryRepository();
