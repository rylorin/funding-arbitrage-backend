import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import WebSocket from "ws";
import { ExchangeConnector, FundingRateData, TokenSymbol } from "../../types/index";
import { OrderData, OrderSide } from "./ExchangeConnector";

interface WoofiFundingRate {
  symbol: string;
  est_funding_rate: string;
  last_funding_rate: string;
  last_funding_rate_timestamp: number;
  next_funding_time: number;
}

type TokenInfo = { base_min: number; base_max: number; base_tick: number };
type TokenPrice = { mark_price: number; index_price: number };

export class WoofiExchange extends ExchangeConnector {
  private ws: WebSocket | null = null;

  constructor() {
    super("orderly");

    ed.hashes.sha512 = sha512;

    // Add request interceptor for signing private requests
    this.client.interceptors.request.use((config) => {
      if (
        this.config.has("orderly-key") &&
        this.config.has("secretKey") &&
        this.config.has("orderly-account-id") &&
        !config.url?.includes("/public/")
      ) {
        const timestamp = Date.now().toString();
        const method = config.method?.toUpperCase() || "GET";
        const requestPath = config.url || "";
        const body = config.data ? JSON.stringify(config.data) : "";

        const secretKey = bs58.decode(this.config.get("secretKey") as string);
        // Ensure key is 32 bytes (ed25519 private key length)
        if (secretKey.length !== 32) {
          throw new Error(
            `Invalid secret key length: ${secretKey.length} bytes. Ed25519 private key must be 32 bytes.`,
          );
        }

        // Generate signature using ed25519 algorithm
        const message = `${timestamp}${method}${requestPath}${body}`;
        const signatureBuffer = Buffer.from(ed.sign(new TextEncoder().encode(message), secretKey));

        // Encode signature in base64 url-safe format
        const signature = signatureBuffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

        config.headers = config.headers || {};
        (config.headers as any)["orderly-account-id"] = this.config.get("orderly-account-id");
        (config.headers as any)["orderly-key"] = this.config.get("orderly-key");
        (config.headers as any)["orderly-timestamp"] = timestamp;
        (config.headers as any)["orderly-signature"] = signature;
        (config.headers as any)["message"] = message;
      }
      return config;
    });

    if (this.isEnabled) this.testConnection();
  }

  private async testConnection(): Promise<void> {
    try {
      // Test connection with public endpoint - get exchange info
      const response = await this.client.get("/v1/public/info");
      this.isConnected = true;
      console.log(
        `✅ Orderly (Orderly) Exchange connected: ${response.data.data?.rows?.length || 0} markets available`,
      );
    } catch (error) {
      console.error("❌ Failed to connect to Orderly (Orderly) Exchange:", error);
      this.isConnected = false;
    }
  }

  private extractTokensFromTickers(marketsResponse: WoofiFundingRate[]): TokenSymbol[] {
    return marketsResponse
      .map((row) => {
        // Extract token from symbol like PERP_BTC_USDC
        const parts = row.symbol.split("_");
        // console.log('Orderly symbol parts:', parts);
        return parts.length === 3 ? (parts[1] as TokenSymbol) : null;
      })
      .filter((t): t is TokenSymbol => t !== null);
  }

  public async getTokenPrice(tokens?: TokenSymbol[]): Promise<Record<TokenSymbol, TokenPrice>> {
    try {
      const result: Record<TokenSymbol, TokenPrice> = {};

      // Get all tickers
      const response = await this.client.get("/v1/public/futures");
      const tickersData = response.data.data as { rows: any[] };

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess = tokens || this.extractTokensFromTickers(tickersData.rows);

      // For each requested token, find its price
      for (const token of tokensToProcess) {
        try {
          // Orderly/Orderly uses format like PERP_BTC_USDC
          const symbol = `PERP_${token}_USDC`;

          // Find ticker for this token
          const tokenTicker = tickersData.rows.find((ticker) => ticker.symbol === symbol);

          if (tokenTicker) {
            result[token] = {
              mark_price: parseFloat(tokenTicker.mark_price),
              index_price: parseFloat(tokenTicker.index_price),
            };
          }
        } catch (error) {
          console.warn(`Failed to get price for ${token} on Orderly:`, error);
        }
      }

      return result;
    } catch (error) {
      console.error("Error fetching Orderly prices:", error);
      throw new Error("Failed to fetch prices from Orderly");
    }
  }

  public async getTokenInfo(tokens?: [TokenSymbol]): Promise<Record<TokenSymbol, TokenInfo>> {
    try {
      const result: Record<TokenSymbol, TokenInfo> = {};

      const symbol = tokens && tokens.length > 1 ? `PERP_${tokens[0]}_USDC` : "";
      const response = await this.client.get(`/v1/public/info/${symbol}`);
      const tickersData = response.data.data as { rows: any[] };

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess = tokens || this.extractTokensFromTickers(tickersData.rows);

      // For each requested token, find its price
      for (const token of tokensToProcess) {
        try {
          // Orderly/Orderly uses format like PERP_BTC_USDC
          const symbol = `PERP_${token}_USDC`;

          // Find ticker for this token
          const tokenTicker = tickersData.rows.find((ticker) => ticker.symbol === symbol);

          if (tokenTicker) {
            result[token] = {
              base_min: parseFloat(tokenTicker.base_min),
              base_max: parseFloat(tokenTicker.base_max),
              base_tick: parseFloat(tokenTicker.base_tick),
            };
          }
        } catch (error) {
          console.warn(`Failed to get info for ${token} on Orderly:`, error);
        }
      }

      return result;
    } catch (error) {
      console.error("Error fetching Orderly infos:", error);
      throw new Error("Failed to fetch infos from Orderly");
    }
  }

  public async getFundingRates(tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    try {
      const fundingRates: FundingRateData[] = [];

      const prices = await this.getTokenPrice(tokens);

      // Get all predicted funding rates
      const response = await this.client.get("/v1/public/funding_rates");
      const fundingData = response.data.data as { rows: WoofiFundingRate[] };

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess = tokens || this.extractTokensFromTickers(fundingData.rows);

      // For each requested token, find its funding rate

      for (const token of tokensToProcess) {
        try {
          // Orderly/Orderly uses format like PERP_BTC_USDC
          const symbol = `PERP_${token}_USDC`;

          // Find funding rate for this token
          const tokenFunding = fundingData.rows.find((funding) => funding.symbol === symbol);

          if (tokenFunding) {
            // 1h estimated funding rate (rolling average over 8 hours)
            const fundingRate = parseFloat(tokenFunding.est_funding_rate);

            // Next funding time is provided by the API
            const nextFunding = new Date(tokenFunding.next_funding_time);

            const fundingFrequency =
              (tokenFunding.next_funding_time - tokenFunding.last_funding_rate_timestamp) / 3600_000; // in hours

            fundingRates.push({
              exchange: this.name,
              token,
              fundingRate,
              nextFunding,
              fundingFrequency,
              timestamp: new Date(),
              markPrice: prices[token].mark_price || 0,
              indexPrice: prices[token].index_price || 0,
            });
          }
        } catch (error) {
          console.warn(`Failed to get funding rate for ${token} on Orderly:`, error);
        }
      }

      return fundingRates;
    } catch (error) {
      console.error("Error fetching Orderly funding rates:", error);
      throw new Error("Failed to fetch funding rates from Orderly");
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
      console.error("Error fetching Orderly account balance:", error);
      throw new Error("Failed to fetch account balance from Orderly");
    }
  }

  public async openPosition(order: OrderData): Promise<string> {
    const { token, side, size } = order;
    try {
      const infos = await this.getTokenInfo([token]);
      if (size < infos[token].base_min || size > infos[token].base_max)
        throw new Error(
          `Order size ${size} out of bounds for ${token} on Orderly: min ${infos[token].base_min}, max ${infos[token].base_max}`,
        );
      // (side - infos[token].base_min) % infos[token].base_tick should equal to zero
      const min = infos[token].base_min;
      const tick = infos[token].base_tick;
      const diff = size - min;
      const rounded_diff = Math.round(diff / tick) * tick;
      const order_quantity = min + rounded_diff;

      const orderData = {
        symbol: `PERP_${token}_USDC`,
        order_type: "MARKET",
        side: side === OrderSide.LONG ? "BUY" : "SELL",
        order_quantity,
      };
      console.log("Orderly openPosition orderData:", orderData);
      const response = await this.client.post("/v1/order", orderData).catch((reason: any) => {
        console.error(JSON.stringify(reason));
        throw reason;
      });

      if (response.data.success && response.data.data?.order_id) {
        const orderId = response.data.data.order_id;
        console.log(`✅ Orderly ${side} position opened: ${orderId}`);
        return orderId.toString();
      }

      throw new Error(`Failed to open position: ${response.data.message || "Unknown error"}`);
    } catch (error) {
      console.error(`Error opening Orderly ${side} position for ${token}:`, error);
      throw new Error(`Failed to open ${side} position on Orderly`);
    }
  }

  public async closePosition(positionId: string): Promise<boolean> {
    try {
      const response = await this.client.delete(`/v1/order/${positionId}`);

      if (response.data.success || response.status === 200) {
        console.log(`✅ Orderly position closed: ${positionId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error(`Error closing Orderly position ${positionId}:`, error);
      return false;
    }
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Get all positions and find the specific one
      const response = await this.client.get("/v1/positions");

      if (response.data.data?.rows) {
        const position = response.data.data.rows.find((pos: any) => pos.position_id === positionId);
        if (position && position.unrealized_pnl) {
          return parseFloat(position.unrealized_pnl);
        }
      }

      return 0;
    } catch (error) {
      console.error(`Error fetching Orderly position PnL for ${positionId}:`, error);
      throw new Error("Failed to fetch position PnL from Orderly");
    }
  }

  public async getAllPositions(): Promise<any[]> {
    try {
      const response = await this.client.get("/v1/positions");
      return response.data.data?.rows || [];
    } catch (error) {
      console.error("Error fetching Orderly positions:", error);
      throw new Error("Failed to fetch positions from Orderly");
    }
  }

  public async getOrderHistory(symbol?: string, limit: number = 100): Promise<any[]> {
    try {
      const params: any = {};
      if (symbol) params.symbol = symbol;
      if (limit) params.size = limit;

      const response = await this.client.get("/v1/orders", { params });
      return response.data.data?.rows || [];
    } catch (error) {
      console.error("Error fetching Orderly order history:", error);
      throw new Error("Failed to fetch order history from Orderly");
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        console.log("✅ Orderly WebSocket connected");

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
          console.error("Error parsing Orderly WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Orderly WebSocket error:", error);
      });

      this.ws.on("close", () => {
        console.log("Orderly WebSocket disconnected");
        // Auto-reconnect after 5 seconds
        setTimeout(() => this.connectWebSocket(onMessage), 5000);
      });
    } catch (error) {
      console.error("Error connecting to Orderly WebSocket:", error);
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
export default woofiExchange;
