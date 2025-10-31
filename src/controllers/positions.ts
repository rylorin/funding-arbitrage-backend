import { RiskLevel } from "@/types";
import { Response } from "express";
import Joi from "joi";
import { AuthenticatedRequest } from "../middleware/auth";
import { FundingRate, Position, TradeHistory, User } from "../models/index";
import { positionSyncService } from "../services/PositionSyncService";

const createPositionSchema = Joi.object({
  token: Joi.string().valid("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP").required(),
  longExchange: Joi.string()
    .valid("vest", "hyperliquid", "orderly", "extended", "paradex", "backpack", "hibachi")
    .required(),
  shortExchange: Joi.string()
    .valid("vest", "hyperliquid", "orderly", "extended", "paradex", "backpack", "hibachi")
    .required(),
  size: Joi.number().positive().required(),
  entryFundingRates: Joi.object({
    longRate: Joi.number().required(),
    shortRate: Joi.number().required(),
    spreadAPR: Joi.number().required(),
  }).required(),
  autoCloseEnabled: Joi.boolean().default(true),
  autoCloseAPRThreshold: Joi.number().min(0).max(100).optional(),
  autoClosePnLThreshold: Joi.number().min(-100).max(0).optional(),
})
  .custom((value, helpers) => {
    if (value.longExchange === value.shortExchange) {
      return helpers.error("custom.sameExchange");
    }
    return value;
  })
  .messages({
    "custom.sameExchange": "Long and short exchanges must be different",
  });

export const createPosition = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { error, value } = createPositionSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: "Validation error",
        details: error.details,
      });
      return;
    }

    const {
      token,
      longExchange,
      shortExchange,
      size,
      entryFundingRates,
      autoCloseEnabled,
      autoCloseAPRThreshold,
      autoClosePnLThreshold,
    } = value;

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Use user settings as defaults if not provided
    const finalAPRThreshold = autoCloseAPRThreshold || user.settings.autoCloseAPRThreshold;
    const finalPnLThreshold = autoClosePnLThreshold || user.settings.autoClosePnLThreshold;

    // Create the position record
    const position = await Position.create({
      userId: req.user!.id,
      token,
      longExchange,
      shortExchange,
      size,
      entryTimestamp: new Date(),
      entryFundingRates,
      autoCloseEnabled,
      autoCloseAPRThreshold: finalAPRThreshold,
      autoClosePnLThreshold: finalPnLThreshold,
      status: "OPEN",
    });

    // TODO: Actually open positions on exchanges
    // For now, we'll simulate successful position opening
    position.longPositionId = `long_${position.id}_${Date.now()}`;
    position.shortPositionId = `short_${position.id}_${Date.now()}`;
    await position.save();

    res.status(201).json({
      id: position.id,
      token: position.token,
      longExchange: position.longExchange,
      shortExchange: position.shortExchange,
      size: position.size,
      entryTimestamp: position.entryTimestamp,
      entryFundingRates: position.entryFundingRates,
      currentPnl: position.currentPnl,
      status: position.status,
      autoCloseEnabled: position.autoCloseEnabled,
      autoCloseAPRThreshold: position.autoCloseAPRThreshold,
      autoClosePnLThreshold: position.autoClosePnLThreshold,
      createdAt: position.createdAt,
    });
  } catch (error) {
    console.error("Position creation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getPositions = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const querySchema = Joi.object({
      status: Joi.string().valid("OPEN", "CLOSED", "ERROR", "CLOSING").optional(),
      token: Joi.string().valid("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP").optional(),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
    });

    const { error, value } = querySchema.validate(req.query);
    if (error) {
      res.status(400).json({
        error: "Query validation error",
        details: error.details,
      });
      return;
    }

    const { status, token, page, limit } = value;
    const offset = (page - 1) * limit;

    const whereClause: any = { userId: req.user!.id };
    if (status) whereClause.status = status;
    if (token) whereClause.token = token;

    const { count, rows: positions } = await Position.findAndCountAll({
      where: whereClause,
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit);

    res.json({
      positions,
      pagination: {
        currentPage: page,
        totalPages,
        totalItems: count,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    console.error("Positions fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getPosition = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const position = await Position.findOne({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!position) {
      res.status(404).json({ error: "Position not found" });
      return;
    }

    const hoursOpen = position.getHoursOpen();
    const shouldAutoClose = position.shouldAutoClose();

    res.json({
      ...position.toJSON(),
      hoursOpen,
      shouldAutoClose,
    });
  } catch (error) {
    console.error("Position fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updatePosition = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const updateSchema = Joi.object({
      autoCloseEnabled: Joi.boolean().optional(),
      autoCloseAPRThreshold: Joi.number().min(0).max(100).optional(),
      autoClosePnLThreshold: Joi.number().min(-100).max(0).optional(),
    });

    const { error, value } = updateSchema.validate(req.body);
    if (error) {
      res.status(400).json({
        error: "Validation error",
        details: error.details,
      });
      return;
    }

    const position = await Position.findOne({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!position) {
      res.status(404).json({ error: "Position not found" });
      return;
    }

    if (position.status !== "OPEN") {
      res.status(400).json({ error: "Cannot update closed or error positions" });
      return;
    }

    await position.update(value);

    res.json({
      message: "Position updated successfully",
      position: position.toJSON(),
    });
  } catch (error) {
    console.error("Position update error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const closePosition = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const position = await Position.findOne({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!position) {
      res.status(404).json({ error: "Position not found" });
      return;
    }

    if (position.status !== "OPEN") {
      res.status(400).json({ error: "Position is not open" });
      return;
    }

    // Set status to CLOSING to prevent other operations
    position.status = "CLOSING";
    await position.save();

    try {
      // TODO: Actually close positions on exchanges
      // For now, we'll simulate successful closure

      position.status = "CLOSED";
      position.closedAt = new Date();
      position.closedReason = "Manual closure by user";
      await position.save();

      res.json({
        message: "Position closed successfully",
        position: position.toJSON(),
      });
    } catch (closeError) {
      // Revert status if closing failed
      position.status = "ERROR";
      position.closedReason = `Closure failed: ${closeError}`;
      await position.save();

      throw closeError;
    }
  } catch (error) {
    console.error("Position closure error:", error);
    res.status(500).json({ error: "Failed to close position" });
  }
};

export const getPositionPnL = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const position = await Position.findOne({
      where: {
        id,
        userId: req.user!.id,
      },
    });

    if (!position) {
      res.status(404).json({ error: "Position not found" });
      return;
    }

    const hoursOpen = position.getHoursOpen();

    // TODO: Calculate real-time PnL from exchanges
    // For now, return stored PnL

    res.json({
      positionId: position.id,
      currentPnL: position.currentPnl,
      unrealizedPnL: position.currentPnl, // Simplified for now
      realizedPnL: 0, // Will be calculated from closed trades
      hoursOpen,
      lastUpdated: position.updatedAt,
      status: position.status,
    });
  } catch (error) {
    console.error("PnL calculation error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Enhanced position display/monitoring endpoints for Priority 2

export const getPositionsDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const querySchema = Joi.object({
      timeframe: Joi.string().valid("1h", "6h", "24h", "7d", "30d").default("24h"),
    });

    const { error, value } = querySchema.validate(req.query);
    if (error) {
      res.status(400).json({
        success: false,
        error: "Query validation error",
        details: error.details,
      });
      return;
    }

    const { timeframe } = value;
    const userId = req.user!.id;

    // Get all positions for user
    const allPositions = await Position.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });

    // Get active positions with enriched data
    const activePositions = await Promise.all(
      allPositions
        .filter((pos) => pos.status === "OPEN")
        .map(async (position) => {
          const currentPnL = await positionSyncService.calculatePositionPnL(position);
          const currentAPR = await calculateCurrentAPR(position);
          const hoursOpen = calculateHoursOpen(position.createdAt);

          return {
            id: position.id,
            token: position.token,
            longExchange: position.longExchange,
            shortExchange: position.shortExchange,
            size: position.size,
            sizeFormatted: `$${position.size.toLocaleString()}`,
            entrySpreadAPR: position.entrySpreadAPR || position.entryFundingRates?.spreadAPR || 0,
            currentAPR,
            aprChange: currentAPR - (position.entrySpreadAPR || position.entryFundingRates?.spreadAPR || 0),
            currentPnL,
            currentPnLFormatted: formatCurrency(currentPnL),
            pnlPercentage: (currentPnL / position.size) * 100,
            hoursOpen: Math.floor(hoursOpen),
            hoursOpenFormatted: formatHours(hoursOpen),
            status: position.status,
            riskLevel: assessPositionRisk(position, currentAPR, currentPnL),
            shouldClose: shouldPositionClose(position, currentAPR, currentPnL),
            autoCloseEnabled: position.autoCloseEnabled,
            autoCloseAPRThreshold: position.autoCloseAPRThreshold,
            autoClosePnLThreshold: position.autoClosePnLThreshold,
            createdAt: position.createdAt,
            metrics: {
              fundingFeesReceived: estimateFundingFeesReceived(position, hoursOpen),
              tradingFeesEstimate: estimateTradingFees(position),
              netPnL: currentPnL - estimateTradingFees(position),
            },
          };
        }),
    );

    // Calculate portfolio statistics
    const portfolioStats = calculatePortfolioStats(activePositions, allPositions, timeframe);

    // Get position history for charts
    const positionHistory = await getPositionHistoryData(userId, timeframe);

    res.json({
      success: true,
      data: {
        summary: portfolioStats,
        activePositions: activePositions.sort((a, b) => b.currentPnL - a.currentPnL),
        positionHistory,
        alerts: generatePositionAlerts(activePositions),
        recommendations: generatePositionRecommendations(activePositions),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Position dashboard error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getPositionDetails = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const position = await Position.findOne({
      where: { id, userId },
    });

    if (!position) {
      res.status(404).json({
        success: false,
        error: "Position not found",
      });
      return;
    }

    // Get comprehensive position data
    const currentPnL = await positionSyncService.calculatePositionPnL(position);
    const currentAPR = await calculateCurrentAPR(position);
    const hoursOpen = calculateHoursOpen(position.createdAt);

    // Get current funding rates
    const longRate = await FundingRate.getLatestForTokenAndExchange(
      position.longToken || position.token,
      position.longExchange,
    );
    const shortRate = await FundingRate.getLatestForTokenAndExchange(
      position.shortToken || position.token,
      position.shortExchange,
    );

    // Get position trade history
    const tradeHistory = await TradeHistory.findAll({
      where: { userId, positionId: id },
      order: [["timestamp", "DESC"]],
      limit: 50,
    });

    // Get PnL history (would need to be implemented with periodic snapshots)
    const pnlHistory = await getPositionPnLHistory(id);

    const detailedPosition = {
      id: position.id,
      token: position.token,
      exchanges: {
        long: {
          name: position.longExchange,
          color: getExchangeColor(position.longExchange),
          positionId: position.longPositionId,
          currentRate: longRate?.fundingRate || 0,
          entryRate: position.longFundingRate,
        },
        short: {
          name: position.shortExchange,
          color: getExchangeColor(position.shortExchange),
          positionId: position.shortPositionId,
          currentRate: shortRate?.fundingRate || 0,
          entryRate: position.shortFundingRate,
        },
      },
      size: {
        amount: position.size,
        formatted: `$${position.size.toLocaleString()}`,
      },
      timing: {
        opened: position.createdAt,
        hoursOpen: Math.floor(hoursOpen),
        formatted: formatHours(hoursOpen),
        shouldClose: shouldPositionClose(position, currentAPR, currentPnL),
      },
      performance: {
        entryAPR: position.entrySpreadAPR || position.entryFundingRates?.spreadAPR || 0,
        currentAPR,
        aprChange: currentAPR - (position.entrySpreadAPR || position.entryFundingRates?.spreadAPR || 0),
        currentPnL,
        pnlFormatted: formatCurrency(currentPnL),
        pnlPercentage: (currentPnL / position.size) * 100,
        totalFees: estimateTotalFees(position, hoursOpen),
        netPnL: currentPnL - estimateTotalFees(position, hoursOpen),
      },
      risk: {
        level: assessPositionRisk(position, currentAPR, currentPnL),
        factors: analyzeRiskFactors(position, longRate, shortRate, currentAPR),
      },
      autoClose: {
        enabled: position.autoCloseEnabled,
        aprThreshold: position.autoCloseAPRThreshold,
        pnlThreshold: position.autoClosePnLThreshold,
        timeoutHours: position.autoCloseTimeoutHours,
        willTrigger: checkAutoCloseTriggers(position, currentAPR, currentPnL, hoursOpen),
      },
      status: position.status,
      history: {
        trades: tradeHistory.map((trade) => ({
          id: trade.id,
          action: trade.action,
          exchange: trade.exchange,
          side: trade.side,
          size: trade.size,
          price: trade.price,
          fee: trade.fee,
          timestamp: trade.timestamp,
          metadata: trade.metadata,
        })),
        pnl: pnlHistory,
      },
    };

    res.json({
      success: true,
      data: detailedPosition,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Position details error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const getPositionAlerts = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const activePositions = await Position.findAll({
      where: { userId, status: "OPEN" },
    });

    const alerts = [];

    for (const position of activePositions) {
      const currentPnL = await positionSyncService.calculatePositionPnL(position);
      const currentAPR = await calculateCurrentAPR(position);
      const hoursOpen = calculateHoursOpen(position.createdAt);

      // Check for various alert conditions
      const positionAlerts = generatePositionAlerts([
        {
          id: position.id,
          token: position.token,
          currentPnL,
          currentAPR,
          hoursOpen,
          autoCloseAPRThreshold: position.autoCloseAPRThreshold,
          autoClosePnLThreshold: position.autoClosePnLThreshold,
          autoCloseTimeoutHours: position.autoCloseTimeoutHours,
        },
      ]);

      alerts.push(...positionAlerts);
    }

    res.json({
      success: true,
      data: {
        alerts: alerts.sort((a, b) => {
          const severityOrder: Record<string, number> = {
            CRITICAL: 4,
            HIGH: 3,
            MEDIUM: 2,
            LOW: 1,
          };
          return (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0);
        }),
        summary: {
          total: alerts.length,
          critical: alerts.filter((a) => a.severity === "CRITICAL").length,
          high: alerts.filter((a) => a.severity === "HIGH").length,
          medium: alerts.filter((a) => a.severity === "MEDIUM").length,
          low: alerts.filter((a) => a.severity === "LOW").length,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Position alerts error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const getPositionPerformance = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    const querySchema = Joi.object({
      timeframe: Joi.string().valid("1h", "6h", "24h", "7d", "30d").default("24h"),
      groupBy: Joi.string().valid("token", "exchange", "day", "hour").default("token"),
    });

    const { error, value } = querySchema.validate(req.query);
    if (error) {
      res.status(400).json({
        success: false,
        error: "Query validation error",
        details: error.details,
      });
      return;
    }

    const { timeframe, groupBy } = value;
    const userId = req.user!.id;

    const allPositions = await Position.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
    });

    const performanceData = await calculatePerformanceMetrics(allPositions, timeframe, groupBy);

    res.json({
      success: true,
      data: performanceData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Position performance error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

// Helper functions for position monitoring

async function calculateCurrentAPR(position: any): Promise<number> {
  try {
    const longRate = await FundingRate.getLatestForTokenAndExchange(
      position.longToken || position.token,
      position.longExchange,
    );
    const shortRate = await FundingRate.getLatestForTokenAndExchange(
      position.shortToken || position.token,
      position.shortExchange,
    );

    if (!longRate || !shortRate) return 0;

    const spread = shortRate.fundingRate - longRate.fundingRate;
    const periodsPerYear = getFundingPeriods(position.longExchange, position.shortExchange);

    return spread * periodsPerYear * 100;
  } catch (error) {
    console.error("Error calculating current APR:", error);
    return 0;
  }
}

function calculateHoursOpen(createdAt: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - new Date(createdAt).getTime();
  return diffMs / (1000 * 60 * 60);
}

function getFundingPeriods(longExchange: string, shortExchange: string): number {
  const hourlyExchanges = ["vest", "extended"];

  const longIsHourly = hourlyExchanges.includes(longExchange);
  const shortIsHourly = hourlyExchanges.includes(shortExchange);

  // Use the most frequent cycle
  return longIsHourly || shortIsHourly ? 8760 : 1095;
}

function formatCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount >= 0 ? "+" : "-";

  if (absAmount >= 1000000) {
    return `${sign}$${(absAmount / 1000000).toFixed(2)}M`;
  } else if (absAmount >= 1000) {
    return `${sign}$${(absAmount / 1000).toFixed(2)}K`;
  } else {
    return `${sign}$${absAmount.toFixed(2)}`;
  }
}

function formatHours(hours: number): string {
  if (hours < 1) {
    return `${Math.floor(hours * 60)}m`;
  } else if (hours < 24) {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${h}h ${m}m`;
  } else {
    const d = Math.floor(hours / 24);
    const h = Math.floor(hours % 24);
    return `${d}d ${h}h`;
  }
}

function getExchangeColor(exchange: string): string {
  const colors: Record<string, string> = {
    vest: "#8B5CF6",
    hyperliquid: "#3B82F6",
    orderly: "#10B981",
    extended: "#F59E0B",
    paradex: "#EF4444",
    backpack: "#6366F1",
    hibachi: "#F97316",
  };
  return colors[exchange] || "#6B7280";
}

function assessPositionRisk(position: any, currentAPR: number, currentPnL: number): RiskLevel {
  const pnlPercentage = (currentPnL / position.size) * 100;
  const aprDecline = (position.entrySpreadAPR || position.entryFundingRates?.spreadAPR || 0) - currentAPR;

  if (pnlPercentage < -5 || aprDecline > 20) return RiskLevel.CRITICAL;
  if (pnlPercentage < -2 || aprDecline > 10) return RiskLevel.HIGH;
  if (pnlPercentage < 0 || aprDecline > 5) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

function shouldPositionClose(position: any, currentAPR: number, currentPnL: number): boolean {
  if (!position.autoCloseEnabled) return false;

  // Check APR threshold
  if (position.autoCloseAPRThreshold && currentAPR < position.autoCloseAPRThreshold) {
    return true;
  }

  // Check PnL threshold
  if (position.autoClosePnLThreshold && currentPnL <= -Math.abs(position.autoClosePnLThreshold)) {
    return true;
  }

  // Check timeout
  const hoursOpen = calculateHoursOpen(position.createdAt);
  if (position.autoCloseTimeoutHours && hoursOpen >= position.autoCloseTimeoutHours) {
    return true;
  }

  return false;
}

function estimateFundingFeesReceived(position: any, hoursOpen: number): number {
  const avgHourlyRate = (position.entrySpreadAPR || position.entryFundingRates?.spreadAPR || 0) / 8760; // Convert APR to hourly
  return (avgHourlyRate / 100) * position.size * hoursOpen;
}

function estimateTradingFees(position: any): number {
  // Estimate 0.1% total trading fees (open + close)
  return position.size * 0.001;
}

function estimateTotalFees(position: any, hoursOpen: number): number {
  return estimateTradingFees(position) + estimateFundingFeesReceived(position, hoursOpen) * 0.1; // 10% fee on funding
}

function calculatePortfolioStats(activePositions: any[], allPositions: any[], timeframe: string) {
  const totalPnL = activePositions.reduce((sum, pos) => sum + pos.currentPnL, 0);
  const totalSize = activePositions.reduce((sum, pos) => sum + pos.size, 0);

  // Calculate closed positions in timeframe
  const timeframeDays = getTimeframeDays(timeframe);
  const cutoffDate = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000);

  const recentClosedPositions = allPositions.filter(
    (pos) => pos.status === "CLOSED" && new Date(pos.closedAt || pos.updatedAt) >= cutoffDate,
  );

  const realizedPnL = recentClosedPositions.reduce((sum, pos) => sum + (pos.realizedPnL || 0), 0);

  return {
    totalPositions: activePositions.length,
    totalValue: totalSize,
    totalValueFormatted: `$${totalSize.toLocaleString()}`,
    unrealizedPnL: totalPnL,
    unrealizedPnLFormatted: formatCurrency(totalPnL),
    realizedPnL,
    realizedPnLFormatted: formatCurrency(realizedPnL),
    totalPnL: totalPnL + realizedPnL,
    totalPnLFormatted: formatCurrency(totalPnL + realizedPnL),
    avgAPR:
      activePositions.length > 0
        ? activePositions.reduce((sum, pos) => sum + pos.currentAPR, 0) / activePositions.length
        : 0,
    riskDistribution: {
      [RiskLevel.LOW]: activePositions.filter((pos) => pos.riskLevel === RiskLevel.LOW).length,
      [RiskLevel.MEDIUM]: activePositions.filter((pos) => pos.riskLevel === RiskLevel.MEDIUM).length,
      [RiskLevel.HIGH]: activePositions.filter((pos) => pos.riskLevel === RiskLevel.HIGH).length,
      [RiskLevel.CRITICAL]: activePositions.filter((pos) => pos.riskLevel === RiskLevel.CRITICAL).length,
    },
    shouldCloseCount: activePositions.filter((pos) => pos.shouldClose).length,
  };
}

function getTimeframeDays(timeframe: string): number {
  switch (timeframe) {
    case "1h":
      return 1 / 24;
    case "6h":
      return 6 / 24;
    case "24h":
      return 1;
    case "7d":
      return 7;
    case "30d":
      return 30;
    default:
      return 1;
  }
}

async function getPositionHistoryData(_userId: string, _timeframe: string) {
  // This would typically query a positions_history table with periodic snapshots
  // For now, return mock data structure
  return {
    pnlChart: [],
    aprChart: [],
    positionCount: [],
  };
}

function generatePositionAlerts(positions: any[]) {
  const alerts = [];

  for (const position of positions) {
    // Critical PnL loss
    if (position.pnlPercentage < -5) {
      alerts.push({
        id: `pnl_critical_${position.id}`,
        positionId: position.id,
        type: "CRITICAL_LOSS",
        severity: "CRITICAL",
        message: `Position ${position.token} has critical loss: ${position.currentPnLFormatted}`,
        recommendedAction: "CLOSE_IMMEDIATELY",
        data: {
          currentPnL: position.currentPnL,
          percentage: position.pnlPercentage,
        },
      });
    }

    // APR decline
    if (position.aprChange < -10) {
      alerts.push({
        id: `apr_decline_${position.id}`,
        positionId: position.id,
        type: "APR_DECLINE",
        severity: "HIGH",
        message: `Position ${position.token} APR declined by ${Math.abs(position.aprChange).toFixed(2)}%`,
        recommendedAction: "CONSIDER_CLOSING",
        data: {
          aprChange: position.aprChange,
          currentAPR: position.currentAPR,
        },
      });
    }

    // Auto-close trigger
    if (position.shouldClose) {
      alerts.push({
        id: `auto_close_${position.id}`,
        positionId: position.id,
        type: "AUTO_CLOSE_PENDING",
        severity: "MEDIUM",
        message: `Position ${position.token} will be auto-closed`,
        recommendedAction: "MONITOR",
        data: { reason: "Auto-close conditions met" },
      });
    }

    // Long-running position
    if (position.hoursOpen > 72) {
      alerts.push({
        id: `long_running_${position.id}`,
        positionId: position.id,
        type: "LONG_RUNNING",
        severity: "LOW",
        message: `Position ${position.token} open for ${position.hoursOpenFormatted}`,
        recommendedAction: "MONITOR",
        data: { hoursOpen: position.hoursOpen },
      });
    }
  }

  return alerts;
}

function generatePositionRecommendations(activePositions: any[]): any[] {
  const recommendations: any[] = [];

  // High-performing positions to increase size
  const bestPerformers = activePositions
    .filter((pos) => pos.pnlPercentage > 2 && pos.currentAPR > 15)
    .sort((a, b) => b.currentAPR - a.currentAPR)
    .slice(0, 3);

  bestPerformers.forEach((pos) => {
    recommendations.push({
      type: "INCREASE_POSITION",
      message: `Consider increasing ${pos.token} position (${pos.currentAPR.toFixed(2)}% APR)`,
      priority: "HIGH",
      data: pos,
    });
  });

  // Poor performers to close
  const poorPerformers = activePositions
    .filter((pos) => pos.pnlPercentage < -1 || pos.currentAPR < 5)
    .sort((a, b) => a.currentAPR - b.currentAPR)
    .slice(0, 3);

  poorPerformers.forEach((pos) => {
    recommendations.push({
      type: "CLOSE_POSITION",
      message: `Consider closing ${pos.token} position (${pos.currentAPR.toFixed(2)}% APR)`,
      priority: "MEDIUM",
      data: pos,
    });
  });

  return recommendations;
}

async function getPositionPnLHistory(_positionId: string) {
  // This would query a position_snapshots table with historical PnL data
  // For now, return empty array
  return [];
}

function analyzeRiskFactors(position: any, longRate: any, shortRate: any, currentAPR: number) {
  const factors = [];

  // Price deviation
  if (longRate && shortRate) {
    const priceDeviation =
      (Math.abs(longRate.markPrice - shortRate.markPrice) / ((longRate.markPrice + shortRate.markPrice) / 2)) * 100;

    if (priceDeviation > 1) {
      factors.push({
        type: "PRICE_DEVIATION",
        severity: priceDeviation > 2 ? "HIGH" : "MEDIUM",
        description: `Price deviation between exchanges: ${priceDeviation.toFixed(2)}%`,
        impact: "May indicate arbitrage risk or exchange issues",
      });
    }
  }

  // APR volatility
  const aprChange = (position.entrySpreadAPR || position.entryFundingRates?.spreadAPR || 0) - currentAPR;
  if (Math.abs(aprChange) > 5) {
    factors.push({
      type: "APR_VOLATILITY",
      severity: Math.abs(aprChange) > 15 ? "HIGH" : "MEDIUM",
      description: `APR changed by ${aprChange.toFixed(2)}% since entry`,
      impact: "High volatility may indicate unstable arbitrage opportunity",
    });
  }

  // Exchange risk
  const smallExchanges = ["extended", "orderly", "paradex"];
  if (smallExchanges.includes(position.longExchange) || smallExchanges.includes(position.shortExchange)) {
    factors.push({
      type: "EXCHANGE_RISK",
      severity: "LOW",
      description: "Position involves smaller/newer exchanges",
      impact: "May have liquidity or reliability risks",
    });
  }

  return factors;
}

function checkAutoCloseTriggers(position: any, currentAPR: number, currentPnL: number, hoursOpen: number) {
  const triggers = [];

  if (position.autoCloseAPRThreshold && currentAPR < position.autoCloseAPRThreshold) {
    triggers.push({
      type: "APR_THRESHOLD",
      threshold: position.autoCloseAPRThreshold,
      current: currentAPR,
      willTrigger: true,
    });
  }

  if (position.autoClosePnLThreshold && currentPnL <= -Math.abs(position.autoClosePnLThreshold)) {
    triggers.push({
      type: "PNL_THRESHOLD",
      threshold: position.autoClosePnLThreshold,
      current: currentPnL,
      willTrigger: true,
    });
  }

  if (position.autoCloseTimeoutHours && hoursOpen >= position.autoCloseTimeoutHours) {
    triggers.push({
      type: "TIMEOUT",
      threshold: position.autoCloseTimeoutHours,
      current: hoursOpen,
      willTrigger: true,
    });
  }

  return triggers;
}

async function calculatePerformanceMetrics(allPositions: any[], _timeframe: string, _groupBy: string) {
  // This would implement comprehensive performance analysis
  // For now, return basic structure
  return {
    summary: {
      totalPositions: allPositions.length,
      profitablePositions: allPositions.filter((p) => (p.realizedPnL || 0) > 0).length,
      totalReturn: allPositions.reduce((sum, p) => sum + (p.realizedPnL || 0), 0),
      averageAPR: 0,
      winRate: 0,
    },
    breakdown: {},
    trends: [],
  };
}
