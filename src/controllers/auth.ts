import { Request, Response } from "express";
import Joi from "joi";
import { authService } from "../services/web3/AuthService";
import { walletService } from "../services/web3/WalletService";

const challengeSchema = Joi.object({
  walletAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .required(),
});

const verifySchema = Joi.object({
  walletAddress: Joi.string()
    .pattern(/^0x[a-fA-F0-9]{40}$/)
    .required(),
  signature: Joi.string().required(),
  message: Joi.string().required(),
});

export const generateChallenge = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = challengeSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: "Validation error",
        details: error.details,
      });
      return;
    }

    const { walletAddress } = value;

    // Validate wallet address
    const walletValidation = await walletService.validateWallet(walletAddress);
    if (!walletValidation.valid) {
      res.status(400).json({
        error: "Invalid wallet address",
        message: walletValidation.error,
      });
      return;
    }

    const challenge = authService.generateChallenge(walletAddress);

    res.json({
      message: challenge.message,
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt,
    });
  } catch (error) {
    console.error("Challenge generation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const verifySignature = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { error, value } = verifySchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: "Validation error",
        details: error.details,
      });
      return;
    }

    const { walletAddress, signature, message } = value;

    const result = await authService.verifySignature(
      walletAddress,
      signature,
      message,
    );

    if (!result.success) {
      res.status(401).json({
        error: "Authentication failed",
        message: result.error,
      });
      return;
    }

    res.json({
      success: true,
      token: result.token,
      user: {
        id: result.user!.id,
        walletAddress: result.user!.walletAddress,
        settings: result.user!.settings,
        createdAt: result.user!.createdAt,
      },
    });
  } catch (error) {
    console.error("Signature verification error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getProfile = async (req: any, res: Response): Promise<void> => {
  try {
    const user = await authService.getUserFromToken(
      req.headers.authorization?.split(" ")[1],
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      id: user.id,
      walletAddress: user.walletAddress,
      settings: user.settings,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error("Profile fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateSettings = async (
  req: any,
  res: Response,
): Promise<void> => {
  try {
    const settingsSchema = Joi.object({
      autoCloseAPRThreshold: Joi.number().min(0).max(100).optional(),
      autoClosePnLThreshold: Joi.number().min(-100).max(0).optional(),
      autoCloseTimeoutHours: Joi.number().integer().min(1).max(8760).optional(), // max 1 year
      preferredExchanges: Joi.array()
        .items(
          Joi.string().valid(
            "vest",
            "hyperliquid",
            "orderly",
            "extended",
            "paradex",
            "backpack",
            "hibachi",
          ),
        )
        .optional(),
      riskTolerance: Joi.string().valid("low", "medium", "high").optional(),
      notificationPreferences: Joi.object({
        email: Joi.boolean().optional(),
        webhook: Joi.boolean().optional(),
        discord: Joi.boolean().optional(),
      }).optional(),
    });

    const { error, value } = settingsSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: "Validation error",
        details: error.details,
      });
      return;
    }

    const user = await authService.getUserFromToken(
      req.headers.authorization?.split(" ")[1],
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Merge new settings with existing ones
    const updatedSettings = { ...user.settings, ...value };
    user.settings = updatedSettings;
    await user.save();

    res.json({
      message: "Settings updated successfully",
      settings: user.settings,
    });
  } catch (error) {
    console.error("Settings update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const refreshToken = async (req: any, res: Response): Promise<void> => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      res.status(401).json({ error: "Token required" });
      return;
    }

    const user = await authService.getUserFromToken(token);
    if (!user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    // Generate new token
    const challenge = authService.generateChallenge(user.walletAddress);

    res.json({
      message: "Token refresh initiated",
      challengeMessage: challenge.message,
      nonce: challenge.nonce,
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
