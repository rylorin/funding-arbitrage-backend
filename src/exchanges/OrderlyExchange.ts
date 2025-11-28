// API reference documation available at https://orderly.network/docs/build-on-omnichain/evm-api/
import { Position, PositionSide, PositionStatus } from "@/models";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import WebSocket from "ws";
import { ExchangeConnector, FundingRateData, OrderData, PlacedOrderData, TokenSymbol } from "../types/index";

interface WoofiFundingRate {
  symbol: string;
  est_funding_rate: string;
  last_funding_rate: string;
  last_funding_rate_timestamp: number;
  next_funding_time: number;
}

type TokenInfo = { base_min: number; base_max: number; base_tick: number };
type TokenPrice = { mark_price: number; index_price: number };

export class OrderlyExchange extends ExchangeConnector {
  // private ws: WebSocket | null = null;

  constructor() {
    super("orderly");

    ed.hashes.sha512 = sha512;

    // Add request interceptor for signing private requests
    this.axiosClient.interceptors.request.use((config) => {
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

        // console.log("🔍 [DEBUG] Interceptor - method:", method);
        // console.log("🔍 [DEBUG] Interceptor - requestPath:", requestPath);
        // console.log("🔍 [DEBUG] Interceptor - config.data:", config.data);
        // console.log("🔍 [DEBUG] Interceptor - body (for signature):", body);
        // console.log("🔍 [DEBUG] Interceptor - body length:", body.length);

        const secretKey = bs58.decode(this.config.get("secretKey") as string);
        // Ensure key is 32 bytes (ed25519 private key length)
        if (secretKey.length !== 32) {
          throw new Error(
            `Invalid secret key length: ${secretKey.length} bytes. Ed25519 private key must be 32 bytes.`,
          );
        }

        // Generate signature using ed25519 algorithm
        const message = `${timestamp}${method}${requestPath}${body}`;
        // console.log("🔍 [DEBUG] Interceptor - signature message:", message);

        const signatureBuffer = Buffer.from(ed.sign(new TextEncoder().encode(message), secretKey));

        // Encode signature in base64 url-safe format
        const signature = signatureBuffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

        config.headers = config.headers || {};
        (config.headers as any)["orderly-account-id"] = this.config.get("orderly-account-id");
        (config.headers as any)["orderly-key"] = this.config.get("orderly-key");
        (config.headers as any)["orderly-timestamp"] = timestamp;
        (config.headers as any)["orderly-signature"] = signature;
        (config.headers as any)["message"] = message;

        // console.log("🔍 [DEBUG] Interceptor - Final headers:", JSON.stringify(config.headers, null, 2));
        // console.log("🔍 [DEBUG] Interceptor - Content-Type in headers:", config.headers["Content-Type"]);
      }
      return config;
    });
  }

  public async testConnection(): Promise<number> {
    try {
      // Test connection with public endpoint - get exchange info
      const response = await this.get("/v1/public/info");
      const count = response.data.data?.rows?.length || 0;

      console.log(`✅ Orderly Exchange connected: ${count} markets available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Orderly Exchange:", error);
      return 0;
    }
  }

  protected tokenFromTicker(symbol: string): string | null {
    // Extract token from symbol like PERP_BTC_USDC
    const parts = symbol.split("_");
    // console.log('Orderly symbol parts:', parts);
    return parts.length === 3 ? (parts[1] as TokenSymbol) : null;
  }

  private extractTokensFromTickers(marketsResponse: WoofiFundingRate[]): TokenSymbol[] {
    return marketsResponse.map((row) => this.tokenFromTicker(row.symbol)).filter((t): t is TokenSymbol => t !== null);
  }

  protected tokenToTicker(token: TokenSymbol): string {
    return `PERP_${token}_USDC`;
  }

  public async getPrices(tokens?: TokenSymbol[]): Promise<Record<TokenSymbol, TokenPrice>> {
    try {
      const result: Record<TokenSymbol, TokenPrice> = {};

      // Get all tickers
      const response = await this.get("/v1/public/futures");
      const tickersData = response.data.data as { rows: any[] };

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess =
        tokens ||
        tickersData.rows.map((row) => this.tokenFromTicker(row.symbol)).filter((t): t is TokenSymbol => t !== null);

      // For each requested token, find its price
      for (const token of tokensToProcess) {
        try {
          // Orderly/Orderly uses format like PERP_BTC_USDC
          const symbol = this.tokenToTicker(token);

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

      const symbol = tokens && tokens.length > 1 ? this.tokenToTicker(tokens[0]) : "";
      const response = await this.get(`/v1/public/info/${symbol}`);
      const tickersData = response.data.data as { rows: any[] };

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess = tokens || this.extractTokensFromTickers(tickersData.rows);

      // For each requested token, find its price
      for (const token of tokensToProcess) {
        try {
          // Orderly/Orderly uses format like PERP_BTC_USDC
          const symbol = this.tokenToTicker(token);

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

      const prices = await this.getPrices(tokens);

      // Get all predicted funding rates
      const response = await this.get("/v1/public/funding_rates");
      const fundingData = response.data.data as { rows: WoofiFundingRate[] };

      // If no tokens specified, extract all available tokens from tickers
      const tokensToProcess = tokens || this.extractTokensFromTickers(fundingData.rows);

      // For each requested token, find its funding rate

      for (const token of tokensToProcess) {
        try {
          // Orderly/Orderly uses format like PERP_BTC_USDC
          const symbol = this.tokenToTicker(token);

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
              updatedAt: new Date(),
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
      const response = await this.get("/v1/client/holding");
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

  public async setLeverage(token: TokenSymbol, leverage: number): Promise<boolean> {
    const payload = { symbol: this.tokenToTicker(token), leverage };
    const response = await this.post("/v1/client/leverage", payload).catch((reason: any) => {
      throw new Error(reason.data.message || reason.message || "Unknown error #1");
    });
    return response.data.success;
  }

  public async openPosition(order: OrderData, reduceOnly: boolean = false): Promise<PlacedOrderData> {
    const { token, side, size } = order;
    try {
      if (order.leverage) await this.setLeverage(order.token, order.leverage);

      const infos = await this.getTokenInfo([token]);

      // (size - infos[token].base_min) % infos[token].base_tick should equal to zero
      const min = infos[token].base_min;
      const tick = infos[token].base_tick;

      // To avoid floating-point precision errors, we work with integers
      // Determine the number of decimal places in tick
      const tickStr = tick.toString();
      const decimalPlaces = tickStr.includes(".") ? tickStr.split(".")[1].length : 0;
      const multiplier = Math.pow(10, decimalPlaces);

      // Convert to integers for precise calculation
      const sizeInt = Math.round(size * multiplier);
      const minInt = Math.round(min * multiplier);
      const tickInt = Math.round(tick * multiplier);

      // Calculate the difference and round down to nearest tick
      const diffInt = sizeInt - minInt;
      const roundedDiffInt = Math.floor(diffInt / tickInt) * tickInt;
      const orderQuantityInt = minInt + roundedDiffInt;

      // Convert back to decimal
      const order_quantity = orderQuantityInt / multiplier;

      if (order_quantity < infos[token].base_min || order_quantity > infos[token].base_max)
        throw new Error(
          `Order size ${order_quantity} out of bounds for ${token} on Orderly: min ${infos[token].base_min}, max ${infos[token].base_max}`,
        );

      // const order_amount = order_quantity * price;
      // if (order_amount < 10) throw new Error(`The order value ${order_amount} should be greater or equal to 10`);

      const payload = {
        symbol: this.tokenToTicker(token),
        order_type: "MARKET",
        side: side === PositionSide.LONG ? "BUY" : "SELL",
        order_quantity,
        slippage: order.slippage / 100,
        reduce_only: reduceOnly,
      };
      const response = await this.post("/v1/order", payload).catch((reason: any) => {
        // console.error(payload, reason.data);
        throw new Error(reason.data.message || "Unknown error #2");
      });

      if (response.data.success && response.data.data?.order_id) {
        const orderId = response.data.data.order_id;
        return {
          exchange: order.exchange,
          token: order.token,
          side: order.side,
          leverage: order.leverage,
          slippage: order.slippage,

          orderId: orderId.toString(),
          size: response.data.data.order_quantity,
          price: response.data.data.order_price,
        };
      }

      console.error(response);
      throw new Error(`Failed to open position: ${response.data.message || "Unknown error #3"}`);
    } catch (error) {
      // console.error(`Error opening Orderly ${side} position for ${token}:`, error);
      throw error;
    }
  }

  // https://orderly.network/docs/build-on-omnichain/evm-api/restful-api/private/cancel-order
  public async cancelOrder(order: PlacedOrderData): Promise<boolean> {
    const { token, orderId } = order;
    try {
      const symbol = this.tokenToTicker(token);

      // console.log("🔍 [DEBUG] cancelOrder - Starting request");
      // console.log("🔍 [DEBUG] cancelOrder - orderId:", orderId);
      // console.log("🔍 [DEBUG] cancelOrder - symbol:", symbol);

      const response = await this.delete(`/v1/order?order_id=${orderId}&symbol=${symbol}`, {
        // Explicitly set data to undefined to prevent any body
        data: undefined,
        headers: {
          // Orderly API requires Content-Type even for DELETE requests
          "Content-Type": "application/x-www-form-urlencoded",
        },
        // transformRequest: [
        //   (data, headers) => {
        //     console.log("🔍 [DEBUG] transformRequest #1 - headers:", JSON.stringify(headers, null, 2));
        //     console.log("🔍 [DEBUG] transformRequest #1 - data:", data);
        //     console.log("🔍 [DEBUG] transformRequest #1 - data type:", typeof data);
        //     return data;
        //   },
        //   (data, headers) => {
        //     console.log("🔍 [DEBUG] transformRequest #2 - Final headers:", JSON.stringify(headers, null, 2));
        //     console.log("🔍 [DEBUG] transformRequest #2 - Final data:", data);
        //     return data;
        //   },
        // ],
      });
      console.debug("✅ [DEBUG] cancelOrder - Success:", response.data);
      return response.data.success;
    } catch (error: any) {
      console.warn(`❌ cancelOrder failed: ${error.data.message}`);
      return false;
    }
  }

  public async getPositionPnL(positionId: string): Promise<number> {
    try {
      // Get all positions and find the specific one
      const response = await this.get("/v1/positions");

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

  public async getOrderHistory(symbol?: string, limit: number = 100): Promise<any[]> {
    try {
      const params: any = {};
      if (symbol) params.symbol = symbol;
      if (limit) params.size = limit;

      const response = await this.get("/v1/orders", { params });
      return response.data.data?.rows || [];
    } catch (error) {
      console.error("Error fetching Orderly order history:", error);
      throw new Error("Failed to fetch order history from Orderly");
    }
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      // Build WebSocket URL with account ID
      let wsUrl = this.wsUrl;
      if (this.config.has("orderly-account-id")) {
        const accountId = this.config.get("orderly-account-id") as string;
        wsUrl = wsUrl.replace("{account_id}", accountId);
      }

      // Create WebSocket connection first
      console.log("🔌 Attempting to connect to Orderly WebSocket:", wsUrl);
      this.ws = new WebSocket(wsUrl);
      this.isConnected = true;

      this.ws.on("open", () => {
        console.log("✅ Orderly WebSocket connected");

        // Authenticate after connection is established
        this.authenticateWebSocket();

        // Subscribe to all private topics after a short delay to ensure auth is processed
        setTimeout(() => {
          const topics = [
            "notifications",
            "account",
            "balance",
            "executionreport",
            "liquidationsaccount",
            "liquidatorliquidations",
            "settle",
            "position",
            "wallet",
          ];

          topics.forEach((topic) => {
            const subscribeMessage = {
              id: `${topic}_${Date.now()}`,
              topic,
              event: "subscribe",
            };
            console.log(`📡 Subscribing to topic: ${topic}`);
            this.ws?.send(JSON.stringify(subscribeMessage));
          });
        }, 1000);
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log("📨 Orderly WebSocket message received:", JSON.stringify(message, null, 2));
          switch (message.event) {
            case "ping":
              this.ws?.send(JSON.stringify({ event: "pong", ts: message.ts }));
              break;
            case "notifications":
              console.log(message.data);
              break;
            case "subscribe":
              // NOP
              break;
            default:
              onMessage(message);
          }
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
        if (this.isConnected) setTimeout(() => this.connectWebSocket(onMessage), 5000);
      });
    } catch (error) {
      console.error("Error connecting to Orderly WebSocket:", error);
    }
  }

  private authenticateWebSocket(): void {
    if (!this.config.has("orderly-key") || !this.config.has("secretKey") || !this.config.has("orderly-account-id")) {
      console.warn("⚠️ Missing authentication credentials for Orderly WebSocket");
      return;
    }

    try {
      const timestamp = Date.now().toString();
      const secretKey = bs58.decode(this.config.get("secretKey") as string);

      if (secretKey.length !== 32) {
        throw new Error(`Invalid secret key length: ${secretKey.length} bytes. Ed25519 private key must be 32 bytes.`);
      }

      // Generate signature for WebSocket authentication
      const message = `${timestamp}`;
      const signatureBuffer = Buffer.from(ed.sign(new TextEncoder().encode(message), secretKey));
      const signature = signatureBuffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

      const authMessage = {
        id: `auth_${timestamp}`,
        event: "auth",
        params: {
          orderly_key: this.config.get("orderly-key"),
          sign: signature,
          timestamp,
        },
      };

      console.log("🔐 Authenticating Orderly WebSocket connection");
      this.ws?.send(JSON.stringify(authMessage));
    } catch (error) {
      console.error("Error authenticating Orderly WebSocket:", error);
    }
  }

  public async getAllPositions(): Promise<Position[]> {
    const response = await this.get("/v1/positions").catch((reason: any) => {
      throw new Error(reason.data.message || "Unknown error #3");
    });

    if (response.data.success && response.data.data?.rows) {
      return response.data.data.rows.map((pos: any) => ({
        id: "id",
        userId: "userId",
        tradeId: "tradeId",
        token: this.tokenFromTicker(pos.symbol),
        status: pos.position_qty ? PositionStatus.OPEN : PositionStatus.CLOSED,
        entryTimestamp: new Date(pos.updated_time),

        exchange: this.name,
        side: pos.position_qty > 0 ? PositionSide.LONG : PositionSide.SHORT,
        size: Math.abs(pos.position_qty),
        price: pos.mark_price,
        leverage: parseInt(pos.leverage),
        orderId: "orderId",

        cost: Math.abs(pos.cost_position),
        unrealizedPnL: pos.unsettled_pnl,
        realizedPnL: 0,

        IMR_withdraw_orders: pos.IMR_withdraw_orders,
        MMR_with_orders: pos.MMR_with_orders,
        average_open_price: pos.average_open_price,
        est_liq_price: pos.est_liq_price,
        fee_24_h: pos.fee_24_h,
        imr: pos.imr,
        last_sum_unitary_funding: pos.last_sum_unitary_funding,
        mmr: pos.mmr,
        pending_long_qty: pos.pending_long_qty,
        pending_short_qty: pos.pending_short_qty,
        pnl_24_h: pos.pnl_24_h,
        settle_price: pos.settle_price,
        seq: pos.seq,
        timestamp: new Date(pos.timestamp),
        updated_time: new Date(pos.updated_time),
      }));
    }

    console.error(response);
    throw new Error(`Failed to open position: ${response.data.message || "Unknown error #3"}`);
  }

  public async getPrice(token: TokenSymbol): Promise<number> {
    try {
      // Use the existing getTokenPrice method to get price data for this specific token
      const tokenPrices = await this.getPrices([token]);

      const priceData = tokenPrices[token];
      if (!priceData) {
        throw new Error(`Price data not available for token: ${token}`);
      }

      // Return mark_price as primary, fallback to index_price
      const price = priceData.mark_price || priceData.index_price;
      if (!price || isNaN(price)) {
        throw new Error(`Invalid price data for token: ${token}`);
      }

      return price;
    } catch (error) {
      console.error(`❌ Failed to retrieve price for ${token}:`, error);
      throw new Error(`Failed to fetch price from Orderly for ${token}`);
    }
  }
}

export const orderlyExchange = new OrderlyExchange();
export default orderlyExchange;
