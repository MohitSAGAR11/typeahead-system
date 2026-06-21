import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
dotenv.config();
import { requestLogger } from './middleware/logger';
import routes from './routes';

export function createApp(apiRoutes: express.Router = routes): express.Express {
  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json());
  app.use(requestLogger);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/api', apiRoutes);
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[Unhandled]', err);
    res.status(500).json({ error: 'Internal Server Error' });
  });
  return app;
}

const app = createApp();
export default app;
