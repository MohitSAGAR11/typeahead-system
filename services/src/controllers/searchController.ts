import { Request, Response } from 'express';
import { publishSearchEvent } from '../messaging/KafkaClient';
export async function search(req: Request, res: Response): Promise<void> {
  try {
    const { query } = req.body as { query?: string };
    if (!query || typeof query !== 'string' || query.trim() === '') {
      res.status(400).json({ error: 'query field is required and must be a non-empty string' });
      return;
    }
    const normalised = query.trim();
    await publishSearchEvent(normalised);
    res.json({ message: 'Search queued' });
  } catch (err: any) {
    console.error('[SearchController]', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
}
