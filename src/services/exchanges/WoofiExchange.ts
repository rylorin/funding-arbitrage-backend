import axios, { AxiosInstance } from "axios";
import crypto from "crypto";
import WebSocket from "ws";
import { exchangeConfigs, exchangeEndpoints } from "../../config/exchanges";
import {
  ExchangeConnector,
  FundingRateData,
  TokenSymbol,
} from "../../types/index";

interface WoofiFundingRate {
  symbol: string;
  est_funding_rate: string;
  last_funding_rate: string;
  last_funding_rate_timestamp: number;
  next_funding_time: number;
}

export class WoofiExchange implements ExchangeConnector {
  public name = "orderly" as const; // Using 'orderly' as it's the underlying network
  public isConnected = false;

  private client: AxiosInstance;
  private config = exchangeConfigs.orderly;
  private baseUrl = exchangeEndpoints.orderly.baseUrl;
  private wsUrl = exchangeEndpoints.orderly.websocket;
  private ws: WebSocket | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add authentication headers if available
    if (this.config.apiKey) {
      this.client.defaults.headers["orderly-key"] = this.config.apiKey;
    }

    // Add request interceptor for signing private requests
    this.client.interceptors.request.use((config) => {
      if (this.config.secretKey && config.url?.includes("private")) {
        const timestamp = Date.now().toString();
        const method = config.method?.toUpperCase() || "GET";
        const requestPath = config.url || "";
        const body = config.data ? JSON.stringify(config.data) : "";

        const message = `${timestamp}${method}${requestPath}${body}`;
        const signature = crypto
          .createHmac("sha256", this.config.secretKey)
          .update(message)
          .digest("base64");

        config.headers = config.headers || {};
        (config.headers as any)["orderly-timestamp"] = timestamp;
        (config.headers as any)["orderly-signature"] = signature;
      }
      return config;
    });

    this.testConnection();
  }

  private async testConnection(): Promise<void> {
    try {
      // Test connection with public endpoint - get exchange info
      const response = await this.client.get("/v1/public/info");
      this.isConnected = true;
      console.log(
        `✅ Woofi (Orderly) Exchange connected: ${
          response.data.data?.rows?.length || 0
        } markets available`
      );
    } catch (error) {
      console.error("❌ Failed to connect to Woofi (Orderly) Exchange:", error);
      this.isConnected = false;
    }
  }

  private extractTokensFromTickers(
    marketsResponse: WoofiFundingRate[]
  ): TokenSymbol[] {
    return marketsResponse
      .map((row) => {
        // Extract token from symbol like PERP_BTC_USDC
        const parts = row.symbol.split("_");
        // console.log('Woofi symbol parts:', parts);
        return parts.length === 3 ? (parts[1] as TokenSymbol) : null;
      })
      .filter((t): t is TokenSymbol => t !== null);
  }

  public async getFundingRates(
    tokens?: TokenSymbol[]
  ): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      // Get all predicted funding rates
      const response = await this.client.get("/v1/public/funding_rates");
      const fundingData = response.data.data as { rows: WoofiFundingRate[] };

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess =
        tokens || this.extractTokensFromTickers(fundingData.rows);

      // For each requested token, find its funding rate

      for (const token of tokensToProcess) {
        try {
          // Woofi/Orderly uses format like PERP_BTC_USDC
          const symbol = `PERP_${token}_USDC`;

          // Find funding rate for this token
          const tokenFunding = fundingData.rows.find(
            (funding) => funding.symbol === symbol
          );

          if (tokenFunding) {
            // 1h estimated funding rate (rolling average over 8 hours)
            const fundingRate = parseFloat(tokenFunding.est_funding_rate);

            // Next funding time is provided by the API
            const nextFunding = new Date(tokenFunding.next_funding_time);

            const fundingFrequency =
              (tokenFunding.next_funding_time -
                tokenFunding.last_funding_rate_timestamp) /
              3600_000; // in hours

            fundingRates.push({
              exchange: "orderly",
              token,
              fundingRate,
              nextFunding,
              fundingFrequency,
              timestamp: new Date(),
            });
          }
        } catch (error) {
          console.warn(
            `Failed to get funding rate for ${token} on Woofi:`,
            error
          );
        }
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Woofi funding rates:", error);
      throw new Error("Failed to fetch funding rates from Woofi");
    }
  }

  public async getAccountBalance(): Promise<{ [token: string]: number }> {
    try {
      // This requires authentication with Orderly key
      const response = await this.client.get("/v1/client/holding");
      const balances: { [token: string]: number } = {};

      if (response.data && response.data.holding) {
        response.data.holding.forEach((balance: any) => {
          balances[balance.token] = parseFloat(balance.holding);
        });
      }

      return balances;
    } catch (error) {
      console.error("Error fetching Woofi account balance:", error);
      throw new Error("Failed to fetch account balance from Woofi");
    }
  }

  public async openPosition(
    token: TokenSymbol,
    side: "long" | "short",
    size: number
  ): Promise<string> {
    try {
      const symbol = `PERP_${token}_USDC`;
      const orderSide = side === "long" ? "BUY" : "SELL";

      const orderData = {
        symbol,
        order_type: "MARKET",
        order_amount: size.toString(),
        side: orderSide,
      };

      const response = await this.client.post("/v1/order", orderData);

      if (response.data.success && response.data.data?.order_id) {
        const orderId = response.data.data.order_id;
        console.log(`✅ Woofi ${side} position opened: ${orderId}`);
        return orderId.toString();
      }

      throw new Error(
        `Failed to open position: ${response.data.message || "Unknown error"}`
      );
    } catch (error) {
      console.error(
        `Error opening Woofi ${side} position for ${token}:`,
        error
      );
      throw new Error(`Failed to open ${side} position on Woofi`);
    }
  }

  public async closePosition(positionId: string): Promise<boolean> {
    try {
      const response = await this.client.delete(`/v1/order/${positionId}`);

      if (response.data.success || response.status === 200) {
        console.log(`✅ Woofi position closed: ${positionId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Error closing Woofi position ${positionId}:`, error);
      return false;
    }
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Get all positions and find the specific one
      const response = await this.client.get("/v1/positions");

      if (response.data.data?.rows) {
        const position = response.data.data.rows.find(
          (pos: any) => pos.position_id === positionId
        );
        if (position && position.unrealized_pnl) {
          return parseFloat(position.unrealized_pnl);
        }
      }

      return 0;
    } catch (error) {
      console.error(
        `Error fetching Woofi position PnL for ${positionId}:`,
        error
      );
      throw new Error("Failed to fetch position PnL from Woofi");
    }
  }

  public async getAllPositions(): Promise<any[]> {
    try {
      const response = await this.client.get("/v1/positions");
      return response.data.data?.rows || [];
    } catch (error) {
      console.error("Error fetching Woofi positions:", error);
      throw new Error("Failed to fetch positions from Woofi");
    }
  }

  public async getOrderHistory(
    symbol?: string,
    limit: number = 100
  ): Promise<any[]> {
    try {
      const params: any = {};
      if (symbol) params.symbol = symbol;
      if (limit) params.size = limit;

      const response = await this.client.get("/v1/orders", { params });
      return response.data.data?.rows || [];
    } catch (error) {
      console.error("Error fetching Woofi order history:", error);
      throw new Error("Failed to fetch order history from Woofi");
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.log("✅ Woofi WebSocket connected");

        // Subscribe to funding rate updates
        const subscribeMessage = {
          id: Date.now().toString(),
          topic: "estfundingrate",
          event: "subscribe",
        };

        this.ws?.send(JSON.stringify(subscribeMessage));
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Woofi WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Woofi WebSocket error:", error);
      });

      this.ws.on("close", () => {
        console.log("Woofi WebSocket disconnected");
        // Auto-reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(onMessage), 5000);
      });
    } catch (error) {
      console.error("Error connecting to Woofi WebSocket:", error);
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

export const woofiExchange = new WoofiExchange();
