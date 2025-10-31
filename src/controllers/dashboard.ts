import { opportunityDetectionService } from "@/services/OpportunityDetectionService";
import { Request, Response } from "express";
import Joi from "joi";
import { FundingRate } from "../models/index";
import { RiskLevel } from "../types";

// Interface pour les données formatées pour le tableau des taux
interface FundingRateDisplay {
  exchange: string;
  symbol: string;
  fundingRate: number;
  fundingRatePercent: string;
  fundingAPR: string;
  fundingFrequency: number; // in hours
  nextFunding: string;
  timeToFunding: string;
  markPrice: number;
  indexPrice: number;
  status: "ACTIVE" | "INACTIVE";
  category: string;
}

// interface _ArbitrageOpportunityDisplay {
//   rank: number;
//   token: string;
//   longExchange: string;
//   shortExchange: string;
//   longFundingRate: string;
//   shortFundingRate: string;
//   spreadPercent: string;
//   spreadAPR: string;
//   confidence: number;
//   riskLevel: string;
//   nextFunding: string;
//   priceDeviation: string;
//   maxSize: string;
//   longPrice: number;
//   shortPrice: number;
// }

// Helper functions
// function getFundingFrequency(exchange: ExchangeName): number {
//   return 8760 / exchangeConfigs[exchange].fundingFrequency;
// }

// function getFundingFrequencyText(exchange: ExchangeName): string {
//   if (exchangeConfigs[exchange].fundingFrequency === 1) return "Hourly";
//   else return `${exchangeConfigs[exchange].fundingFrequency} Hours`;
// }

function formatTimeToFunding(nextFunding: Date): string {
  return nextFunding.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export const getDashboard = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Get latest funding rates for all exchanges and tokens
    const latestRates = await FundingRate.getLatestRates();

    // Format funding rates for display
    const fundingRatesDisplay: FundingRateDisplay[] = latestRates.map((rate) => ({
      exchange: rate.exchange.toUpperCase(),
      symbol: `${rate.token}-PERP`,
      fundingRate: rate.fundingRate,
      fundingRatePercent: (rate.fundingRate * 100).toFixed(6),
      fundingAPR: (rate.fundingRate * rate.fundingFrequency * 100).toFixed(2),
      fundingFrequency: rate.fundingFrequency, // in hours
      nextFunding: formatTimeToFunding(rate.nextFunding),
      timeToFunding: getTimeToFunding(rate.nextFunding),
      markPrice: rate.markPrice || 0,
      indexPrice: rate.indexPrice || 0,
      status: "ACTIVE" as const,
      category: getTokenCategory(rate.token),
    }));

    // Group by token for better display
    const ratesByToken = groupByToken(fundingRatesDisplay);

    // Calculate exchange statistics
    const exchangeStats = calculateExchangeStats(latestRates);

    // Get best arbitrage opportunities
    const opportunities = await opportunityDetectionService.findOpportunities();
    // const opportunitiesDisplay: ArbitrageOpportunityDisplay[] = opportunities.map((opp, index) => ({
    //   rank: index + 1,
    //   token: opp.token,
    //   longExchange: opp.longExchange.toUpperCase(),
    //   shortExchange: opp.shortExchange.toUpperCase(),
    //   longFundingRate: (opp.longFundingRate * 100).toFixed(6) + "%",
    //   shortFundingRate: (opp.shortFundingRate * 100).toFixed(6) + "%",
    //   spreadPercent: ((opp.shortFundingRate - opp.longFundingRate) * 100).toFixed(6) + "%",
    //   spreadAPR: opp.spreadAPR.toFixed(2) + "%",
    //   confidence: opp.confidence,
    //   riskLevel: opp.riskLevel,
    //   nextFunding: getNextFundingTime(opp),
    //   priceDeviation: opp.priceDeviation ? opp.priceDeviation.toFixed(3) + "%" : "0.000%",
    //   maxSize: "$" + opp.maxSize.toLocaleString(),
    //   longPrice: opp.longMarkPrice,
    //   shortPrice: opp.shortMarkPrice,
    // }));

    res.json({
      success: true,
      data: {
        fundingRates: ratesByToken,
        allRates: fundingRatesDisplay,
        opportunities: opportunities,
        stats: {
          totalExchanges: exchangeStats.totalExchanges,
          activeMarkets: exchangeStats.activeMarkets,
          totalOpportunities: opportunities.length,
          bestAPR: opportunities.length > 0 ? opportunities[0].spread.apr : 0,
          avgFundingRate: exchangeStats.avgFundingRate,
          lastUpdated: new Date().toISOString(),
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Dashboard fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const getFundingRatesTable = async (req: Request, res: Response): Promise<void> => {
  try {
    const querySchema = Joi.object({
      token: Joi.string().valid("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP").optional(),
      exchange: Joi.string().valid("vest", "hyperliquid", "orderly", "extended").optional(),
      sortBy: Joi.string().valid("fundingRate", "apr", "exchange", "nextFunding").default("fundingRate"),
      sortOrder: Joi.string().valid("asc", "desc").default("desc"),
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

    const { token, exchange, sortBy, sortOrder } = value;

    // Get latest rates with filters
    const rates = await FundingRate.getLatestRates(token, exchange);

    // Format for table display
    const formattedRates = rates.map((rate: any) => {
      const rateData = rate.dataValues || rate;
      return {
        exchange: rateData.exchange,
        token: rateData.token,
        symbol: `${rateData.token}-PERP`,
        fundingRate: rateData.fundingRate,
        fundingRatePercent: (rateData.fundingRate * 100).toFixed(6),
        fundingAPR: (rateData.fundingRate * rateData.fundingFrequency * 100).toFixed(2),
        fundingFrequency: rateData.fundingFrequency,
        nextFunding: rateData.nextFunding ? rateData.nextFunding.toISOString() : new Date().toISOString(),
        nextFundingFormatted: rateData.nextFunding ? formatTimeToFunding(rateData.nextFunding) : "N/A",
        timeToFunding: rateData.nextFunding ? getTimeToFunding(rateData.nextFunding) : "N/A",
        markPrice: rateData.markPrice || 0,
        indexPrice: rateData.indexPrice || 0,
        timestamp: rateData.timestamp ? rateData.timestamp.toISOString() : new Date().toISOString(),
        isPositive: rateData.fundingRate > 0,
        isNegative: rateData.fundingRate < 0,
        category: getTokenCategory(rateData.token),
      };
    });

    // Sort the results
    formattedRates.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case "fundingRate":
          comparison = a.fundingRate - b.fundingRate;
          break;
        case "apr":
          comparison = parseFloat(a.fundingAPR) - parseFloat(b.fundingAPR);
          break;
        case "exchange":
          comparison = a.exchange.localeCompare(b.exchange);
          break;
        case "nextFunding":
          comparison = new Date(a.nextFunding).getTime() - new Date(b.nextFunding).getTime();
          break;
        default:
          comparison = a.fundingRate - b.fundingRate;
      }

      return sortOrder === "desc" ? -comparison : comparison;
    });

    res.json({
      success: true,
      data: {
        rates: formattedRates,
        summary: {
          totalRates: formattedRates.length,
          positiveRates: formattedRates.filter((r) => r.isPositive).length,
          negativeRates: formattedRates.filter((r) => r.isNegative).length,
          avgFundingRate: formattedRates.reduce((sum, r) => sum + r.fundingRate, 0) / formattedRates.length,
          maxAPR: Math.max(...formattedRates.map((r) => parseFloat(r.fundingAPR))),
          minAPR: Math.min(...formattedRates.map((r) => parseFloat(r.fundingAPR))),
        },
      },
      filters: { token, exchange, sortBy, sortOrder },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Funding rates table fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

export const getArbitrageOpportunities = async (req: Request, res: Response): Promise<void> => {
  try {
    // console.log("Arbitrage opportunities query params:", req.query);
    const querySchema = Joi.object({
      minAPR: Joi.number().min(0).default(0),
      riskLevel: Joi.string().valid(RiskLevel.LOW, RiskLevel.MEDIUM, RiskLevel.HIGH).optional(),
      token: Joi.string().optional(),
      limit: Joi.number().integer().min(1).max(10_000).default(1_000),
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

    // console.log("Arbitrage opportunities validated params:", value);
    const { minAPR, riskLevel, token, limit } = value;

    // Get opportunities
    let opportunities = await opportunityDetectionService.findOpportunities({
      minAPRThreshold: minAPR,
      maxPriceDeviation: 0.5,
      riskTolerance: riskLevel,
      limit,
    });

    // Apply filters
    if (riskLevel) {
      opportunities = opportunities.filter((opp) => opp.risk.level === riskLevel);
    }

    if (token) {
      opportunities = opportunities.filter((opp) => opp.token === token);
    }

    // Limit results
    opportunities = opportunities.slice(0, limit);

    const result = {
      success: true,
      data: {
        opportunities,
        summary: {
          totalOpportunities: opportunities.length,
          bestAPR: opportunities.length > 0 ? opportunities[0].spread.apr : 0,
          avgAPR:
            opportunities.length > 0
              ? opportunities.reduce((sum, opp) => sum + opp.spread.apr, 0) / opportunities.length
              : 0,
          avgRiskScore:
            opportunities.length > 0
              ? opportunities.reduce((sum, opp) => sum + opp.risk.score, 0) / opportunities.length
              : 0,
          riskDistribution: {
            [RiskLevel.LOW]: opportunities.filter((opp) => opp.risk.level === RiskLevel.LOW).length,
            [RiskLevel.MEDIUM]: opportunities.filter((opp) => opp.risk.level === RiskLevel.MEDIUM).length,
            [RiskLevel.HIGH]: opportunities.filter((opp) => opp.risk.level === RiskLevel.HIGH).length,
          },
        },
      },
      filters: { minAPR, riskLevel, token, limit },
      timestamp: new Date().toISOString(),
    };
    if (process.env.NODE_ENV === "production") res.json(result);
    else res.send(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Arbitrage opportunities fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
};

function getTimeToFunding(nextFunding: Date): string {
  const now = new Date();
  const diffMs = nextFunding.getTime() - now.getTime();

  if (diffMs < 0) return "Past due";

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

function getTokenCategory(token: string): string {
  const categories: Record<string, string> = {
    BTC: "L1",
    ETH: "L1",
    SOL: "L1",
    AVAX: "L1",
    MATIC: "L2",
    ARB: "L2",
    OP: "L2",
  };
  return categories[token] || "Other";
}

function getExchangeColor(exchange: string): string {
  const colors: Record<string, string> = {
    vest: "#8B5CF6",
    hyperliquid: "#3B82F6",
    orderly: "#10B981",
    extended: "#F59E0B",
  };
  return colors[exchange] || "#6B7280";
}

function groupByToken(rates: FundingRateDisplay[]): Record<string, FundingRateDisplay[]> {
  return rates.reduce(
    (acc, rate) => {
      if (!acc[rate.symbol]) {
        acc[rate.symbol] = [];
      }
      acc[rate.symbol].push(rate);
      return acc;
    },
    {} as Record<string, FundingRateDisplay[]>,
  );
}

function calculateExchangeStats(rates: any[]) {
  const exchanges = [...new Set(rates.map((r) => r.exchange))];
  const avgFundingRate = rates.reduce((sum, r) => sum + r.fundingRate, 0) / rates.length;

  return {
    totalExchanges: exchanges.length,
    activeMarkets: rates.length,
    avgFundingRate: avgFundingRate,
  };
}

export const getMarketOverview = async (_req: Request, res: Response): Promise<void> => {
  try {
    const latestRates = await FundingRate.getLatestRates();
    const opportunities = await opportunityDetectionService.findOpportunities();

    // Calculate market statistics
    const totalVolume = latestRates.reduce((sum, _rate) => sum + 0, 0); // TODO: Add volume24h to FundingRate model
    const positiveRates = latestRates.filter((r) => r.fundingRate > 0);
    const negativeRates = latestRates.filter((r) => r.fundingRate < 0);

    // Exchange statistics
    const exchangeStats = latestRates.reduce((acc, rate) => {
      if (!acc[rate.exchange]) {
        acc[rate.exchange] = {
          name: rate.exchange,
          marketsCount: 0,
          avgFundingRate: 0,
          volume24h: 0,
          color: getExchangeColor(rate.exchange),
        };
      }
      acc[rate.exchange].marketsCount++;
      acc[rate.exchange].avgFundingRate += rate.fundingRate;
      acc[rate.exchange].volume24h += 0; // TODO: Add volume24h to FundingRate model
      return acc;
    }, {} as any);

    // Calculate averages
    Object.values(exchangeStats).forEach((stat: any) => {
      stat.avgFundingRate = stat.avgFundingRate / stat.marketsCount;
      stat.avgFundingRateFormatted = (stat.avgFundingRate * 100).toFixed(6) + "%";
    });

    // Token performance
    const tokenStats = latestRates.reduce((acc, rate) => {
      if (!acc[rate.token]) {
        acc[rate.token] = {
          token: rate.token,
          exchangesCount: 0,
          bestOpportunity: null,
          avgFundingRate: 0,
          prices: [],
          priceDeviation: 0,
        };
      }
      acc[rate.token].exchangesCount++;
      acc[rate.token].avgFundingRate += rate.fundingRate;
      if (rate.markPrice) {
        acc[rate.token].prices.push(rate.markPrice);
      }
      return acc;
    }, {} as any);

    // Find best opportunity for each token
    Object.keys(tokenStats).forEach((token) => {
      const tokenOpportunities = opportunities.filter((opp) => opp.token === token);
      if (tokenOpportunities.length > 0) {
        tokenStats[token].bestOpportunity = tokenOpportunities[0];
      }

      // Calculate average and price deviation
      const stat = tokenStats[token];
      stat.avgFundingRate = stat.avgFundingRate / stat.exchangesCount;

      if (stat.prices.length > 1) {
        const avgPrice = stat.prices.reduce((sum: number, price: number) => sum + price, 0) / stat.prices.length;
        const maxPrice = Math.max(...stat.prices);
        const minPrice = Math.min(...stat.prices);
        stat.priceDeviation = ((maxPrice - minPrice) / avgPrice) * 100;
      }
    });

    const marketData = {
      overview: {
        totalMarkets: latestRates.length,
        activeExchanges: Object.keys(exchangeStats).length,
        totalOpportunities: opportunities.length,
        totalVolume24h: totalVolume,
        totalVolumeFormatted: "$" + totalVolume.toLocaleString(),
        bestOpportunityAPR: opportunities[0]?.spread.apr || 0,
        averageFundingRate: latestRates.reduce((sum, r) => sum + Math.abs(r.fundingRate), 0) / latestRates.length,
        marketSentiment: positiveRates.length > negativeRates.length ? "BULLISH" : "BEARISH",
        lastUpdated: new Date().toISOString(),
      },
      fundingDistribution: {
        positive: {
          count: positiveRates.length,
          percentage: (positiveRates.length / latestRates.length) * 100,
          avgRate: positiveRates.reduce((sum, r) => sum + r.fundingRate, 0) / positiveRates.length || 0,
        },
        negative: {
          count: negativeRates.length,
          percentage: (negativeRates.length / latestRates.length) * 100,
          avgRate: negativeRates.reduce((sum, r) => sum + r.fundingRate, 0) / negativeRates.length || 0,
        },
        neutral: {
          count: latestRates.filter((r) => Math.abs(r.fundingRate) < 0.0001).length,
        },
      },
      exchangeStats: Object.values(exchangeStats),
      tokenStats: Object.values(tokenStats).sort(
        (a: any, b: any) => (b.bestOpportunity?.spreadAPR || 0) - (a.bestOpportunity?.spreadAPR || 0),
      ),
      riskMetrics: {
        lowRisk: opportunities.filter((opp) => opp.risk.level === RiskLevel.LOW).length,
        mediumRisk: opportunities.filter((opp) => opp.risk.level === RiskLevel.MEDIUM).length,
        highRisk: opportunities.filter((opp) => opp.risk.level === RiskLevel.HIGH).length,
        avgRiskScore: opportunities.reduce((sum, opp) => sum + opp.risk.score, 0) / opportunities.length || 0,
        maxPriceDeviation: Math.max(...opportunities.map((opp) => opp.risk.factors.priceDeviation || 0)),
      },
      // trends: {
      //   hourlyOpportunities: opportunities.filter(
      //     (opp) => opp.longExchange.fundingFrequency === "Hourly" || opp.shortExchange.fundingFrequency === "Hourly",
      //   ).length,
      //   eightHourOpportunities: opportunities.filter(
      //     (opp) => opp.longExchange.fundingFrequency === "8 Hours" && opp.shortExchange.fundingFrequency === "8 Hours",
      //   ).length,
      // },
    };

    res.json({
      success: true,
      data: marketData,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Market overview fetch error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
