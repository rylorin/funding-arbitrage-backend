// API reference documentation available at https://api-docs.pro.apex.exchange
import { PositionSide } from "@/models";
import crypto from "crypto";
import WebSocket from "ws";
import { ExchangeConnector, FundingRateData, OrderData, PlacedOrderData, TokenSymbol } from "../types/index";

interface ApexSpotTicker {
  symbol: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  volume: string;
  high24h: string;
  low24h: string;
}

interface ApexSpotOrderResponse {
  orderId: string;
  clientOrderId?: string;
  symbol: string;
  side: "BUY" | "SELL";
  type: string;
  price: string;
  size: string;
  status: string;
}

export class ApexSpotExchange extends ExchangeConnector {
  constructor() {
    super("apexspot");
  }

  /**
   * Generate HMAC SHA256 signature for Apex API requests
   */
  private generateSignature(timestamp: string, method: string, requestPath: string, body = ""): string {
    const secretKey = this.config.get<string>("secretKey");
    const message = timestamp + method + requestPath + body;
    return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
  }

  /**
   * Add authentication headers to requests
   */
  private addAuthHeaders(method: string, requestPath: string, body = ""): Record<string, string> {
    const timestamp = Date.now().toString();
    const apiKey = this.config.get<string>("apiKey");
    const signature = this.generateSignature(timestamp, method, requestPath, body);
    const passphrase = this.config.get<string>("passphrase");

    return {
      "APEX-SIGNATURE": signature,
      "APEX-TIMESTAMP": timestamp,
      "APEX-PASSPHRASE": passphrase,
    };
  }

  public async testConnection(): Promise<number> {
    try {
      const response = await this.get("/api/v1/spot/symbols");
      const count = response.data?.data?.list?.length || 0;
      // console.log(`✅ Apex Spot Exchange connected: ${count} pairs available`);
      return count;
    } catch (error) {
      console.error("❌ Failed to connect to Apex Spot Exchange:", error);
      return 0;
    }
  }

  protected tokenFromTicker(symbol: string): TokenSymbol | null {
    // Apex spot uses format like BTC-USDT, ETH-USDT (same as perp, but different API)
    const match = symbol.match(/^(\w+)-USDT$/);
    return match ? match[1] : null;
  }

  protected tokenToTicker(token: TokenSymbol): string {
    return `${token}-USDT`;
  }

  // Note: Spot exchanges typically don't have funding rates since they're not derivatives
  public async getFundingRates(_tokens?: TokenSymbol[]): Promise<FundingRateData[]> {
    console.warn("⚠️ Funding rates not applicable for spot trading");
    return [];
  }

  public async getPrice(token: TokenSymbol): Promise<number> {
    try {
      const symbol = this.tokenToTicker(token);
      const response = await this.get(`/api/v1/spot/ticker?symbol=${symbol}`);

      const tickerData = response.data?.data;
      if (!tickerData) {
        throw new Error(`Price data not available for token: ${token}`);
      }

      const price = parseFloat(tickerData.lastPrice);

      if (!price || isNaN(price)) {
        throw new Error(`Invalid price data for token: ${token}`);
      }

      return price;
    } catch (error) {
      console.error(`❌ Failed to retrieve price for ${token}:`, error);
      throw new Error(`Failed to fetch price from Apex Spot for ${token}`);
    }
  }

  public async getAccountBalance(): Promise<Record<string, number>> {
    try {
      const requestPath = "/api/v1/spot/account";
      const headers = this.addAuthHeaders("GET", requestPath);

      const response = await this.get(requestPath, { headers });
      const balances: Record<string, number> = {};

      if (response.data?.data?.balances) {
        response.data.data.balances.forEach((balance: any) => {
          balances[balance.asset] = parseFloat(balance.free) + parseFloat(balance.locked);
        });
      }

      return balances;
    } catch (error) {
      console.error("Error fetching Apex Spot account balance:", error);
      throw new Error("Failed to fetch account balance from Apex Spot");
    }
  }

  public async placeOrder(orderData: OrderData, _reduceOnly = false): Promise<PlacedOrderData> {
    const { token, side, size, slippage } = orderData;

    try {
      const symbol = this.tokenToTicker(token);
      const isBuy = side === PositionSide.LONG; // For spot trading, LONG = BUY, SHORT = SELL

      // Get current price for slippage calculation
      const currentPrice = await this.getPrice(token);
      const limitPrice = isBuy ? currentPrice * (1 + slippage / 100) : currentPrice * (1 - slippage / 100);

      const requestPath = "/api/v1/spot/order";
      const orderPayload = {
        symbol,
        side: isBuy ? "BUY" : "SELL",
        type: "MARKET",
        size: size.toString(),
        price: limitPrice.toString(),
      };

      const body = JSON.stringify(orderPayload);
      const headers = this.addAuthHeaders("POST", requestPath, body);

      const response = await this.post(requestPath, orderPayload, { headers });
      const orderResponse = response.data?.data as ApexSpotOrderResponse;

      if (!orderResponse?.orderId) {
        throw new Error("Failed to place order: No order ID returned");
      }

      console.log(`✅ Apex Spot ${isBuy ? "BUY" : "SELL"} order placed: ${orderResponse.orderId}`);

      return {
        ...orderData,
        orderId: orderResponse.orderId,
        size: parseFloat(orderResponse.size),
        price: parseFloat(orderResponse.price) || limitPrice,
      };
    } catch (error) {
      console.error(`Error placing Apex Spot order for ${token}:`, error);
      throw error;
    }
  }

  public async cancelOrder(orderData: PlacedOrderData): Promise<boolean> {
    const { token, orderId } = orderData;

    try {
      const symbol = this.tokenToTicker(token);
      const requestPath = "/api/v1/spot/order";
      const body = JSON.stringify({ symbol, orderId });
      const headers = this.addAuthHeaders("DELETE", requestPath, body);

      const response = await this.delete(requestPath, {
        headers,
        data: { symbol, orderId },
      });

      return response.data?.success === true;
    } catch (error) {
      console.error(`Error cancelling order ${orderId}:`, error);
      throw new Error(`Failed to cancel order ${orderId} on Apex Spot`);
    }
  }

  // Note: For spot trading, positions are typically just holdings/baskets
  public async getAllPositions(): Promise<any[]> {
    try {
      const requestPath = "/api/v1/spot/positions";
      const headers = this.addAuthHeaders("GET", requestPath);

      const response = await this.get(requestPath, { headers });
      const positions = response.data?.data?.positions || [];

      return positions.map((pos: any) => ({
        id: pos.positionId || "id",
        symbol: pos.symbol,
        size: parseFloat(pos.size),
        price: parseFloat(pos.avgPrice),
        unrealizedPnl: parseFloat(pos.unrealizedPnl) || 0,
      }));
    } catch (error) {
      console.error("Error fetching Apex Spot positions:", error);
      throw new Error("Failed to fetch positions from Apex Spot");
    }
  }

  // Note: PnL calculation for spot is different from futures
  public async getPositionPnL(_positionId: string): Promise<number> {
    console.warn("⚠️ PnL tracking for spot positions may require custom implementation");
    return 0;
  }

  public connectWebSocket(onMessage: (data: any) => void): void {
    try {
      console.log("🔌 Attempting to connect to Apex Spot WebSocket:", this.wsUrl);
      this.ws = new WebSocket(this.wsUrl);
      this.isConnected = true;

      this.ws.on("open", () => {
        console.log("✅ Apex Spot WebSocket connected");

        // Authenticate WebSocket connection
        if (this.config.has("apiKey")) {
          const timestamp = Date.now().toString();
          const signature = this.generateSignature(timestamp, "GET", "/ws", "");

          const authMessage = {
            op: "auth",
            args: [
              {
                apiKey: this.config.get("apiKey"),
                passphrase: this.config.get("passphrase"),
                timestamp,
                signature,
              },
            ],
          };

          this.ws?.send(JSON.stringify(authMessage));
        }

        // Subscribe to spot-specific channels after authentication
        setTimeout(() => {
          const subscriptions = [
            { channel: "spot-ticker", instType: "SPOT" },
            { channel: "spot-kline", instType: "SPOT" },
            { channel: "spot-balance", instType: "SPOT" },
            { channel: "spot-orders", instType: "SPOT" },
            { channel: "spot-fills", instType: "SPOT" },
          ];

          subscriptions.forEach((sub) => {
            const subscribeMessage = {
              op: "subscribe",
              args: [sub],
            };
            this.ws?.send(JSON.stringify(subscribeMessage));
          });
        }, 1000);

        // Send ping every 30 seconds
        const pingInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ op: "ping" }));
          } else {
            clearInterval(pingInterval);
          }
        }, 30000);
      });

      this.ws.on("message", (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());

          // Handle pong response
          if (message.op === "pong") {
            return;
          }

          console.log("📨 Apex Spot WebSocket message received:", JSON.stringify(message, null, 2));
          onMessage(message);
        } catch (error) {
          console.error("Error parsing Apex Spot WebSocket message:", error);
        }
      });

      this.ws.on("error", (error) => {
        console.error("Apex Spot WebSocket error:", error);
      });

      this.ws.on("close", (code, reason) => {
        console.log("Apex Spot WebSocket disconnected:", { code, reason: reason.toString() });

        if (this.isConnected) {
          setTimeout(() => {
            console.log("🔄 Attempting to reconnect to Apex Spot WebSocket...");
            this.connectWebSocket(onMessage);
          }, 5000);
        }
      });
    } catch (error) {
      console.error("Error connecting to Apex Spot WebSocket:", error);
    }
  }
}

export const apexSpotExchange = new ApexSpotExchange();
export default apexSpotExchange;
