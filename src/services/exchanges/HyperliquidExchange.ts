import axios, { AxiosInstance } from "axios";
import WebSocket from "ws";
import { exchangeConfigs, exchangeEndpoints } from "../../config/exchanges";
import { ExchangeConnector, FundingRateData, TokenSymbol } from "../../types/index";

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

export class HyperliquidExchange implements ExchangeConnector {
  public name = "hyperliquid" as const;
  public isConnected = false;

  private client: AxiosInstance;
  private baseUrl = exchangeEndpoints.hyperliquid.baseUrl;
  private wsUrl = exchangeEndpoints.hyperliquid.websocket;
  private ws: WebSocket | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.testConnection();
  }

  private async testConnection(): Promise<void> {
    try {
      // Test connection with a simple info request (get all mid prices)
      const response = await this.client.post("/info", {
        type: "allMids",
      });

      this.isConnected = true;
      console.log(`✅ Hyperliquid Exchange connected: ${Object.keys(response.data || {}).length} markets available`);
    } catch (error) {
      console.error("❌ Failed to connect to Hyperliquid Exchange:", error);
      this.isConnected = false;
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

      const response = await this.client.post("/info", {
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
      const predictedResponse = await this.client.post("/info", {
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
              fundingFrequency: exchangeConfigs["hyperliquid"].fundingFrequency, // in hours
              nextFunding,
              timestamp: new Date(),
              markPrice: prices[token],
            });
          } else {
            // If no predicted funding, try to get the latest historical funding
            const historyResponse = await this.client.post("/info", {
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
                exchange: "hyperliquid",
                token,
                fundingRate: parseFloat(latestFunding.fundingRate),
                fundingFrequency: exchangeConfigs["hyperliquid"].fundingFrequency, // in hours
                nextFunding,
                timestamp: new Date(),
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

  public async openPosition(token: TokenSymbol, side: "long" | "short", _size: number): Promise<string> {
    try {
      // Note: This requires proper authentication with user's wallet and signing
      // For now, throw an error indicating authentication is needed
      throw new Error("Hyperliquid position opening requires wallet authentication and signing");
    } catch (error) {
      console.error(`Error opening Hyperliquid ${side} position for ${token}:`, error);
      throw new Error(`Failed to open ${side} position on Hyperliquid`);
    }
  }

  public async closePosition(positionId: string): Promise<boolean> {
    try {
      // Note: This requires proper authentication with user's wallet and signing
      // For now, throw an error indicating authentication is needed
      throw new Error("Hyperliquid position closing requires wallet authentication and signing");
    } catch (error) {
      console.error(`Error closing Hyperliquid position ${positionId}:`, error);
      return false;
    }
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

  public async getAllPositions(): Promise<any[]> {
    try {
      // Note: This requires user's wallet address to fetch positions
      console.warn("Hyperliquid positions require user wallet address authentication");
      return [];
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
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.log("✅ Hyperliquid WebSocket connected");

        // Subscribe to funding rate updates
        const subscribeMessage = {
          method: "subscribe",
          subscription: {
            type: "trades",
            coin: "BTC", // Can be expanded to multiple coins
          },
        };

        this.ws?.send(JSON.stringify(subscribeMessage));
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Hyperliquid WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Hyperliquid WebSocket error:", error);
      });

      this.ws.on("close", () => {
        console.log("Hyperliquid WebSocket disconnected");
        // Auto-reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(onMessage), 5000);
      });
    } catch (error) {
      console.error("Error connecting to Hyperliquid WebSocket:", error);
    }
  }

  public disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
  }
}

export const hyperliquidExchange = new HyperliquidExchange();
