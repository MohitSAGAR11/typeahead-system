import { Request, Response, NextFunction } from 'express';
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const dur = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${dur}ms)`);
  });
  next();
}
