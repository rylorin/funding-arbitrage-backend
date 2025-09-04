import { Router } from 'express';
import {
  getDashboardStats,
  getPerformanceChart,
  getTopOpportunities
} from '../controllers/dashboard';
import { authenticateToken } from '../middleware/auth';
import { generalRateLimit } from '../middleware/rateLimit';

const router = Router();

// All dashboard routes require authentication
router.use(authenticateToken);

// Dashboard endpoints
router.get('/stats', generalRateLimit, getDashboardStats);
router.get('/performance', generalRateLimit, getPerformanceChart);
router.get('/opportunities', generalRateLimit, getTopOpportunities);

export default router;