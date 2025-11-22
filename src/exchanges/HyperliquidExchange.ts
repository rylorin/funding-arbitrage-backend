// API reference documation available at https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api
import { createSignedPositionsRequest, HyperliquidAuthConfig, signHyperliquidRequest } from "@hyperliquid/signing";
import WebSocket from "ws";
import { HyperliquidPosition, HyperliquidPositionsResponse } from "../hyperliquid/types.js";
import Position, { PositionSide, PositionStatus } from "../models/Position";
import { ExchangeConnector, FundingRateData, OrderData, PlacedOrderData, TokenSymbol } from "../types/index";

interface HyperliquidFundingHistory {
  coin: string;
  fundingRate: string;
  premium: string;
  time: number;
}

type VenueName = string;
type HyperliquidPredictedFundingElement = {
  fundingRate: string;
  nextFundingTime: number;
};
type HyperliquidPredictedFundingItem = [VenueName, HyperliquidPredictedFundingElement];
type HyperliquidPredictedFunding = [TokenSymbol, HyperliquidPredictedFundingItem[]];

export class HyperliquidExchange extends ExchangeConnector {
  private ws: WebSocket | null = null;

  constructor() {
    super("hyperliquid");

    // Auto-connect WebSocket for real-time data
    // this.connectWebSocket((data) => console.log("Hyperliquid WS:", data));
  }

  public async testConnection(): Promise<number> {
    try {
      // Test connection with a simple info request (get all mid prices)
      const response = await this.post("/info", {
        type: "allMids",
      });
      const count = Object.keys(response.data || {}).length;

      console.log(`✅ Hyperliquid Exchange connected: ${count} markets available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Hyperliquid Exchange:", error);
      return 0;
    }
  }

  private extractTokensFromTickers(marketsResponse: HyperliquidPredictedFunding[]): TokenSymbol[] {
    return marketsResponse.reduce((p, row) => {
      const [coin, perps] = row;
      const element = perps.find((p) => p[0] === "HlPerp");
      if (element) p.push(coin);
      return p;
    }, [] as TokenSymbol[]);
  }

  public async getPrice(tokens?: TokenSymbol[]): Promise<{ [token: string]: number }> {
    try {
      const prices: { [token: string]: number } = {};

      const response = await this.post("/info", {
        type: "allMids",
      });

      const allMids = response.data as { [token: string]: number };

      const tokensToProcess = tokens || (Object.keys(allMids) as TokenSymbol[]);

      for (const token of tokensToProcess) {
        if (allMids[token] !== undefined) {
          prices[token] = allMids[token];
        }
      }

      return prices;
    } catch (error) {
      console.error("Error fetching Hyperliquid prices:", error);
      throw new Error("Failed to fetch prices from Hyperliquid");
    }
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      const prices = await this.getPrice(tokens);

      // Get predicted funding rates for current period
      const predictedResponse = await this.post("/info", {
        type: "predictedFundings",
      });

      const predictedFundings = predictedResponse.data as HyperliquidPredictedFunding[];

      // If no tokens specified, use default supported tokens
      const tokensToProcess = tokens || this.extractTokensFromTickers(predictedFundings);
      // console.log('Hyperliquid tokens to process:', tokensToProcess);

      for (const token of tokensToProcess) {
        try {
          // Find predicted funding for this token
          const predictedFunding = predictedFundings.find(
            (funding: HyperliquidPredictedFunding) => funding[0] === token,
          );
          // console.log(`Hyperliquid predicted funding for ${token}:`, predictedFunding);
          if (predictedFunding) {
            const nextFundingItem = predictedFunding[1].find((item) => item[0] === "HlPerp");
            // Hyperliquid has 8-hour funding cycles
            const nextFunding = new Date(nextFundingItem![1].nextFundingTime);

            fundingRates.push({
              exchange: "hyperliquid",
              token,
              fundingRate: parseFloat(nextFundingItem![1].fundingRate), // 1h funding rate
              fundingFrequency: parseInt(this.config.get("fundingFrequency")), // in hours
              nextFunding,
              updatedAt: new Date(),
              markPrice: prices[token],
            });
          } else {
            // If no predicted funding, try to get the latest historical funding
            const historyResponse = await this.post("/info", {
              type: "fundingHistory",
              coin: token,
              startTime: Date.now() - 24 * 60 * 60 * 1000, // Last 24 hours
            });

            const fundingHistory = historyResponse.data as HyperliquidFundingHistory[];

            if (fundingHistory && fundingHistory.length > 0) {
              // Get the most recent funding rate
              const latestFunding = fundingHistory[fundingHistory.length - 1];

              // Calculate next funding time (8-hour cycles)
              const lastFundingTime = new Date(latestFunding.time);
              const nextFunding = new Date(lastFundingTime.getTime() + 8 * 60 * 60 * 1000);

              fundingRates.push({
                exchange: this.name,
                token,
                fundingRate: parseFloat(latestFunding.fundingRate),
                fundingFrequency: this.config.get("fundingFrequency"), // in hours
                nextFunding,
                updatedAt: new Date(),
                markPrice: prices[token],
              });
            }
          }
        } catch (error) {
          console.warn(`Failed to get funding rate for ${token} on Hyperliquid:`, error);
        }
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Hyperliquid funding rates:", error);
      throw new Error("Failed to fetch funding rates from Hyperliquid");
    }
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      // Note: This requires authentication with user's wallet address
      // For now, return empty object as we don't have user wallet integration
      console.warn("Hyperliquid account balance requires user wallet address authentication");
      return {};
    } catch (error) {
      console.error("Error fetching Hyperliquid account balance:", error);
      throw new Error("Failed to fetch account balance from Hyperliquid");
    }
  }

  /**
   * Place a new order on Hyperliquid exchange
   * @param order description of order to place
   */
  public async openPosition(order: OrderData): Promise<PlacedOrderData> {
    const { token, side, size, price, leverage, slippage } = order;
    try {
      // Check if authentication credentials are available
      const walletAddress = this.config.has("walletAddress") ? this.config.get<string>("walletAddress") : null;
      const privateKey = this.config.has("privateKey") ? this.config.get<string>("privateKey") : null;

      if (!walletAddress || !privateKey) {
        throw new Error("Hyperliquid position opening requires walletAddress and privateKey configuration");
      }

      // Get current market price to calculate limit price with slippage
      const prices = await this.getPrice([token]);
      const currentPrice = prices[token];

      if (!currentPrice) {
        throw new Error(`Failed to get current price for ${token}`);
      }

      // Calculate limit price based on side and slippage
      const isBuy = side === PositionSide.LONG;
      const limitPrice = isBuy
        ? currentPrice * (1 + slippage / 100) // For long, add slippage
        : currentPrice * (1 - slippage / 100); // For short, subtract slippage

      // Create order action for Hyperliquid
      const orderAction = {
        type: "order",
        orders: [
          {
            a: token, // asset/coin
            b: isBuy, // is buy
            p: limitPrice.toFixed(5), // limit price
            s: size.toFixed(4), // size
            r: false, // reduce only
            t: {
              limit: {
                tif: "Ioc", // time in force: Immediate or Cancel (market-like)
              },
            },
          },
        ],
        grouping: "na",
      };

      // If leverage is specified, set it first
      if (leverage) {
        const leverageAction = {
          type: "updateLeverage",
          asset: token,
          isCross: true,
          leverage: leverage,
        };

        const nonce = Date.now();
        const signedLeverageRequest = await signHyperliquidRequest(leverageAction, nonce, privateKey);

        // Send leverage update request
        await this.post("/exchange", signedLeverageRequest);
      }

      // Sign and send the order
      const nonce = Date.now();
      const signedRequest = await signHyperliquidRequest(orderAction, nonce, privateKey);

      // Place the order
      const response = await this.post("/exchange", signedRequest);

      if (!response.data || response.data.status === "err") {
        throw new Error(response.data?.response || "Failed to place order");
      }

      // Extract order ID from response
      const orderResult = response.data.response?.data?.statuses?.[0];
      if (!orderResult || !orderResult.resting) {
        throw new Error("Order was not placed successfully");
      }

      const orderId = orderResult.resting.oid.toString();

      console.log(`✅ Hyperliquid ${side} position opened for ${token}: ${orderId}`);

      return {
        exchange: order.exchange,
        token: order.token,
        side: order.side,
        leverage: order.leverage,
        slippage: order.slippage,

        orderId,
        price: limitPrice,
        size,
      };
    } catch (error) {
      console.error(`Error opening Hyperliquid ${side} position for ${token}:`, error);
      throw error;
    }
  }

  public async closePosition(_orderData: OrderData): Promise<PlacedOrderData> {
    throw new Error("Hyperliquid position closing requires wallet authentication and signing");
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Note: This requires user's wallet address to fetch position data
      // For now, throw an error indicating authentication is needed
      throw new Error("Hyperliquid position PnL requires user wallet address authentication");
    } catch (error) {
      console.error(`Error fetching Hyperliquid position PnL for ${positionId}:`, error);
      throw new Error("Failed to fetch position PnL from Hyperliquid");
    }
  }

  public async XgetAllPositions(): Promise<Position[]> {
    try {
      // Check if authentication credentials are available
      const walletAddress = this.config.has("walletAddress") ? this.config.get<string>("walletAddress") : null;
      const privateKey = this.config.has("privateKey") ? this.config.get<string>("privateKey") : null;

      if (!walletAddress || !privateKey) {
        console.warn("Hyperliquid positions require walletAddress and privateKey configuration");
        return [];
      }

      const auth: HyperliquidAuthConfig = {
        walletAddress,
        privateKey,
      };

      // Create signed request for positions
      const signedRequest = await createSignedPositionsRequest(auth);

      // Make API call to get positions
      const response = await this.post("/exchange", signedRequest);

      if (!response.data) {
        console.warn("No positions data received from Hyperliquid");
        return [];
      }

      // Parse the response
      const positionsData: HyperliquidPositionsResponse = response.data;

      // Extract positions for the user
      const userPositions = positionsData[walletAddress.toLowerCase()];
      if (!userPositions || !userPositions.assetPositions) {
        return [];
      }

      // Map Hyperliquid positions to Position model
      return userPositions.assetPositions.map((hlPosition: HyperliquidPosition) => ({
        id: `${walletAddress}-${hlPosition.coin}`,
        userId: "userId", // This should be provided by the caller
        tradeId: "tradeId", // This should be provided by the caller
        token: hlPosition.coin as TokenSymbol,
        status: parseFloat(hlPosition.szi) !== 0 ? PositionStatus.OPEN : PositionStatus.CLOSED,
        entryTimestamp: new Date(), // Hyperliquid doesn't provide entry timestamp in this endpoint

        exchange: this.name,
        side: parseFloat(hlPosition.szi) > 0 ? PositionSide.LONG : PositionSide.SHORT,
        size: Math.abs(parseFloat(hlPosition.szi)),
        price: parseFloat(hlPosition.entryPx),
        leverage: hlPosition.leverage.value,
        slippage: 0,
        orderId: "orderId", // Not available in this endpoint

        cost: parseFloat(hlPosition.positionValue),
        unrealizedPnL: parseFloat(hlPosition.unrealizedPnl),
        realizedPnL: parseFloat(hlPosition.realizedPnl),

        updatedAt: new Date(),
        createdAt: new Date(),
      })) as unknown as Position[];
    } catch (error) {
      console.error("Error fetching Hyperliquid positions:", error);
      throw new Error("Failed to fetch positions from Hyperliquid");
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    try {
      // Check if authentication credentials are available
      const walletAddress = this.config.has("walletAddress") ? this.config.get<string>("walletAddress") : null;
      const privateKey = this.config.has("privateKey") ? this.config.get<string>("privateKey") : null;

      if (!walletAddress || !privateKey) {
        console.warn("Hyperliquid positions require walletAddress and privateKey configuration");
        return [];
      }

      // Make API call to get positions
      const response = await this.post("/info", { type: "userFills", user: walletAddress });

      if (!response.data) {
        console.warn("No positions data received from Hyperliquid");
        return [];
      }

      // Parse the response
      const positionsData: HyperliquidPositionsResponse = response.data;

      // Extract positions for the user
      const userPositions = positionsData[walletAddress.toLowerCase()];
      if (!userPositions || !userPositions.assetPositions) {
        return [];
      }

      // Map Hyperliquid positions to Position model
      return userPositions.assetPositions.map((hlPosition: HyperliquidPosition) => ({
        id: `${walletAddress}-${hlPosition.coin}`,
        userId: "userId", // This should be provided by the caller
        tradeId: "tradeId", // This should be provided by the caller
        token: hlPosition.coin as TokenSymbol,
        status: parseFloat(hlPosition.szi) !== 0 ? PositionStatus.OPEN : PositionStatus.CLOSED,
        entryTimestamp: new Date(), // Hyperliquid doesn't provide entry timestamp in this endpoint

        exchange: this.name,
        side: parseFloat(hlPosition.szi) > 0 ? PositionSide.LONG : PositionSide.SHORT,
        size: Math.abs(parseFloat(hlPosition.szi)),
        price: parseFloat(hlPosition.entryPx),
        leverage: hlPosition.leverage.value,
        slippage: 0,
        orderId: "orderId", // Not available in this endpoint

        cost: parseFloat(hlPosition.positionValue),
        unrealizedPnL: parseFloat(hlPosition.unrealizedPnl),
        realizedPnL: parseFloat(hlPosition.realizedPnl),

        updatedAt: new Date(),
        createdAt: new Date(),
      })) as unknown as Position[];
    } catch (error) {
      console.error("Error fetching Hyperliquid positions:", error);
      throw new Error("Failed to fetch positions from Hyperliquid");
    }
  }

  public async getOrderHistory(_symbol?: string, _limit: number = 100): Promise<any[]> {
    try {
      // Note: This requires user's wallet address for order history
      console.warn("Hyperliquid order history requires user wallet address authentication");
      return [];
    } catch (error) {
      console.error("Error fetching Hyperliquid order history:", error);
      throw new Error("Failed to fetch order history from Hyperliquid");
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      console.log("🔌 Attempting to connect to Hyperliquid WebSocket:", this.wsUrl);
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.log("✅ Hyperliquid WebSocket connected");

        // Subscribe to multiple topics and coins for comprehensive data
        const tradingPairs: string[] = [];
        const subscriptionTypes = ["trades", "book", "candle", "fills"];

        let subscriptionId = 1;

        // Subscribe to public market data for all trading pairs
        tradingPairs.forEach((coin) => {
          subscriptionTypes.forEach((type) => {
            const subscribeMessage = {
              method: "subscribe",
              subscription: {
                type: type,
                coin: coin,
                isPerp: true, // Hyperliquid primarily trades perpetuals
              },
              id: subscriptionId++,
            };

            console.log(`📡 Subscribing to ${type} for ${coin}`);
            this.ws?.send(JSON.stringify(subscribeMessage));
          });
        });

        // Subscribe to user-specific topics if wallet address is available
        if (this.config.has("walletAddress")) {
          const userTopics = ["userFills", "userFillsByTime", "openInterest", "fundingRates"];

          userTopics.forEach((topic) => {
            const userSubscribeMessage = {
              method: "subscribe",
              subscription: {
                type: topic,
                user: this.config.get("walletAddress"),
              },
              id: subscriptionId++,
            };

            console.log(`📡 Subscribing to user topic: ${topic}`);
            this.ws?.send(JSON.stringify(userSubscribeMessage));
          });
        }

        // Send ping every 30 seconds to maintain connection
        const pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            const pingMessage = {
              method: "ping",
              id: Date.now(),
            };
            this.ws.send(JSON.stringify(pingMessage));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log("📨 Hyperliquid WebSocket message received:", JSON.stringify(message, null, 2));
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Hyperliquid WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Hyperliquid WebSocket error:", error);
      });

      this.ws.on("close", (code, reason) => {
        console.log("Hyperliquid WebSocket disconnected:", { code, reason: reason.toString() });
        // Auto-reconnect after 5 seconds
        setTimeout(() => {
          console.log("🔄 Attempting to reconnect to Hyperliquid WebSocket...");
          this.connectWebSocket(onMessage);
        }, 5000);
      });
    } catch (error) {
      console.error("Error connecting to Hyperliquid WebSocket:", error);
    }
  }

  public disconnect(): void {
    if (this.ws) {
      console.log("🔌 Disconnecting Hyperliquid WebSocket...");
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
      this.isConnected = false;
      console.log("✅ Hyperliquid WebSocket disconnected");
    }
  }
}

export const hyperliquidExchange = new HyperliquidExchange();
export default hyperliquidExchange;
