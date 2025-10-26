import cron, { ScheduledTask } from "node-cron";
import { FundingRate, Position, TradeHistory } from "../models/index";
import { JobResult } from "../types/index";
import { getWebSocketHandlers } from "../websocket/handlers";
import { arbitrageService } from "./ArbitrageService";
import { extendedExchange } from "./exchanges/ExtendedExchange";
import { hyperliquidExchange } from "./exchanges/HyperliquidExchange";
import { vestExchange } from "./exchanges/VestExchange";
import { woofiExchange } from "./exchanges/WoofiExchange";

interface PositionAlert {
  positionId: string;
  type:
    | "PROFIT_TARGET"
    | "STOP_LOSS"
    | "AUTO_CLOSE_TRIGGERED"
    | "FUNDING_CHANGE"
    | "PRICE_DEVIATION";
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  recommendedAction: "MONITOR" | "CONSIDER_CLOSING" | "CLOSE_IMMEDIATELY";
  data: any;
}

export class PositionMonitoringService {
  private isRunning = false;
  private lastExecution: Date | null = null;
  private cronJob: ScheduledTask | null = null;
  private exchanges = {
    vest: vestExchange,
    hyperliquid: hyperliquidExchange,
    orderly: woofiExchange,
    extended: extendedExchange,
  };

  constructor() {
    this.setupCronJob();
  }

  private setupCronJob(): void {
    // Run every 30 seconds for active position monitoring
    this.cronJob = cron.createTask(
      "*/30 * * * * *",
      async () => {
        await this.monitorPositions();
      },
      {
        noOverlap: true,
      }
    );

    console.log("📈 Position monitoring job scheduled (every 30 seconds)");
  }

  public start(): void {
    if (this.cronJob) {
      this.cronJob.start();
      console.log("▶️ Position monitoring started");
    }
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log("⏹️ Position monitoring stopped");
    }
  }

  public async monitorPositions(): Promise<JobResult> {
    const startTime = Date.now();

    if (this.isRunning) {
      return {
        success: false,
        message: "Position monitoring already in progress",
        executionTime: Date.now() - startTime,
      };
    }

    this.isRunning = true;
    const alerts: PositionAlert[] = [];
    const actionsPerformed: string[] = [];

    try {
      console.log("🔍 Starting position monitoring...");

      // Get all active positions
      const activePositions = await Position.findAll({
        where: { status: "OPEN" },
        order: [["createdAt", "DESC"]],
      });

      if (activePositions.length === 0) {
        console.log("✅ No active positions to monitor");
        this.lastExecution = new Date();
        return {
          success: true,
          message: "No active positions to monitor",
          executionTime: Date.now() - startTime,
        };
      }

      console.log(
        `📊 Monitoring ${activePositions.length} active positions...`
      );

      // Monitor each position
      for (const position of activePositions) {
        try {
          const positionAlerts = await this.monitorSinglePosition(position);
          alerts.push(...positionAlerts);

          // Check for auto-close conditions
          const shouldAutoClose = await this.checkAutoCloseConditions(position);
          if (shouldAutoClose.shouldClose) {
            const closeResult = await this.autoClosePosition(
              position,
              shouldAutoClose.reason
            );
            if (closeResult) {
              actionsPerformed.push(
                `Auto-closed position ${position.id}: ${shouldAutoClose.reason}`
              );
            }
          }
        } catch (error) {
          console.error(`Error monitoring position ${position.id}:`, error);
          alerts.push({
            positionId: position.id,
            type: "FUNDING_CHANGE",
            message: `Error monitoring position: ${error instanceof Error ? error.message : "Unknown error"}`,
            severity: "HIGH",
            recommendedAction: "MONITOR",
            data: {
              error: error instanceof Error ? error.message : "Unknown error",
            },
          });
        }
      }

      // Broadcast alerts via WebSocket
      if (alerts.length > 0) {
        const wsHandlers = getWebSocketHandlers();
        if (wsHandlers && "handlePositionPnLUpdate" in wsHandlers) {
          // Pass alerts as position updates - would need proper typing in real implementation
          (wsHandlers as any).handlePositionPnLUpdate(
            alerts,
            "position-alerts"
          );
        }
      }

      this.lastExecution = new Date();
      const executionTime = Date.now() - startTime;

      const result: JobResult = {
        success: true,
        message: `Monitored ${activePositions.length} positions, generated ${alerts.length} alerts, performed ${actionsPerformed.length} actions`,
        data: {
          positionsMonitored: activePositions.length,
          alertsGenerated: alerts.length,
          actionsPerformed,
          alerts: alerts.filter(
            (a) => a.severity === "HIGH" || a.severity === "CRITICAL"
          ),
        },
        executionTime,
      };

      if (alerts.some((a) => a.severity === "CRITICAL")) {
        console.log(
          `⚠️ Position monitoring completed with CRITICAL alerts: ${result.message}`
        );
      } else {
        console.log(`✅ Position monitoring completed: ${result.message}`);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("❌ Position monitoring failed:", error);

      return {
        success: false,
        message: "Position monitoring failed",
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async monitorSinglePosition(position: any): Promise<PositionAlert[]> {
    const alerts: PositionAlert[] = [];

    try {
      // Calculate current PnL
      const currentPnL = await arbitrageService.calculatePositionPnL(position);
      const currentAPR = await this.calculateCurrentAPR(position);
      const hoursOpen = this.calculateHoursOpen(position.createdAt);

      // Update position with current metrics
      await position.update({
        unrealizedPnL: currentPnL,
        totalFees: this.calculateTotalFees(position, hoursOpen),
        hoursOpen: Math.floor(hoursOpen),
        lastUpdated: new Date(),
      });

      // Check profit target
      if (
        position.autoProfitTarget &&
        currentPnL >= position.autoProfitTarget
      ) {
        alerts.push({
          positionId: position.id,
          type: "PROFIT_TARGET",
          message: `Position reached profit target: $${currentPnL.toFixed(2)} (target: $${position.autoProfitTarget})`,
          severity: "MEDIUM",
          recommendedAction: "CONSIDER_CLOSING",
          data: { currentPnL, profitTarget: position.autoProfitTarget },
        });
      }

      // Check stop loss
      if (
        position.autoClosePnLThreshold &&
        currentPnL <= -Math.abs(position.autoClosePnLThreshold)
      ) {
        alerts.push({
          positionId: position.id,
          type: "STOP_LOSS",
          message: `Position hit stop loss: $${currentPnL.toFixed(2)} (threshold: -$${Math.abs(position.autoClosePnLThreshold)})`,
          severity: "CRITICAL",
          recommendedAction: "CLOSE_IMMEDIATELY",
          data: { currentPnL, stopLoss: position.autoClosePnLThreshold },
        });
      }

      // Check APR threshold
      if (
        position.autoCloseAPRThreshold &&
        currentAPR < position.autoCloseAPRThreshold
      ) {
        alerts.push({
          positionId: position.id,
          type: "AUTO_CLOSE_TRIGGERED",
          message: `Current APR (${currentAPR.toFixed(2)}%) below threshold (${position.autoCloseAPRThreshold}%)`,
          severity: "HIGH",
          recommendedAction: "CLOSE_IMMEDIATELY",
          data: { currentAPR, threshold: position.autoCloseAPRThreshold },
        });
      }

      // Check time-based auto-close
      if (
        position.autoCloseTimeoutHours &&
        hoursOpen >= position.autoCloseTimeoutHours
      ) {
        alerts.push({
          positionId: position.id,
          type: "AUTO_CLOSE_TRIGGERED",
          message: `Position open for ${hoursOpen.toFixed(1)} hours, exceeds timeout (${position.autoCloseTimeoutHours}h)`,
          severity: "HIGH",
          recommendedAction: "CLOSE_IMMEDIATELY",
          data: { hoursOpen, timeoutHours: position.autoCloseTimeoutHours },
        });
      }

      // Check price deviation between exchanges
      const priceDeviation = await this.checkPriceDeviation(position);
      if (priceDeviation > 1.0) {
        // More than 1% deviation
        alerts.push({
          positionId: position.id,
          type: "PRICE_DEVIATION",
          message: `High price deviation between exchanges: ${priceDeviation.toFixed(2)}%`,
          severity: "MEDIUM",
          recommendedAction: "MONITOR",
          data: { priceDeviation },
        });
      }
    } catch (error) {
      alerts.push({
        positionId: position.id,
        type: "FUNDING_CHANGE",
        message: `Error monitoring position: ${error instanceof Error ? error.message : "Unknown error"}`,
        severity: "HIGH",
        recommendedAction: "MONITOR",
        data: {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }

    return alerts;
  }

  private async checkAutoCloseConditions(
    position: any
  ): Promise<{ shouldClose: boolean; reason: string }> {
    try {
      const currentPnL = await arbitrageService.calculatePositionPnL(position);
      const currentAPR = await this.calculateCurrentAPR(position);
      const hoursOpen = this.calculateHoursOpen(position.createdAt);

      // Check PnL stop loss
      if (
        position.autoClosePnLThreshold &&
        currentPnL <= -Math.abs(position.autoClosePnLThreshold)
      ) {
        return {
          shouldClose: true,
          reason: `Stop loss hit: PnL ${currentPnL.toFixed(2)}`,
        };
      }

      // Check APR threshold
      if (
        position.autoCloseAPRThreshold &&
        currentAPR < position.autoCloseAPRThreshold
      ) {
        return {
          shouldClose: true,
          reason: `APR below threshold: ${currentAPR.toFixed(2)}%`,
        };
      }

      // Check timeout
      if (
        position.autoCloseTimeoutHours &&
        hoursOpen >= position.autoCloseTimeoutHours
      ) {
        return {
          shouldClose: true,
          reason: `Timeout reached: ${hoursOpen.toFixed(1)}h`,
        };
      }

      return { shouldClose: false, reason: "" };
    } catch (error) {
      console.error("Error checking auto-close conditions:", error);
      return { shouldClose: false, reason: "" };
    }
  }

  private async autoClosePosition(
    position: any,
    reason: string
  ): Promise<boolean> {
    try {
      console.log(`🔒 Auto-closing position ${position.id}: ${reason}`);

      const longExchange =
        this.exchanges[position.longExchange as keyof typeof this.exchanges];
      const shortExchange =
        this.exchanges[position.shortExchange as keyof typeof this.exchanges];

      let longClosed = false;
      let shortClosed = false;

      // Close long position
      if (longExchange && position.longPositionId) {
        try {
          longClosed = await longExchange.closePosition(
            position.longPositionId
          );
        } catch (error) {
          console.error(
            `Failed to close long position on ${position.longExchange}:`,
            error
          );
        }
      }

      // Close short position
      if (shortExchange && position.shortPositionId) {
        try {
          shortClosed = await shortExchange.closePosition(
            position.shortPositionId
          );
        } catch (error) {
          console.error(
            `Failed to close short position on ${position.shortExchange}:`,
            error
          );
        }
      }

      // Update position status
      const finalPnL = await arbitrageService.calculatePositionPnL(position);

      await position.update({
        status: longClosed && shortClosed ? "CLOSED" : "ERROR",
        closedAt: new Date(),
        realizedPnL: finalPnL,
        closeReason: reason,
      });

      // Record trade history
      await TradeHistory.create({
        userId: position.userId,
        positionId: position.id,
        action: "CLOSE",
        exchange: position.longExchange, // Use actual exchange instead of SYSTEM
        token: position.longToken || position.token,
        side: "AUTO_CLOSE",
        size: position.size,
        price: 0,
        fee: 0,
        timestamp: new Date(),
        metadata: { reason, longClosed, shortClosed },
      });

      console.log(
        `${longClosed && shortClosed ? "✅" : "⚠️"} Position ${position.id} auto-close ${longClosed && shortClosed ? "completed" : "partially failed"}`
      );

      return longClosed && shortClosed;
    } catch (error) {
      console.error(`Error auto-closing position ${position.id}:`, error);
      return false;
    }
  }

  private async calculateCurrentAPR(position: any): Promise<number> {
    try {
      const longRate = await FundingRate.getLatestForTokenAndExchange(
        position.longToken,
        position.longExchange
      );
      const shortRate = await FundingRate.getLatestForTokenAndExchange(
        position.shortToken || position.longToken,
        position.shortExchange
      );

      if (!longRate || !shortRate) return 0;

      const spread = shortRate.fundingRate - longRate.fundingRate;
      const periodsPerYear = 8760; // Assume hourly for APR calculation

      return spread * periodsPerYear * 100;
    } catch (error) {
      console.error("Error calculating current APR:", error);
      return 0;
    }
  }

  private async checkPriceDeviation(position: any): Promise<number> {
    try {
      const longRate = await FundingRate.getLatestForTokenAndExchange(
        position.longToken,
        position.longExchange
      );
      const shortRate = await FundingRate.getLatestForTokenAndExchange(
        position.shortToken || position.longToken,
        position.shortExchange
      );

      if (!longRate?.markPrice || !shortRate?.markPrice) return 0;

      const avgPrice = (longRate.markPrice + shortRate.markPrice) / 2;
      const priceDiff = Math.abs(longRate.markPrice - shortRate.markPrice);

      return (priceDiff / avgPrice) * 100;
    } catch (error) {
      console.error("Error checking price deviation:", error);
      return 0;
    }
  }

  private calculateHoursOpen(createdAt: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - new Date(createdAt).getTime();
    return diffMs / (1000 * 60 * 60);
  }

  private calculateTotalFees(position: any, hoursOpen: number): number {
    // Estimate total fees based on position size and time open
    const estimatedFeeRate = 0.001; // 0.1% estimated total fees
    return position.size * estimatedFeeRate * (hoursOpen / 24);
  }

  public async runOnce(): Promise<JobResult> {
    return await this.monitorPositions();
  }

  public getStatus(): {
    isRunning: boolean;
    lastExecution: Date | null;
    isScheduled: boolean;
  } {
    return {
      isRunning: this.isRunning,
      lastExecution: this.lastExecution,
      isScheduled: this.cronJob
        ? this.cronJob.getStatus() === "scheduled"
        : false,
    };
  }

  public destroy(): void {
    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
    }
  }
}

export const positionMonitoringService = new PositionMonitoringService();
