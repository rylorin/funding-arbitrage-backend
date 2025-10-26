import { FundingRate, Position } from "../models/index";
import { ArbitrageOpportunity, ExchangeName, TokenSymbol } from "../types/index";
import { extendedExchange } from "./exchanges/ExtendedExchange";
import { hyperliquidExchange } from "./exchanges/HyperliquidExchange";
import { vestExchange } from "./exchanges/VestExchange";
import { woofiExchange } from "./exchanges/WoofiExchange";

export interface DetailedArbitrageOpportunity extends ArbitrageOpportunity {
  longMarkPrice: number;
  shortMarkPrice: number;
  // expectedDailyPnL: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  fundingFrequency: {
    longExchange: string;
    shortExchange: string;
  };
  nextFundingTimes: {
    longExchange: Date;
    shortExchange: Date;
  };
  priceDeviation: number; // Écart de prix entre les exchanges
}

interface ExchangeInfo {
  name: ExchangeName;
  connector: any;
  fundingFrequency: "hourly" | "8hour";
}

export class ArbitrageService {
  private exchanges: ExchangeInfo[] = [
    { name: "vest", connector: vestExchange, fundingFrequency: "hourly" },
    {
      name: "hyperliquid",
      connector: hyperliquidExchange,
      fundingFrequency: "8hour",
    },
    { name: "orderly", connector: woofiExchange, fundingFrequency: "8hour" },
    {
      name: "extended",
      connector: extendedExchange,
      fundingFrequency: "hourly",
    },
  ];

  public async findArbitrageOpportunities(
    minAPRThreshold = 5,
    maxPositionSize = 10000,
    maxPriceDeviation = 0.5, // Max 0.5% price difference
  ): Promise<DetailedArbitrageOpportunity[]> {
    try {
      // Get latest funding rates from database
      const latestRates = await FundingRate.getLatestRates();

      // Group by token
      const ratesByToken = this.groupRatesByToken(latestRates);

      const opportunities: DetailedArbitrageOpportunity[] = [];

      // For each token, find best arbitrage opportunities
      for (const [token, rates] of Object.entries(ratesByToken)) {
        if (rates.length < 2) continue; // Need at least 2 exchanges

        // Sort by funding rate (ascending = cheaper to long)
        rates.sort((a, b) => a.fundingRate - b.fundingRate);

        // Find best combinations
        for (let i = 0; i < rates.length - 1; i++) {
          for (let j = i + 1; j < rates.length; j++) {
            const longRate = rates[i]; // Lower rate = cheaper to be long
            const shortRate = rates[j]; // Higher rate = more profitable to be short

            // Skip if same exchange
            if (longRate.exchange === shortRate.exchange) continue;

            // Calculate spread APR
            const spreadAPR = this.calculateSpreadAPR(longRate, shortRate);

            // Skip if below threshold
            if (spreadAPR < minAPRThreshold) continue;

            // Calculate price deviation
            const priceDeviation = this.calculatePriceDeviation(longRate, shortRate);

            // Skip if price deviation too high
            if (priceDeviation > maxPriceDeviation) continue;

            const opportunity: DetailedArbitrageOpportunity = {
              token: token as TokenSymbol,
              longExchange: longRate.exchange,
              shortExchange: shortRate.exchange,
              longFundingRate: longRate.fundingRate / longRate.fundingFrequency,
              shortFundingRate: shortRate.fundingRate / shortRate.fundingFrequency,
              spreadAPR,
              confidence: this.calculateConfidence(longRate, shortRate, priceDeviation),
              minSize: 100,
              maxSize: Math.min(maxPositionSize, this.calculateMaxSize(longRate, shortRate)),
              longMarkPrice: longRate.markPrice || 0,
              shortMarkPrice: shortRate.markPrice || 0,
              // expectedDailyPnL: this.calculateDailyPnL(
              //   spreadAPR,
              //   maxPositionSize
              // ),
              riskLevel: this.assessRiskLevel(spreadAPR, priceDeviation),
              fundingFrequency: {
                longExchange: longRate.fundingFrequency || this.getFundingFrequency(longRate.exchange),
                shortExchange: shortRate.fundingFrequency || this.getFundingFrequency(shortRate.exchange),
              },
              nextFundingTimes: {
                longExchange: longRate.nextFunding,
                shortExchange: shortRate.nextFunding,
              },
              priceDeviation,
            };

            opportunities.push(opportunity);
          }
        }
      }

      // Sort by spreadAPR descending
      opportunities.sort((a, b) => b.spreadAPR - a.spreadAPR);

      return opportunities.slice(0, 20); // Return top 20 opportunities
    } catch (error) {
      console.error("Error finding arbitrage opportunities:", error);
      throw new Error("Failed to find arbitrage opportunities");
    }
  }

  public async getActivePositions(): Promise<any[]> {
    try {
      const activePositions = await Position.findAll({
        where: {
          status: "OPEN",
        },
        order: [["createdAt", "DESC"]],
      });

      // Enrich with current PnL and funding rate data
      const enrichedPositions = await Promise.all(
        activePositions.map(async (position) => {
          const currentPnL = await this.calculatePositionPnL(position);
          const currentAPR = await this.calculateCurrentAPR(position);

          return {
            ...position.toJSON(),
            currentPnL,
            currentAPR,
            hoursOpen: this.calculateHoursOpen(position.createdAt),
            shouldClose: currentAPR < position.autoCloseAPRThreshold,
          };
        }),
      );

      return enrichedPositions;
    } catch (error) {
      console.error("Error getting active positions:", error);
      throw new Error("Failed to get active positions");
    }
  }

  public async calculatePositionPnL(position: any): Promise<number> {
    try {
      // Get current funding rates for both exchanges
      const longRate = await FundingRate.getLatestForTokenAndExchange(position.longToken, position.longExchange);
      const shortRate = await FundingRate.getLatestForTokenAndExchange(position.shortToken, position.shortExchange);

      if (!longRate || !shortRate) return 0;

      // Calculate funding fees received since position opened
      const hoursOpen = this.calculateHoursOpen(position.createdAt);
      const fundingFeesReceived = this.calculateFundingFeesReceived(position, longRate, shortRate, hoursOpen);

      // Get current unrealized PnL from both exchanges if available
      let unrealizedPnL = 0;
      try {
        const longExchange = this.exchanges.find((e) => e.name === position.longExchange)?.connector;
        const shortExchange = this.exchanges.find((e) => e.name === position.shortExchange)?.connector;

        if (longExchange && position.longPositionId) {
          unrealizedPnL += await longExchange.getPositionPnL(position.longPositionId);
        }
        if (shortExchange && position.shortPositionId) {
          unrealizedPnL += await shortExchange.getPositionPnL(position.shortPositionId);
        }
      } catch (error) {
        console.warn(
          "Could not fetch unrealized PnL from exchanges:",
          error instanceof Error ? error.message : "Unknown error",
        );
      }

      return fundingFeesReceived + unrealizedPnL;
    } catch (error) {
      console.error("Error calculating position PnL:", error);
      return 0;
    }
  }

  private groupRatesByToken(rates: FundingRate[]): Record<string, any[]> {
    return rates.reduce(
      (acc, rate) => {
        const rateData = rate.dataValues || rate;
        if (!rateData.token) return acc;

        if (!acc[rateData.token]) {
          acc[rateData.token] = [];
        }
        acc[rateData.token].push(rateData);
        return acc;
      },
      {} as Record<string, any[]>,
    );
  }

  private calculateSpreadAPR(longRate: FundingRate, shortRate: FundingRate): number {
    const longApr = (365 * 24 * longRate.fundingRate) / longRate.fundingFrequency;
    const shortApr = (365 * 24 * shortRate.fundingRate) / shortRate.fundingFrequency;
    const spread = shortApr - longApr;

    return spread * 100; // Convert to percentage
  }

  private calculatePriceDeviation(longRate: any, shortRate: any): number {
    if (!longRate.markPrice || !shortRate.markPrice) return 0;

    const avgPrice = (longRate.markPrice + shortRate.markPrice) / 2;
    const priceDiff = Math.abs(longRate.markPrice - shortRate.markPrice);

    return (priceDiff / avgPrice) * 100; // Percentage deviation
  }

  private calculateConfidence(longRate: any, shortRate: any, priceDeviation: number): number {
    let confidence = 90; // Base confidence

    // Reduce confidence based on price deviation
    confidence -= priceDeviation * 10;

    // Reduce confidence if funding rates are too close
    const spread = Math.abs(shortRate.fundingRate - longRate.fundingRate);
    if (spread < 0.0001) confidence -= 20; // Very small spread

    // Increase confidence for established exchanges
    const establishedExchanges = ["vest", "hyperliquid"];
    if (establishedExchanges.includes(longRate.exchange) && establishedExchanges.includes(shortRate.exchange)) {
      confidence += 10;
    }

    return Math.max(50, Math.min(95, confidence));
  }

  private calculateMaxSize(longRate: any, shortRate: any): number {
    // Base on available liquidity and open interest
    // This would ideally come from exchange APIs
    const baseSize = 10000;

    // Reduce size for newer/smaller exchanges
    const smallExchanges = ["extended", "orderly"];
    if (smallExchanges.includes(longRate.exchange) || smallExchanges.includes(shortRate.exchange)) {
      return baseSize * 0.5;
    }

    return baseSize;
  }

  private assessRiskLevel(spreadAPR: number, priceDeviation: number): "LOW" | "MEDIUM" | "HIGH" {
    if (priceDeviation > 0.3 || spreadAPR > 50) return "HIGH";
    if (priceDeviation > 0.1 || spreadAPR > 20) return "MEDIUM";
    return "LOW";
  }

  private getFundingFrequency(exchange: string): string {
    const exchangeInfo = this.exchanges.find((e) => e.name === exchange);
    return exchangeInfo?.fundingFrequency === "hourly" ? "Hourly" : "8 Hours";
  }

  private calculateHoursOpen(createdAt: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - new Date(createdAt).getTime();
    return diffMs / (1000 * 60 * 60); // Convert to hours
  }

  private async calculateCurrentAPR(position: any): Promise<number> {
    try {
      const longRate = await FundingRate.getLatestForTokenAndExchange(position.longToken, position.longExchange);
      const shortRate = await FundingRate.getLatestForTokenAndExchange(position.shortToken, position.shortExchange);

      if (!longRate || !shortRate) return 0;

      return this.calculateSpreadAPR(longRate, shortRate);
    } catch (error) {
      console.error("Error calculating current APR:", error);
      return 0;
    }
  }

  private calculateFundingFeesReceived(position: any, longRate: any, shortRate: any, hoursOpen: number): number {
    // Simplified calculation - in reality, this would need to track
    // actual funding payments received from each exchange
    const avgRate = (Math.abs(longRate.fundingRate) + Math.abs(shortRate.fundingRate)) / 2;
    const fundingCycles = hoursOpen / (longRate.exchange === "vest" || longRate.exchange === "extended" ? 1 : 8);

    return avgRate * fundingCycles * position.size;
  }
}

export const arbitrageService = new ArbitrageService();
