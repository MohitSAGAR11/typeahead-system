import { Request, Response } from 'express';
import { metrics } from '../utils/metrics';
export async function stats(req: Request, res: Response): Promise<void> {
  const snap = metrics.getSnapshot();
  res.json({
    ...snap,
    batch: {
      status: 'batch-writer runs in a separate container',
    },
  });
}
export async function batchStatus(req: Request, res: Response): Promise<void> {
  res.status(503).json({ error: 'Batch writer runs in a separate container' });
}
export async function batchFlushNow(req: Request, res: Response): Promise<void> {
  res.status(503).json({ error: 'Manual flush is not exposed by the split service architecture' });
}
