import { Position, TradeHistory, User } from "../models/index";
import { ExchangeName, JobResult, TokenSymbol } from "../types/index";
import { getWebSocketHandlers } from "../websocket/handlers";
import { arbitrageService } from "./ArbitrageService";
import { extendedExchange } from "./exchanges/ExtendedExchange";
import { hyperliquidExchange } from "./exchanges/HyperliquidExchange";
import { vestExchange } from "./exchanges/VestExchange";
import { woofiExchange } from "./exchanges/WoofiExchange";

interface AutoTradingSettings {
  enabled: boolean;
  minAPR: number;
  maxPositionSize: number;
  maxSimultaneousPositions: number;
  riskTolerance: "low" | "medium" | "high";
  allowedExchanges: ExchangeName[];
  autoCloseEnabled: boolean;
  autoCloseAPRThreshold: number;
  autoClosePnLThreshold: number;
  autoCloseTimeoutHours: number;
}

interface TradingResult {
  success: boolean;
  positionId?: string;
  longOrderId?: string;
  shortOrderId?: string;
  error?: string;
  opportunity: any;
}

export class AutoTradingService {
  private isRunning = false;
  private exchanges = {
    vest: vestExchange,
    hyperliquid: hyperliquidExchange,
    orderly: woofiExchange,
    extended: extendedExchange,
  };

  private defaultSettings: AutoTradingSettings = {
    enabled: false, // Disabled by default for safety
    minAPR: 15, // Minimum 15% APR
    maxPositionSize: 1000, // $1000 max per position
    maxSimultaneousPositions: 3,
    riskTolerance: "medium",
    allowedExchanges: ["vest", "hyperliquid"],
    autoCloseEnabled: true,
    autoCloseAPRThreshold: 5, // Close if APR drops below 5%
    autoClosePnLThreshold: 100, // Close if loss exceeds $100
    autoCloseTimeoutHours: 72, // Close after 72 hours max
  };

  public async executeAutoTrading(): Promise<JobResult> {
    const startTime = Date.now();

    if (this.isRunning) {
      return {
        success: false,
        message: "Auto-trading already in progress",
        executionTime: Date.now() - startTime,
      };
    }

    this.isRunning = true;
    const tradingResults: TradingResult[] = [];
    const errors: string[] = [];

    try {
      console.log("🤖 Starting auto-trading execution...");

      // Get users with auto-trading enabled
      const autoTradingUsers = await User.findAll({
        where: {
          // Assuming users have settings stored in a JSON field
          // This would need to be adapted based on your actual schema
        },
      });

      if (autoTradingUsers.length === 0) {
        console.log("ℹ️ No users with auto-trading enabled");
        return {
          success: true,
          message: "No users with auto-trading enabled",
          executionTime: Date.now() - startTime,
        };
      }

      // Find best opportunities
      const opportunities = await arbitrageService.findArbitrageOpportunities(
        this.defaultSettings.minAPR,
        this.defaultSettings.maxPositionSize,
        0.5, // 0.5% max price deviation
      );

      if (opportunities.length === 0) {
        console.log("ℹ️ No arbitrage opportunities found meeting criteria");
        return {
          success: true,
          message: "No opportunities found",
          executionTime: Date.now() - startTime,
        };
      }

      console.log(`🎯 Found ${opportunities.length} potential opportunities`);

      // Execute trades for each eligible user
      for (const user of autoTradingUsers) {
        try {
          const userSettings = this.getUserTradingSettings(user);
          if (!userSettings.enabled) continue;

          const userResults = await this.executeUserTrading(user, opportunities, userSettings);
          tradingResults.push(...userResults);
        } catch (error) {
          console.error(`Error executing auto-trading for user ${user.id}:`, error);
          errors.push(`User ${user.id}: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }

      // Broadcast trading results via WebSocket
      if (tradingResults.length > 0) {
        const wsHandlers = getWebSocketHandlers();
        if (wsHandlers && "handleAutoTradingUpdate" in wsHandlers) {
          (wsHandlers as any).handleAutoTradingUpdate(tradingResults);
        }
      }

      const executionTime = Date.now() - startTime;

      const result: JobResult = {
        success: tradingResults.some((r) => r.success),
        message: `Auto-trading completed: ${tradingResults.filter((r) => r.success).length} successful trades, ${errors.length} errors`,
        data: {
          opportunitiesFound: opportunities.length,
          tradesExecuted: tradingResults.filter((r) => r.success).length,
          tradingResults,
          errors,
        },
        executionTime,
      };

      if (errors.length > 0) {
        console.log(`⚠️ Auto-trading completed with errors: ${result.message}`);
      } else if (tradingResults.some((r) => r.success)) {
        console.log(`✅ Auto-trading completed successfully: ${result.message}`);
      } else {
        console.log(`ℹ️ Auto-trading completed: ${result.message}`);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("❌ Auto-trading failed:", error);

      return {
        success: false,
        message: "Auto-trading failed",
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async executeUserTrading(
    user: any,
    opportunities: any[],
    settings: AutoTradingSettings,
  ): Promise<TradingResult[]> {
    const results: TradingResult[] = [];

    try {
      // Check current active positions
      const activePositions = await Position.count({
        where: {
          userId: user.id,
          status: "OPEN",
        },
      });

      if (activePositions >= settings.maxSimultaneousPositions) {
        console.log(`User ${user.id} has reached max positions limit (${settings.maxSimultaneousPositions})`);
        return results;
      }

      // Filter opportunities based on user settings
      const filteredOpportunities = opportunities
        .filter((opp) => opp.spreadAPR >= settings.minAPR)
        .filter((opp) => this.matchesRiskTolerance(opp, settings.riskTolerance))
        .filter(
          (opp) =>
            settings.allowedExchanges.includes(opp.longExchange as ExchangeName) &&
            settings.allowedExchanges.includes(opp.shortExchange as ExchangeName),
        )
        .slice(0, settings.maxSimultaneousPositions - activePositions);

      if (filteredOpportunities.length === 0) {
        console.log(`No suitable opportunities for user ${user.id}`);
        return results;
      }

      // Execute trades for filtered opportunities
      for (const opportunity of filteredOpportunities) {
        try {
          const tradingResult = await this.executeTrade(user, opportunity, settings);
          results.push(tradingResult);

          if (tradingResult.success) {
            console.log(
              `✅ Successfully opened position for user ${user.id}: ${opportunity.token} ${opportunity.spreadAPR.toFixed(2)}% APR`,
            );
          } else {
            console.log(`❌ Failed to open position for user ${user.id}: ${tradingResult.error}`);
          }
        } catch (error) {
          results.push({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
            opportunity,
          });
        }
      }
    } catch (error) {
      console.error(`Error executing trading for user ${user.id}:`, error);
    }

    return results;
  }

  private async executeTrade(user: any, opportunity: any, settings: AutoTradingSettings): Promise<TradingResult> {
    try {
      const longExchange = this.exchanges[opportunity.longExchange as keyof typeof this.exchanges];
      const shortExchange = this.exchanges[opportunity.shortExchange as keyof typeof this.exchanges];

      if (!longExchange || !shortExchange) {
        throw new Error(`Exchange not available: ${opportunity.longExchange} or ${opportunity.shortExchange}`);
      }

      // Calculate position size based on settings
      const positionSize = Math.min(settings.maxPositionSize, opportunity.maxSize);

      console.log(
        `🚀 Executing trade for ${user.id}: ${opportunity.token} Long(${opportunity.longExchange}) Short(${opportunity.shortExchange}) Size: $${positionSize}`,
      );

      // Open long position
      const longOrderId = await longExchange.openPosition(opportunity.token as TokenSymbol, "long", positionSize);

      // Open short position
      const shortOrderId = await shortExchange.openPosition(opportunity.token as TokenSymbol, "short", positionSize);

      // Create position record
      const position = await Position.create({
        userId: user.id,
        token: opportunity.token,
        longToken: opportunity.token,
        shortToken: opportunity.token,
        longExchange: opportunity.longExchange,
        shortExchange: opportunity.shortExchange,
        longPositionId: longOrderId,
        shortPositionId: shortOrderId,
        size: positionSize,
        entryTimestamp: new Date(),
        entryFundingRates: {
          longRate: opportunity.longFundingRate,
          shortRate: opportunity.shortFundingRate,
          spreadAPR: opportunity.spreadAPR,
        },
        entrySpreadAPR: opportunity.spreadAPR,
        longFundingRate: opportunity.longFundingRate,
        shortFundingRate: opportunity.shortFundingRate,
        longMarkPrice: opportunity.longMarkPrice,
        shortMarkPrice: opportunity.shortMarkPrice,
        currentPnl: 0,
        status: "OPEN",
        autoCloseEnabled: settings.autoCloseEnabled,
        autoCloseAPRThreshold: settings.autoCloseAPRThreshold,
        autoClosePnLThreshold: settings.autoClosePnLThreshold,
        autoCloseTimeoutHours: settings.autoCloseTimeoutHours,
      });

      // Record trade history
      await TradeHistory.create({
        userId: user.id,
        positionId: position.id,
        action: "OPEN",
        exchange: opportunity.longExchange, // Use actual exchange instead of AUTO_TRADER
        token: opportunity.token,
        side: "DELTA_NEUTRAL",
        size: positionSize,
        price: (opportunity.longMarkPrice + opportunity.shortMarkPrice) / 2,
        fee: 0, // Will be updated when actual fees are known
        timestamp: new Date(),
        metadata: {
          longExchange: opportunity.longExchange,
          shortExchange: opportunity.shortExchange,
          longOrderId,
          shortOrderId,
          expectedAPR: opportunity.spreadAPR,
        },
      });

      return {
        success: true,
        positionId: position.id,
        longOrderId,
        shortOrderId,
        opportunity,
      };
    } catch (error) {
      console.error("Error executing trade:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        opportunity,
      };
    }
  }

  private getUserTradingSettings(_user: any): AutoTradingSettings {
    // In a real implementation, this would fetch user-specific settings
    // from the database or user preferences
    return {
      ...this.defaultSettings,
      // Override with user-specific settings if available
      // ...user.autoTradingSettings
    };
  }

  private matchesRiskTolerance(opportunity: any, riskTolerance: string): boolean {
    switch (riskTolerance) {
      case "low":
        return opportunity.riskLevel === "LOW" && opportunity.confidence >= 80;
      case "medium":
        return ["LOW", "MEDIUM"].includes(opportunity.riskLevel) && opportunity.confidence >= 70;
      case "high":
        return opportunity.confidence >= 60;
      default:
        return false;
    }
  }

  public async manualTrade(userId: string, opportunityIndex: number, positionSize?: number): Promise<TradingResult> {
    try {
      // Get current opportunities
      const opportunities = await arbitrageService.findArbitrageOpportunities();

      if (opportunityIndex >= opportunities.length) {
        throw new Error("Invalid opportunity index");
      }

      const opportunity = opportunities[opportunityIndex];
      const user = await User.findByPk(userId);

      if (!user) {
        throw new Error("User not found");
      }

      const settings = this.getUserTradingSettings(user);

      // Override position size if provided
      if (positionSize) {
        settings.maxPositionSize = positionSize;
      }

      return await this.executeTrade(user, opportunity, settings);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        opportunity: null,
      };
    }
  }

  public async runOnce(): Promise<JobResult> {
    return await this.executeAutoTrading();
  }
}

const autoTradingService = new AutoTradingService();
export default autoTradingService;
