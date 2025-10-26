import { Router } from "express";
import { generateChallenge, verifySignature, getProfile, updateSettings, refreshToken } from "../controllers/auth";
import { authenticateToken } from "../middleware/auth";
import { authRateLimit, generalRateLimit } from "../middleware/rateLimit";

const router = Router();

// Public auth routes
router.post("/challenge", authRateLimit, generateChallenge);
router.post("/verify", authRateLimit, verifySignature);

// Protected auth routes
router.get("/profile", generalRateLimit, authenticateToken, getProfile);
router.put("/settings", generalRateLimit, authenticateToken, updateSettings);
router.post("/refresh", authRateLimit, authenticateToken, refreshToken);

export default router;
