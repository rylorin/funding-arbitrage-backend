import cron from "node-cron";
import { FundingRate } from "../models/index";
import { extendedExchange } from "../services/exchanges/ExtendedExchange";
import { hyperliquidExchange } from "../services/exchanges/HyperliquidExchange";
import { vestExchange } from "../services/exchanges/VestExchange";
import { woofiExchange } from "../services/exchanges/WoofiExchange";
import { FundingRateData, JobResult } from "../types/index";
import { getWebSocketHandlers } from "../websocket/handlers";

export class FundingRateUpdater {
  private isRunning = false;
  private lastExecution: Date | null = null;
  private cronJob: cron.ScheduledTask | null = null;

  constructor() {
    this.setupCronJob();
  }

  private setupCronJob(): void {
    // Run every 30 seconds: */30 * * * * *
    this.cronJob = cron.schedule(
      "*/30 * * * *",
      async () => {
        await this.updateFundingRates();
      },
      {
        // scheduled: false,
        timezone: "UTC",
      }
    );

    console.log("📅 Funding rate updater job scheduled (every minute)");
  }

  public start(): void {
    if (this.cronJob) {
      this.cronJob.start();
      console.log("▶️ Funding rate updater started");
    }
  }

  public stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      console.log("⏹️ Funding rate updater stopped");
    }
  }

  public async updateFundingRates(): Promise<JobResult> {
    const startTime = Date.now();

    if (this.isRunning) {
      console.log("⚠️ Funding rate update already in progress, skipping...");
      return {
        success: false,
        message: "Update already in progress",
        executionTime: Date.now() - startTime,
      };
    }

    this.isRunning = true;
    // No longer limit to specific tokens - let each exchange determine available pairs
    const updatedRates: FundingRateData[] = [];
    const errors: string[] = [];

    try {
      console.log("🔄 Starting funding rate update...");

      // Update Vest rates
      if (vestExchange.isConnected) {
        try {
          const exchangeRates = await vestExchange.getFundingRates();

          await this.updateDB(exchangeRates, updatedRates, errors);

          console.log(`✅ Updated ${exchangeRates.length} rates from Vest`);
        } catch (exchangeError) {
          console.error("Error fetching Vest rates:", exchangeError);
          errors.push("Vest exchange error");
        }
      } else {
        errors.push("Vest exchange not connected");
      }

      // Update Hyperliquid rates
      if (hyperliquidExchange.isConnected) {
        try {
          const exchangeRates = await hyperliquidExchange.getFundingRates();

          await this.updateDB(exchangeRates, updatedRates, errors);

          console.log(
            `✅ Updated ${exchangeRates.length} rates from Hyperliquid`
          );
        } catch (exchangeError) {
          console.error("Error fetching Hyperliquid rates:", exchangeError);
          errors.push("Hyperliquid exchange error");
        }
      } else {
        errors.push("Hyperliquid exchange not connected");
      }

      // Update Woofi rates
      if (woofiExchange.isConnected) {
        try {
          const exchangeRates = await woofiExchange.getFundingRates();

          await this.updateDB(exchangeRates, updatedRates, errors);

          console.log(`✅ Updated ${exchangeRates.length} rates from Woofi`);
        } catch (exchangeError) {
          console.error("Error fetching Woofi rates:", exchangeError);
          errors.push("Woofi exchange error");
        }
      } else {
        errors.push("Woofi exchange not connected");
      }

      // Update Extended rates
      if (extendedExchange.isConnected) {
        try {
          const exchangeRates = await extendedExchange.getFundingRates();

          await this.updateDB(exchangeRates, updatedRates, errors);

          console.log(`✅ Updated ${exchangeRates.length} rates from Extended`);
        } catch (exchangeError) {
          console.error("Error fetching Extended rates:", exchangeError);
          errors.push("Extended exchange error");
        }
      } else {
        errors.push("Extended exchange not connected");
      }

      // TODO: Add other exchange updates here

      // No cleanup needed since we only keep the latest rate per exchange/token pair

      // Broadcast updates via WebSocket
      if (updatedRates.length > 0) {
        const wsHandlers = getWebSocketHandlers();
        if (wsHandlers) {
          wsHandlers.handleFundingRateUpdate(updatedRates);
        }
      }

      this.lastExecution = new Date();
      const executionTime = Date.now() - startTime;

      const result: JobResult = {
        success: updatedRates.length > 0,
        message: `Updated ${updatedRates.length} rates across ${
          new Set(updatedRates.map((r) => r.exchange)).size
        } exchanges`,
        data: {
          updatedRates: updatedRates.length,
          exchanges: [...new Set(updatedRates.map((r) => r.exchange))],
          tokens: [...new Set(updatedRates.map((r) => r.token))],
          errors,
        },
        executionTime,
      };

      if (errors.length === 0) {
        console.log(
          `✅ Funding rate update completed: ${result.message} (${executionTime}ms)`
        );
      } else {
        console.log(
          `⚠️ Funding rate update completed with errors: ${result.message} (${executionTime}ms)`
        );
        console.log(`❌ Errors: ${errors.join(", ")}`);
      }

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error("❌ Funding rate update failed:", error);

      return {
        success: false,
        message: "Funding rate update failed",
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  private async updateDB(
    exchangeRates: FundingRateData[],
    updatedRates: FundingRateData[],
    errors: string[]
  ) {
    for (const rate of exchangeRates) {
      try {
        // Use upsert to handle both insert and update
        const upsertData: any = {
          exchange: rate.exchange,
          token: rate.token,
          fundingRate: rate.fundingRate,
          fundingFrequency: rate.fundingFrequency,
          nextFunding: rate.nextFunding,
          timestamp: rate.timestamp,
        };

        if (rate.markPrice !== undefined) {
          upsertData.markPrice = rate.markPrice;
        }

        if (rate.indexPrice !== undefined) {
          upsertData.indexPrice = rate.indexPrice;
        }

        console.log(upsertData);
        await FundingRate.upsert(upsertData);
        updatedRates.push(rate);
      } catch (dbError) {
        console.error(
          `Error saving ${rate.token} rate for ${rate.exchange}:`,
          dbError
        );
        errors.push(`Database error for ${rate.token}/${rate.exchange}`);
      }
    }
  }

  public async runOnce(): Promise<JobResult> {
    return await this.updateFundingRates();
  }

  public getStatus(): {
    isRunning: boolean;
    lastExecution: Date | null;
    isScheduled: boolean;
  } {
    return {
      isRunning: this.isRunning,
      lastExecution: this.lastExecution,
      isScheduled: this.cronJob !== null,
    };
  }

  public destroy(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
  }
}

export const fundingRateUpdater = new FundingRateUpdater();
