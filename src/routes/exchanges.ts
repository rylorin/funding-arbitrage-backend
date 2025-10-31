import { Router } from "express";
import Joi from "joi";
import { getExchangePairs, getExchangeStatus, getFundingRates, refreshFundingRates } from "../controllers/exchanges";
import { authenticateToken, optionalAuth } from "../middleware/auth";
import { dataFetchRateLimit, generalRateLimit } from "../middleware/rateLimit";
import { schemas, validateParams } from "../middleware/validation";

const router = Router();

// Public exchange data endpoints (with optional auth for rate limiting)
router.get("/funding-rates", dataFetchRateLimit, optionalAuth, getFundingRates);
// router.get("/opportunities", dataFetchRateLimit, optionalAuth, getArbitrageOpportunities);
router.get("/status", dataFetchRateLimit, getExchangeStatus);
router.get(
  "/:exchange/pairs",
  dataFetchRateLimit,
  validateParams(Joi.object({ exchange: schemas.exchange })),
  getExchangePairs,
);

// Protected endpoints
router.post("/refresh-rates", generalRateLimit, authenticateToken, refreshFundingRates);

export default router;
