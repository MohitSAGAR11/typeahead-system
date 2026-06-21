import { Router } from 'express';
import { suggest } from '../controllers/suggestController';
import { cacheDebug, cacheRing } from '../controllers/cacheController';
import { trending } from '../controllers/trendingController';
import { stats } from '../controllers/statsController';

const router = Router();

router.get('/suggest', suggest);
router.get('/cache/debug', cacheDebug);
router.get('/cache/ring', cacheRing);
router.get('/trending', trending);
router.get('/stats', stats);

export default router;
