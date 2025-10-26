import { Request, Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";

const createRateLimiter = (windowMs: number, max: number, message?: string) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      error: message || "Too many requests, please try again later",
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request): string => {
      // Use authenticated user ID if available, otherwise fall back to IP
      const userIdentifier = (req as any).user?.id || ipKeyGenerator(req.ip || "-");
      return `${req.route?.path || req.path}:${userIdentifier}`;
    },
    handler: (_req: Request, res: Response) => {
      res.status(429).json({
        error: "Rate limit exceeded",
        message: message || "Too many requests, please try again later",
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  });
};

// General API rate limiting
export const generalRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  100, // limit each user to 100 requests per windowMs
  "Too many requests from this user",
);

// Authentication rate limiting
export const authRateLimit = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // limit each user to 5 auth requests per windowMs
  "Too many authentication attempts",
);

// Position creation rate limiting
export const positionRateLimit = createRateLimiter(
  5 * 60 * 1000, // 5 minutes
  10, // limit each user to 10 position creations per windowMs
  "Too many position creation attempts",
);

// WebSocket connection rate limiting
export const websocketRateLimit = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  5, // limit each user to 5 WebSocket connections per windowMs
  "Too many WebSocket connection attempts",
);

// Data fetching rate limiting (for public endpoints)
export const dataFetchRateLimit = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  60, // limit each user to 60 data fetch requests per windowMs
  "Too many data fetch requests",
);

export { createRateLimiter };
