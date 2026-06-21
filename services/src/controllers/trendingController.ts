import { Request, Response } from 'express';
import { searchQueryRepo } from '../repositories/SearchQueryRepository';
export async function trending(req: Request, res: Response): Promise<void> {
  try {
    const mode = (req.query.mode as string) ?? 'enhanced';
    const limit = parseInt((req.query.limit as string) ?? '10', 10);
    const windowHours = parseInt((req.query.window as string) ?? '24', 10);
    if (mode === 'basic') {
      const results = await searchQueryRepo.getTrendingBasic(limit);
      res.json({ mode: 'basic', results });
    } else {
      const results = await searchQueryRepo.getTrendingEnhanced(limit, windowHours);
      res.json({ mode: 'enhanced', windowHours, results });
    }
  } catch (err: any) {
    console.error('[TrendingController]', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
