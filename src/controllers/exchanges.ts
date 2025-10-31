import { Request, Response } from "express";
import Joi from "joi";
import { AuthenticatedRequest } from "../middleware/auth";
import { FundingRate } from "../models/index";
import { extendedExchange } from "../services/exchanges/ExtendedExchange";
import { hyperliquidExchange } from "../services/exchanges/HyperliquidExchange";
import { woofiExchange } from "../services/exchanges/OrderlyExchange";
import { vestExchange } from "../services/exchanges/VestExchange";
import { TokenSymbol } from "../types/index";

export const getFundingRates = async (req: Request, res: Response): Promise<void> => {
  try {
    const querySchema = Joi.object({
      token: Joi.string().valid("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP").optional(),
      exchange: Joi.string()
        .valid("vest", "hyperliquid", "orderly", "extended", "paradex", "backpack", "hibachi")
        .optional(),
      hours: Joi.number().integer().min(1).max(168).default(24), // max 1 week
    });

    const { error, value } = querySchema.validate(req.query);
    if (error) {
      res.status(400).json({
        error: "Query validation error",
        details: error.details,
      });
      return;
    }

    const { token, exchange, hours } = value;

    if (token && exchange) {
      // Get historical rates for specific token and exchange
      const rates = await FundingRate.getHistoricalRates(token, exchange, hours);
      res.json({ rates });
      return;
    }

    // Get latest rates for all exchanges/tokens
    const rates = await FundingRate.getLatestRates(token, exchange);

    // Group by token for better presentation
    const groupedRates: Record<string, any[]> = {};
    rates.forEach((rate: any) => {
      if (!groupedRates[rate.token]) {
        groupedRates[rate.token] = [];
      }
      groupedRates[rate.token].push({
        exchange: rate.exchange,
        fundingRate: rate.fundingRate,
        nextFunding: rate.nextFunding,
        timestamp: rate.timestamp,
        markPrice: rate.markPrice,
        indexPrice: rate.indexPrice,
      });
    });

    res.json({
      fundingRates: groupedRates,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Funding rates fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// export const getArbitrageOpportunities = async (req: Request, res: Response): Promise<void> => {
//   try {
//     const querySchema = Joi.object({
//       token: Joi.string().valid("BTC", "ETH", "SOL", "AVAX", "MATIC", "ARB", "OP").optional(),
//       minAPR: Joi.number().min(0).default(5), // minimum 5% APR
//       limit: Joi.number().integer().min(1).max(50).default(10),
//     });

//     const { error, value } = querySchema.validate(req.query);
//     if (error) {
//       res.status(400).json({
//         error: "Query validation error",
//         details: error.details,
//       });
//       return;
//     }

//     const { token, minAPR, limit } = value;

//     // Get latest funding rates
//     const rates = await FundingRate.getLatestRates(token);

//     // Group rates by token
//     const ratesByToken: Record<string, any[]> = {};
//     rates.forEach((rate) => {
//       if (!ratesByToken[rate.token]) {
//         ratesByToken[rate.token] = [];
//       }
//       ratesByToken[rate.token].push(rate);
//     });

//     const opportunities: ArbitrageOpportunity[] = [];

//     // Calculate arbitrage opportunities for each token
//     Object.keys(ratesByToken).forEach((tokenSymbol) => {
//       const tokenRates = ratesByToken[tokenSymbol];

//       // Find best long and short opportunities
//       tokenRates.sort((a, b) => a.fundingRate - b.fundingRate);

//       for (let i = 0; i < tokenRates.length - 1; i++) {
//         for (let j = i + 1; j < tokenRates.length; j++) {
//           const longRate = tokenRates[i]; // Lower funding rate (pay less)
//           const shortRate = tokenRates[j]; // Higher funding rate (receive more)

//           if (longRate.exchange === shortRate.exchange) continue;

//           const spreadAPR = (shortRate.fundingRate - longRate.fundingRate) * 8760 * 100; // Convert to annual %

//           if (spreadAPR >= minAPR) {
//             opportunities.push({
//               token: tokenSymbol as TokenSymbol,
//               longExchange: longRate.exchange,
//               shortExchange: shortRate.exchange,
//               longFundingRate: longRate.fundingRate,
//               shortFundingRate: shortRate.fundingRate,
//               spreadAPR,
//               confidence: Math.min(95, 50 + spreadAPR * 2), // Simple confidence calculation
//               minSize: 100, // TODO: Get from exchange config
//               maxSize: 10000, // TODO: Get from exchange config
//             });
//           }
//         }
//       }
//     });

//     // Sort by APR and limit results
//     opportunities.sort((a, b) => b.spreadAPR - a.spreadAPR);
//     const limitedOpportunities = opportunities.slice(0, limit);

//     res.json({
//       opportunities: limitedOpportunities,
//       count: limitedOpportunities.length,
//       timestamp: new Date(),
//     });
//   } catch (error) {
//     console.error("Arbitrage opportunities calculation error:", error);
//     res.status(500).json({ error: "Internal server error" });
//   }
// };

export const getExchangePairs = async (req: Request, res: Response): Promise<void> => {
  try {
    const { exchange } = req.params;

    const exchangeSchema = Joi.string()
      .valid("vest", "hyperliquid", "orderly", "extended", "paradex", "backpack", "hibachi")
      .required();
    const { error } = exchangeSchema.validate(exchange);

    if (error) {
      res.status(400).json({
        error: "Invalid exchange name",
        validExchanges: ["vest", "hyperliquid", "orderly", "extended", "paradex", "backpack", "hibachi"],
      });
      return;
    }

    // TODO: Get actual pairs from exchange APIs
    // For now, return static data based on exchange
    const exchangePairs: Record<string, string[]> = {
      vest: ["BTC-USDT-PERP", "ETH-USDT-PERP", "SOL-USDT-PERP", "ARB-USDT-PERP", "OP-USDT-PERP"],
      hyperliquid: ["BTC-USD", "ETH-USD", "SOL-USD", "AVAX-USD", "ARB-USD"],
      orderly: ["PERP_BTC_USDC", "PERP_ETH_USDC", "PERP_SOL_USDC", "PERP_AVAX_USDC", "PERP_MATIC_USDC"],
      extended: ["BTC-USDT", "ETH-USDT", "SOL-USDT", "AVAX-USDT"],
      paradex: ["BTC-USD-PERP", "ETH-USD-PERP", "SOL-USD-PERP"],
      backpack: ["BTC_USDC", "ETH_USDC", "SOL_USDC"],
      hibachi: ["BTC/USDT", "ETH/USDT", "SOL/USDT"],
    };

    const pairs = exchangePairs[exchange] || [];

    res.json({
      exchange,
      pairs,
      count: pairs.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Exchange pairs fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getExchangeStatus = async (_req: Request, res: Response): Promise<void> => {
  try {
    const exchangeStatuses = [
      {
        name: "vest",
        isConnected: vestExchange.isConnected,
        lastUpdate: new Date(),
        // supportedTokens: ['BTC', 'ETH', 'SOL', 'ARB', 'OP'],
      },
      {
        name: "hyperliquid",
        isConnected: hyperliquidExchange.isConnected,
        lastUpdate: new Date(),
        // supportedTokens: ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB'],
      },
      {
        name: "orderly",
        isConnected: woofiExchange.isConnected,
        lastUpdate: new Date(),
        // supportedTokens: ['BTC', 'ETH', 'SOL', 'AVAX', 'MATIC'],
      },
      {
        name: "extended",
        isConnected: extendedExchange.isConnected,
        lastUpdate: new Date(),
        // supportedTokens: ['BTC', 'ETH', 'SOL', 'AVAX'],
      },
    ];

    const connectedCount = exchangeStatuses.filter((ex) => ex.isConnected).length;
    const totalCount = exchangeStatuses.length;

    res.json({
      exchanges: exchangeStatuses,
      summary: {
        connected: connectedCount,
        total: totalCount,
        healthScore: Math.round((connectedCount / totalCount) * 100),
      },
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Exchange status fetch error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const refreshFundingRates = async (_req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    // This endpoint triggers a manual refresh of funding rates
    // In production, this would be rate-limited and possibly restricted to admin users

    const tokensToUpdate: TokenSymbol[] = ["BTC", "ETH", "SOL"];
    const updatedRates: any[] = [];

    // Update Vest rates
    if (vestExchange.isConnected) {
      try {
        const vestRates = await vestExchange.getFundingRates(tokensToUpdate);
        for (const rate of vestRates) {
          const upsertData: any = {
            exchange: rate.exchange as any,
            token: rate.token as any,
            fundingRate: rate.fundingRate,
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
        }
      } catch (error) {
        console.error("Error updating Vest rates:", error);
      }
    }

    // Update Hyperliquid rates
    if (hyperliquidExchange.isConnected) {
      try {
        const hyperliquidRates = await hyperliquidExchange.getFundingRates(tokensToUpdate);
        for (const rate of hyperliquidRates) {
          const upsertData: any = {
            exchange: rate.exchange as any,
            token: rate.token as any,
            fundingRate: rate.fundingRate,
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
        }
      } catch (error) {
        console.error("Error updating Hyperliquid rates:", error);
      }
    }

    // Update Orderly rates
    if (woofiExchange.isConnected) {
      try {
        const woofiRates = await woofiExchange.getFundingRates(tokensToUpdate);
        for (const rate of woofiRates) {
          const upsertData: any = {
            exchange: rate.exchange as any,
            token: rate.token as any,
            fundingRate: rate.fundingRate,
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
        }
      } catch (error) {
        console.error("Error updating Orderly rates:", error);
      }
    }

    // Update Extended rates
    if (extendedExchange.isConnected) {
      try {
        const extendedRates = await extendedExchange.getFundingRates(tokensToUpdate);
        for (const rate of extendedRates) {
          const upsertData: any = {
            exchange: rate.exchange as any,
            token: rate.token as any,
            fundingRate: rate.fundingRate,
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
        }
      } catch (error) {
        console.error("Error updating Extended rates:", error);
      }
    }

    res.json({
      message: "Funding rates refresh initiated",
      updatedRates: updatedRates.length,
      exchanges: updatedRates.map((r) => r.exchange).filter((v, i, a) => a.indexOf(v) === i),
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Funding rates refresh error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
