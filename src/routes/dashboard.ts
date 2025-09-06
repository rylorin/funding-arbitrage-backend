import { Router } from 'express';
import {
  getDashboard,
  getFundingRatesTable,
  getArbitrageOpportunities,
  getMarketOverview
} from '../controllers/dashboard';
import { generalRateLimit } from '../middleware/rateLimit';

const router = Router();

// Apply rate limiting to all dashboard routes
router.use(generalRateLimit);

// Main dashboard endpoint
router.get('/', getDashboard);

// Funding rates table with sorting and filtering
router.get('/funding-rates', getFundingRatesTable);

// Arbitrage opportunities with filtering
router.get('/opportunities', getArbitrageOpportunities);

// Market overview and statistics
router.get('/overview', getMarketOverview);

export default router;