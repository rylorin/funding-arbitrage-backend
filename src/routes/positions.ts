import { Router } from "express";
import Joi from "joi";
import {
  createPosition,
  getPositions,
  getPosition,
  updatePosition,
  closePosition,
  getPositionPnL,
  getPositionsDashboard,
  getPositionDetails,
  getPositionAlerts,
  getPositionPerformance,
} from "../controllers/positions";
import { authenticateToken } from "../middleware/auth";
import { positionRateLimit, generalRateLimit } from "../middleware/rateLimit";
import { validateParams, schemas } from "../middleware/validation";

const router = Router();

// All position routes require authentication
router.use(authenticateToken);

// Enhanced position monitoring endpoints (Priority 2)
router.get("/dashboard", generalRateLimit, getPositionsDashboard);
router.get("/alerts", generalRateLimit, getPositionAlerts);
router.get("/performance", generalRateLimit, getPositionPerformance);

// Position CRUD operations
router.post("/", positionRateLimit, createPosition);
router.get("/", generalRateLimit, getPositions);
router.get("/:id", generalRateLimit, validateParams(Joi.object({ id: schemas.uuid })), getPosition);
router.get("/:id/details", generalRateLimit, validateParams(Joi.object({ id: schemas.uuid })), getPositionDetails);
router.put("/:id", generalRateLimit, validateParams(Joi.object({ id: schemas.uuid })), updatePosition);
router.delete("/:id", positionRateLimit, validateParams(Joi.object({ id: schemas.uuid })), closePosition);

// Position analytics
router.get("/:id/pnl", generalRateLimit, validateParams(Joi.object({ id: schemas.uuid })), getPositionPnL);

export default router;
