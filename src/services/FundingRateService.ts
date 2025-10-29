import { FundingRate } from "../models/index";
import { FundingRateData, JobResult } from "../types/index";
import { getWebSocketHandlers } from "../websocket/handlers";
import { exchanges } from "./exchanges";

// interface ExchangeConnector {
//   name: string;
//   connector: any;
//   // isConnected: boolean;
//   getFundingRates(): Promise<FundingRateData[]>;
// }

export class FundingRateService {
  // private exchanges: ExchangeConnector[] = [
  //   {
  //     name: "vest",
  //     connector: vestExchange,
  //     // isConnected: vestExchange?.isConnected || false,
  //     getFundingRates: vestExchange?.isConnected
  //       ? async () => vestExchange!.getFundingRates()
  //       : () => Promise.resolve([]),
  //   },
  //   {
  //     name: "hyperliquid",
  //     connector: hyperliquidExchange,
  //     // isConnected: hyperliquidExchange?.isConnected || false,
  //     getFundingRates: hyperliquidExchange?.isConnected
  //       ? async () => hyperliquidExchange!.getFundingRates()
  //       : () => Promise.resolve([]),
  //   },
  //   {
  //     name: "orderly",
  //     connector: woofiExchange,
  //     // isConnected: woofiExchange?.isConnected || false,
  //     getFundingRates: woofiExchange?.isConnected
  //       ? async () => woofiExchange!.getFundingRates()
  //       : () => Promise.resolve([]),
  //   },
  //   {
  //     name: "extended",
  //     connector: extendedExchange,
  //     // isConnected: extendedExchange.isConnected,
  //     getFundingRates: async () => extendedExchange.getFundingRates(),
  //   },
  // ];

  /**
   * Met à jour les funding rates de tous les exchanges connectés
   */
  public async updateAllFundingRates(): Promise<JobResult> {
    const startTime = Date.now();
    const updatedRates: FundingRateData[] = [];
    const errors: string[] = [];

    try {
      console.log("🔄 Starting funding rate update...");

      // Mettre à jour chaque exchange
      for (const exchange of exchanges) {
        try {
          if (!exchange.isConnected) {
            errors.push(`${exchange.name} exchange not connected`);
            continue;
          }

          const exchangeRates = await exchange.getFundingRates();
          await this.saveRatesToDatabase(exchangeRates, updatedRates, errors);

          console.log(`✅ Updated ${exchangeRates.length} rates from ${exchange.name}`);
        } catch (exchangeError) {
          console.error(`Error fetching ${exchange.name} rates:`, exchangeError);
          errors.push(`${exchange.name} exchange error`);
        }
      }

      // Broadcast updates via WebSocket
      if (updatedRates.length > 0) {
        const wsHandlers = getWebSocketHandlers();
        if (wsHandlers) {
          wsHandlers.handleFundingRateUpdate(updatedRates);
        }
      }

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
        console.log(`✅ Funding rate update completed: ${result.message} (${executionTime}ms)`);
      } else {
        console.log(`⚠️ Funding rate update completed with errors: ${result.message} (${executionTime}ms)`);
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
    }
  }

  /**
   * Met à jour les funding rates d'un exchange spécifique
   */
  public async updateExchangeFundingRates(exchangeName: string): Promise<JobResult> {
    const startTime = Date.now();
    const exchange = exchanges.find((e) => e.name === exchangeName);

    if (!exchange) {
      return {
        success: false,
        message: `Exchange ${exchangeName} not found`,
        executionTime: Date.now() - startTime,
      };
    }

    try {
      if (!exchange.isConnected) {
        return {
          success: false,
          message: `${exchangeName} exchange not connected`,
          executionTime: Date.now() - startTime,
        };
      }

      const exchangeRates = await exchange.getFundingRates();
      const updatedRates: FundingRateData[] = [];
      const errors: string[] = [];

      await this.saveRatesToDatabase(exchangeRates, updatedRates, errors);

      return {
        success: true,
        message: `Updated ${exchangeRates.length} rates from ${exchangeName}`,
        data: {
          updatedRates: updatedRates.length,
          tokens: [...new Set(updatedRates.map((r) => r.token))],
          errors,
        },
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update ${exchangeName} rates`,
        error: error instanceof Error ? error.message : "Unknown error",
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Récupère les funding rates les plus récents pour un token spécifique
   */
  public async getFundingRatesForToken(token: string): Promise<FundingRateData[]> {
    try {
      const rates = await FundingRate.findAll({
        where: { token },
        order: [["timestamp", "DESC"]],
        limit: 10, // Un rate par exchange max
      });

      return rates.map((rate) => rate.toJSON() as FundingRateData);
    } catch (error) {
      console.error(`Error fetching funding rates for token ${token}:`, error);
      return [];
    }
  }

  /**
   * Récupère les funding rates les plus récents pour une paire exchange/token
   */
  public async getLatestForTokenAndExchange(token: string, exchange: string): Promise<FundingRate | null> {
    try {
      return await FundingRate.findOne({
        where: { token, exchange },
        order: [["timestamp", "DESC"]],
      });
    } catch (error) {
      console.error(`Error fetching latest rate for ${token}/${exchange}:`, error);
      return null;
    }
  }

  /**
   * Sauvegarde les rates en base de données
   */
  private async saveRatesToDatabase(
    exchangeRates: FundingRateData[],
    updatedRates: FundingRateData[],
    errors: string[],
  ): Promise<void> {
    for (const rate of exchangeRates) {
      try {
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

        await FundingRate.upsert(upsertData);
        updatedRates.push(rate);
      } catch (dbError) {
        console.error(`Error saving ${rate.token} rate for ${rate.exchange}:`, dbError);
        errors.push(`Database error for ${rate.token}/${rate.exchange}`);
      }
    }
  }
}

export const fundingRateService = new FundingRateService();
