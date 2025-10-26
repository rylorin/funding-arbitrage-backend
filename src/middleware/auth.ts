import { Request, Response, NextFunction } from "express";
import { authService } from "../services/web3/AuthService";
import { AuthTokenPayload } from "../types/index";

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    walletAddress: string;
    tokenPayload: AuthTokenPayload;
  };
}

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // Skip authentication in development mode
    if (process.env.NODE_ENV === "development") {
      req.user = {
        id: "dev-user",
        walletAddress: "0xDEVELOPMENT",
        tokenPayload: {
          walletAddress: "0xDEVELOPMENT",
          userId: "dev-user",
          iat: Date.now(),
          exp: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
        },
      };
      return next();
    }

    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ error: "Access token required" });
      return;
    }

    const decoded = authService.verifyToken(token);
    if (!decoded) {
      res.status(403).json({ error: "Invalid or expired token" });
      return;
    }

    const user = await authService.getUserFromToken(token);
    if (!user) {
      res.status(403).json({ error: "User not found" });
      return;
    }

    req.user = {
      id: user.id,
      walletAddress: user.walletAddress,
      tokenPayload: decoded,
    };

    next();
  } catch (error) {
    console.error("Authentication error:", error);
    res.status(500).json({ error: "Internal authentication error" });
  }
};

export const optionalAuth = async (req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (token) {
      const decoded = authService.verifyToken(token);
      if (decoded) {
        const user = await authService.getUserFromToken(token);
        if (user) {
          req.user = {
            id: user.id,
            walletAddress: user.walletAddress,
            tokenPayload: decoded,
          };
        }
      }
    }

    next();
  } catch (error) {
    console.error("Optional auth error:", error);
    next();
  }
};

export type { AuthenticatedRequest };
