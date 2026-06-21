import { Request, Response } from 'express';
import { suggestionService } from '../services/SuggestionService';
import { RankingMode } from '../types';
export async function suggest(req: Request, res: Response): Promise<void> {
  try {
    const prefix = (req.query.q as string) ?? '';
    const mode = ((req.query.mode as string) ?? 'basic') as RankingMode;
    if (typeof prefix !== 'string') {
      res.status(400).json({ error: 'Query parameter q must be a string' });
      return;
    }
    const result = await suggestionService.suggest(prefix, mode);
    res.json(result);
  } catch (err: any) {
    console.error('[SuggestController]', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
