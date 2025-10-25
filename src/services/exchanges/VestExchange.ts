import axios, { AxiosInstance } from "axios";
import crypto from "crypto";
import WebSocket from "ws";
import { exchangeConfigs, exchangeEndpoints } from "../../config/exchanges";
import {
  ExchangeConnector,
  FundingRateData,
  TokenSymbol,
} from "../../types/index";

export class VestExchange implements ExchangeConnector {
  public name = "vest" as const;
  public isConnected = false;

  private client: AxiosInstance;
  private config = exchangeConfigs.vest;
  private baseUrl = exchangeEndpoints.vest.baseUrl;
  private wsUrl = exchangeEndpoints.vest.websocket;
  private ws: WebSocket | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.config.apiKey,
      },
    });

    this.client.interceptors.request.use((config) => {
      if (config.data || config.method === "get") {
        const timestamp = Date.now().toString();
        const signature = this.generateSignature(
          config.method!,
          config.url!,
          config.data || "",
          timestamp
        );

        config.headers = config.headers || {};
        (config.headers as any)["X-Timestamp"] = timestamp;
        (config.headers as any)["X-Signature"] = signature;
      }
      return config;
    });

    this.testConnection();
  }

  private generateSignature(
    method: string,
    path: string,
    body: string,
    timestamp: string
  ): string {
    const message = `${timestamp}${method.toUpperCase()}${path}${body}`;
    return crypto
      .createHmac("sha256", this.config.secretKey!)
      .update(message)
      .digest("hex");
  }

  private async testConnection(): Promise<void> {
    try {
      const response = await this.client.get("/exchangeInfo");
      this.isConnected = true;
      console.log(
        `✅ Vest Exchange connected: ${
          response.data.symbols?.length || 0
        } pairs available`
      );
    } catch (error) {
      console.error("❌ Failed to connect to Vest Exchange:", error);
      this.isConnected = false;
    }
  }

  public async getFundingRates(
    tokens?: TokenSymbol[]
  ): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      // Get all tickers which contain funding rates
      const response = await this.client.get("/ticker/latest");
      const tickerData = response.data.tickers;

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess =
        tokens || this.extractTokensFromTickers(tickerData);

      for (const token of tokensToProcess) {
        const symbol = `${token}-PERP`;

        try {
          // Find the ticker for this token
          const tokenTicker = tickerData.find(
            (ticker: any) => ticker.symbol === symbol
          );

          if (tokenTicker) {
            // Calculate next funding time (hourly funding)
            const now = new Date();
            const nextFunding = new Date(
              now.getTime() + (60 - now.getMinutes()) * 60 * 1000
            );
            nextFunding.setSeconds(0);
            nextFunding.setMilliseconds(0);

            fundingRates.push({
              exchange: "vest",
              token,
              fundingRate: parseFloat(tokenTicker.oneHrFundingRate), // 1h funding rate
              nextFunding,
              fundingFrequency: exchangeConfigs["vest"].fundingFrequency, // in hours
              timestamp: new Date(),
              markPrice: tokenTicker.markPrice
                ? parseFloat(tokenTicker.markPrice)
                : undefined,
              indexPrice: tokenTicker.indexPrice
                ? parseFloat(tokenTicker.indexPrice)
                : undefined,
            });
          }
        } catch (error) {
          console.warn(
            `Failed to get funding rate for ${token} on Vest:`,
            error
          );
        }
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Vest funding rates:", error);
      throw new Error("Failed to fetch funding rates from Vest");
    }
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      const response = await this.client.get("/account");
      const balances: { [token: string]: number } = {};

      if (response.data.balances) {
        response.data.balances.forEach((balance: any) => {
          // Vest uses USDC as primary numéraire
          balances[balance.coin] = parseFloat(balance.total);
        });
      }

      return balances;
    } catch (error) {
      console.error("Error fetching Vest account balance:", error);
      throw new Error("Failed to fetch account balance from Vest");
    }
  }

  public async openPosition(
    token: TokenSymbol,
    side: "long" | "short",
    size: number
  ): Promise<string> {
    try {
      const symbol = `${token}-PERP`;
      const isBuy = side === "long";

      const orderData = {
        symbol,
        size: size.toString(),
        isBuy,
        orderType: "market",
        timeInForce: "ioc", // Immediate or Cancel
      };

      const response = await this.client.post("/orders", orderData);

      if (response.data.orderId || response.data.id) {
        const orderId = response.data.orderId || response.data.id;
        console.log(`✅ Vest ${side} position opened: ${orderId}`);
        return orderId.toString();
      }

      throw new Error(
        `Failed to open position: ${response.data.error || "Unknown error"}`
      );
    } catch (error) {
      console.error(`Error opening Vest ${side} position for ${token}:`, error);
      throw new Error(`Failed to open ${side} position on Vest`);
    }
  }

  public async closePosition(positionId: string): Promise<boolean> {
    try {
      const response = await this.client.post("/orders/cancel", {
        orderId: positionId,
      });

      if (response.data.success || response.status === 200) {
        console.log(`✅ Vest position closed: ${positionId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Error closing Vest position ${positionId}:`, error);
      return false;
    }
  }

  private extractTokensFromTickers(tickerData: any[]): TokenSymbol[] {
    const tokens = tickerData
      .map((ticker): TokenSymbol => ticker.symbol)
      .filter((symbol) => !symbol.endsWith("-USD-PERP"))
      .map((symbol) => symbol.replace("-PERP", ""));
    return tokens;
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Get account info which includes positions
      const response = await this.client.get("/account");

      if (response.data.positions) {
        const position = response.data.positions.find(
          (pos: any) => pos.id === positionId
        );
        if (position && position.unrealizedPnl) {
          return parseFloat(position.unrealizedPnl);
        }
      }

      return 0;
    } catch (error) {
      console.error(
        `Error fetching Vest position PnL for ${positionId}:`,
        error
      );
      throw new Error("Failed to fetch position PnL from Vest");
    }
  }

  public async getAllPositions(): Promise<any[]> {
    try {
      const response = await this.client.get("/account");
      return response.data.positions || [];
    } catch (error) {
      console.error("Error fetching Vest positions:", error);
      throw new Error("Failed to fetch positions from Vest");
    }
  }

  public async getOrderHistory(
    symbol?: string,
    limit: number = 100
  ): Promise<any[]> {
    try {
      const params: any = {};
      if (symbol) params.symbol = symbol;
      if (limit) params.limit = limit;

      const response = await this.client.get("/orders", { params });
      return response.data || [];
    } catch (error) {
      console.error("Error fetching Vest order history:", error);
      throw new Error("Failed to fetch order history from Vest");
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.log("✅ Vest WebSocket connected");

        // Subscribe to tickers for funding rate updates
        const subscribeMessage = {
          method: "subscribe",
          stream: "tickers",
          symbols: ["BTC-PERP", "ETH-PERP", "SOL-PERP"], // Add more as needed
        };

        this.ws?.send(JSON.stringify(subscribeMessage));
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Vest WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Vest WebSocket error:", error);
      });

      this.ws.on("close", () => {
        console.log("Vest WebSocket disconnected");
        // Auto-reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(onMessage), 5000);
      });
    } catch (error) {
      console.error("Error connecting to Vest WebSocket:", error);
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

export const vestExchange = new VestExchange();
