import { Router } from 'express';
import { search } from '../controllers/searchController';

const router = Router();

router.post('/search', search);

export default router;
